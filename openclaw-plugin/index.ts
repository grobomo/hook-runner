/**
 * hook-runner-gates — Ported hook-runner gate modules for OpenClaw
 *
 * 25 modules ported from hook-runner's CommonJS format to OpenClaw Plugin SDK.
 *
 * before_tool_call gates (17):
 *   force-push-gate, secret-scan-gate, commit-quality-gate,
 *   git-destructive-guard, archive-not-delete, git-rebase-safety,
 *   no-hardcoded-paths, victory-declaration-gate, root-cause-gate,
 *   no-fragile-heuristics, no-focus-steal, crlf-ssh-key-check,
 *   unresolved-issues-gate, no-nested-claude, disk-space-guard,
 *   no-unnecessary-sleep, claude-p-pattern
 *
 * after_tool_call gates (8):
 *   commit-msg-check, crlf-detector, test-coverage-check,
 *   result-review-gate, rule-hygiene, empty-output-detector,
 *   disk-space-detect, troubleshoot-detector
 *
 * Ported from: https://github.com/grobomo/hook-runner
 * Original format: CommonJS (PreToolUse/PostToolUse gates)
 * OpenClaw format: Plugin SDK (definePluginEntry + api.on events)
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { homedir, tmpdir } from "node:os";

// ── Types ──────────────────────────────────────────────────────────────────

interface GateConfig {
  modules?: Record<string, boolean>;
}

interface SecretPattern {
  name: string;
  re: RegExp;
  context?: RegExp;
}

type GateFunction = (toolName: string, params: Record<string, unknown>) => string | null;
type AfterGateFunction = (toolName: string, params: Record<string, unknown>, result?: string) => string | null;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract commit message from a git commit command string. */
function extractCommitMsg(cmd: string): string {
  const heredocMatch = cmd.match(/-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) return heredocMatch[1].trim();
  const mMatch = cmd.match(/-m\s+["']([^"']+)["']/);
  if (mMatch) return mMatch[1].trim();
  return "";
}

/**
 * Strip heredoc bodies and quoted strings from a command to avoid false positives
 * on prose that mentions commands but doesn't execute them.
 */
function stripQuotedContent(cmd: string): string {
  return cmd
    .replace(/<<\s*['"]?(\w+)['"]?[\s\S]*?\n\1(\s|$)/g, " ")
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
}

// ═══════════════════════════════════════════════════════════════════════════
// BEFORE_TOOL_CALL GATES (PreToolUse)
// ═══════════════════════════════════════════════════════════════════════════

// ── force-push-gate ──────────────────────────────────────────────────────
// WHY: Force-pushing to main/master can destroy shared history and others' work.

function forcePushGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "").replace(/\s+/g, " ").trim();
  if (!/\bgit\s+push\b/.test(cmd)) return null;

  const hasForce = /\s--force\b/.test(cmd) || /\s-f\b/.test(cmd) || /\s--force-with-lease\b/.test(cmd);
  if (!hasForce) return null;

  for (const branch of ["main", "master"]) {
    if (new RegExp("\\b" + branch + "\\b").test(cmd)) {
      return `BLOCKED: Force-push to ${branch} is destructive and irreversible. Use a regular push or create a revert commit instead.`;
    }
  }

  return null;
}

// ── secret-scan-gate ─────────────────────────────────────────────────────
// WHY: API keys were committed to git history and had to be rotated.

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS Secret Key", re: /[0-9a-zA-Z/+=]{40}(?=\s|"|'|$)/, context: /aws_secret|secret_access|SECRET_KEY/i },
  { name: "Azure Storage Key", re: /[A-Za-z0-9+/]{86}==/ },
  { name: "Azure SAS Token", re: /sig=[A-Za-z0-9%+/=]{20,}/ },
  { name: "GitHub Token", re: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: "Generic API Key", re: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i },
  { name: "Generic Password", re: /(?:password|passwd|pwd)\s*[:=]\s*\\?["']?[^\s"']{8,}/i },
  { name: "Generic Token", re: /(?:token|secret|bearer)\s*[:=]\s*\\?["']?[A-Za-z0-9_\-.]{20,}/i },
  { name: "Private Key", re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "Connection String", re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]{20,}/ },
];

function secretScanGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/^\s*git\s+commit/.test(cmd) && !/&&\s*git\s+commit/.test(cmd)) return null;

  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--cached", "--diff-filter=ACMR"], {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return null;
  }

  if (!diff) return null;

  const addedLines = diff.split("\n").filter((line) =>
    line.charAt(0) === "+" && !line.startsWith("+++")
  );

  const filteredLines = addedLines.filter((line) => {
    if (/os\.environ|process\.env|getenv|secretsmanager|get-secret-value|credential/i.test(line)) return false;
    if (/[:=]\s*["']?\s*["']?\s*$/.test(line)) return false;
    if (/\$\{?\w*TOKEN\w*[:\-}]/.test(line)) return false;
    if (/\$\{?\w*SECRET\w*[:\-}]/.test(line)) return false;
    return true;
  });
  const filteredText = filteredLines.join("\n");

  const findings: string[] = [];
  for (const pat of SECRET_PATTERNS) {
    if (filteredLines.some((line) => pat.re.test(line))) {
      if (pat.context && !pat.context.test(filteredText)) continue;
      findings.push(pat.name);
    }
  }

  if (findings.length > 0) {
    return (
      "SECRET SCAN: Potential secrets detected in staged changes:\n" +
      findings.map((f) => "  - " + f).join("\n") +
      "\nReview with: git diff --cached\n" +
      "Use environment variables or credential-manager instead of hardcoded secrets."
    );
  }

  return null;
}

// ── commit-quality-gate ──────────────────────────────────────────────────
// WHY: Generic commit messages like "fix" or "update" make git history useless.

const GENERIC_STARTS = /^\s*(fix|update|change|modify|edit|tweak|adjust|minor|wip|tmp|temp|stuff|misc|cleanup)\b/i;
const MIN_WORDS = 5;

function commitQualityGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/git\s+commit/.test(cmd)) return null;
  if (/--amend/.test(cmd)) return null;

  const msg = extractCommitMsg(cmd);
  if (!msg) return null;

  const words = msg.split(/\s+/).filter((w) => w.length > 0);

  if (words.length < MIN_WORDS) {
    return (
      `COMMIT MESSAGE TOO SHORT: ${words.length} words (min ${MIN_WORDS}).\n` +
      `Your message: "${msg}"\n` +
      'Good format: "Fix <what> — <why>" or "Add <feature> for <purpose>"'
    );
  }

  if (GENERIC_STARTS.test(msg) && words.length < 8) {
    return (
      `COMMIT MESSAGE TOO GENERIC: starts with '${words[0]}' without enough detail.\n` +
      `Your message: "${msg}"\n` +
      'Say WHAT changed and WHY. Example: "Fix spec-gate cache — stale hasUnchecked when tasks.md edited"'
    );
  }

  return null;
}

