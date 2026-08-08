# Site improvements brainstorm — the Workflows animation, Python, and the TypeScript headroom

Written 2026-08-08 against `main`, at the owner's request, as a review rather
than a build: no product code changes ride with this document. It answers three
questions. Could Python make the scrapers or anything else stronger. Could
Three.js make the Workflows section show what actually happens. And what else
does an all-TypeScript codebase leave on the table. Where this review measures,
it names the file and line; where it estimates, it says so.

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
writing. That workflow is an asset. A Three.js proposal that cannot be
specified the same way should not ship.

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

Three build options, in ascending cost.

### Option A — the work walks the building (recommended)

Keep the SVG. Add the missing choreography with CSS motion paths
(`offset-path` on SVG groups; no new dependency) driven by the same
`notes`/`slots` data the plan already receives:

- On a `sent` hour during the replay, a package glyph (the dock's sealed-box
  mark at tag scale) leaves the room's door gap, drops into the spine, and
  travels east along the corridor.
- The summary chase (the dashed line at y 484) marches its dashes while the
  packet is in transit, so the pipe reads as carrying rather than as plumbing.
- The packet risers into the workshop at x 1420, the workshop brightens as it
  already does, and a sealed box crosses the roller-door span onto the bench.
- From the bench it moves to a courier bay and exits through the east-wall
  opening along the existing courier arrow, fading at the magazine address.
- On Mondays, GoVIRAL's green signal line pulses toward the two magazine rooms
  at 13:00. On the six days it does not sit, the line stays still.

Two design questions to settle before building, with a lean on each:

1. **The journey outlives its hour.** At 700 ms per hour the walk from door to
   address cannot fit inside one tick. Let it span the following ticks: the
   05:00 edition really does deliver mid-morning, so a packet that is still in
   the corridor at 07:00 tells the truth. All packets rest at their addresses
   by 22:00, and the final frame still matches depth 1.
2. **Ambient stays still.** The plan at rest keeps today's behaviour (notes
   hung, bench holding the rule's one package). Motion belongs to the replay,
   which the reader starts. This respects the spec's "never starts itself"
   rule and keeps the honesty doctrine intact: only recorded events move, and
   nothing animates a cost.

Reduced motion already has its answer in the spec's table: render the end
state. The packets simply do not appear; the notes and bench do, as now.
Estimated size: one design-note amendment to the spec plus one build session;
zero dependencies; no new GPU layers (two small transformed glyphs, no
`will-change`, honouring the plate rule).

### Option B — the drafting-table tilt

A CSS `perspective` + `rotateX` on the board during replay would give the plan
depth for free. Priced honestly: at the spec's 0.67 px-per-unit scale the
in-plan type already sits at its 9.5 px floor, and foreshortening pushes the
far rank below it; the contrast ledger was measured flat; and the plan's
identity is a drafted artifact, which tilting reads against. Either keep the
tilt under ~8° as garnish on Option A, or skip it. Not worth building alone.

### Option C — the model office (Three.js)

The full version: extrude the same geometry into a dollhouse office. Walls
rise from the floor plan, each lit room casts its venture hue as an actual
light with falloff through the door gap, packages are boxes that travel the
corridor in three dimensions, the courier exit is a van leaving the dock
apron, and `PLAY THE DAY` becomes a camera move as much as a clock.

How it would have to be built here:

- **Stack:** `three` + `@react-three/fiber` + a small `@react-three/drei`
  subset. All TypeScript-native, which is the honest answer to "the app is
  TypeScript, could we do more": R3F is idiomatic React and shares the
  bundler, so the language boundary costs nothing. The bundle does: roughly
  +200 KB gzipped (estimate), loaded with `next/dynamic({ ssr: false })` only
  when the walkthrough reaches the section.
- **One geometry source.** The `ROOMS` array in `workflows-plan.tsx` is
  already data. The scene extrudes from those constants at build time, so the
  2D plan and the 3D model cannot disagree, and the SVG remains the rendering
  below 1024 px, under reduced motion, without WebGL, and for crawlers.
- **Interaction stays in the DOM.** The canvas is `aria-hidden` decoration;
  the four openable places, the replay strip, and every focus ring remain SVG
  and HTML overlays. The axe and contrast e2e gates then keep passing without
  exemptions, because no text and no control ever enters the canvas.
- **GPU discipline.** This page has already painted black frames once. The
  canvas mounts when the section becomes active and unmounts on exit, clamps
  device-pixel-ratio to ~1.5, runs `frameloop="demand"` at rest and continuous
  only while the replay plays, and the board drops its `backdrop-filter`
  while the canvas is live. Test on the 13-inch viewport the owner just had
  fixed.
- **The spec workflow needs a new ledger.** §12's colour ledger cannot carry
  into lit, tone-mapped 3D as measured pairs. A materials-and-lighting ledger
  (albedo, emissive, light intensity per venture hue, tone-mapping fixed)
  replaces it, or the design-pass/build-pass split breaks down.

Priced in complexity: Option C is the only proposal in this document that adds
a dependency family, a rendering paradigm, and a new spec vocabulary at once.
The recommendation is to ship A first. A's choreography (what moves, when,
along which path, and what the record permits) ports into C unchanged, so
nothing built for A is thrown away if the section later earns the model
office. C stands alone as a v2 with a real payoff; it is a poor v1.

Elsewhere on the site, 3D does not pull its weight: the agents' signal field
is already a working 2D canvas, the venture pages are content surfaces, and
the photographic plates are the intro's identity. One place, done well.

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

## 5. What this review recommends, in one place

1. Build **Option A**: the replay performs the delivery the record already
   contains. Amend the design spec first (journey-spans-hours, ambient stays
   still), in the same design-pass/build-pass rhythm as the section itself.
2. Hold **Three.js** as the v2 of the same section, geometry-derived from the
   same constants, behind the same data, with the SVG as the permanent
   fallback. Do not spread 3D anywhere else on the site.
3. Keep **Python out of the runtime**. Open it as an offline calibration lab
   for FightAIQ when reconciled predictions justify it, under the JSON
   contract boundary in §3.
4. Take the **TypeScript wins** in §4 order: code-split first, studio
   precompile second, both measured.
5. Fix the two working-code findings on their own merits regardless of the
   rest: the free-trending gate ordering (`portfolio/evidence.ts:595`) and the
   dead `undici` dependency.
