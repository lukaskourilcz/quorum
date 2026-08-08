# Design Lab v2 — build contract

You are the human-invoked engineer in `lukaskourilcz/quorum`. This document is
the binding contract for one program of work: turning the Design Lab
(`/admin?venture=carousel-studio`) into the working design tool for the
company's social content — Instagram carousels, Instagram stories and Threads
posts — used autonomously by the pipeline and manually by the owner, plus six
owner-directed corrections to the public office site (DL-14 … DL-19).

The owner has reviewed the diagnosis behind this contract and instructed the
build. Where this contract and the decision file below disagree, the decision
wins. Where either disagrees with a standing decision it does not explicitly
revise, the standing decision wins.

## Before you start

1. **Branch.** Work on `claude/design-lab-editor`, created from the latest
   `origin/main`. The article-image program (IMG-01…IMG-12) is already merged
   to main (`f9a4ccd Merge the article-image programme`), so the base is
   current — fetch before branching and verify that merge is in your history.
2. **The program is already committed.** This contract lives at
   `docs/DESIGN-LAB-OPUS-BUILD-PROMPT.md` and the countersigned decision at
   `state/decisions/2026-08-08-design-lab-editor.md`, both on main. Verify
   both exist, then start directly with DL-01 — there is no bootstrap commit.
3. **Read, in order:** `CLAUDE.md` (root), the newest files in
   `state/decisions/` — at minimum `2026-08-02-carousel-studio-d11.md`,
   `2026-08-02-social-paused-until-ten-articles.md`,
   `2026-08-01-autonomy-social-activation.md`,
   `2026-08-06-orchestration-overhaul.md`,
   `2026-08-07-marketingshark-founding.md` — then `state/BRAND.md`,
   `studio/src/` (all of it; it is ~2,000 lines and every task touches it),
   `site/src/lib/admin-decks.ts`, `site/src/lib/carousel-studio-admin-store.ts`,
   `site/src/components/admin/article-decks-panel.tsx`,
   `site/src/app/admin/page.tsx:391-401`, `orchestrator/src/social/` (pack.ts,
   venture-packs.ts, deck-style.ts, deck-receipt.ts, queue.ts, activation.ts),
   `orchestrator/src/mma-files/social.ts`,
   `orchestrator/src/studio/carousel-summary-store.ts`,
   `state/ventures/mma-files/social/ASSIGNMENT.md`, and
   `.github/workflows/cycle.yml:725-737` (the cycle commit allowlist).
4. **Design input.** If `docs/design/design-lab/` exists, it is the visual
   specification for DL-04, DL-05 and DL-10 and you implement it faithfully.
   It may arrive in either shape: the commissioned bundle (`SPEC.md`,
   `TOKENS.md`, `editor.html`, `families/*.html`) or a Claude Design export —
   `Design Lab.dc.html` plus its `support.js` runtime. The `.dc.html` is a
   self-contained designed screen: render it (Chromium is pre-installed for
   Playwright; do not download browsers) and read the rendered DOM and
   computed styles to extract layout, spacing, typography and colour — what
   it *renders* is the spec, not its internal markup conventions. Map its
   colours onto the existing brand/admin tokens rather than importing loose
   hex values, and flag any colour that has no token home instead of
   inventing one. If it contains template/family designs, they are DL-05's
   spec too; otherwise DL-05's CSS-port fallback stands. If the directory
   does not exist, the fallback sources named in those tasks apply and the
   visual pass stays in the current admin language. Check at the start of
   each of those tasks, not once — the owner may add or extend the bundle
   mid-program.
5. **Invoke the `task-observer` skill** before the first edit, and apply
   `stop-slop` to every piece of prose that ships.

## Laws of this program (violating any of these is a failed task)

- **The renderer never calls a model.** Decision D11, reaffirmed by
  `orchestration-2026-08f`. All copy is authored upstream and arrives as
  bounded strings in a validated payload.
- **No new paid call sites.** Social copy rides the existing article/edition
  calls (the `altHeadline` precedent, and
  `state/ventures/mma-files/social/ASSIGNMENT.md:5-8` names this exact
  pattern for captions). `orchestrator/src/llm/call.ts` remains the only
  ledger append path and you do not add a call that uses it.
- **Posting stays locked.** `social-2026-08a` (drafts only until each magazine
  has ten articles), the triple-lock (`runner.ts`, `activation.ts`,
  `channel-registry.ts`), `config/channels.json`, `SOCIAL_KILL_SWITCH`
  handling and `assertQueueItemPublishable` are all out of scope. Do not
  touch them, their tests, or the publisher (`publish.ts`, `meta.ts`).
