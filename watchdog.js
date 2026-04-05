#!/usr/bin/env node
// hook-runner — Watchdog
// WHY: A test suite silently disabled shtd globally. No independent monitor caught it.
// This runs on a schedule (OS scheduler) to detect and auto-repair config drift.
//
// Exit codes: 0 = healthy, 1 = repaired (was broken, now fixed), 2 = broken (can't auto-fix)
// Output: JSON to stdout with check results
// Side effects: auto-repairs disabled workflows, writes .watchdog-alert, logs to watchdog-log.jsonl

const fs = require('fs');
const path = require('path');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const hooksDir = getArg('--hooks-dir') || path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'hooks');
const configFile = getArg('--config') || path.join(hooksDir, 'watchdog-config.json');

// --- Load watchdog config (what "healthy" looks like) ---
const DEFAULT_CONFIG = {
  required_workflows: ['shtd', 'code-quality', 'self-improvement', 'session-management', 'messaging-safety'],
  required_runners: [
    'run-pretooluse.js', 'run-posttooluse.js', 'run-stop.js',
    'run-sessionstart.js', 'run-userpromptsubmit.js',
    'load-modules.js', 'workflow.js'
  ],
  required_modules: ['Stop/auto-continue.js', 'PreToolUse/branch-pr-gate.js']
};

function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
      // corrupted config is itself a problem — use defaults
    }
  }
  return DEFAULT_CONFIG;
}

// --- Checks ---
function checkWorkflows(config) {
  const results = [];
  const wcPath = path.join(hooksDir, 'workflow-config.json');

  if (!fs.existsSync(wcPath)) {
    results.push({ check: 'workflow-config-exists', ok: false, detail: 'workflow-config.json missing' });
    return results;
  }

  let wc;
  try {
    wc = JSON.parse(fs.readFileSync(wcPath, 'utf-8'));
  } catch (e) {
    results.push({ check: 'workflow-config-valid', ok: false, detail: 'workflow-config.json is invalid JSON' });
    return results;
  }

  for (const name of (config.required_workflows || [])) {
    if (wc[name] === true) {
      results.push({ check: 'workflow-enabled', workflow: name, ok: true });
    } else {
      results.push({ check: 'workflow-enabled', workflow: name, ok: false, detail: `${name} is disabled (value: ${wc[name]})`, repairable: true });
    }
  }

  // Check if ALL workflows are false (total shutdown) — repairable via per-workflow repair
  const allFalse = Object.keys(wc).length > 0 && Object.values(wc).every(v => v === false);
  if (allFalse) {
    results.push({ check: 'not-all-disabled', ok: false, detail: 'All workflows are disabled — total shutdown detected', repairable: true });
  }

  return results;
}

function checkRunners(config) {
  const results = [];
  for (const runner of (config.required_runners || [])) {
    const p = path.join(hooksDir, runner);
    if (fs.existsSync(p)) {
      results.push({ check: 'runner-exists', file: runner, ok: true });
    } else {
      results.push({ check: 'runner-exists', file: runner, ok: false, detail: `${runner} missing from ${hooksDir}` });
    }
  }
  return results;
}

function checkModules(config) {
  const results = [];
  const modulesDir = path.join(hooksDir, 'run-modules');
  for (const mod of (config.required_modules || [])) {
    const p = path.join(modulesDir, mod);
    if (!fs.existsSync(p)) {
      results.push({ check: 'module-exists', module: mod, ok: false, detail: `${mod} missing` });
      continue;
    }
    // Verify it exports a function
    try {
      const m = require(p);
      if (typeof m === 'function') {
        results.push({ check: 'module-valid', module: mod, ok: true });
      } else {
        results.push({ check: 'module-valid', module: mod, ok: false, detail: `${mod} does not export a function` });
      }
    } catch (e) {
      results.push({ check: 'module-valid', module: mod, ok: false, detail: `${mod} failed to load: ${e.message}` });
    }
  }
  return results;
}

function checkSettings() {
  const results = [];
  const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    results.push({ check: 'settings-exists', ok: false, detail: 'settings.json missing' });
    return results;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    // Verify hooks array exists and has entries
    const hooks = settings.hooks || {};
    const events = Object.keys(hooks);
    if (events.length === 0) {
      results.push({ check: 'settings-has-hooks', ok: false, detail: 'No hooks configured in settings.json' });
    } else {
      results.push({ check: 'settings-has-hooks', ok: true, detail: `${events.length} hook events configured` });
    }

    // Verify hook commands reference existing files
    for (const event of events) {
      const entries = hooks[event] || [];
      for (const entry of entries) {
        const cmd = entry.command || '';
        // Extract script path from "node /path/to/script.js"
        const match = cmd.match(/node\s+"?([^"\s]+\.js)"?/);
        if (match) {
          const scriptPath = match[1].replace(/\//g, path.sep);
          if (!fs.existsSync(scriptPath)) {
            results.push({ check: 'hook-script-exists', ok: false, detail: `${event}: script not found: ${scriptPath}` });
          }
        }
      }
    }
  } catch (e) {
    results.push({ check: 'settings-valid', ok: false, detail: `settings.json parse error: ${e.message}` });
  }

  return results;
}

