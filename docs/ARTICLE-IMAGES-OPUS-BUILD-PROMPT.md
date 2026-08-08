# Build prompt — article images that fit the article

You are the build session for the 2026-08-08 image-pipeline program. The owner
has reviewed the diagnosis, made every decision it asked for, and countersigned
`state/decisions/2026-08-08-article-image-fit.md`. This document carries those
decisions, the file map, the exact specifications, and the acceptance gates.
Nothing in here is open for re-litigation — where a judgement call remains, the
paragraph says so and names the constraint the call must respect.

Read in this order before writing any code:

1. `CLAUDE.md`, whole. Its golden rules bind this session.
2. `state/decisions/2026-08-08-article-image-fit.md` — the decision this
   program implements. Then the newest other files in `state/decisions/` —
   confirm nothing supersedes it. If something does, stop and say so.
3. This document, end to end.
4. All seven files in `orchestrator/src/images/` and their tests in
   `orchestrator/tests/`. The comments are not decoration: they record the
   incidents (the politician, the firearms range, the operetta singer, the
   Metropolitan Museum's "MMA-NYC" files) whose guarantees you must not
   weaken. Every rule you find there survives this program unless a task
   below names it.
5. The two call sites: `orchestrator/src/edition/live.ts` (lines ~280–345),
   `orchestrator/src/edition/write.ts` (the `sourcePacket` and
   `image_candidate_index` machinery), `orchestrator/src/edition/production.ts`
   (~lines 370–400), and `orchestrator/src/mma-files/live.ts` +
   `orchestrator/src/mma-files/pipeline.ts`.
6. `orchestrator/src/llm/` — the call, pricing and gateway layer every new
   model call must ride. `orchestrator/src/contracts/autonomy.ts` — the
   `ArticleImageSchema` you will extend in T10.

## Why this program exists

Seven articles have shipped. Two carried outright wrong photographs that are
still the live assets in mma-files (an Argentine politician above the Gustavo
Lopez article; a firearms-range photo above Shevchenko's). Two carried
brand-damaging random picks (a circuit-board "brain" clip-art the DNESKAi
design contract explicitly bans; a 2008 lecture-theatre photo with a sponsor
logo). Two fell to the FRAME plate. One carried a defensible but endlessly
repeating curated server-hall photo.

Root cause, in one sentence: the pipeline is text-blind — searches run on one
or two generic concept words from a hardcoded tag table rather than on the
article, the writer picks candidates from captions without seeing a pixel, the
curated sets hold 9 + ~23 files, the free Pexels/Pixabay keys sat uninstalled
(the owner installed both as Actions secrets on 2026-08-08; `cycle.yml` lines
85–86 already map them), and generation was forbidden. Every incident in the
images module's comment history is a textual-matching failure that one look at
the image would have caught. This program adds the look.

## The target architecture

One new law: **no image ships that nothing has looked at.** The ladder becomes:

1. **Identity rung** (people): Wikidata P18 → Commons. Unchanged. The gate
   runs advisory-only here — it may log, it may never substitute or reorder.
2. **Visual brief** (new): the desk that writes the article emits 2–3 English
   search phrases of concrete photographable nouns, one concept from the
   curated vocabulary, and a negatives list. Person names never enter a phrase.
3. **Curated scene rung**: keyed by the brief's concept. Gate re-validates the
   pick; a veto moves to the next file in the rotation.
4. **Licensed search rung**: brief phrases fanned out across Openverse,
   Wikimedia, Pexels, Pixabay; up to 12 deduped candidates; the gate scores
   the actual thumbnails against the article and picks, or rejects all.
5. **Illustration rung** (new, dark until `FAL_KEY` exists): FLUX.1-schnell
   via fal.ai renders an abstract on-brand illustration; the same gate must
   pass it; it is labelled an illustration everywhere.
6. **FRAME plate**: unchanged, the honest last state.

The gate's verdict — candidates considered, scores, vetoes, the chosen id, the
reason — is recorded in the run report and beside the delivered package, the
same way carousel summaries are recorded: a recorded selection always wins
over a re-derivation, so re-runs stay deterministic.

## Constraints that bind every task

- **Never weaken** the identity rung, the licence validators
  (`wikimediaLicense` NC/ND handling, `ALLOWED_IMAGE_LICENSES`,
  `validateLicensedImageCandidate`), the fixed `DOWNLOAD_HOSTS` allowlist
  discipline (extend the list in code review-able commits; never accept hosts
  from API responses), the alt-text constructors that cannot take a name
  (`illustrativePhotoAlt`, `illustrativeSceneAlt`, `heroAltCs` precedence), the
  delivery allowlists in `.github/workflows/cycle.yml`, or any existing test.
- **Excluded, by owner instruction:** Google/Gemini/Vertex in any role
  (including as a gate model), Higgsfield, Unsplash, SerpAPI, OpenAI image
  models, new subscriptions of any kind, scraping or hotlinking news/agency
  photographs. The gate runs on the existing Anthropic key.
- **Budget:** the gate rides the existing budgeted-gateway pattern so every
  call lands in `state/budget/ledger.json` with real token counts and cost.
  Hard caps: $0.02 per article for gate calls, $0.10 per day for the whole
  image program, 2 generated images per day. A hit cap means descend a rung
  (ultimately to the plate) and note it in the run report — never an overrun,
  never a blocked publication.
- **Failure posture:** any gate error, timeout or malformed verdict behaves
  exactly like "all candidates vetoed" — descend. An article can always ship
  with the plate; it can never ship with an unchecked photo.
- **Determinism:** given the same recorded candidates and verdict, re-runs
  reproduce the same selection. Model calls happen once and are recorded.
- **No model names or ids** in commit messages, code comments, or
  reader-facing text. Config files (`config/models.json`, `.env.example`) and
  state records are the sanctioned homes for ids.
- **Commit discipline:** one task, one commit, in T-order. Bodies in plain
  prose — apply the `stop-slop` skill to every one. Run the tests the task
  names before committing. Tick the task's checkbox in
  `state/decisions/2026-08-08-article-image-fit.md` in the same commit.
- **Branch:** work on `claude/article-image-selection-61rs70`. First act:
  merge the tip of `origin/main` into it (main moves daily). Push as you go.
  `main` is the owner's to merge — do not touch it.
- **Secrets:** never committed, never echoed into logs or run reports. The
  run report may record `pexels: present/absent`, never a value.

## Tasks

### T1 — The DNESKAi subject query reads the picked story

`edition/live.ts:284` builds `imageSubjectQuery` from the tags of the top
twelve digest items — the whole day's crowd, not the article. Until T5 moves
search after the write, narrow the basis to the story HERALD actually picked:
thread the curated brief's picked item ids (or run the existing curation step
earlier) so the query uses the lead story's tags only. Keep
`VISUAL_SUBJECT` as the mapping; keep the digest-wide basis as the fallback
when no pick exists. This is a small, self-contained commit that improves
covers on day one and survives as the fallback path after T5.

Gate: existing tests still green; a new unit test shows the query for a
mixed-tag digest follows the picked story.

### T2 — `IMAGE_GATE` role, vision plumbing, ledger and caps

- Add an `IMAGE_GATE` role to `config/models.json`: provider `anthropic`,
  the same small Anthropic model id the `DIGEST` role uses, modest caps
  (input ~8000 tokens, output ~1200). Update the file's image-role comment to
  match the decision: the old prohibition text is superseded; the decision
  sanctions exactly one article-pipeline illustration role (T10) and one gate
  role, and unsanctioned call sites remain forbidden.
- Extend `orchestrator/src/llm/` so a call can carry image content blocks
  (base64 + media type) alongside text. Follow the existing call/cache/prices
  structure; make sure `prices.ts` covers the gate model so ledger entries
  carry real cost. Stage name `image_gate` so ledger rows are queryable.
- Wire the per-article ($0.02) and per-day ($0.10) caps where the existing
  budget guards live, with the descend-don't-block posture from the
  constraints. The judgement call on exactly where the day counter lives is
  yours; the constraint is that a cap hit is visible in the run report.

Gate: unit test proves an over-cap gate request is refused locally (no HTTP)
and the caller receives the descend signal.

### T3 — `orchestrator/src/images/vision-gate.ts`

The heart of the program. One exported function, roughly:

```
assessCandidates(input: {
  venture: "caught-up" | "mma-files";
  article: { titleCs: string; dekCs: string; negatives: string[] };
  candidates: LicensedPhotoCandidate[];   // 1..12
  mode: "search" | "curated" | "generated" | "identity-advisory";
  fetchBytes?: (url) => Promise<Uint8Array>;   // injectable, tests use fixtures
  gateway: ...;                                 // budgeted, injectable
}): Promise<GateVerdict>
```

- Download each candidate's **thumbnail** through `safeFetch` with an explicit
  thumbnail-host allowlist (Openverse serves its own thumbs from
  `api.openverse.org`; Pexels/Pixabay/Commons/Flickr hosts are already in
  `DOWNLOAD_HOSTS`). Downscale with sharp to ≤512px on the long edge before
  encoding — this bounds tokens and cost.
- One model call scores all candidates comparatively. Structured output, per
  candidate: `fit` 0–10, `vetoes` from a closed enum, `reason` one sentence.
  The veto enum: `wrong-subject`, `recognisable-face`, `logo-or-watermark`,
  `embedded-text`, `ai-generated-look`, `dated-aesthetic`, `low-quality`,
  `unsafe-content`. In `generated` mode, `ai-generated-look` is not a veto
  (the image is one, honestly labelled) — `embedded-text`, `recognisable-face`
  and `off-brief` are what kill it; add `off-brief` to the enum.
- The system prompt states the magazine's context and the honesty rules: the
  photo illustrates the topic; it must never appear to depict a specific
  person unless mode is `identity-advisory`; when in doubt, veto. Feed the
  article title, dek and negatives — never source URLs, never the packet.
  Wrap article-derived text with the existing untrusted-content sanitisation
  used elsewhere in the orchestrator.
- Selection rule: highest `fit` ≥ 7 with no vetoes wins. Otherwise
  `GateVerdict.selected = null` and the caller descends. `identity-advisory`
  mode never selects — it only annotates the run report.
- Every verdict (including the descend case) is returned in a shape the run
  report can embed verbatim.

Gate: `orchestrator/tests/vision-gate.test.ts` with a fake gateway and fixture
bytes — threshold behaviour, veto behaviour, error-means-descend, advisory
mode never selecting, thumbnails over 512px being downscaled.

### T4 — The visual brief, written by the desk

- DNESKAi: extend `WRITE_SYSTEM`, `WRITE_TOOL_INPUT_SCHEMA` and the Zod
  schema in `edition/write.ts` with `image_search_phrases` (2–3 items, each
  an English phrase of 2–6 concrete photographable nouns), `visual_concept`
  (one key from the union of `ILLUSTRATIVE_SCENES` keys and the MMA scene
  vocabulary — export a single closed list), and `image_negatives` (0–5
  short phrases).
- MMA: same fields from `produceMmaFilesArticle`'s writer call for
  event-shaped subjects. Person-shaped subjects keep their structural rule:
  no search happens, so no phrases are requested.
- Validation, not trust: a validator rejects any phrase containing a token
  from the article's subject refs or fighter names (case-folded, diacritics
  stripped), anything non-ASCII, anything over six words. A failed validation
  drops the brief and falls back to the T1 path — never a retry loop.

