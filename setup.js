#!/usr/bin/env node
"use strict";
/**
 * hook-runner setup wizard
 *
 * Guides the user through adopting the hook-runner modular system:
 * 1. Scans current hooks in settings.json → generates HTML report
 * 2. Shows what hook-runner would install
 * 3. Backs up existing hook files to ~/.claude/hooks/archive/
 * 4. Installs runner scripts + module dirs + updates settings.json
 * 5. Re-generates report showing the result
 *
 * Usage:
 *   node setup.js                  # full interactive wizard
 *   node setup.js --report         # just generate the report
 *   node setup.js --dry-run        # show what would change, don't do it
 *   node setup.js --install        # skip report, just install
 *   node setup.js --sync           # sync modules from GitHub per modules.yaml
 *   node setup.js --sync --dry-run # preview sync without installing
 */
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOME = os.homedir();
var CLAUDE_DIR = path.join(HOME, ".claude");
var HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
var SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
var ARCHIVE_DIR = path.join(HOOKS_DIR, "archive");
var REPORT_DIR = path.join(CLAUDE_DIR, "reports");

// Source files — relative to this script
var SCRIPT_DIR = __dirname;
// When installed as a skill, runners are in the repo root.
// When run from the repo directly, they're right here.
var REPO_DIR = SCRIPT_DIR;

// ============================================================
// 1. Hook Scanner
// ============================================================

function scanHooks() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { events: {}, totalHooks: 0, totalMatchers: 0, scripts: [] };
  }
  var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  var hooks = settings.hooks || {};
  var events = {};
  var totalHooks = 0;
  var totalMatchers = 0;
  var scripts = [];

  var eventNames = Object.keys(hooks);
  for (var i = 0; i < eventNames.length; i++) {
    var event = eventNames[i];
    var entries = hooks[event];
    if (!Array.isArray(entries)) continue;

    events[event] = { entries: [], matchers: [], moduleCount: 0 };

    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      var matcher = entry.matcher || null;
      if (matcher && events[event].matchers.indexOf(matcher) === -1) {
        events[event].matchers.push(matcher);
        totalMatchers++;
      }

      var entryHooks = entry.hooks || [];
      for (var k = 0; k < entryHooks.length; k++) {
        var h = entryHooks[k];
        if (h.type !== "command") continue;
        totalHooks++;

        var cmd = h.command || "";
        var scriptPath = resolveScriptPath(cmd);
        var exists = scriptPath ? fs.existsSync(scriptPath) : false;
        var isRunner = scriptPath ? /run-(pretooluse|posttooluse|stop|sessionstart|userpromptsubmit)\.js$/i.test(scriptPath) : false;

        var info = {
          event: event,
          matcher: matcher,
          command: cmd,
          scriptPath: scriptPath,
          exists: exists,
          isRunner: isRunner,
          timeout: h.timeout || 10
        };

        events[event].entries.push(info);
        if (scriptPath && scripts.indexOf(scriptPath) === -1) {
          scripts.push(scriptPath);
        }

        // Count modules if this is a runner pointing to run-modules/
        if (isRunner && exists && scriptPath) {
          var modulesDir = path.join(path.dirname(scriptPath), "run-modules", event);
          if (fs.existsSync(modulesDir)) {
            try {
              var mods = fs.readdirSync(modulesDir).filter(function(f) {
                return f.endsWith(".js") && !f.startsWith(".");
              });
              events[event].moduleCount = mods.length;
            } catch (e) { /* skip */ }
          }
        }
      }
    }
  }

  return { events: events, totalHooks: totalHooks, totalMatchers: totalMatchers, scripts: scripts };
}

function resolveScriptPath(cmd) {
  // Extract script path from command like: node "$HOME/.claude/hooks/run-stop.js"
  var match = cmd.match(/["']([^"']+\.(js|sh|py))["']/);
  if (match) {
    return match[1].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
  }
  // Try bare path after "node "
  var parts = cmd.split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    if (/\.(js|sh|py)$/.test(parts[i])) {
      return parts[i].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
    }
  }
  return null;
}

// ============================================================
// 2. Report Generator
// ============================================================

// Canonical event order: user experience flow
var EVENT_ORDER = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

var EVENT_TITLES = {
  SessionStart: "Session Start Hooks",
  UserPromptSubmit: "User Prompt Hooks",
  PreToolUse: "Pre-Tool Use Hooks",
  PostToolUse: "Post-Tool Use Hooks",
  Stop: "Stop Hooks"
};

var EVENT_BADGES = {
  SessionStart: "badge-session", PreToolUse: "badge-pre", PostToolUse: "badge-post",
  Stop: "badge-stop", UserPromptSubmit: "badge-prompt"
};

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Read the first comment line from a module as its description.
 */
function getModuleDescription(filePath) {
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    var lines = content.split("\n");
    for (var i = 0; i < Math.min(lines.length, 10); i++) {
      var line = lines[i].trim();
      if (line.startsWith("//")) {
        var desc = line.replace(/^\/\/\s*/, "");
        if (desc.length > 10 && !/^#!|^"use strict"|^@module/.test(desc)) return desc;
      }
    }
  } catch (e) { /* skip */ }
  return "";
}

/**
 * Read the full source code of a module for display.
 */
function getModuleSource(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) { return ""; }
}

/**
 * Collect all modules for an event, including project-scoped and archived.
 */
