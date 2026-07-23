---
name: safe-release
description: Use for every generated code/content change before a cycle commit, push, deploy, rollback or recovery.
---

# Safe release

1. Resolve the exact eligible task, evidence/experiment contract and change
   budget.
2. Work in an isolated staging worktree; preserve the user's working tree.
3. Validate canonical paths, task-type allowlist, dependencies, secrets,
   environment/network access, generated-code policy and private/public
   boundary.
4. Run format/lint, typecheck, tests, production build,
   content/link/citation/cannibalization checks and changed-route smoke tests.
5. Have the read-only release auditor inspect the aggregate staged diff.
6. Transfer and commit atomically only after green gates. One runtime cycle is
   one revertible commit; no force push.
7. Record release identity and run post-deploy health when configured.
8. On failure, do not publish partial state. Resume idempotently or revert only
   the uniquely attributable cycle commit, create an incident and pause.
