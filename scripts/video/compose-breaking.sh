#!/usr/bin/env bash
# compose-breaking.sh — Breaking strike alert video (~14s)
# Scenes: Flash+shake+pop BREAKING > Cinematic strike footage > Map zoom > Details > CTA
# Audio: impact hit, alert tone, whooshes, tension drone throughout
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"
source "$SCRIPT_DIR/lib/effects.sh"
source "$SCRIPT_DIR/lib/captions.sh"
source "$SCRIPT_DIR/lib/watermark.sh"
source "$SCRIPT_DIR/lib/audio.sh"

# Parse arguments
LOCATION="${LOCATION:-UNKNOWN LOCATION}"
WEAPON="${WEAPON:-}"
INCIDENT_ID="${INCIDENT_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --location) LOCATION="$2"; shift 2 ;;
    --weapon) WEAPON="$2"; shift 2 ;;
    --incident-id) INCIDENT_ID="$2"; shift 2 ;;
    *) shift ;;
  esac
done

OUTPUT_SUBDIR=$(ensure_output_dir "breaking")
TIMESTAMP=$(video_timestamp)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== Composing Breaking Video (Viral Edition) ==="
echo "  Location: $LOCATION"
echo "  Weapon: $WEAPON"

# ── Scene 1: Flash + shake + pop BREAKING (1.5s) ─────────
echo "  [1/5] Breaking hook..."
red_flash "$TMPDIR/flash.mp4" 0.3

# Build filter as variable to avoid whitespace issues from line continuation
VF="drawbox=x=0:y=850:w=${WIDTH}:h=220:color=${COLOR_ACCENT}@0.15:t=fill"
VF="${VF},drawbox=x=0:y=850:w=${WIDTH}:h=3:color=${COLOR_ACCENT}:t=fill"
VF="${VF},drawbox=x=0:y=1067:w=${WIDTH}:h=3:color=${COLOR_ACCENT}:t=fill"
VF="${VF},$(pop_text_filter "BREAKING" 875 0.0 96 "$COLOR_ACCENT" "$FONT_BOLD")"
VF="${VF},$(slide_up_filter "STRIKE ALERT" "(w-text_w)/2" 1000 0.25 0.3 40 "$COLOR_TEXT" "$FONT_SEMIBOLD")"
VF="${VF},$(screen_shake_filter 0.0 0.4 12)"
VF="${VF},fade=t=in:st=0:d=0.15"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=1.2:r=${FPS}" \
  -vf "$VF" \
  $ENCODE_OPTS_SILENT "$TMPDIR/breaking_title.mp4" 2>/dev/null

concat_clips "$TMPDIR/01_intro.mp4" "$TMPDIR/flash.mp4" "$TMPDIR/breaking_title.mp4"

# ── Scene 2: Cinematic strike footage (4s) ────────────────
echo "  [2/5] Strike footage..."

STRIKE_VIDEO=""
STRIKE_META=""

if [ -n "$INCIDENT_ID" ]; then
  safe_id=$(echo "$INCIDENT_ID" | tr -c 'a-zA-Z0-9_-' '_')
  for f in "$MEDIA_DIR/${safe_id}"_*.mp4; do
    if [ -f "$f" ] && [[ ! "$f" == *"_raw."* ]]; then
      STRIKE_VIDEO="$f"
      STRIKE_META="${f%.mp4}.json"
      break
    fi
  done
fi

if [ -z "$STRIKE_VIDEO" ] || [ ! -f "$STRIKE_VIDEO" ]; then
  STRIKE_VIDEO=$(find "$MEDIA_DIR" -name "*.mp4" -not -name "*_raw.*" 2>/dev/null | head -1 || true)
  if [ -n "$STRIKE_VIDEO" ]; then
    STRIKE_META="${STRIKE_VIDEO%.mp4}.json"
  fi
fi

