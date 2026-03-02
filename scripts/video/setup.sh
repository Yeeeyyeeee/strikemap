#!/usr/bin/env bash
# setup.sh — One-time setup: downloads fonts, checks deps, installs Puppeteer
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"

echo "=== StrikeMap Video Pipeline Setup ==="
echo ""

# ── Check FFmpeg ─────────────────────────────────────────────
echo "[1/5] Checking FFmpeg..."
if command -v ffmpeg &>/dev/null; then
  FFMPEG_VERSION=$(ffmpeg -version | head -1)
  echo "  OK: $FFMPEG_VERSION"
else
  echo "  ERROR: FFmpeg not found. Install with: brew install ffmpeg"
  exit 1
fi

# Check for required FFmpeg features
FFMPEG_FILTERS_CHECK=$(ffmpeg -filters 2>&1 || true)
if echo "$FFMPEG_FILTERS_CHECK" | grep -q "zoompan"; then
  echo "  OK: zoompan filter available"
else
  echo "  WARNING: zoompan filter not found, Ken Burns effects may not work"
fi

if echo "$FFMPEG_FILTERS_CHECK" | grep -q "xfade"; then
  echo "  OK: xfade filter available"
else
  echo "  WARNING: xfade filter not found, dissolve transitions may not work"
fi

# ── Check ffprobe ────────────────────────────────────────────
echo ""
echo "[2/5] Checking ffprobe..."
if command -v ffprobe &>/dev/null; then
  echo "  OK: ffprobe found"
else
  echo "  ERROR: ffprobe not found (should come with FFmpeg)"
  exit 1
fi

# ── Download fonts ───────────────────────────────────────────
echo ""
echo "[3/5] Downloading fonts..."
mkdir -p "$FONTS_DIR"

download_font() {
  local url="$1"
  local dest="$2"
  if [ -f "$dest" ]; then
    echo "  SKIP: $(basename "$dest") already exists"
    return 0
  fi
  echo "  Downloading $(basename "$dest")..."
  curl -sL "$url" -o "$dest"
  if [ -f "$dest" ] && [ -s "$dest" ]; then
    echo "  OK: $(basename "$dest")"
  else
    echo "  ERROR: Failed to download $(basename "$dest")"
    rm -f "$dest"
    return 1
  fi
}

# Inter font family (Google Fonts)
INTER_BASE="https://github.com/rsms/inter/raw/master/docs/font-files"
download_font "${INTER_BASE}/Inter-Bold.ttf" "$FONTS_DIR/Inter-Bold.ttf" || \
  download_font "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf" "$FONTS_DIR/Inter-Bold.ttf"

download_font "${INTER_BASE}/Inter-SemiBold.ttf" "$FONTS_DIR/Inter-SemiBold.ttf" || true
download_font "${INTER_BASE}/Inter-Regular.ttf" "$FONTS_DIR/Inter-Regular.ttf" || true

# JetBrains Mono (GitHub releases)
JBM_VERSION="2.304"
JBM_BASE="https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf"
download_font "${JBM_BASE}/JetBrainsMono-Bold.ttf" "$FONTS_DIR/JetBrainsMono-Bold.ttf" || true

# Verify fonts - try alternative sources if primary failed
for font_file in Inter-Bold.ttf Inter-SemiBold.ttf Inter-Regular.ttf JetBrainsMono-Bold.ttf; do
  if [ ! -f "$FONTS_DIR/$font_file" ] || [ ! -s "$FONTS_DIR/$font_file" ]; then
    echo "  Trying alternative source for $font_file..."
    case "$font_file" in
      Inter-*)
        # Try fontsource CDN
        weight=""
        case "$font_file" in
          *Bold*) weight="700" ;;
          *SemiBold*) weight="600" ;;
          *Regular*) weight="400" ;;
        esac
        curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${weight}-normal.ttf" \
          -o "$FONTS_DIR/$font_file" 2>/dev/null || true
        ;;
      JetBrainsMono-*)
        curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.ttf" \
          -o "$FONTS_DIR/$font_file" 2>/dev/null || true
        ;;
    esac
  fi
done

# Final font check
FONTS_OK=true
for font_file in Inter-Bold.ttf Inter-SemiBold.ttf Inter-Regular.ttf JetBrainsMono-Bold.ttf; do
  if [ ! -f "$FONTS_DIR/$font_file" ] || [ ! -s "$FONTS_DIR/$font_file" ]; then
    echo "  WARNING: $font_file not available - text overlays may fail"
    FONTS_OK=false
  fi
done
if [ "$FONTS_OK" = true ]; then
  echo "  All fonts downloaded successfully"
fi

# ── Generate SFX ──────────────────────────────────────────
echo ""
echo "[4/5] Generating sound effects..."
source "$SCRIPT_DIR/lib/audio.sh"

# Check for aevalsrc support
FFMPEG_FILTERS=$(ffmpeg -filters 2>&1 || true)
if echo "$FFMPEG_FILTERS" | grep -q "aevalsrc"; then
  echo "  OK: aevalsrc source available"
  generate_all_sfx
else
  echo "  WARNING: aevalsrc not found, audio features will be disabled"
fi

# Check for amix support
if echo "$FFMPEG_FILTERS" | grep -q "amix"; then
  echo "  OK: amix filter available"
else
  echo "  WARNING: amix filter not found, audio mixing may not work"
fi

# ── Install Puppeteer ────────────────────────────────────────
echo ""
echo "[5/5] Setting up Puppeteer for dashboard captures..."
cd "$PROJECT_ROOT"
if node -e "require('puppeteer')" 2>/dev/null; then
  echo "  SKIP: Puppeteer already installed"
else
  echo "  Installing puppeteer..."
  npm install --save-dev puppeteer
  echo "  OK: Puppeteer installed"
fi

# ── Create directories ──────────────────────────────────────
echo ""
echo "Creating output directories..."
mkdir -p "$FRAMES_DIR" "$MEDIA_DIR" "$OUTPUT_DIR"
for tmpl in daily breaking leadership weapons weekly; do
  mkdir -p "$OUTPUT_DIR/$tmpl"
done
echo "  OK: Directories created"

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Directory structure:"
echo "  Fonts:   $FONTS_DIR"
echo "  Frames:  $FRAMES_DIR"
echo "  Media:   $MEDIA_DIR"
echo "  Output:  $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Start the dev server: npm run dev"
echo "  2. Generate a video:     bash scripts/video/make-video.sh daily --capture"
