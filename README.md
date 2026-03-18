# Habbo Agent Platform Hooks

Remote-first hook installer for both Claude Code and Cursor.

This repo is the fast path: install hooks, set your token, and start showing your own agents/subagents in the hosted retro hotel.

- Hook runner: `habbo-agent-platform-hook.sh`
- Relay runtime: `relay_hook.mjs`

## Quickstart (Hosted Fast Path)

Build and show your own agents/subagents in the hosted retro hotel quickly:

1. Register at [https://hotel-portal.fixdev.nl](https://hotel-portal.fixdev.nl)
2. Request Pro tier and copy your MCP token
3. Clone this repo and run one installer command

```bash
git clone https://github.com/tndejong/habbo-hooks-client.git
cd habbo-hooks-client

# set once in your shell session
export HABBO_HOOK_TRANSPORT=remote
export MCP_API_KEY="<your-pro-token>"

# Claude hooks
bash ./claude/install.sh

# Cursor hooks
bash ./cursor/install.sh
```

Done. Hooks now post events to the hosted MCP endpoint so your agent behavior can show in-hotel without running the full stack locally.

## MCP connection snippet (required)

You also need to connect your IDE to the hosted MCP server.

Cursor (paste into `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "hotel-mcp": {
      "url": "https://hotel-mcp.fixdev.nl/mcp",
      "headers": {
        "Authorization": "Bearer <your-pro-token>"
      }
    }
  }
}
```

Claude Code:

- Open Claude Code and run `/mcp`
- Add an HTTP MCP server with:
  - Name: `hotel-mcp`
  - URL: `https://hotel-mcp.fixdev.nl/mcp`
  - Header: `Authorization: Bearer <your-pro-token>`

## Folder layout

Global/shared hook runtime files:

- `habbo-agent-platform-hook.sh`
- `relay_hook.mjs`
- `manage_hooks.mjs`

App-specific installer scripts are separated by domain:

- `claude/`
- `cursor/`
- `openclaw/` (reserved for upcoming support)

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
bash ./claude/install.sh
```

Install only Cursor:

```bash
bash ./cursor/install.sh
```

Install both:

```bash
bash ./install.sh
```

Status:

```bash
bash ./status.sh
```

Uninstall:

```bash
bash ./uninstall.sh
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
MCP_API_KEY=<your-token>
```

Notes:

- `MCP_API_KEY` is used as the bearer token for hosted hook events.
- `HABBO_HOOK_REMOTE_TOKEN` is optional and only needed if you want a separate hook token override.
- `HABBO_HOOK_REMOTE_BASE_URL` falls back to `HABBO_HOOK_MCP_BASE_URL`.
- Ensure token env vars are available to your IDE process (set in your shell profile and restart the IDE).
- for local mode, `HABBO_HOOK_ENABLED=true` must be set in `habbo-mcp/.env`.

## Safety and behavior

- Installer is idempotent and safe to run multiple times.
- Existing non-habbo hooks are preserved.
- A timestamped backup is written before each settings change.
  - Claude: `~/.claude/settings.json`
  - Cursor: `~/.cursor/hooks.json`