- **Determinism in the render path.** No `Date.now()`, `Math.random()`,
  `new Date()` or `randomUUID()` anywhere under `studio/src/` or in any
  function that decides what a shipped deck looks like. Variety is seeded
  from `(venture, slug, date)` and from *recorded state* (receipts), never
  from a clock. Owner-facing admin writes may stamp times, as
  `carousel-studio-admin-store.ts` already does.
- **Tokens only.** A template names brand tokens, never hex. Every token
  combination a template can produce must clear the contrast check —
  `validateTemplateForBrand` is the judge and you extend it to cover every
  new layer type you add.
- **Additive schema evolution.** `carousel-template/1` stays the
  schemaVersion; new capabilities are optional fields with defaults, so every
  stored proposal, pack and reference keeps parsing. Stored references like
  `deck-spotlight-10` in `state/social/packs/2026-08-06.json` must keep
  resolving byte-for-byte until you deliberately re-baseline (DL-04), and the
  re-baseline happens in one commit with its hash-pinning tests.
- **Studio is consumed as `dist/`.** After every edit under `studio/src/`,
  run `pnpm -C studio build` before running anything that resolves the
  package (site dev/build, orchestrator tests, `tsx` entry points).
- **Repo-as-state discipline.** Do not commit rendered PNGs as state. Decks
  render on demand (the existing philosophy in `admin-decks.ts`); the things
  that persist are recipes, copy, receipts, presets — small JSON documents on
  the cycle allowlist paths (`state/social`, `state/ventures`,
  `site/public/social`).
- **Never weaken** budget, patch, security, evidence, stage, finance,
  content-quality or release guards or their tests. Never commit secrets. No
  model names or ids in commits, code comments, or reader-facing text.
- **Commits.** One task per commit (a task may use 2–3 phase commits if it is
  genuinely large; name them `DL-NN a/b`). Tick the task's checkbox in the
  decision file in the same commit that completes it. Update
  `state/ROADMAP.md` when the program lands.

## Issues and working order

The program is tracked as GitHub issues titled `DL-01` … `DL-20`, one per
task, worked in **strict title order**. At least one commit completes each
issue, and the same commit ticks that task's checkbox in the decision file.
Close each issue with a one-line comment naming the completing commit; do
not batch closures. Where a task here and its issue disagree, the decision
wins, then this document, then — being newest — the issue: the issues are
the channel through which the owner sends mid-program updates, so re-read
an issue immediately before starting it.

## Working alone

The owner is away and will not answer questions or grant approvals while
you work. Everything in this program is pre-authorized by the decision
file, and nothing in scope requires new money, credentials, accounts or
posting. Do not stop to ask and do not wait. If something is genuinely
blocked from inside the session — a missing secret, an external outage —
record it as a `docs/NEEDED.md` item, note it on the issue, and move to the
next task: a blocked task is skipped loudly, never silently, and never
becomes a reason to stop the program. You are done only when every issue is
closed, every gate in DL-20 is green, and the self-review has run with its
findings fixed. Do not end the session with the program half-landed.

## The diagnosis you are fixing (verified, with evidence)

1. **The style save always failed in production, and the UI rewinds.**
   `article-decks-panel.tsx:41` resets the chip to the saved style when the
   POST fails. Two stacked causes. The first is already resolved: the owner's
   `BOARDLESSAI_GITHUB_TOKEN` in Vercel was scoped to Actions read/write,
   which the contents API cannot use; the owner corrected it to Contents
   read/write on 2026-08-08. The second — `writeGitHub`
   (`carousel-studio-admin-store.ts:41-60`) reads the file's `sha` before
   writing and cannot create a file that does not exist — was worked around
   the same day by hand-seeding `deck-style-overrides.json` on main
   (`764423f`), and style saves now demonstrably work: the
   `admin: set the … deck design` commits that follow it on main are the
   owner clicking chips in production. The create path is still yours to
   build. DL-12's `presets.json` will not exist either, and the store must
   be able to create any new state file instead of depending on
   hand-seeding.
2. **Three cards render identical images.** Three MMA articles share the slug
   `ufc-event-ufc-fight-night-gamrot-vs-salkilld` (redeliveries of one event);
   `admin-decks.ts` keys everything by `venture+slug`, the deck render route
   resolves by first match (`deck/.../route.ts:39`), the hero loader takes the
   first directory hit, and the React list keys collide
   (`article-decks-panel.tsx:142`).
3. **The A/B "variants" the pipeline ships are byte-identical.**
   `articleDeckTemplate` declares `variants: []` on every slide
   (`studio/src/library.ts:214`); `orchestrator/src/mma-files/social.ts:25-48`
   builds A and B differing only in the ignored `content.variant`; the
   `designAxes` block is inert metadata. Same `svgHash`, two filenames.
