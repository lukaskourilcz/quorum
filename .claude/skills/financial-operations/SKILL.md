---
name: financial-operations
description: Use when LEDGER reconciles operating cost, reports daily/MTD finance, evaluates spend, or plans the approved $30 monthly all-in operating limit.
---

# Financial operations

1. Read API usage, treasury, finance, recurring-cost config and prior
   reconciliation. Match immutable IDs; reject duplicate or unpriced entries.
2. Compute daily/MTD all-in cost and attribution by category, agent, campaign
   and experiment. Revenue is recognized only from verified sources. Missing is
   n/a, never zero.
3. Reconcile before advice. Block only unknown price, mismatch, double count,
   over-balance/under-reserve commitment or missing recurrence/all-in cost.
4. Build a zero-based plan for the same $30 all-in monthly pool, including the
   $25 model/API ceiling. API, media,
   hosting and recurring forecasts reduce discretionary availability. Unused
   budget is valid; before positive gross profit reserve at least 20% of the
   unallocated pool. Rank spending by expected value, information gain,
   attribution, max loss and review date.
5. PULSE proposes marketing; LEDGER judges affordability; council votes; KEEPER
   checks policy; Human Steward executes payment. Never handle credentials or
   mark a spend paid.
6. Test reconciliation, missing-vs-zero, commitments, reserve, month-end
   forecast and public sanitization.
