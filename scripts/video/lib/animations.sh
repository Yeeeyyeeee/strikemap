#!/usr/bin/env bash
# animations.sh — Animated text & visual energy filters for FFmpeg
# All positions hardcoded for 1080x1920 (FFmpeg 8 colorbalance breaks ih/iw)

source "$(dirname "${BASH_SOURCE[0]}")/brand.sh"
source "$(dirname "${BASH_SOURCE[0]}")/captions.sh"

# ── Slide-in from left ─────────────────────────────────────
# Text slides from off-screen left to final x position
# Usage: slide_in_left_filter <text> <final_x> <y> <start_time> <duration> [fontsize] [color] [font]
slide_in_left_filter() {
  local text
  text=$(_esc "$1")
  local final_x="$2"
  local y="$3"
  local start="$4"
  local dur="${5:-0.4}"
  local size="${6:-48}"
  local color="${7:-$COLOR_TEXT}"
  local font="${8:-$FONT_BOLD}"

  local end
  end=$(echo "scale=2; $start + $dur" | bc)
  # Ease-out: starts at x=-500, decelerates to final_x
  echo "drawtext=fontfile=${font}:text='${text}':fontcolor=${color}:fontsize=${size}:y=${y}:x='if(lt(t,${start}),-500,if(lt(t,${end}),-500+(${final_x}+500)*((t-${start})/${dur})*(2-(t-${start})/${dur}),${final_x}))':enable='gte(t,${start})'"
}

# ── Slide-in from right ────────────────────────────────────
slide_in_right_filter() {
  local text
  text=$(_esc "$1")
  local final_x="$2"
  local y="$3"
  local start="$4"
  local dur="${5:-0.4}"
  local size="${6:-48}"
  local color="${7:-$COLOR_TEXT}"
  local font="${8:-$FONT_BOLD}"

  local end
  end=$(echo "scale=2; $start + $dur" | bc)
  echo "drawtext=fontfile=${font}:text='${text}':fontcolor=${color}:fontsize=${size}:y=${y}:x='if(lt(t,${start}),1580,if(lt(t,${end}),1580-(1580-${final_x})*((t-${start})/${dur})*(2-(t-${start})/${dur}),${final_x}))':enable='gte(t,${start})'"
}

# ── Slide-in from bottom ───────────────────────────────────
slide_up_filter() {
  local text
  text=$(_esc "$1")
  local x="$2"
  local final_y="$3"
  local start="$4"
  local dur="${5:-0.4}"
  local size="${6:-40}"
  local color="${7:-$COLOR_TEXT}"
  local font="${8:-$FONT_SEMIBOLD}"

  local end
  end=$(echo "scale=2; $start + $dur" | bc)
  echo "drawtext=fontfile=${font}:text='${text}':fontcolor=${color}:fontsize=${size}:x=${x}:y='if(lt(t,${start}),2020,if(lt(t,${end}),2020-(2020-${final_y})*((t-${start})/${dur})*(2-(t-${start})/${dur}),${final_y}))':enable='gte(t,${start})'"
}

# ── Pop text — snap-appear with alpha fade ─────────────────
# Text appears at start time with quick alpha fade-in
# Usage: pop_text_filter <text> <y> <start> [final_size] [color] [font]
pop_text_filter() {
  local text
  text=$(_esc "$1")
  local y="$2"
  local start="$3"
  local final_size="${4:-64}"
  local color="${5:-$COLOR_TEXT}"
  local font="${6:-$FONT_BOLD}"

  local fade_dur=0.15
  local end
  end=$(echo "scale=2; $start + $fade_dur" | bc)
  # Quick alpha fade-in from 0 to 1 over fade_dur, then stay at 1
  echo "drawtext=fontfile=${font}:text='${text}':fontcolor=${color}:fontsize=${final_size}:x=(w-text_w)/2:y=${y}:alpha='if(lt(t,${start}),0,if(lt(t,${end}),(t-${start})/${fade_dur},1))':enable='gte(t,${start})'"
}

