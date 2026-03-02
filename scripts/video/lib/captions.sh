#!/usr/bin/env bash
# captions.sh — Text overlay helpers: headlines, stats, CTAs, lower-thirds

source "$(dirname "${BASH_SOURCE[0]}")/brand.sh"

# ── Escape text for FFmpeg drawtext filter ───────────────────
# Commas, colons, backslashes, and single quotes must be escaped
_esc() {
  local text="$1"
  # Escape backslashes first, then other special chars
  text="${text//\\/\\\\}"
  text="${text//:/\\:}"
  text="${text//,/\\,}"
  text="${text//\'/\\\'}"
  text="${text//\[/\\[}"
  text="${text//\]/\\]}"
  text="${text//\;/\\;}"
  echo "$text"
}

# ── Headline text overlay ────────────────────────────────────
# Returns drawtext filter string for a centered headline
# Usage: headline_filter <text> [y_position] [font_size] [color]
headline_filter() {
  local text
  text=$(_esc "$1")
  local y="${2:-200}"
  local size="${3:-64}"
  local color="${4:-$COLOR_TEXT}"

  echo "drawtext=fontfile=${FONT_BOLD}:text='${text}':fontcolor=${color}:fontsize=${size}:x=(w-text_w)/2:y=${y}"
}

# ── Subheadline / date text ──────────────────────────────────
# Usage: subheadline_filter <text> [y_position] [font_size]
subheadline_filter() {
  local text
  text=$(_esc "$1")
  local y="${2:-280}"
  local size="${3:-32}"

  echo "drawtext=fontfile=${FONT_SEMIBOLD}:text='${text}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=${size}:x=(w-text_w)/2:y=${y}"
}

# ── Stats overlay (key-value pair) ───────────────────────────
# Usage: stat_filter <label> <value> <y_position> [x_position]
stat_filter() {
  local label
  label=$(_esc "$1")
  local value
  value=$(_esc "$2")
  local y="$3"
  local x="${4:-100}"

  echo "drawtext=fontfile=${FONT_REGULAR}:text='${label}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=28:x=${x}:y=${y},drawtext=fontfile=${FONT_MONO}:text='${value}':fontcolor=${COLOR_TEXT}:fontsize=42:x=${x}:y=$((y + 36))"
}

# ── Lower-third caption bar ─────────────────────────────────
# Returns filter string for location/weapon/time overlay on strike footage
# Uses hardcoded positions for 1080x1920 to avoid FFmpeg expression parsing issues
# Usage: lower_third_filter <location> [weapon] [time]
lower_third_filter() {
  local location
  location=$(_esc "$1")
  local weapon
  weapon=$(_esc "${2:-}")
  local timestamp
  timestamp=$(_esc "${3:-}")

  # Hardcoded for 1080x1920: bar at y=1640, h=200
  local bar_y=$((HEIGHT - 280))   # 1640
  local line_y=$((HEIGHT - 282))  # 1638
  local loc_y=$((HEIGHT - 260))   # 1660
  local wpn_y=$((HEIGHT - 200))   # 1720
  local time_y=$((HEIGHT - 160))  # 1760

  local filters=""
  # Dark background bar
  filters="drawbox=x=0:y=${bar_y}:w=${WIDTH}:h=200:color=${COLOR_BG}@0.8:t=fill"
  # Red accent line at top of bar
  filters="${filters},drawbox=x=0:y=${line_y}:w=${WIDTH}:h=3:color=${COLOR_ACCENT}:t=fill"
  # Location text (large, red)
  filters="${filters},drawtext=fontfile=${FONT_BOLD}:text='${location}':fontcolor=${COLOR_ACCENT}:fontsize=48:x=60:y=${loc_y}"

  if [ -n "$2" ]; then
    filters="${filters},drawtext=fontfile=${FONT_SEMIBOLD}:text='${weapon}':fontcolor=${COLOR_TEXT}:fontsize=28:x=60:y=${wpn_y}"
  fi

  if [ -n "$3" ]; then
    filters="${filters},drawtext=fontfile=${FONT_MONO}:text='${timestamp}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=22:x=60:y=${time_y}"
  fi

  echo "$filters"
}