4. **Three of the five deck styles are one design.** `mesh`, `aurora` and
   `spotlight` are the same blurred-radial-blob primitive; on MMA Files'
   greys (`#111113`/`#1d1d22`/`#29292f`, ~3% luminance apart) the non-accent
   blobs are invisible. Only `contrast` and `editorial` are structurally
   distinct. The thirteen genuinely different designs
   (`site/src/lib/carousel-templates.ts` — Broadsheet, Column, Ticket…) are
   CSS-only and never reach the renderer.
5. **No embedded fonts.** Brand font stacks are system strings
   (`library.ts:546-614`); no font file exists in the repo; production
   rasterization substitutes whatever fontconfig finds, and `fitText`
   estimates width as `fontSize * 0.56` (`text.ts:73`). SVG is deterministic;
   PNG bytes are deterministic only per machine.
6. **9:16 stories are one line away.** Every deck template fails
   `fitsSafeArea` for `instagram-story` solely because `logo()` defaults to
   `y = 0.07` inside the story's 14% top chrome band (`library.ts:52, 226`).
7. **No export, no copy pack, no presets.** The admin states "no download
   action" as policy; captions/hashtags exist only as deterministic
   concatenations in the queue path; nothing stores a reusable design choice
   beyond the one style override.

## Tasks

### DL-01 — Persistence that tells the truth

`writeGitHub` gains a create path: on a 404 read, PUT without `sha` (any other
read failure stays an error). The deck-style POST's failure body becomes
actionable (name the missing token when that is the cause). The panel
separates **viewing** from **saving**: clicking a chip re-renders the preview
immediately and unconditionally; the save runs alongside, with three visible
states — saved (with the returned commit reference), saving, and a persistent
warning when writing is not configured ("preview only — nevydrží obnovení
stránky", naming `BOARDLESSAI_GITHUB_TOKEN`). The bounce dies either way: the
chip never rewinds; only the save badge changes. Make the warning state
distinguish "no token" from "token refused" — fine-grained tokens expire, and
the next silent failure mode is an expired token a year from now; the banner
should make that diagnosable at a glance.

The owner's token already exists in Vercel with Contents read/write (scope
corrected 2026-08-08) — do **not** add a create-a-token item to
`docs/NEEDED.md`. Instead, after this task deploys, verify one deck-style
save end to end in production and record an owner item only if something in
the environment still blocks it.

Gates: unit tests for the create-vs-update branches (mock fetch); a test that
the deck-style route's 503 body names the cause; panel renders all three save
states in a component test or e2e.

### DL-02 — One article, one identity

Deck identity becomes `venture + slug + date` end to end: `readAdminDecks`
keys, the render route (`/deck/[venture]/[slug]/[date]/[style]/[slide]`), the
hero loader, React keys, and `DeckStyleOverride` (add optional `date`;
matching prefers exact `venture+slug+date`, falls back to `venture+slug` so
any pre-existing override still binds). `effectiveDeckStyle` in
`orchestrator/src/social/deck-style.ts` learns the same preference. Three
redeliveries of one event must appear as three cards rendering three decks.

Gates: a test with two same-slug, different-date articles asserting distinct
render-route resolution and distinct style overrides; the duplicate-key React
warning is gone.

### DL-03 — Schema v2 capabilities (additive)

Extend `carousel-template/1` with optional layer capabilities, each validated
and each covered by the contrast/safe-area/overflow checks:

- `gradient` layer: linear, exactly two token stops, one angle.
- image layer: `clip` (`circle` | polygon points), `treatment`
  (`none` | `mono` | `duotone`) — treatments applied to the hero bytes with
  sharp *before* embedding, so librsvg only ever sees a finished PNG.
- rule layer: `dash` (on/off).
- text layer: `glow` (soft accent shadow — `feDropShadow` or a blurred
  duplicate; verify it rasterizes identically via the golden hashes).
- shape layer: `padText` variant that wraps a named text slot (a panel that
  hugs its text).
- template generator input: per-slide `phase` is already computed; expose a
  per-family `rhythm` (repeating beat pattern of named steps) in the deck
  generator rather than in the schema, mirroring how the CSS specs did it.

Old documents must parse unchanged (defaults). `validateTemplateForBrand`
covers every new colour-bearing capability (a duotone hero counts as its
token colour over `background` for contrast purposes; a gradient's two stops
are both checked under the text frames above them).

