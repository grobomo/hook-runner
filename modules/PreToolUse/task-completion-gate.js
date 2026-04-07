// WORKFLOW: shtd
// WHY: A claude -p session marked T020-T024 as [x] complete in TODO.md without
// creating PRs, deploying, or verifying. The "fixes" were never tested. This
// happened because nothing enforced the link between task completion and evidence.
//
// ENFORCES (globally, all projects):
//   - Cannot mark a task [x] without a PR reference "(PR #N)" on the same line
//   - Each task gets its own PR (enforced by pr-per-task-gate.js)
//   - Spec gate (spec-gate.js) ensures specs exist before code edits
//   - This gate closes the loop: completion requires verified evidence
//
// WORKFLOW:
//   1. speckit.specify → spec.md
//   2. speckit.plan → plan.md
//   3. speckit.tasks → tasks.md with T001, T002, etc.
//   4. Feature branch: git checkout -b <NNN>-<feature>
//   5. Each task: implement → PR (with task ID in title) → verify → mark [x] with PR #
//   6. Feature branch merges to main after ALL task PRs verified + E2E passes
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Edit") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  var norm = filePath.replace(/\\/g, "/");

  // Only check TODO.md and tasks.md files
  if (!/TODO\.md|tasks\.md/i.test(norm.split("/").pop())) return null;

  var oldStr = (input.tool_input || {}).old_string || "";
  var newStr = (input.tool_input || {}).new_string || "";

  // Find lines that are being changed from [ ] to [x]
  var newLines = newStr.split("\n");
  var missingPR = [];

  for (var i = 0; i < newLines.length; i++) {
    var line = newLines[i];
    // Only care about checked task lines with task IDs (T001, T002, etc.)
    if (!/- \[x\]/i.test(line)) continue;
    if (!/T\d{2,4}/i.test(line)) continue;

    // Check if this was already [x] in the old string (skip already-completed)
    var trimmed = line.replace(/^\s+/, "");
    if (oldStr.indexOf(trimmed) !== -1) continue;

    // Was it [ ] in old string? (being newly completed)
    var uncheckedVersion = trimmed.replace(/\[x\]/i, "[ ]");
    if (oldStr.indexOf(uncheckedVersion) === -1) continue;

    // Newly completed — must have PR reference
    if (!/PR\s*#\d+/i.test(line)) {
      var short = trimmed.substring(0, 90);
      missingPR.push(short);
    }
  }

  if (missingPR.length === 0) return null;

  return { decision: "block", reason: "TASK COMPLETION GATE: Cannot mark task complete without a verified PR.\n\n" +
    "Lines missing PR reference:\n  " + missingPR.join("\n  ") + "\n\n" +
    "MANDATORY WORKFLOW:\n" +
    "  1. speckit.specify/plan/tasks → specs/<feature>/tasks.md\n" +
    "  2. Feature branch: git checkout -b <NNN>-<feature>\n" +
    "  3. Each task: own branch → implement → PR with 'TNNN:' in title\n" +
    "  4. Verify each PR (tests pass, E2E if applicable)\n" +
    "  5. THEN mark [x] with '(PR #N)' on the line\n" +
    "  6. Feature branch merges to main after all tasks verified\n\n" +
    "Add '(PR #N)' to each completed task. If no PR exists, create one first." };
};
