# Personal Growth operating design

Personal Growth is the owner's private planning workspace. Its scheduled room is `pg-desk` at
23:00 in `Europe/Prague`; each run targets the next Prague calendar date. The room owns a rolling
30-day plan and a 10-day strategic rhythm. It can prepare bounded Threads, Instagram and Reel
recommendations from owner-supplied evidence, but it does not write or rewrite OKRAJ and BBARAK
artifacts, publish to a social platform, monetize an audience, inspect another venture, or nominate
work from the portfolio.

## Inputs and authority

The deterministic planner reads only the typed owner configuration, recurrence and outcome
history, and explicit availability signals. Two optional boundaries exist:

- an accepted packet adapted from the already-saved Monday GoVIRAL brief; and
- one bounded reference manually selected by the owner through the registered Admin capability.

Missing optional inputs are truthful `unavailable`, `held` or `not-needed` states. They never stop
the core recurrence planner. GoVIRAL remains the only trend collector: Personal Growth has no
scraper, source registry, credential, quota or provider rerun of its own. The adapter accepts at
most three evidence-backed opportunities, charges no second cost, reuses one agenda per week, and
rejects evidence-free candidates rather than calling them trends.

The ordinary room may make at most one main synthesis and one deterministic repair. The expected
ceiling is about $0.12 and the hard per-run ceiling is $0.15. Dry fixtures make no provider calls
and cost $0. The nested Personal Growth all-in cap remains $20 per month. Neither the room nor an
input capability grants publishing or spend authority.

## Threads, Instagram and Reels

The Threads packet contains one primary suggestion, at most two distinct alternatives, or an
explicit `NO_POST`. Every accepted suggestion records language, Unicode character count, at most
one topic tag, pillar, source lane, provenance, selection reason, conversation purpose, current
experiment and profile versions. The gate rejects expired GoVIRAL signals, false memories,
manuscript overlap, owner vetoes, repetitive recent text, unsafe quality flags and any Kvórum,
portfolio or Social Distribution reference. Conversation opportunities contain public URLs and
evidence only. Replies remain manual.

Instagram uses a versioned owner policy. Its founding bounds reserve at least 85% of feed items for
personal or personally authored work, limit venture-led items to owner-manual references, cap
venture Story reshares at two per seven days and enforce a ten-day same-venture cooldown. Kvórum is
ineligible. MMA Files needs owner authorship or a recorded personal connection. A policy change
appends history; a looser revision needs an owner decision reference.

The Reel inventory covers Rapovej moment, Behind the page, Life between projects, A trend met a
memory and the optional English Rapovej deník lane. Each plan lists real assets, shots, language,
subtitles and evidence for any memory. The engine creates no footage and has no AI video path.

## Results and learning

Official Meta observations and manual entries share one Personal Growth-owned result contract.
Observations append at 24 hours, 72 hours, 7 days and 28 days and use an idempotency key. Missing
metrics stay unavailable. A manual result survives provider failure, and later API data adds a
second provenance lane instead of replacing it.

Before the protected Admin editor exists, the owner can append a complete manual result with
`pnpm --filter @boardlessai/orchestrator personal-growth:result -- --file <result.json>`. The
command validates the same published contract and returns only the result id and idempotency
status.

The first 28 days establish medians by platform, format, pillar and origin class. The baseline
activates no target; after day 28 it requests an owner decision for any 90-day target. Twelve
operational Personal Growth metrics use the existing quarterly evaluator. Growth rates are
calculated only with valid denominators.

At most two experiments may be active or under review. Their hypothesis, single changed variable,
metric, guardrail, sample minimum, window and stop condition freeze after start. A short sample
returns `INSUFFICIENT_DATA`. Feedback proposes bounded Personal Growth weights without changing
the original results or sending data to another venture.

Provider versions, permissions and the disabled Buffer seam are recorded in
`docs/PERSONAL-GROWTH-PROVIDERS.md`.

## Owner-authored lanes

OKRAJ is a 10-day, approximately 10-slide life-story carousel rhythm. Sandra is the configured
first subject. BBARAK is a three-day hip-hop article rhythm. Their anchors, owner status and final
URLs are typed metadata; no config or plan field can hold draft content. The owner writes and
publishes every word.

## Private journal

`pnpm --filter @boardlessai/orchestrator personal-growth:ingest -- --file <path> --language cs|en --title <title>`
ingests one owner-selected journal file. Live ingestion also requires
`PERSONAL_GROWTH_PRIVATE_CLONE_PATH` or `--private-root` pointing at a separate private Git clone.
The public state root and private clone must not overlap.

The implementation reuses Door Money's deterministic structural chunker and local-private-store
pattern. Czech and English are independent lanes and are never merged or translated. Source text,
chunks and structural retrieval material stay in the private clone. Git state receives only a
source hash, title hash, version id, counts, bounded numeric style traits, cost and availability.
An absent English lane is `unavailable`, not a request to translate Czech material.

Before any journal-derived suggestion can enter a public artifact, log, fixture or meeting
payload, the shared journal audit checks exact long n-grams, five-gram similarity, quote length and
private serialization fields. A suspect result is discarded; the audit may persist only boolean
and numeric findings. Style guidance contains structural measurements and requires original text.
Claims about events require owner evidence. No public fine-tune, provider prompt/response archive,
private embedding, source passage or unpublished English text is authorized.

## Recovery and replay

The planner hashes typed inputs. Repeating the same target and input returns the existing brief so
owner corrections survive. Recurrence history is append-only and retains completions, skips and
reschedules. The room distinguishes planned, quiet, not-needed, held, failed and unavailable
outcomes. Journal ingestion similarly reuses a complete language-and-source version and fails
closed when its private store, source, language or budget authority is unavailable.