# ── Typewriter effect ──────────────────────────────────────
# Characters appear one by one (max ~20 chars for performance)
# Usage: typewriter_filter <text> <x> <y> <start> [char_delay] [fontsize] [color]
typewriter_filter() {
  local text="$1"
  local x="$2"
  local y="$3"
  local start="$4"
  local char_delay="${5:-0.06}"
  local size="${6:-36}"
  local color="${7:-$COLOR_ACCENT}"
  local font="${8:-$FONT_MONO}"

  local filters=""
  local len=${#text}
  # Cap at 20 chars
  if [ "$len" -gt 20 ]; then
    len=20
    text="${text:0:20}"
  fi

  for ((i = 0; i < len; i++)); do
    local char="${text:$i:1}"
    char=$(_esc "$char")
    local char_start
    char_start=$(echo "scale=2; $start + $i * $char_delay" | bc)
    local char_x=$((x + i * size * 6 / 10))
    if [ -n "$filters" ]; then
      filters="${filters},"
    fi
    filters="${filters}drawtext=fontfile=${font}:text='${char}':fontcolor=${color}:fontsize=${size}:x=${char_x}:y=${y}:enable='gte(t,${char_start})'"
  done

  echo "$filters"
}

# ── Count-up number animation ──────────────────────────────
# Counts from 0 to target number over duration
# Usage: count_up_filter <number> <x> <y> <start> <duration> [fontsize] [color]
count_up_filter() {
  local number="$1"
  local x="$2"
  local y="$3"
  local start="$4"
  local dur="$5"
  local size="${6:-52}"
  local color="${7:-$COLOR_TEXT}"

  local end
  end=$(echo "scale=2; $start + $dur" | bc)
  # Use eif to format as integer. clip(trunc(N * progress), 0, N)
  echo "drawtext=fontfile=${FONT_MONO}:text='%{eif\\:clip(trunc(${number}*(t-${start})/${dur})\\,0\\,${number})\\:d}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}:enable='gte(t,${start})'"
}

# ── Animated lower-third ───────────────────────────────────
# Bar wipes in, red line appears, location slides up, weapon/time fade in
# Replaces static lower_third_filter
# Usage: animated_lower_third_filter <location> [weapon] [time] [start_time]
animated_lower_third_filter() {
  local location
  location=$(_esc "$1")
  local weapon
  weapon=$(_esc "${2:-}")
  local timestamp
  timestamp=$(_esc "${3:-}")
  local start="${4:-0.3}"

  local bar_y=1640
  local line_y=1638
  local loc_y=1660
  local wpn_y=1720
  local time_y=1760

  local t1
  t1=$(echo "scale=2; $start" | bc)
  local t2
  t2=$(echo "scale=2; $start + 0.2" | bc)
  local t3
  t3=$(echo "scale=2; $start + 0.4" | bc)
  local t4
  t4=$(echo "scale=2; $start + 0.6" | bc)

  local filters=""
  # Dark bar slides in (width animates from 0 to 1080)
  filters="drawbox=x=0:y=${bar_y}:w='if(lt(t,${t1}),0,if(lt(t,${t2}),1080*(t-${t1})/(${t2}-${t1}),1080))':h=280:color=${COLOR_BG}@0.85:t=fill:enable='gte(t,${t1})'"
  # Red accent line (appears after bar)
  filters="${filters},drawbox=x=0:y=${line_y}:w=1080:h=3:color=${COLOR_ACCENT}:t=fill:enable='gte(t,${t2})'"
  # Location slides up from below
  local loc_end
  loc_end=$(echo "scale=2; $t3 + 0.3" | bc)
  filters="${filters},drawtext=fontfile=${FONT_BOLD}:text='${location}':fontcolor=${COLOR_ACCENT}:fontsize=48:x=60:y='if(lt(t,${t3}),1920,if(lt(t,${loc_end}),1920-(1920-${loc_y})*((t-${t3})/0.3)*(2-(t-${t3})/0.3),${loc_y}))':enable='gte(t,${t3})'"

  if [ -n "$2" ]; then
    # Weapon fades in
    filters="${filters},drawtext=fontfile=${FONT_SEMIBOLD}:text='${weapon}':fontcolor=${COLOR_TEXT}:fontsize=28:x=60:y=${wpn_y}:alpha='if(lt(t,${t4}),0,min((t-${t4})/0.3,1))':enable='gte(t,${t4})'"
  fi

  if [ -n "$3" ]; then
    local t5
    t5=$(echo "scale=2; $start + 0.8" | bc)
    filters="${filters},drawtext=fontfile=${FONT_MONO}:text='${timestamp}':fontcolor=${COLOR_TEXT_SECONDARY}:fontsize=22:x=60:y=${time_y}:alpha='if(lt(t,${t5}),0,min((t-${t5})/0.3,1))':enable='gte(t,${t5})'"
  fi

  echo "$filters"
}

# ── Screen shake ───────────────────────────────────────────
# Oscillating crop offset with exponential decay
# Usage: screen_shake_filter <start> <duration> [intensity]
screen_shake_filter() {
  local start="$1"
  local dur="${2:-0.4}"
  local intensity="${3:-15}"
  local end
  end=$(echo "scale=2; $start + $dur" | bc)

  # Pad the frame by intensity pixels on all sides, then crop with oscillating offset
  echo "pad=w=1080+${intensity}*2:h=1920+${intensity}*2:x=${intensity}:y=${intensity}:color=black,crop=w=1080:h=1920:x='if(between(t,${start},${end}),${intensity}+${intensity}*sin(t*40)*exp(-(t-${start})*8),${intensity})':y='if(between(t,${start},${end}),${intensity}+${intensity}*cos(t*35)*exp(-(t-${start})*8),${intensity})'"
}

# ── Zoom punch ─────────────────────────────────────────────
# Quick 10% scale-up then return to normal
# Usage: zoom_punch_filter <start> [duration]
zoom_punch_filter() {
  local start="$1"
  local dur="${2:-0.25}"
  local end
  end=$(echo "scale=2; $start + $dur" | bc)

  # Scale up 10% then back via pad+crop
  local pad_extra=54  # 1080*0.05 rounded
  echo "pad=w=1080+${pad_extra}*2:h=1920+${pad_extra}*2:x=${pad_extra}:y=${pad_extra}:color=black,crop=w=1080:h=1920:x='if(between(t,${start},${end}),${pad_extra}-${pad_extra}*sin(PI*(t-${start})/${dur}),${pad_extra})':y='if(between(t,${start},${end}),${pad_extra}-${pad_extra}*sin(PI*(t-${start})/${dur}),${pad_extra})'"
}

# ── Glitch flash ───────────────────────────────────────────
# Brief RGB color shift effect
# Usage: glitch_flash_filter <start> [duration]
glitch_flash_filter() {
  local start="$1"
  local dur="${2:-0.1}"
  local end
  end=$(echo "scale=2; $start + $dur" | bc)

  echo "colorbalance=rs='if(between(t,${start},${end}),0.5,0)':gs='if(between(t,${start},${end}),-0.3,0)':bs='if(between(t,${start},${end}),0.3,0)',format=yuv420p"
}
