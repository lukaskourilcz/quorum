# BOOKSOFHISTORY state

BOOKSOFHISTORY is a Czech-and-English social-content venture about the stories behind
famous books. This directory is its recorded internal state. It is not a public book
database, a website content tree or a publishing destination.

The daily `bh-desk` room advances one persistent cycle through `selection`, `research`
and `production`. A phase advances only after its work completes. A missed working day
resumes the same phase; budget pressure first trims research from two candidates to one,
then stretches the cycle at `$0`, then removes the room from the schedule. A shelf dossier
with an unused qualifying story records research as `not-needed`, never as skipped.

## Boundaries

- Output is drafts for owner-reviewed social content only. Nothing here posts, schedules,
  opens an account, touches a channel or authorizes outreach.
- There is no public website, book page, SEO archive, database, newsletter or storefront,
  and this state must not grow abstractions for any of them.
- The founding decision and its human approvals must be countersigned before live work.
  Missing approval takes the `$0` path.
- Research reserves before every call and records after it. The immutable ceilings are
  `$0.10` per call, `$0.50` per cycle and `$5.00` per month, with idempotency by
  `(bookId, briefHash)` and an in-flight lock.
- No book-cover artwork is rendered or delivered. A future seed `coverRef` is admin-only.
- Quotes are at most 300 characters and always carry attribution.
- Rejected claims cannot publish. Legends must be labelled as legends, and every factual
  sentence in both languages must resolve to accepted dossier claim ids.
- Czech and English packages are independent writing passes over one language-neutral
  dossier and story brief. Research is never repeated merely for the second language.
- The social, truth, treasury and owner-approval gates remain stronger than any room
  decision. `METRICS_INGESTION_ENABLED=false` means results are owner-entered only.

Canonical paths are append-preferring: `cycle.json`, the authored `seed/library.json`,
`shortlists/`, `briefs/`, `dossiers/<bookId>/`, `research-ledger.jsonl`, `recommendations/`,
`feature-actions/`, `results/`, `result-actions/` and `performance-weights.json`. Each artifact
has a strict contract and one writer. The seed and neutral performance state are committed;
cycle output is created lazily only after the founding and applicable research/seed approvals.
The protected admin parses or drops malformed records and never treats a missing metric as zero.
