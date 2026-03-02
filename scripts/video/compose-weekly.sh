#!/usr/bin/env bash
# compose-weekly.sh — Weekly recap video (~40s)
# Scenes: Pop title + date range > Top 5 clips montage > Map > Stats > Leadership > Heatmap > CTA
# Audio: impact, whooshes, drone throughout
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"
source "$SCRIPT_DIR/lib/effects.sh"
source "$SCRIPT_DIR/lib/captions.sh"
source "$SCRIPT_DIR/lib/watermark.sh"
source "$SCRIPT_DIR/lib/audio.sh"

OUTPUT_SUBDIR=$(ensure_output_dir "weekly")
TIMESTAMP=$(video_timestamp)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Date range for the week
END_DATE=$(date +"%B %d, %Y")
START_DATE=$(date -v-7d +"%B %d" 2>/dev/null || date --date="7 days ago" +"%B %d" 2>/dev/null || echo "Last week")
DATE_RANGE="${START_DATE} - ${END_DATE}"

echo "=== Composing Weekly Video (Viral Edition) ==="
echo "  Date range: $DATE_RANGE"

# ── Scene 1: Pop title + date range (${HOOK_DURATION}s) ──
echo "  [1/7] Title card..."
DATE_RANGE_ESC=$(_esc "$DATE_RANGE")
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${HOOK_DURATION}:r=${FPS}" \
  -vf "\
    drawbox=x=290:y=680:w=500:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
    $(pop_text_filter "WEEKLY RECAP" 720 0.0 64 "$COLOR_TEXT" "$FONT_BOLD"),\
    $(slide_up_filter "STRIKEMAP" "(w-text_w)/2" 810 0.2 0.3 36 "$COLOR_ACCENT" "$FONT_SEMIBOLD"),\
    $(slide_up_filter "$DATE_RANGE_ESC" "(w-text_w)/2" 870 0.4 0.3 24 "$COLOR_TEXT_SECONDARY" "$FONT_MONO"),\
    $(screen_shake_filter 0.0 0.3 10),\
    fade=t=in:st=0:d=0.15\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/01_title.mp4" 2>/dev/null

# ── Scene 2: Top 5 strike clips montage (2.5s each) ──────
echo "  [2/7] Strike montage..."

MEDIA_FILES=()
if [ -d "$MEDIA_DIR" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] && MEDIA_FILES+=("$file")
  done < <(find "$MEDIA_DIR" -name "*.mp4" -not -name "*_raw.*" 2>/dev/null | head -5)
fi

