#!/usr/bin/env bash
# compose-daily.sh — Daily strike summary video (~20s)
# Scenes: Shake+pop hook > Strike montage (animated captions) > Map > Stats (count-up) > CTA
# Audio: impact hits, whooshes, tension drone throughout
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"
source "$SCRIPT_DIR/lib/effects.sh"
source "$SCRIPT_DIR/lib/captions.sh"
source "$SCRIPT_DIR/lib/watermark.sh"
source "$SCRIPT_DIR/lib/audio.sh"

OUTPUT_SUBDIR=$(ensure_output_dir "daily")
TIMESTAMP=$(video_timestamp)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== Composing Daily Video (Viral Edition) ==="

# ── Scene 1: Shake + pop hook (1.5s) ──────────────────────
echo "  [1/5] Generating hook..."
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${HOOK_DURATION}:r=${FPS}" \
  -vf "\
    drawbox=x=290:y=680:w=500:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
    $(pop_text_filter "STRIKEMAP" 720 0.0 64 "$COLOR_TEXT" "$FONT_BOLD"),\
    $(slide_up_filter "Daily Strike Summary" "(w-text_w)/2" 810 0.3 0.3 30 "$COLOR_TEXT_SECONDARY" "$FONT_SEMIBOLD"),\
    $(screen_shake_filter 0.0 0.3 10),\
    fade=t=in:st=0:d=0.15\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/01_intro.mp4" 2>/dev/null

# ── Scene 2: Strike footage montage (2.5s per clip) ───────
echo "  [2/5] Building strike montage..."

# Find available media files
MEDIA_FILES=()
if [ -d "$MEDIA_DIR" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] && MEDIA_FILES+=("$file")
  done < <(find "$MEDIA_DIR" -name "*.mp4" -not -name "*_raw.*" 2>/dev/null | head -4)
fi

if [ ${#MEDIA_FILES[@]} -gt 0 ]; then
  MONTAGE_CLIPS=()
  clip_index=0

  for media_file in "${MEDIA_FILES[@]}"; do
    clip_index=$((clip_index + 1))
    clip_out="$TMPDIR/strike_${clip_index}.mp4"

    # Read companion metadata if available
    meta_file="${media_file%.mp4}.json"
    location="LOCATION"
    weapon=""
    strike_time=""

    if [ -f "$meta_file" ]; then
      location=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d.get('location','LOCATION'))" 2>/dev/null || echo "LOCATION")
      weapon=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d.get('weapon',''))" 2>/dev/null || echo "")
      strike_time=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d.get('timestamp','')[:16] if d.get('timestamp') else '')" 2>/dev/null || echo "")
    fi

    # Cinematic grade + animated lower-third + entry shake
    animated_lt=$(animated_lower_third_filter "$location" "$weapon" "$strike_time" 0.3)
    cine_grade=$(cinematic_grade_filter)

    ffmpeg -y -i "$media_file" \
      -vf "$(scale_vertical),${cine_grade},${animated_lt},\
           $(screen_shake_filter 0.0 0.25 8)" \
      -t 2.5 $ENCODE_OPTS_SILENT "$clip_out" 2>/dev/null

    MONTAGE_CLIPS+=("$clip_out")
  done

  # Concatenate montage clips
  if [ ${#MONTAGE_CLIPS[@]} -gt 1 ]; then
    concat_clips "$TMPDIR/02_montage.mp4" "${MONTAGE_CLIPS[@]}"
  elif [ ${#MONTAGE_CLIPS[@]} -eq 1 ]; then
    cp "${MONTAGE_CLIPS[0]}" "$TMPDIR/02_montage.mp4"
  fi
else
  echo "    No media files found, generating placeholder..."
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "STRIKE FOOTAGE" 870 0.2 48 "$COLOR_ACCENT" "$FONT_BOLD"),\
         $(slide_up_filter "No media available" "(w-text_w)/2" 950 0.5 0.3 28 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_montage.mp4" 2>/dev/null
fi

# ── Scene 3: Map overview (4s) ────────────────────────────
echo "  [3/5] Map overview..."
MAP_SCREENSHOT="$FRAMES_DIR/map_overview.png"
if [ -f "$MAP_SCREENSHOT" ]; then
  ken_burns "$MAP_SCREENSHOT" "$TMPDIR/03_map_raw.mp4" 4 zoom_in
  ffmpeg -y -i "$TMPDIR/03_map_raw.mp4" \
    -vf "$(vignette_filter),\
         $(pop_text_filter "LIVE MAP" 200 0.3 48 "$COLOR_ACCENT" "$FONT_BOLD")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
else
  echo "    No map screenshot, generating placeholder..."
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG_SECONDARY}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "LIVE MAP" 900 0.2 56 "$COLOR_ACCENT" "$FONT_BOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
fi

# ── Scene 4: Stats with count-up (4s) ─────────────────────
echo "  [4/5] Stats overlay..."
STATS_FILE="$FRAMES_DIR/stats.json"
total="--"
recent24="--"
recent7d="--"
with_video="--"

if [ -f "$STATS_FILE" ]; then
  total=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['total_incidents'])" 2>/dev/null || echo "--")
  recent24=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['recent_24h'])" 2>/dev/null || echo "--")
  recent7d=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['recent_7d'])" 2>/dev/null || echo "--")
  with_video=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['with_video'])" 2>/dev/null || echo "--")
