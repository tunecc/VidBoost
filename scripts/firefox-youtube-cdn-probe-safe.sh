#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROBE="$ROOT/outputs/runtime/vibe-sessions/20260324-firefox-phase3-runtime-validation/firefox_youtube_cdn_probe.py"
DEFAULT_VENV_PYTHON="$ROOT/outputs/runtime/vibe-sessions/20260324-firefox-phase3-runtime-validation/selenium-venv/bin/python"
PYTHON_BIN="${VIDBOOST_FIREFOX_PROBE_PYTHON:-}"
PROBE_PID=""
RUN_BUILD="1"

kill_descendants() {
  local pid="$1"
  local child

  while IFS= read -r child; do
    [[ -n "$child" ]] || continue
    kill_descendants "$child"
  done < <(pgrep -P "$pid" || true)

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${PROBE_PID:-}" ]]; then
    kill_descendants "$PROBE_PID"
    wait "$PROBE_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "${1:-}" == "--probe-only" ]]; then
  RUN_BUILD="0"
fi

if [[ -z "$PYTHON_BIN" && -x "$DEFAULT_VENV_PYTHON" ]]; then
  PYTHON_BIN="$DEFAULT_VENV_PYTHON"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

cd "$ROOT"
if [[ "$RUN_BUILD" == "1" ]]; then
  NODE_OPTIONS=--max-old-space-size=512 npm run build:firefox
fi

"$PYTHON_BIN" "$PROBE" &
PROBE_PID="$!"
wait "$PROBE_PID"
PROBE_PID=""