if [ ${#MEDIA_FILES[@]} -gt 0 ]; then
  MONTAGE_CLIPS=()
  clip_index=0

  for media_file in "${MEDIA_FILES[@]}"; do
    clip_index=$((clip_index + 1))
    clip_out="$TMPDIR/strike_${clip_index}.mp4"

    meta_file="${media_file%.mp4}.json"
    location="STRIKE #${clip_index}"
    weapon=""
    strike_time=""

    if [ -f "$meta_file" ]; then
      location=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d.get('location','STRIKE #${clip_index}'))" 2>/dev/null || echo "STRIKE #${clip_index}")
      weapon=$(python3 -c "import json; print(json.load(open('$meta_file')).get('weapon',''))" 2>/dev/null || echo "")
      strike_time=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d.get('date',''))" 2>/dev/null || echo "")
    fi

    animated_lt=$(animated_lower_third_filter "$location" "$weapon" "$strike_time" 0.2)
    cine_grade=$(cinematic_grade_filter)

    ffmpeg -y -i "$media_file" \
      -vf "$(scale_vertical),${cine_grade},${animated_lt},\
           drawtext=fontfile=${FONT_MONO}:text='#${clip_index}':fontcolor=${COLOR_ACCENT}:fontsize=36:x=960:y=320:enable='gte(t,0.3)',\
           $(screen_shake_filter 0.0 0.2 8)" \
      -t 2.5 $ENCODE_OPTS_SILENT "$clip_out" 2>/dev/null

    MONTAGE_CLIPS+=("$clip_out")
  done

  if [ ${#MONTAGE_CLIPS[@]} -gt 1 ]; then
    concat_clips "$TMPDIR/02_montage.mp4" "${MONTAGE_CLIPS[@]}"
  elif [ ${#MONTAGE_CLIPS[@]} -eq 1 ]; then
    cp "${MONTAGE_CLIPS[0]}" "$TMPDIR/02_montage.mp4"
  fi
else
  echo "    No media files found, generating placeholder..."
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=6:r=${FPS}" \
    -vf "$(pop_text_filter "TOP STRIKES" 870 0.2 52 "$COLOR_ACCENT" "$FONT_BOLD"),\
         $(slide_up_filter "This Week" "(w-text_w)/2" 950 0.5 0.3 30 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_montage.mp4" 2>/dev/null
fi

# ── Scene 3: Map timelapse (4s) ──────────────────────────
echo "  [3/7] Map timelapse..."
MAP_SCREENSHOT="$FRAMES_DIR/map_overview.png"
if [ -f "$MAP_SCREENSHOT" ]; then
  ken_burns "$MAP_SCREENSHOT" "$TMPDIR/03_map_raw.mp4" 4 pan_right
  ffmpeg -y -i "$TMPDIR/03_map_raw.mp4" \
    -vf "$(vignette_filter),\
         $(pop_text_filter "WEEKLY ACTIVITY" 200 0.3 40 "$COLOR_ACCENT" "$FONT_BOLD"),\
         $(slide_up_filter "$DATE_RANGE_ESC" "(w-text_w)/2" 260 0.5 0.3 22 "$COLOR_TEXT_SECONDARY" "$FONT_MONO")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
else
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG_SECONDARY}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "MAP OVERVIEW" 900 0.2 48 "$COLOR_ACCENT" "$FONT_BOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
fi

# ── Scene 4: Weekly stats with count-up (4s) ─────────────
echo "  [4/7] Stats..."
STATS_FILE="$FRAMES_DIR/stats.json"
total="--"
recent7d="--"
with_video="--"

if [ -f "$STATS_FILE" ]; then
  total=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['total_incidents'])" 2>/dev/null || echo "--")
  recent7d=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['recent_7d'])" 2>/dev/null || echo "--")
  with_video=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['with_video'])" 2>/dev/null || echo "--")
fi

stats_filters="drawbox=x=60:y=400:w=960:h=460:color=${COLOR_PANEL}@0.9:t=fill"
stats_filters="${stats_filters},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
stats_filters="${stats_filters},$(pop_text_filter "WEEKLY NUMBERS" 440 0.1 42 "$COLOR_TEXT" "$FONT_BOLD")"

stats_filters="${stats_filters},$(slide_in_left_filter "Strikes This Week" 100 540 0.3 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$recent7d" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$recent7d" 100 574 0.4 1.5 38 "$COLOR_TEXT")"
else
  r7_esc=$(_esc "$recent7d")
  stats_filters="${stats_filters},$(slide_in_right_filter "$r7_esc" 100 574 0.4 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},$(slide_in_left_filter "Total Tracked" 100 640 0.5 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$total" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$total" 100 674 0.6 1.5 38 "$COLOR_TEXT")"
else
  t_esc=$(_esc "$total")
  stats_filters="${stats_filters},$(slide_in_right_filter "$t_esc" 100 674 0.6 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},$(slide_in_left_filter "Video Confirmed" 100 740 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$with_video" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$with_video" 100 774 0.8 1.0 38 "$COLOR_TEXT")"
else
  wv_esc=$(_esc "$with_video")
  stats_filters="${stats_filters},$(slide_in_right_filter "$wv_esc" 100 774 0.8 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
  -vf "$stats_filters" \
  $ENCODE_OPTS_SILENT "$TMPDIR/04_stats.mp4" 2>/dev/null

# ── Scene 5: Leadership update (4s) ──────────────────────
echo "  [5/7] Leadership..."
LEADER_SCREENSHOT="$FRAMES_DIR/leader_all.png"
if [ -f "$LEADER_SCREENSHOT" ]; then
  ken_burns "$LEADER_SCREENSHOT" "$TMPDIR/05_leaders_raw.mp4" 4 zoom_out
  ffmpeg -y -i "$TMPDIR/05_leaders_raw.mp4" \
    -vf "$(vignette_filter),\
         $(pop_text_filter "LEADERSHIP BOARD" 200 0.3 40 "$COLOR_ACCENT" "$FONT_BOLD")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/05_leaders.mp4" 2>/dev/null
else
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "LEADERSHIP" 850 0.0 56 "$COLOR_ACCENT" "$FONT_BOLD"),\
         $(slide_up_filter "BOARD UPDATE" "(w-text_w)/2" 930 0.25 0.3 36 "$COLOR_TEXT" "$FONT_SEMIBOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/05_leaders.mp4" 2>/dev/null
fi

# ── Scene 6: Heatmap (4s) ────────────────────────────────
echo "  [6/7] Heatmap..."
HEATMAP_SCREENSHOT="$FRAMES_DIR/heatmap.png"
if [ -f "$HEATMAP_SCREENSHOT" ]; then
  ken_burns "$HEATMAP_SCREENSHOT" "$TMPDIR/06_heatmap_raw.mp4" 4 zoom_in
  ffmpeg -y -i "$TMPDIR/06_heatmap_raw.mp4" \
    -vf "$(vignette_filter),\
         $(pop_text_filter "STRIKE DENSITY" 200 0.3 40 "$COLOR_ACCENT" "$FONT_BOLD")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/06_heatmap.mp4" 2>/dev/null
else
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG_SECONDARY}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "STRIKE HEATMAP" 900 0.2 48 "$COLOR_ACCENT" "$FONT_BOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/06_heatmap.mp4" 2>/dev/null
fi