fi

# Build stats card with count-up for numeric values, static for "--"
stats_filters="drawbox=x=60:y=400:w=960:h=560:color=${COLOR_PANEL}@0.9:t=fill"
stats_filters="${stats_filters},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
stats_filters="${stats_filters},$(pop_text_filter "TODAY'S SUMMARY" 440 0.1 42 "$COLOR_TEXT" "$FONT_BOLD")"

# Row 1: Total Strikes
stats_filters="${stats_filters},$(slide_in_left_filter "Total Strikes" 100 540 0.3 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$total" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$total" 100 574 0.4 1.5 38 "$COLOR_TEXT")"
else
  total_esc=$(_esc "$total")
  stats_filters="${stats_filters},$(slide_in_right_filter "$total_esc" 100 574 0.4 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

# Row 2: Last 24 Hours
stats_filters="${stats_filters},$(slide_in_left_filter "Last 24 Hours" 100 640 0.5 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$recent24" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$recent24" 100 674 0.6 1.2 38 "$COLOR_TEXT")"
else
  r24_esc=$(_esc "$recent24")
  stats_filters="${stats_filters},$(slide_in_right_filter "$r24_esc" 100 674 0.6 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

# Row 3: Last 7 Days
stats_filters="${stats_filters},$(slide_in_left_filter "Last 7 Days" 100 740 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$recent7d" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$recent7d" 100 774 0.8 1.2 38 "$COLOR_TEXT")"
else
  r7d_esc=$(_esc "$recent7d")
  stats_filters="${stats_filters},$(slide_in_right_filter "$r7d_esc" 100 774 0.8 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

# Row 4: Video Confirmed
stats_filters="${stats_filters},$(slide_in_left_filter "Video Confirmed" 100 840 0.9 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$with_video" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$with_video" 100 874 1.0 1.0 38 "$COLOR_TEXT")"
else
  wv_esc=$(_esc "$with_video")
  stats_filters="${stats_filters},$(slide_in_right_filter "$wv_esc" 100 874 1.0 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
  -vf "$stats_filters" \
  $ENCODE_OPTS_SILENT "$TMPDIR/04_stats.mp4" 2>/dev/null

