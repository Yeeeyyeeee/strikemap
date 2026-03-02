#!/usr/bin/env bash
# make-video.sh — Master CLI orchestrator for StrikeMap video pipeline
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/brand.sh"

# ── Usage ────────────────────────────────────────────────────
usage() {
  cat <<EOF
StrikeMap Video Pipeline

Usage:
  bash make-video.sh <template> [options]

Templates:
  daily        Daily strike summary (~25s)
  breaking     Breaking strike alert (~20s)
  leadership   Leader spotlight/elimination (~25s)
  weapons      Weapon system showcase (~18s)
  weekly       Weekly recap (~55s)

Options:
  --capture          Capture dashboard screenshots first
  --download [N]     Download N strike videos (default: 5)
  --location TEXT    Location name (breaking template)
  --weapon TEXT      Weapon name (breaking/weapons template)
  --leader SLUG     Leader slug (leadership template)
  --incident-id ID  Specific incident ID
  --no-capture      Skip capture even with --capture
  --help             Show this help

Examples:
  bash make-video.sh daily --capture
  bash make-video.sh breaking --capture --location "Tehran" --weapon "JDAM"
  bash make-video.sh leadership --leader nasrallah --capture
  bash make-video.sh weapons --weapon "Fateh-110" --capture
  bash make-video.sh weekly --capture
EOF
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────
TEMPLATE=""
DO_CAPTURE=false
DO_DOWNLOAD=true
DOWNLOAD_COUNT=5
LOCATION=""
WEAPON=""
LEADER=""
INCIDENT_ID=""
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    daily|breaking|leadership|weapons|weekly)
      TEMPLATE="$1"; shift ;;
    --capture)
      DO_CAPTURE=true; shift ;;
    --no-capture)
      DO_CAPTURE=false; shift ;;
    --download)
      DO_DOWNLOAD=true
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        DOWNLOAD_COUNT="$2"; shift
      fi
      shift ;;
    --location)
      LOCATION="$2"; shift 2 ;;
    --weapon)
      WEAPON="$2"; shift 2 ;;
    --leader)
      LEADER="$2"; shift 2 ;;
    --incident-id)
      INCIDENT_ID="$2"; shift 2 ;;
    --help|-h)
      usage ;;
    *)
      PASSTHROUGH_ARGS+=("$1"); shift ;;
  esac
done

if [ -z "$TEMPLATE" ]; then
  echo "Error: No template specified."
  echo ""
  usage
fi

echo "╔══════════════════════════════════════════╗"
echo "║  StrikeMap Video Pipeline                ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Template:  $TEMPLATE"
echo "  Capture:   $DO_CAPTURE"
echo "  Download:  $DO_DOWNLOAD (count: $DOWNLOAD_COUNT)"
[ -n "$LOCATION" ] && echo "  Location:  $LOCATION"
[ -n "$WEAPON" ] && echo "  Weapon:    $WEAPON"
[ -n "$LEADER" ] && echo "  Leader:    $LEADER"
[ -n "$INCIDENT_ID" ] && echo "  Incident:  $INCIDENT_ID"
echo ""

# ── Step 1: Download media ──────────────────────────────────
if [ "$DO_DOWNLOAD" = true ]; then
  echo "── Downloading strike media ──"
  DOWNLOAD_ARGS="media --count $DOWNLOAD_COUNT"
  [ -n "$INCIDENT_ID" ] && DOWNLOAD_ARGS="media --incident-id $INCIDENT_ID"

  if ! node "$SCRIPT_DIR/data-helper.mjs" $DOWNLOAD_ARGS; then
    echo "  Warning: Media download failed, continuing without media..."
  fi

  # Also export stats
  node "$SCRIPT_DIR/data-helper.mjs" stats 2>/dev/null || true
  echo ""
fi

# ── Step 2: Capture dashboard screenshots ────────────────────
if [ "$DO_CAPTURE" = true ]; then
  echo "── Capturing dashboard ──"

  case "$TEMPLATE" in
    leadership)
      if [ -n "$LEADER" ]; then
        node "$SCRIPT_DIR/capture.mjs" leader "$LEADER" || echo "  Warning: Leader capture failed"
      fi
      node "$SCRIPT_DIR/capture.mjs" all || echo "  Warning: Dashboard capture failed"
      ;;
    *)
      node "$SCRIPT_DIR/capture.mjs" all || echo "  Warning: Dashboard capture failed"
      ;;
  esac
  echo ""
fi

# ── Step 3: Compose video ───────────────────────────────────
echo "── Composing video ──"

# Build compose command arguments
COMPOSE_ARGS=()
[ -n "$LOCATION" ] && COMPOSE_ARGS+=(--location "$LOCATION")
[ -n "$WEAPON" ] && COMPOSE_ARGS+=(--weapon "$WEAPON")
[ -n "$LEADER" ] && COMPOSE_ARGS+=(--leader "$LEADER")
[ -n "$INCIDENT_ID" ] && COMPOSE_ARGS+=(--incident-id "$INCIDENT_ID")

# Export for compose scripts that read from env
export LOCATION WEAPON LEADER INCIDENT_ID

case "$TEMPLATE" in
  daily)
    bash "$SCRIPT_DIR/compose-daily.sh" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
    ;;
  breaking)
    bash "$SCRIPT_DIR/compose-breaking.sh" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
    ;;
  leadership)
    bash "$SCRIPT_DIR/compose-leadership.sh" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
    ;;
  weapons)
    bash "$SCRIPT_DIR/compose-weapons.sh" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
    ;;
  weekly)
    bash "$SCRIPT_DIR/compose-weekly.sh" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
    ;;
esac

echo ""
echo "Done!"
