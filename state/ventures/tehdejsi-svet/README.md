# Tehdejší svět venture state

What the `ts-desk` room reads and writes. Nothing here is generated from the product
repository — this repository has no connection to it — and nothing here is published.

| Path | What it is | Written by |
| --- | --- | --- |
| `facts.json` | The era and history facts a human copied here, each with its source. Hash-verified: an edit without a rehash aborts the room. | a human, by hand |
| `cycles/<date>.json` | The two-day cycle: which day is active, what it selected, whether it stretched. | `ts-desk` |
| `shortlists/<date>.json` | The deterministic ranking behind a day's selection, with every factor recorded. | `ts-desk` |

The shortlist is recorded rather than re-derived, for the same reason the Design Lab
summary is: it is what the room actually judged, and a later scorer change must not be
able to rewrite what a past day decided.