// ── git-destructive-guard ────────────────────────────────────────────────
// WHY: Claude ran `git reset --hard` and `git checkout .` to "clean up" working
// trees, destroying uncommitted work. These ops are rarely the right solution.

function gitDestructiveGuard(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const fullCmd = String(params.command || "");
  const cmd = stripQuotedContent(fullCmd);

  // git reset --hard — destroys uncommitted changes
  if (/git\s+reset\s+--hard/.test(cmd)) {
    return (
      "DESTRUCTIVE: git reset --hard destroys uncommitted changes permanently.\n" +
      "Alternatives:\n" +
      "  git stash        — save changes for later\n" +
      "  git reset --soft — move HEAD but keep changes staged\n" +
      "  git checkout <file> — revert specific files only\n" +
      "If you truly need --hard, ask the user first."
    );
  }

  // git checkout/restore — discards uncommitted changes to files
  const checkoutMatch = cmd.match(/git\s+(checkout|restore)\s+(.*)/);
  if (checkoutMatch) {
    const subcmd = checkoutMatch[1];
    const args = checkoutMatch[2].split(/\s*(?:&&|\|\||\||;|[12]?>>?)\s*/)[0].trim();
    // Allow branch operations
    if (subcmd === "checkout" && /^(-b|--orphan|-t|--track|-)\s/.test(args)) return null;
    // Allow bare branch name (no dots/slashes = not a file path)
    if (subcmd === "checkout" && args && !/[.\/\\]/.test(args) && !/^--\s/.test(args)) return null;
    return (
      `DESTRUCTIVE: \`git ${subcmd} ${args}\` discards uncommitted changes.\n` +
      "Alternatives:\n" +
      "  git stash                — save changes for later\n" +
      "  git diff <file>          — review changes first\n" +
      "If you truly need to discard changes, ask the user first."
    );
  }

  // git clean -f/-fd — deletes untracked files
  if (/git\s+clean\s+-[a-z]*f/.test(cmd)) {
    return (
      "DESTRUCTIVE: git clean -f permanently deletes untracked files.\n" +
      "Run git clean -n first to preview what would be deleted.\n" +
      "If you truly need to clean, ask the user first."
    );
  }

  return null;
}

// ── archive-not-delete ───────────────────────────────────────────────────
// WHY: Claude deleted files that turned out to be needed later.
// Block destructive delete commands. Always archive, never delete.

function archiveNotDelete(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");

  // Strip quoted content to avoid false positives
  const stripped = cmd
    .replace(/\$\(cat <<'EOF'[\s\S]*?EOF\s*\)/g, "MSG")
    .replace(/\$\(cat <<EOF[\s\S]*?EOF\s*\)/g, "MSG")
    .replace(/"(?:[^"\\]|\\.)*"/g, "STR")
    .replace(/'(?:[^'\\]|\\.)*'/g, "STR");

  const normalized = stripped.replace(/\s+/g, " ").trim();

  const destructive = [
    /\brm\s+-rf\b/,
    /\brm\s+-fr\b/,
    /\brm\s+-r\b/,
    /\brm\s+--recursive\b/,
    /\brm\b(?!.*\.log\b)(?!.*\.tmp\b)(?!.*node_modules\b)(?!.*__pycache__\b)(?!.*\.pyc\b)/,
    /\brmdir\b/,
    /\bdel\s+\/[sS]\b/i,
    /\brd\s+\/[sS]\b/i,
  ];

  const exceptions = [
    /node_modules/,
    /\.pyc$/,
    /__pycache__/,
    /\.log$/,
    /\.tmp$/,
    /\.cache/,
    /\/tmp\//,
    /\btmp\b.*\brm\b/,
    /dist\//,
    /build\//,
    /\bgit\s+rm\s+(-r\s+)?--cached\b/,
    /\bgit\s+rm\s+--cached\b/,
    /\.git\/.*\.lock\b/,
  ];

  for (const pattern of destructive) {
    if (pattern.test(normalized)) {
      for (const exception of exceptions) {
        if (exception.test(normalized)) return null;
      }
      return (
        "BLOCKED: Destructive delete detected. NEVER delete files or directories. " +
        "Move to archive/ instead. Use: mv <path> archive/ (create archive/ if needed, " +
        "add to .gitignore). Command was: " + cmd.substring(0, 200)
      );
    }
  }

  return null;
}

// ── git-rebase-safety ────────────────────────────────────────────────────
// WHY: During a rebase, --ours/--theirs are REVERSED from intuition.
// Claude used --theirs thinking it meant "my local changes" but during
// rebase it means the upstream branch.

