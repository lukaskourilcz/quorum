# Prompt for Opus: build the Workflows section

You are adding one section to the BoardlessAI home page: a top-down floor plan of
the office that shows how work moves through the company. You build it in one pass.
Claude Design has already run and written the visual specification to
`docs/WORKFLOWS-MAP-DESIGN-SPEC.md`; you implement that spec. You make no visual
decisions and the spec makes no code decisions.

Precedence, highest first: the "Decisions already made" list below, then the seven
load-bearing invariants, then the design spec, then this prompt's fallbacks. If the
spec contradicts a decision or an invariant, follow the decision or invariant,
build on, and name the conflict in your final report. Do not improvise a third
option.

Read before writing any code:

1. `site/AGENTS.md`, and then the relevant guides in `site/node_modules/next/dist/docs/`.
   This Next.js version differs from your training data.
2. `site/src/components/office/office-walkthrough.tsx` and
   `site/src/lib/office-walkthrough.ts`, in full. The first is the client shell you
   are extending; the second is the server resolver and the sanitising boundary.
3. `site/src/components/office/office-plate.tsx`, `section-results.tsx` and
   `wheel-gesture.ts`. Results is the pattern for a section that animates on
   arrival and holds still on request. The wheel module is tested and finished;
   you do not touch it.
4. `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`, in full.
5. `docs/WORKFLOWS-FABLE-BRIEF.md` Parts 8, 13 and 13A, for what each element of
   the section means.

## Decisions already made

These bind you and bound Claude Design equally. The design prompt carried the same
list.

1. **One section.** Id `workflows`, inserted after `projects`, NAV label
   "Workflows". Depth comes from interaction inside the section. The courier runs
   as a panel, never as a second locked screen.
2. **The map is a top-down floor plan**, owner's direction: one office floor from
   above, rooms for the eight `OfficeProjectKey` entries, corridors, a loading
   dock, labelled exits to the published sites off-plan.
3. **The plate is `office-whiteboard`.** Filter and width come verbatim from the
   design spec's Plate section. If the spec is missing or silent there, use
   `saturate(.4) brightness(.34)` and `max(132vw, 232svh)`.
4. **Three depths.** Depth 1: the plan at rest, lit by the current Prague hour.
   Depth 2: a replay of one day, 05:00 to 22:00, started only by an explicit
   control, never on arrival. Depth 3: four openable places, each one panel
   expanding in place: the DNESKAi office, the workshop, the courier run, the two
   odd edges.
5. **Now and replay use different visual languages.** Rest is ambient; replay is
   an instrument with visible chrome, a timestamp and a "Now" return. The spec
   draws both.
6. **A quiet close leaves a note on the door.** Rooms whose session decided
   nothing hang a distinct calm mark; rooms that sent something hang another. A
   missed slot hangs nothing and states its recorded reason on hover. The spec
   draws the marks; you derive which mark each room shows from real slot
   statuses, per the data contract below.
7. **Room grammar is shared; furniture differentiates.** Carousel Studio is a
   machine room with an always-on low light. The board is the corner room.
   FightAIQ's corridor leads into the MMA Files room, never to the dock.
8. **The two odd edges are architecture**: a two-way corridor to the quiz apps,
   a pickup window for the storefront.
9. **Colours come from `PROJECT_COLOR`** re-exported in
   `site/src/lib/office-walkthrough.ts`. No new hues.
10. **Below 1024px**: static plan scaled to viewport width, four panels stacked
    beneath as plain expandable blocks, no horizontal page scroll.
11. **Reduced motion leaves the section complete**: end states drawn, replay
    becomes a stepped hour strip, the courier storyboard becomes a numbered
    static strip.
12. **No motion library.** CSS transitions, CSS keyframes and
    requestAnimationFrame only.

## The tuple, and every index it shifts

This is the highest regression risk in the change. In
`site/src/components/office/office-walkthrough.tsx`:

- `SECTIONS` becomes
  `["intro", "calendar", "meetings", "projects", "workflows", "team", "results", "company"]`.
- `NAV` gains `{ index: 4, label: "Workflows" }` after Projects, and the entries
  behind it shift: Team 4 to 5, Results 5 to 6, Company 6 to 7.
- The scroll handler sets seen flags by hardcoded index:
  `if (index >= 2) setMeetingsSeen(true)` stays, `if (index >= 5) setResultsSeen(true)`
  becomes `index >= 6`. Add `workflowsSeen` at `index >= 4`, following the same
  pattern, and pass it to the section as its `active` prop.
- `openFromCalendar` calls `goTo(2)`; meetings sits before the insertion point, so
  it stays 2. Verify rather than assume.
- The End key uses `goTo(SECTIONS.length - 1)` and the dot rail maps over
  `SECTIONS`; both self-correct, but check them, and search the whole file for
  numeric section indices before you finish. Also search `site/src` and
  `site/tests` for anything else that counts home-page sections or `data-sec`
  nodes; the containment and walkthrough checks read the live DOM and must pass
  with eight.