function collectModules(modulesDir) {
  var result = [];
  if (!fs.existsSync(modulesDir)) return result;

  var entries = fs.readdirSync(modulesDir, { withFileTypes: true });

  // Global modules
  var globalFiles = entries.filter(function(e) { return e.isFile() && e.name.endsWith(".js"); })
    .map(function(e) { return e.name; }).sort();
  for (var i = 0; i < globalFiles.length; i++) {
    var fp = path.join(modulesDir, globalFiles[i]);
    result.push({
      name: globalFiles[i], path: fp, scope: "global",
      description: getModuleDescription(fp), source: getModuleSource(fp), archived: false
    });
  }

  // Archive modules
  var archiveDir = path.join(modulesDir, "archive");
  if (fs.existsSync(archiveDir)) {
    try {
      var archiveFiles = fs.readdirSync(archiveDir).filter(function(f) { return f.endsWith(".js"); }).sort();
      for (var a = 0; a < archiveFiles.length; a++) {
        var afp = path.join(archiveDir, archiveFiles[a]);
        result.push({
          name: "archive/" + archiveFiles[a], path: afp, scope: "archived",
          description: getModuleDescription(afp), source: getModuleSource(afp), archived: true
        });
      }
    } catch (e) { /* skip */ }
  }

  // Project-scoped modules
  var subdirs = entries.filter(function(e) { return e.isDirectory() && e.name !== "archive"; });
  for (var s = 0; s < subdirs.length; s++) {
    var subDir = path.join(modulesDir, subdirs[s].name);
    var subFiles = fs.readdirSync(subDir).filter(function(f) { return f.endsWith(".js"); }).sort();
    for (var sf = 0; sf < subFiles.length; sf++) {
      var sfp = path.join(subDir, subFiles[sf]);
      result.push({
        name: subdirs[s].name + "/" + subFiles[sf], path: sfp, scope: subdirs[s].name,
        description: getModuleDescription(sfp), source: getModuleSource(sfp), archived: false
      });
    }
  }

  return result;
}