Gates: schema round-trip tests for every new field; a stored v1 template
(fixture copied from today's output) still parses and renders to the same
SVG hash; contrast check fails a deliberately illegible gradient fixture.

### DL-04 — Real typography, machine-independent rasterization

The single deepest fix. Two halves, one commit series:

1. **Fonts.** Per `docs/design/design-lab/TOKENS.md` if present; otherwise:
   DNESKAi `Space Grotesk` (headline) + `Inter` (body), MMA Files
   `Archivo Narrow` or `Barlow Condensed` (headline) + `Inter` (body),
   Titty Tuesdays `Archivo Black` display, sharks `Inter`, mono
   `IBM Plex Mono` everywhere. All SIL OFL; commit the exact `.ttf` files
   under `studio/fonts/<family>/` with each family's `OFL.txt` beside it, and
   record the choice in `docs/NEEDED.md` as done. Brand font strings in
   `CAROUSEL_BRANDS` change to the real family names.
2. **Rasterization.** Make PNG bytes deterministic across machines. Evaluate
   in-repo and record the decision in the commit body: (a) keep sharp/librsvg
   and bundle fonts via a committed fontconfig (`FONTCONFIG_PATH` pointing at
   a repo file listing `studio/fonts`), or (b) switch rasterization to
   `@resvg/resvg-js`, which takes font buffers explicitly and removes the
   fontconfig variable. Whichever wins: `fitText` gets real per-font advance
   metrics (generate a compact width table per committed font at build time —
   a script under `studio/` reading the font files, output committed, no
   runtime font parsing), replacing the `0.56` estimate.

This re-baselines every pinned hash. Do it in one commit with the new pinned
hashes, and add the missing cross-machine guard: a test that renders the
fixture deck and compares against a committed PNG hash, run in CI (the gate
run on GitHub Actions is the second machine; if it disagrees with your local
hash, the rasterization is not deterministic and the task is not done).
Czech diacritics (`ř ě ů`) and the fixture stress word
`NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ` must render without substitution — verify by
sampling glyph pixels, not by eye.

Also fix the sizing consequences: `logo()` letter-spacing/size math and every
`maxFontSize` ceiling get re-checked against the real metrics (the overflow
check will tell you).

### DL-05 — The family library (the marquee task)

Implement the template families from `docs/design/design-lab/SPEC.md`. If the
bundle is absent, port the thirteen CSS specs from
`site/src/lib/carousel-templates.ts` into real `carousel-template/1` deck
generators instead — they are the richer design language and were always
meant to be the renderer's (hero geometry, masks, three-step light/dark
rhythms, per-band type ramps). Either way:

- Each family is a generator `family × slideCount(5–10)` like
  `articleDeckTemplate` today, with: its own composition (hero geometry,
  text box), a **rhythm** (repeating beat pattern — e.g. dark → inverted →
  dark — so adjacent slides differ), real per-slide `variants` (at minimum
  accent↔secondary and an inverted beat), and per-band type ceilings.
- The five current styles remain resolvable at their current output
  (stored packs name `deck-mesh-*`…`deck-spotlight-10`); new families are
  additive. If a design-bundle family collides in name with an existing style
  (`spotlight`), suffix the new one (`spotlight-ring`).
- Retire the CSS gallery: `carousel-templates.ts` and the CSS-only
  `CarouselArticleStudio` preview path go away; the templates tab shows true
  renders through the deck route (DL-10 merges the tabs). Keep the
  stress-check idea — shortest/median/longest passage — but run it against
  real renders. Update the stale copy while you are there: "Ten layouts"
  (`carousel-studio-venture-page.tsx:35`) and the hardcoded
  "All 54 checks pass" (`carousel-studio-panel.tsx:105`) become computed.

