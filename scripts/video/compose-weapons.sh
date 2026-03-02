#!/usr/bin/env bash
# compose-weapons.sh — Weapon system showcase video (~15s)
# Scenes: Pop title > Cinematic strike footage > Animated stats > CTA
# Audio: impact, whooshes, drone
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"
source "$SCRIPT_DIR/lib/effects.sh"
source "$SCRIPT_DIR/lib/captions.sh"
source "$SCRIPT_DIR/lib/watermark.sh"
source "$SCRIPT_DIR/lib/audio.sh"

WEAPON_NAME="${WEAPON:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --weapon) WEAPON_NAME="$2"; shift 2 ;;
    *) shift ;;
  esac
done

OUTPUT_SUBDIR=$(ensure_output_dir "weapons")
TIMESTAMP=$(video_timestamp)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== Composing Weapons Video (Viral Edition) ==="
echo "  Weapon: ${WEAPON_NAME:-all}"

# ── Scene 1: Animated title (${HOOK_DURATION}s) ──────────
echo "  [1/4] Title card..."
weapon_title=$(_esc "${WEAPON_NAME:-WEAPONS}")
weapon_sub=$(_esc "${WEAPON_NAME:+$WEAPON_NAME}")
if [ -n "$WEAPON_NAME" ]; then
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${HOOK_DURATION}:r=${FPS}" \
    -vf "\
      drawbox=x=290:y=680:w=500:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
      $(pop_text_filter "WEAPON SYSTEM" 720 0.0 56 "$COLOR_TEXT" "$FONT_BOLD"),\
      $(slide_up_filter "$weapon_sub" "(w-text_w)/2" 810 0.25 0.3 36 "$COLOR_ACCENT" "$FONT_SEMIBOLD"),\
      $(screen_shake_filter 0.0 0.25 8),\
      fade=t=in:st=0:d=0.15\
    " \
    $ENCODE_OPTS_SILENT "$TMPDIR/01_title.mp4" 2>/dev/null
else
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${HOOK_DURATION}:r=${FPS}" \
    -vf "\
      drawbox=x=290:y=680:w=500:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
      $(pop_text_filter "WEAPONS" 720 0.0 64 "$COLOR_TEXT" "$FONT_BOLD"),\
      $(slide_up_filter "Systems & Capabilities" "(w-text_w)/2" 810 0.25 0.3 30 "$COLOR_TEXT_SECONDARY" "$FONT_SEMIBOLD"),\
      $(screen_shake_filter 0.0 0.25 8),\
      fade=t=in:st=0:d=0.15\
    " \
    $ENCODE_OPTS_SILENT "$TMPDIR/01_title.mp4" 2>/dev/null
fi

# ── Scene 2: Strike footage (5s) ─────────────────────────
echo "  [2/4] Strike footage..."