function generateReport(scan, outputPath) {
  var now = new Date().toISOString().slice(0, 10);

  // Detect if already using hook-runner
  var usingRunner = false;
  var rawEventNames = Object.keys(scan.events);
  for (var i = 0; i < rawEventNames.length; i++) {
    var ents = scan.events[rawEventNames[i]].entries;
    for (var j = 0; j < ents.length; j++) {
      if (ents[j].isRunner) { usingRunner = true; break; }
    }
    if (usingRunner) break;
  }

  // Order events by user experience flow
  var eventNames = [];
  for (var eo = 0; eo < EVENT_ORDER.length; eo++) {
    if (scan.events[EVENT_ORDER[eo]]) eventNames.push(EVENT_ORDER[eo]);
  }
  for (var uk = 0; uk < rawEventNames.length; uk++) {
    if (eventNames.indexOf(rawEventNames[uk]) === -1) eventNames.push(rawEventNames[uk]);
  }

  // Collect all module info per event
  var eventModules = {};
  var totalModules = 0;
  for (var em = 0; em < eventNames.length; em++) {
    var evt = eventNames[em];
    var evtData = scan.events[evt];
    var modulesDir = null;
    for (var mh = 0; mh < evtData.entries.length; mh++) {
      if (evtData.entries[mh].isRunner && evtData.entries[mh].scriptPath) {
        modulesDir = path.join(path.dirname(evtData.entries[mh].scriptPath), "run-modules", evt);
        break;
      }
    }
    var mods = modulesDir ? collectModules(modulesDir) : [];
    eventModules[evt] = mods;
    var activeCount = mods.filter(function(m) { return !m.archived; }).length;
    totalModules += activeCount;
    evtData.moduleCount = activeCount;
  }

  var h = [];
  h.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  h.push('<title>Claude Code Hooks Report</title>');
  h.push('<style>');
  h.push('*{margin:0;padding:0;box-sizing:border-box}');
  h.push('body{background:#0d1117;color:#c9d1d9;font-family:"Segoe UI",-apple-system,sans-serif;line-height:1.6;padding:2rem}');
  h.push('h1{color:#58a6ff;font-size:1.8rem;margin-bottom:.3rem}');
  h.push('.subtitle{color:#8b949e;font-size:.95rem;margin-bottom:2rem}');
  h.push('.stats{display:flex;gap:1.5rem;margin-bottom:2rem;flex-wrap:wrap}');
  h.push('.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.5rem;min-width:140px}');
  h.push('.stat-value{font-size:2rem;font-weight:700;color:#58a6ff}');
  h.push('.stat-label{font-size:.8rem;color:#8b949e;text-transform:uppercase;letter-spacing:.05em}');
  h.push('.arch-note{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.arch-note h2{color:#d2a8ff;font-size:1rem;margin-bottom:.8rem}');
  h.push('.arch-note p{color:#8b949e;font-size:.9rem;margin-bottom:.5rem}');
  h.push('.arch-note code{background:#0d1117;padding:.1rem .4rem;border-radius:3px;color:#79c0ff;font-size:.85rem}');
  h.push('.flow{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.flow h2{color:#58a6ff;font-size:1.1rem;margin-bottom:1rem}');
  h.push('.flow-diagram{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding:1rem 0}');
  h.push('.flow-stage{display:flex;flex-direction:column;align-items:center;min-width:180px}');
  h.push('.flow-arrow{color:#484f58;font-size:1.5rem;padding-top:.8rem;min-width:40px;text-align:center}');
  h.push('.flow-event{background:#1f2937;border:2px solid #58a6ff;border-radius:8px;padding:.6rem 1rem;font-weight:600;color:#58a6ff;font-size:.9rem;margin-bottom:.5rem;white-space:nowrap}');
  h.push('.flow-modules{display:flex;flex-direction:column;gap:.3rem;align-items:center}');
  h.push('.flow-mod{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:.2rem .6rem;font-size:.7rem;color:#8b949e;white-space:nowrap}');
  h.push('.flow-mod-archived{opacity:.4;text-decoration:line-through}');
  h.push('.flow-mod-project{color:#d2a8ff}');
  h.push('.event-section{margin-bottom:1.5rem}');
  h.push('.event-header{background:#161b22;border:1px solid #30363d;border-radius:8px 8px 0 0;padding:1rem 1.5rem;cursor:pointer;display:flex;align-items:center;gap:1rem;user-select:none}');
  h.push('.event-header:hover{background:#1c2128}');
  h.push('.event-header.collapsed{border-radius:8px}');
  h.push('.event-badge{font-size:.75rem;font-weight:600;padding:.2rem .6rem;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}');
  h.push('.badge-session{background:#1f6feb33;color:#58a6ff;border:1px solid #1f6feb}');
  h.push('.badge-pre{background:#da363333;color:#f85149;border:1px solid #da3633}');
  h.push('.badge-post{background:#23863633;color:#3fb950;border:1px solid #238636}');
  h.push('.badge-stop{background:#9e6a0333;color:#d29922;border:1px solid #9e6a03}');
  h.push('.badge-prompt{background:#8b5cf633;color:#a78bfa;border:1px solid #7c3aed}');
  h.push('.event-title{font-size:1.1rem;font-weight:600;color:#c9d1d9}');
  h.push('.event-meta{margin-left:auto;color:#8b949e;font-size:.85rem}');
  h.push('.chevron{color:#484f58;transition:transform .2s;font-size:1.2rem}');
  h.push('.chevron.open{transform:rotate(90deg)}');
  h.push('.event-body{background:#0d1117;border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;display:none}');
  h.push('.event-body.open{display:block}');
  h.push('.runner{padding:1rem 1.5rem;border-bottom:1px solid #21262d}');
  h.push('.runner-label{color:#8b949e;font-size:.8rem;text-transform:uppercase;margin-bottom:.3rem}');
  h.push('.runner-path{color:#79c0ff;font-family:"Cascadia Code","Fira Code",monospace;font-size:.85rem}');
  h.push('.matchers{padding:.5rem 1.5rem;display:flex;gap:.5rem;flex-wrap:wrap;border-bottom:1px solid #21262d}');
  h.push('.matcher{background:#1f2937;border:1px solid #30363d;border-radius:4px;padding:.15rem .5rem;font-size:.8rem;color:#d2a8ff;font-family:monospace}');
  h.push('.module{border-bottom:1px solid #21262d}');
  h.push('.module:last-child{border-bottom:none}');
  h.push('.module-header{padding:1rem 1.5rem;cursor:pointer;display:flex;align-items:center;gap:.8rem}');
  h.push('.module-header:hover{background:#161b22}');
  h.push('.module-icon{width:8px;height:8px;border-radius:50%;flex-shrink:0}');
  h.push('.icon-active{background:#3fb950;box-shadow:0 0 6px #3fb95066}');
  h.push('.icon-project{background:#d2a8ff;box-shadow:0 0 6px #d2a8ff66}');
  h.push('.icon-archived{background:#484f58}');
  h.push('.module-name{font-weight:600;color:#c9d1d9;font-size:.95rem}');
  h.push('.module-desc{color:#8b949e;font-size:.85rem;margin-left:.5rem}');
  h.push('.module-scope{margin-left:auto;font-size:.7rem;padding:.15rem .4rem;border-radius:3px;font-weight:600;flex-shrink:0}');
  h.push('.scope-global{background:#23863622;color:#3fb950;border:1px solid #23863644}');
  h.push('.scope-project{background:#8b5cf622;color:#d2a8ff;border:1px solid #7c3aed44}');
  h.push('.scope-archived{background:#30363d;color:#484f58;border:1px solid #484f58}');
  h.push('.module-chevron{color:#484f58;transition:transform .2s;flex-shrink:0}');
  h.push('.module-chevron.open{transform:rotate(90deg)}');
  h.push('.module-detail{display:none;padding:0 1.5rem 1rem 2.5rem}');
  h.push('.module-detail.open{display:block}');
  h.push('.code-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:1rem;overflow-x:auto;margin-top:.5rem;max-height:500px;overflow-y:auto}');
  h.push('.code-block pre{font-family:"Cascadia Code","Fira Code",monospace;font-size:.8rem;color:#c9d1d9;white-space:pre;tab-size:2}');
  h.push('.code-block .ln{color:#484f58;display:inline-block;width:2.5rem;text-align:right;margin-right:1rem;user-select:none}');
  h.push('.footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #21262d;color:#484f58;font-size:.8rem;text-align:center}');
  h.push('</style></head><body>');

  h.push('<h1>Claude Code Hooks Report</h1>');
  h.push('<p class="subtitle">Runtime enforcement layer &mdash; hooks intercept every tool call and enforce workflow, safety, and quality gates. Generated ' + now + '.</p>');

  // Stats
  h.push('<div class="stats">');
  h.push('<div class="stat"><div class="stat-value">' + eventNames.length + '</div><div class="stat-label">Hook Events</div></div>');
  if (usingRunner) h.push('<div class="stat"><div class="stat-value">' + eventNames.length + '</div><div class="stat-label">Runner Scripts</div></div>');
  h.push('<div class="stat"><div class="stat-value">' + totalModules + '</div><div class="stat-label">Active Modules</div></div>');
  h.push('<div class="stat"><div class="stat-value">' + scan.totalMatchers + '</div><div class="stat-label">Matchers</div></div>');
  h.push('</div>');

  // Architecture note
  if (usingRunner) {
    h.push('<div class="arch-note"><h2>Architecture: Runner + Module Pattern</h2>');
    h.push('<p>Each hook event has <strong>one runner script</strong> in <code>settings.json</code>. The runner auto-loads all <code>.js</code> modules from <code>run-modules/{Event}/</code>, sorted alphabetically.</p>');
    h.push('<p>To add behavior: create a new module file. Never add new hook entries to settings.json.</p>');
    h.push('<p>All hooks are <strong>synchronous</strong> &mdash; <code>fs.readFileSync(0)</code> for stdin. Async hooks race with the 5s timeout.</p>');
    h.push('</div>');
  } else {
    h.push('<div class="arch-note"><h2>Current: Standalone Hook Scripts</h2>');
    h.push('<p>Each hook entry in <code>settings.json</code> points to an individual script. Adding new hooks requires editing settings.json.</p>');
    h.push('<p><strong>hook-runner</strong> replaces this with a modular system: one runner per event, modules in folders. <code>node setup.js</code> to migrate.</p>');
    h.push('</div>');
  }

  // Flow Diagram
  if (usingRunner) {
    h.push('<div class="flow"><h2>Hook Event Flow</h2><div class="flow-diagram">');
    for (var fi = 0; fi < eventNames.length; fi++) {
      var fEvt = eventNames[fi];
      var fMods = eventModules[fEvt] || [];
      if (fi > 0) h.push('<div class="flow-arrow">&rarr;</div>');
      if (fEvt === "PostToolUse") {
        h.push('<div class="flow-stage"><div class="flow-event" style="border-color:#3fb950;color:#3fb950">Tool Executes</div></div>');
        h.push('<div class="flow-arrow">&rarr;</div>');
      }
      h.push('<div class="flow-stage"><div class="flow-event">' + fEvt + '</div><div class="flow-modules">');
      for (var fm = 0; fm < fMods.length; fm++) {
        var fmod = fMods[fm];
        var fclass = "flow-mod";
        if (fmod.archived) fclass += " flow-mod-archived";
        else if (fmod.scope !== "global") fclass += " flow-mod-project";
        h.push('<div class="' + fclass + '">' + escHtml(fmod.name.replace(/\.js$/, "")) + '</div>');
      }
      h.push('</div></div>');
    }
    h.push('</div></div>');
  }

  // Event Sections
  for (var e = 0; e < eventNames.length; e++) {
    var evt2 = eventNames[e];
    var evtData2 = scan.events[evt2];
    var mods2 = eventModules[evt2] || [];
    var badge2 = EVENT_BADGES[evt2] || "badge-session";
    var title2 = EVENT_TITLES[evt2] || evt2;
    var metaParts = [];
    var activeModCount = mods2.filter(function(m) { return !m.archived; }).length;
    if (activeModCount > 0) metaParts.push(activeModCount + " module" + (activeModCount !== 1 ? "s" : ""));
    if (evtData2.matchers.length > 0) metaParts.push(evtData2.matchers.join(", ") + " matchers");
    else metaParts.push("no matcher");

    h.push('<div class="event-section">');
    h.push('<div class="event-header collapsed" onclick="toggleEvent(this)">');
    h.push('<span class="chevron">&#9654;</span>');
    h.push('<span class="event-badge ' + badge2 + '">' + evt2 + '</span>');
    h.push('<span class="event-title">' + title2 + '</span>');
    h.push('<span class="event-meta">' + metaParts.join(' &bull; ') + '</span>');
    h.push('</div>');
    h.push('<div class="event-body">');

    // Runner info
    for (var hi = 0; hi < evtData2.entries.length; hi++) {
      if (evtData2.entries[hi].isRunner && evtData2.entries[hi].scriptPath) {
        h.push('<div class="runner"><div class="runner-label">Runner Script</div>');
        h.push('<div class="runner-path">' + escHtml(evtData2.entries[hi].scriptPath.replace(HOME, "~")) + '</div></div>');
        break;
      }
    }

    // Matchers
    if (evtData2.matchers.length > 0) {
      h.push('<div class="matchers">');
      for (var mi = 0; mi < evtData2.matchers.length; mi++) {
        h.push('<span class="matcher">' + escHtml(evtData2.matchers[mi]) + '</span>');
      }
      h.push('</div>');
    }

    // Modules (expandable with source)
    for (var mod_i = 0; mod_i < mods2.length; mod_i++) {
      var m = mods2[mod_i];
      var iconClass = m.archived ? "icon-archived" : (m.scope !== "global" ? "icon-project" : "icon-active");
      var scopeClass = m.archived ? "scope-archived" : (m.scope !== "global" ? "scope-project" : "scope-global");
      var scopeLabel = m.archived ? "ARCHIVED" : (m.scope !== "global" ? m.scope : "GLOBAL");
      var nameStyle = m.archived ? ' style="color:#484f58;text-decoration:line-through"' : '';

      h.push('<div class="module">');
      h.push('<div class="module-header" onclick="toggleModule(this)">');
      h.push('<span class="module-chevron">&#9654;</span>');
      h.push('<div class="module-icon ' + iconClass + '"></div>');
      h.push('<span class="module-name"' + nameStyle + '>' + escHtml(m.name) + '</span>');
      if (m.description) h.push('<span class="module-desc">&mdash; ' + escHtml(m.description) + '</span>');
      h.push('<span class="module-scope ' + scopeClass + '">' + scopeLabel + '</span>');
      h.push('</div>');
      h.push('<div class="module-detail">');
      if (m.source) {
        var lines = m.source.split("\n");
        // Build code block as single string to avoid double line spacing from h.join("\n")
        var codeLines = [];
        for (var li = 0; li < lines.length; li++) {
          var lnStr = String(li + 1);
          while (lnStr.length < 3) lnStr = " " + lnStr;
          codeLines.push('<span class="ln">' + lnStr + '</span>' + escHtml(lines[li]));
        }
        h.push('<div class="code-block"><pre>' + codeLines.join("\n") + '</pre></div>');
      }
      h.push('</div></div>');
    }

    h.push('</div></div>');
  }

  h.push('<div class="footer">Generated by hook-runner setup.js &mdash; ' + now + '</div>');
  h.push('<script>');
  h.push('function toggleEvent(el){var b=el.nextElementSibling;var c=el.querySelector(".chevron");b.classList.toggle("open");c.classList.toggle("open");el.classList.toggle("collapsed")}');
  h.push('function toggleModule(el){var d=el.nextElementSibling;var c=el.querySelector(".module-chevron");d.classList.toggle("open");c.classList.toggle("open")}');
  h.push('</script>');
  h.push('</body></html>');

  var content = h.join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}

