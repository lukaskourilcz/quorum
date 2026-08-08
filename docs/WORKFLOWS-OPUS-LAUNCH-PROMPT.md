# Launch prompt for Opus: the Workflows section

Produced by the Claude Design pass on 2026-08-08. This is the message to give the
Opus build session; it stacks the design pass's amendments on top of
`docs/WORKFLOWS-OPUS-BUILD-PROMPT.md` and `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`.

The engine session verified the amendments against the repository on 2026-08-08
and corrected two of them before committing this file. Amendment 1 claimed
`react-express-app` had been removed; the repository still exists on GitHub, the
question bank (`state/marketingshark/question-banks/devshark.json`, 3,633
questions) and its import adapter are still on `main`, and commit `ef3f1b4`
dropped only the outbound hook-library delivery. The owner then settled the
edge's meaning on 2026-08-08: the app supplied its questions once, stays
standalone, and no automation runs between the two repositories in either
direction again, so amendments 1 and 2 below draw the corridor as the dormant
record of a completed import. Amendment 7 records a second repository change
the design pass predates: commits `51ba541` and `ead9d57` grew the quiz library
to 50 hooks and wrote the news (12) and MMA (16) libraries that were unwritten
when the build prompt and the spec were authored. Everything else is verbatim
from the design pass.

---

You are adding one section to the BoardlessAI home page: a top-down floor plan of
the office showing how work moves through the company. You build it in one pass.
The visual specification is already written; you implement it and make no visual
decisions.

Read, in this order, before writing any code:

1. `site/AGENTS.md`, then the relevant guides in
   `site/node_modules/next/dist/docs/`. This Next.js version differs from your
   training data.
2. `docs/WORKFLOWS-OPUS-BUILD-PROMPT.md`, in full. It is your build prompt: the
   decision list, the tuple shift, the files you create, the data contract, the
   load-bearing invariants, the behaviour requirements, the checks and the test
   additions. Everything about code structure and data plumbing is there and
   nowhere else.
3. `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`, in full. It is the design
   specification: plate values, plan geometry as transcribable coordinates,
   furniture, light states, door notes, typography, replay chrome, panel chrome
   and the four panel layouts, a 28-row motion table, the reduced-motion
   appendix, the sub-1024px layout, and a colour and contrast ledger.
4. `site/src/components/office/office-walkthrough.tsx` and
   `site/src/lib/office-walkthrough.ts`, in full — the client shell you are
   extending and the server resolver that is also the sanitising boundary.
5. `site/src/components/office/office-plate.tsx`, `section-results.tsx` and
   `wheel-gesture.ts`. Results is the pattern for a section that animates on
   arrival and holds still on request. The wheel module is tested and finished;
   do not touch it.
6. `docs/WORKFLOWS-FABLE-BRIEF.md` Parts 8, 13 and 13A, for what each element
   means.

Precedence, highest first: the build prompt's "Decisions already made" list as
amended below, then its seven load-bearing invariants, then the seven amendments
below, then the design spec, then the build prompt's own fallbacks. Where the
spec and a decision conflict, follow the decision, build on, and name the
conflict in your final report. Do not improvise a third option.

## Amendments from the design pass

These are the only places the design pass diverges from, or resolves, the build
prompt as written. They outrank the spec where they overlap it, and they outrank
the build prompt's fallbacks. Amendments 1, 2 and 7 were corrected or added by
the engine session against the repository as of 2026-08-08.

1. **The corridor records a completed import; nothing moves through it any
   more.** Decision 8 is amended by the engine session, which authored it, on
   the owner's direction of 2026-08-08: `react-express-app` supplied the
   question bank once and the snapshot is pinned inside this repository (3,633
   questions, imported 2026-08-07); the app is standalone, and no automation
   runs between the two repositories in either direction again — commit
   `ef3f1b4` had already dropped the outbound hook delivery. Draw the corridor
   on the west wall at marketingShark as a single inbound lane in the plan's
   dormant treatment, the same visual state the spec gives an unlit room,
   labelled as the import: the reader should learn where the questions came
   from and see that nothing crosses today. The lane never animates, including
   during the replay — stillness on this edge is the honest state. The spec's
   §2 geometry was drawn without it, so this is the one bounded visual gap you
   close yourself: mirror the spec's dock-exit lane grammar at the dormant
   treatment, label it with the spec's exit-label typography, and name this
   spec gap in your final report. Do not build an outbound lane or any
   hook-library delivery. The data contract row for
   `state/marketingshark/question-banks/devshark.json` stays live and resolves
   as written.