Gate: unit tests for the validator (name smuggling, Czech leakage, length);
schema round-trip tests in the existing write/pipeline test style.

### T5 — Selection rewired: search after write, gate picks

The current order — search first, writer picks an index from captions — is the
text-blindness this program removes.

- DNESKAi: move candidate discovery out of `edition/live.ts` into the
  production flow after the article exists: write → brief → curated scene
  attempt → licensed search → gate → attach. Delete `image_candidate_index`
  from the write schema, the packet, and `selectedImageCandidateIndex` in
  `production.ts`; the writer no longer sees candidates at all. Keep
  `licensedImageSearchEnabled` as the master switch, and keep the
  skipped-provider NEEDS_YOUR_HELP bookkeeping.
- MMA: `articleImageCandidates` keeps its ref-shape routing (person → P18 →
  illustrative; event → search) but the event path becomes brief-driven and
  its result goes through the gate; `imageCandidateIndex` and the writer's
  pick are removed from `pipeline.ts`.
- The attach step records the gate verdict beside the package the same way
  `storeArticlePackage` records the carousel summary — and a delivery still
  cannot happen without its summary; do not disturb that invariant.
- Alt precedence is unchanged: candidate `altCs` (identity metadata or
  illustrative constructor) outranks everything; the gate never writes alt
  text for photographs of people.

