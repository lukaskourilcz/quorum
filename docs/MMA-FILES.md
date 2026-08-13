# MMA Files

> **What actually shipped, 2026-08-13.** MMA Files is the Czech-only public consumer for one
> daily article and the sole reader-facing FightAIQ surface. The original bilingual and two-slot
> publication design was superseded: the 09:00 desk assigns or kills the single 10:00 production
> slot, while the structurally retained PM slate entry closes as `single-slot cadence`. Content,
> FightAIQ and approved banner deliveries are schema-valid, hash-checked and bounded to their
> agreed consumer files. REACH is disabled, SPLIT is retired, metrics ingestion is off, and the
> global social kill switch remains the superior stop. Indexing, account credentials, legal
> details and any channel activation remain owner work; no shipped path weakens those gates.

MMA Files is the public Czech magazine at <https://mma-files.vercel.app> and the
sole reader-facing home for BoardlessAI's MMA articles and FightAIQ data. BoardlessAI
owns planning, evidence checks and production; `lukaskourilcz/mma-files` owns the
reader application. Delivery can change only the bounded article, FightAIQ, and banner
stores agreed by the repositories.

## Daily path

| Prague | What happens |
| ---: | --- |
| 09:00 | The story desk assigns or kills the single daily slot from verified evidence |
| 10:00 | The article job checks that assignment and its FightAIQ evidence before a call |
| 20:00 | The desk room opens only for a due agenda and reviews ratings, gaps and tomorrow's work |

Each date gets one append-only EditorialSlate. Its AM slot ends as assigned, published or
killed with a reason; the retained PM slot is deterministically killed as `single-slot cadence`.
If required FightAIQ evidence is missing or invalid, the job
kills the slot at `$0`; it cannot spend first and discover the gap later. Manual runs
can test the desk without a queued agenda, but still obey all other gates.

## Language and human review

`state/ventures/mma-files/STYLEBOOK.md` records observed patterns from ten Czech
Fights.cz articles. It describes pacing, sentence shape, attribution and phrases to
avoid without copying their prose. JAB drafts the article straight in Czech from the
evidence packet; there is no English draft to adapt. HACEK owns the Czech register
the desk writes to and repairs the copy before the gate reads it. QUILL reviews
structure and clarity, while local checks reject generic filler. Facts and quotations
still come only from the evidence packet.

## Package and delivery

Each valid article package contains the Czech copy, source notes and exactly
one image. The image selector prefers allowlisted, machine-licensed photos from
Openverse, Wikimedia Commons, Pexels or Pixabay; FRAME supplies a deterministic SVG
when no acceptable photo exists. Hero and thumbnail variants are stripped, resized
and committed into the consumer repository with localized alt text and attribution.
The orchestrator hashes the bounded payload, writes a delivery receipt and uses the
narrow GitHub App to update `data/boardless/articles.json` in the MMA Files repository.
FightAIQ uses the same guarded path for
`data/boardless/fightaiq.json`; approved banner packages use
`data/boardless/ads.json`. MMA Files validates those files in CI and deploys from `main`;
it receives no model, source, admin or App private-key secrets.

After every content delivery, a `$0` verifier checks the target commit and CI, then
polls the article route for every locale the package carries, which is Czech alone,
plus the content-hash marker, image dimensions and attribution. It retries delivery
once. A second failure reverts the target commit, pauses MMA Files and enters the
failure in the daily digest.

REACH is currently disabled and SPLIT is retired, so the article path spends no social-content
tokens and does not rank variants from engagement data. The dormant queue shape accepts Czech A/B
drafts whose visuals contain only a live Design Lab template id, version and content payload;
FRAME renders that payload deterministically. MMA Files posting
unlocks only after ten consecutive passed article proofs and complete brand
credentials; `SOCIAL_KILL_SWITCH=true` still beats that project gate. A/B variants
rotate and are recorded, but views, clicks, reactions and other reader data are not
collected while `METRICS_INGESTION_ENABLED=false`.

The BoardlessAI admin is the operating newsroom: it exposes short summaries, full
records, publishing controls, articles, calendars, source data, ratings, banner health,
exact-ratio cropping and staged delivery. The public routes belong only to MMA Files.

## Account and launch settings still owned by a person

The code, content bridge and automated proof are complete. The owner still needs to
confirm MMA Files is in the delivery App installation, keep the public demo noindex,
add social account credentials when wanted, choose the corrections inbox and clear
the name/operator/privacy details before enabling indexing. See `docs/NEEDED.md`.