if [ -n "$STRIKE_META" ] && [ -f "$STRIKE_META" ]; then
  meta_location=$(python3 -c "import json; print(json.load(open('$STRIKE_META')).get('location',''))" 2>/dev/null || echo "")
  meta_weapon=$(python3 -c "import json; print(json.load(open('$STRIKE_META')).get('weapon',''))" 2>/dev/null || echo "")
  [ -z "$LOCATION" ] || [ "$LOCATION" = "UNKNOWN LOCATION" ] && [ -n "$meta_location" ] && LOCATION="$meta_location"
  [ -z "$WEAPON" ] && [ -n "$meta_weapon" ] && WEAPON="$meta_weapon"
fi

if [ -n "$STRIKE_VIDEO" ] && [ -f "$STRIKE_VIDEO" ]; then
  animated_lt=$(animated_lower_third_filter "$LOCATION" "$WEAPON" "$(date -u +'%H:%M UTC')" 0.5)
  cine_grade=$(cinematic_grade_filter)

  VF="$(scale_vertical),${cine_grade},${animated_lt},$(screen_shake_filter 0.0 0.3 10)"
  ffmpeg -y -i "$STRIKE_VIDEO" \
    -vf "$VF" \
    -t 4 $ENCODE_OPTS_SILENT "$TMPDIR/02_strike.mp4" 2>/dev/null
else
  echo "    No strike footage found, generating placeholder..."
  animated_lt=$(animated_lower_third_filter "$LOCATION" "$WEAPON" "$(date -u +'%H:%M UTC')" 0.5)
  VF="$(pop_text_filter "CONFIRMED STRIKE" 800 0.3 52 "$COLOR_ACCENT" "$FONT_BOLD"),${animated_lt}"
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=4:r=${FPS}" \
    -vf "$VF" \
    $ENCODE_OPTS_SILENT "$TMPDIR/02_strike.mp4" 2>/dev/null
fi

# ── Scene 3: Map zoom to location (3s) ────────────────────
echo "  [3/5] Map zoom..."
MAP_SCREENSHOT="$FRAMES_DIR/map_overview.png"
if [ -f "$MAP_SCREENSHOT" ]; then
  ken_burns "$MAP_SCREENSHOT" "$TMPDIR/03_map_raw.mp4" 3 zoom_in
  MAP_LOC=$(_esc "$LOCATION")
  VF="$(vignette_filter),$(pop_text_filter "$MAP_LOC" 300 0.5 44 "$COLOR_ACCENT" "$FONT_BOLD")"
  VF="${VF},drawbox=x=490:y=900:w=100:h=100:color=${COLOR_ACCENT}@0.5:t=4:enable='gt(t,0.3)'"
  ffmpeg -y -i "$TMPDIR/03_map_raw.mp4" \
    -vf "$VF" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
else
  MAP_LOC=$(_esc "$LOCATION")
  VF="$(pop_text_filter "$MAP_LOC" 900 0.3 56 "$COLOR_ACCENT" "$FONT_BOLD")"
  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG_SECONDARY}:s=${WIDTH}x${HEIGHT}:d=3:r=${FPS}" \
    -vf "$VF" \
    $ENCODE_OPTS_SILENT "$TMPDIR/03_map.mp4" 2>/dev/null
fi

# ── Scene 4: Details card with staggered slide-ins (3s) ───
echo "  [4/5] Details card..."
detail_weapon=$(_esc "${WEAPON:-Unknown}")
detail_time=$(_esc "$(date -u +'%H:%M UTC %b %d')")
detail_loc=$(_esc "$LOCATION")

VF="drawbox=x=60:y=400:w=960:h=520:color=${COLOR_PANEL}@0.9:t=fill"
VF="${VF},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
VF="${VF},$(pop_text_filter "STRIKE DETAILS" 440 0.1 42 "$COLOR_TEXT" "$FONT_BOLD")"
VF="${VF},$(slide_in_left_filter "Location" 100 540 0.3 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
VF="${VF},$(slide_in_right_filter "$detail_loc" 100 574 0.4 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
VF="${VF},$(slide_in_left_filter "Weapon System" 100 640 0.5 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
VF="${VF},$(slide_in_right_filter "$detail_weapon" 100 674 0.6 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
VF="${VF},$(slide_in_left_filter "Reported" 100 740 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
VF="${VF},$(slide_in_right_filter "$detail_time" 100 774 0.8 0.3 38 "$COLOR_TEXT" "$FONT_MONO")"
VF="${VF},fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=3:r=${FPS}" \
  -vf "$VF" \
  $ENCODE_OPTS_SILENT "$TMPDIR/04_details.mp4" 2>/dev/null

