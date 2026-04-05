// WORKFLOW: shtd
// WHY: Backups went stale for weeks without anyone noticing.
// SessionStart: async example — check backup freshness at session start
// Demonstrates async module support (hook-runner T030)
// Requires: claude-backup skill installed at ~/.claude/skills/claude-backup/
var fs = require("fs");
var path = require("path");

module.exports = async function(input) {
  var backupDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude", "backups");

  // Check if backup directory exists
  try {
    fs.accessSync(backupDir);
  } catch (e) {
    return { text: "WARNING: No claude-backup directory found. Run /claude-backup to create your first backup." };
  }

  // Find most recent backup
  var entries;
  try {
    entries = fs.readdirSync(backupDir).filter(function(name) {
      return fs.statSync(path.join(backupDir, name)).isDirectory();
    }).sort().reverse();
  } catch (e) {
    return null; // can't read, skip silently
  }

  if (entries.length === 0) {
    return { text: "WARNING: Backup directory is empty. Run /claude-backup to create a backup." };
  }

  // Check age of most recent backup
  var latest = entries[0];
  var latestPath = path.join(backupDir, latest);
  var stat = fs.statSync(latestPath);
  var ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

  if (ageHours > 72) {
    return { text: "REMINDER: Last claude-backup is " + Math.round(ageHours) + "h old. Consider running /claude-backup." };
  }

  return null; // backup is fresh, nothing to report
};
