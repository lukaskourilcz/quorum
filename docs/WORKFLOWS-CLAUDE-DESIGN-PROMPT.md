# Prompt for Claude Design: the Workflows floor plan

You are designing one new section of the BoardlessAI home page. You produce a design
specification, not code. Write it to `docs/WORKFLOWS-MAP-DESIGN-SPEC.md`. After you
finish, a separate Opus session receives your spec together with its own build prompt
(`docs/WORKFLOWS-OPUS-BUILD-PROMPT.md`) and implements the section in one pass. Your
spec is the only artifact that crosses between the two sessions, so every visual
decision Opus needs must be written in it. Opus decides nothing visual; you decide
nothing about code structure, data plumbing or tests.

You have the repository. Read these before designing, in this order:

1. `site/src/components/office/office-walkthrough.tsx` (the page you are extending)
2. `site/src/components/office/office-plate.tsx` (the backdrop system)
3. `site/src/components/office/section-results.tsx` (the pattern for a section that
   animates on arrival and holds still on request)
4. `site/src/lib/office-walkthrough.ts` (the data the page renders and its colour map)
5. `docs/WORKFLOWS-FABLE-BRIEF.md` Parts 1, 2, 3, 8, 13, 13A and 14.2 (the system the
   section depicts)

## Decisions already made

These bind you and Opus equally. The build prompt carries the same list. If your spec
contradicts one of these, Opus follows this list and flags the conflict, so a
contradiction only wastes your work.

1. **One section.** The walkthrough grows from seven locked screens to eight. Section
   id `workflows`, inserted after `projects`, NAV label "Workflows". Depth comes from
   interaction inside the section, never from more sections. The courier sequence,
   the strongest candidate for a second screen, runs as a panel inside this one: it
   is a linear storyboard that plays in a fixed frame, and it only makes sense with
   the floor plan still visible behind it.
2. **The map is a top-down floor plan.** The owner set this direction. One office
   floor seen from above, in the manner of the evacuation plan mounted beside a real
   office lift: thin walls, room outlines, corridors, door openings, furniture
   glyphs. Rooms for the eight `OfficeProjectKey` entries, one loading dock, labelled
   exits to the published sites, which sit off-plan. The plan reads as an artifact of
   the building itself, which is why it belongs on this photographic page.
3. **The plate is `office-whiteboard`** (the empty office wall the calendar section
   also uses). The floor plan hangs on that wall. You choose the filter and width
   values; the plate image itself is not open.
4. **Three depths.** Depth 1: the plan at rest, lit by the current Prague hour. Depth
   2: a replay of one day, 05:00 to 22:00, started only by an explicit control,
   never by arrival. Depth 3: four openable places, each expanding in place as one
   panel: the DNESKAi office, the workshop, the courier run, and the two odd edges.
5. **Now and replay use different visual languages.** The resting plan carries no
   chrome: its light is ambient and tracks the real clock, like the rest of the
   page. The replay is an instrument: a visible control strip, a playhead, a
   timestamp readout, and a "Now" control that returns to the ambient state. A
   reader must always know whether they are watching the building or a recording.
6. **A quiet close leaves a note on the door.** Every session in this system writes
   a record, including the ones that decide nothing. When a room's light goes out,
   the plan hangs a small mark at its door: one mark for "something left the
   building", a different mark for "met, decided nothing was needed". The second
   mark is a made thing, calm and legible, never a greyed absence and never an
   error colour. Failure states (a missed slot) show as the absence of any note,
   plus the recorded reason on hover. This rule outranks every other visual choice:
   the most common outcome in the system is a room that opens, decides nothing and
   closes, and it must read as the system working.
7. **Room grammar is shared; furniture differentiates.** Meeting rooms carry a
   table-and-chairs glyph. Carousel Studio is a machine room: no table, machine
   glyphs, a wide roller door, and a working light that is always on at low level,
   because the workshop has no meetings and runs the moment something arrives.
   The board HQ is the corner room, largest, three window marks for its three
   sittings. FightAIQ is a records room whose corridor leads into the MMA Files
   room rather than to the dock.
