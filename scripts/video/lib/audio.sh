#!/usr/bin/env bash
# audio.sh — Sound synthesis, TTS voice, & mixing via FFmpeg + macOS say

source "$(dirname "${BASH_SOURCE[0]}")/brand.sh"

# ── Voice config ───────────────────────────────────────────
VOICE_NAME="Daniel"          # British male — authoritative military tone
VOICE_RATE=155               # Slower = more deliberate/commanding
VOICE_DIR="$SFX_DIR/voice"

# ── Impact hit — 0.15s bass punch for scene transitions ────
generate_impact_hit() {
  local output="${1:-$SFX_DIR/impact.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='(sin(60*2*PI*t)+0.6*sin(120*2*PI*t))*exp(-t*25)*0.8':s=44100:d=0.15" \
    "$output" 2>/dev/null
}

# ── Whoosh — 0.25s frequency sweep for cuts & text slides ──
generate_whoosh() {
  local output="${1:-$SFX_DIR/whoosh.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='sin((200+3000*t)*2*PI*t)*exp(-t*8)*(1-exp(-t*40))*0.5':s=44100:d=0.25" \
    "$output" 2>/dev/null
}

# ── Alert tone — 0.5s pulsing 880Hz ───────────────────────
generate_alert_tone() {
  local output="${1:-$SFX_DIR/alert.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='sin(880*2*PI*t)*(0.5+0.5*sin(12*PI*t))*exp(-t*3)*0.6':s=44100:d=0.5" \
    "$output" 2>/dev/null
}

# ── Emergency alarm — 1.5s EBS dual-tone (853+960Hz) ──────
# The authentic US Emergency Alert System attention signal
generate_alarm() {
  local output="${1:-$SFX_DIR/alarm.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='0.5*sin(2*PI*853*t)+0.5*sin(2*PI*960*t):s=44100:d=1.5'" \
    -af "afade=t=in:d=0.05,afade=t=out:st=1.3:d=0.2,volume=0.55" \
    "$output" 2>/dev/null
}

# ── Wailing siren — 3s rising/falling siren ───────────────
generate_siren() {
  local duration="${1:-3}"
  local output="${2:-$SFX_DIR/siren.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='(0.5*sin(2*PI*(500+250*sin(2*PI*0.5*t))*t)+0.3*sin(2*PI*(1000+500*sin(2*PI*0.5*t))*t)+0.15*sin(2*PI*(1500+750*sin(2*PI*0.5*t))*t))*(0.7+0.3*sin(2*PI*8*t)):s=44100:d=${duration}'" \
    -af "highpass=f=200,lowpass=f=3500,acompressor=threshold=-18dB:ratio=5:attack=3:release=40,afade=t=in:d=0.1,afade=t=out:st=$(echo "scale=1; $duration - 0.3" | bc):d=0.3,volume=0.45" \
    "$output" 2>/dev/null
}

# ── Tension drone — sustained dark atmosphere ──────────────
generate_tension_drone() {
  local duration="${1:-10}"
  local output="${2:-$SFX_DIR/drone.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='(sin(55*2*PI*t)+0.5*sin(82*2*PI*t)+0.3*sin(110*2*PI*t))*(0.7+0.3*sin(0.3*2*PI*t))*0.25':s=44100:d=${duration}" \
    "$output" 2>/dev/null
}

# ── Tick — 0.05s click ────────────────────────────────────
generate_tick() {
  local output="${1:-$SFX_DIR/tick.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='sin(1200*2*PI*t)*exp(-t*80)*0.4':s=44100:d=0.05" \
    "$output" 2>/dev/null
}

# ── Riser — 1.5s rising tone ──────────────────────────────
generate_riser() {
  local output="${1:-$SFX_DIR/riser.wav}"
  ffmpeg -y -f lavfi \
    -i "aevalsrc='sin((200+800*t/1.5)*2*PI*t)*(t/1.5)*0.4':s=44100:d=1.5" \
    "$output" 2>/dev/null
}

