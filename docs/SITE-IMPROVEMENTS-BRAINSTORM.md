# Site improvements brainstorm — the Workflows animation, Python, and the TypeScript headroom

Written 2026-08-08 against `main`, at the owner's request, as a review rather
than a build: no product code changes ride with this document. It answers three
questions. Could Python make the scrapers or anything else stronger. How should
the Workflows section show what actually happens. And what else does an
all-TypeScript codebase leave on the table. Where this review measures, it
names the file and line; where it estimates, it says so. The owner has since
read it and decided; §2 and §5 record the decisions, and
`docs/SITE-IMPROVEMENTS-OPUS-BUILD-PROMPT.md` carries the build.

One standing constraint frames all three answers. The efficiency review
(`docs/WORKFLOWS-EFFICIENCY-REVIEW.md`) established that complexity, not cash,
is the currency this system overspends: runners are free on a public
repository, the ledger moves about fifty cents a day, and the maintenance
surface is already 1,900-line files. Every proposal below is priced in that
currency first.

## 1. How the site stands today

The home page is one server resolver and one client tree.
`site/src/lib/office-walkthrough.ts` reads committed state on the server,
sanitises it, and hands plain JSON to `OfficeWalkthrough`
(`site/src/components/office/office-walkthrough.tsx`), which renders eight
full-viewport sections under a wheel lock. The stack is Next 16.3.0 on webpack
(Turbopack cannot resolve the studio's `.js`→`.ts` source imports), React
19.2.8, Tailwind 4, and no animation, motion, or 3D library anywhere: every
animation on the site is a hand-written CSS keyframe, and the one canvas on the
property is the 2D agent signal field (`site/src/components/agent-signal-field.tsx`).

Discipline worth preserving while changing anything:

- The six backdrop plates are 3–40 KB AVIF files with WebP fallbacks, no
  `next/image`, one eager load. Asset weight is a solved problem here.
- `office-plate.tsx` documents two hard-won compositor rules: no `will-change`
  (seven promoted plates once exhausted the GPU layer budget and Chrome painted
  frames black), and `pointer-events: none` on every decorative layer.
- The release gate runs axe and measured contrast in Playwright
  (`site/tests/e2e/`), and the Workflows design spec carries a 28-row
  reduced-motion table where every animation has a resting end state.
- The whole page revalidates every 900 s; nothing on it fetches at request
  time from outside the repository.

The development story is unusual and it shows in the output: a design pass
wrote `docs/WORKFLOWS-MAP-DESIGN-SPEC.md` down to coordinates and contrast
ratios, a separate build pass transcribed it, and the owner amended both in
writing. That workflow is an asset, and the animation work below is specified
the same way.

## 2. The Workflows section: the plan reads, the day does not move

What the replay draws today (`section-workflows.tsx`,
`workflows-plan.tsx`): one room fill crossfades per hour (700 ms per hour,
11.9 s per day), a door note pops when a slot closes, and the workshop floor
brightens on an hour where a slot's note is `sent`. Every keyframe is an
entrance or a fade (`globals.css` lines 300–420). Nothing crosses the plan.

That is the gap the owner is pointing at. The section's stated question is
"where does a decision go when it leaves a room," and the geometry answers it
while the animation does not: on a `sent` hour the room lights, a tag appears,
and the workshop glows, but no work ever walks the corridor, reaches the
bench, or leaves through the east wall. The drawing holds the argument; the
replay repeats the drawing instead of performing it. The record already
contains everything a real performance needs: each slot's note kind, the
delivery receipt with its package hash, and the worked example threading a
published edition through three panels.

### The decided direction

Decided by the owner on 2026-08-08, after reading this review. The build
requirements, choreography and acceptance gates live in
`docs/SITE-IMPROVEMENTS-OPUS-BUILD-PROMPT.md`; the decisions, in short:

- **The replay becomes a performance of the whole standing day.** One press of
  *Play the day* plays every scheduled sitting from the first meeting to the
  last — the same complete story on every visit, with the registry's own hours
  and titles. Pressing the same button again stops it. The bottom control
  strip — transport, step buttons, rail, playhead, stamp, `NOW` — goes
  entirely; the toggle is the only control, and the day dissolves back to
  ambient by itself when the story ends. Opening any room mid-performance
  stops and resets it the same way — rooms now open as full-section views in
  place of the plan, and a reader coming back must land on the default
  drawing, never a half-run day.
- **The active room says what is happening.** During its beat a room shows a
  drawn tag — `06:00 · Morning board`, the calendar's own hour and title — and
  its floor steps visibly brighter than the lit fill, so a viewer sees where
  the day is. Today's real door notes still hang as each hour closes; the
  performance shows the schedule, the notes keep showing the record.
- **Outputs travel as envelopes, in their venture's hue — and articles travel
  twice.** Every output walks every leg of its journey as an envelope filled
  with the producing venture's colour. Article rooms send two: one through
  the dashed chase and the Design Lab to the bench, out the east wall to its
  magazine address — and one rendered into social content, passed on to
  GoVIRAL, and launched toward the social platforms, which do not exist yet
  and are drawn as designed. marketingShark's two daily text envelopes ride
  the same pipeline; FightAIQ's records pass through the shared wall to the
  desk they serve; Titty Tuesdays' envelope rests at the bay that faces no
  exit; and GoVIRAL grows from its 170-unit sliver into a station with
  subrooms — arrival, preparation, launch. All of it in CSS on the existing
  SVG — zero dependencies, no `will-change`, transforms and opacity only,
  honouring the compositor rules documented in `office-plate.tsx`.
- **Carousel Studio becomes the Design Lab.** The reader-facing name changes
  everywhere a reader sees it — internal identifiers stay put, on the
  Caught Up → DNESKAi precedent — and the lab gains a 9:16 Instagram-story
  format beside its carousels and posts, which is what makes the new name
  true.
- **The whiteboard frames the plan.** The section's backdrop photograph shows
  a large whiteboard whose top edge never makes the frame at the current plate
  size (`max(150vw, 264svh)` against a 1376 × 768 image); the plate is
  reframed so the whiteboard's top and bottom edges are both visible and the
  plan board sits on the whiteboard's face, without a photograph edge entering
  the frame at any viewport.

Reduced motion renders the same story as opacity-only steps — nothing
translates — and ambient stays exactly as built: the performance never starts
itself, and only the reader's press sets the day in motion. The build runs as
thirteen GitHub issues, `SI-01` through `SI-13` (#41–#53), worked strictly in
order on one branch — each closing with its gates green and a named commit,
and a single merge to `main` inside the last of them, which also sweeps the
repository's markdown down to living documents, unifies the owner's runbooks
into `docs/NEEDED.md`, and prunes the branches with no remaining value; the
design-spec amendment is the second of them, ahead of every component change.

## 3. Python: not for the scrapers, yes for a lab

The premise to correct first: the scrapers would not get faster in Python.
Every ingestion path is I/O-bound and already runs through one hardened
chokepoint, `safeFetch` (`orchestrator/src/security/url.ts:116`): HTTPS-only,
DNS re-checked against private ranges on every redirect hop, a 50-host
allowlist (`config/network-allowlist.json`), size caps checked declared and
decompressed, and per-provider quota guards that refuse before the first
request (Odds API header credits, Cito call reservations, Apify's $5 monthly
credit with step-dropping). The 32-source editorial fleet
(`orchestrator/src/sources/`) runs eight adapter kinds on `rss-parser` and
`cheerio` with a Firecrawl-then-Jina readable fallback, and its fragility
notes record real regressions already survived. Rewriting any of this in
Python buys no capability, forfeits the guard integration, and spends the
scarce currency twice: a second toolchain in CI and a second place to audit.
The one scraping-adjacent gap found during this review is a TypeScript bug,
not a language gap: `collectFreeTrendingSignals` (HN Algolia, Google
Trends/News, Reddit rank) sits after the Apify verdict gate at
`orchestrator/src/portfolio/evidence.ts:595`, so the four keyless sources its
own docstring promises "run whether or not `APIFY_TOKEN` exists" have never
run. Fixing the ordering is a normal session task.

Where Python genuinely earns a place is offline, beside the runtime rather
than inside it. Three candidates, in descending value:

1. **A FightAIQ calibration lab.** The runtime engine
   (`orchestrator/src/fightaiq/engine.ts`) is a real Glicko-2 implementation
   with de-vigged market blending, bounded feature shifts, and Brier/log-loss
   scoring, all config-driven from `config/mma-model.json` and reproducible by
   content hash. What TypeScript lacks is the research ecosystem around such
   an engine: pandas/scikit-learn backtesting sweeps over τ, the market blend
   weight, and the feature caps; reliability diagrams; isotonic recalibration
   once enough predictions reconcile. Today the evaluation file holds six
   scored predictions, so the lab starts small; it becomes the tool that turns
   accumulated `state/mma/model-runs/` into evidence-backed proposals to
   change `mma-model.json`. The engine never moves. The lab reads committed
   JSON and emits a report a reviewer can open.
2. **`mwparserfromhell`, if the wikitext surface grows.** The 561-line
   hand-written wikitext parser (`fightaiq/wikipedia-events.ts`) exists
   because naive splitting broke on piped wikilinks, and it is battle-hardened
   for its narrow scope. It is also the single most fragile parsing in the
   repository by its own comments. If FightAIQ ever reads more promotions or
   more template shapes, the standard Python wikitext parser replaces a class
   of positional-parsing bugs; until then, the working parser stays.
3. **`trafilatura` for picked-article bodies.** The edition pipeline fetches
   full text for only the 3–8 chosen items through external services
   (Firecrawl with a paid key, else the keyless Jina reader at ~20 req/min).
   A local trafilatura step removes the external dependency and its rate
   ceiling at $0. The TypeScript alternative (`@extractus/article-extractor`)
   exists if staying single-language outweighs extraction quality.

If any of these land, the boundary rules are fixed in advance: Python lives in
its own directory with a `uv` lockfile, runs as its own Actions step on the
free public-repo runners, reads state read-only, exchanges data as JSON
validated against `contracts/*.schema.json` (already exported from zod by
`pnpm contracts:export`, so the schemas are language-neutral today), and
writes nothing except its own report files. Deliveries, budgets, and appends
keep their single TypeScript write path. A Python step that wants a secret or
a write is out of scope by construction.

## 4. TypeScript headroom

The question "the app is TypeScript, could we do more" has a short answer: the
ceiling is high and mostly unclaimed, and none of it requires a new language.

| Opportunity | What it buys | Cost |
| --- | --- | --- |
| Code-split the walkthrough | `workflows-panels.tsx` (33 KB source), the decision replay, and the week board ship in the home bundle today; there is no `next/dynamic` anywhere in the site. Splitting interaction-gated UI cuts initial JS for every visitor who never opens a panel. | One session |
| React Compiler | The walkthrough re-renders on clock and scroll state; Next 16 can enable the compiler and remove the hand-tuned memo pressure. | Config + verify |
| Precompile the studio | `studio/` already has `tsconfig.build.json` and a build script. Consuming compiled output instead of TS source removes the webpack pin and unlocks Turbopack dev/build, the largest DX win available. Verify the extension-alias story first. | One session + verify |
| View Transitions API | Native, progressive polish for section jumps and panel opens; no dependency. | Small |
| Streaming / PPR evaluation | The page is whole-page ISR at 900 s; a streamed shell would cut cold-revalidate TTFB. Measure before adopting. | Evaluate |
| OG images via satori | Deterministic, brand-tokened social cards rendered in code, consistent with the "images created in code cost $0" doctrine, if the pages do not already carry them. | Small |
| Housekeeping found by this review | `undici` is a declared dependency imported nowhere; Cito's `/bouts` endpoint has returned zero rows on every run since it was added and still holds a reservation; `about-project.md` and the `page.tsx` header still say seven sections where the walkthrough renders eight. | Minutes each |

The measurement caveat: bundle and TTFB figures above are directional. The
next session on this topic should run `next build` and read the real
first-load numbers before and after splitting, in the efficiency review's
spirit of naming the constant it moves.

## 5. What was decided, in one place

The owner's decisions of 2026-08-08, recorded so this review closes as a
document rather than trailing off. The build session's instructions are
`docs/SITE-IMPROVEMENTS-OPUS-BUILD-PROMPT.md`.

1. **The Workflows section performs the day.** Whole-day playback behind one
   toggle, no control strip, a tag and a brighter floor at the active room, a
   room-press stopping and resetting the performance, venture-hued envelopes
   walking the two-envelope pipeline through the Design Lab and a grown
   GoVIRAL, and the whiteboard reframed behind the plan. The design spec is
   amended before any component changes, in the same design-pass/build-pass
   rhythm as the section itself, and the whole build runs as GitHub issues
   `SI-01`–`SI-13` (#41–#53).
2. **Python stays out of the runtime.** That is this review's standing
   recommendation; whether the offline calibration lab opens later, under the
   JSON contract boundary in §3, remains an open owner decision in
   `NEEDED.md`.
3. **The TypeScript wins proceed in §4 order** — code-split first, React
   Compiler, then the studio precompile — each measured, the studio task
   carrying an explicit revert-and-record escape hatch.
4. **The working-code findings ship regardless of the rest**: the
   free-trending gate ordering (`portfolio/evidence.ts:595`), the dead
   `undici` dependency, the Cito retirement check, the stale section and
   project counts, and the high-severity Dependabot alert on the default
   branch. The program closes with a full wiring review of the running app
   and a documentation sweep that deletes executed prompts, brings every
   surviving doc current, leaves one owner document — `docs/NEEDED.md` — and
   prunes the stale branches.
