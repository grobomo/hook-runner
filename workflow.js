// hook-runner — Workflow Engine
// Enforceable step pipelines with YAML definitions, state management, and gate validation.
// Zero dependencies. Works on Windows (Git Bash), Linux, macOS, Docker.
//
// Workflow discovery (priority order):
//   1. Project: $CLAUDE_PROJECT_DIR/workflows/*.yml
//   2. Global:  ~/.claude/hooks/workflows/*.yml
//   3. Built-in: <hook-runner>/workflows/*.yml (shipped with hook-runner)

const fs = require('fs');
const path = require('path');

const STATE_FILE = '.workflow-state.json';

// --- YAML Parser (minimal, no deps) ---
// Handles the subset of YAML used in workflow definitions:
// top-level scalars, step arrays with nested objects, string arrays, inline arrays

function parseYaml(text) {
  const result = {};
  const lines = text.split('\n');
  let i = 0;
  let currentArray = null;
  let currentArrayKey = null;
  let currentObj = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

    const indent = line.length - line.trimStart().length;

    // Top-level scalar: "key: value"
    if (indent === 0 && !trimmed.startsWith('-')) {
      const m = trimmed.match(/^(\w+):\s*(.*)/);
      if (m) {
        currentArray = null; currentArrayKey = null; currentObj = null;
        const val = m[2].trim();
        if (!val) {
          currentArrayKey = m[1];
          result[m[1]] = [];
          currentArray = result[m[1]];
        } else {
          result[m[1]] = parseScalar(val);
        }
      }
      i++; continue;
    }

    // Array item: "  - id: value" or "  - value"
    if (trimmed.startsWith('- ') || (indent > 0 && trimmed.trimStart().startsWith('- '))) {
      const content = trimmed.trimStart().slice(2).trim();
      const kvMatch = content.match(/^(\w+):\s*(.*)/);
      if (kvMatch) {
        currentObj = {};
        currentObj[kvMatch[1]] = parseScalar(kvMatch[2]);
        if (currentArray) currentArray.push(currentObj);
      } else {
        if (currentArray) currentArray.push(parseScalar(content));
      }
      i++; continue;
    }

    // Nested key under array item
    if (indent > 0 && currentObj && !trimmed.trimStart().startsWith('-')) {
      const nested = trimmed.trim();
      const kvMatch = nested.match(/^(\w+):\s*(.*)/);
      if (kvMatch) {
        const key = kvMatch[1];
        const val = kvMatch[2].trim();
        if (!val) {
          // Sub-object (like gate: or completion:)
          const subObj = {};
          i++;
          let subBaseIndent = -1;
          while (i < lines.length) {
            const subLine = lines[i];
            const subTrimmed = subLine.trimEnd();
            if (!subTrimmed) { i++; continue; }
            const subIndent = subLine.length - subLine.trimStart().length;
            if (subBaseIndent === -1) subBaseIndent = subIndent;
            if (subIndent < subBaseIndent) break;
            const subKv = subTrimmed.trim().match(/^(\w+):\s*(.*)/);
            if (subKv) {
              subObj[subKv[1]] = parseScalar(subKv[2]);
            }
            i++;
          }
          currentObj[key] = subObj;
          continue;
        } else {
          currentObj[key] = parseScalar(val);
        }
      }
      i++; continue;
    }

    i++;
  }

  return result;
}

function parseScalar(val) {
  if (!val || val === '~' || val === 'null') return null;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => parseScalar(s.trim()));
  }
  return val;
}

// --- Workflow Loading ---

function loadWorkflow(yamlPath) {
  const text = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parseYaml(text);
  // Parse modules list (array of module base names)
  var modules = [];
  if (Array.isArray(parsed.modules)) {
    modules = parsed.modules.filter(m => typeof m === 'string');
  }

  return {
    name: parsed.name || path.basename(yamlPath, '.yml'),
    description: parsed.description || '',
    version: parsed.version || 1,
    steps: (parsed.steps || []).filter(s => s && s.id).map(s => ({
      id: s.id,
      name: s.name || s.id,
      gate: s.gate || {},
      completion: s.completion || {},
    })),
    modules: modules,
    _path: yamlPath,
  };
}

function findWorkflows(projectDir) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs = [
    path.join(projectDir, 'workflows'),
    path.join(home, '.claude', 'hooks', 'workflows'),
    path.join(__dirname, 'workflows'),
  ];
  const workflows = [];
  const seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!(f.endsWith('.yml') || f.endsWith('.yaml'))) continue;
      try {
        const wf = loadWorkflow(path.join(dir, f));
        if (!seen.has(wf.name)) {
          seen.add(wf.name);
          workflows.push(wf);
        }
      } catch(e) {}
    }
  }
  return workflows;
}

