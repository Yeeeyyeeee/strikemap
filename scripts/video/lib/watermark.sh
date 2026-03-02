#!/usr/bin/env bash
# watermark.sh — Logo watermark overlay builder

source "$(dirname "${BASH_SOURCE[0]}")/brand.sh"

# ── Apply logo watermark to a video ──────────────────────────
# Usage: apply_watermark <input_video> <output_video> [size] [opacity] [position]
# position: top_right (default), top_left, bottom_right, bottom_left
apply_watermark() {
  local input="$1"
  local output="$2"
  local size="${3:-80}"
  local opacity="${4:-0.6}"
  local position="${5:-top_right}"

  if [ ! -f "$LOGO" ]; then
    echo "Warning: Logo not found at $LOGO, skipping watermark" >&2
    cp "$input" "$output"
    return 0
  fi

  local overlay_x overlay_y
  case "$position" in
    top_right)    overlay_x="W-w-40"; overlay_y="60" ;;
    top_left)     overlay_x="40";     overlay_y="60" ;;
    bottom_right) overlay_x="W-w-40"; overlay_y="H-h-60" ;;
    bottom_left)  overlay_x="40";     overlay_y="H-h-60" ;;
  esac

  # Auto-detect audio in input and passthrough if present
  local audio_opts="-an"
  if ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$input" 2>/dev/null | grep -q audio; then
    audio_opts="-c:a copy"
  fi

  ffmpeg -y -i "$input" -i "$LOGO" \
    -filter_complex "[1:v]scale=${size}:${size},format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${overlay_x}:${overlay_y}" \
    -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart $audio_opts \
    "$output" 2>/dev/null
}

# ── Return watermark filter string (for complex filter chains) ──
# Usage: watermark_filter [size] [opacity] [position]
watermark_filter() {
  local size="${1:-80}"
  local opacity="${2:-0.6}"
  local position="${3:-top_right}"

  local overlay_x overlay_y
  case "$position" in
    top_right)    overlay_x="W-w-40"; overlay_y="60" ;;
    top_left)     overlay_x="40";     overlay_y="60" ;;
    bottom_right) overlay_x="W-w-40"; overlay_y="H-h-60" ;;
    bottom_left)  overlay_x="40";     overlay_y="H-h-60" ;;
  esac

  echo "scale=${size}:${size},format=rgba,colorchannelmixer=aa=${opacity}[wm];[base][wm]overlay=${overlay_x}:${overlay_y}"
}