function gitRebaseSafety(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;
  const cmd = String(params.command || "");

  if (/git\s+(rebase|checkout)\s+.*--(ours|theirs)/.test(cmd)) {
    return (
      "REBASE SAFETY: During git rebase, --ours/--theirs are REVERSED:\n" +
      "  --ours  = branch being rebased ONTO (upstream/remote)\n" +
      "  --theirs = YOUR local commits being replayed\n" +
      "During cherry-pick, it's the intuitive direction.\n" +
      "Verify: after rebase, run git diff HEAD~1 --stat to confirm your files are present.\n" +
      "If you're resolving conflicts during rebase, use --theirs to keep YOUR changes."
    );
  }

  if (/git\s+config.*credential\.helper\s+'/.test(cmd)) {
    return (
      "CREDENTIAL HELPER: Use double quotes, not single quotes.\n" +
      'Single quotes in Git Bash double-escape ! to \\! in .git/config.\n' +
      'Correct: git config credential.helper "!gh auth git-credential"\n' +
      "Wrong:   git config credential.helper '!gh auth git-credential'"
    );
  }

  return null;
}

// ── no-hardcoded-paths ───────────────────────────────────────────────────
// WHY: Hardcoded absolute user paths in scripts broke portability across machines.

function noHardcodedPaths(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Write" && toolName !== "Edit") return null;

  const text = toolName === "Write"
    ? String(params.content || "")
    : String(params.new_string || "");

  if (!text) return null;

  const filePath = String(params.file_path || "");
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  // Skip docs and templates
  if (["md", "txt", "html"].includes(ext)) return null;
  if (/cloudformation[\\\/]/i.test(filePath) && ["yaml", "yml"].includes(ext)) return null;
  if (/Dockerfile/i.test(basename(filePath))) return null;

  const winPath = /[A-Z]:[\\\/]Users[\\\/]\w+[\\\/]/i;
  const linuxPath = /\/home\/\w+\//;
  const macPath = /\/Users\/\w+\//;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^(\/\/|#|\/\*|\*|<!--)/.test(trimmed)) continue;
    if (/["'].*example.*["']/i.test(trimmed)) continue;

    let match: RegExpMatchArray | null = null;
    if (winPath.test(trimmed)) match = trimmed.match(winPath);
    else if (linuxPath.test(trimmed)) match = trimmed.match(linuxPath);
    else if (macPath.test(trimmed)) match = trimmed.match(macPath);

    if (match) {
      return (
        `HARDCODED PATH DETECTED in ${toolName} content.\n` +
        `Found: ${match[0]}\n` +
        "Use a variable (HOME, __dirname, process.cwd()) or relative path instead.\n" +
        "Hardcoded absolute paths break portability across machines."
      );
    }
  }

  return null;
}

// ── victory-declaration-gate ─────────────────────────────────────────────
// WHY: Claude declares victory prematurely — "all tests pass" in commit messages
// when failures were skipped, warnings ignored, or outputs not reviewed.

const VICTORY_WORDS = /\b(all\s+(tests?\s+)?pass(ed|ing|es)?|all\s+green|succeeded|fully\s+working|complete[ds]?\s+(successfully)?|100%|zero\s+fail)/i;

function victoryDeclarationGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/git\s+commit/.test(cmd)) return null;

  const msg = extractCommitMsg(cmd);
  if (!msg) return null;

  const title = msg.split("\n")[0];
  if (!VICTORY_WORDS.test(title)) return null;

  return (
    "VICTORY DECLARATION in commit message.\n\n" +
    `Your message claims success: "${msg.substring(0, 120)}"\n\n` +
    "Before committing, verify:\n" +
    "  1. Did you review EVERY failure, warning, and timeout in the output?\n" +
    "  2. Did you check for empty/missing outputs that should have content?\n" +
    "  3. Did you look at what's NOT in the results that should be?\n" +
    "  4. Are there unresolved FAIL/WARN/MISMATCH in TODO.md?\n\n" +
    "Rephrase with specifics:\n" +
    '  BAD:  "All tests pass"\n' +
    '  GOOD: "T442: Fix testbox gate — 17/17 tests pass, synced to live"\n\n' +
    "Include the count, the scope, and what was tested."
  );
}

// ── root-cause-gate ──────────────────────────────────────────────────────
// WHY: Claude masked bugs with cleanup instead of fixing root causes.

const CLEANUP_PATTERNS = [
  /git reset --hard/,
  /git checkout -- \.$/,
  /rm -rf.*requests\//,
  /mv.*requests\/failed/,
  /mv.*requests\/dispatched.*archived/,
];

function rootCauseGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");

  for (const pattern of CLEANUP_PATTERNS) {
    if (pattern.test(cmd)) {
      return (
        "Root cause first: you're about to clean up a symptom. " +
        "Before running this, diagnose WHY it happened and fix the root cause. " +
        "What caused the dirty state / conflict / failure? Fix that first, then clean up."
      );
    }
  }

  return null;
}

// ── no-fragile-heuristics ────────────────────────────────────────────────
// WHY: Claude wrote pixel-ratio thresholds and color-counting heuristics to
// detect blank screenshots. These broke on edge cases. Use LLM analysis instead.