# ── Scene 5: Animated CTA (2.5s) ─────────────────────────
echo "  [5/5] CTA..."
VF="$(pop_text_filter "STRIKEMAP" 700 0.1 72 "$COLOR_ACCENT" "$FONT_BOLD")"
VF="${VF},$(slide_up_filter "Real-Time Strike Tracking" "(w-text_w)/2" 800 0.3 0.35 36 "$COLOR_TEXT" "$FONT_SEMIBOLD")"
VF="${VF},$(slide_up_filter "strikemap.live" "(w-text_w)/2" 870 0.5 0.3 28 "$COLOR_ACCENT_ORANGE" "$FONT_MONO")"
VF="${VF},$(slide_up_filter "Follow for live updates" "(w-text_w)/2" 1000 0.7 0.3 26 "$COLOR_TEXT_SECONDARY" "$FONT_REGULAR")"
VF="${VF},fade=t=in:st=0:d=0.3,fade=t=out:st=2.0:d=0.5"

ffmpeg -y -f lavfi \
  -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${CTA_DURATION}:r=${FPS}" \
  -vf "$VF" \
  $ENCODE_OPTS_SILENT "$TMPDIR/05_cta.mp4" 2>/dev/null

# ── Compose final video ──────────────────────────────────
echo "  Composing final video..."
SCENES=("$TMPDIR/01_intro.mp4" "$TMPDIR/02_strike.mp4" "$TMPDIR/03_map.mp4" "$TMPDIR/04_details.mp4" "$TMPDIR/05_cta.mp4")

EXISTING_SCENES=()
for scene in "${SCENES[@]}"; do
  [ -f "$scene" ] && EXISTING_SCENES+=("$scene")
done

FINAL_NO_AUDIO="$TMPDIR/final_silent.mp4"
concat_clips "$FINAL_NO_AUDIO" "${EXISTING_SCENES[@]}"

# ── Generate voice lines ─────────────────────────────────
echo "  Generating voice..."
generate_breaking_voice "$LOCATION" "$WEAPON"

# ── Audio mix ────────────────────────────────────────────
echo "  Mixing audio..."
dur_s1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/01_intro.mp4" 2>/dev/null || echo "1.5")
dur_s2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/02_strike.mp4" 2>/dev/null || echo "4")
dur_s3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/03_map.mp4" 2>/dev/null || echo "3")
dur_s4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMPDIR/04_details.mp4" 2>/dev/null || echo "3")

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
  "alarm:0:0.65"
  "siren:200:0.15"
  "impact:100:0.9"
  "voice/breaking_open:400:1.0"
  "whoosh:$((ms_s1 - 200)):0.5"
  "impact:${ms_s1}:0.7"
  "voice/breaking_detail:$((ms_s1 + 500)):1.0"
  "whoosh:$((ms_s2 - 200)):0.5"
  "impact:${ms_s2}:0.6"
  "whoosh:$((ms_s3 - 200)):0.5"
  "voice/breaking_cta:$((ms_s3 + 300)):0.9"
  "riser:$((ms_s4 - 1500)):0.4"
)
layer_sfx "$FINAL_WITH_DRONE" "$FINAL_MIXED" "${AUDIO_LAYERS[@]}"

# ── Watermark ────────────────────────────────────────────
FINAL="$OUTPUT_SUBDIR/breaking_${TIMESTAMP}.mp4"
if [ -f "$FINAL_MIXED" ]; then
  apply_watermark "$FINAL_MIXED" "$FINAL"
elif [ -f "$FINAL_WITH_DRONE" ]; then
  apply_watermark "$FINAL_WITH_DRONE" "$FINAL"
else
  apply_watermark "$FINAL_NO_AUDIO" "$FINAL"
fi

echo ""
echo "=== Breaking video complete ==="
echo "  Output: $FINAL"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")
echo "  Duration: ${duration}s"
echo "  Resolution: ${WIDTH}x${HEIGHT}"
