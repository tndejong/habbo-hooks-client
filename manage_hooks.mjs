#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAUDE_EVENTS = [
  { configName: 'SessionStart', arg: 'session_start', matcher: false },
  { configName: 'SessionEnd', arg: 'session_end', matcher: false },
  { configName: 'UserPromptSubmit', arg: 'user_prompt_submit', matcher: false },
  { configName: 'PreToolUse', arg: 'pre_tool_use', matcher: true },
  { configName: 'PostToolUse', arg: 'post_tool_use', matcher: true },
  { configName: 'SubagentStart', arg: 'subagent_start', matcher: true },
  { configName: 'SubagentStop', arg: 'subagent_stop', matcher: true },
  { configName: 'Stop', arg: 'stop', matcher: false },
];

const CURSOR_EVENTS = [
  { configName: 'sessionStart', arg: 'session_start' },
  { configName: 'sessionEnd', arg: 'session_end' },
  { configName: 'beforeSubmitPrompt', arg: 'user_prompt_submit' },
  { configName: 'preToolUse', arg: 'pre_tool_use' },
  { configName: 'postToolUse', arg: 'post_tool_use' },
  { configName: 'subagentStart', arg: 'subagent_start' },
  { configName: 'subagentStop', arg: 'subagent_stop' },
  { configName: 'stop', arg: 'stop' },
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.find((value) => !value.startsWith('--')) || 'status';
  const getFlag = (name, fallback) => {
    const prefixed = `--${name}=`;
    const entry = args.find((value) => value.startsWith(prefixed));
    return entry ? entry.slice(prefixed.length) : fallback;
  };

  const targetRaw = getFlag('target', 'claude').trim().toLowerCase();
  const target = targetRaw === 'cursor' ? 'cursor' : 'claude';
  const defaultSettingsPath =
    target === 'cursor'
      ? path.join(os.homedir(), '.cursor', 'hooks.json')
      : path.join(os.homedir(), '.claude', 'settings.json');

  return {
    command,
    target,
    repoRoot: path.resolve(getFlag('repo-root', process.cwd())),
    settingsPath: path.resolve(getFlag('settings-path', defaultSettingsPath)),
  };
}

function ensureSettings(settingsPath, target) {
  if (!fs.existsSync(settingsPath)) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const initial = target === 'cursor' ? { version: 1, hooks: {} } : { hooks: {} };
    fs.writeFileSync(settingsPath, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');
    return initial;
  }
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON object in ${settingsPath}`);
  }
  if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) {
    parsed.hooks = {};
  }
  if (target === 'cursor' && typeof parsed.version !== 'number') {
    parsed.version = 1;
  }
  return parsed;
}

function backupSettings(settingsPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${settingsPath}.habbo-agent-platform-backup-${stamp}`;
  fs.copyFileSync(settingsPath, backupPath);
  return backupPath;
}

function hookCommand(hookRunnerPath, arg) {
  return `bash "${hookRunnerPath}" ${arg}`;
}

function isHabboPlatformCommand(command) {
  return typeof command === 'string' && command.includes('habbo-agent-platform-hook.sh');
}

function isLegacyHabboCommand(command, arg) {
  return (
    typeof command === 'string' &&
    command.includes('habboAgentHook.ts') &&
    command.toLowerCase().includes(arg.toLowerCase())
  );
}

function ensureExecutable(filePath) {
  const mode = fs.statSync(filePath).mode;
  const executableBits = 0o111;
  if ((mode & executableBits) === executableBits) {
    return;
  }
  fs.chmodSync(filePath, mode | executableBits);
}

function saveSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function resolveHooksDir(repoRoot) {
  const candidates = [path.resolve(repoRoot, 'hooks'), path.resolve(repoRoot)];
  for (const dir of candidates) {
    const runner = path.resolve(dir, 'habbo-agent-platform-hook.sh');
    if (fs.existsSync(runner)) {
      return dir;
    }
  }
  throw new Error(
    `Unable to locate habbo-agent-platform-hook.sh from repo root: ${repoRoot}.`
  );
}

function findClaudeBlock(blocks, needsMatcher) {
  if (!Array.isArray(blocks)) {
    return null;
  }
  if (needsMatcher) {
    return blocks.find((block) => block && typeof block === 'object' && block.matcher === '.*') || null;
  }
  return blocks.find((block) => block && typeof block === 'object') || null;
}