const FRAGILE_PATTERNS = [
  /pixel.*ratio|ratio.*pixel/i,
  /white_ratio|white_ish|white_percent/i,
  /unique_color|color_count|color_divers/i,
  /getpixel|getdata\(\)|\.convert\(.*RGB/i,
  /threshold.*0\.\d+.*blank|blank.*threshold/i,
  /quantize.*color|color.*quantize/i,
];

function noFragileHeuristics(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Edit" && toolName !== "Write") return null;

  const content = toolName === "Edit"
    ? String(params.new_string || "")
    : String(params.content || "");

  const filePath = String(params.file_path || "");

  // Only check verification/review/check scripts
  if (!/review|verify|check|quality|validate|analyz/i.test(filePath)) return null;

  for (const pattern of FRAGILE_PATTERNS) {
    if (pattern.test(content)) {
      return (
        `FRAGILE HEURISTIC DETECTED in ${basename(filePath)}: ` +
        "You're writing pixel/color threshold code for visual judgment. " +
        "This is fragile and will break on edge cases. " +
        "Use an LLM API to analyze images/PDFs instead. " +
        "Describe the check in plain English as a prompt, send the artifact, parse structured output."
      );
    }
  }

  return null;
}

// ── no-focus-steal ───────────────────────────────────────────────────────
// WHY: Background process launches opened visible terminal tabs that stole focus.
// Only applies on Windows where child_process.spawn flashes a console.

function noFocusSteal(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;
  if (process.platform !== "win32") return null;

  const cmd = String(params.command || "");

  // Allow: opening document files with `start`
  const fileOpenPattern = /\bstart\s+(""|'')\s+["']?[^"']*\.(pdf|html?|png|jpe?g|gif|txt|md|csv|xlsx?|docx?|pptx?)\b/i;
  if (fileOpenPattern.test(cmd)) return null;

  const hasTrailingAmpersand = /[^&]&\s*$/.test(cmd);
  const hasNohup = /\bnohup\b/.test(cmd);
  const hasStartExe = /\bstart\s+(""|'')\s+["']?\w+\.(exe|bat|cmd|ps1)\b/i.test(cmd) ||
    /\bstart\s+(""|'')\s+(cmd|powershell|python|node|bash|claude)\b/i.test(cmd);

  if (!hasTrailingAmpersand && !hasNohup && !hasStartExe) return null;

  const spawnsProcess = /\b(node|python|bash|claude|powershell)\b/.test(cmd);
  if (!spawnsProcess && !hasStartExe) return null;

  return (
    "FOCUS STEAL: This spawns a background process that flashes a " +
    "console window on Windows. Use run_in_background parameter instead, " +
    "or for long-running daemons use a scheduled task with hidden window.\n" +
    'If opening a file, use: start "" "path/to/file.ext"'
  );
}

// ── crlf-ssh-key-check ──────────────────────────────────────────────────
// WHY: Windows scp/cp adds \r\n to SSH keys. OpenSSH rejects them with
// "error in libcrypto".

function crlfSshKeyCheck(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;
  const cmd = String(params.command || "");

  if (/(scp|cp)\s+.*\.pem/.test(cmd) || /(scp|cp)\s+.*key/.test(cmd) ||
    /aws\s+s3\s+cp.*key/.test(cmd)) {
    return (
      "SSH KEY CRLF CHECK: Windows adds \\r\\n to SSH keys which breaks OpenSSH.\n" +
      "Always pipe through tr -d '\\r' before uploading to Linux hosts or S3.\n" +
      "Example: tr -d '\\r' < key.pem | ssh user@host 'cat > ~/.ssh/key.pem'"
    );
  }

  return null;
}

// ── unresolved-issues-gate ───────────────────────────────────────────────
// WHY: Claude commits code while TODO.md still has unresolved FAIL, timeout,
// MISMATCH, or WARN entries. Bugs ship because the commit focused on what worked.

const ISSUE_PATTERNS = [
  /\bFAIL\b/,
  /\btimeout\b/i,
  /\bMISMATCH\b/,
  /\bWARN(?:ING)?\b/,
  /\bERROR\b/,
  /\bBROKEN\b/i,
  /\bcrash(?:ed|es|ing)?\b/i,
];

const FALSE_POSITIVE_PATTERNS = [
  /- \[x\].*\bFAIL/i,
  /\bfix(?:ed|es|ing)?\b.*\bFAIL/i,
  /\b0\s+fail/i,
  /\b0\s+FAIL/,
  /passed,\s*0\s+failed/i,
  /\bno\s+fail/i,
  /FAIL\/WARN/,
];

function unresolvedIssuesGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/git\s+commit/.test(cmd)) return null;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const todoPath = join(projectDir, "TODO.md");

  if (!existsSync(todoPath)) return null;

  let content = "";
  try { content = readFileSync(todoPath, "utf-8"); } catch { return null; }

  const lines = content.split("\n");
  const issues: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/- \[x\]/.test(line)) continue;

    let isFP = false;
    for (const fp of FALSE_POSITIVE_PATTERNS) {
      if (fp.test(line)) { isFP = true; break; }
    }
    if (isFP) continue;

    for (const pattern of ISSUE_PATTERNS) {
      if (pattern.test(line)) {
        if (/^\s*-\s*\[ \]/.test(line) || /Status:|TESTING|IN PROGRESS/i.test(line)) {
          issues.push(`  L${i + 1}: ${line.trim().substring(0, 120)}`);
          break;
        }
      }
    }
  }

  if (issues.length === 0) return null;

  // Check if commit message acknowledges the issues
  const msg = extractCommitMsg(cmd);
  if (msg && /\b(known|pre-existing|intermittent|expected|acknowledged|wontfix)\b/i.test(msg)) {
    return null;
  }

  return (
    `UNRESOLVED ISSUES in TODO.md (${issues.length} found):\n\n` +
    issues.slice(0, 8).join("\n") +
    (issues.length > 8 ? `\n  ... and ${issues.length - 8} more` : "") +
    "\n\nBefore committing:\n" +
    "  1. Address each issue (fix it, file a plan, or mark as known)\n" +
    "  2. Update TODO.md with the resolution\n" +
    "  3. Or add 'known'/'pre-existing'/'intermittent' to commit message to acknowledge"
  );
}

// ── no-nested-claude ──────────────────────────────────────────────────
// WHY: Nested `claude -p` calls inside a session don't work reliably.
// Cross-project work must use a proper new terminal session.