// --- Auto-repair ---
function repair(failures) {
  const repaired = [];
  const wcPath = path.join(hooksDir, 'workflow-config.json');

  // Repair disabled workflows
  const workflowFailures = failures.filter(f => f.check === 'workflow-enabled' && f.repairable);
  if (workflowFailures.length > 0 && fs.existsSync(wcPath)) {
    try {
      const wc = JSON.parse(fs.readFileSync(wcPath, 'utf-8'));
      for (const f of workflowFailures) {
        wc[f.workflow] = true;
        repaired.push({ action: 'enable-workflow', workflow: f.workflow });
      }
      fs.writeFileSync(wcPath, JSON.stringify(wc, null, 2) + '\n');
    } catch (e) {
      // Can't repair corrupted JSON
    }
  }

  return repaired;
}

// --- Alert flag ---
function writeAlert(failures, repairs) {
  const alertPath = path.join(hooksDir, '.watchdog-alert');
  const alert = {
    timestamp: new Date().toISOString(),
    failures: failures.map(f => f.detail || f.check),
    repairs: repairs.map(r => `${r.action}: ${r.workflow || r.file || ''}`)
  };
  fs.writeFileSync(alertPath, JSON.stringify(alert, null, 2) + '\n');
}

// --- Logging ---
function appendLog(entry) {
  const logPath = path.join(hooksDir, 'watchdog-log.jsonl');
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(logPath, line);
}

// --- Main ---
function main() {
  const config = loadConfig();
  const allResults = [];

  // Run all checks
  allResults.push(...checkWorkflows(config));
  allResults.push(...checkRunners(config));
  allResults.push(...checkModules(config));
  // Only check settings if not using a custom hooks dir (CI/test mode)
  if (!getArg('--hooks-dir')) {
    allResults.push(...checkSettings());
  }

  const failures = allResults.filter(r => !r.ok);
  let exitCode = 0;
  let repairs = [];

  if (failures.length > 0) {
    // Attempt auto-repair
    repairs = repair(failures);

    // Determine exit code: 1 = repaired, 2 = broken (unrepairable failures remain)
    const unrepairableCount = failures.length - failures.filter(f => f.repairable).length;
    exitCode = unrepairableCount > 0 ? 2 : 1;

    // Write alert flag
    writeAlert(failures, repairs);
  }

  const output = {
    status: exitCode === 0 ? 'healthy' : exitCode === 1 ? 'repaired' : 'broken',
    checks: allResults.length,
    passed: allResults.filter(r => r.ok).length,
    failed: failures.length,
    repaired: repairs.length,
    results: allResults,
    repairs: repairs
  };

  // Log
  appendLog({
    status: output.status,
    checks: output.checks,
    passed: output.passed,
    failed: output.failed,
    repaired: output.repaired,
    failures: failures.map(f => f.detail || f.check),
    repairs: repairs.map(r => `${r.action}: ${r.workflow || ''}`.trim())
  });

  // JSON output
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(exitCode);
}

// --- Scheduler Integration (T125-T127) ---
const TASK_NAME = 'HookRunnerWatchdog';
const isWindows = process.platform === 'win32';

function getWatchdogScriptPath() {
  // Resolve to absolute path of this script
  return path.resolve(__dirname, 'watchdog.js');
}

function getVbsWrapperPath() {
  return path.join(hooksDir, 'watchdog-hidden.vbs');
}

