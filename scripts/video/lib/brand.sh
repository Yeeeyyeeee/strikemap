#!/usr/bin/env bash
# brand.sh — Shared constants: colors, fonts, paths, dimensions

# ── Directories ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FONTS_DIR="$SCRIPT_DIR/fonts"
FRAMES_DIR="$SCRIPT_DIR/frames"
MEDIA_DIR="$FRAMES_DIR/media"
OUTPUT_DIR="$SCRIPT_DIR/output"

# ── Video dimensions (vertical 9:16) ────────────────────────
WIDTH=1080
HEIGHT=1920
FPS=30

# ── Brand colors (hex without #) ────────────────────────────
COLOR_BG="0x0a0a0a"
COLOR_BG_SECONDARY="0x111111"
COLOR_PANEL="0x1a1a1a"
COLOR_BORDER="0x2a2a2a"
COLOR_TEXT="0xe5e5e5"
COLOR_TEXT_SECONDARY="0x999999"
COLOR_ACCENT="0xef4444"
COLOR_ACCENT_ORANGE="0xf97316"
COLOR_WHITE="0xffffff"

# Same colors as CSS-style hex (for drawtext fontcolor)
HEX_BG="#0a0a0a"
HEX_TEXT="#e5e5e5"
HEX_TEXT_SECONDARY="#999999"
HEX_ACCENT="#ef4444"
HEX_ACCENT_ORANGE="#f97316"

# ── Font paths ───────────────────────────────────────────────
FONT_BOLD="$FONTS_DIR/Inter-Bold.ttf"
FONT_SEMIBOLD="$FONTS_DIR/Inter-SemiBold.ttf"
FONT_REGULAR="$FONTS_DIR/Inter-Regular.ttf"
FONT_MONO="$FONTS_DIR/JetBrainsMono-Bold.ttf"

# ── Assets ───────────────────────────────────────────────────
LOGO="$PROJECT_ROOT/public/icon.png"
SFX_DIR="$SCRIPT_DIR/sfx"

# ── Encoding defaults ───────────────────────────────────────
# Silent: for intermediate clips (no audio stream)
ENCODE_OPTS_SILENT="-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -an"
# With audio: for final outputs that have been mixed
ENCODE_OPTS="-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k"

# ── Pacing constants (seconds) ─────────────────────────────
HOOK_DURATION=1.5
SCENE_SHORT=3
SCENE_MEDIUM=4
SCENE_LONG=5
CTA_DURATION=2.5

# ── Helper: generate solid color background ──────────────────
generate_bg() {
  local duration="${1:-5}"
  local output="${2:-$FRAMES_DIR/bg.mp4}"
  ffmpeg -y -f lavfi \
    -i "color=c=0x0a0a0a:s=${WIDTH}x${HEIGHT}:d=${duration}:r=${FPS}" \
    $ENCODE_OPTS_SILENT "$output" 2>/dev/null
  echo "$output"
}

# ── Helper: ensure output directory exists ───────────────────
ensure_output_dir() {
  local template="$1"
  local dir="$OUTPUT_DIR/$template"
  mkdir -p "$dir"
  echo "$dir"
}

# ── Helper: timestamp for filenames ──────────────────────────
video_timestamp() {
  date +"%Y%m%d_%H%M%S"
}
