#!/usr/bin/env bash
# compose-leadership.sh — Leader spotlight/elimination video (~20s)
# Scenes: Pop title > Portrait with shake > Board pan > Animated stats > CTA
# Audio: impact, alert, whooshes, drone
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"
source "$SCRIPT_DIR/lib/effects.sh"
source "$SCRIPT_DIR/lib/captions.sh"
source "$SCRIPT_DIR/lib/watermark.sh"
source "$SCRIPT_DIR/lib/audio.sh"

LEADER="${LEADER:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --leader) LEADER="$2"; shift 2 ;;
    *) shift ;;
  esac
done

OUTPUT_SUBDIR=$(ensure_output_dir "leadership")
TIMESTAMP=$(video_timestamp)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== Composing Leadership Video (Viral Edition) ==="
[ -n "$LEADER" ] && echo "  Leader: $LEADER"

# ── Scene 1: Animated title (${HOOK_DURATION}s) ──────────
echo "  [1/5] Title card..."
ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${HOOK_DURATION}:r=${FPS}" \
  -vf "\
    drawbox=x=290:y=680:w=500:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
    $(pop_text_filter "LEADERSHIP BOARD" 720 0.0 52 "$COLOR_TEXT" "$FONT_BOLD"),\
    $(slide_up_filter "Eliminations & Status" "(w-text_w)/2" 800 0.25 0.3 30 "$COLOR_TEXT_SECONDARY" "$FONT_SEMIBOLD"),\
    $(screen_shake_filter 0.0 0.25 8),\
    fade=t=in:st=0:d=0.15\
  " \
  $ENCODE_OPTS_SILENT "$TMPDIR/01_title.mp4" 2>/dev/null

# ── Scene 2: Leader portrait (4s) ────────────────────────
echo "  [2/5] Leader portrait..."

LEADER_IMAGE=""
if [ -n "$LEADER" ]; then
  for ext in jpg png webp jpeg; do
    candidate="$PROJECT_ROOT/public/leaders/${LEADER}.${ext}"
    if [ -f "$candidate" ]; then
      LEADER_IMAGE="$candidate"
      break
    fi
    candidate=$(find "$PROJECT_ROOT/public/leaders/" -iname "${LEADER}.${ext}" 2>/dev/null | head -1)
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      LEADER_IMAGE="$candidate"
      break
    fi
  done

  if [ -z "$LEADER_IMAGE" ] && [ -f "$FRAMES_DIR/leader_${LEADER}.png" ]; then
    LEADER_IMAGE="$FRAMES_DIR/leader_${LEADER}.png"
  fi
fi