# ── Scene 5: Animated CTA (2.5s) ─────────────────────────
echo "  [5/5] CTA..."
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${CTA_DURATION}:r=${FPS}" \
  -vf "\
    $(pop_text_filter "STRIKEMAP" 700 0.1 72 "$COLOR_ACCENT" "$FONT_BOLD"),\
    $(slide_up_filter "Real-Time Strike Tracking" "(w-text_w)/2" 800 0.3 0.35 36 "$COLOR_TEXT" "$FONT_SEMIBOLD"),\
    $(slide_up_filter "strikemap.live" "(w-text_w)/2" 870 0.5 0.3 28 "$COLOR_ACCENT_ORANGE" "$FONT_MONO"),\
    $(slide_up_filter "Follow for live updates" "(w-text_w)/2" 1000 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR"),\
    fade=t=in:st=0:d=0.3,fade=t=out:st=2.0:d=0.5\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/05_cta.mp4" 2>/dev/null

# ── Compose final video ──────────────────────────────────
echo "  Composing final video..."
SCENES=("$TMPDIR/01_intro.mp4" "$TMPDIR/02_montage.mp4" "$TMPDIR/03_map.mp4" "$TMPDIR/04_stats.mp4" "$TMPDIR/05_cta.mp4")

EXISTING_SCENES=()
for scene in "${SCENES[@]}"; do
  [ -f "$scene" ] && EXISTING_SCENES+=("$scene")
done

FINAL_NO_AUDIO="$TMPDIR/final_silent.mp4"
concat_clips "$FINAL_NO_AUDIO" "${EXISTING_SCENES[@]}"

# ── Generate voice lines ─────────────────────────────────
echo "  Generating voice..."
generate_daily_voice "$total" "$recent24"

# ── Audio mix ────────────────────────────────────────────
echo "  Mixing audio..."
dur_s1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/01_intro.mp4" 2>/dev/null || echo "1.5")
dur_s2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/02_montage.mp4" 2>/dev/null || echo "8")
dur_s3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/03_map.mp4" 2>/dev/null || echo "4")
dur_s4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/04_stats.mp4" 2>/dev/null || echo "4")

ms_s1=$(echo "$dur_s1 * 1000" | bc | cut -d. -f1)
ms_s2=$(echo "($dur_s1 + $dur_s2) * 1000" | bc | cut -d. -f1)
ms_s3=$(echo "($dur_s1 + $dur_s2 + $dur_s3) * 1000" | bc | cut -d. -f1)
ms_s4=$(echo "($dur_s1 + $dur_s2 + $dur_s3 + $dur_s4) * 1000" | bc | cut -d. -f1)

# Step 1: Drone bed
FINAL_WITH_DRONE="$TMPDIR/final_drone.mp4"
add_drone_audio "$FINAL_NO_AUDIO" "$FINAL_WITH_DRONE" 0.2

# Step 2: Alarm + SFX + voice (all layered at once)
FINAL_MIXED="$TMPDIR/final_mixed.mp4"
AUDIO_LAYERS=(
  "alarm:0:0.55"
  "siren:200:0.12"
  "impact:100:0.9"
  "voice/daily_open:400:1.0"
  "whoosh:$((ms_s1 - 200)):0.5"
  "impact:${ms_s1}:0.7"
  "whoosh:$((ms_s2 - 200)):0.5"
  "impact:${ms_s2}:0.6"
  "voice/daily_stats:$((ms_s3 + 300)):1.0"
  "whoosh:$((ms_s3 - 200)):0.5"
  "voice/daily_cta:$((ms_s4 + 300)):0.9"
  "riser:$((ms_s4 - 1500)):0.4"
)
layer_sfx "$FINAL_WITH_DRONE" "$FINAL_MIXED" "${AUDIO_LAYERS[@]}"

# ── Watermark ────────────────────────────────────────────
FINAL="$OUTPUT_SUBDIR/daily_${TIMESTAMP}.mp4"
if [ -f "$FINAL_MIXED" ]; then
  apply_watermark "$FINAL_MIXED" "$FINAL"
elif [ -f "$FINAL_WITH_DRONE" ]; then
  apply_watermark "$FINAL_WITH_DRONE" "$FINAL"
else
  apply_watermark "$FINAL_NO_AUDIO" "$FINAL"
fi

echo ""
echo "=== Daily video complete ==="
echo "  Output: $FINAL"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")
echo "  Duration: ${duration}s"
echo "  Resolution: ${WIDTH}x${HEIGHT}"