# ── Generate all SFX to sfx/ directory ─────────────────────
generate_all_sfx() {
  mkdir -p "$SFX_DIR" "$VOICE_DIR"
  echo "  Generating SFX..."
  generate_impact_hit "$SFX_DIR/impact.wav"
  echo "    impact.wav"
  generate_whoosh "$SFX_DIR/whoosh.wav"
  echo "    whoosh.wav"
  generate_alert_tone "$SFX_DIR/alert.wav"
  echo "    alert.wav"
  generate_alarm "$SFX_DIR/alarm.wav"
  echo "    alarm.wav"
  generate_siren 3 "$SFX_DIR/siren.wav"
  echo "    siren.wav"
  generate_tension_drone 30 "$SFX_DIR/drone.wav"
  echo "    drone.wav (30s)"
  generate_tick "$SFX_DIR/tick.wav"
  echo "    tick.wav"
  generate_riser "$SFX_DIR/riser.wav"
  echo "    riser.wav"
  echo "  SFX generation complete"
}

# ── TTS: Generate a voice line with broadcast processing ───
# Uses macOS `say` with Daniel voice + radio/broadcast EQ chain
# Usage: generate_voice <text> <output_wav> [rate]
generate_voice() {
  local text="$1"
  local output="$2"
  local rate="${3:-$VOICE_RATE}"

  if ! command -v say &>/dev/null; then
    echo "Warning: say command not found (macOS only)" >&2
    return 1
  fi

  local raw_wav
  raw_wav=$(mktemp /tmp/voice_raw_XXXXX.wav)

  # Generate TTS with Daniel voice
  say -v "$VOICE_NAME" -r "$rate" \
    --file-format=WAVE --data-format=LEI16@44100 \
    -o "$raw_wav" "$text" 2>/dev/null

  if [ ! -f "$raw_wav" ] || [ ! -s "$raw_wav" ]; then
    rm -f "$raw_wav"
    return 1
  fi

  # Broadcast/military radio processing chain:
  # - Bandpass 200-3800Hz (radio channel feel)
  # - Warm low-mids + presence boost + clarity
  # - Heavy compression (broadcast standard)
  # - Final level boost
  ffmpeg -y -i "$raw_wav" -af "\
    aresample=44100,\
    highpass=f=200,\
    lowpass=f=3800,\
    equalizer=f=250:t=q:w=1.5:g=3,\
    equalizer=f=1200:t=q:w=1:g=2,\
    equalizer=f=2800:t=q:w=2:g=5,\
    acompressor=threshold=-15dB:ratio=6:attack=3:release=80:makeup=4,\
    volume=1.4\
  " "$output" 2>/dev/null

  rm -f "$raw_wav"
}

# ── Generate voice lines for breaking template ─────────────
generate_breaking_voice() {
  local location="${1:-Target zone}"
  local weapon="${2:-}"

  mkdir -p "$VOICE_DIR"

  # Line 1: Opening (plays over BREAKING title)
  generate_voice "Breaking. [[slnc 300]] Strike confirmed." "$VOICE_DIR/breaking_open.wav" 145

  # Line 2: Location (plays over strike footage)
  if [ -n "$weapon" ]; then
    generate_voice "Target location, ${location}. [[slnc 200]] ${weapon} system deployed." "$VOICE_DIR/breaking_detail.wav" 150
  else
    generate_voice "Target location, ${location}. [[slnc 200]] Strike in progress." "$VOICE_DIR/breaking_detail.wav" 150
  fi

  # Line 3: CTA
  generate_voice "Strike map dot live. Real time tracking." "$VOICE_DIR/breaking_cta.wav" 160
}

