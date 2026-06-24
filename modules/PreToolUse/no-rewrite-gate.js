// TOOLS: Write, Bash
// WORKFLOW: haiku-rules
// WHY: Rewrites silently drop existing logic. 99% of changes should be Edit (in-place).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ NO-REWRITE GATE                                                         │
// │                                                                         │
// │ Blocks Write tool on files that already exist. Forces Edit (in-place).  │
// │ Write to NEW files is always allowed.                                   │
// │                                                                         │
// │ Override: only if file has a .rewrite-approved sidecar file or if the   │
// │ file path matches ALLOW_PATTERNS (docs, config, generated output).      │
// │                                                                         │
// │ INCIDENT: Rewrote context-reset/new_session.py WSL block to fix one     │
// │ semicolon bug — inadvertently dropped profile detection, workspace      │
// │ pre-trust, and _get_wsl_claude_cmd(). Three regressions from one fix.   │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";
var _LOG_PATH = require("path").join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "hook-log.jsonl");
function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = require("path").basename(__filename, ".js");
  try { require("fs").appendFileSync(_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch(e) {}
}


var fs = require("fs");
var path = require("path");

// Files that are OK to fully rewrite (generated, config, docs, planning)
var ALLOW_PATTERNS = [
  /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/, /README\.md$/,
  /MEMORY\.md$/, /CHANGELOG\.md$/,
  /\.gitignore$/, /\.env\.example$/, /publish\.json$/,
  /\/specs\//, /\.planning\//, /\.github\//,
  /\/hooks\/.*\.js$/, /\.claude\//,
  /\.coconut\//, /\.claude-next-prompt$/,
  /config\.example\.(yaml|json|toml)$/,
  /LICENSE$/,
  /\.(service|timer|socket|mount)$/,  // systemd units are declarative config
];

// Bash patterns that overwrite existing files
var BASH_OVERWRITE_PATTERNS = [
  // Redirect to file: > file, >> is append (OK), but > is overwrite
  /(?<![>12])>\s*[^\s|&>]/,
  // tee without -a (append) overwrites
  /\btee\s+(?!-a\b)/,
  // mv that renames existing code files (cp is too noisy — relies on target-exists check below)
  /\bmv\s+.*\.(py|js|ts|sh|yaml|yml|json)\s+/,
  // sed -i (in-place edit via bash — should use Edit tool instead)
  /\bsed\s+-i/,
  // heredoc/cat to existing file
  /\bcat\s*<<.*>\s*[^\s]+\.(py|js|ts|sh|yaml|yml|json)/,
];

// Bash commands that are always safe (read-only, new-file-only, or infra)
var BASH_SAFE_PATTERNS = [
  /^\s*git\b/, /^\s*gh\b/, /^\s*gh_auto\b/,
  /^\s*ls\b/, /^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/,
  /^\s*grep\b/, /^\s*rg\b/, /^\s*find\b/, /^\s*fd\b/,
  /^\s*wc\b/, /^\s*diff\b/, /^\s*pwd\b/, /^\s*which\b/,
  /^\s*echo\b/, /^\s*printf\b/,
  /^\s*jq\b/, /^\s*sort\b/, /^\s*node\s+-e\b/, /^\s*python3?\s+-c\b/,
  /^\s*curl\b/, /^\s*date\b/, /^\s*file\b/, /^\s*stat\b/,
  /^\s*test\b/, /^\s*\[\s/, /^\s*true\b/, /^\s*false\b/,
  /^\s*mkdir\b/, /^\s*touch\b/, /^\s*chmod\b/, /^\s*rm\b/,
  /^\s*npm\b/, /^\s*npx\b/, /^\s*pip\b/, /^\s*cargo\b/,
  /^\s*systemctl\b/, /^\s*journalctl\b/, /^\s*docker\b/,
  /^\s*python3?\s+\S+\.py/, /^\s*node\s+\S+\.js/,
  /^\s*bash\s+\S+\.sh/, /^\s*source\b/, /^\s*\.\s+/,
  /^\s*cd\b/, /^\s*export\b/, /^\s*set\b/, /^\s*unset\b/,
  /^\s*sleep\b/, /^\s*kill\b/, /^\s*pkill\b/,
  /truncate\s+-s\s+0/, // truncating log files is fine
];

function extractBashTarget(cmd) {
  // Try to extract the target file from a redirect
  var match = cmd.match(/(?<![>12])>\s*([^\s|&>]+)/);
  if (match) return match[1].replace(/['"]/g, "");
  // tee target
  match = cmd.match(/\btee\s+(?!-a\b)([^\s|&;]+)/);
  if (match) return match[1].replace(/['"]/g, "");
  // mv target (last argument — destination)
  match = cmd.match(/\bmv\s+(?:-[a-zA-Z]+\s+)*(\S+)\s+(\S+)/);
  if (match) return match[2].replace(/['"]/g, "");
  return null;
}

module.exports = function(input) {
  var _tool = (input.tool_name || ""); var _file = ((input.tool_input||{}).file_path||"").split("/").pop(); var _cmd = ((input.tool_input||{}).command||"").slice(0,60);
  _log({event:"PreToolUse",result:"invoke",tool:_tool,file:_file,cmd:_cmd});
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Bash") return null;

  // --- Write tool ---
  if (tool === "Write") {
    var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
    if (!filePath) return null;

    for (var i = 0; i < ALLOW_PATTERNS.length; i++) {
      if (ALLOW_PATTERNS[i].test(filePath)) return null;
    }

    try {
      fs.accessSync(filePath, fs.constants.F_OK);
    } catch (e) {
      return null; // new file — allowed
    }

    // T796: Check for .rewrite-approved sidecar file (one-time override)
    var approvedPath = filePath + ".rewrite-approved";
    try {
      fs.accessSync(approvedPath, fs.constants.F_OK);
      // Sidecar exists — allow rewrite, then delete the sidecar (one-time use)
      try { fs.unlinkSync(approvedPath); } catch (e2) { /* best effort */ }
      _log({event:"PreToolUse",result:"allow",tool:_tool,file:_file,reason:"rewrite-approved sidecar"});
      return null;
    } catch (e) {
      // No sidecar — continue to block
    }

    _log({event:"PreToolUse",result:"block",tool:_tool,file:_file,cmd:_cmd});

    return {
      decision: "block",
      reason: [
        "BLOCKED: Write to existing file '" + path.basename(filePath) + "'",
        "WHY: Rewrites silently drop existing logic — one semicolon fix caused three regressions by losing profile detection, workspace pre-trust, and WSL command builder.",
        "NEXT STEPS:",
        "1. Use the Edit tool for targeted in-place changes (old_string → new_string)",
        "2. If a full rewrite is genuinely needed, touch " + filePath + ".rewrite-approved to override",
        'FALSE POSITIVE? File a TODO in hook-runner: "Fix no-rewrite-gate — {describe the issue}"',
      ].join("\n"),
    };
  }

  // --- Bash tool ---
  var cmd = ((input.tool_input || {}).command || "").trim();
  if (!cmd) return null;

  // Check safe patterns first (fast path)
  var firstCmd = cmd.replace(/^(\s*cd\s+[^;&|]+\s*&&\s*)+/, "").trim().split("|")[0].trim();
  for (var si = 0; si < BASH_SAFE_PATTERNS.length; si++) {
    if (BASH_SAFE_PATTERNS[si].test(firstCmd)) return null;
  }

  // Check for overwrite patterns
  for (var oi = 0; oi < BASH_OVERWRITE_PATTERNS.length; oi++) {
    if (BASH_OVERWRITE_PATTERNS[oi].test(cmd)) {
      var target = extractBashTarget(cmd);
      if (target) {
        // Allow if target doesn't exist yet (new file)
        var resolved = target.startsWith("/") ? target : path.resolve(process.cwd(), target);
        try { fs.accessSync(resolved, fs.constants.F_OK); } catch (e) { return null; }
        // Allow if target matches ALLOW_PATTERNS
        for (var ai = 0; ai < ALLOW_PATTERNS.length; ai++) {
          if (ALLOW_PATTERNS[ai].test(resolved)) return null;
        }
      }
      _log({event:"PreToolUse",result:"block",tool:_tool,file:_file,cmd:_cmd});

      return {
        decision: "block",
        reason: [
          "BLOCKED: Bash command would overwrite existing file" + (target ? " '" + path.basename(target) + "'" : ""),
          "WHY: Bash redirects silently replace entire file contents — existing logic is lost without review.",
          "NEXT STEPS:",
          "1. Use the Edit tool for targeted in-place changes",
          "2. If redirect is intentional (new file, log truncation), verify the target doesn't exist",
          'FALSE POSITIVE? File a TODO in hook-runner: "Fix no-rewrite-gate — {describe the issue}"',
        ].join("\n"),
      };
    }
  }

  return null;
};