function ensureClaudeHooksArray(block) {
  if (!block.hooks || !Array.isArray(block.hooks)) {
    block.hooks = [];
  }
}

function installClaude(settings, hookRunnerPath) {
  let changed = false;

  for (const spec of CLAUDE_EVENTS) {
    if (!Array.isArray(settings.hooks[spec.configName])) {
      settings.hooks[spec.configName] = [];
      changed = true;
    }

    const blocks = settings.hooks[spec.configName];
    let block = findClaudeBlock(blocks, spec.matcher);
    if (!block) {
      block = spec.matcher ? { matcher: '.*', hooks: [] } : { hooks: [] };
      blocks.push(block);
      changed = true;
    }
    ensureClaudeHooksArray(block);

    const desired = hookCommand(hookRunnerPath, spec.arg);
    let hasDesired = false;
    for (const hook of block.hooks) {
      if (!hook || typeof hook !== 'object') {
        continue;
      }
      if (hook.command === desired) {
        hasDesired = true;
      }
      if (isLegacyHabboCommand(hook.command, spec.arg) || isHabboPlatformCommand(hook.command)) {
        if (hook.command !== desired || hook.timeout !== 8 || hook.type !== 'command') {
          hook.type = 'command';
          hook.command = desired;
          hook.timeout = 8;
          changed = true;
        }
        hasDesired = true;
      }
    }

    if (!hasDesired) {
      block.hooks.push({
        type: 'command',
        command: desired,
        timeout: 8,
      });
      changed = true;
    }
  }

  return changed;
}

function uninstallClaude(settings) {
  let changed = false;
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    return false;
  }

  for (const spec of CLAUDE_EVENTS) {
    const blocks = settings.hooks[spec.configName];
    if (!Array.isArray(blocks)) {
      continue;
    }
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || !Array.isArray(block.hooks)) {
        continue;
      }
      const before = block.hooks.length;
      block.hooks = block.hooks.filter((hook) => {
        if (!hook || typeof hook !== 'object') {
          return true;
        }
        const command = hook.command;
        if (isHabboPlatformCommand(command)) {
          return false;
        }
        if (isLegacyHabboCommand(command, spec.arg)) {
          return false;
        }
        return true;
      });
      if (block.hooks.length !== before) {
        changed = true;
      }
    }
  }

  return changed;
}

function statusClaude(settings) {
  const byEvent = {};
  let installedCount = 0;

  for (const spec of CLAUDE_EVENTS) {
    const blocks = settings.hooks?.[spec.configName];
    let found = false;
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (!block || typeof block !== 'object' || !Array.isArray(block.hooks)) {
          continue;
        }
        for (const hook of block.hooks) {
          if (!hook || typeof hook !== 'object') {
            continue;
          }
          if (isHabboPlatformCommand(hook.command) || isLegacyHabboCommand(hook.command, spec.arg)) {
            found = true;
          }
        }
      }
    }
    byEvent[spec.configName] = found;
    if (found) {
      installedCount += 1;
    }
  }

  return {
    installed: installedCount === CLAUDE_EVENTS.length,
    installedCount,
    total: CLAUDE_EVENTS.length,
    byEvent,
  };
}

function installCursor(settings, hookRunnerPath) {
  let changed = false;

  for (const spec of CURSOR_EVENTS) {
    if (!Array.isArray(settings.hooks[spec.configName])) {
      settings.hooks[spec.configName] = [];
      changed = true;
    }
    const hooks = settings.hooks[spec.configName];
    const desired = hookCommand(hookRunnerPath, spec.arg);
    let hasDesired = false;

    for (const hook of hooks) {
      if (!hook || typeof hook !== 'object') {
        continue;
      }
      if (hook.command === desired) {
        hasDesired = true;
      }
      if (isLegacyHabboCommand(hook.command, spec.arg) || isHabboPlatformCommand(hook.command)) {
        if (hook.command !== desired || hook.timeout !== 8) {
          hook.command = desired;
          hook.timeout = 8;
          changed = true;
        }
        hasDesired = true;
      }
    }

    if (!hasDesired) {
      hooks.push({
        command: desired,
        timeout: 8,
      });
      changed = true;
    }
  }

  return changed;
}

