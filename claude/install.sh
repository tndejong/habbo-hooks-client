#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${HOOKS_DIR}/.." && pwd)"

node "${HOOKS_DIR}/manage_hooks.mjs" install --target=claude --repo-root="${REPO_ROOT}" "$@"
