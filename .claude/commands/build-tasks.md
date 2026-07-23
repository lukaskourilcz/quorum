---
description: Implement all unchecked tasks from the newest decision
---

Use the builder on eligible unchecked tasks, then brand-guardian and
release-auditor on the staged aggregate diff. Run all gates and create one
atomic cycle commit only when green. Report skipped stale/duplicate tasks and
blockers.