Gates: every family × all five brands × every format `previewFormats` offers
× all six checks passes; **a test that any two families render different
bytes for the same payload** (the suite's named gap); **a test that variant A
and variant B of one family differ in bytes** (the other named gap); deck
templates join the brand×format check loop that today covers seeds only.

### DL-06 — Stories, squares, Threads covers

- Safe-area-aware chrome: the wordmark and closing rule positions become
  format-relative (below the story's 14% top band, above the 16% bottom
  band), not constants. Every deck family must pass `fitsSafeArea` for
  `instagram-story`, and `previewFormats` then offers all four canvases
  honestly.
- The story rendering of a deck is the same slides recomposed for 9:16 —
  bigger type bands are already declared per format via the schema; verify
  the overflow check across formats.
- Threads: the queue path stays text-only (`assertQueueItemPublishable`
  enforces zero assets and you are not touching it), but the Lab can render
  and export the 1200×1200 cover for manual use. Stop rendering-and-
  discarding: `composeEditionSocialPack` skips building frames for a channel
  whose assets are forced empty (`pack.ts:108, 253-261`) — cheaper and
  honest.

Gates: `fitsSafeArea` true for all families in story format; a story render
places no text layer inside the chrome bands (assert geometrically over the
template, not visually); pack composition for Threads builds no frames.

### DL-07 — The variety engine

A **recipe** is the complete design decision for one article's social set:

```
carousel-recipe/1 {
  venture, slug, date,
  family, variant, accentSwap: boolean,
  treatment: none|mono|duotone,
  typeScale: 0.9|1.0|1.1,
  phaseSeed: integer
}
```

- `deriveRecipe(inputs, history)` — pure function. Seeded by
  `sha256(venture + slug + date)` like the hook picker
  (`studio/src/hooks/assign.ts:76-85`), then adjusted against history: never
  repeat the family used in the venture's last two receipts; prefer the
  least-recently-used third of families. History comes from
  `state/social/deck-receipts` (extend the existing receipt with the recipe;
  receipts are already one-per-article) — recorded state, not a clock.
- The owner override generalizes: `effectiveDeckStyle` becomes
  `effectiveRecipe` — the override file may pin any recipe field per
  `venture+slug(+date)`; unset fields derive. The old style-only override
  shape keeps working (a bare `style` maps to `family`).
- The A/B queue pair becomes honest: variant B is a real recipe variation
  (the family's inverted beat + accent swap), or — where a family declares no
  second variant — the pair collapses to one item. `designAxes` metadata is
  either populated from the recipe or deleted; it does not stay inert.

Gates: replay determinism (same inputs + same receipts → same recipe);
variety (a synthetic week of six articles never repeats a family
back-to-back); override precedence tests; A/B bytes differ wherever a pair is
queued.

### DL-08 — The copy pack (captions, hashtags, Threads text, story line)

Per `ASSIGNMENT.md`, inside the **existing** article call — no new call site:

- **MMA Files** (`orchestrator/src/mma-files/live.ts`, beside the
  `altHeadline` instruction at `:319`): the desk also returns `igCaption`
  (≤ 500 chars, Czech, drawn from the packet, no invented claims),
  `hashtags` (5–10, lowercase, no diacritics, from the article's own terms
  plus the venture's base set), `threadsText` (≤ 480 chars, standalone,
  no hashtag stuffing — GoVIRAL's craft notes at
  `orchestrator/prompts/goviral.md` are the register), `storyLine`
  (≤ 66 chars, the hook-lint cap for Czech). Zod-parse, `stripSourceMarkers`,
  bound lengths, all optional so old articles stay valid.
- **DNESKAi** (`orchestrator/src/edition/live.ts`): same fields from the
  edition call, same bounds.
- **Code, not the model, appends the licence line**: the rendered caption
  shown and exported is `igCaption + "\n\n" + heroCredit` whenever the
  article carries a hero — the same rule `reviewCarouselSummary` already
  enforces for slides. A caption without the credit must be unbuildable, not
  discouraged.
- Storage: in the article package contract (`contracts/mma-files.ts`,
  `contracts/article.schema.json` — additive optional; the magazine
  consumers ignore unknown fields, verify against their loaders before
  relying on that) and beside the carousel summary under
  `state/ventures/carousel-studio/social-copy/<venture>/<date>-<slug>.json`.
  Extend `carousel-summary/1` with optional `coverLine` while you are in
  there — the summary path currently drops `altHeadline`, which is why the
  templates tab shows a different slide 1 than the ship path.
- Token budget: the article calls' `maxOutputTokens` in `config/models.json`
  get the small raise these fields need (state the before/after numbers in
  the commit body). The cost rides the same ledgered call; nothing new
  touches `state/budget`.

Gates: schema tests; a fixture article produces a copy pack whose caption
carries the credit; length bounds enforced; queue items and the Lab read the
recorded copy pack when present and fall back to today's deterministic
concatenation when not (old articles keep working).

### DL-09 — Recipes at delivery (the autonomous path)

At delivery time — the same moment `storeArticleCarouselSummary` /
`storeEditionCarouselSummary` run — also derive and record the recipe
(DL-07) and the copy-pack reference for the article, under
`state/ventures/carousel-studio/recipes/<venture>/<date>-<slug>.json`. This
is **inventory, not composition**: it needs no channel to be enabled, costs
nothing, and gives the Lab and the future composer one recorded truth for
"what this article's social set looks like". When channels are later enabled
and `composeEditionSocialPack` / `composeMmaFilesSocialQueue` run, they
consume the recorded recipe instead of re-deriving style ad hoc.

The decision file (Appendix A) authorizes exactly this split; the
composition and publishing gates themselves do not move.

Gates: delivery dry run writes summary + recipe + copy pack side by side;
composer honours a recorded recipe in its template reference; determinism
test across a replay.

### DL-10 — The workspace (one tab, the whole flow)

Merge the `templates` and `decks` tabs into one **studio** workspace
(`config/ventures.json` adminTabs: `["studio", "inspiration", "hooks"]`; old
tab params fall back to the first tab, which is the existing behaviour).
Layout per `docs/design/design-lab/editor.html` if present; otherwise build
it plain in the current admin language (the design pass then lands as a
follow-up when the bundle arrives). Either way the flow is:

- **Article rail**: every delivered article with a recorded or derivable
  summary, both magazines, newest first — venture chip, date, headline,
  passage count, `bez obrázku` / `neúplné` badges. The rail reads recorded
  summaries first (durable for both ventures) and falls back to packages, so
  DNESKAi articles appear even though `state/edition/outbox` is transient.
- **Canvas**: format tabs (4:5 / 1:1 / 9:16 with a safe-area overlay toggle /
  Threads), slide filmstrip, main preview — always the real engine's PNG via
  the deck route (which learns to accept a full recipe, not just a style).
  Pending state keeps the previous frame dimmed; failures show per-slide
  retry, never a broken-image row.
- **Design controls**: family picker with thumbnails rendered from *this
  article's* cover; variant scheme; photo treatment; type scale; phase
  re-deal. Every control edits the visible recipe line (e.g.
  `ticket · B · duotone · 1.1× · fáze 3`), and the recipe is what saves.
- **Per-slide text**: editable within the engine's own review rules
  (≤ 30 words, no empty slide; the word counter goes red past the cap and
  the save disables with `reviewDeck`'s own sentence). Overrides persist per
  `venture+slug+date+slide` through the same admin store; the render route
  reads them server-side, so preview and export show the edited deck.
- **Output rail**: the copy pack with copy buttons (reuse
  `copy-social-text.tsx`) and the credit line visibly non-removable; export
  (DL-11); save-as-preset (DL-12); the standing note that posting is closed
  by `social-2026-08a` until each magazine has ten articles.

Empty/degraded states: no articles; no photo; not renderable (show
`reviewDeck` problems verbatim); render failure; persistence unconfigured
(DL-01's warning). The e2e containment guard needs `data-horizontal-scroll`
on every real scroller — that is an existing gate.

Gates: `pnpm -C site typecheck && pnpm -C site build`; e2e over the
workspace (tab renders, format switch changes canvas ratio, editing a slide
past 30 words blocks the save, copy buttons announce); a11y pass on the new
controls (labels, focus, `aria-pressed` on chips — the current panel's
pattern).

### DL-11 — Export

- Per-slide: the deck route gains `?download=1` → `Content-Disposition`
  with `"<venture>-<date>-slide-NN.png"`.
- Whole deck: a new admin-gated route streams a ZIP (store-mode via `fflate`
  — justify any other dependency in the commit body) containing every slide
  PNG at the selected format + `caption.txt` (caption + credit + hashtags) +
  `threads.txt` + `manifest.json` (template reference, recipe, hashes,
  attribution). Rendered on demand; nothing written to the repo.
- Both respect text overrides and the active recipe.

Gates: an integration test unzips the response and asserts the file list,
that each PNG's bytes equal a direct render of the same slide, and that
`caption.txt` ends with the credit when a hero exists.

### DL-12 — Presets

`carousel-preset/1`: `{ id, name, ventureScope, formats, recipe fields
(family/variant/accentSwap/treatment/typeScale), status: draft|live,
changedAt, changedBy }` stored at
`state/ventures/carousel-studio/presets.json` through the same persist path
(and therefore the same DL-01 truth-telling). The editor saves the current
recipe as a preset and loads presets from the picker. `deriveRecipe` gains an
optional preset pool: when the venture has `live` presets, the engine draws
from them (still seeded, still anti-repeat); with none, it derives from the
built-in axes. Presets go live through the same explicit owner action
pattern as template lifecycle (`TemplateStatusControl`), not automatically.

Gates: schema tests; save→reload→apply round-trip in e2e; variety engine
honours the pool; a draft preset is never picked autonomously.

### DL-13 — Naming, aliases, stale truth

- `/admin?venture=design-lab` resolves to the same venture record (alias at
  the lookup in `admin/page.tsx:172`, plus the binder route). The stored id
  `carousel-studio` does not change — it is load-bearing across `state/`,
  `config/`, API paths and the floorplan; the display name already reads
  Design Lab everywhere a human looks (decision D13 territory: identifiers
  stay, surfaces speak).
- Sweep remaining stale copy the earlier tasks did not touch; regenerate
  `docs/ECOSYSTEM.md` if its generated block covers any of this (its test
  will tell you).
- `docs/NEEDED.md`: tick what this program completed, add what it created
  for the owner (the token item from DL-01; a `[kind:decision]` item to
  choose whether carousel lockups should read DNESKAi instead of CAUGHT UP —
  the kicker and the wordmark currently disagree and that is an owner call,
  not yours).
- `about-project.md` / `scaling.md`: one paragraph each — the Lab's render
  path costs $0 and copy rides existing budgeted calls.

## Arc V — Office-site corrections (DL-14 … DL-19)

Six owner-directed fixes to the public office walkthrough and its satellite
pages, riding this program's branch and gates, one issue each. The office
component's layout invariants in `CLAUDE.md` (oversized plates centred with
`left/top:50%` + `translate(-50%,-50%)`; `pointer-events: none` on every
decorative layer; no `will-change` on plates; `data-horizontal-scroll` on
real scrollers) are load-bearing — every fix below works inside them.

### DL-14 — Calendar tooltips clear the header row

On the calendar (`site/src/components/office/section-calendar.tsx:161-171`,
component `site/src/components/ui/tooltip.tsx`), tooltips on the top rows
hide behind the row of days and dates. Fix the stacking so a tooltip is
never clipped or covered: render it above the header (portal, or a z-index
audit against the header's stacking context), and flip placement downward
for the first rows if that is what keeps it fully visible at every viewport
the e2e set validates. Gates: a tooltip opened on each of the first two
rows is fully visible in e2e; no other tooltip placement regresses.

### DL-15 — The meetings room reads smaller and drops the label

In `site/src/components/office/section-meetings.tsx`: the channel labels
get a smaller font size; the `Jump to date ▾` control (`:284`) and the
`Show the delivered article (.json)` control (`:409`) get much smaller
type. These controls and the admin `Sign out` button
(`site/src/components/admin/admin-shell.tsx:145-148`) read as one oversized
family — find the shared style source; if they are parallel copies, unify
them into one small button style applied everywhere it appears, so the fix
lands once and re-renders every instance, admin included. Remove the
`{channels.length} channels · read-only record` line (`:210`) entirely.
Gates: no overflow at 360/768/1280; the admin Sign out shrinks via the same
change; the removed line appears nowhere in the build.

### DL-16 — Rooms open as a dialog, not a zoom; the dock speaks plainly

In the facilities plan (`site/src/components/office/section-workflows.tsx`,
`workflows-plan.tsx`, `panel-zoom.ts`): centre the floor plan in its
section, and remove the click-to-reframe zoom entirely (the reframing
around `section-workflows.tsx:285-296` and the animation module driving
it). A room click opens a **modal dialog** instead: the room's own
floorplan fragment, its assigned agents, the room's purpose in one or two
plain sentences, and the latest output it produced — laid out to fit
without scrolling at 1280×800 and up (below that the dialog may scroll;
the page behind it never does). Dialog basics are non-negotiable: focus
trap, Escape closes, focus returns to the room, `aria-labelledby`,
backdrop click closes, reduced-motion respected. The loading dock's
current copy (the `connects` prose in `site/src/lib/office-workflows.ts`)
is incomprehensible to the owner; rewrite the dock dialog to plain facts —
what the dock stands for, what actually flows through it (deliveries to
the two magazines), and the latest delivery. If `panel-zoom.ts` loses its
last consumer, delete it. Gates: e2e opens and closes a room and the dock
by mouse and by keyboard; no zoom animation remains; the containment guard
still passes.

### DL-17 — The roster lists every agent

The team section (`site/src/components/office/section-team.tsx`, fed by
`site/src/lib/office-walkthrough.ts:382-383, 648-665`) curates the roster
down to the council plus eight working specialists and hides the rest
behind a "stood down" count, with no way to see or scroll to the others.
Replace the cut with the full roster: every agent in `config/agents.json` —
council, specialists, venture agents — each with name, role line and
status (active / paused / retired), council first, in a layout that
handles the full count without clipping (grid, or an accessible scroll
region marked `data-horizontal-scroll`). No agent invented, none hidden;
paused and retired are labelled as such — that is the honest version of
the old footnote. Gates: a test asserts the rendered roster count equals
the agents file's entry count (never checked by eye); 360px reflow holds.

### DL-18 — Footer links open simplified content in dialogs

Both footers — the site footer (`site/src/components/site-footer.tsx:5-12`)
and the office walkthrough's own link row
(`site/src/components/office/office-walkthrough.tsx:84-89`: Rules →
`/company#rules`, Updates → `/log`, …) — send readers to old-design pages
(`/company`, `/money`, `/about`, `/privacy`, `/disclosure`, `/log`). Keep
every link, but open the content as **dialogs on the current page**, each
rewritten down to the few facts a reader actually needs: Rules — the
standing constraints in plain sentences; Money — the cap and the current
month, linking the full ledger; Privacy and Disclosure — the honest short
version (simplify wording, never weaken the substance of a disclosure);
Updates — the recent changes. Feed links (`/feed.xml`, `/decisions.xml`,
`/feed.json`) are files, not pages — they stay direct links. The old
routes keep resolving (deep links and the sitemap still work; the dialog
is how the footer opens the content, not a deletion of it). Same dialog
accessibility bar as DL-16, and `stop-slop` over every rewritten line.
Gates: every footer link opens its dialog or serves its feed; the old
routes still return 200; one full keyboard pass over a dialog in e2e.

### DL-19 — Navigation hover stops reserving space for an invisible dot

The walkthrough's section navigation
(`site/src/components/office/office-walkthrough.tsx:350, 384-434` — the
`data-dots` rail and its labels) reserves layout space on hover for a dot
that is not visible, so links shift or show an empty gap. Remove the
reserved space: the indicator must never change any label's box — overlay
it, use a transform, or draw it inside a fixed slot that is always
painted. While there, tighten the top navigation's hover treatment
(`site/src/components/site-header.tsx:52`) so hover reads as a deliberate
colour shift with zero layout movement. Gates: e2e asserts stable bounding
boxes for every nav item across hover; reduced-motion respected.

### DL-20 — Gates, self-review, merge, retirement

- Full: `pnpm test` (root — studio, orchestrator, site suites),
  `pnpm -C site typecheck`, `pnpm -C site build`, the e2e suite, and one
  `pnpm cycle -- --phase morning --dry` to prove the delivery path still
  composes summaries/recipes without a live call.
- Verify the two named coverage gaps are closed (families differ in bytes;
  variants differ in bytes) and the cross-machine hash test passed on CI,
  not only locally.
- Self-review the whole branch diff before merging — a release-auditor pass
  over correctness, guard integrity, dialog accessibility, responsive
  reflow, and the honesty of every rewritten line of copy. Findings are
  work, not notes: fix them and re-run the affected gates.
- Confirm all twenty issues are closed with their completing commits named
  and the decision file shows all twenty boxes ticked.
- Merge `claude/design-lab-editor` to `main`, push, delete the branch (local
  and remote). In the merge-adjacent final commit, retire this contract:
  delete `docs/DESIGN-LAB-OPUS-BUILD-PROMPT.md` (executed contracts do not
  linger; the decision file stays as the record), and leave the decision file
  fully ticked.

## Traps (each of these has already bitten this repo once)

- `pnpm cycle`, `pnpm delivery` and every `tsx` entry point read
  `studio/dist`, not `studio/src`. Rebuild the studio or you will test last
  hour's engine.
- librsvg silently draws **nothing** for WebP data URIs (`toRenderablePng`
  exists for this) and, equally silently, substitutes missing fonts. Never
  trust a render by eye; trust the pinned hashes and glyph-pixel checks.
- The e2e overflow guard treats any unmarked horizontal scroller as a bug —
  `data-horizontal-scroll` on every new filmstrip/rail.
- The active chip colour rule: brand text on a brand tint measures 1.00:1.
  Active chips are brand border + tint + **white** text
  (`admin/page.tsx:362-372` records the incident).
- A staged-nothing live cycle fails in CI (`cycle.yml:748-754`); dry runs
  locally.
- The cycle commit allowlist (`cycle.yml:725-737`) silently discards writes
  outside it — your new state paths (`state/ventures/carousel-studio/*`,
  `state/social/*`) are inside it; keep them there rather than inventing new
  roots.
- `next.config.ts` `outputFileTracingIncludes` is why the admin can read
  `state/` on Vercel; new server reads from new state directories may need a
  glob added there or they will 404 only in production.
- Duplicate React keys were part of bug #2 — key lists by full identity.
- Do not imitate PEOPLE's `org_change` runtime exception with direct
  prompt/config edits; the model-config token-cap raise in DL-08 is a
  declared part of this countersigned program, which is the sanctioned route.

## The decision file

The countersigned decision for this program is
`state/decisions/2026-08-08-design-lab-editor.md` (id
`design-lab-2026-08-08`), already committed on main. It carries the twenty
task checkboxes you tick as you go. Where this contract and the decision
disagree, the decision wins.