// ============================================================
// 3. Backup Engine
// ============================================================

function backupHooks(scan) {
  var ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  var backupDir = path.join(ARCHIVE_DIR, "backup-" + ts);
  fs.mkdirSync(backupDir, { recursive: true });

  var manifest = {
    timestamp: ts,
    platform: process.platform,
    backupDir: backupDir,
    files: [],
    settingsHooks: null
  };

  // Backup settings.json hooks section
  if (fs.existsSync(SETTINGS_PATH)) {
    var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    manifest.settingsHooks = settings.hooks || {};
    fs.writeFileSync(
      path.join(backupDir, "hooks-backup.json"),
      JSON.stringify(settings.hooks || {}, null, 2),
      "utf-8"
    );
    // Also backup full settings.json
    fs.copyFileSync(SETTINGS_PATH, path.join(backupDir, "settings.json"));
    manifest.files.push({ original: SETTINGS_PATH, backed: "settings.json" });
  }

  // Backup each script file referenced in hooks
  for (var i = 0; i < scan.scripts.length; i++) {
    var src = scan.scripts[i];
    if (!fs.existsSync(src)) continue;
    var name = path.basename(src);
    // Avoid name collisions
    var destName = name;
    var counter = 1;
    while (fs.existsSync(path.join(backupDir, destName))) {
      destName = name.replace(/\.js$/, "-" + counter + ".js");
      counter++;
    }
    fs.copyFileSync(src, path.join(backupDir, destName));
    manifest.files.push({ original: src, backed: destName });
  }

  // Backup existing run-modules if they exist
  var runModulesDir = path.join(HOOKS_DIR, "run-modules");
  if (fs.existsSync(runModulesDir)) {
    var rmBackup = path.join(backupDir, "run-modules");
    copyDirRecursive(runModulesDir, rmBackup);
    manifest.files.push({ original: runModulesDir, backed: "run-modules/" });
  }

  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return { backupDir: backupDir, manifest: manifest };
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var srcPath = path.join(src, entries[i].name);
    var destPath = path.join(dest, entries[i].name);
    if (entries[i].isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================================
// 4. Installer
// ============================================================

function installRunners(dryRun) {
  var changes = [];

  // Ensure hooks dir exists
  if (!dryRun) fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy runner scripts + load-modules.js
  var runnerFiles = ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "load-modules.js"];
  for (var i = 0; i < runnerFiles.length; i++) {
    var src = path.join(REPO_DIR, runnerFiles[i]);
    var dest = path.join(HOOKS_DIR, runnerFiles[i]);
    if (!fs.existsSync(src)) {
      changes.push({ action: "skip", file: runnerFiles[i], reason: "source not found" });
      continue;
    }
    if (!dryRun) fs.copyFileSync(src, dest);
    changes.push({ action: dryRun ? "would-copy" : "copied", file: runnerFiles[i], dest: dest });
  }

  // Create run-modules directories
  var eventDirs = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
  for (var j = 0; j < eventDirs.length; j++) {
    var dir = path.join(HOOKS_DIR, "run-modules", eventDirs[j]);
    if (!fs.existsSync(dir)) {
      if (!dryRun) fs.mkdirSync(dir, { recursive: true });
      changes.push({ action: dryRun ? "would-create" : "created", file: "run-modules/" + eventDirs[j] + "/" });
    } else {
      changes.push({ action: "exists", file: "run-modules/" + eventDirs[j] + "/" });
    }
  }

  // Update settings.json
  var settingsChanges = updateSettings(dryRun);
  changes = changes.concat(settingsChanges);

  return changes;
}

function updateSettings(dryRun) {
  var changes = [];
  var settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  }

  if (!settings.hooks) settings.hooks = {};

  // Define the hook-runner settings.json entries
  var runnerConfig = {
    SessionStart: [
      { hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-sessionstart.js"', timeout: 5 }] }
    ],
    Stop: [
      { hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-stop.js"', timeout: 5 }] }
    ],
    PreToolUse: [
      { matcher: "Edit", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] },
      { matcher: "Write", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] },
      { matcher: "Bash", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] }
    ],
    PostToolUse: [
      { matcher: "Write", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-posttooluse.js"', timeout: 5 }] },
      { matcher: "Edit", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-posttooluse.js"', timeout: 5 }] }
    ]
  };

  // Preserve existing matchers the user has that we don't define
  var existingEvents = Object.keys(settings.hooks);
  for (var i = 0; i < existingEvents.length; i++) {
    var evt = existingEvents[i];
    if (!runnerConfig[evt]) {
      // Unknown event — check if it's already a runner, preserve if so
      var entries = settings.hooks[evt];
      if (Array.isArray(entries)) {
        var hasRunner = false;
        for (var j = 0; j < entries.length; j++) {
          var h = (entries[j].hooks || [])[0] || {};
          if (h.command && /run-\w+\.js/.test(h.command)) hasRunner = true;
        }
        if (!hasRunner) {
          // Create a runner entry for this unknown event
          var runnerName = "run-" + evt.toLowerCase() + ".js";
          changes.push({ action: "note", file: evt, reason: "custom event — preserving existing config" });
        }
      }
    }
  }

  settings.hooks = runnerConfig;
  changes.push({ action: dryRun ? "would-update" : "updated", file: "settings.json hooks section" });

  if (!dryRun) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  }

  return changes;
}

