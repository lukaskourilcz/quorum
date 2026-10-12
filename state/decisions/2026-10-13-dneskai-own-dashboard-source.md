# DNESKAi source export to OwnDashboard

Date: 2026-10-13
Authority: the owner's request in [quorum #598](https://github.com/lukaskourilcz/quorum/issues/598).

The owner requested a bridge from the existing DNESKAi editorial pipeline into OwnDashboard.
The new scope supersedes the 2026-09-28 pause only for this bounded source export. Article
production, image review, owner selection and magazine delivery retain their existing gates.
Article approval permits exporting that exact article version, its citations and licensed image.
It grants no social approval. OwnDashboard requires separate approval for each prepared post.

Capability map 1.6.0 adds caught-up → own-dashboard on marketing-source/1. The bridge may
reconcile prior exports, report no-edition days and send signed idempotent source callbacks.
Unknown, malformed, unapproved or withdrawn records remain held. The bridge calls no model,
creates no content and reads no other venture's editorial records.

Existing social publishing and Instagram reference workflows remain held. Account credentials,
paid plans, generator schedules and marketing-calendar dates do not change. Calendar migration
and verified cutover belong to the parent issue, own-dashboard #93.

## Implementation

- [x] Add source contracts, authenticated source lookup and guarded export/reconciliation outbox.
- [x] Verify generator regression tests and document cutover requirements and missing approvals.
