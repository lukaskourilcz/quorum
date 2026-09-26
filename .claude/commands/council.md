---
description: Run one council cycle locally and summarize the outcome
allowed-tools: Bash(pnpm:*), Read
argument-hint: [morning|founding|cu-day|ms-daily|gv-brief] [--dry]
---

Run `pnpm cycle -- --phase ${1:-morning} $2`, then read the newest file in
`state/decisions/` and `state/budget/ledger.json` and summarize: winner, tasks
created, votes/vetoes, cost of this cycle, and anything added to
`state/INBOX.md`.