# ── CTA (Call to Action) scene ───────────────────────────────
# Usage: generate_cta <output> [duration] [url_text]
generate_cta() {
  local output="$1"
  local duration="${2:-4}"
  local url="${3:-strikemap.live}"
  local fade_out_start
  fade_out_start=$(echo "$duration - 0.8" | bc)

  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${duration}:r=${FPS}" \
    -vf "\
      drawtext=fontfile=${FONT_BOLD}:text='STRIKEMAP':fontcolor=${COLOR_ACCENT}:fontsize=72:x=(w-text_w)/2:y=700,\
      drawtext=fontfile=${FONT_SEMIBOLD}:text='Real-Time Strike Tracking':fontcolor=${COLOR_TEXT}:fontsize=36:x=(w-text_w)/2:y=800,\
      drawtext=fontfile=${FONT_MONO}:text='${url}':fontcolor=${COLOR_ACCENT_ORANGE}:fontsize=28:x=(w-text_w)/2:y=870,\
      drawtext=fontfile=${FONT_REGULAR}:text='Follow for live updates':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=26:x=(w-text_w)/2:y=1000,\
      fade=t=in:st=0:d=0.5,fade=t=out:st=${fade_out_start}:d=0.8\
    " \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}

# ── Title card scene ─────────────────────────────────────────
# Usage: generate_title <output> <title> [subtitle] [duration]
generate_title() {
  local output="$1"
  local title
  title=$(_esc "$2")
  local subtitle
  subtitle=$(_esc "${3:-}")
  local duration="${4:-3}"

  local filters=""
  # Red accent line
  filters="drawbox=x=340:y=680:w=400:h=4:color=${COLOR_ACCENT}:t=fill"
  # Title
  filters="${filters},drawtext=fontfile=${FONT_BOLD}:text='${title}':fontcolor=${COLOR_TEXT}:fontsize=56:x=(w-text_w)/2:y=720"

  if [ -n "$3" ]; then
    filters="${filters},drawtext=fontfile=${FONT_SEMIBOLD}:text='${subtitle}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=30:x=(w-text_w)/2:y=800"
  fi

  local fade_out_start
  fade_out_start=$(echo "$duration - 0.5" | bc)
  filters="${filters},fade=t=in:st=0:d=0.5,fade=t=out:st=${fade_out_start}:d=0.5"

  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${duration}:r=${FPS}" \
    -vf "$filters" \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}

# ── "BREAKING" flash title ───────────────────────────────────
# Usage: generate_breaking_title <output> [duration]
generate_breaking_title() {
  local output="$1"
  local duration="${2:-3}"

  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${duration}:r=${FPS}" \
    -vf "\
      drawbox=x=0:y=850:w=${WIDTH}:h=220:color=${COLOR_ACCENT}@0.15:t=fill,\
      drawbox=x=0:y=850:w=${WIDTH}:h=3:color=${COLOR_ACCENT}:t=fill,\
      drawbox=x=0:y=1067:w=${WIDTH}:h=3:color=${COLOR_ACCENT}:t=fill,\
      drawtext=fontfile=${FONT_BOLD}:text='BREAKING':fontcolor=${COLOR_ACCENT}:fontsize=96:x=(w-text_w)/2:y=880,\
      drawtext=fontfile=${FONT_SEMIBOLD}:text='STRIKE ALERT':fontcolor=${COLOR_TEXT}:fontsize=40:x=(w-text_w)/2:y=1000,\
      fade=t=in:st=0:d=0.3\
    " \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}

# ── Stats card scene (multiple stats) ────────────────────────
# Usage: generate_stats_card <output> <title> <duration> <label1> <value1> [label2 value2...]
generate_stats_card() {
  local output="$1"
  local card_title
  card_title=$(_esc "$2")
  local duration="$3"
  shift 3

  local filters=""
  # Background panel
  filters="drawbox=x=60:y=400:w=960:h=$((${#} / 2 * 120 + 160)):color=${COLOR_PANEL}@0.9:t=fill"
  # Panel border
  filters="${filters},drawbox=x=60:y=400:w=960:h=4:color=${COLOR_ACCENT}:t=fill"
  # Title
  filters="${filters},drawtext=fontfile=${FONT_BOLD}:text='${card_title}':fontcolor=${COLOR_TEXT}:fontsize=42:x=100:y=440"

  local y=520
  while [ $# -ge 2 ]; do
    local label
    label=$(_esc "$1")
    local value
    value=$(_esc "$2")
    shift 2
    filters="${filters},drawtext=fontfile=${FONT_REGULAR}:text='${label}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=26:x=100:y=${y}"
    filters="${filters},drawtext=fontfile=${FONT_MONO}:text='${value}':fontcolor=${COLOR_TEXT}:fontsize=38:x=100:y=$((y + 34))"
    y=$((y + 100))
  done

  local fade_out_start
  fade_out_start=$(echo "$duration - 0.5" | bc)
  filters="${filters},fade=t=in:st=0:d=0.5,fade=t=out:st=${fade_out_start}:d=0.5"

  ffmpeg -y -f lavfi \
    -i "color=c=${COLOR_BG}:s=${WIDTH}x${HEIGHT}:d=${duration}:r=${FPS}" \
    -vf "$filters" \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
}