# ── Generate voice lines for daily template ────────────────
generate_daily_voice() {
  local total="${1:-}"
  local recent24="${2:-}"

  mkdir -p "$VOICE_DIR"

  generate_voice "Strike map. [[slnc 200]] Daily summary." "$VOICE_DIR/daily_open.wav" 150

  if [ -n "$total" ] && [ "$total" != "--" ]; then
    generate_voice "${total} strikes tracked. Monitoring active." "$VOICE_DIR/daily_stats.wav" 155
  else
    generate_voice "Multiple strikes confirmed. Monitoring active." "$VOICE_DIR/daily_stats.wav" 155
  fi

  generate_voice "Strike map dot live for updates." "$VOICE_DIR/daily_cta.wav" 160
}

# ── Generate voice lines for weapons template ──────────────
generate_weapons_voice() {
  local weapon="${1:-Weapon system}"

  mkdir -p "$VOICE_DIR"

  generate_voice "Weapons report. [[slnc 200]] ${weapon}." "$VOICE_DIR/weapons_open.wav" 150
  generate_voice "System active. Tracking confirmed deployments." "$VOICE_DIR/weapons_stats.wav" 155
  generate_voice "Strike map dot live." "$VOICE_DIR/weapons_cta.wav" 160
}

# ── Generate voice lines for leadership template ───────────
generate_leadership_voice() {
  local leader="${1:-}"

  mkdir -p "$VOICE_DIR"

  if [ -n "$leader" ]; then
    local leader_name
    leader_name=$(echo "$leader" | sed 's/_/ /g')
    generate_voice "Leadership board update. [[slnc 300]] ${leader_name}. [[slnc 200]] Eliminated." "$VOICE_DIR/leader_open.wav" 145
  else
    generate_voice "Leadership board. [[slnc 200]] Status update." "$VOICE_DIR/leader_open.wav" 150
  fi

  generate_voice "Confirmed eliminations on the board." "$VOICE_DIR/leader_stats.wav" 155
  generate_voice "Strike map dot live." "$VOICE_DIR/leader_cta.wav" 160
}

# ── Generate voice lines for weekly template ───────────────
generate_weekly_voice() {
  local strikes="${1:-}"

  mkdir -p "$VOICE_DIR"

  generate_voice "Strike map. [[slnc 200]] Weekly recap." "$VOICE_DIR/weekly_open.wav" 150

  if [ -n "$strikes" ] && [ "$strikes" != "--" ]; then
    generate_voice "${strikes} strikes this week. Full breakdown follows." "$VOICE_DIR/weekly_stats.wav" 155
  else
    generate_voice "Full breakdown follows." "$VOICE_DIR/weekly_stats.wav" 155
  fi

  generate_voice "Strike map dot live for real time intelligence." "$VOICE_DIR/weekly_cta.wav" 160
}