// ============================================================
// 5. Preview
// ============================================================

function printPreview(scan) {
  console.log("");
  console.log("=== hook-runner: What Will Change ===");
  console.log("");
  console.log("CURRENT:");
  var eventNames = Object.keys(scan.events);
  if (eventNames.length === 0) {
    console.log("  No hooks configured in settings.json");
  } else {
    for (var i = 0; i < eventNames.length; i++) {
      var evt = scan.events[eventNames[i]];
      var desc = eventNames[i] + ": " + evt.entries.length + " hook(s)";
      if (evt.matchers.length > 0) desc += " [" + evt.matchers.join(", ") + "]";
      if (evt.entries[0] && evt.entries[0].isRunner) desc += " (already runner)";
      console.log("  " + desc);
    }
  }

  console.log("");
  console.log("AFTER hook-runner installation:");
  console.log("  ~/.claude/hooks/");
  console.log("    load-modules.js          # shared module loader");
  console.log("    run-pretooluse.js         # PreToolUse runner");
  console.log("    run-posttooluse.js        # PostToolUse runner");
  console.log("    run-stop.js               # Stop runner");
  console.log("    run-sessionstart.js       # SessionStart runner");
  console.log("    run-modules/");
  console.log("      PreToolUse/*.js         # gate modules (block/allow)");
  console.log("      PostToolUse/*.js        # check modules");
  console.log("      Stop/*.js               # stop-control modules");
  console.log("      SessionStart/*.js       # context-injection modules");
  console.log("");
  console.log("  settings.json hooks → one entry per event+matcher, all pointing to runners");
  console.log("");
  console.log("BACKUP:");
  console.log("  All existing hook files → ~/.claude/hooks/archive/backup-<timestamp>/");
  console.log("  Includes: settings.json, all referenced scripts, run-modules/");
  console.log("");
}

