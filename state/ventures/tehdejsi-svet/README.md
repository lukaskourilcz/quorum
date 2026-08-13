# Tehdejší svět venture state

What the `ts-desk` room reads and writes. Nothing here is generated from the product
repository — this repository has no connection to it — and nothing here is published.

| Path | What it is | Written by |
| --- | --- | --- |
| `facts.json` | The era and history facts a human copied here, each with its source. Hash-verified: an edit without a rehash aborts the room. | a human, by hand |
| `cycles/<date>.json` | The two-day cycle: which day is active, what it selected, whether it stretched. | `ts-desk` |
| `shortlists/<date>.json` | The deterministic ranking behind a day's selection, with every factor recorded. | `ts-desk` |
| `drafts/<id>.json` | Bilingual owner-review feature recommendations with fact and licence citations. | `ts-desk` |
| `feature-actions/<id>/` | Append-only owner edits, approvals or rejections. | protected admin |
| `dossiers/` and `research-ledger.jsonl` | Bounded approved research and its reservation/use evidence. | `ts-desk` and protected admin |
| `media/<id>.png` | Approved rendered social media with required attribution. | protected admin |
| `results/<id>.json` | Owner-entered post outcomes; no analytics or platform collection. | protected admin |
| `signals/` | Owner-entered trend observations and bounded digests. | protected admin and `ts-desk` |
| `product-insights/<id>.json` | Owner-controlled proposals; never a write into the product repository. | protected admin |
| `performance-weights.json` | Neutral base plus cited, replayable learning revisions. | `ts-desk` |

The shortlist is recorded rather than re-derived, for the same reason the Design Lab
summary is: it is what the room actually judged, and a later scorer change must not be
able to rewrite what a past day decided.

The founding, facts, media, account, research and results approvals remain independent. A valid
snapshot does not authorize research; a valid draft does not authorize a render or post; a product
insight is a queue item for the owner and never crosses the repository boundary automatically.
