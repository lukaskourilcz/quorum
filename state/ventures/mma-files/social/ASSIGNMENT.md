# Social variant assignment

Status: guarded automatic posting after project unlock

MMA Files prepares English and Czech captions for Instagram and Threads inside the
existing article-production call. No extra model call is made for social copy.

- PULSE chooses A or B deterministically before queueing; the chosen letter is saved
  in the immutable post receipt.
- English and Czech keep the same article facts but use platform-native wording.
- Instagram uses the deterministic MMA Files image template; Threads is text-native.
- A post needs ten consecutive passed article release proofs, complete MMA Files
  account credentials, all queue checks and `SOCIAL_KILL_SWITCH=false`.
- Each publish has an idempotency key, one retry and a `$0` live-post check. A second
  failure pauses MMA Files social only and enters the daily digest.
- No views, clicks, likes, reactions, comments, follows or messages are fetched or
  stored. Variant history is preparation for Phase 3, not a performance comparison.
- SPLIT remains idle while `METRICS_INGESTION_ENABLED=false`.