function noNestedClaude(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");

  // Skip if "claude" only appears inside a search pattern (grep, rg, etc.)
  const isSearchPattern = /\b(grep|rg|findstr|awk|sed)\b/.test(cmd) &&
                          /["'].*claude.*["']/.test(cmd);
  if (isSearchPattern) return null;

  // Skip git/gh commands — "claude" appears in paths and commit messages
  // WHY: Use \b word boundary instead of ^ anchor to handle `cd ... && git commit` chains
  if (/\b(git\s+(commit|push|pull|fetch|log|diff|status|add|tag|branch|merge|rebase|stash|show|remote|config|checkout))\b/.test(cmd)) return null;
  if (/\bgh\s/.test(cmd)) return null;

  // Match: claude -p, claude --print, claude -m, or piped into claude
  if (/\bclaude\s+(-p|--print|-m|--message)\b/.test(cmd) ||
      /\|\s*claude\b/.test(cmd) ||
      /\bclaude\s+-/.test(cmd)) {
    return (
      "NO NESTED CLAUDE: Cannot run claude as a subprocess — it doesn't work reliably.\n" +
      "FIX: Open a new terminal tab and run claude there, or use a proper session spawner."
    );
  }

  return null;
}

// ── disk-space-guard ──────────────────────────────────────────────────
// WHY: Claude ran rm -rf on temp files when disk was full without asking.
// Blocks destructive commands when a previous error was disk-related.

const DISK_SPACE_STATE_FILE = join(
  homedir(),
  ".claude", ".disk-space-alert"
);

const DISK_DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\brm\s+.*-[a-z]*f/,
  /\brmdir\b/,
  /\bdel\b.*\/[sS]/,
  /Remove-Item.*-Recurse/i,
  /\bclean\b.*--force/,
  /\bprune\b/,
  /\bpurge\b/,
];

function diskSpaceGuard(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!cmd) return null;

  let inAlert = false;
  try { inAlert = existsSync(DISK_SPACE_STATE_FILE); } catch { /* ignore */ }
  if (!inAlert) return null;

  for (const pattern of DISK_DESTRUCTIVE_PATTERNS) {
    if (pattern.test(cmd)) {
      return (
        "DISK SPACE GUARD: Destructive command blocked during disk space emergency.\n" +
        "WHY: Deleting files to free space risks destroying important data.\n" +
        "Run a disk usage scan first to identify safe cleanup candidates.\n" +
        "Present the results and wait for explicit user approval.\n" +
        "Command blocked: " + cmd.substring(0, 100)
      );
    }
  }

  return null;
}

// ── no-unnecessary-sleep ──────────────────────────────────────────────
// WHY: Claude adds sleep between actions thinking pages or processes need
// time to load. Each prompt takes 3-10s — more than enough. Sleep wastes time.

function noUnnecessarySleep(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  if (!/^\s*sleep\b/.test(cmd)) return null;

  const seconds = cmd.match(/sleep\s+(\d+)/);
  if (!seconds) return null;
  const dur = parseInt(seconds[1], 10);

  // Only block sleeps > 1s (short sleeps may be intentional)
  if (dur <= 1) return null;

  return (
    "PERFORMANCE: Do not use sleep between actions.\n" +
    "Each prompt takes 3-10s to process — more than enough for pages to load.\n" +
    "Just call the next action directly. Sleep wastes time twice.\n" +
    "If you truly need a delay, use sleep 1 (max 1 second)."
  );
}

// ── claude-p-pattern ──────────────────────────────────────────────────
// WHY: Claude tried 3 wrong ways to call claude -p before finding the right
// pattern. The correct pattern is: write to temp file, pipe via stdin redirect.

const CLAUDE_P_CORRECT =
  "\n\nCorrect claude -p pattern:\n" +
  "  PROMPTFILE=$(mktemp /tmp/claude-p-XXXXXX.txt)\n" +
  "  cat > \"$PROMPTFILE\" <<'EOF'\n  Your prompt here\n  EOF\n" +
  "  claude -p --dangerously-skip-permissions < \"$PROMPTFILE\" > output.txt 2>&1\n" +
  "  rm -f \"$PROMPTFILE\"\n\n" +
  "For images/PDFs: put absolute file paths in the prompt and tell Claude\n" +
  "to use the Read tool to view them. NEVER base64-encode images inline.\n" +
  "No API key needed. No SDK needed. Same auth as Claude Code session.";

