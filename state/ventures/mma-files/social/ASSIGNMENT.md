# Social variant assignment

Status: guarded automatic posting after project unlock

REACH and SPLIT are currently disabled, so normal MMA Files article production makes
no social-content call. When the project control is re-enabled after its unlock,
REACH prepares English and Czech captions for Instagram and Threads inside the
existing article-production call; no separate model call is added.

- PULSE chooses A or B deterministically before queueing; the chosen letter is saved
  in the immutable post receipt.
- English and Czech keep the same article facts but use platform-native wording.
- Both variants reference only a live Carousel Studio template id, semantic version
  and bounded English/Czech content payload. FRAME renders the brand skin to PNG at
  `$0`; there is no freeform image or image-model path.
- A post needs ten consecutive passed article release proofs, complete MMA Files
  account credentials, all queue checks and `SOCIAL_KILL_SWITCH=false`.
- Each publish has an idempotency key, one retry and a `$0` live-post check. A second
  failure pauses MMA Files social only and enters the daily digest.
- No views, clicks, likes, reactions, comments, follows or messages are fetched or
  stored. Variant history is preparation for Phase 3, not a performance comparison.
- REACH and SPLIT remain disabled while social content and
  `METRICS_INGESTION_ENABLED=false` are closed.