# ── Full audio mix: drone + alarm + voice + SFX ────────────
# Usage: full_audio_mix <silent_video> <output> <template_type> [voice_timing_args...]
# This is the main function compose scripts call for the final mix.
# It layers: drone bed → alarm (if breaking) → voice lines → SFX hits
full_audio_mix() {
  local video="$1"
  local output="$2"
  local template="$3"
  shift 3

  local sfx_specs=("$@")
  local tmpdir
  tmpdir=$(mktemp -d)

  # Step 1: Add drone bed
  local with_drone="$tmpdir/01_drone.mp4"
  add_drone_audio "$video" "$with_drone" 0.2

  if [ ! -f "$with_drone" ]; then
    cp "$video" "$output"
    rm -rf "$tmpdir"
    return 0
  fi

  # Step 2: Layer alarm at the start for breaking videos
  local with_alarm="$tmpdir/02_alarm.mp4"
  if [ "$template" = "breaking" ] && [ -f "$SFX_DIR/alarm.wav" ]; then
    layer_sfx "$with_drone" "$with_alarm" "alarm:0:0.7" "siren:200:0.2"
    if [ ! -f "$with_alarm" ]; then
      with_alarm="$with_drone"
    fi
  else
    with_alarm="$with_drone"
  fi

  # Step 3: Layer voice lines at calculated timestamps
  local with_voice="$tmpdir/03_voice.mp4"
  local voice_added=false

  case "$template" in
    breaking)
      if [ -f "$VOICE_DIR/breaking_open.wav" ] && [ -f "$VOICE_DIR/breaking_detail.wav" ] && [ -f "$VOICE_DIR/breaking_cta.wav" ]; then
        # Get scene durations for timing
        local s1_dur s2_dur s3_dur s4_dur
        s1_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../01_intro.mp4" 2>/dev/null || echo "1.5")
        s2_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../02_strike.mp4" 2>/dev/null || echo "4")
        s3_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../03_map.mp4" 2>/dev/null || echo "3")
        # Voice timing: open at 0.3s, detail at scene2+0.5s, CTA at last scene
        local ms_open=300
        local ms_detail=$(echo "scale=0; ($s1_dur + 0.5) * 1000" | bc | cut -d. -f1)
        local ms_cta=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 0.3) * 1000" | bc | cut -d. -f1)

        layer_sfx "$with_alarm" "$with_voice" \
          "voice/breaking_open:${ms_open}:1.0" \
          "voice/breaking_detail:${ms_detail}:1.0" \
          "voice/breaking_cta:${ms_cta}:0.9"
        voice_added=true
      fi
      ;;
    daily)
      if [ -f "$VOICE_DIR/daily_open.wav" ] && [ -f "$VOICE_DIR/daily_stats.wav" ] && [ -f "$VOICE_DIR/daily_cta.wav" ]; then
        local s1_dur s2_dur s3_dur
        s1_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../01_intro.mp4" 2>/dev/null || echo "1.5")
        s2_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../02_montage.mp4" 2>/dev/null || echo "8")
        s3_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../03_map.mp4" 2>/dev/null || echo "4")
        local ms_open=200
        local ms_stats=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 0.3) * 1000" | bc | cut -d. -f1)
        local ms_cta=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 4 + 0.3) * 1000" | bc | cut -d. -f1)

        layer_sfx "$with_alarm" "$with_voice" \
          "voice/daily_open:${ms_open}:1.0" \
          "voice/daily_stats:${ms_stats}:1.0" \
          "voice/daily_cta:${ms_cta}:0.9"
        voice_added=true
      fi
      ;;
    weapons)
      if [ -f "$VOICE_DIR/weapons_open.wav" ]; then
        local s1_dur s2_dur
        s1_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../01_title.mp4" 2>/dev/null || echo "1.5")
        s2_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../02_footage.mp4" 2>/dev/null || echo "5")
        local ms_open=200
        local ms_stats=$(echo "scale=0; ($s1_dur + $s2_dur + 0.3) * 1000" | bc | cut -d. -f1)
        local ms_cta=$(echo "scale=0; ($s1_dur + $s2_dur + 4 + 0.3) * 1000" | bc | cut -d. -f1)

        layer_sfx "$with_alarm" "$with_voice" \
          "voice/weapons_open:${ms_open}:1.0" \
          "voice/weapons_stats:${ms_stats}:1.0" \
          "voice/weapons_cta:${ms_cta}:0.9"
        voice_added=true
      fi
      ;;
    leadership)
      if [ -f "$VOICE_DIR/leader_open.wav" ]; then
        local s1_dur s2_dur s3_dur
        s1_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../01_title.mp4" 2>/dev/null || echo "1.5")
        s2_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../02_portrait.mp4" 2>/dev/null || echo "4")
        s3_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../03_board.mp4" 2>/dev/null || echo "4")
        local ms_open=200
        local ms_stats=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 0.3) * 1000" | bc | cut -d. -f1)
        local ms_cta=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 4 + 0.3) * 1000" | bc | cut -d. -f1)

        layer_sfx "$with_alarm" "$with_voice" \
          "voice/leader_open:${ms_open}:1.0" \
          "voice/leader_stats:${ms_stats}:1.0" \
          "voice/leader_cta:${ms_cta}:0.9"
        voice_added=true
      fi
      ;;
    weekly)
      if [ -f "$VOICE_DIR/weekly_open.wav" ]; then
        local s1_dur s2_dur s3_dur s4_dur s5_dur s6_dur
        s1_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../01_title.mp4" 2>/dev/null || echo "1.5")
        s2_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../02_montage.mp4" 2>/dev/null || echo "10")
        s3_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../03_map.mp4" 2>/dev/null || echo "4")
        s4_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmpdir/../04_stats.mp4" 2>/dev/null || echo "4")
        local ms_open=200
        local ms_stats=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + 0.3) * 1000" | bc | cut -d. -f1)
        local ms_cta=$(echo "scale=0; ($s1_dur + $s2_dur + $s3_dur + $s4_dur + 4 + 4 + 0.3) * 1000" | bc | cut -d. -f1)

        layer_sfx "$with_alarm" "$with_voice" \
          "voice/weekly_open:${ms_open}:1.0" \
          "voice/weekly_stats:${ms_stats}:1.0" \
          "voice/weekly_cta:${ms_cta}:0.9"
        voice_added=true
      fi
      ;;
  esac

  if [ "$voice_added" != "true" ] || [ ! -f "$with_voice" ]; then
    with_voice="$with_alarm"
  fi

  # Step 4: Layer SFX hits (impacts, whooshes) on top
  if [ ${#sfx_specs[@]} -gt 0 ]; then
    local with_sfx="$tmpdir/04_sfx.mp4"
    layer_sfx "$with_voice" "$with_sfx" "${sfx_specs[@]}"
    if [ -f "$with_sfx" ]; then
      cp "$with_sfx" "$output"
    else
      cp "$with_voice" "$output"
    fi
  else
    cp "$with_voice" "$output"
  fi

  rm -rf "$tmpdir"
}

# ── Simpler: add a single looping drone under a video ──────
add_drone_audio() {
  local video="$1"
  local output="$2"
  local volume="${3:-0.3}"

  local drone="$SFX_DIR/drone.wav"
  if [ ! -f "$drone" ]; then
    cp "$video" "$output"
    return 0
  fi

  ffmpeg -y -i "$video" -stream_loop -1 -i "$drone" \
    -filter_complex "[1:a]volume=${volume}[a]" \
    -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 128k -shortest \
    "$output" 2>/dev/null
}

# ── Layer SFX at specific timestamps on top of existing audio
# Usage: layer_sfx <video_with_audio> <output> "sfx_name:start_ms:volume" ...
# sfx_name is path relative to SFX_DIR (without .wav)
layer_sfx() {
  local video="$1"
  local output="$2"
  shift 2

  local sfx_specs=("$@")
  local count=${#sfx_specs[@]}

  if [ "$count" -eq 0 ]; then
    cp "$video" "$output"
    return 0
  fi

  local cmd_inputs="-i \"$video\""
  local filter=""
  local idx=1

  for spec in "${sfx_specs[@]}"; do
    IFS=':' read -r sfx_name start_ms vol <<< "$spec"
    local sfx_file="$SFX_DIR/${sfx_name}.wav"
    if [ ! -f "$sfx_file" ]; then
      continue
    fi
    cmd_inputs="$cmd_inputs -i \"$sfx_file\""
    filter="${filter}[${idx}:a]adelay=${start_ms}|${start_ms},volume=${vol}[s${idx}];"
    idx=$((idx + 1))
  done

  local actual=$((idx - 1))
  if [ "$actual" -eq 0 ]; then
    cp "$video" "$output"
    return 0
  fi

  local mix_inputs="[0:a]"
  for ((i = 1; i <= actual; i++)); do
    mix_inputs="${mix_inputs}[s${i}]"
  done
  filter="${filter}${mix_inputs}amix=inputs=$((actual + 1)):normalize=0[aout]"

  eval ffmpeg -y $cmd_inputs \
    -filter_complex "'${filter}'" \
    -map 0:v -map "'[aout]'" \
    -c:v copy -c:a aac -b:a 128k -shortest \
    "'$output'" 2>/dev/null
}
