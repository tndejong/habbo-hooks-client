#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REMOTE_BASE_URL = 'https://hotel-mcp.fixdev.nl';
const SUPPORTED_EVENTS = new Set([
  'session_start',
  'session_end',
  'user_prompt_submit',
  'pre_tool_use',
  'post_tool_use',
  'subagent_start',
  'subagent_stop',
  'stop',
]);
const DEFAULT_MAX_RUNTIME_MS = 5000;

function normalizeEvent(raw) {
  const event = (raw || '').trim().toLowerCase();
  return SUPPORTED_EVENTS.has(event) ? event : null;
}

function normalizeTransport(raw) {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'local' || value === 'auto' || value === 'remote') {
    return value;
  }
  return 'remote';
}

function normalizeRemoteEndpoint(raw) {
  const value = (raw || '').trim() || DEFAULT_REMOTE_BASE_URL;
  return `${value.replace(/\/+$/, '')}/hooks/events`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function postRemote(event, rawPayload) {
  const endpoint = normalizeRemoteEndpoint(process.env.HABBO_HOOK_REMOTE_BASE_URL || process.env.HABBO_HOOK_MCP_BASE_URL);
  const headers = {
    'content-type': 'application/json',
  };

  const token = (process.env.HABBO_HOOK_REMOTE_TOKEN || process.env.MCP_API_KEY || '').trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const body = {
    event_type: event,
    timestamp: new Date().toISOString(),
    source: 'claude-hook',
    raw_payload: rawPayload,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Remote hook endpoint failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

function runLocal(event, rawPayload) {
  return new Promise((resolve, reject) => {
    const thisFile = fileURLToPath(import.meta.url);
    const hooksDir = path.dirname(thisFile);
    const repoRoot = path.resolve(hooksDir, '..');
    const hookTs = path.resolve(repoRoot, 'habbo-mcp/src/hooks/habboAgentHook.ts');
    const tsxBin = path.resolve(repoRoot, 'habbo-mcp/node_modules/.bin/tsx');

    if (!fs.existsSync(tsxBin)) {
      reject(
        new Error(
          'Local hook mode requires habbo-mcp dependencies. Run: cd habbo-mcp && npm install (or use HABBO_HOOK_TRANSPORT=remote).'
        )
      );
      return;
    }

    const child = spawn(tsxBin, [hookTs, event], {
      cwd: repoRoot,
      stdio: ['pipe', 'ignore', 'pipe'],
      env: process.env,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Local hook failed (exit ${code}): ${stderr.slice(0, 300)}`));
      }
    });

    child.stdin.end(rawPayload);
  });
}

async function main() {
  const maxRuntimeMs = Number.parseInt(process.env.HABBO_HOOK_MAX_RUNTIME_MS || `${DEFAULT_MAX_RUNTIME_MS}`, 10);
  const watchdog = setTimeout(() => process.exit(0), Number.isFinite(maxRuntimeMs) ? maxRuntimeMs : DEFAULT_MAX_RUNTIME_MS);
  const event = normalizeEvent(process.argv[2]);
  if (!event) {
    clearTimeout(watchdog);
    process.exit(0);
  }

  const transport = normalizeTransport(process.env.HABBO_HOOK_TRANSPORT);
  const payload = await readStdin();

  if (transport === 'remote') {
    await postRemote(event, payload);
    clearTimeout(watchdog);
    process.exit(0);
  }

  if (transport === 'local') {
    await runLocal(event, payload);
    clearTimeout(watchdog);
    process.exit(0);
  }

  try {
    await postRemote(event, payload);
  } catch {
    await runLocal(event, payload);
  }
  clearTimeout(watchdog);
}

main().catch((err) => {
  // Hooks should stay non-blocking to avoid interrupting Claude workflows.
  if (process.env.HABBO_HOOK_DEBUG === '1' || process.env.HABBO_HOOK_DEBUG === 'true') {
    console.error('[habbo-agent-platform-hook]', err instanceof Error ? err.message : String(err));
  }
  process.exit(0);
});