Gate: the routing test (`article-image-routing.test.ts`) updated for the new
order; a production-flow test proving an all-vetoed search descends to the
curated rung and then the plate; `pnpm test` green.

### T6 — Retrieval widened

- `discoverLicensedPhotos` accepts multiple phrases: query each phrase across
  all four providers, interleave, dedupe by `sourceUrl` and title (the
  existing rules), stop at 12. Keep per-provider `per_page` modest (6–8) so
  rate limits stay comfortable.
- Pixabay's terms require caching API responses for 24 hours: satisfy this
  with a small on-disk cache keyed by query hash under the state tree (or an
  equivalent you justify in the commit body) so a re-run inside a day does
  not re-hit the API.
- Thumbnail hosts for the gate join an explicit allowlist next to
  `DOWNLOAD_HOSTS`, same review posture.

Gate: fan-out/dedupe unit tests with fake fetchers; a test that the cache is
consulted before the network for a repeated Pixabay query.

### T7 — The gate covers the curated rungs and the identity rung

- Curated scene and sport-photo picks pass through the gate in `curated`
  mode (one image, cheap). A veto moves to the next file in the rotation —
  the ladder's existing behaviour for an unfetchable file — and a fully
  vetoed rotation descends. This catches relicensed, rotted or
  quietly-replaced Commons files.
