# Habbo Agent Platform Hooks

Remote-first hook installer for both Claude Code and Cursor.

- Hook runner: `hooks/habbo-agent-platform-hook.sh`
- Relay runtime: `hooks/relay_hook.mjs`

## Folder layout

Global/shared hook runtime files stay in `hooks/`:

- `hooks/habbo-agent-platform-hook.sh`
- `hooks/relay_hook.mjs`
- `hooks/manage_hooks.mjs`

App-specific installer scripts are separated by domain:

- `hooks/claude/`
- `hooks/cursor/`
- `hooks/openclaw/` (reserved for upcoming support)

## Applications and event differences

You can install hooks for:

- Claude Code
- Cursor
- or both

The two apps use different hook config files and event names:

- Claude config: `~/.claude/settings.json` (`SessionStart`, `PreToolUse`, ...)
- Cursor config: `~/.cursor/hooks.json` (`sessionStart`, `preToolUse`, `beforeSubmitPrompt`, ...)

This project installs **native Cursor hooks** into `~/.cursor/hooks.json` and does not rely on Cursor third-party Claude-hook loading.

Installers are separated per app so mappings stay correct.

## Event mapping used by this project

Claude -> internal event:

- `SessionStart` -> `session_start`
- `SessionEnd` -> `session_end`
- `UserPromptSubmit` -> `user_prompt_submit`
- `PreToolUse` -> `pre_tool_use`
- `PostToolUse` -> `post_tool_use`
- `SubagentStart` -> `subagent_start`
- `SubagentStop` -> `subagent_stop`
- `Stop` -> `stop`

Cursor -> internal event:

- `sessionStart` -> `session_start`
- `sessionEnd` -> `session_end`
- `beforeSubmitPrompt` -> `user_prompt_submit`
- `preToolUse` -> `pre_tool_use`
- `postToolUse` -> `post_tool_use`
- `subagentStart` -> `subagent_start`
- `subagentStop` -> `subagent_stop`
- `stop` -> `stop`

## Install / status / uninstall

Install only Claude:

```bash
bash hooks/claude/install.sh
just hooks-install claude
```

Install only Cursor:

```bash
bash hooks/cursor/install.sh
just hooks-install cursor
```

Install both:

```bash
just hooks-install
```

Status:

```bash
just hooks-status
just hooks-status claude
just hooks-status cursor
```

Uninstall:

```bash
just hooks-uninstall
just hooks-uninstall claude
just hooks-uninstall cursor
```

Restart the relevant app after install/uninstall.

## Mode overview

### Recommended mode: remote (default)

- `HABBO_HOOK_TRANSPORT=remote` (default)
- relay posts events to `https://hotel-mcp.fixdev.nl/hooks/events`
- no local `habbo-mcp` runtime required

### Expert mode: local

- `HABBO_HOOK_TRANSPORT=local`
- relay runs local `habbo-mcp/src/hooks/habboAgentHook.ts`
- requires local repo + dependencies

### Fallback mode: auto

- `HABBO_HOOK_TRANSPORT=auto`
- tries remote first, then local

## Environment variables

Remote-first defaults:

```bash
HABBO_HOOK_TRANSPORT=remote
HABBO_HOOK_REMOTE_BASE_URL=https://hotel-mcp.fixdev.nl
HABBO_HOOK_REMOTE_TOKEN=<your-token>
```

Notes:

- `HABBO_HOOK_REMOTE_TOKEN` falls back to `MCP_API_KEY` when unset.
- `HABBO_HOOK_REMOTE_BASE_URL` falls back to `HABBO_HOOK_MCP_BASE_URL`.
- for local mode, `HABBO_HOOK_ENABLED=true` must be set in `habbo-mcp/.env`.

## Safety and behavior

- Installer is idempotent and safe to run multiple times.
- Existing non-habbo hooks are preserved.
- A timestamped backup is written before each settings change.
  - Claude: `~/.claude/settings.json`
  - Cursor: `~/.cursor/hooks.json`
