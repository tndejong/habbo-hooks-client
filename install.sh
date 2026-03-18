#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/claude/install.sh" "$@"
bash "${SCRIPT_DIR}/cursor/install.sh" "$@"