The new section's markup follows its siblings exactly: a
`<section data-sec id="workflows">` with the responsive height classes the
calendar section uses, an `OfficePlate`, an `OfficeMood`, and one content
component inside a `data-fg` wrapper. Look at how section 05 layers plate,
content and mood before you write yours, including the comment explaining the
tint's position.

## Files you create

- `site/src/lib/office-workflows.ts`, server-only, exporting
  `resolveOfficeWorkflows(now?: Date): Promise<OfficeWorkflows>` and its types.
  `readOfficeWalkthrough` in `office-walkthrough.ts` calls it inside the existing
  `Promise.all` and merges the result as a `workflows` field on
  `OfficeWalkthroughData`. Reuse the records the walkthrough already loads where
  the data overlaps (the calendar feed inputs are already in scope there; pass
  them in rather than re-reading them).
- `site/src/components/office/section-workflows.tsx`, client, exporting
  `SectionWorkflows({ data, active, reduceMotion })`. Split sub-components into
  sibling files under `office/` if the file passes about 400 lines; the panels
  and the plan are natural seams.
- `site/src/lib/office-workflows.test.ts` and any colocated component test files,
  vitest, matching the style of `calendar-feed-model.test.ts`.

You touch nothing under `orchestrator/`, `studio/` or `state/`, add no
dependencies, and change no other section beyond the index shifts above.

## The data contract

The server/client boundary is the sanitising boundary. Follow
`office-walkthrough.ts` exactly: resolve on the server, cross once as plain JSON.
Nothing that crosses may carry a filesystem or repository path, a raw package
hash, or a number the state files do not contain. Two sanctioned exceptions: the
courier receipt may show the package hash in the exact form the delivery commit
subject uses, `[package:<first 12 hex>]`, and the worked example carries its
public `articleUrl`. A figure that cannot be resolved is `null`, and the section
prints an explicit unavailable state, never a zero and never an invented value.

Every number and status on screen, and where it comes from:

| On screen | Source |
| --- | --- |
| The 13 slots (kind, hour) | `getPublicCalendarSchedule()` from `site/src/lib/venture-registry.ts` |
| Room for each slot | `projectForKind()` from `office-walkthrough.ts`; write no second mapping |
| Room colour | `PROJECT_COLOR` |
| Slot label | `publicKindLabel()` from `site/src/lib/slot-labels.ts` |
| Today's per-slot status and door notes | `buildPublicCalendarFeed()` for the current week, today's column; status plus `readableSlotReason()` for the hover sentence |
| Door-note kind | Derived in the resolver from status: `held` with a recorded delivery that day is "sent"; `held` otherwise and `not-needed` and `skipped` are "quiet close"; `missed` is no note plus the reason; `scheduled` and `late` are upcoming states, per the spec |
| Current lit room | Prague hour on the client, from the same `Intl` pattern the header clock uses, matched against slot hours |
| Worked example: date, headline, slug, `articleUrl`, tags | `deliveredEditionPackage()` from `site/src/lib/delivered-packages.ts`, for the newest date under `state/edition/deliveries/` whose receipt is `delivered` with an edition (not `no_edition`); resolve the date list in the resolver with the same `stateRoot()` read pattern that file uses |
| Worked example summary (kicker, headline, standfirst, passage count, first passage, source count, hero credit) | `readStudioArticles()` from `site/src/lib/carousel-summaries.ts`, matched by venture and date; recorded summaries already win over derived ones inside that function |
| Courier receipt fields (status word, `[package:hash12]`, delivered date) | The same delivery receipt, truncated in the resolver |
| Edition gate figures (10 sources, 10 candidates, 50 curation candidates, score 35, 2 attempts, 1,100 words) | Import `config/edition-quality.json` directly, the way `office-walkthrough.ts` imports `config/ventures.json` |
| The $0.50 edition allowance on the desk's cost bar | Add `CURRENT_EDITION_PRODUCTION_CAP_USD = 0.5` to `site/src/data/operating-policy.ts` beside the existing two limits, with a comment citing decision `budget-2026-08e` |
| The 80-candidate digest cap | A mechanism constant in orchestrator code, not in config; it appears in panel copy only, never as a live figure |
| Hook rack counts (49 hooks, 9 Tier B, news and MMA libraries absent) | Read `studio/hooks/quiz.hooks.json` and `quiz.tier-b.json` lengths in the resolver; the absence of `news.hooks.json` and `mma.hooks.json` is itself the datum for the no-hook state |
| Question bank figure (3,633 questions, import date) | `state/marketingshark/question-banks/devshark.json` envelope, read with a null fallback |
| The $30 and $25 limits, if the spec places them | `site/src/data/operating-policy.ts` |

Do not show: engagement or visitor metrics of any kind, live social posts (the
queue exists and nothing has posted; if the spec shows social at all it shows a
held queue), money movement on $0 paths (summaries, hook assignment, question
selection, rendering, gates and verification are all free), or any figure without
a row in this table.

## Load-bearing invariants, verbatim

Each was a real bug on this page. None is obvious from reading the code.

