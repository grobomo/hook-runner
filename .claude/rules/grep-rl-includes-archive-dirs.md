# grep -rl Scans Archive Dirs

`grep -rl` in `modules/` picks up files in `modules/*/archive/` subdirs.
This caused false positives when counting workflow-tagged modules (e.g. gsd-gate
in archive was counted as a live shtd module).

When building module lists from grep, filter out `/archive/` paths:
  grep -rl "pattern" modules/ | grep -v '/archive/'