// ============================================================
// 6. Module Sync (fetch from GitHub per modules.yaml)
// ============================================================

var MODULES_YAML_PATH = path.join(HOOKS_DIR, "modules.yaml");
var DEFAULT_SOURCE = "grobomo/hook-runner";
var DEFAULT_BRANCH = "main";

/**
 * Minimal YAML parser for modules.yaml format.
 * Handles: top-level scalars, nested keys (one level), list items (- value).
 */
function parseModulesYaml(content) {
  var result = { source: DEFAULT_SOURCE, branch: DEFAULT_BRANCH, modules: {}, project_modules: {} };
  var lines = content.split("\n");
  var currentSection = null;
  var currentEvent = null;
  var currentProject = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.replace(/\s+$/, "");
    if (/^\s*#/.test(trimmed) || /^\s*$/.test(trimmed)) continue;

    // Top-level scalar: source: value, branch: value
    var scalarMatch = trimmed.match(/^(\w+):\s+(.+)/);
    if (scalarMatch) {
      var key = scalarMatch[1];
      var val = scalarMatch[2].trim();
      if (key === "source") { result.source = val; continue; }
      if (key === "branch") { result.branch = val; continue; }
    }

    // Section headers
    if (/^modules:\s*$/.test(trimmed)) { currentSection = "modules"; currentEvent = null; currentProject = null; continue; }
    if (/^project_modules:\s*$/.test(trimmed)) { currentSection = "project_modules"; currentEvent = null; currentProject = null; continue; }

    // Event key under modules (2-space indent): "  PreToolUse:"
    var eventMatch = trimmed.match(/^  (\w+):\s*$/);
    if (eventMatch && currentSection === "modules") {
      currentEvent = eventMatch[1];
      if (!result.modules[currentEvent]) result.modules[currentEvent] = [];
      currentProject = null;
      continue;
    }

    // Project key under project_modules (2-space indent)
    var projMatch = trimmed.match(/^  ([\w-]+):\s*$/);
    if (projMatch && currentSection === "project_modules") {
      currentProject = projMatch[1];
      if (!result.project_modules[currentProject]) result.project_modules[currentProject] = {};
      currentEvent = null;
      continue;
    }

    // Event key under project (4-space indent)
    var projEventMatch = trimmed.match(/^    (\w+):\s*$/);
    if (projEventMatch && currentSection === "project_modules" && currentProject) {
      currentEvent = projEventMatch[1];
      if (!result.project_modules[currentProject][currentEvent]) result.project_modules[currentProject][currentEvent] = [];
      continue;
    }

    // List item under modules event (4-space indent): "    - module-name"
    var listMatch = trimmed.match(/^    -\s+([\w\/_-]+)/);
    if (listMatch && currentSection === "modules" && currentEvent) {
      result.modules[currentEvent].push(listMatch[1]);
      continue;
    }

    // List item under project_modules event (6-space indent)
    var projListMatch = trimmed.match(/^      -\s+([\w\/_-]+)/);
    if (projListMatch && currentSection === "project_modules" && currentProject && currentEvent) {
      result.project_modules[currentProject][currentEvent].push(projListMatch[1]);
      continue;
    }
  }

  return result;
}