1. **Centre an oversized backdrop plate with `left/top: 50%` plus
   `translate(-50%, -50%)`, never with grid centring.** An oversized grid item is
   start-aligned in Chrome, so `place-items: center` put the left edge of a
   2.4×-viewport image at the left edge of the screen and the room was never in frame.
2. **Give every decorative layer `pointer-events: none`.** In section 05 the mood
   tint sits *after* the content in DOM order — that is what dims the room around the lit
   screen — and without the rule it swallowed every click on the wallboard.
3. **Keep the plates off `will-change: transform`.** Seven plates at 2,000–2,700 CSS
   pixels wide, permanently promoted, exhausted the GPU layer budget; Chrome answered by
   painting whole frames black while the DOM underneath was perfectly correct.
4. **Mark real horizontal scrollers `data-horizontal-scroll`** or the containment e2e
   guard reads them as page overflow.
5. **Wheel-driven section jumping binds only above 1024px.** Below that the page is an
   ordinary document — auto-height sections, no snap, nothing intercepted.
6. **Honour `prefers-reduced-motion`.** The home page already branches on it; the map
   must be fully legible and complete with every animation off.
7. **Plates are AVIF with a WebP fallback and no `next/image`.** They are 3–40 KB at
   native size, so a resize pipeline adds a request and a transformation to save nothing.
   Only the first plate is eager.

Rule 2 applies to every layer you add over the plan: glows, tints, the replay
scrim. Rule 4 applies to the replay's hour strip if it scrolls. Rule 3 applies to
the plan SVG as much as to plates; animate transforms without permanent promotion.

## Behaviour requirements

- The plan is one inline SVG plus HTML overlays. Every openable place is a real
  `<button>` (or an element with equivalent semantics) reachable in document
  order, with the spec's focus treatment. Opening a panel moves focus to the
  panel's heading; Escape and a visible close control dismiss it and return focus
  to the opener. The wheel handler must keep working while a panel is open;
  if a panel scrolls internally above 1024px, exempt it the way `workspaceRef`
  exempts the meetings window, and note that a taller-than-viewport section
  already hands wheel steps over correctly (see the inner-scroll branch of the
  wheel handler).
- Entrance animation runs once when `active` first becomes true, gated on
  `reduceMotion`, following the `SectionResults` pattern. The replay never starts
  itself.
- The replay is client-side stepping over the resolved slot table; it invents no
  data. With reduced motion the same table renders as the stepped hour strip.
- Panel content, including the courier storyboard, renders complete without
  JavaScript animation having run: server-render the true end state, then let
  animation replay it, the way the wallboard's figures server-render their true
  values before the count-up.
- Below 1024px nothing is intercepted and every panel is an ordinary expandable
  block. Test with a phone-width viewport, not only with devtools emulation of
  width.

## Checks before you report done

Run and pass:

1. `pnpm -C site typecheck`
2. `pnpm -C site build` (the dev server needs `next dev --webpack`; Turbopack
   breaks the studio's `.js` to `.ts` alias)
3. `pnpm -C site test`, including your new resolver and logic tests
4. The containment e2e guard (`site/tests/e2e/`), with any new horizontal
   scroller marked

Then verify by hand, in a browser:

5. No page horizontal overflow at 360, 430, 768, 1024, 1280 and 1600px.
6. The walkthrough wheel-locks correctly through all eight sections; every NAV
   button lands on its own section; the dot rail matches; End lands on company;
   the calendar's "open meeting" jump still lands on meetings.
7. Reduced motion on: the section is complete and legible, the replay is the
   stepped strip, the courier is the numbered strip, nothing is invisible.
8. Keyboard only: every openable place reachable and operable, focus visible,
   Escape closes panels, arrow-key section walking still works.
9. Every figure on screen traces to a row in the data contract table, or renders
   the explicit unavailable state. Delete `state/marketingshark/question-banks/`
   locally and confirm the section renders its unavailable state rather than
   crashing or showing zero.

Your final report states: which checks ran and their results, any conflicts
between the design spec and the decisions or invariants (with what you followed),
and any row of the data contract that resolved to `null` on current state, so the
owner knows what the section shows today rather than in theory.

## Test additions

Write vitest coverage for the pure logic you add, colocated like the existing
lib tests:

- Door-note derivation: each `CalendarStatus` maps to the right note kind, and
  `held` with versus without a delivery differ.
- Current-lit-room resolution from an hour, including the Monday gate on
  GoVIRAL's 13:00 and the always-on workshop.
- Resolver sanitisation: serialize a resolved `OfficeWorkflows` and assert it
  contains no `state/` or absolute filesystem path and no 64-character hex
  string; the only hash-like value allowed is the 12-character receipt form.
- Null tolerance: with the state root pointed at an empty directory, every
  field resolves to `null` or an empty list and nothing throws.

The existing tests must keep passing untouched, `wheel-gesture.test.ts`
included. If a walkthrough test asserts a section count or NAV shape, update it
to eight sections as part of this change and say so in the report.