2. **The fourth panel is the corridor, the window and the signal.** Decision 4's
   four openable places hold — the DNESKAi office, the workshop, the courier,
   and this one. Use spec §7.5 as the base layout and add the corridor as a row
   alongside the storefront edge and GoVIRAL: on the corridor row, the bank's
   question count and import date, stated as a completed hand-over from a
   standalone app with nothing sent back; the fail-closed feed on the window
   row; the signal line on GoVIRAL's.
3. **The plate is decided; the fallback is dead.** Use the spec's §1 values
   verbatim: `filter: saturate(.32) brightness(.3) contrast(1.06)` and
   `width: max(150vw, 264svh)`. Ignore the build prompt's
   `saturate(.4) brightness(.34)` / `max(132vw, 232svh)` fallback.
4. **No door leaves and no swing arcs.** A door on the plan is a gap in the
   wall and nothing else. The only door leaf in the whole section is the
   closed-gate glyph in the DNESKAi panel, which is what makes a closed gate
   read as closed.
5. **No hours printed, no legend, no readout, no tooltips.** Rooms carry a name
   and nothing else, and the board is a header row, the plan, and the replay
   strip while replaying. Hover and focus change the drawing only — no hover
   text anywhere. Decision 6's "recorded reason on hover" is served by a native
   `<title>` on each room, the dock and each door note, the same way
   `section-calendar.tsx` already carries its full cell sentences; nothing else
   on the plan gets a `title`. Spec §5.5 has the strings. Every hour in the
   section is read on the replay rail or in the sub-1024px key.
6. **Below 1024px the labels leave the drawing.** At viewport width no in-plan
   type can clear the page's 9.5px mono floor, so every `<text>` inside the
   plan is hidden and each place carries a 44-unit numeral instead, with an
   HTML key beneath the plan carrying the names, hours and notes. Spec §11 has
   the full table. This satisfies decision 10 — static picture, scaled to
   viewport width, no horizontal scrolling — and is the one place the design
   pass chose against a naive reading of it.
7. **The hook racks are no longer empty.** Since the spec was written, the quiz
   library grew to 50 hooks (`51ba541`) and the news and MMA libraries were
   written (`ead9d57`): 12 and 16 hooks. The build prompt's data contract row
   already resolves counts from the files, so the numbers take care of
   themselves; what changes is the workshop panel's story. Do not present
   DNESKAi and MMA Files as having no library. Present the rack the spec draws
   with the resolved counts, and keep the no-hook fallback as what it still is:
   the logged, ordinary outcome for an item whose metadata makes nothing in the
   rack true. If the spec's workshop panel draws an "empty rack" beat, replace
   it with the eligible-set greying the spec already draws, and name the
   substitution in your final report.

## What the spec is deliberately silent on

Fall back to the section idioms already in the codebase for anything not listed
here:

- Data resolution, types, file layout and tests — the build prompt owns all of
  it.
- The recorded sentences in the `<title>`s and the notes. They come from
  `readableSlotReason()` and the calendar feed; the spec fixes only where they
  sit and how they are typed.
- The worked example's date, headline and URL, which resolve from committed
  state. If any part cannot be resolved, the example's chip renders
  `NO EDITION ON RECORD YET` in mono 10.5px `#94949c` with no left border and
  the final link is absent — never a placeholder date.

## Your final report states

- Which of the build prompt's checks ran, and their results.
- Any conflict between the design spec and a decision or invariant, and what
  you followed.
- Any row of the data contract that resolved to `null` against current state,
  so the owner knows what the section shows today rather than in theory.
- Anything in the spec you could not implement with CSS transitions, CSS
  keyframes and `requestAnimationFrame` alone. No motion library exists and
  none may be added.