if [ -n "$LEADER_IMAGE" ] && [ -f "$LEADER_IMAGE" ]; then
  ken_burns "$LEADER_IMAGE" "$TMPDIR/02_portrait_raw.mp4" 4 zoom_in

  leader_display=$(echo "$LEADER" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
  leader_disp_esc=$(_esc "$leader_display")

  ffmpeg -y -i "$TMPDIR/02_portrait_raw.mp4" \
    -vf "$(vignette_filter),$(film_grain_filter),\
         drawbox=x=0:y=1720:w=1080:h=120:color=${COLOR_BG}@0.85:t=fill:enable='gte(t,0.3)',\
         $(slide_up_filter "$leader_disp_esc" "(w-text_w)/2" 1740 0.4 0.3 44 "$COLOR_TEXT" "$FONT_BOLD"),\
         $(pop_text_filter "ELIMINATED" 1795 2.0 28 "$COLOR_ACCENT" "$FONT_SEMIBOLD"),\
         $(screen_shake_filter 0.0 0.3 10),\
         $(glitch_flash_filter 2.0 0.08)" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_portrait.mp4" 2>/dev/null
else
  leader_display=""
  if [ -n "$LEADER" ]; then
    leader_display=$(echo "$LEADER" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
  else
    leader_display="Leadership Update"
  fi
  leader_disp_esc=$(_esc "$leader_display")

  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "drawbox=x=340:y=830:w=400:h=4:color=${COLOR_ACCENT}:t=fill:enable='gte(t,0.15)',\
         $(pop_text_filter "$leader_disp_esc" 850 0.0 56 "$COLOR_TEXT" "$FONT_BOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_portrait.mp4" 2>/dev/null
fi

# ── Scene 3: Board overview pan (4s) ─────────────────────
echo "  [3/5] Board overview..."
BOARD_SCREENSHOT="$FRAMES_DIR/leader_all.png"
if [ ! -f "$BOARD_SCREENSHOT" ]; then
  BOARD_SCREENSHOT="$FRAMES_DIR/dashboard_full.png"
fi

if [ -f "$BOARD_SCREENSHOT" ]; then
  ken_burns "$BOARD_SCREENSHOT" "$TMPDIR/03_board_raw.mp4" 4 pan_right
  ffmpeg -y -i "$TMPDIR/03_board_raw.mp4" \
    -vf "$(vignette_filter),\
         $(pop_text_filter "LEADERSHIP BOARD" 200 0.3 40 "$COLOR_ACCENT" "$FONT_BOLD")" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_board.mp4" 2>/dev/null
else
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG_SECONDARY}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$(pop_text_filter "LEADERSHIP BOARD" 900 0.2 48 "$COLOR_ACCENT" "$FONT_BOLD"),\
         fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_board.mp4" 2>/dev/null
fi

# ── Scene 4: Animated stats (4s) ─────────────────────────
echo "  [4/5] Stats..."
STATS_FILE="$FRAMES_DIR/stats.json"
total="--"
if [ -f "$STATS_FILE" ]; then
  total=$(python3 -c "import json; print(json.load(open('$STATS_FILE'))['total_incidents'])" 2>/dev/null || echo "--")
fi

stats_filters="drawbox=x=60:y=400:w=960:h=460:color=${COLOR_PANEL}@0.9:t=fill"
stats_filters="${stats_filters},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
stats_filters="${stats_filters},$(pop_text_filter "ELIMINATION STATS" 440 0.1 42 "$COLOR_TEXT" "$FONT_BOLD")"

stats_filters="${stats_filters},$(slide_in_left_filter "Total Strikes" 100 540 0.3 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
if [[ "$total" =~ ^[0-9]+$ ]]; then
  stats_filters="${stats_filters},$(count_up_filter "$total" 100 574 0.4 1.5 38 "$COLOR_TEXT")"
else
  total_esc=$(_esc "$total")
  stats_filters="${stats_filters},$(slide_in_right_filter "$total_esc" 100 574 0.4 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
fi

stats_filters="${stats_filters},$(slide_in_left_filter "Leadership Targets" 100 640 0.5 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
stats_filters="${stats_filters},$(slide_in_right_filter "Active Tracking" 100 674 0.6 0.3 38 "$COLOR_ACCENT" "$FONT_MONO")"

stats_filters="${stats_filters},$(slide_in_left_filter "Confirmed Eliminations" 100 740 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
stats_filters="${stats_filters},$(slide_in_right_filter "See Board" 100 774 0.8 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"

stats_filters="${stats_filters},fade=t=in:st=0:d=0.3,fade=t=out:st=3.5:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
  -vf "$stats_filters" \
  $ENCODE_OPTS_SILENT "$TMPDIR/04_stats.mp4" 2>/dev/null

# ── Scene 5: Animated CTA (${CTA_DURATION}s) ─────────────
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
SCENES=("$TMPDIR/01_title.mp4" "$TMPDIR/02_portrait.mp4" "$TMPDIR/03_board.mp4" "$TMPDIR/04_stats.mp4" "$TMPDIR/05_cta.mp4")

EXISTING_SCENES=()
for scene in "${SCENES[@]}"; do
  [ -f "$scene" ] && EXISTING_SCENES+=("$scene")
done

FINAL_NO_AUDIO="$TMPDIR/final_silent.mp4"
concat_clips "$FINAL_NO_AUDIO" "${EXISTING_SCENES[@]}"

# ── Generate voice lines ─────────────────────────────────
echo "  Generating voice..."
generate_leadership_voice "$LEADER"

# ── Audio mix ────────────────────────────────────────────
echo "  Mixing audio..."
dur_s1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/01_title.mp4" 2>/dev/null || echo "1.5")
dur_s2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/02_portrait.mp4" 2>/dev/null || echo "4")
dur_s3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/03_board.mp4" 2>/dev/null || echo "4")
dur_s4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/04_stats.mp4" 2>/dev/null || echo "4")

ms_s1=$(echo "$dur_s1 * 1000" | bc | cut -d. -f1)
ms_s2=$(echo "($dur_s1 + $dur_s2) * 1000" | bc | cut -d. -f1)
ms_s3=$(echo "($dur_s1 + $dur_s2 + $dur_s3) * 1000" | bc | cut -d. -f1)
ms_s4=$(echo "($dur_s1 + $dur_s2 + $dur_s3 + $dur_s4) * 1000" | bc | cut -d. -f1)

# Step 1: Drone bed
FINAL_WITH_DRONE="$TMPDIR/final_drone.mp4"
add_drone_audio "$FINAL_NO_AUDIO" "$FINAL_WITH_DRONE" 0.25

# Step 2: Alarm + SFX + voice (all layered at once)
FINAL_MIXED="$TMPDIR/final_mixed.mp4"
AUDIO_LAYERS=(
  "alarm:0:0.5"
  "impact:100:0.9"
  "voice/leader_open:400:1.0"
  "whoosh:$((ms_s1 - 200)):0.6"
  "impact:${ms_s1}:0.8"
  "alert:$((ms_s1 + 2000)):0.5"
  "whoosh:$((ms_s2 - 200)):0.5"
  "impact:${ms_s2}:0.6"
  "voice/leader_stats:$((ms_s3 + 300)):1.0"
  "whoosh:$((ms_s3 - 200)):0.5"
  "voice/leader_cta:$((ms_s4 + 300)):0.9"
  "riser:$((ms_s4 - 1500)):0.4"
)
layer_sfx "$FINAL_WITH_DRONE" "$FINAL_MIXED" "${AUDIO_LAYERS[@]}"

# ── Watermark ────────────────────────────────────────────
FINAL="$OUTPUT_SUBDIR/leadership_${TIMESTAMP}.mp4"
if [ -f "$FINAL_MIXED" ]; then
  apply_watermark "$FINAL_MIXED" "$FINAL"
elif [ -f "$FINAL_WITH_DRONE" ]; then
  apply_watermark "$FINAL_WITH_DRONE" "$FINAL"
else
  apply_watermark "$FINAL_NO_AUDIO" "$FINAL"
fi

echo ""
echo "=== Leadership video complete ==="
echo "  Output: $FINAL"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")
echo "  Duration: ${duration}s"
echo "  Resolution: ${WIDTH}x${HEIGHT}"