// --- State Management ---

function statePath(projectDir) {
  return path.join(projectDir, STATE_FILE);
}

function readState(projectDir) {
  const p = statePath(projectDir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) { return null; }
}

function writeState(state, projectDir) {
  fs.writeFileSync(statePath(projectDir), JSON.stringify(state, null, 2) + '\n');
  return state;
}

function initState(workflowName, yamlPath, projectDir) {
  const def = loadWorkflow(yamlPath);
  const steps = {};
  for (const step of def.steps) {
    steps[step.id] = { status: 'pending' };
  }
  const state = {
    workflow: workflowName,
    workflow_path: yamlPath,
    started_at: new Date().toISOString(),
    steps,
  };
  return writeState(state, projectDir);
}

function resetState(projectDir) {
  const p = statePath(projectDir);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function completeStep(stepId, projectDir) {
  const state = readState(projectDir);
  if (!state) throw new Error('No active workflow');
  if (!state.steps[stepId]) throw new Error(`Unknown step: ${stepId}`);
  state.steps[stepId] = {
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
  // Advance next pending step to in_progress
  const def = loadWorkflow(state.workflow_path);
  for (const step of def.steps) {
    if (state.steps[step.id]?.status === 'pending') {
      state.steps[step.id].status = 'in_progress';
      break;
    }
  }
  return writeState(state, projectDir);
}

function currentStep(projectDir) {
  const state = readState(projectDir);
  if (!state) return null;
  const def = loadWorkflow(state.workflow_path);
  for (const step of def.steps) {
    const s = state.steps[step.id];
    if (s?.status === 'in_progress') return step.id;
  }
  for (const step of def.steps) {
    const s = state.steps[step.id];
    if (s?.status === 'pending') return step.id;
  }
  return null; // All done
}

// --- Gate Checking ---

function checkGate(stepId, projectDir) {
  const state = readState(projectDir);
  if (!state) return { allowed: true, reason: 'no active workflow' };

  const def = loadWorkflow(state.workflow_path);
  const stepDef = def.steps.find(s => s.id === stepId);
  if (!stepDef) return { allowed: true, reason: 'unknown step' };

  const gate = stepDef.gate;
  const reasons = [];

  if (gate.require_step) {
    const reqStatus = state.steps[gate.require_step];
    if (!reqStatus || reqStatus.status !== 'completed') {
      reasons.push(`Step "${gate.require_step}" not completed`);
    }
  }

  if (gate.require_files && Array.isArray(gate.require_files) && gate.require_files.length > 0) {
    for (const f of gate.require_files) {
      const fullPath = path.isAbsolute(f) ? f : path.join(projectDir, f);
      if (!fs.existsSync(fullPath)) {
        reasons.push(`Required file missing: ${f}`);
      }
    }
  }

  if (reasons.length > 0) {
    return { allowed: false, step: stepId, reasons };
  }
  return { allowed: true, step: stepId };
}

function checkEditAllowed(filePath, projectDir) {
  const state = readState(projectDir);
  if (!state) return { allowed: true };

  const current = currentStep(projectDir);
  if (!current) return { allowed: true };

  return checkGate(current, projectDir);
}

// --- Workflow Config (enable/disable) ---
// Stored in <dir>/workflow-config.json (global: ~/.claude/hooks/, per-project: $CLAUDE_PROJECT_DIR)

const CONFIG_FILE = 'workflow-config.json';

function configPath(dir) {
  return path.join(dir, CONFIG_FILE);
}

function readConfig(dir) {
  const p = configPath(dir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) { return {}; }
}

function writeConfig(config, dir) {
  fs.writeFileSync(configPath(dir), JSON.stringify(config, null, 2) + '\n');
}

function enableWorkflow(name, dir) {
  const config = readConfig(dir);
  config[name] = true;
  writeConfig(config, dir);
}

function disableWorkflow(name, dir) {
  const config = readConfig(dir);
  config[name] = false;
  writeConfig(config, dir);
}

function isWorkflowEnabled(name, dir) {
  const config = readConfig(dir);
  return config[name] === true;
}

function enabledWorkflows(dir) {
  const config = readConfig(dir);
  return Object.keys(config).filter(k => config[k] === true);
}

module.exports = {
  parseYaml,
  loadWorkflow,
  findWorkflows,
  readState,
  writeState,
  initState,
  resetState,
  completeStep,
  currentStep,
  checkGate,
  checkEditAllowed,
  readConfig,
  writeConfig,
  enableWorkflow,
  disableWorkflow,
  isWorkflowEnabled,
  enabledWorkflows,
  STATE_FILE,
  CONFIG_FILE,
};