function createVbsWrapper() {
  const nodePath = process.execPath;
  const scriptPath = getWatchdogScriptPath().replace(/\//g, '\\');
  const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""${nodePath}"" ""${scriptPath}""""", 0, True
`;
  const vbsPath = getVbsWrapperPath();
  fs.writeFileSync(vbsPath, vbs);
  return vbsPath;
}

function cmdInstall() {
  const { execSync } = require('child_process');

  if (isWindows) {
    const vbsPath = createVbsWrapper();
    // Delete existing task if any
    try { execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`, { stdio: 'pipe' }); } catch(e) {}
    // Create task: every 10 minutes, starts immediately
    const cmd = `schtasks /Create /TN "${TASK_NAME}" /TR "wscript.exe \\"${vbsPath.replace(/\//g, '\\')}\\"" /SC MINUTE /MO 10 /F`;
    try {
      execSync(cmd, { stdio: 'pipe' });
      console.log(`Installed scheduled task "${TASK_NAME}" (every 10 min)`);
      console.log(`  VBS wrapper: ${vbsPath}`);
      console.log(`  Script: ${getWatchdogScriptPath()}`);
    } catch (e) {
      console.error('Failed to create scheduled task:', e.message);
      process.exit(2);
    }
  } else {
    // Linux/macOS: cron
    const scriptPath = getWatchdogScriptPath();
    const nodePath = process.execPath;
    const cronLine = `*/10 * * * * ${nodePath} ${scriptPath} > /dev/null 2>&1 # ${TASK_NAME}`;
    try {
      let crontab = '';
      try { crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' }); } catch(e) {}
      // Remove existing entry
      const lines = crontab.split('\n').filter(l => !l.includes(TASK_NAME));
      lines.push(cronLine);
      const newCrontab = lines.filter(l => l.trim()).join('\n') + '\n';
      execSync(`echo '${newCrontab}' | crontab -`, { stdio: 'pipe' });
      console.log(`Installed cron job "${TASK_NAME}" (every 10 min)`);
      console.log(`  Script: ${scriptPath}`);
    } catch (e) {
      console.error('Failed to install cron job:', e.message);
      process.exit(2);
    }
  }
  process.exit(0);
}

function cmdUninstall() {
  const { execSync } = require('child_process');

  if (isWindows) {
    try {
      execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`, { stdio: 'pipe' });
      console.log(`Removed scheduled task "${TASK_NAME}"`);
    } catch (e) {
      console.log(`Task "${TASK_NAME}" not found (already removed)`);
    }
    // Clean up VBS wrapper
    const vbsPath = getVbsWrapperPath();
    if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
  } else {
    try {
      let crontab = '';
      try { crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' }); } catch(e) {}
      const lines = crontab.split('\n').filter(l => !l.includes(TASK_NAME));
      const newCrontab = lines.filter(l => l.trim()).join('\n') + '\n';
      execSync(`echo '${newCrontab}' | crontab -`, { stdio: 'pipe' });
      console.log(`Removed cron job "${TASK_NAME}"`);
    } catch (e) {
      console.log(`Cron job "${TASK_NAME}" not found (already removed)`);
    }
  }
  process.exit(0);
}

function cmdStatus() {
  const { execSync } = require('child_process');

  console.log('=== Watchdog Status ===');

  // Check scheduler registration
  let registered = false;
  if (isWindows) {
    try {
      const out = execSync(`schtasks /Query /TN "${TASK_NAME}" /FO LIST 2>&1`, { encoding: 'utf-8' });
      registered = true;
      const statusMatch = out.match(/Status:\s*(.+)/);
      const nextMatch = out.match(/Next Run Time:\s*(.+)/);
      const lastMatch = out.match(/Last Run Time:\s*(.+)/);
      console.log(`  Scheduler: registered`);
      if (statusMatch) console.log(`  Task status: ${statusMatch[1].trim()}`);
      if (lastMatch) console.log(`  Last run: ${lastMatch[1].trim()}`);
      if (nextMatch) console.log(`  Next run: ${nextMatch[1].trim()}`);
    } catch (e) {
      console.log('  Scheduler: not registered');
    }
  } else {
    try {
      const crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
      if (crontab.includes(TASK_NAME)) {
        registered = true;
        console.log('  Scheduler: registered (cron)');
      } else {
        console.log('  Scheduler: not registered');
      }
    } catch (e) {
      console.log('  Scheduler: not registered');
    }
  }

  // Check last log entry
  const logPath = path.join(hooksDir, 'watchdog-log.jsonl');
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        console.log(`  Last check: ${last.timestamp} — ${last.status} (${last.passed}/${last.checks} passed)`);
      } catch(e) {}
    }
    console.log(`  Log entries: ${lines.length}`);
  } else {
    console.log('  Log: no entries yet');
  }

  // Check alert flag
  const alertPath = path.join(hooksDir, '.watchdog-alert');
  if (fs.existsSync(alertPath)) {
    try {
      const alert = JSON.parse(fs.readFileSync(alertPath, 'utf-8'));
      console.log(`  ALERT: ${alert.timestamp} — ${alert.failures.join(', ')}`);
    } catch(e) {
      console.log('  ALERT: flag exists but unreadable');
    }
  }

  process.exit(registered ? 0 : 1);
}

// --- Log viewer (T129) ---
function cmdLog() {
  const logPath = path.join(hooksDir, 'watchdog-log.jsonl');
  if (!fs.existsSync(logPath)) {
    console.log('No watchdog log found.');
    process.exit(0);
  }

  const count = parseInt(getArg('--last') || '20', 10);
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  const recent = lines.slice(-count);

  console.log(`=== Watchdog Log (last ${recent.length} of ${lines.length}) ===`);
  for (const line of recent) {
    try {
      const e = JSON.parse(line);
      const icon = e.status === 'healthy' ? 'OK' : e.status === 'repaired' ? 'REPAIRED' : 'BROKEN';
      const detail = e.failures && e.failures.length > 0 ? ` — ${e.failures.join(', ')}` : '';
      console.log(`  ${e.timestamp}  [${icon}]  ${e.passed}/${e.checks} checks${detail}`);
    } catch(e) {}
  }
  process.exit(0);
}

// --- CLI dispatch ---
if (args.includes('--install')) { cmdInstall(); }
else if (args.includes('--uninstall')) { cmdUninstall(); }
else if (args.includes('--status')) { cmdStatus(); }
else if (args.includes('--log')) { cmdLog(); }
else { main(); }