# ── Scene 7: Animated CTA (${CTA_DURATION}s) ─────────────
echo "  [7/7] CTA..."
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${CTA_DURATION}:r=${FPS}" \
  -vf "\
    $(pop_text_filter "STRIKEMAP" 700 0.1 72 "$COLOR_ACCENT" "$FONT_BOLD"),\
    $(slide_up_filter "Real-Time Strike Tracking" "(w-text_w)/2" 800 0.3 0.35 36 "$COLOR_TEXT" "$FONT_SEMIBOLD"),\
    $(slide_up_filter "strikemap.live" "(w-text_w)/2" 870 0.5 0.3 28 "$COLOR_ACCENT_ORANGE" "$FONT_MONO"),\
    $(slide_up_filter "Follow for live updates" "(w-text_w)/2" 1000 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR"),\
    fade=t=in:st=0:d=0.3,fade=t=out:st=2.0:d=0.5\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/07_cta.mp4" 2>/dev/null

# ── Compose final video ──────────────────────────────────
echo "  Composing final video..."
SCENES=(
  "$TMPDIR/01_title.mp4"
  "$TMPDIR/02_montage.mp4"
  "$TMPDIR/03_map.mp4"
  "$TMPDIR/04_stats.mp4"
  "$TMPDIR/05_leaders.mp4"
  "$TMPDIR/06_heatmap.mp4"
  "$TMPDIR/07_cta.mp4"
)

EXISTING_SCENES=()
for scene in "${SCENES[@]}"; do
  [ -f "$scene" ] && EXISTING_SCENES+=("$scene")
done

FINAL_NO_AUDIO="$TMPDIR/final_silent.mp4"
concat_clips "$FINAL_NO_AUDIO" "${EXISTING_SCENES[@]}"

# ── Generate voice lines ─────────────────────────────────
echo "  Generating voice..."
generate_weekly_voice "$recent7d"

# ── Audio mix ────────────────────────────────────────────
echo "  Mixing audio..."
dur_s1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/01_title.mp4" 2>/dev/null || echo "1.5")
dur_s2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/02_montage.mp4" 2>/dev/null || echo "10")
dur_s3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/03_map.mp4" 2>/dev/null || echo "4")
dur_s4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/04_stats.mp4" 2>/dev/null || echo "4")
dur_s5=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/05_leaders.mp4" 2>/dev/null || echo "4")
dur_s6=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/06_heatmap.mp4" 2>/dev/null || echo "4")

ms_s1=$(echo "$dur_s1 * 1000" | bc | cut -d. -f1)
ms_s2=$(echo "($dur_s1 + $dur_s2) * 1000" | bc | cut -d. -f1)
ms_s3=$(echo "($dur_s1 + $dur_s2 + $dur_s3) * 1000" | bc | cut -d. -f1)
ms_s4=$(echo "($dur_s1 + $dur_s2 + $dur_s3 + $dur_s4) * 1000" | bc | cut -d. -f1)
ms_s5=$(echo "($dur_s1 + $dur_s2 + $dur_s3 + $dur_s4 + $dur_s5) * 1000" | bc | cut -d. -f1)
ms_s6=$(echo "($dur_s1 + $dur_s2 + $dur_s3 + $dur_s4 + $dur_s5 + $dur_s6) * 1000" | bc | cut -d. -f1)

# Step 1: Drone bed
FINAL_WITH_DRONE="$TMPDIR/final_drone.mp4"
add_drone_audio "$FINAL_NO_AUDIO" "$FINAL_WITH_DRONE" 0.2

# Step 2: Alarm + SFX + voice (all layered at once)
FINAL_MIXED="$TMPDIR/final_mixed.mp4"
AUDIO_LAYERS=(
  "alarm:0:0.5"
  "impact:100:0.9"
  "voice/weekly_open:400:1.0"
  "whoosh:$((ms_s1 - 200)):0.5"
  "impact:${ms_s1}:0.7"
  "whoosh:$((ms_s2 - 200)):0.5"
  "impact:${ms_s2}:0.6"
  "voice/weekly_stats:$((ms_s3 + 300)):1.0"
  "whoosh:$((ms_s3 - 200)):0.5"
  "impact:${ms_s3}:0.6"
  "whoosh:$((ms_s4 - 200)):0.5"
  "impact:${ms_s4}:0.6"
  "whoosh:$((ms_s5 - 200)):0.5"
  "impact:${ms_s5}:0.6"
  "voice/weekly_cta:$((ms_s6 + 300)):0.9"
  "riser:$((ms_s6 - 1500)):0.4"
)
layer_sfx "$FINAL_WITH_DRONE" "$FINAL_MIXED" "${AUDIO_LAYERS[@]}"

# ── Watermark ────────────────────────────────────────────
FINAL="$OUTPUT_SUBDIR/weekly_${TIMESTAMP}.mp4"
if [ -f "$FINAL_MIXED" ]; then
  apply_watermark "$FINAL_MIXED" "$FINAL"
elif [ -f "$FINAL_WITH_DRONE" ]; then
  apply_watermark "$FINAL_WITH_DRONE" "$FINAL"
else
  apply_watermark "$FINAL_NO_AUDIO" "$FINAL"
fi

echo ""
echo "=== Weekly video complete ==="
echo "  Output: $FINAL"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")
echo "  Duration: ${duration}s"
echo "  Resolution: ${WIDTH}x${HEIGHT}"