- The identity rung calls the gate in `identity-advisory` mode: the verdict
  is logged in the run report, nothing else changes. The honesty law stands:
  an entity-linked photo is used or the ladder descends; it is never swapped.

Gate: tests for veto-rotation and for advisory mode's inability to alter the
identity result.

### T8 — The scene-proposal flywheel

When the gate approves a search-rung photo at fit ≥ 8 with zero vetoes, append
a proposal to `state/ventures/<venture>/media/scene-proposals.md`: an
unchecked item carrying provider, file/id, source URL, licence as validated,
the gate's fit and reason, and a drafted Czech `sceneCs` line written by the
gate in the curated-alt voice (what is in the frame, no names, no events).
Cap the file at 20 open proposals — beyond that, skip silently. Add a NEEDED.md
`[owner:me]` item pointing at the file: ticking a proposal means a later
session moves it into `ILLUSTRATIVE_SCENES` / `ILLUSTRATIVE_SPORT_PHOTOGRAPHS`
under the existing curation rule (looked at, at 640px, no recognisable face).
The promotion itself stays a human-triggered edit — do not automate it.

Gate: unit test for the append shape and the cap.

### T9 — Recall the two wrong MMA heroes

`public/images/articles/oktagon-gustavo-lopez/` and
`.../ufc-valentina-shevchenko/` in mma-files still carry the pre-ladder
heroes: a photograph of the wrong human being, and a firearms range. Re-run
selection for both through the corrected ladder (neither has a usable P18, so
both land on illustrative sport photos with their no-name alt), produce
corrected packages, and deliver them through the sanctioned path — the
delivery outbox / `npm run consume:boardless` route; nothing writes to the
consumer repo by hand. Verify the consumer's hero, thumb, alt and attribution
all updated, and that the article text is byte-identical. If the delivery
contract genuinely cannot express an image-only correction, extend it
minimally (schema-versioned, validated on both ends) rather than working
around it; if even that is blocked, record exactly why in `NEEDED.md` and
stop this task — the escape hatch exists for this task only.

The two weak DNESKAi covers (08-05, 08-06) are a stretch goal by the same
mechanism only if the edition contract already permits it; otherwise leave a
one-line note in NEEDED.md and move on.

Gate: consumer-side files verifiably replaced (hash-compare in the commit
body); `npm run test` green in mma-files if that repo is touched.

### T10 — The illustration rung, dark

- `orchestrator/src/images/illustration.ts`: render via fal.ai's
  FLUX.1-schnell endpoint (REST, `FAL_KEY` env), 16:9 at ~1MP, one image per
  request, `safeFetch` posture for the API host and the output download host
  (explicit allowlist entries). Convert to WebP hero + thumb with the
  existing `webpVariant` machinery. Cost model: fixed estimate per image
  (~$0.003/MP) recorded in the ledger as `kind: "image"` with the stage name
  `article_illustration`.
- Enablement: only when `FAL_KEY` is present **and**
  `ARTICLE_ILLUSTRATION_ENABLED=true`. Absent either, the rung is skipped
  silently and the ladder behaves exactly as before. Cap: 2 images per day
  across both ventures, sharing the $0.10/day image-program cap.
- Style prompts, verbatim starting points (tune wording, keep every
  constraint):
  - DNESKAi: "Abstract editorial illustration for a technology briefing.
    Precise instrument-panel geometry, thin light lines on a near-black
    ground, electric blueprint-blue accent, subtle paper grain. Subject
    matter: <brief phrases>. Strictly no text, no letters, no logos, no
    human faces, no robots, no brains, no circuit boards, no glowing
    gradients."
  - MMA Files: "Atmospheric editorial illustration for a fighting-sports
    magazine. Arena light through haze, canvas and cage textures, ember
    orange accent on deep charcoal. Subject matter: <brief phrases>.
    Strictly no text, no letters, no logos, no recognisable faces, no
    depictions of real fighters."
- Every render passes the gate in `generated` mode; a veto burns the attempt
  (it still counts against the daily cap) and the ladder descends.
