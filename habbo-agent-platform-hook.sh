#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_SCRIPT="${SCRIPT_DIR}/relay_hook.mjs"

if [[ ! -f "${RELAY_SCRIPT}" ]]; then
  echo "[habbo-agent-platform-hook] missing relay script: ${RELAY_SCRIPT}" >&2
  exit 1
fi

exec node "${RELAY_SCRIPT}" "$@"