8. **The two odd edges are drawn as architecture.** react-express-app is a two-way
   corridor: questions come in, the hook library goes out, and the two directions
   are visibly distinct. The titty-tuesdays storefront is a pickup window on the
   outer wall, reached from outside: nobody inside carries anything to it, and
   when the window is shuttered the storefront falls back to concept mode. Both
   asymmetries must be legible without captions.
9. **Colours come from `PROJECT_COLOR` in `site/src/lib/office-walkthrough.ts`**
   (re-exported from `VENTURE_BRAND` in `site/src/lib/venture-brand.ts`). No new
   hues. Ember `#ff5a00` belongs to the company and the accent variable; venture
   rooms never borrow it.
10. **Below 1024px** the page is an ordinary document. The section renders the plan
    as a static picture scaled to the viewport width, with the four depth-3 panels
    stacked beneath it as plain expandable blocks. No horizontal scrolling.
11. **Reduced motion** must leave the section complete: every animation's end state
    fully drawn, the replay replaced by an hour strip stepped with buttons, the
    courier storyboard laid out as a numbered static strip.
12. **No motion library exists and none may be added.** Whatever you specify must be
    achievable with CSS transitions, CSS keyframes and requestAnimationFrame.

## The world you are designing into

The page is dark zinc. Page background `#09090b`, section surfaces `#0b0b0d` and
`#0e0e12`, hairlines `#26262b` and `#1e1e22`, mid borders `#3f3f46` and `#52525b`.
Text runs `#f4f4f5` for headings, `#d4d4d8` for controls, `#a1a1aa` for body,
`#94949c` for mono labels. The accent is `var(--bai-accent)`, Ember `#ff5a00`. Labels
are set in the mono stack, uppercase, tracked wide (`tracking-[0.1em]` to
`[0.14em]`), at 9.5px to 11px. Headings are tight-tracked semibold sans. A mood tint
(`var(--bai-tint)`) washes every section with the Prague time of day and sits above
decoration, below content.

The venture hues:

| Key | Hex |
| --- | --- |
| `company` | `#ff5a00` |
| `caught-up` (DNESKAi) | `#fe45e2` |
| `mma-files` | `#f7a8ea` |
| `fightaiq` | `#fecaca` |
| `goviral` | `#bbf7d0` |
| `marketingshark` | `#a5d8f3` |
| `titty-tuesdays` | `#fde68a` |
| `carousel-studio` | `#d4d4d8` |

These are pale hues built for stripes and chips on near-black. As room fills they
will need low alpha over the dark surface; as strokes and light glows they work at
full strength. Follow the discipline in `venture-brand.ts`: wherever text sits on a
tinted surface, specify the composited opaque colour so contrast can be measured,
and keep every text/background pair at 4.5:1 or better.

The photographic plates live in `site/public/office/`. The calendar section runs
`office-whiteboard` at `filter: saturate(.55) brightness(.5)` and
`width: max(132vw, 232svh)`. Your section reuses the same wall, so choose a filter
that makes the two rooms read as different times or depths of the same building
rather than as a copy. Darker suits the plan: the drawing carries the light.

## What the section depicts

BoardlessAI is a Git-backed engine that runs seven projects through 13 scheduled
wake-ups a day inside $30 a month. A meeting happens in a room. When the room
decides something, two things leave the building: a sealed package a courier carries
to one published site, and a summary that goes to the workshop where social
carousels are rendered. Most rooms are dark most of the day. The section's job is
to make that shape legible from the picture alone.

Six rules keep the picture truthful. They come from the owner's brief and are not
yours to relax:

1. Most rooms are dark most of the time. One room is lit at a time, for one hour.
   Time of day drives the plan.