function claudePPattern(toolName: string, params: Record<string, unknown>): string | null {
  // Gate 1: Bash — block bad claude -p invocations
  if (toolName === "Bash") {
    const cmd = String(params.command || "");
    if (cmd.indexOf("claude -p") === -1 && cmd.indexOf("claude.exe -p") === -1) return null;

    const bad: string[] = [];
    if (/claude\s+-p\s+--no-input/.test(cmd)) bad.push("--no-input is not a valid flag");
    if (/echo\s+.*\|\s*claude\s+-p/.test(cmd)) bad.push("piping via echo hangs — use temp file + stdin redirect");
    if (/claude\s+-p\s+"[^"]+"\s*2?>&?1?$/.test(cmd)) bad.push("passing prompt as argument is unreliable");

    if (bad.length > 0) {
      return "claude -p invocation issue: " + bad.join("; ") + CLAUDE_P_CORRECT;
    }
    return null;
  }

  // Gate 2: Edit/Write — block bad patterns in scripts that call claude
  if (toolName !== "Edit" && toolName !== "Write") return null;

  const content = toolName === "Edit"
    ? String(params.new_string || "")
    : String(params.content || "");

  if (!/claude.*-p|anthropic|ANTHROPIC_API_KEY/i.test(content)) return null;

  const filePath = String(params.file_path || "");
  if (/claude-p-pattern|run-modules/i.test(filePath)) return null;
  if (/claude.api|anthropic.sdk|api.wrapper/i.test(filePath)) return null;

  if (/ANTHROPIC_API_KEY|os\.environ.*anthropic|api_key.*=.*os\./i.test(content)) {
    if (/not.*need|no.*key.*needed|same.*auth/i.test(content)) return null;
    return "Don't check for ANTHROPIC_API_KEY. claude -p uses Claude Code's " +
      "own auth — no API key needed." + CLAUDE_P_CORRECT;
  }

  if (/base64.*encode.*image|b64encode.*read|base64\.b64encode.*\.png/i.test(content)) {
    return "Don't base64-encode images into claude -p prompts. They're too " +
      "large and cause timeouts. Include absolute file paths in the prompt " +
      "and tell Claude to use its Read tool to view them." + CLAUDE_P_CORRECT;
  }

  if (/import anthropic|from anthropic import|anthropic\.Anthropic/i.test(content)) {
    return "Don't use the Anthropic SDK when claude -p is available. " +
      "claude -p is simpler (no API key, no SDK install)." + CLAUDE_P_CORRECT;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AFTER_TOOL_CALL GATES (PostToolUse)
// ═══════════════════════════════════════════════════════════════════════════

// ── commit-msg-check ─────────────────────────────────────────────────────
// WHY: Sloppy commit messages made PR history unreadable.

function commitMsgCheck(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Bash") return null;

  const command = String(params.command || "");
  if (!/\bgit\s+commit\b/.test(command)) return null;
  if (/--amend/.test(command)) return null;

  const msg = extractCommitMsg(command);
  if (!msg) return null;

  const firstLine = msg.split("\n")[0];
  const warnings: string[] = [];

  if (/^(wip|fixup!|squash!|tmp|temp)\b/i.test(firstLine)) {
    warnings.push(`Commit message starts with '${firstLine.split(/\s/)[0]}' — not suitable for final commits`);
  }

  if (firstLine.length > 72) {
    warnings.push(`First line is ${firstLine.length} chars (convention: max 72)`);
  }

  if (warnings.length > 0) {
    return "Commit message issues:\n" + warnings.map((w) => "- " + w).join("\n");
  }

  return null;
}

// ── crlf-detector ────────────────────────────────────────────────────────
// WHY: On Windows, Write/Edit can produce CRLF line endings that break shell
// scripts, YAML files, and other Unix-sensitive formats.

const SENSITIVE_EXTENSIONS = [".sh", ".bash", ".yml", ".yaml", ".py", ".rb", ".pl", ".env", ".conf", ".cfg"];

function crlfDetector(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Write" && toolName !== "Edit") return null;

  const filePath = String(params.file_path || "");
  if (!filePath) return null;

  const ext = extname(filePath).toLowerCase();
  if (!SENSITIVE_EXTENSIONS.includes(ext)) return null;

  let content: string;
  try { content = readFileSync(filePath, "utf-8"); } catch { return null; }
  if (!content.includes("\r\n")) return null;

  let crlfCount = 0;
  for (let i = 0; i < content.length - 1; i++) {
    if (content[i] === "\r" && content[i + 1] === "\n") crlfCount++;
  }

  return (
    `WARNING: ${basename(filePath)} has ${crlfCount} CRLF line endings. ` +
    "Shell scripts, YAML, and Python files break with \\r\\n on Unix. " +
    `Fix with: sed -i 's/\\r$//' ${filePath}`
  );
}

// ── test-coverage-check ──────────────────────────────────────────────────
// WHY: Source files were modified but existing tests never ran, hiding regressions.

const TEST_DIRS = ["scripts/test", "test", "tests", "__tests__", "spec"];
const TEST_PREFIXES = ["test-", "test_"];
const TEST_SUFFIXES = [".test.js", ".test.ts", ".spec.js", ".spec.ts", "_test.go", "_test.py"];

function testCoverageCheck(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Edit" && toolName !== "Write") return null;

  const filePath = String(params.file_path || "");
  if (!filePath) return null;

  const base = basename(filePath);
  const dir = dirname(filePath);

  // Skip if the file itself is a test file
  for (const prefix of TEST_PREFIXES) {
    if (base.startsWith(prefix)) return null;
  }
  for (const suffix of TEST_SUFFIXES) {
    if (base.endsWith(suffix)) return null;
  }
  const normPath = filePath.replace(/\\/g, "/");
  for (const td of TEST_DIRS) {
    if (normPath.includes(`/${td}/`)) return null;
  }

  // Skip non-code files
  const codeExts = [".js", ".ts", ".py", ".go", ".rs", ".java", ".sh", ".bash"];
  if (!codeExts.includes(extname(base).toLowerCase())) return null;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || dir;
  const nameNoExt = base.replace(/\.[^.]+$/, "");
  const found: string[] = [];

  // Check test directories
  for (const td of TEST_DIRS) {
    const testDir = join(projectDir, td);
    if (!existsSync(testDir)) continue;
    let files: string[];
    try { files = readdirSync(testDir); } catch { continue; }
    for (const f of files) {
      if (f.toLowerCase().includes(nameNoExt.toLowerCase())) {
        found.push(join(td, f));
      }
    }
  }

  // Check same directory for test files
  try {
    for (const sib of readdirSync(dir)) {
      if (sib === base) continue;
      const sibLower = sib.toLowerCase();
      const nameCheck = nameNoExt.toLowerCase();
      if (sibLower.startsWith("test-" + nameCheck) ||
        sibLower.startsWith("test_" + nameCheck) ||
        sibLower === nameCheck + ".test.js" ||
        sibLower === nameCheck + ".test.ts" ||
        sibLower === nameCheck + ".spec.js" ||
        sibLower === nameCheck + ".spec.ts") {
        found.push(join(relative(projectDir, dir) || ".", sib));
      }
    }
  } catch { /* ignore */ }

  if (found.length === 0) return null;

  const unique = [...new Set(found)];
  return `Modified ${base} — related test file(s) found: ${unique.join(", ")}. Run tests before committing.`;
}

// ── result-review-gate ───────────────────────────────────────────────────
// WHY: Claude reads test reports and PDFs, sees mostly-green results, and commits
// without enumerating every FAIL/WARN/timeout.

const REPORT_FILE_PATTERNS = [
  /\.report/i, /report\./i, /results?\./i, /test[-_]?results?/i,
  /coverage/i, /\.pdf$/i, /summary/i, /health[-_]?check/i,
];

function resultReviewGate(toolName: string, params: Record<string, unknown>): string | null {
  if (toolName !== "Read") return null;

  const filePath = String(params.file_path || "");
  if (!filePath) return null;

  const base = filePath.replace(/\\/g, "/").split("/").pop() || "";
  let isReport = REPORT_FILE_PATTERNS.some((p) => p.test(base));

  if (!isReport) {
    const dirPart = filePath.replace(/\\/g, "/");
    if (/\/reports?\//i.test(dirPart) || /\/results?\//i.test(dirPart)) {
      isReport = true;
    }
  }

  if (!isReport) return null;

  return (
    "REPORT FILE READ — Review checklist before acting on results.\n\n" +
    `File: ${base}\n\n` +
    "Before committing or declaring results:\n" +
    "  1. List EVERY FAIL, WARN, timeout, error, and empty section in this report\n" +
    "  2. For each: is it a real bug, expected behavior, or needs investigation?\n" +
    "  3. File a TODO for each unresolved issue\n" +
    "  4. Check what's MISSING from the report that should be there\n" +
    "  5. Only then commit or declare results\n\n" +
    "Do NOT skim and assume green. Enumerate every issue explicitly."
  );
}

// ── rule-hygiene ─────────────────────────────────────────────────────────
// WHY: Rules grew into multi-topic dump files that were hard to maintain.

function ruleHygiene(toolName: string, params: Record<string, unknown>): string | null {
  const filePath = String(params.file_path || "");
  const normalized = filePath.replace(/\\/g, "/");

  if (!normalized.includes("/rules/") || !normalized.endsWith(".md")) return null;

  const warnings: string[] = [];
  const fileName = basename(normalized, ".md");

  const badNames = ["session-", "gotchas", "misc", "notes", "todo", "temp"];
  for (const bad of badNames) {
    if (fileName.toLowerCase().startsWith(bad) || fileName.toLowerCase() === bad) {
      warnings.push(`Bad rule filename "${fileName}.md" - use a descriptive topic name`);
      break;
    }
  }

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    if (lines.length > 25) {
      warnings.push(`Rule file is ${lines.length} lines - keep under 20. Split into multiple files.`);
    }

    let h2Count = 0;
    for (const line of lines) {
      if (line.startsWith("## ")) h2Count++;
    }
    if (h2Count > 2) {
      warnings.push(`Rule file has ${h2Count} sections - likely covers multiple topics. One topic per file.`);
    }
  }

  const home = (process.env.HOME || "").replace(/\\/g, "/");
  if (home && normalized.includes(home + "/.claude/rules/")) {
    const projectKeywords = ["dispatcher", "bootstrap", "worker", "rone", "teams", "poller"];
    for (const kw of projectKeywords) {
      if (fileName.toLowerCase().includes(kw)) {
        warnings.push(`"${fileName}.md" looks project-specific but is in global rules. Move to project .claude/rules/`);
        break;
      }
    }
  }

  if (warnings.length === 0) return null;
  return "Rule hygiene:\n" + warnings.map((w) => "- " + w).join("\n");
}

// ── empty-output-detector ─────────────────────────────────────────────
// WHY: Claude treats empty command output as success — e.g., `ls screenshots/`
// returning nothing means no screenshots exist, but Claude proceeds as if they do.

const EXPECT_OUTPUT = [
  /^\s*ls\b/,
  /^\s*find\b/,
  /^\s*cat\b/,
  /^\s*node\s+.*--test/,
  /^\s*node\s+setup\.js\s+--/,
  /^\s*curl\b/,
  /^\s*az\s/,
  /^\s*kubectl\s+(get|describe|logs)\b/,
];

const EMPTY_OK = [
  /^\s*(cp|mv|mkdir|rm|chmod|touch|cd)\b/,
  /^\s*git\s+(add|checkout|push|pull|fetch|merge)\b/,
  />/,
  /2>&1\s*$/,
  /\|\s*wc\b/,
];

function emptyOutputDetector(toolName: string, params: Record<string, unknown>, result?: string): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  const output = (result || "").trim();
  if (output.length > 0) return null;

  for (const pattern of EMPTY_OK) {
    if (pattern.test(cmd)) return null;
  }

  let expectsOutput = false;
  for (const pattern of EXPECT_OUTPUT) {
    if (pattern.test(cmd)) { expectsOutput = true; break; }
  }
  if (!expectsOutput) return null;

  return (
    "EMPTY OUTPUT from command that normally produces output.\n\n" +
    "Command: " + cmd.substring(0, 150) + "\n\n" +
    "This likely means:\n" +
    "  - Directory is empty (no files where expected)\n" +
    "  - File doesn't exist at that path\n" +
    "  - Query returned no results\n" +
    "  - Command failed silently\n\n" +
    "Investigate before proceeding. Do not assume empty = success."
  );
}

