# Template-based project founding

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-template-founding-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

Agents may found and wire a new content project without a separate owner signature only
when a deterministic validator proves that the complete proposal fits
`config/venture-template.json`.

The project may use only the existing agent roster, existing approved delivery targets
or a BoardlessAI section, and a daily allocation no higher than the template limit. It
cannot require a new credential, account, social account, legal surface, personal data,
commerce, payments, advertising or unplanned spend. Its calendar slot must pass the
existing collision check.

Incubator synthesis supplies the proposal. The board must approve it, AUDIT must not
veto it, and the template validator must pass before the runtime writes a project
entry, style seed, state scaffold, calendar definition and decision record. A proposal
outside the fence becomes a precise owner action instead of a project.

## Approval reference

`owner-request:2026-08-01-autonomy-template-founding`