- Honesty surface: extend `ArticleImageSchema.origin` to
  `["photo", "svg", "illustration"]` and update the refinement at
  `contracts/autonomy.ts:127` (today it equates `svg` with deterministic;
  the new rule: `svg` deterministic, `illustration` generated-and-gated,
  `photo` neither). Licence block: name "BoardlessAI illustration", author
  "BoardlessAI FRAME", attribution "Ilustrace: BoardlessAI FRAME". Alt via a
  new constructor in the `alt.ts` spirit — takes a scene description, cannot
  take a name: "Ilustrace k tématu: <scene>. Nejde o fotografii." Verify both
  consumers accept the new origin value — check aifirst `lib/delivery/`
  validation and the mma-files consume script; touch a consumer repo only if
  its validator rejects the value, as its own minimal commit on the same
  branch name.
- Config surface: `ARTICLE_ILLUSTRATION` role entry in `config/models.json`
  (provider `fal`, the schnell endpoint id), `FAL_KEY` +
  `ARTICLE_ILLUSTRATION_ENABLED` in `.env.example` and `cycle.yml` env, and a
  NEEDS_YOUR_HELP_NOW.md item for the owner: create the fal.ai account, add
  `FAL_KEY` to Actions, prepay the minimum credit, flip the flag. Account
  creation and payment are the owner's acts; the code ships dark.

Gate: unit tests with a fake renderer — cap enforcement, dark-without-key,
veto-burns-attempt, origin/refinement round-trip through the schema; consumer
validators confirmed by test or by recorded check in the commit body.

### T11 — Documentation sweep

- `CLAUDE.md`: one short paragraph in "Two things a session will trip over"
  territory (or a third bullet): no article image ships unchecked — the
  vision gate must pass or the ladder descends, verdicts are recorded beside
  the package, and the illustration rung exists but is owner-gated.
- `about-project.md` / `scaling.md`: one-line cost note (gate under $1/month
  at full cadence; illustration ~$0.09/month at the cap, dark until enabled).
- `NEEDS_YOUR_HELP_NOW.md`: add the fal.ai item from T10. The Pexels/Pixabay
  item was already ticked when the owner added the keys.
- `NEEDED.md`: add the flywheel review item (T8) and tick anything this
  program completed. The fal.ai `[owner:me]` item already exists from the
  program setup commit.

### T12 — Full gates and handoff

- `pnpm test` green at the repo root; mma-files `npm run test` green if
  touched; `pnpm -C site typecheck` if any site file was touched (the admin
  article preview renders images — check whether the new origin value
  reaches it).
- One dry cycle (`pnpm cycle -- --phase morning --dry`) with the run report
  showing gate verdicts present, providers keyed, caps armed, illustration
  rung reported dark. Quote the relevant report lines in the commit body.
- Every checkbox in the decision file ticked, `state/ROADMAP.md` updated if
  it tracks this work, branch pushed. Do not merge to `main` and do not open
  a pull request — the owner merges after review.

## Traps, from the diagnosis session

Known sharp edges you will meet; each cost real debugging time once already:

- **Order of operations:** DNESKAi candidates are currently fetched in
  `live.ts` before curation has even picked the story, because the writer
  needed them in its packet. T5 removes the reason; do not leave a vestigial
  pre-fetch behind.
- **`heroReady`'s landscape rule** rejects portrait files except for
  identity-linked ones — correct for search, wrong for P18. It is load-bearing
  in both directions; touch it nowhere.
- **Alt precedence** (`heroAltCs`): illustrative candidates' own `altCs` is
  unreachable-by-design for writer text. Your new illustration alt joins that
  same unreachable class.
- **Openverse thumbnails** are served from `api.openverse.org`, not the
  origin CDN — the gate's thumbnail allowlist needs it even though the
  download allowlist must not change for it.
- **`contracts/autonomy.ts:127`** ties `origin === "svg"` to `deterministic`;
  extending origin without updating this refinement fails every package parse.
- **A delivery cannot exist without its carousel summary** — the store and
  outbox both build it; keep that path untouched when you move selection.
- **mma-files `demoMode`** defaults true without `NEXT_PUBLIC_DEMO_MODE=false`;
  when verifying the T9 recall visually, remember what you are looking at.
- **The site runs webpack, not Turbopack** (`next dev --webpack`) because
  studio imports break under Turbopack — relevant only if you touch site code.
- **Wikimedia rate limits tightened in 2026** (anonymous ~500 req/h): the
  existing User-Agent discipline in the images modules is part of staying
  inside them; keep it on every new fetch path.

## Definition of done

All twelve tasks committed in order with green gates; the decision file's
checklist fully ticked; no guard, test or contract weakened; total new
steady-state spend under $1/month with the illustration rung dark; the two
wrong MMA heroes no longer live; and an owner who can read the run report of
a dry cycle and see, for the first time, *why* every published image was
chosen.