function uninstallCursor(settings) {
  let changed = false;
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    return false;
  }

  for (const spec of CURSOR_EVENTS) {
    const hooks = settings.hooks[spec.configName];
    if (!Array.isArray(hooks)) {
      continue;
    }
    const before = hooks.length;
    settings.hooks[spec.configName] = hooks.filter((hook) => {
      if (!hook || typeof hook !== 'object') {
        return true;
      }
      const command = hook.command;
      if (isHabboPlatformCommand(command)) {
        return false;
      }
      if (isLegacyHabboCommand(command, spec.arg)) {
        return false;
      }
      return true;
    });
    if (settings.hooks[spec.configName].length !== before) {
      changed = true;
    }
  }

  return changed;
}

function statusCursor(settings) {
  const byEvent = {};
  let installedCount = 0;

  for (const spec of CURSOR_EVENTS) {
    const hooks = settings.hooks?.[spec.configName];
    let found = false;
    if (Array.isArray(hooks)) {
      for (const hook of hooks) {
        if (!hook || typeof hook !== 'object') {
          continue;
        }
        if (isHabboPlatformCommand(hook.command) || isLegacyHabboCommand(hook.command, spec.arg)) {
          found = true;
        }
      }
    }
    byEvent[spec.configName] = found;
    if (found) {
      installedCount += 1;
    }
  }

  return {
    installed: installedCount === CURSOR_EVENTS.length,
    installedCount,
    total: CURSOR_EVENTS.length,
    byEvent,
  };
}

function printStatus(result, settingsPath, hookRunnerPath, target) {
  console.log(`target: ${target}`);
  console.log(`hooks installed: ${result.installed ? 'yes' : 'no'}`);
  console.log(`events configured: ${result.installedCount}/${result.total}`);
  console.log(`settings file: ${settingsPath}`);
  console.log(`hook runner: ${hookRunnerPath}`);
  console.log('');
  for (const [eventName, installed] of Object.entries(result.byEvent)) {
    console.log(`- ${eventName}: ${installed ? 'ok' : 'missing'}`);
  }
}

function main() {
  const { command, target, repoRoot, settingsPath } = parseArgs(process.argv);
  const scriptDir = resolveHooksDir(repoRoot);
  const hookRunnerPath = path.resolve(scriptDir, 'habbo-agent-platform-hook.sh');
  const settings = ensureSettings(settingsPath, target);

  if (command === 'status') {
    const result = target === 'cursor' ? statusCursor(settings) : statusClaude(settings);
    printStatus(result, settingsPath, hookRunnerPath, target);
    process.exit(0);
  }

  if (command === 'install') {
    ensureExecutable(hookRunnerPath);
    const changed = target === 'cursor' ? installCursor(settings, hookRunnerPath) : installClaude(settings, hookRunnerPath);
    if (!changed) {
      console.log(`No changes needed. ${target} hooks are already installed.`);
      process.exit(0);
    }
    const backupPath = backupSettings(settingsPath);
    saveSettings(settingsPath, settings);
    console.log(`Installed habbo-agent-platform hooks into ${settingsPath} (${target})`);
    console.log(`Backup written to ${backupPath}`);
    console.log('Restart your IDE/assistant client to apply hook changes.');
    process.exit(0);
  }

  if (command === 'uninstall') {
    const changed = target === 'cursor' ? uninstallCursor(settings) : uninstallClaude(settings);
    if (!changed) {
      console.log(`No habbo-agent-platform hooks found to remove for target: ${target}.`);
      process.exit(0);
    }
    const backupPath = backupSettings(settingsPath);
    saveSettings(settingsPath, settings);
    console.log(`Removed habbo-agent-platform hooks from ${settingsPath} (${target})`);
    console.log(`Backup written to ${backupPath}`);
    console.log('Restart your IDE/assistant client to apply hook changes.');
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  console.error(
    'Usage: node hooks/manage_hooks.mjs <install|uninstall|status> [--target=claude|cursor] [--repo-root=PATH] [--settings-path=PATH]'
  );
  process.exit(1);
}

main();
