# MMA Files

MMA Files is the public bilingual magazine at <https://mma-files.vercel.app> and the
sole reader-facing home for BoardlessAI's MMA articles and FightAIQ data. BoardlessAI
owns planning, evidence checks and production; `lukaskourilcz/mma-files` owns the
reader application. Delivery can change only the two bounded data files agreed by the
repositories.

## Daily path

| Prague | What happens |
| ---: | --- |
| 09:00 | The fixed story service assigns or kills both article slots |
| 10:00 | The morning job checks its assigned slot and FightAIQ evidence before a call |
| 18:00 | The evening job repeats the same source-first check |
| 20:00 | The desk room opens only for a due agenda and reviews ratings, gaps and tomorrow's work |

Each date gets one append-only EditorialSlate. Every slot ends as assigned, published
or killed with a reason. If required FightAIQ evidence is missing or invalid, the job
kills the slot at `$0`; it cannot spend first and discover the gap later. Manual runs
can test the desk without a queued agenda, but still obey all other gates.

## Language and human review

`state/ventures/mma-files/STYLEBOOK.md` records observed patterns from ten Czech
Fights.cz articles and ten English MMA Fighting articles. It describes pacing,
sentence shape, attribution and phrases to avoid without copying their prose. JAB
writes the English draft. HACEK creates natural Czech from the evidence and English
draft rather than translating sentence by sentence. QUILL reviews structure and
clarity, while local checks reject generic filler. Facts and quotations still come
only from the evidence packet.

## Package and delivery

Each valid article package contains English and Czech copy, source notes and exactly
one image. The image selector prefers allowlisted, machine-licensed photos from
Openverse, Wikimedia Commons, Pexels or Pixabay; FRAME supplies a deterministic SVG
when no acceptable photo exists. Hero and thumbnail variants are stripped, resized
and committed into the consumer repository with localized alt text and attribution.
The orchestrator hashes the bounded payload, writes a delivery receipt and uses the
narrow GitHub App to update `data/boardless/articles.json` in the MMA Files repository.
FightAIQ uses the same guarded path for
`data/boardless/fightaiq.json`. MMA Files validates those files in CI and deploys from
`main`; it receives no model, source, admin or App private-key secrets.

After every content delivery, a `$0` verifier checks the target commit and CI, then
polls both language routes, the content-hash marker, image dimensions and attribution.
It retries delivery once. A second failure reverts the target commit, pauses MMA Files
and enters the failure in the daily digest.

REACH and SPLIT are currently disabled, so the article path spends no social-content
tokens. Their re-enable path is already complete: REACH returns two bilingual A/B
drafts whose visuals contain only a live Carousel Studio template id, version and
content payload; FRAME renders that payload deterministically. MMA Files posting
unlocks only after ten consecutive passed article proofs and complete brand
credentials; `SOCIAL_KILL_SWITCH=true` still beats that project gate. A/B variants
rotate and are recorded, but views, clicks, reactions and other reader data are not
collected. SPLIT stays idle while `METRICS_INGESTION_ENABLED=false`.

The BoardlessAI admin is the operating newsroom: it exposes short summaries, full
records, agent switches, articles, calendars, source data and ratings. The public
routes belong only to MMA Files.

## Account and launch settings still owned by a person

The code, content bridge and automated proof are complete. The owner still needs to
confirm MMA Files is in the delivery App installation, keep the public demo noindex,
add social account credentials when wanted, choose the corrections inbox and clear
the name/operator/privacy details before enabling indexing. See `NEEDED.md`.
