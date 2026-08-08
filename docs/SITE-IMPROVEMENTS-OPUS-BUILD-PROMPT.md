# Build prompt — the Workflows day performance, and the site review fixes

You are the build session for the 2026-08-08 site review. The review is
`docs/SITE-IMPROVEMENTS-BRAINSTORM.md`; the owner has read it and made every
decision it asked for. This document carries those decisions, the file map, and
the acceptance gates. Nothing in here is open for re-litigation — where a
judgement call remains, the paragraph says so and names the constraint the call
must respect.

Read in this order before writing any code:

1. `CLAUDE.md`, whole. Its golden rules bind this session.
2. The newest files in `state/decisions/` — confirm nothing there supersedes
   this prompt. If something does, stop and say so rather than building.
3. This document, end to end.
4. `docs/WORKFLOWS-MAP-DESIGN-SPEC.md` §§5–10 and §12–13 — the section you are
   changing was built spec-first and stays that way.
5. `site/AGENTS.md` — before any Next-specific work, read the relevant guide in
   `site/node_modules/next/dist/docs/`. The installed Next 16.3.0 differs from
   training data; trust the shipped docs, not memory.

## How to work

- **Branch:** work on `claude/website-improvements-brainstorm-sqe3c6`, the
  branch this document lives on. At session end, follow `CLAUDE.md`'s git
  workflow: push, merge to `main`, and leave no work stranded. (A session
  cannot delete a remote branch — the proxy answers 403 — so merging and
  leaving the branch for GitHub's auto-delete is the correct end state.)
- **`main` moves daily under this branch.** Before starting, `git fetch
  origin main && git merge origin/main`, run the gates once as a baseline,
  and re-check §1.1 against the tree. Line references here were true when
  this was written; where the tree has drifted, the tree wins.
- **Commit small and often.** One task, one commit, in the order this document
  gives. A commit body names what changed and what was measured or verified,
  in plain prose — apply the `stop-slop` skill to every body. Never batch a
  part into one commit. Never put a model name or model ID in a commit, code
  comment, or document.
- **Work to completion.** The session ends when every task in Parts One, Two
  and Three is implemented and its gates are green, or carries a written
  record in `NEEDED.md` of why it was reverted (only Part Three's last task
  has that escape hatch). Do not stop half-way and summarise; a summary is
  not a deliverable.
- **Cost:** nothing in this prompt calls a model at runtime or build time.
  The work sits outside the `budget-2026-08e` model share entirely.
- **Guards are load-bearing.** Do not weaken budget, patch, security,
  evidence, stage, finance, content-quality or release guards or their tests,
  ever, including "temporarily".

## The gates

Run after each part, and all of them before the final merge:

```
pnpm test                      # root: every workspace's unit tests
pnpm -C site typecheck
pnpm -C site lint
pnpm -C site build             # read the first-load JS table it prints
pnpm -C site test:e2e          # axe + measured contrast + operating surfaces
```

If the e2e browsers are unavailable in your environment, say so in the commit
body and in `NEEDED.md` — never report a gate you did not run as passed.

---

# Part One — the Workflows section performs the day

## 1.1 What exists

The home page is one server resolver and one client tree.
`site/src/lib/office-walkthrough.ts` resolves committed state on the server and
hands plain JSON across; that boundary also sanitises. The Workflows section is
the one with `id="facilities"`
(`site/src/components/office/office-walkthrough.tsx:600-643`):

- `site/src/components/office/section-workflows.tsx` — state, controls, room
  views, panels. It holds `replayHour`/`playing` state, advances one hour per
  700 ms tick (lines 131–144), and renders a full control strip below the plan
  (the block guarded by `(replaying || strip) && !room` at line 454):
  transport ❚❚/▶, step buttons, a scrubbable hour rail with playhead, a
  `REPLAY HH:00` stamp, and a `NOW` button — plus a stepped-strip variant for
  reduced motion and sub-1024 px. Since the *rooms open as rooms* change on
  `main`, pressing any room replaces the whole plan with `WorkflowsRoomView`
  (`site/src/components/office/workflows-room.tsx`): the room at full
  section size — who stands in it, when it sits, what it produces — with its
  depth-3 panel folded in where one exists (`hasPanel`; the `PanelPlace`s
  are caught-up, carousel-studio, dock, titty-tuesdays). The dock is not a
  room and keeps its overlay panel. Two facts matter for D9: today the
  replay state persists behind an open room (the strip merely hides), and
  the `Play the day` button renders whenever the replay is off — including
  while a room stands open.
- `site/src/components/office/workflows-plan.tsx` — the floor plan, one inline
  SVG in a 1760 × 940 viewBox with an 80-unit margin each side. Every room is
  pressable (`PlanPlace = OfficeProjectKey | "dock"`), and the plan is the
  section: no card, no panel zoom — it fills the box the section gives it
  (the `fill` prop). Geometry is transcribed from the design spec: `ROOMS`,
  the note anchors, the lit fills, the summary chase `M700 484 H1420`,
  GoVIRAL's green dashed line into the two magazine spine stubs, the
  roller-door ticks x 1345–1495 at y 446–462, the bench with its one package
  at 1084,590, three courier bays x 1420 w 132 at y 526/620/720, and two
  east-wall courier exits `M1560 660 H1656` and `M1560 760 H1656` with the
  DNESKAI and MMA FILES addresses at x 1666.
- `site/src/lib/office-workflows-model.ts` — the pure model: `WorkflowsSlot`
  (kind, hour, label, room, color, status, note, sits), `litRoomForHour`,
  `notesThroughHour`, `doorNoteKind`, `REPLAY_FIRST_HOUR = 5`,
  `REPLAY_LAST_HOUR = 22`. `slot.hour` and `slot.label` come from the venture
  registry through `publicKindLabel` — the same names and hours the calendar
  page prints. This file is the testable part; keep it that way.
- `site/src/app/globals.css` lines ~300–420 — every `wf-` keyframe.
- The section's backdrop is `<OfficePlate image="office-whiteboard"
  width="max(150vw, 264svh)">` — a photograph of an office wall with a large
  whiteboard — with the replay scrim layered above it
  (`office-walkthrough.tsx:605-622`). The calendar section reuses the same
  photograph at a different crop (`max(132vw, 232svh)`); D8 touches only the
  facilities section's plate.

## 1.2 The owner's decisions

These came from the owner in writing on 2026-08-08 and are the requirements.
Numbered so the spec amendment and the commits can cite them.

**D1 — one control, a toggle.** Pressing **Play the day** starts the
performance immediately. Pressing the same button again stops it and returns
the section to ambient. There is no other replay UI: the entire bottom control
strip — transport, step buttons, rail, playhead, timestamp stamp, `NOW`
button, and the stepped-strip variant — is removed, not hidden. The button
stays in the header row where it is, toggles its label (`Play the day` ↔
`Stop the day`), and carries `aria-pressed`.

**D2 — the whole day, every day.** The performance plays the standing day:
every slot in `data.slots`, in hour order, first meeting to last. It is not
keyed to today's outcomes, the wall clock, or any particular hour — the same
complete story plays on every visit. The scheduled hours and titles must be
exactly the registry's: `slot.hour` and `slot.label`, never invented or
reformatted times.

**D3 — a tag at the active room.** While a meeting's beat is live, its room
shows a tag reading `HH:00 · <label>` (for example `06:00 · Morning board`),
drawn in the plan near the room's name — text on the drawing, never a
`title` attribute, because nothing on the plan raises tooltips. The tag
appears with its beat and leaves when the beat ends.

**D4 — the active room is brighter.** During its beat, the room's floor
steps visibly brighter than the current lit fill so a viewer sees that
something is happening there *now*. The current `LIT_FILL` values are the
venture hue at 14% over the floor; start the in-session state near double
that and let the spec amendment pin the measured values. After its beat the
room falls back to the accumulated-day state, not to dark.

**D5 — the work travels.** The point of the change: the day must visibly
connect. Between and across beats, recorded kinds of work move along the
geometry that already exists (see 1.3). Nothing else on the plan gains
motion; the west question-bank corridor stays still forever, as documented in
the plan source.

**D6 — the day ends by itself.** After the last beat's travel rests, hold the
finished picture for about a second, then dissolve back to ambient. The
button reads `Play the day` again. No replay chrome remains on screen.

**D7 — ambient is untouched.** At rest the section behaves exactly as today:
Prague-hour halo, today's real notes hung, the bench holding the rule's one
package, the workshop never dark. The replay visual language also survives:
scrim on (`onReplayChange` keeps driving it), hard contour instead of halo,
mood off. The performance must never start itself — arrival, scroll and
hover are not triggers.

**D8 — the whiteboard frames the plan.** The backdrop photograph's whiteboard
must read as the surface the floor plan is drawn on. Today the plate is so
oversized (`max(150vw, 264svh)` against a 1376 × 768 image) that only the
whiteboard's sides are in frame. Reframe the plate for this section so the
whiteboard's top edge and bottom edge are both visible at common desktop
viewports, with the plan sitting on the whiteboard's face.

**D9 — opening a room stops the day.** Rooms open by replacing the plan, so a
performance left running behind a room view would still be walking, unseen,
when the reader came back. Pressing any room or the dock while the
performance runs stops and resets it completely — the same teardown as
pressing the toggle — so closing the room lands on the default ambient plan:
no motion in progress, no scrim, the button reading `Play the day`. While a
room view or the dock panel is open, the toggle is not offered; the
performance starts only from the full floor plan. (Today's code has the
opposite behaviour on both counts — the replay state persists behind an open
room and the button renders over it — so this is a change to make, not a
behaviour to preserve.)

## 1.3 The choreography

The performance is a sequence of **beats**, one per slot in `data.slots`, in
hour order. A beat: the room brightens (D4), the tag appears (D3), holds long
enough to read, then the room's door note for *today* hangs as the beat closes
— `notesThroughHour` semantics already give you exactly this — and the story
moves on. Travel legs launch as their beat closes and overlap the following
beats, the way the real day pipelines.

What travels, by the standing flow of each room. Verify the slot kinds against
the resolver and `config/ventures.json` rather than trusting this table
blindly, but the flows themselves are decided:

| Beat's room | What leaves, and where it goes |
| --- | --- |
| Board HQ (three sittings) | A summary square leaves the door gap, drops into the spine, and fades east along the corridor — the board commissions, it does not ship. |
| DNESKAi (edition, product) | A summary square exits the door, joins the chase at x 700, travels the dashed line to x 1420 while the chase dashes march, and enters the workshop. The workshop brightens and its disc goes to work. A sealed box (the bench's own glyph) then crosses the roller-door span onto the bench, moves to the lower-middle bay (y 620), and exits the east wall along the y 660 courier arrow, fading at the DNESKAI address. |
| MMA Files (editorial, both article desks) | Same chase-to-workshop-to-bench journey, exiting through the y 760 courier arrow and fading at the MMA FILES address (bay y 720). |
| FightAIQ (its slots) | A record glyph passes through the shared-wall door gap (the wall break at x 1090, y 240–300) into the MMA Files desk. It never touches the corridor — the room has no corridor door, and that asymmetry is the drawing's own argument. |
| marketingShark (07:00) | Summary square to the workshop via the chase. The drafted carousels stay on the workshop's shelves — drafts are not deliveries, so nothing crosses the dock. |
| GoVIRAL (13:00) | No package. Its green dashed line pulses toward the two magazine spine stubs — the signal travels, nothing is carried. |
| Titty Tuesdays | A box reaches the top bay (y 526) and rests there. That bay lines up with no exit; the drawing already says this edge is not a delivery, and the performance repeats the claim. |

Rules the choreography must keep:

- **Beat lighting is the schedule, not today.** During the performance every
  slot's room lights and tags for its beat, including GoVIRAL on the six days
  it does not sit — the performance shows how the day operates. Today's truth
  still shows through the notes: the note that hangs as each beat closes is
  today's real note (`quiet`, `sent`, `missed`, the empty clip), unchanged.
  Ambient keeps `litRoomForHour` and its gated-slot rule exactly as is.
- **The workshop brightens while occupied.** Derive its working state from
  travelers being inside it during the performance rather than from the
  current `note === "sent"` hour check; ambient keeps the existing behaviour.
- **Pacing.** Tag hold ≥ 1.2 s (aim 1.4–1.7 s per beat); travel legs roughly
  1.2–2.4 s each; the full performance lands between 30 and 45 seconds. The
  spec amendment pins the numbers.
- **Nothing animates a cost, and nothing invents a record.** Travelers are
  the drawing's own glyph vocabulary (summary square, sealed box, signal
  pulse, record slip) at tag scale. No currency, no counts, no fabricated
  hours.

## 1.4 Implementation constraints

- **State.** Replace the hour-tick clock in `section-workflows.tsx` with a
  beat timeline over `data.slots`. Keep the timeline logic pure and put it in
  `office-workflows-model.ts` (or a sibling pure module) with unit tests:
  given slots, return the beat sequence, each beat's travel legs, and total
  duration. The component consumes the sequence; timers and CSS do the rest.
- **Motion mechanics.** CSS keyframes on SVG groups — transforms and opacity
  only. The travel paths are orthogonal polylines, so chained translate
  keyframes between waypoints are enough; `offset-path` is acceptable if it
  stays dependency-free. No per-frame JS positioning loop, no SMIL, no new
  dependency, and absolutely no `will-change` — seven promoted plates once
  exhausted the GPU layer budget and Chrome painted whole frames black
  (`office-plate.tsx:43-48`). New keyframes join the `wf-` family in
  `globals.css`.
- **Every performance layer takes no clicks.** `pointer-events: none` on
  travelers, tags, brightness overlays — every pressable room, the dock and
  the header button must stay fully operable mid-performance. A press on a
  room mid-performance is D9's teardown-and-open, never a dead click.
- **Type floor.** Nothing drawn in the plan may render below 9.5 px. The
  plan now fills the section, so the rendered scale varies with the
  viewport: keep the tag's mono type at ≥ 19 plan units, like the room
  names, and verify the floor at the smallest wide-mode viewport (1024 px)
  rather than assuming a fixed board width. Tag colour pairs come from the
  spec's §12 ledger discipline: measure, then record.
- **Cleanup.** Stopping mid-performance (D1) tears everything down: travelers
  unmount, floors transition back, scrim fades, notes return to today's full
  set. Remounting or keying the performance layer is an acceptable reset
  mechanism. No traveler survives into ambient. Opening any room or the dock
  runs this exact teardown automatically (D9) — one code path for both
  exits, so the two can never drift apart.
- **Reduced motion.** Nothing translates. The button still works: beats
  advance as opacity-only steps — room brightens, tag appears, note hangs —
  at the same cadence, with no travelers and no marching dashes. The design
  spec's §10 table gets a row for every new element; every animation keeps a
  resting end state equal to its ambient value.
- **Below 1024 px.** The toggle stays. In-plan text there is numerals-only by
  design, so render the current beat's `HH:00 · label` as one HTML line
  directly under the plan instead of inside it. Travelers may run — the SVG
  scales — but the strip's old hour buttons are gone like the rest of the
  strip. Removing the strip also removes its `data-horizontal-scroll`
  scroller; confirm the containment e2e guard stays green.
- **What dies.** The rail, stamp, transport, step and `NOW` controls and
  their handlers (`togglePlay`, `step`, `seek`, `stopReplay` as a user-facing
  control), the `strip` variant, and any keyframe or style only they used.
  `REPLAY_FIRST_HOUR`/`REPLAY_LAST_HOUR` survive only if the timeline still
  needs them; delete what nothing reads.

## 1.5 The whiteboard reframe (D8)

The plate for section 04 is centred by `left/top: 50%` +
`translate(-50%, -50%)` — never grid centring — and the scroll parallax adds
`translate3d(±46px, 30px, 0) scale(1.07)` on wide viewports
(`office-walkthrough.tsx:209-214`). Coverage is the hard constraint: at every
viewport from 320 px phones to 2560 × 1440, including during the parallax
shift, no photograph edge or background band may enter the frame. That means
plate width ≥ ~100vw and plate height ≥ ~100svh with margin for the ±46/30 px
drift; the current `264svh` leaves roomy slack vertically, which is exactly
the crop the owner is pointing at.

Do this empirically, not by arithmetic alone: shrink the section's `width`
value (and add a `plateY` offset if the whiteboard sits off the photograph's
vertical centre) until the whiteboard's top and bottom edges are both in
frame at 1280 × 800, 1440 × 900 and 1920 × 1080, with the plan sitting
on the whiteboard's face; then screenshot 320 × 568, 768 × 1024 and
2560 × 1440 to prove coverage held. Playwright is already in the site's
toolchain — a throwaway script or the e2e runner's screenshot API both work;
attach nothing, just record the checked viewports in the commit body. If the
photograph itself does not contain the whiteboard's top edge, stop at the
best achievable framing and record that finding in `NEEDED.md` under the
existing *Real office photography* item — the plates are placeholder images
and regenerating one is an owner decision, not a build task.

## 1.6 Order of work

1. **Amend the design spec first** — `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`:
   rewrite §6 (the replay) around D1–D7, add the choreography table, the tag
   and brightness specs with measured contrast pairs in §12, new §9 motion
   rows, new §10 reduced-motion rows, and extend the §13 self-check. Cite the
   decision numbers. One commit, before any component changes — this section
   was built design-pass-then-build-pass, and stays that way.
2. Timeline model + unit tests (pure module).
3. Strip removal + button toggle (D1), with the reduced-motion and compact
   paths reworked.
4. Beats: lighting, brightness (D4), tags (D3).
5. Travel legs, flow by flow, with the workshop occupancy rule.
6. End-of-day dissolve (D6), stop-teardown hardening, and the room-open
   interrupt (D9).
7. The whiteboard reframe (D8) with its screenshot evidence.
8. Full gate run.

Each step is at least one commit. If a step reveals the previous one wrong,
fix forward in its own commit — do not rewrite pushed history.

---

# Part Two — working-code fixes from the review

Four findings, each on its own merits, each its own commit.

**2.1 The free trending signals have never run.**
`collectFreeTrendingSignals` (HN Algolia, Google Trends, Google News, Reddit
rank — keyless, $0) is called at `orchestrator/src/portfolio/evidence.ts:595`,
but the function returns early at line 541 when the Apify verdict refuses, at
555 when every recipe step is priced out, and at 580 when the scout returns
nothing fresh — so the docstring's promise at lines 644–649 ("they run whether
or not `APIFY_TOKEN` exists") has never been true. Restructure so the free
collection runs and its signals and evidence refs reach the day's trends
output on every path, including tokenless days. Design constraints: the Apify
quota logic and its guards are untouched; `GoViralTrendsSchema` is respected
(extend the artifact-writing path rather than inventing a second artifact
kind); `fetchImpl` keeps threading through so tests stay offline; and the
docstring ends up true. Extend the existing evidence tests with a
tokenless-day case that asserts free signals present.

**2.2 `undici` is dead weight.** Declared at `orchestrator/package.json:44`,
imported nowhere (verified across `orchestrator/src` and tests). Remove it,
run `pnpm install` so the lockfile follows, and run the root tests.

**2.3 Cito `/bouts` — verify the retirement is complete.** The per-event
`/ufc/events/{slug}/bouts` follow-up was already removed; the comment at
`orchestrator/src/fightaiq/sources.ts:365-375` records that it returned
`rowCount: 0` on every run and that three of five reserved calls went to it.
Confirm nothing still reserves or budgets for the retired calls (search the
fightaiq modules and `config/` for the call-reservation figures), right-size
any stale constant, and correct any doc that still describes the old shape.
If everything already agrees, record that in the commit body — a verified
no-op is a fine outcome.

**2.4 Stale counts.** `site/src/app/page.tsx:8` says "Seven full-viewport
rooms"; the walkthrough renders eight sections (`office-walkthrough.tsx:43`).
`about-project.md:8` says "sedm pracovních projektů" and line 28 "porady všech
sedmi projektů" — count the ventures in `config/ventures.json` before
touching either, because projects and sections are different numbers, and fix
only what the registry contradicts. The Czech stays Czech and matches the
file's voice.

---

# Part Three — the TypeScript headroom

In this order. Measure before claiming; the efficiency review's rule is to
name the constant a change moves.

**3.1 Code-split the walkthrough's interaction-gated weight.** There is no
`next/dynamic` anywhere in `site/`. The panel bodies
(`workflows-panels.tsx`, 33 KB source) and comparable interaction-gated
chunks ship in the home bundle for every visitor who never opens a panel.
Split the panel bodies (and any similarly gated component the build output
shows is worth it) with `next/dynamic`, preloading on section-activation or
door focus so an opened panel never shows a loading hole. Record the
first-load JS figure from `pnpm -C site build` before and after in the commit
body. Behaviour, axe and contrast gates unchanged.

**3.2 React Compiler.** Read the installed Next docs
(`site/node_modules/next/dist/docs/`) for the 16.3 flag and enable it for
`site`. The walkthrough re-renders on clock and scroll state, so verify by
hand that the wheel lock, the panels and the new performance still behave,
then run the full gates. If the compiler surfaces a real incompatibility,
revert the flag in the same session and record what broke in `NEEDED.md`.

**3.3 Precompile the studio.** `studio/` already has `tsconfig.build.json`
(outDir `dist`, declarations on) and a `build` script; today its package
exports point at `./src/index.ts`, which is why `site` must run webpack with
the `.js`→`.ts` `extensionAlias` (`site/next.config.ts`) and both site
scripts pin `--webpack`. Move consumption to built output: exports point at
`dist` with types; `site` and `orchestrator` (both consume
`@boardlessai/carousel-studio`) resolve the built files; wire the build order
so `pnpm -C site dev`, `pnpm -C site build`, the orchestrator tests and the
GitHub workflows all build the studio first or on demand; then drop the
`extensionAlias` block and both `--webpack` pins and confirm Turbopack dev
and build work. Update the studio paragraph in `CLAUDE.md` and any doc that
teaches the webpack pin. This is the riskiest task in the prompt, so it goes
last and carries the one escape hatch: if it cannot be landed green in this
session, revert it fully — config, exports, docs — and write what blocked it
into `NEEDED.md` as an `[owner:ai]` item with enough detail that the next
session starts ahead.

---

# Out of scope

Everything not named above. In particular: no new runtime dependency
anywhere in Part One; no animation or rendering library of any kind; no
Python or second-toolchain work; no new pages or sections; no orchestrator
behaviour changes beyond 2.1–2.3; no brand-token or visual-system changes
outside the Workflows section; no touching the magazines' datasets, the
treasury, or any guard. If a task seems to require any of these, the task is
wrong — stop and record the conflict instead of widening the scope.

# Definition of done

- Parts One, Two and Three implemented; every gate green; commit history
  small and readable.
- `docs/WORKFLOWS-MAP-DESIGN-SPEC.md` amended ahead of the build commits.
- `NEEDED.md` updated at session end: tick the 2026-08-08 review items this
  session completes, and add any finding this prompt told you to record.
- Branch pushed and merged to `main` per `CLAUDE.md`, so Vercel redeploys.
- The site runs: `pnpm -C site dev` (or the built output) shows the day
  performing — one button, the whole day, tags at the rooms, work walking
  the building, whiteboard framed — pressing the button again stops it, and
  opening a room mid-performance resets it so the plan returns to ambient
  (D9).
