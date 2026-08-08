# Facilities — where this stands, and what is left

Written at the end of the build session on 2026-08-08, for whoever picks this up next. The
section is live; everything below is either an owner decision or a loose end, not a blocker.

## What the section is now

The eighth home-page section, `#facilities`, NAV label **Facilities**. A top-down floor plan of
the office with no card around it — the plan is the section and takes its full width.

- **Depth 1** — the plan at rest, lit by the current Prague hour.
- **Depth 2** — `Play the day` walks 05:00 → 22:00 **once** and stops on the finished picture.
- **Depth 3** — every room opens. The plan reframes onto that room's own rectangle and the
  content stands inside those walls: what it does, what it opens onto, how it operates, its
  sessions, the roles standing in it, and the last thing it produced. The dock is not a room and
  keeps the courier panel.

Roles come from `ventures` in the agent registry. Room copy (purpose / connects / operates) is
site copy in `ROOM_ORDER`, `site/src/lib/office-workflows.ts`.

## Owner decisions still open

1. **The Titty Tuesdays dock bay.** A bay is where a courier loads, and that venture *collects* —
   it pulls a feed and nothing is delivered to it. The bay lines up with no courier exit, and a
   dashed lane in its own hue points back at the room, but the window-and-sill drawing that used
   to carry the asymmetry said it far more plainly. Worth deciding whether the bay stays.
2. **Board HQ lists 17 roles** — every role scoped `global`. Correct by the registry, but a long
   column beside rooms showing two or three. Restricting it to the council is a one-line change.
3. **MMA Files has no article link.** No delivery receipt under
   `state/ventures/mma-files/deliveries/articles/` records an `articleUrl`, so its room shows a
   title and a date with no link and no thumbnail. DNESKAi's card is complete because its receipt
   does record one. If the MMA delivery path starts writing `articleUrl`, the card fills in with
   no further work — `latestArticle()` already reads it.
4. **The two workspace controls are below the type floor.** `Jump to date` and
   `Show the delivered article` are at 7.5px and the channel rail at 9.5px, against a documented
   9.5px mono floor. Shrunk on request across several rounds; flagging that they are now at or
   under the floor.

## Known-flaky e2e, and one genuinely red guard

Run the suite on an **idle** machine. A concurrent `next build` roughly doubles its runtime and
tips several time-budgeted tests over.

- **`operating-surfaces.spec.ts` › `admin rating persists…`** — flaky. Measured 3/3 green on
  `main` and 3/3 red on this branch, which looked like a regression; bisecting to `globals.css`
  and reverting it then produced pass / fail / pass, so the bisect was luck and the test is
  timing-marginal. The rating POST does not resolve inside its 5s expectation often enough. The
  larger home page makes the dev server slower and trips it more often. Nothing in this work
  touches admin, ratings or the API — verified with `git diff --name-only origin/main`.
- **`buttons.spec.ts` › `every app button declares its behavior`** — walks fifteen routes under a
  single 120s budget and now lands around 126s. Passes at `--timeout=420000`. Its budget wants
  raising.
- **`operating-surfaces.spec.ts` › `WeekBoard navigates…`** — genuinely red, and **pre-dates all
  of this**. It expects 7 `[data-project-legend]` and the board renders 8; Carousel Studio joined
  `projectDetails` in `3e081c8` on 2 August and the assertion was never moved. Already an owner
  item in `NEEDED.md`. Decide whether to move the number or change the board.

**The suite writes into `state/`.** `state/ratings/titty-tuesdays/ledger.jsonl` and
`state/ventures/titty-tuesdays/plans/e2e-launch-plan.json` are written in setup and restored in
teardown — a killed run leaves both dirty. Check `git status state/` before staging, and never
stage with a blanket `git add -A` after running e2e.

## Things worth knowing before changing this code

- **The dev server's utility scan goes stale.** A Tailwind arbitrary class can be present in the
  markup, absent from the dev stylesheet, and correct in the production build. Verify against
  `site/.next/static/css/*.css` before concluding a CSS variable or size "does not work".
- **`img-src` is `'self' data: blob:`.** Cross-origin images are blocked silently. The Facilities
  card serves the delivered package's own thumbnail bytes through
  `site/src/app/facilities/thumb/[venture]/route.ts` rather than widening the header.
- **The plan frames a room by growing its rect to the container's aspect** (`roomViewBox`), which
  is what lets the overlay sit inside the walls without measuring the SVG. The container is
  measured in a layout effect, not a `ResizeObserver` — an observer's callback can go unfired in a
  throttled tab, and with no box measured no room would open at all.
- **Tooltips are `site/src/components/ui/tooltip.tsx`**, hand-rolled in the house style. There is
  no Radix in this repository and none was added.

## Verified at the end of the session

`pnpm -C site typecheck`, `lint`, `test` (287, including two new wheel-gesture cases) and `build`
all pass. WCAG AA on `/` passes — the roster's single scroller needed `tabIndex` and a role, which
axe catches as `scrollable-region-focusable`. Containment and contrast suites pass.
