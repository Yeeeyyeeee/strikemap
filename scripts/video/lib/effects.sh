#!/usr/bin/env bash
# effects.sh — Reusable FFmpeg filter helpers

source "$(dirname "${BASH_SOURCE[0]}")/brand.sh"
source "$(dirname "${BASH_SOURCE[0]}")/animations.sh"

# ── Ken Burns effect on a still image ────────────────────────
# Usage: ken_burns <input_image> <output_mp4> [duration] [direction]
# direction: zoom_in (default), zoom_out, pan_right, pan_left
ken_burns() {
  local input="$1"
  local output="$2"
  local duration="${3:-5}"
  local direction="${4:-zoom_in}"
  local total_frames=$((duration * FPS))

  local zp_filter=""
  case "$direction" in
    zoom_in)
      zp_filter="zoompan=z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${total_frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}"
      ;;
    zoom_out)
      zp_filter="zoompan=z='if(eq(on,0),1.3,max(zoom-0.0015,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${total_frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}"
      ;;
    pan_right)
      zp_filter="zoompan=z='1.2':x='min(on*2,iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=${total_frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}"
      ;;
    pan_left)
      zp_filter="zoompan=z='1.2':x='max(iw-iw/zoom-on*2,0)':y='ih/2-(ih/zoom/2)':d=${total_frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}"
      ;;
  esac

  ffmpeg -y -loop 1 -i "$input" \
    -vf "$zp_filter,format=yuv420p" \
    -t "$duration" $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}

# ── Fade in/out ──────────────────────────────────────────────
# Returns filter string for fade in at start, fade out at end
# Usage: fade_filter <duration> [fade_duration]
fade_filter() {
  local duration="$1"
  local fade_dur="${2:-0.5}"
  local fade_out_start
  fade_out_start=$(echo "$duration - $fade_dur" | bc)
  echo "fade=t=in:st=0:d=${fade_dur},fade=t=out:st=${fade_out_start}:d=${fade_dur}"
}

# ── Color grading (tactical red tint) ───────────────────────
# Returns filter string
color_grade() {
  # format=yuv420p is needed after colorbalance because it outputs gbrpf32le
  # which breaks ih/iw expressions in subsequent drawtext/drawbox filters
  echo "eq=contrast=1.1:brightness=-0.02,colorbalance=rs=0.05:gs=-0.02:bs=-0.02,format=yuv420p"
}

# ── Vignette — darkened edges for cinematic look ────────────
vignette_filter() {
  echo "vignette=angle=PI/5"
}

# ── Film grain — temporal noise for texture ─────────────────
film_grain_filter() {
  echo "noise=alls=8:allf=t"
}

# ── Cinematic grade — color_grade + vignette + grain ────────
# Full cinematic treatment for strike footage
cinematic_grade_filter() {
  echo "$(color_grade),$(vignette_filter),$(film_grain_filter)"
}

# ── Scanline overlay effect ─────────────────────────────────
# Returns filter string for subtle horizontal scanlines
scanline_filter() {
  local opacity="${1:-0.08}"
  echo "drawbox=x=0:y=0:w=iw:h=1:color=black@${opacity}:t=fill[tmp];[tmp]tile=1x${HEIGHT}"
}

# ── Scale video to vertical (1080x1920) with letterboxing ───
# Also normalizes SAR to 1:1 and fps to 30 for consistent xfade transitions
# Returns filter string
scale_vertical() {
  echo "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${COLOR_BG},setsar=1,fps=${FPS}"
}

# ── Dissolve transition between two clips ────────────────────
# Usage: dissolve_transition <clip1> <clip2> <output> [transition_dur]
dissolve_transition() {
  local clip1="$1"
  local clip2="$2"
  local output="$3"
  local trans_dur="${4:-0.5}"

  # Get duration of clip1
  local dur1
  dur1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$clip1" 2>/dev/null)

  local offset
  offset=$(echo "$dur1 - $trans_dur" | bc)

  # Normalize both inputs to same fps/SAR/pix_fmt before xfade
  ffmpeg -y -i "$clip1" -i "$clip2" \
    -filter_complex "[0:v]fps=${FPS},setsar=1,format=yuv420p[v0];[1:v]fps=${FPS},setsar=1,format=yuv420p[v1];[v0][v1]xfade=transition=dissolve:duration=${trans_dur}:offset=${offset}" \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}

# ── Concatenate clips with dissolve transitions ──────────────
# Usage: concat_with_dissolves <output> <clip1> <clip2> [clip3...]
concat_with_dissolves() {
  local output="$1"
  shift
  local clips=("$@")
  local count=${#clips[@]}

  if [ "$count" -eq 0 ]; then
    echo "Error: no clips provided" >&2
    return 1
  fi

  if [ "$count" -eq 1 ]; then
    cp "${clips[0]}" "$output"
    return 0
  fi

  local current="${clips[0]}"
  local tmpdir
  tmpdir=$(mktemp -d)

  for ((i = 1; i < count; i++)); do
    local next="${clips[$i]}"
    local tmp_out="$tmpdir/concat_$i.mp4"
    if [ $i -eq $((count - 1)) ]; then
      tmp_out="$output"
    fi
    dissolve_transition "$current" "$next" "$tmp_out" 0.5
    current="$tmp_out"
  done

  # Cleanup temp files
  rm -rf "$tmpdir"
}

# ── Simple concatenation (no transitions) ────────────────────
# Usage: concat_clips <output> <clip1> <clip2> [clip3...]
concat_clips() {
  local output="$1"
  shift
  local clips=("$@")

  local list_file
  list_file=$(mktemp)
  for clip in "${clips[@]}"; do
    echo "file '$clip'" >> "$list_file"
  done

  ffmpeg -y -f concat -safe 0 -i "$list_file" \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null

  rm -f "$list_file"
}

# ── Generate red flash frame ────────────────────────────────
# White overexposure blast → red flash → fade out
# Usage: red_flash <output> [duration]
red_flash() {
  local output="$1"
  local duration="${2:-0.3}"
  local tmpdir
  tmpdir=$(mktemp -d)

  # 0.05s white blast
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_WHITE}:s=${WIDTH}x${HEIGHT}:d=0.05:r=${FPS}" \
    $ENCODE_OPTS_SILENT "$tmpdir/white.mp4" 2>/dev/null

  # Red flash with fade out
  local red_dur
  red_dur=$(echo "$duration - 0.05" | bc)
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_ACCENT}:s=${WIDTH}x${HEIGHT}:d=${red_dur}:r=${FPS}" \
    -vf "fade=t=out:st=0.05:d=$(echo "$red_dur - 0.05" | bc)" \
    $ENCODE_OPTS_SILENT "$tmpdir/red.mp4" 2>/dev/null

  concat_clips "$output" "$tmpdir/white.mp4" "$tmpdir/red.mp4"
  rm -rf "$tmpdir"
}
