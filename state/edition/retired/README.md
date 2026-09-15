# Retired edition packages

Packages the magazine refused for a reason no re-send can change, kept for the record after they
left the outbox. Nothing here was delivered and nothing here will be; the delivery receipt for the
same date names the package that reached readers.

- `2026-09-10-a5ac50ca…` — a second edition for a date the magazine already held. The 09:00 retry
  wrote it while the 05:00 edition was still waiting in the delivery queue; refused as
  `hash_conflict` on 2026-09-12 and retired by hand on 2026-09-15.
- `2026-09-11-7c0ec23c…` — the same failure a day later; refused on 2026-09-14, retired on
  2026-09-15.

The retry no longer produces a second edition while the morning's is queued
(`editionRecordForDay` in `orchestrator/src/cycle/types.ts`), so this shelf should not grow.
