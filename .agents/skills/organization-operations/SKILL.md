---
name: organization-operations
description: Use when PEOPLE reviews agent effectiveness or proposes/tests a role, description, routing, prompt, skill, model, or status change.
---

# Organization operations

1. Read section 0.9, role versions, minimum-window
   outcome/quality/cost/routing scorecards, incidents and prior change
   evaluations.
2. Never score talk volume, invitations, proposal wins or visibility. Treat
   correct NO_ACTION/NO_POST and absence from irrelevant rooms as efficiency.
   Missing/short-window data means no change.
3. Produce at most one exact current→proposed change with evidence, expected
   metric delta, tier, tests, evaluation window and rollback.
4. Tier A may change allowlisted descriptive/routing data after affected-agent
   and AUDIT review. Tier B needs council + AUDIT + KEEPER + eval. Tier C is
   HUMAN_APPROVAL. Never self-review or change a control-role/core guardrail.
5. Apply through the dedicated declarative maintenance module only. Run schema,
   canary, routing and quality fixtures. Version the change and auto-rollback on
   regression/incident.
6. Publish only a sanitized role-revision record; never expose a private prompt.
