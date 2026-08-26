# One $50 monthly limit with an isolated Personal Growth cap

Date: 2026-08-26

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `budget-2026-08f`

Supersedes: `budget-2026-08e` on the company all-in amount only

Signature / explicit approval reference: Owner-authored GitHub issue #371 and the 2026-08-26 instruction to implement and close the open Quorum issues

## Decision

- Raise the company all-in monthly limit from $30 to $50.
- Keep the model and API share at $25 per month and its daily pace at $1.00.
- Give `personal-growth` a hard nested all-in limit of $20 per month.
- Count every Personal Growth model call, paid source, service and other outside cost against both
  the nested $20 limit and the company $50 limit.
- Never borrow from a later month or charge another venture for Personal Growth work.

The Personal Growth allocation has two mutually exclusive modes. The default mode reserves up to
$12 for model and synthesis calls, up to $5 for owner-approved research or data experiments, and
$3 as unallocated reserve. A future Buffer mode may reserve up to $10 for Instagram and Threads
scheduling, up to $8 for model and synthesis calls, and $2 as reserve. Selecting one mode replaces
the other. The two modes can never create a $30 project allowance.

## Closed gates

This decision does not buy a service, create an account, supply a credential or enable publishing.
Paid synthesis, insights ingestion, Threads search, a Buffer queue and every publishing path keep
independent fail-closed gates. Missing authority or budget produces a held record and costs $0.

## Existing controls

The $25 model and API share, $1.00 daily pace, reserve-before-call rule, treasury ledger, human-only
payments, social kill switch, evidence gates and project-specific caps remain in force. A project
switch cannot replace any of them.
