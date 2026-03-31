#!/usr/bin/env bash
set -euo pipefail

PATTERN='firefox_youtube_cdn_probe.py|firefox-youtube-cdn-probe-safe.sh|geckodriver|/Applications/Firefox.app/Contents/MacOS/firefox .*--marionette'

collect_pids() {
  ps -axo pid=,command= 2>/dev/null \
    | rg "$PATTERN" \
    | rg -v 'rg ' \
    | awk '{print $1}'
}

PIDS="$(collect_pids || true)"

if [[ -z "${PIDS//[$'\n\r\t ']}" ]]; then
  echo "[firefox-probe-cleanup] no probe processes found"
  exit 0
fi

echo "[firefox-probe-cleanup] terminating:"
printf '  %s\n' $PIDS
kill $PIDS 2>/dev/null || true
sleep 1

REMAINING="$(collect_pids || true)"
if [[ -n "${REMAINING//[$'\n\r\t ']}" ]]; then
  echo "[firefox-probe-cleanup] force killing remaining:"
  printf '  %s\n' $REMAINING
  kill -9 $REMAINING 2>/dev/null || true
fi

echo "[firefox-probe-cleanup] done"
