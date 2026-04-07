# Workflow Archive Dir is Gitignored

The `.gitignore` has `archive/` which matches ALL archive dirs including `workflows/archive/`.
When archiving workflow YAMLs, `git add workflows/archive/` will silently fail.
The archived YAMLs won't be in git — they only exist locally and in the live hooks dir.

This is fine (archived YAMLs are dead weight in git) but don't expect them to appear in PRs.