/**
 * Fetch a file from GitHub raw content via curl.
 */
function fetchFromGitHub(source, branch, filePath) {
  var url = "https://raw.githubusercontent.com/" + source + "/" + branch + "/" + filePath;
  try {
    return cp.execSync('curl -fsSL "' + url + '"', { encoding: "utf-8", timeout: 15000 });
  } catch (e) {
    return null;
  }
}

/**
 * Sync modules from GitHub per modules.yaml config.
 * @param {boolean} dryRun - if true, just show what would happen
 * @returns {Array} list of changes
 */
function syncModules(dryRun) {
  var changes = [];

  if (!fs.existsSync(MODULES_YAML_PATH)) {
    console.log("  No modules.yaml found at " + MODULES_YAML_PATH);
    console.log("  Create one from the example:");
    console.log("    curl -fsSL https://raw.githubusercontent.com/" + DEFAULT_SOURCE + "/" + DEFAULT_BRANCH + "/modules.example.yaml > \"" + MODULES_YAML_PATH + "\"");
    return changes;
  }

  var config = parseModulesYaml(fs.readFileSync(MODULES_YAML_PATH, "utf-8"));
  console.log("  Source: " + config.source + " (branch: " + config.branch + ")");

  // Sync global modules
  var events = Object.keys(config.modules);
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var moduleNames = config.modules[event];
    var targetDir = path.join(HOOKS_DIR, "run-modules", event);
    if (!dryRun) fs.mkdirSync(targetDir, { recursive: true });

    for (var j = 0; j < moduleNames.length; j++) {
      var modName = moduleNames[j];
      var remotePath = "modules/" + event + "/" + modName + ".js";
      var localPath = path.join(targetDir, modName + ".js");
      var existing = fs.existsSync(localPath) ? fs.readFileSync(localPath, "utf-8") : null;

      process.stdout.write("  " + event + "/" + modName + ".js ... ");
      var content = fetchFromGitHub(config.source, config.branch, remotePath);

      if (!content) {
        changes.push({ action: "error", file: event + "/" + modName + ".js", reason: "not found in repo" });
        console.log("NOT FOUND");
        continue;
      }
      if (existing === content) {
        changes.push({ action: "up-to-date", file: event + "/" + modName + ".js" });
        console.log("up to date");
        continue;
      }
      if (!dryRun) fs.writeFileSync(localPath, content);
      var action = dryRun ? "would-" + (existing ? "update" : "install") : (existing ? "updated" : "installed");
      changes.push({ action: action, file: event + "/" + modName + ".js" });
      console.log(action);
    }
  }

  // Sync project-scoped modules
  var projects = Object.keys(config.project_modules);
  for (var pi = 0; pi < projects.length; pi++) {
    var projName = projects[pi];
    var projEvents = Object.keys(config.project_modules[projName]);
    for (var pe = 0; pe < projEvents.length; pe++) {
      var pEvent = projEvents[pe];
      var pModules = config.project_modules[projName][pEvent];
      var pTargetDir = path.join(HOOKS_DIR, "run-modules", pEvent, projName);
      if (!dryRun) fs.mkdirSync(pTargetDir, { recursive: true });

      for (var pm = 0; pm < pModules.length; pm++) {
        var pModName = pModules[pm];
        var pRemotePath = "modules/" + pEvent + "/" + pModName + ".js";
        var pLocalPath = path.join(pTargetDir, path.basename(pModName) + ".js");
        var pExisting = fs.existsSync(pLocalPath) ? fs.readFileSync(pLocalPath, "utf-8") : null;

        process.stdout.write("  " + pEvent + "/" + projName + "/" + path.basename(pModName) + ".js ... ");
        var pContent = fetchFromGitHub(config.source, config.branch, pRemotePath);

        if (!pContent) {
          changes.push({ action: "error", file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js", reason: "not found" });
          console.log("NOT FOUND");
          continue;
        }
        if (pExisting === pContent) {
          changes.push({ action: "up-to-date", file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js" });
          console.log("up to date");
          continue;
        }
        if (!dryRun) fs.writeFileSync(pLocalPath, pContent);
        var pAction = dryRun ? "would-" + (pExisting ? "update" : "install") : (pExisting ? "updated" : "installed");
        changes.push({ action: pAction, file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js" });
        console.log(pAction);
      }
    }
  }

  return changes;
}

// ============================================================
// 7. Main Orchestrator
// ============================================================

function openFile(filePath) {
  try {
    if (process.platform === "win32") {
      cp.execSync('start "" "' + filePath + '"', { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      cp.execSync('open "' + filePath + '"', { stdio: "ignore" });
    } else {
      cp.execSync('xdg-open "' + filePath + '"', { stdio: "ignore" });
    }
  } catch (e) { /* ignore */ }
}

function main() {
  var args = process.argv.slice(2);
  var reportOnly = args.indexOf("--report") !== -1;
  var dryRun = args.indexOf("--dry-run") !== -1;
  var installOnly = args.indexOf("--install") !== -1;
  var syncMode = args.indexOf("--sync") !== -1;

  // --- Sync mode: fetch modules from GitHub per modules.yaml ---
  if (syncMode) {
    console.log("[hook-runner] Module Sync");
    console.log("========================");
    console.log("  Config: " + MODULES_YAML_PATH);
    if (dryRun) console.log("  (dry-run mode)");
    console.log("");
    var syncChanges = syncModules(dryRun);
    var installed = syncChanges.filter(function(c) { return c.action === "installed" || c.action === "updated"; }).length;
    var upToDate = syncChanges.filter(function(c) { return c.action === "up-to-date"; }).length;
    var wouldChange = syncChanges.filter(function(c) { return /^would-/.test(c.action); }).length;
    var errors = syncChanges.filter(function(c) { return c.action === "error"; }).length;
    console.log("");
    if (dryRun) {
      console.log("[hook-runner] Dry-run: " + wouldChange + " would change, " + upToDate + " up to date" + (errors ? ", " + errors + " errors" : ""));
    } else {
      console.log("[hook-runner] Sync complete: " + installed + " installed/updated, " + upToDate + " up to date" + (errors ? ", " + errors + " errors" : ""));
    }
    return;
  }

  console.log("[hook-runner] Setup Wizard");
  console.log("========================");

  // Step 1: Scan
  console.log("[1/5] Scanning current hooks...");
  var scan = scanHooks();
  var eventNames = Object.keys(scan.events);
  console.log("  Found " + scan.totalHooks + " hook(s) across " + eventNames.length + " event(s)");

  // Step 2: Generate "before" report
  console.log("[2/5] Generating hooks report...");
  var beforeReport = path.join(REPORT_DIR, "hooks-report-before.html");
  generateReport(scan, beforeReport);
  console.log("  Report: " + beforeReport);
  openFile(beforeReport);

  if (reportOnly) {
    console.log("\n[hook-runner] Report-only mode. Done.");
    return;
  }

  // Step 3: Preview
  printPreview(scan);

  if (dryRun) {
    console.log("[hook-runner] Dry-run mode. Showing what would change...");
    var dryChanges = installRunners(true);
    for (var d = 0; d < dryChanges.length; d++) {
      console.log("  " + dryChanges[d].action + ": " + dryChanges[d].file);
    }
    console.log("\n[hook-runner] Dry-run complete. No changes made.");
    return;
  }

  // Step 4: Backup
  console.log("[3/5] Backing up existing hooks...");
  var backup = backupHooks(scan);
  console.log("  Backed up " + backup.manifest.files.length + " file(s)");
  console.log("  Archive: " + backup.backupDir);

  // Step 5: Install
  console.log("[4/5] Installing hook-runner...");
  var changes = installRunners(false);
  for (var c = 0; c < changes.length; c++) {
    var ch = changes[c];
    console.log("  " + ch.action + ": " + ch.file + (ch.reason ? " (" + ch.reason + ")" : ""));
  }

  // Step 6: Verify — re-scan and generate "after" report
  console.log("[5/5] Verifying installation...");
  var afterScan = scanHooks();
  var afterReport = path.join(REPORT_DIR, "hooks-report.html");
  generateReport(afterScan, afterReport);
  console.log("  Report: " + afterReport);
  openFile(afterReport);

  // Summary
  console.log("");
  console.log("============================================");
  console.log("[hook-runner] Installation Complete");
  console.log("============================================");
  console.log("  Runners installed: ~/.claude/hooks/run-*.js");
  console.log("  Module dirs: ~/.claude/hooks/run-modules/{Event}/");
  console.log("  Backup: " + backup.backupDir);
  console.log("  Report: " + afterReport);
  console.log("");
  console.log("  To add a hook module:");
  console.log("    Create ~/.claude/hooks/run-modules/<Event>/my-module.js");
  console.log("    Export: module.exports = function(input) { return null; }");
  console.log("");
  console.log("  To restore original hooks:");
  console.log("    cp " + backup.backupDir + "/settings.json ~/.claude/settings.json");
  console.log("============================================");
}

module.exports = { scanHooks: scanHooks, generateReport: generateReport, backupHooks: backupHooks, installRunners: installRunners };

if (require.main === module) main();