2. A room that opens, decides nothing and closes is a success. It must not read as
   failure, idleness or breakage (decision 6 above is the answer; you design the
   marks).
3. GoVIRAL's room is lit one day in seven. The other six firings cost nothing and
   record a stated skip.
4. Carousel Studio is not an office. No meetings, no deliberation. Machinery,
   always available.
5. The courier carries one sealed package to one address, with a key cut for that
   door only, and a checklist of exactly which shelves it may touch. Then it walks
   round the front and checks the thing is on display before reporting back. This
   is the most animatable idea in the system.
6. Two edges are not deliveries: the two-way corridor and the pickup window
   (decision 8).

And five must-nots: no animation of money where the path is free (summaries, hook
assignment, rendering and every check cost $0); no live social posting shown,
because nothing has posted; no invented metrics, because no engagement data exists;
no generated imagery as filler; no red-alert drama, because this system fails
quietly and in writing.

### The rooms and their hours

| Room | Hours (Prague) | Key |
| --- | --- | --- |
| Board HQ | 06:00 · 14:00 · 22:00 | `company` |
| DNESKAi | 05:00 · 17:00 | `caught-up` |
| MMA Files | 09:00 · 10:00 (production desk) · 20:00 | `mma-files` |
| FightAIQ | 08:00 · 19:00 | `fightaiq` |
| marketingShark | 07:00 | `marketingshark` |
| Titty Tuesdays | 11:00 | `titty-tuesdays` |
| GoVIRAL | 13:00, Mondays | `goviral` |
| Carousel Studio | always on, low | `carousel-studio` |

The 10:00 mark is a production desk inside the MMA Files room, not a meeting: the
room's 09:00 sitting assigns or kills the day's article, and the desk writes it an
hour later. If you distinguish desks from sittings, do it inside the room, not with
a ninth room.

### Depth 1, the plan at rest

The whole story in one still: eight rooms, corridors, the loading dock, exit arrows
to four external addresses (the DNESKAi magazine, the MMA Files magazine, the quiz
apps via the two-way corridor, the storefront via the pickup window), the current
hour's room lit, door notes from earlier in the day. No numbers anywhere on this
screen except the Prague clock the page header already shows. No envelopes, no
counts, no statuses in text. Most readers never touch the section, so this still
carries the argument alone.

### Depth 2, the replay

A control strip with a playhead walks 05:00 to 22:00. Rooms light in sequence and
hang their notes. The 13 marks on the strip take their venture hues. GoVIRAL stays
dark on six days and its mark states the skip on hover. Show the grace idea if you
can do it without clutter: a slot that misses its hour holds a widening waiting band
before it goes quiet. You decide the scrub affordance, the playback speed, and how
the plan signals "recording" versus "now" (decision 5 sets the rule; you design its
expression).

### Depth 3, four panels

Selecting an openable place expands one panel in place. The panel sits over the
plan without leaving the section or changing route. Each panel is one screenful,
keyboard operable, dismissible. Design the panel chrome once; the four share it.

**The DNESKAi office.** The morning line as a diagram: 32 sources fan into a
digest, the count falls 80 candidates, 50 shown to the editor, 1 chosen. Two gates
stand before any money: fewer than 10 sources answering, or fewer than 10
candidates, and the line stops with a labelled `no_edition`. A stopped line is not
a broken line; design the stop as a closed gate, not an error. Then the desk loop:
curate, write, draft check, editor review, final check, with up to two returns
drawn as returns, and a cost bar filling toward the $0.50 edition cap as the paid
stages complete. Give the draft check its beat: it catches violations before the
expensive review is paid for. Close with the three-rung image ladder: curated
scene, licensed search, deterministic SVG plate, where the plate is a finished
thing, not a fallback apology.