// ── disk-space-detect ─────────────────────────────────────────────────
// WHY: Companion to disk-space-guard. Detects disk space errors in output
// and sets alert mode so destructive commands are blocked.

const DISK_ERROR_PATTERNS = [
  /out of diskspace/i,
  /no space left on device/i,
  /not enough space/i,
  /disk is full/i,
  /write error.*diskspace/i,
  /ENOSPC/,
];

function diskSpaceDetect(toolName: string, params: Record<string, unknown>, result?: string): string | null {
  const output = result || "";

  for (const pattern of DISK_ERROR_PATTERNS) {
    if (pattern.test(output)) {
      // Set alert mode via state file
      try {
        writeFileSync(DISK_SPACE_STATE_FILE, new Date().toISOString() + "\n" + output.substring(0, 500));
      } catch { /* disk may be full */ }

      return (
        "DISK SPACE ALERT: The last command failed due to insufficient disk space.\n" +
        "DO NOT attempt to delete files to free space.\n" +
        "Run a disk usage scan to identify safe cleanup candidates.\n" +
        "Present the results to the user and WAIT for explicit approval.\n" +
        "To clear this alert after resolving: delete ~/.claude/.disk-space-alert"
      );
    }
  }

  // Clear alert if command succeeds (user freed space)
  try {
    if (existsSync(DISK_SPACE_STATE_FILE)) {
      const hasError = /error|fail|fatal/i.test(output) && /disk|space|write/i.test(output);
      if (!hasError) {
        unlinkSync(DISK_SPACE_STATE_FILE);
      }
    }
  } catch { /* ignore */ }

  return null;
}

