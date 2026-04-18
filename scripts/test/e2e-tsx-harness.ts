// T475: E2E test harness — loads the actual OpenClaw plugin and calls before_tool_call
// Run: PLUGIN_PATH=<path-to-index.ts> npx tsx scripts/test/e2e-tsx-harness.ts

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pluginMod = require(process.env.PLUGIN_PATH!);
const plugin = pluginMod.default || pluginMod;

interface TC {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  expectAction: string;
  reasonContains?: string;
  config?: Record<string, boolean>;
}

const cases: TC[] = [
  // ── force-push-gate ──
  {
    name: "force-push to main: blocked",
    tool: "Bash",
    args: { command: "git push --force origin main" },
    expectAction: "deny",
    reasonContains: "Force-push to main",
  },
  {
    name: "force-push to master: blocked",
    tool: "Bash",
    args: { command: "git push -f origin master" },
    expectAction: "deny",
    reasonContains: "Force-push to master",
  },
  {
    name: "force-push to feature: allowed",
    tool: "Bash",
    args: { command: "git push --force origin feature-xyz" },
    expectAction: "allow",
  },
  {
    name: "regular push to main: allowed",
    tool: "Bash",
    args: { command: "git push origin main" },
    expectAction: "allow",
  },
  {
    name: "force-with-lease to main: blocked",
    tool: "Bash",
    args: { command: "git push --force-with-lease origin main" },
    expectAction: "deny",
    reasonContains: "Force-push to main",
  },

  // ── commit-quality-gate ──
  {
    name: "short commit msg (2 words): blocked",
    tool: "Bash",
    args: { command: "git commit -m 'fix bug'" },
    expectAction: "deny",
    reasonContains: "TOO SHORT",
  },
  {
    name: "generic commit msg (6 words): blocked",
    tool: "Bash",
    args: { command: "git commit -m 'update the config file for deploy setup'" },
    expectAction: "deny",
    reasonContains: "TOO GENERIC",
  },
  {
    name: "good commit msg: allowed",
    tool: "Bash",
    args: {
      command:
        "git commit -m 'Fix spec-gate cache invalidation when tasks.md is edited externally'",
    },
    expectAction: "allow",
  },
  {
    name: "amend commit: allowed",
    tool: "Bash",
    args: { command: "git commit --amend -m 'wip'" },
    expectAction: "allow",
  },

  // ── secret-scan-gate (no staged changes, should allow) ──
  {
    name: "git commit (no staged diff): allowed",
    tool: "Bash",
    args: { command: "git commit -m 'T475: Test commit with enough words for quality gate'" },
    expectAction: "allow",
  },

  // ── non-Bash tools: always allowed ──
  {
    name: "non-commit Bash: allowed",
    tool: "Bash",
    args: { command: "ls -la" },
    expectAction: "allow",
  },
  {
    name: "Read tool: allowed",
    tool: "Read",
    args: { file_path: "/etc/passwd" },
    expectAction: "allow",
  },
  {
    name: "Write tool: allowed",
    tool: "Write",
    args: { file_path: "/tmp/t.txt", content: "hi" },
    expectAction: "allow",
  },
  {
    name: "Edit tool: allowed",
    tool: "Edit",
    args: { file_path: "/tmp/t.txt", old_string: "a", new_string: "b" },
    expectAction: "allow",
  },

  // ── config: disable a gate ──
  {
    name: "disabled force-push-gate: allowed",
    tool: "Bash",
    args: { command: "git push --force origin main" },
    expectAction: "allow",
    config: { "force-push-gate": false },
  },
  {
    name: "disabled commit-quality-gate: allowed",
    tool: "Bash",
    args: { command: "git commit -m 'wip'" },
    expectAction: "allow",
    config: { "commit-quality-gate": false },
  },
];

let pass = 0;
let fail = 0;

for (const tc of cases) {
  const modules = tc.config || {};
  const input = {
    tool: tc.tool,
    args: tc.args,
    context: { session: {}, channel: {}, config: { modules } },
  };

  const result = plugin.hooks.before_tool_call(input);
  const action = result?.action || "allow";

  if (action !== tc.expectAction) {
    console.log(
      `FAIL: ${tc.name} — expected ${tc.expectAction}, got ${action}`
    );
    if (result?.reason)
      console.log(`  reason: ${result.reason.split("\n")[0]}`);
    fail++;
    continue;
  }

  if (
    tc.reasonContains &&
    result?.reason &&
    !result.reason.includes(tc.reasonContains)
  ) {
    console.log(
      `FAIL: ${tc.name} — reason missing "${tc.reasonContains}"`
    );
    console.log(`  got: ${result.reason.split("\n")[0]}`);
    fail++;
    continue;
  }

  console.log(`OK: ${tc.name}`);
  pass++;
}

console.log("");
console.log(`--- tsx gate tests: ${pass}/${pass + fail} passed ---`);
if (fail > 0) process.exit(1);