**The workshop.** An article arrives as a summary, not as an article: 1,100 Czech
words folding down to kicker, headline, standfirst, three to eight passages in the
article's own order, sources and a hero credit. The fold is the animation. Then the
same summary renders twice and produces identical bytes; find a small way to say
"twice, identical" that a reader believes. Then the hook rack: 49 opening lines as
a rack of cards, most greyed because their claims would be false of this item, the
recently used removed by cooldown, one drawn by a seeded pick. The greying is the
single most interesting idea in the system: a line may only appear when the
content makes it true. A wax-seal mark carries the eligible-set hash: an override
may swap the drawn card for another from the same sealed hand, and a card from
outside the hand breaks the seal and stops the package. Show the empty rack too:
DNESKAi and MMA Files have no library written, take the logged no-hook fallback,
and the template's own headline renders. Ordinary, not broken.

**The courier.** The storyboard, in order: a key cut for one door (a bounded token
scoped to a single repository); the courier arrives and the target repo's own
consumer script does the shelving inside; the checklist at the shelf, drawn as a
literal filter with the day's four files passing and a stray file bouncing off;
the three checklists side by side (edition, no-edition, dataset), with a dataset
append physically unable to reach the article shelf; commit, push, the site
rebuilding; the walk round the front, where the verifier holds a torn ticket
against the live page and the two halves match (the content hash); seven ticks;
the receipt filed. Give this panel the most room. It is the reason the section
exists.

**The two odd edges.** The corridor and the window, annotated: 3,633 questions in
and the hook library out on the corridor, with the two directions separately
drawn; the storefront pulling a sanitized feed through the window and falling
closed to concept mode when the window is dark. GoVIRAL appears here as a signal
line that feeds the two magazine rooms and owns no address of its own.

### The worked example

One real published edition threads through the DNESKAi, workshop and courier
panels: its date and headline on the desk, its summary in the workshop, its
receipt at the dock, and a link to the live article at the end. Opus resolves the
data. You design where the example's date, headline and final link sit in each
panel, and how the thread is visually continuous across the three.

## What you must specify

Your spec must pin, at minimum:

1. Plate filter and width values for `office-whiteboard` in this section.
2. The plan's geometry: viewBox, room positions and proportions, wall weight,
   corridor width, door openings, dock and window placement, exit-arrow shape.
   Give coordinates Opus can transcribe into one inline SVG.
3. Furniture glyphs for the three room kinds, drawn simply enough to survive
   at plan scale.
4. The three light states (dark, lit, workshop-low) and both door-note marks, as
   exact fills, strokes, alphas and sizes. Include the missed-slot state.
5. Typography inside the plan: room labels, hour marks, panel headings, caption
   sizes, all from the page's existing type system.
6. The replay chrome: control strip layout, playhead, timestamp, speed, the "Now"
   return, and the ambient-versus-recording distinction.
7. Panel chrome shared by the four panels, plus a per-panel layout for each.
8. A motion table: every animation with duration, easing, delay and trigger
   (arrival, control, selection). Entrance animation on section arrival is
   allowed and separate from the replay. Keep durations inside the page's
   existing feel (the wallboard counts up over 900ms; jumps settle in about a
   second).
9. The reduced-motion rendering of each animated element, as static end states,
   the hour strip, and the numbered courier strip.
10. The below-1024px layout.
11. Hover and focus treatments for every interactive element, with focus visible
    at 3:1 against its surround.

Where your spec is silent, Opus falls back to the section idioms already in the
codebase, so silence on anything listed above is a defect in the spec.

## Acceptance for your spec

Before you finish, check: every colour in the spec is one of the page colours or
venture hues named in this prompt, or a composited value you derived and stated
from them; every text/background pair states its contrast and clears 4.5:1; the
two door-note marks and the three light states survive a greyscale print test
(distinguishable with hue removed); the replay is identifiable as a recording with
the sound off and the copy unread; nothing animates a cost on a $0 path; the
reduced-motion appendix covers every animation in the motion table; and a reader
who only ever sees depth 1 can answer "where does a decision go when it leaves a
room" from the picture.