// ── troubleshoot-detector ─────────────────────────────────────────────
// WHY: Claude tried 3 wrong ways before finding the right pattern. This
// detects "fail-fail-succeed" cycles and prompts to create a hook module
// so the solution is enforced permanently.

interface FailRecord {
  ts: number;
  cmd: string;
}

const troubleshootState: { failures: FailRecord[]; lastPrompted: number } = {
  failures: [],
  lastPrompted: 0,
};

const FAIL_THRESHOLD = 2;

function troubleshootDetector(toolName: string, params: Record<string, unknown>, result?: string): string | null {
  if (toolName !== "Bash") return null;

  const cmd = String(params.command || "");
  const output = result || "";

  // Detect exit code from output
  let exitCode = -1;
  const exitMatch = output.match(/Exit code (\d+)/);
  if (exitMatch) {
    exitCode = parseInt(exitMatch[1], 10);
  } else if (!output.includes("Exit code") && !output.includes("error")) {
    exitCode = 0;
  }

  if (exitCode !== 0) {
    // Record failure
    troubleshootState.failures.push({ ts: Date.now(), cmd: cmd.substring(0, 200) });
    // Keep only recent failures (last 5 min)
    const cutoff = Date.now() - 300000;
    troubleshootState.failures = troubleshootState.failures.filter(f => f.ts > cutoff);
    return null;
  }

  // Success — check if preceded by enough failures
  const recentFailures = troubleshootState.failures.length;
  if (recentFailures < FAIL_THRESHOLD) {
    troubleshootState.failures = [];
    return null;
  }

  // Cooldown: don't prompt more than once per 5 minutes
  if (Date.now() - troubleshootState.lastPrompted < 300000) {
    troubleshootState.failures = [];
    return null;
  }

  const failedCmds = troubleshootState.failures.map(f => f.cmd).join("\n  ");
  troubleshootState.failures = [];
  troubleshootState.lastPrompted = Date.now();

  return (
    "TROUBLESHOOTING CYCLE DETECTED: " + recentFailures + " failed attempts before success.\n" +
    "Failed commands:\n  " + failedCmds + "\n" +
    "Successful command: " + cmd.substring(0, 200) + "\n\n" +
    "You just learned something the hard way. To prevent repeating this:\n" +
    "1) Create a hook module that catches the bad pattern and suggests the good one\n" +
    "2) Commit it so it persists across sessions\n" +
    "3) If this pattern exists in another project, you should have checked there FIRST\n\n" +
    "Do this NOW before moving on."
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

const beforeToolCallGates: Record<string, GateFunction> = {
  "force-push-gate": forcePushGate,
  "secret-scan-gate": secretScanGate,
  "commit-quality-gate": commitQualityGate,
  "git-destructive-guard": gitDestructiveGuard,
  "archive-not-delete": archiveNotDelete,
  "git-rebase-safety": gitRebaseSafety,
  "no-hardcoded-paths": noHardcodedPaths,
  "victory-declaration-gate": victoryDeclarationGate,
  "root-cause-gate": rootCauseGate,
  "no-fragile-heuristics": noFragileHeuristics,
  "no-focus-steal": noFocusSteal,
  "crlf-ssh-key-check": crlfSshKeyCheck,
  "unresolved-issues-gate": unresolvedIssuesGate,
  "no-nested-claude": noNestedClaude,
  "disk-space-guard": diskSpaceGuard,
  "no-unnecessary-sleep": noUnnecessarySleep,
  "claude-p-pattern": claudePPattern,
};

const afterToolCallGates: Record<string, AfterGateFunction> = {
  "commit-msg-check": commitMsgCheck,
  "crlf-detector": crlfDetector,
  "test-coverage-check": testCoverageCheck,
  "result-review-gate": resultReviewGate,
  "rule-hygiene": ruleHygiene,
  "empty-output-detector": emptyOutputDetector,
  "disk-space-detect": diskSpaceDetect,
  "troubleshoot-detector": troubleshootDetector,
};

export default definePluginEntry({
  id: "hook-runner-gates",
  name: "Hook Runner Gates",
  description:
    "25 ported hook-runner gate modules — git safety, secret scanning, code quality, " +
    "commit hygiene, test coverage, disk safety, and AI behavioral guardrails.",

  register(api) {
    const getConfig = (): GateConfig => {
      return (api.pluginConfig as GateConfig) || {};
    };

    api.on("before_tool_call", async (event, _ctx) => {
      const config = getConfig();
      const modules = config.modules ?? {};

      for (const [name, fn] of Object.entries(beforeToolCallGates)) {
        if (modules[name] === false) continue;

        const reason = fn(event.toolName, event.params || {});
        if (reason) {
          return { block: true, blockReason: reason };
        }
      }

      return undefined;
    });

    api.on("after_tool_call", async (event, _ctx) => {
      const config = getConfig();
      const modules = config.modules ?? {};

      for (const [name, fn] of Object.entries(afterToolCallGates)) {
        if (modules[name] === false) continue;

        const reason = fn(event.toolName, event.params || {}, (event as Record<string, unknown>).result as string | undefined);
        if (reason) {
          return { message: reason };
        }
      }

      return undefined;
    });
  },
});
