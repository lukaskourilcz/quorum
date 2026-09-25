# DNESKAi yield: what stopped the days that published nothing, and what to change

Date: 2026-09-25

Decider: Lukas Kouril, owner

Status: proposed

Signature / explicit approval reference: none yet. Tick a proposal below to approve it; an
unticked line is not approved and nothing in `config/edition-quality.json` changes until one is.

Decision id: `edition-2026-09a`

Sources: `docs/reports/dneskai-yield-2026-09-25.md` (from `pnpm edition:yield -- --since
2026-08-25`), `state/edition/runs/`, `state/meetings/skips/`,
`state/ventures/caught-up/image-selections/`, issue #564.

## What the runs say

From 2026-08-25 to 2026-09-25 (32 days):

- 14 days published. 9 days ran and published nothing. 9 days never ran.
- The 9 days that never ran (2026-08-29, 2026-08-31 to 2026-09-07) were stopped by the
  pre-cycle release gate: `main` did not pass its own checks, so no room met.
- Of the 9 days that ran without publishing:
  - 6 days: every write attempt returned a list field (`dispatches`, `wire`, `uncertainty`,
    `what_changed`, `why_it_matters`, `alternative_headlines`) as a string that the existing
    repair could not decode.
  - 2 days: the provider refused with "credit balance too low" (2026-09-14 and 2026-09-15).
  - 1 day: the curation gate refused twice on `maximum_single_source_share` (2026-09-24).
- Measured model cost was $6.21. $2.75 of it went to runs that published nothing, and $2.55 of
  that to the six undecodable-string days (about $0.42 each, three attempts).
- Sources were never the problem. Every run reached 27 to 32 of the 32 enabled sources with 80
  candidates. `minimumSuccessfulSources`, `minimumCandidateItems` and `minimumSourceDiversity`
  stopped nothing in the period, so no proposal touches them.

## Fixed in the same change, not thresholds

- **Wikimedia thumbnails.** Wikimedia's `thumburl` moved to `thumb.wikimedia.org`, so every
  Wikimedia thumbnail (curated scenes and search results) was skipped as
  `thumbnail-host-not-allowed` and the article fell to a lower rung. The host is now in the
  gate's `THUMBNAIL_HOSTS`. Downloads still come only from `upload.wikimedia.org`, so nothing
  new can be published from it.
- **Undecodable strings are recorded.** A list field that arrives as a string the repair cannot
  decode now leaves a `json_string_undecodable` entry in the run report: the first 120
  characters, the JSON error and the text around the position it names. The value is still
  rejected. Until now the report named only the field, which is why proposal 1 below cannot
  yet name its exact shape.

## Proposals

Tick to approve. Each is one change with its measured effect in this period.

- [ ] **1. Decode the undecodable list strings, once their shape is known.** After the next
  `json_string_undecodable` entries show what the strings contain, add the narrowest decode
  that fits that shape, record it as a contract repair and pin it with a test built from a real
  sample. The zod parse still decides whether the result is a valid article. Measured: 6 lost
  days and $2.55 in this period.
- [ ] **2. Keep the first six Watchlist and tag entries instead of rejecting the article.** Record
  each dropped entry as a contract repair, the way unslugifiable tags are dropped today.
  Measured: 4 rejected attempts (3 `wire`, 1 `tags`); it would have saved the retry on
  2026-09-16 and 2026-09-25 (about $0.13 each). It recovers no lost day on its own.
- [ ] **3. Raise one owner-attention item when the release gate stops a scheduled cycle.** The
  skip is recorded and the run goes red, but nothing reached the owner's queue, and the gate
  stayed red for nine days. Measured: 9 lost days.
- [ ] **4. Warn when the model provider balance runs low.** The two credit-balance days would
  have been one or none with a warning the day before. It needs a provider usage read the
  runtime does not have today, so this proposal is only that the owner checks the balance
  weekly until one exists. Measured: 2 lost days.
- [ ] **5. Leave `maximum_single_source_share` as it is.** It stopped one day in 32, both runs of
  2026-09-24. One refusal is not a pattern, and loosening a source-balance guard to recover it
  would weaken the gate that keeps the magazine from republishing one outlet. Revisit if it stops
  a day more than twice a month.

No threshold, budget or model changes here. The $0.50 edition cap, the `$1.00` daily pace and
`budget-2026-08f` are unchanged.