WEAPON_VIDEOS=()
if [ -d "$MEDIA_DIR" ] && [ -n "$WEAPON_NAME" ]; then
  for meta_file in "$MEDIA_DIR"/*.json; do
    [ -f "$meta_file" ] || continue
    meta_weapon=$(python3 -c "import json; print(json.load(open('$meta_file')).get('weapon',''))" 2>/dev/null || echo "")
    if echo "$meta_weapon" | grep -qi "$WEAPON_NAME"; then
      video_file="${meta_file%.json}.mp4"
      if [ -f "$video_file" ]; then
        WEAPON_VIDEOS+=("$video_file")
      fi
    fi
  done
fi

# Fallback: use any available media
if [ ${#WEAPON_VIDEOS[@]} -eq 0 ]; then
  while IFS= read -r file; do
    [ -n "$file" ] && WEAPON_VIDEOS+=("$file")
  done < <(find "$MEDIA_DIR" -name "*.mp4" -not -name "*_raw.*" 2>/dev/null | head -2)
fi

if [ ${#WEAPON_VIDEOS[@]} -gt 0 ]; then
  strike_file="${WEAPON_VIDEOS[0]}"
  meta_file="${strike_file%.mp4}.json"

  location=""
  if [ -f "$meta_file" ]; then
    location=$(python3 -c "import json; print(json.load(open('$meta_file')).get('location',''))" 2>/dev/null || echo "")
  fi

  animated_lt=$(animated_lower_third_filter "${location:-STRIKE ZONE}" "${WEAPON_NAME:-Strike Footage}" "" 0.5)
  cine_grade=$(cinematic_grade_filter)

  ffmpeg -y -i "$strike_file" \
    -vf "$(scale_vertical),${cine_grade},${animated_lt},\
         $(screen_shake_filter 0.0 0.3 8)" \
    -t 5 $ENCODE_OPTS_SILENT "$TMPDIR/02_footage.mp4" 2>/dev/null
else
  echo "    No weapon footage found, generating placeholder..."
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=5:r=${FPS}" \
    -vf "$(pop_text_filter "$weapon_title" 850 0.2 56 "$COLOR_ACCENT" "$FONT_BOLD"),\
         $(slide_up_filter "Strike Footage" "(w-text_w)/2" 930 0.5 0.3 30 "$COLOR_TEXT_SECONDARY" "$FONT_SEMIBOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=4.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_footage.mp4" 2>/dev/null
fi

# ── Scene 3: Animated weapon stats (4s) ───────────────────
echo "  [3/4] Weapon stats card..."

STATS_FILE="$FRAMES_DIR/stats.json"
weapon_count="--"
if [ -f "$STATS_FILE" ] && [ -n "$WEAPON_NAME" ]; then
  weapon_count=$(python3 -c "
import json
d = json.load(open('$STATS_FILE'))
weapons = d.get('by_weapon', {})
count = 0
for w, c in weapons.items():
    if '${WEAPON_NAME}'.lower() in w.lower():
        count += c
print(count if count > 0 else '--')
" 2>/dev/null || echo "--")
fi

weapon_disp=$(_esc "${WEAPON_NAME:-Various}")

stats_filters="drawbox=x=60:y=400:w=960:h=460:color=${COLOR_PANEL}@0.9:t=fill"
stats_filters="${stats_filters},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
stats_filters="${stats_filters},$(pop_text_filter "$weapon_disp" 440 0.1 42 "$COLOR_TEXT" "$FONT_BOLD")"

stats_filters="${stats_filters},$(slide_in_left_filter "Confirmed Uses" 100 540 0.3 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$weapon_count" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$weapon_count" 100 574 0.4 1.2 38 "$COLOR_TEXT")"
else
  wc_esc=$(_esc "$weapon_count")
  stats_filters="${stats_filters},$(slide_in_right_filter "$wc_esc" 100 574 0.4 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},$(slide_in_left_filter "System Type" 100 640 0.5 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
stats_filters="${stats_filters},$(slide_in_right_filter "$weapon_disp" 100 674 0.6 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"

stats_filters="${stats_filters},$(slide_in_left_filter "Status" 100 740 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
stats_filters="${stats_filters},$(slide_in_right_filter "Active Tracking" 100 774 0.8 0.3 38 "$COLOR_ACCENT" "$FONT_MONO")"

stats_filters="${stats_filters},fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
  -vf "$stats_filters" \
  $ENCODE_OPTS_SILENT "$TMPDIR/03_stats.mp4" 2>/dev/null

# ── Scene 4: Animated CTA (${CTA_DURATION}s) ─────────────
echo "  [4/4] CTA..."
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${CTA_DURATION}:r=${FPS}" \
  -vf "\
    $(pop_text_filter "STRIKEMAP" 700 0.1 72 "$COLOR_ACCENT" "$FONT_BOLD"),\
    $(slide_up_filter "Real-Time Strike Tracking" "(w-text_w)/2" 800 0.3 0.35 36 "$COLOR_TEXT" "$FONT_SEMIBOLD"),\
    $(slide_up_filter "strikemap.live" "(w-text_w)/2" 870 0.5 0.3 28 "$COLOR_ACCENT_ORANGE" "$FONT_MONO"),\
    $(slide_up_filter "Follow for live updates" "(w-text_w)/2" 1000 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR"),\
    fade=t=in:st=0:d=0.3,fade=t=out:st=2.0:d=0.5\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/04_cta.mp4" 2>/dev/null

# ── Compose final video ──────────────────────────────────
echo "  Composing final video..."
SCENES=("$TMPDIR/01_title.mp4" "$TMPDIR/02_footage.mp4" "$TMPDIR/03_stats.mp4" "$TMPDIR/04_cta.mp4")

EXISTING_SCENES=()
for scene in "${SCENES[@]}"; do
  [ -f "$scene" ] && EXISTING_SCENES+=("$scene")
done

FINAL_NO_AUDIO="$TMPDIR/final_silent.mp4"
concat_clips "$FINAL_NO_AUDIO" "${EXISTING_SCENES[@]}"

# ── Generate voice lines ─────────────────────────────────
echo "  Generating voice..."
generate_weapons_voice "${WEAPON_NAME:-Weapon system}"

# ── Audio mix ────────────────────────────────────────────
echo "  Mixing audio..."
dur_s1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/01_title.mp4" 2>/dev/null || echo "1.5")
dur_s2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/02_footage.mp4" 2>/dev/null || echo "5")
dur_s3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/03_stats.mp4" 2>/dev/null || echo "4")

ms_s1=$(echo "$dur_s1 * 1000" | bc | cut -d. -f1)
ms_s2=$(echo "($dur_s1 + $dur_s2) * 1000" | bc | cut -d. -f1)
ms_s3=$(echo "($dur_s1 + $dur_s2 + $dur_s3) * 1000" | bc | cut -d. -f1)

# Step 1: Drone bed
FINAL_WITH_DRONE="$TMPDIR/final_drone.mp4"
add_drone_audio "$FINAL_NO_AUDIO" "$FINAL_WITH_DRONE" 0.2

# Step 2: Alarm + SFX + voice (all layered at once)
FINAL_MIXED="$TMPDIR/final_mixed.mp4"
AUDIO_LAYERS=(
  "alarm:0:0.5"
  "impact:100:0.9"
  "voice/weapons_open:400:1.0"
  "whoosh:$((ms_s1 - 200)):0.5"
  "impact:${ms_s1}:0.7"
  "voice/weapons_stats:$((ms_s2 + 300)):1.0"
  "whoosh:$((ms_s2 - 200)):0.5"
  "voice/weapons_cta:$((ms_s3 + 300)):0.9"
  "riser:$((ms_s3 - 1500)):0.4"
)
layer_sfx "$FINAL_WITH_DRONE" "$FINAL_MIXED" "${AUDIO_LAYERS[@]}"

# ── Watermark ────────────────────────────────────────────
FINAL="$OUTPUT_SUBDIR/weapons_${TIMESTAMP}.mp4"
if [ -f "$FINAL_MIXED" ]; then
  apply_watermark "$FINAL_MIXED" "$FINAL"
elif [ -f "$FINAL_WITH_DRONE" ]; then
  apply_watermark "$FINAL_WITH_DRONE" "$FINAL"
else
  apply_watermark "$FINAL_NO_AUDIO" "$FINAL"
fi

echo ""
echo "=== Weapons video complete ==="
echo "  Output: $FINAL"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")
echo "  Duration: ${duration}s"
echo "  Resolution: ${WIDTH}x${HEIGHT}"
