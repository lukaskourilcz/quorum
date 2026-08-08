# Workflows — design specification

> **Editor's note (engine session, 2026-08-08).** Committed from the design
> pass's output, reformatted to markdown with every value and sentence
> unchanged. The "Owner amendment" paragraph below rests on a claim the engine
> session disproved: `react-express-app` still exists on GitHub and its pinned
> question bank is still on `main`. The owner's actual decision is in
> `docs/WORKFLOWS-OPUS-LAUNCH-PROMPT.md` amendments 1 and 2 — the corridor
> returns as the dormant record of a completed import — and the launcher
> outranks this spec wherever the two overlap.

The visual specification for the eighth section of the BoardlessAI home page.
Section id `workflows`, inserted after `projects`, NAV label "Workflows".
Written for the Opus build pass; it makes no code decisions and every visual
decision the build needs is here.

Every colour below is a page colour, a venture hue from `PROJECT_COLOR`, or a
composited value derived and stated from them. Every text/background pair
states its contrast ratio. Coordinates are given in the plan's own viewBox
units and can be transcribed literally.

**Owner amendment, 2026-08-08 — the two-way corridor is out.**
`react-express-app` has been removed from the repository, so the question bank
inbound and the hook library outbound no longer exist. Decision 8's first half
is void: the plan has one odd edge (the pickup window), three external edges
and three external addresses. The west wall is solid. marketingShark keeps its
07:00 room and its west position on the plan; it simply no longer opens onto
anything outside. The fourth depth-3 panel becomes the window and the signal
(the storefront edge plus GoVIRAL), so decision 4's "four openable places"
still holds. Nothing else in the decision list is affected.
*(Superseded — see the editor's note above.)*

## 1. The plate

| Property | Value |
| --- | --- |
| image | `office-whiteboard` |
| alt | Empty office wall with a whiteboard |
| filter | `saturate(.32) brightness(.3) contrast(1.06)` |
| width | `max(150vw, 264svh)` |
| plateY | none |
| eager | false |

The calendar section runs the same wall at `saturate(.55) brightness(.5)` and
`max(132vw, 232svh)`. Two things separate the rooms. The filter is roughly two
thirds of the calendar's brightness and well under half its saturation, so this
is the same wall at a later hour; the drawing carries the light instead of the
photograph. And the width is a closer crop, so the wall's texture reads at a
visibly different scale rather than as the same photograph twice.

Section shell, exactly as its siblings: `<section data-sec id="workflows">`
with the calendar section's responsive height classes, `background: #0b0b0d`,
an `OfficePlate`, an `OfficeMood`, and one content component inside a `data-fg`
wrapper. Add one extra decorative layer after `OfficeMood` — the replay scrim
in §6.4 — carrying `pointer-events: none`.

## 2. Section layout

One board, mounted on the wall, holding the plan. The board is the calendar
panel's chrome, so the two sections read as the same page furniture.

| Part | Spec |
| --- | --- |
| Board | `max-width: 1180px`, `border: 1px solid #3f3f46`, `border-radius: 14px`, `background: rgba(11,11,13,.9)`, `box-shadow: 0 40px 120px rgba(0,0,0,.65)`, `backdrop-filter: blur(16px)`, `overflow: hidden` |
| Header row | `border-bottom: 1px solid #26262b`, padding `14px 22px`, flex, space-between |
| Plan | full board width, the inline SVG at `display: block; width: 100%; height: auto` |
| Replay strip | present only while replaying; `border-top: 1px solid #26262b`, padding `12px 22px` |

The board's composite background is `rgba(11,11,13,.9)` over the plate. At the
plate's `brightness(.3)` the wall's brightest pixels land near `#3a3a3a`, so
the worst-case composite is `#101012`. Every contrast figure below that
involves the board's paper is measured against `#101012`, not against the
ideal `#0b0b0d`.

### Header row

- Left, one sentence, 13px/1.5 `#94949c` on `#101012` — 6.31:1: "Thirteen
  wake-ups a day, one room at a time. Open a door to see how the work leaves
  the building."
- Right, the ambient clock chip: mono 10.5px uppercase .12em `#94949c`
  (6.31:1), reading `NOW · PRAGUE HH:MM` with the minutes in `#f4f4f5`
  (17.3:1), tabular nums, preceded by a 6px `var(--bai-accent)` dot running the
  page's existing `bai-pulse 1.8s ease-in-out infinite`.
- Right, the only depth-2 entry point: a button reading `PLAY THE DAY`, mono
  10.5px uppercase .1em, `border: 1px solid #3f3f46`, `border-radius: 9px`,
  `background: #101013`, padding `7px 12px`, `color: #d4d4d8` (12.85:1). It is
  replaced by the replay strip's `NOW` control while replaying.

### No legend, and no readout

The board carries a header row, the plan, and the replay strip while replaying.
There is no legend and no readout. Both were specified and both are dropped by
owner decision.

That is a real constraint on the drawing rather than a subtraction from it:
every state on the plan has to be self-evident from its own shape, because
there is no key to look it up in. It is why the two door notes share one
silhouette and differ by fill (§5.2), why the missed state is an empty clip
rather than a colour, why the workshop is the only room with a disc in it, and
why the three external edges are labelled in place, off-plan, instead of being
enumerated underneath. A reader learns the marks by looking at the building.

## 3. The plan geometry

`viewBox="0 0 1760 940"`. `role="img"` with a `<title>` reading *Floor plan of
the BoardlessAI office*. One inline SVG; HTML overlays only for the panels.

The 200-unit left and right margins and the 80-unit bottom margin are the
off-plan zone: exit arrows, addresses and the storefront's approach live there.

### 3.1 Envelope and ranks

| Element | Coordinates |
| --- | --- |
| Outer wall envelope | x 200 → 1560, y 100 → 860 (1360 × 760) |
| Spine corridor | x 200 → 1560, y 454 → 524 (70 deep, full width) |
| Top rank | y 100 → 454 (354 deep) |
| Bottom rank | y 524 → 860 (336 deep) |

One straight spine across the whole floor with rooms above and below is what
makes the picture answerable at a glance: every room has exactly one door,
every door opens onto the same corridor, and the corridor runs east into the
workshop's roller door and the dock. That is the sentence "where does a
decision go when it leaves a room", drawn.

### 3.2 Rooms

| Room | Key | x | width | y | height | Area |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Board HQ | `company` | 200 | 360 | 100 | 354 | 127,440 |
| DNESKAi | `caught-up` | 560 | 270 | 100 | 354 | 95,580 |
| MMA Files | `mma-files` | 830 | 260 | 100 | 354 | 92,040 |
| FightAIQ | `fightaiq` | 1090 | 150 | 100 | 354 | 53,100 |
| Carousel Studio | `carousel-studio` | 1240 | 320 | 100 | 354 | 113,280 |
| marketingShark | `marketingshark` | 200 | 360 | 524 | 336 | 120,960 |
| GoVIRAL | `goviral` | 560 | 170 | 524 | 336 | 57,120 |
| Titty Tuesdays | `titty-tuesdays` | 730 | 270 | 524 | 336 | 90,720 |
| Loading dock | — | 1000 | 560 | 524 | 336 | — |

Board HQ is the largest room and the only corner room: it holds both the west
and the north outer wall. The dock is larger in area and is not a room — it is
drawn as an apron (§3.7), reads as circulation, and carries no room label, no
furniture group and no light state.

No hours are printed on the plan. A room carries its name and nothing else; the
hours live on the replay rail (§6.2) and in each room's native `<title>`
(§5.5), where they are read rather than counted. The workshop carries no hours
line either — its always-on state is drawn, by a floor that is never dark and a
working light that never goes out. MMA Files' 10:00 production desk is
distinguished inside the room by its own glyph and caption (§4.2), never by a
printed hour and never by a ninth room.

### 3.3 Walls

Three weights, two greys, both from the page palette. Hierarchy is carried by
weight, so no wall borrows a venture hue — `#d4d4d8` in particular stays
Carousel Studio's.

| Layer | Stroke | Width | Contrast on #101012 |
| --- | --- | ---: | ---: |
| Outer envelope | `#a1a1aa` | 5 | 7.41:1 |
| Interior partitions | `#94949c` | 2.5 | 6.31:1 |
| Roller, window marks, sill | `#94949c` | 1.8 | 6.31:1 |
| Dock kerb (dashed 7 6) | `#94949c` | 1.5 | 6.31:1 |

`stroke-linecap: square`, `fill: none` throughout.

Envelope (openings are gaps in the path, never lighter strokes):

```
north  M200 100 H1560
west   M200 100 V860
east   M1560 100 V630   M1560 690 V730   M1560 790 V860
south  M200 860 H815    M925 860 H1560
```

East openings 630–690 and 730–790 are the two courier exits. The south opening
815–925 is the pickup window. The west wall is unbroken.

Partitions:

```
verticals   M560 100 V454      M830 100 V454      M1240 100 V454
            M1090 100 V240     M1090 300 V454        (FightAIQ's only opening)
            M560 524 V860      M730 524 V860      M1000 524 V860
y=454       M200 454 H440   M500 454 H665   M725 454 H930   M990 454 H1330   M1510 454 H1560
y=524       M200 524 H410   M470 524 H625   M685 524 H835   M895 524 H1000
dock kerb   M1000 524 H1040   M1110 524 H1330   M1510 524 H1560     (dashed 7 6)
```

Door gaps are 60 units wide: Board HQ 440–500, DNESKAi 665–725, MMA Files
930–990, marketingShark 410–470, GoVIRAL 625–685, Titty Tuesdays 835–895. A
door is a gap in the wall and nothing else — no leaf, no swing arc, no
threshold mark. The plan draws what the building is, not which way a door
happens to hang, and seven arcs in a 70-unit corridor were the busiest thing on
the drawing while carrying no information the gap did not already carry.

The roller door is 180 units, 1330–1510. The dock's kerb openings are the
courier walk-through 1040–1110 and the pack crossing 1330–1510, the second
aligned exactly with the roller door so a finished pack crosses 70 units of
corridor and nothing else.

FightAIQ has no opening on the spine. Its single door is in the shared wall at
x 1090, y 240–300, and it opens into MMA Files. The records room fronts the
corridor and cannot reach it; its output is another room's input, and the only
route out of it leads to the desk that uses it. That asymmetry needs no
caption.

Roller door — six 16-unit ticks across the opening, at x 1345, 1375, 1405,
1435, 1465, 1495, from y 446 to 462. Not a leaf and not an arc: a roller does
not swing, and that is how the workshop reads as machinery from the wall alone.

Window marks — three on Board HQ's north wall, one per sitting: paired 1.6-unit
lines at y 96 and y 104, spanning x 250–310, 350–410, 450–510.

Pickup-window sill — a closed 1.8-unit outline in `#fde68a`, x 815–925,
y 852–860, the only place a venture hue appears in the wall layer. It is the
only opening in the building that is not a door.

### 3.4 Floors

| Surface | Fill |
| --- | --- |
| Room, dark | `#0e0e12` |
| Corridor | `#121216` |
| Workshop, low | `#1c1c20` (§5.2) |
| Dock apron | `url(#apron)` — 14-unit cell, `patternTransform="rotate(45)"`, base `#0c0c0f`, one 1.6-unit `#1d1d23` line per cell |

Corridor path: `M200 454 H1560 V524 H200 Z`.

Room versus corridor is a 1.16:1 surface difference and is deliberately not
information-bearing — the partitions carry every boundary at 6.31:1. The
apron's 45° hatch is what tells a reader the dock is outdoor-ish circulation
before they read its label.

### 3.5 Internal lines

Two data paths cross the plan. Nobody carries either, so neither gets an arrow
with a package on it; both are dashed lines in the spine, separated by 10 units
and distinguished by dash pattern.

| Line | Path | Stroke |
| --- | --- | --- |
| Summary chase, magazines → workshop | `M700 484 H1420` plus risers `M700 484 V462` and `M1420 484 V462`, plus 5×5 nodes at (697.5, 481.5) and (1417.5, 481.5) | `#94949c`, 1.6, dash 9 7 |
| GoVIRAL trend signal | `M655 524 V494 H1000` · `M1040 494 H1180`, risers `M712 494 V454` and `M964 494 V454` | `#bbf7d0`, 1.8, dash 2 7, round caps, `stroke-opacity: .8` |

The chase runs at y 484, the signal at y 494. Door notes occupy y 458–478
above the chase and y 500–520 below the signal, so nothing ever overlaps. The
signal's gap at x 1000–1040 is the courier walk-through: a trend signal does
not cross the dock.

GoVIRAL's line ends inside the two magazine rooms and starts nowhere else. It
owns no exit, no dock bay and no address, and the drawing says so by never
reaching a wall.

### 3.6 Off-plan edges

| Edge | Geometry |
| --- | --- |
| Courier → DNESKAi magazine | `M1560 660 H1656`, 2.2 `#d4d4d8`, arrowhead |
| Courier → MMA Files magazine | `M1560 760 H1656`, 2.2 `#d4d4d8`, arrowhead |
| Storefront reach leg | `M700 916 H900 V872`, 1.8 `#94949c`, dash 3 6, no head |
| Storefront return leg | `M856 872 V898 H706`, 2.2 `#fde68a`, arrowhead at the west end |

Arrowhead marker: `markerWidth 9`, `markerHeight 8`, `refX 8`, `refY 4`,
`orient="auto"`, path `M0 0 L9 4 L0 8 Z`, filled in the line's own colour.

Addresses, mono, `text-anchor: start` at x 1666:

- `DNESKAI` at y 650 and `MAGAZINE` at y 672 (mono 15/400)
- `MMA FILES` at y 750 and `MAGAZINE` at y 772

The storefront's two legs are the whole of decision 8's surviving half. Both
begin and end outside the envelope: the dotted leg reaches in to the sill and
stops without a head, the solid leg leaves the sill and carries the arrow away.
Nobody inside walks to the window, and no courier arrow ever touches this wall.
Labels, `text-anchor: end` at x 688: `STOREFRONT` at y 892 (mono 15/600
`#d4d4d8`, 12.85:1) and `COLLECTS AT THE WINDOW` at y 912 (mono 15 `#94949c`,
6.31:1). `PICKUP WINDOW` sits at x 940, y 886 in mono 15/500 `#fde68a`
(13.7:1 on `#101012`).

**Shuttered state.** The sill's 815–925 opening fills with a hatched shutter —
the apron pattern at 8-unit pitch in `#94949c` at 1.2 — the reach leg stops at
the shutter, the return leg is absent entirely, and `CONCEPT MODE` replaces
`COLLECTS AT THE WINDOW` in mono 15 `#fde68a`. An unreachable engine can close
the window; it can never open a courier exit.

### 3.7 The dock

| Glyph | Geometry |
| --- | --- |
| Checklist board | rect 1060, 540, 90 × 54, `#94949c` 1.6, plus three 1.4 rules x 1072→1138 at y 556, 568, 580 |
| Sealed package | rect 1084, 590, 30 × 30, fill `#16161b`, stroke `#a1a1aa` 1.6; seam line y 605 x 1084→1114; wax dot r 3.2 fill `#a1a1aa` at (1099, 605) |
| Staging bench | rect 1060, 620, 240 × 40, `#94949c` 1.6 |
| Courier bays | rects 1420, 620, 132 × 80 and 1420, 720, 132 × 80, `#94949c` 1.5, dash 8 7 |
| Labels | `LOADING DOCK` x 1016 y 812, mono 19/600 `#a1a1aa`; `ONE PACKAGE · ONE ADDRESS` x 1016 y 834, mono 15 `#94949c` |

One package on the bench, not two. It is the rule's cardinality, not a count of
today's work, and the caption says so.

## 4. Furniture glyphs

Three kinds, one weight, drawn to survive at plan scale. At the board's full
1180px the scale factor is 0.67, so a 24-unit chair renders 16px and a 1.6-unit
stroke renders 1.07px — the floor for everything here.

Resting stroke is `#6c6c73`, which is `#94949c` at 70% composited over
`#0e0e12` — 3.70:1, clear of the 3:1 graphics floor and quiet enough that the
walls stay the loudest thing on the drawing. In a lit room, furniture takes the
room's hue at full strength (§5.2). Fills are `none` throughout except the
dock's package.

### 4.1 Meeting room — table and chairs

A rounded table with chairs on the long sides; 24 × 16 chairs, 8 units clear of
the table.

| Room | Table | Chairs |
| --- | --- | --- |
| Board HQ | 260, 280, 240 × 80, r 14 | 288/368/448 at y 256 and y 368; 232 and 508 at y 308, 16 × 24 |
| DNESKAi | 610, 288, 170 × 64, r 10 | 630 and 736 at y 264 and y 360 |
| marketingShark | 300, 668, 170 × 64, r 10 | 320 and 426 at y 644 and y 740 |
| GoVIRAL | 597, 674, 96 × 52, r 8 | 609 and 657 at y 650 and y 734 |
| Titty Tuesdays | 780, 659, 170 × 62, r 10 | 800 and 906 at y 635 and y 729 |

Board HQ gets the largest table and eight chairs, including one at each end —
the only room on the plan with a head of the table.

### 4.2 MMA Files — a sitting and a desk in one room

Meeting table: 870, 240, 160 × 60, r 10; chairs 890 and 986 at y 216 and
y 308.

Production desk: 905, 372, 110 × 34, r 4; one chair 948, 414. A desk has one
seat and no facing side, which is the whole distinction from a sitting.

Caption `DESK · 10` at x 905, y 364, mono 15/500 `#94949c` (5.63:1 on
`#0e0e12`).

### 4.3 FightAIQ — a records room that also sits

Table 1120, 220, 90 × 48, r 8; chairs 1132 and 1176 at y 196 and y 276.

Three shelving runs: 114 × 10 rects at x 1108, y 320, 344, 368.

Caption `RECORDS` at x 1108, y 414, mono 15/500 `#94949c`.

### 4.4 Carousel Studio — machine room

No table, no chairs, nothing to sit at.

| Glyph | Geometry |
| --- | --- |
| Roller 1 | 1276, 180, 140 × 54, r 8, plus verticals at x 1310, 1346, 1382 |
| Roller 2 | 1276, 250, 140 × 54, r 8, plus verticals at x 1310, 1346, 1382 |
| Output stack | three 90 × 12 rects at x 1440, y 186, 206, 226 |
| Plotter bed | 1290, 330, 200 × 40, with a head line x 1360, y 324 → 376 |
| Working light | disc r 13 at (1508, 350), fill `#818185` |

Machine strokes are `#9d9da1` — `#d4d4d8` at 70% over `#1c1c20` — so the
workshop's own hue reads in its machinery at rest without the room ever looking
lit. Caption `MACHINE ROOM · NO MEETINGS` at x 1264, y 418, mono 15/500
`#94949c` (4.96:1 on `#1c1c20`).

### 4.5 Typography inside the plan

Two families, both already loaded by the page: `var(--font-dm-sans)` for prose
and `var(--font-ibm-plex-mono)` for labels. Everything inside the plan is mono.
A plan's labels are drafted, not set, and the mono stack is what makes the
drawing read as an artifact of the building rather than as a diagram in an
article.

The board is 1180px wide against a 1760-unit viewBox, so one unit renders
0.6705px. The page's mono floor is 9.5px, which puts the smallest usable
in-plan size at 15 units (10.06px). Nothing on the plan is smaller.

| Role | Size | Weight | Case | Tracking | Fill | Renders at |
| --- | ---: | ---: | --- | --- | --- | ---: |
| Room label | 19u | 600 | upper | .1em | `#a1a1aa` dark / `#f4f4f5` lit / `#d4d4d8` workshop | 12.7px |
| In-plan caption (`DESK · 10`, `RECORDS`, `MACHINE ROOM · NO MEETINGS`) | 15u | 500 | upper | .12em | `#94949c` | 10.1px |
| Dock label | 19u | 600 | upper | .1em | `#a1a1aa` | 12.7px |
| Dock sub-caption | 15u | 500 | upper | .12em | `#94949c` | 10.1px |
| Off-plan address, primary | 15u | 600 | upper | .12em | `#d4d4d8` | 10.1px |
| Off-plan address, secondary | 15u | 400 | upper | .1em | `#94949c` | 10.1px |
| `PICKUP WINDOW` | 15u | 500 | upper | .1em | `#fde68a` | 10.1px |

No hour marks, no numerals and no legends live inside the plan (§3.2). Panel
typography is specified with the panel chrome in §7.1; board chrome — the
header sentence and the replay strip, which is all there is — is specified
where each part is drawn, and every size there is one the page already uses:
13px body and mono 10.5px labels.

## 5. Light states and door notes

### 5.1 The three light states

| State | Room fill | Room outline | Extra |
| --- | --- | --- | --- |
| Dark | `#0e0e12` | partition only, `#94949c` 2.5 | none |
| Lit | composited hue fill below, plus a 2.5 outline in the hue on the room's own rect | full-strength hue | halo or contour (§6.4) and a door spill |
| Workshop, low | `#1c1c20` | partition only | working light always on at `#818185` |

Composited lit fills are the venture hue at 14% over `#0e0e12`, given opaque so
they can be measured:

| Room | Hue | Lit fill | Hue on lit fill | #f4f4f5 on lit fill | #d4d4d8 on lit fill |
| --- | --- | --- | ---: | ---: | ---: |
| Board HQ | `#ff5a00` | `#30190f` | 5.28:1 | 15.03:1 | 11.18:1 |
| DNESKAi | `#fe45e2` | `#30162f` | 5.59:1 | 14.91:1 | 11.09:1 |
| MMA Files | `#f7a8ea` | `#2f2430` | 8.29:1 | 13.47:1 | 10.02:1 |
| FightAIQ | `#fecaca` | `#30282c` | 9.91:1 | 13.04:1 | 9.69:1 |
| GoVIRAL | `#bbf7d0` | `#262f2d` | 11.35:1 | 12.55:1 | 9.33:1 |
| marketingShark | `#a5d8f3` | `#232a32` | 9.47:1 | 13.19:1 | 9.81:1 |
| Titty Tuesdays | `#fde68a` | `#2f2c23` | 11.20:1 | 12.69:1 | 9.44:1 |
| Carousel Studio | `#d4d4d8` | `#2a2a2e` | 9.67:1 | 13.03:1 | 9.68:1 |

Carousel Studio's lit fill applies only while it is working — a pack has
arrived and is rendering. It never returns to `#0e0e12`: its floor is
`#1c1c20` at rest and its working light never goes out. Its working light
brightens to `#c9c9cf` while working.

**Halo**, for the ambient state only: an ellipse behind the room, rx and ry at
0.72 of the room's width and height, filled from one radial gradient whose
stops are `currentColor` at .55, .16 and 0, with `color` set to the room's hue
and the group at `opacity: .34`.

**Door spill**, both states: a quadrilateral of the hue at 12% laid over the
corridor at the door. For a top-rank door spanning a→b at y 454: (a,454)
(b,454) (b+22,524) (a-22,524). Mirrored for bottom-rank doors. This is the one
place light crosses a threshold, and it is what makes "lit" read as a light
rather than as a selected state.

**Greyscale.** With hue removed the three states remain distinct: dark is the
darkest floor with one thin partition; lit is a 3–5× brighter floor with a
heavy bright contour plus a halo or a second contour; the workshop is a mid
floor carrying the only disc on the plan.

### 5.2 The door notes

Every session writes a record, so every closed room hangs a note. Both marks
share one silhouette — a 30 × 20 tag, r 3 — because both are the same kind of
made thing.

| Mark | Meaning | Spec |
| --- | --- | --- |
| Sent | something left the building | tag filled with the room's hue, no stroke; 1.4 stem in the hue at .8 |
| Quiet close | met, decided nothing was needed | tag filled `#0e0e12`, stroked 1.75 in the room's hue, plus one 1.5 hue rule across the middle (x+6 → x+24 at y+10); same stem |
| Missed | the slot's hour passed with no record | no tag. An empty clip: `M x+12 y H x V y+14 H x+12`, 1.6 `#94949c` |

Positions, in the corridor at the room's own door, stacking east at 38-unit
intervals for a room with more than one sitting:

| Room | Anchor x | Tag y | Stem |
| --- | --- | ---: | --- |
| Board HQ | 508, 546, 584 | 458 | 454 → 458 |
| DNESKAi | 733, 771 | 458 | 454 → 458 |
| MMA Files | 998, 1036, 1074 | 458 | 454 → 458 |
| FightAIQ | 1017 (inside MMA Files) | 206 | horizontal, 1047 → 1059 at y 216 |
| marketingShark | 478 | 500 | 524 → 520 |
| GoVIRAL | 693 | 500 | 524 → 520 |
| Titty Tuesdays | 903 | 500 | 524 → 520 |

Tags are drawn at anchor − 15. Carousel Studio hangs no note: it holds no
session and has nothing to record.

Contrast, as graphics against the corridor's `#121216`: `#ff5a00` 5.97:1,
`#fe45e2` 6.38:1, `#f7a8ea` 10.45:1, `#fecaca` 13.75:1, `#bbf7d0` 15.42:1,
`#a5d8f3` 12.21:1, `#fde68a` 15.01:1, `#94949c` 6.21:1.

The empty clip is `#94949c` rather than `#3f3f46` or `#52525b` deliberately:
those read 1.79:1 and 2.42:1 on the corridor and would make the difference
between "missed" and "not yet" invisible to some readers. The clip carries
information, so it clears 3:1.

**Greyscale.** Filled body, outlined body with a bar, and an open bracket with
no body are three different silhouettes. Hue removal costs nothing.

### 5.3 The two states that hang nothing yet

| State | Drawing |
| --- | --- |
| scheduled | nothing at the jamb. The hour has not come; an empty clip would be a lie about the day. |
| late | the clip appears, plus a waiting band: an arc around the clip, `#94949c` 1.5, sweeping clockwise from 0° and widening as the five-hour grace elapses. At the end of grace it stops and the state becomes missed. |

This is the same grace glyph the replay uses (§6.3), so a reader learns it
once.

### 5.4 What depth 1 shows, and what it withholds

On screen: eight rooms with labels, one spine, seven door openings, the roller
door, the dock and its apron, three external edges with three labelled
addresses, the pickup window, two dashed data lines, the current hour's room
lit, and the notes hanging from every door whose hour has already passed.

Not on screen: any number at all except the Prague clock in the header. No
hours, no counts, no envelopes, no statuses in words, no money, no metrics.
Every figure in the system lives behind a door in depth 3.

Depth 1 answers the question on its own. Every door opens onto one corridor;
the corridor runs east into the roller door and the dock; the dock has two
labelled exits and one package on its bench; two rooms never send anything that
way and the drawing shows why — the records room's only door leads into the
desk that uses it, and the storefront's line begins and ends outside the wall.

### 5.5 Hover and focus

No tooltip, no readout, no hover text of any kind. Hover and focus change the
drawing and nothing else.

| Element | Hover | Focus |
| --- | --- | --- |
| Any room | outline steps to 2.5 in the hue (dark rooms: `#d4d4d8`), label to `#f4f4f5` | as hover, plus the focus ring below |
| The dock | apron lines lift to `#2a2a30`, kerb to `#d4d4d8` | as hover, plus the ring |
| A door note | the note scales to 1.12 about its own centre | as hover, plus the ring |
| Openable places (four) | as their room, plus the room's label gains a 1px underline offset 4 | as hover, plus the ring |
| HTML controls | `border-color: #a1a1aa`, `color: #f4f4f5` | the page's global `:focus-visible`: 3px solid `var(--ring)`, offset 3 |

**Where the recorded sentences go.** Decision 6 requires a missed slot's
recorded reason to be reachable, and with the readout gone the only place left
is a native `<title>` on each room's hit target — exactly what
`section-calendar.tsx` already does with the full sentence behind each
truncated cell. One `<title>` per room reading
`<Room> · HH:00 · HH:00 — <recorded sentence>`, one on the dock, and one per
door note carrying its outcome or, for a missed slot, its reason. The browser
draws it; the section draws nothing. Nothing else on the plan gets a title, so
a title anywhere means "there is a recorded sentence here".

**Focus ring for SVG targets**, since `outline` on SVG children is not
dependable: a 2-unit `#09090b` rect inset −5 around the target, then a 3-unit
`var(--bai-accent)` rect inset −8. Ember measures 6.16:1 against a dark room
fill, 4.58:1 against the lightest lit fill and 5.97:1 against the corridor, so
the ring clears 3:1 against every surround it can land on, and the black gap
keeps it legible where a lit room's own hue is closest to it.

Nothing on the plan is a link and nothing changes route. The four openable
places are `<button>`-semantic and reachable in document order: DNESKAi,
Carousel Studio, the loading dock, Titty Tuesdays.

## 6. Depth 2 — the replay

### 6.1 Rules

The replay never starts itself. `PLAY THE DAY` is the only entry, arrival is
not a trigger, and the walk runs 05:00 → 22:00 and loops. Every mark on the
strip is a wake-up, not a promise to spend; nothing on this screen animates a
cost.

### 6.2 The control strip

Left to right, in one row, `gap: 14px`, all controls 30 × 30 with
`border: 1px solid #3f3f46`, `border-radius: 9px`, `background: #101013`,
`color: #d4d4d8` (12.85:1):

- Transport, ❚❚ / ▶.
- Step back ‹, step forward ›, mono 13px. Stepping pauses playback.
- The hour rail, `flex: 1`, 28px tall (44px hit area below 1024px):
  - track: 1px `#26262b` at the vertical centre, decoration;
  - 13 slot marks, 3 × 14, each in its venture hue, at
    `left: calc((hour − 5) / 17 × 100% − 1.5px)`. Minimum contrast on
    `#101012` is `#ff5a00` at 5.97:1;
  - playhead: a 2px `#f4f4f5` full-height line (17.3:1) with a 8px `#f4f4f5`
    square rotated 45° at its head.
- Timestamp stamp: `REPLAY HH:00`, mono 10.5px uppercase .1em `#f4f4f5`,
  `border: 1px solid #3f3f46`, `border-radius: 8px`, padding `6px 10px`,
  preceded by a 7px solid `#d4d4d8` square.
- `NOW`: mono 10.5px uppercase, same button chrome as `PLAY THE DAY`. Returns
  to ambient, hides the strip, restores the plate's mood.

Scrub: click or drag anywhere on the rail seeks to
`5 + round(fraction × 17)`. With the rail focused, ←/→ step an hour, Home
seeks 05:00, End seeks 22:00, Space toggles playback.

Speed: one hour per 700ms, so a full day runs 11.9s. A second speed is not
offered; the step buttons cover close reading and a speed menu is chrome the
section does not need.

### 6.3 What the replay draws

- Rooms light in sequence and hold for their hour. A room that closes hangs
  its note and the note stays for the rest of the run, so the day accumulates
  visibly and the last frame is the same picture depth 1 shows at 22:00.
- GoVIRAL stays dark on six days in seven. Its 13:00 mark keeps its hue on the
  rail and its door shows the empty clip, whose `<title>` states the recorded
  skip.
- A slot that misses its hour holds the waiting band (§5.3) behind its clip,
  widening as the grace runs, then goes quiet. Nothing flashes and nothing
  turns amber.
- Carousel Studio brightens to `#2a2a2e` with its working light at `#c9c9cf`
  on the hours a pack arrives, and returns to `#1c1c20`. It is never dark.

### 6.4 Ambient versus recording

Three simultaneous distinctions, all readable with the copy unread:

| | Now | Replay |
| --- | --- | --- |
| Chrome | none. One clock chip with the pulsing accent dot. | the full strip: transport, rail, playhead, stamp, `NOW`. |
| The lit room's light | a soft halo, breathing `opacity: .30 ↔ .42` over 6s | no halo. A hard 1.5 contour in the hue, offset 10 units outside the room's rect at `opacity: .85`. Nothing breathes. |
| The plate | `OfficeMood` alone — the Prague wash | a flat `#09090b` scrim at `opacity: .42` above the mood layer, `pointer-events: none`. The real sky is switched off. |

Soft light means the building; hard contour means a recording. That difference
survives with the sound off, the copy unread and the strip out of frame.

## 7. Depth 3 — the panels

Four openable places, one shared chrome, each panel one screenful.

### 7.1 Shared chrome

| Part | Spec |
| --- | --- |
| Frame | `position: absolute; inset: 14px` over the plan box; `border: 1px solid #3f3f46`; `border-radius: 12px`; `background: rgba(11,11,13,.96)`; `backdrop-filter: blur(18px)`; `box-shadow: 0 40px 120px rgba(0,0,0,.7)` |
| Header | padding `16px 22px`, `border-bottom: 1px solid #26262b` |
| Eyebrow | mono 10.5px uppercase .14em `#94949c` (6.53:1 on `#0b0b0d`), reading `<PLACE> · DEPTH 3` |
| Title | 19px/600, `letter-spacing: -.02em`, `#f4f4f5` (17.9:1), `tabindex="-1"`, `outline: none` |
| Worked-example chip | `border: 1px solid #3f3f46` with `border-left: 3px solid #fe45e2`, `border-radius: 8px`, padding `6px 10px`, mono 10.5px `#d4d4d8` (13.3:1) |
| Close | 30 × 30 `×`, the standard button chrome; `aria-label="Close panel"` |
| Body | `flex: 1; min-height: 0`, laid out as a grid with `gap: 1px` on a `#1e1e22` background, so every column division is a hairline and matches the page's panel-grid idiom |
| Footer | padding `12px 22px`, `border-top: 1px solid #26262b`, mono 10.5px uppercase .12em `#94949c`; any link `#d4d4d8` → `#f4f4f5` on hover |

The frame leaves 14 units of the plan visible on every side, and the room the
panel belongs to keeps its lit outline in that margin, so the panel reads as
the room opened rather than as a new screen. Opening moves focus to the title;
Escape and the close control both dismiss and return focus to the opener.

Panel body type: section headings mono 10.5px uppercase .14em `#94949c`; body
12.5px/1.45 `#d4d4d8`; captions mono 10.5px/1.5 .06em `#94949c`; figures
19px/600 tabular `#f4f4f5`. Nothing in a panel goes below 10.5px.

### 7.2 The DNESKAi office

Three columns, `5fr 4fr 3fr`.

**The morning line.** 32 source ticks, 3 × 10, grouped and labelled by adapter
kind (rss 21, html 4, arxiv 2, bluesky 1, github 1, hn 1, spaceflight 1,
stackexchange 1), converging into a digest bar. Below it a four-rung ladder,
each rung a right-aligned figure with a mono label: sources answering → 80
candidates → 50 to the editor → 1 chosen. Two closed gates cross the line
before any of it: a 2.5px bar in `#fe45e2` with a mono label `no_edition` and
the threshold beneath (fewer than 10 sources, fewer than 10 candidates). A
gate is drawn as a closed leaf across the lane — the one place in the whole
section a door leaf appears at all, which is what makes a closed gate read as
closed — never as a red stop and never as a broken line. Caption: *a closed
gate is a finished day*.

**The desk.** Five nodes on a ring — curate, write, draft check, editor
review, final check — with two return arcs drawn as returns and labelled
`return 1`, `return 2`. The draft-check node carries a 2px `#fe45e2` ring and
the panel's one italic beat: *it catches the violation before the review is
paid for*. Beneath, the cost bar: a 6px `#1e1e22` track filling `#fe45e2`
toward a mono cap label `$0.50 edition allowance`, with a solid tick at each
paid stage and a hollow tick at each free one. The bar moves only on the paid
stages.

**The picture.** Three rungs stacked, each a 1px `#26262b` card on `#0e0e12`:
curated scene, licensed search (four provider chips), deterministic plate. The
plate rung is drawn as a finished plate — a solid deterministic pattern block
with its own caption *a delivered state* — never as an empty frame and never
with an apology.

### 7.3 The workshop

Two rows.

**The fold.** Left, the article as 22 stacked 3px `#26262b` hairlines with a
mono label `1,100 Czech words`. Right, the summary card: kicker, headline,
standfirst, three to eight passage slots in the article's own order, sources,
hero credit. The fold is the animation (§8). Beneath, the determinism device:
two identical render slips side by side with their 12-character hashes and a
single `=` between them, captioned *same input, same bytes*. Two slips of the
same shape and one equals sign is the whole claim; there is nothing else to
show and nothing else is shown.

**The hook rack.** A 7 × 7 rack of 49 cards, each 22px tall, 1px `#26262b`:

| Card state | Spec |
| --- | --- |
| Eligible | `border: 1px` in the hue, fill `#0e0e12` |
| Greyed by gate | fill `#101013`, `border: 1px #1e1e22`, label `#94949c` with a 1px strike |
| Removed by cooldown | `border: 1px dashed #26262b`, label `#94949c`, no strike |
| Drawn | fill the hue at 14%, `border: 2px` in the hue, plus the seal |

The seal is a 14px disc in the hue carrying the eligible-set hash in mono
9.5px beside it — the one place 9.5px is allowed, matching the page's existing
mono floor. Two arrows beside it move the draw to another card inside the
sealed hand. A card from outside the hand splits the disc and the package
stops: one static state, captioned *outside the hand, the seal breaks and
nothing ships*.

A two-chip segmented control switches to the empty rack: all 49 slots absent,
one row reading `no library written`, then `logged no-hook fallback`, then the
template's own headline rendering normally. Ordinary, not broken — the empty
rack is styled exactly like the full one, with no error surface anywhere.

### 7.4 The courier

The widest panel and the reason the section exists: seven equal columns,
`gap: 1px` on `#1e1e22`, each column a beat with a mono `01`–`07` in
`#fe45e2`, a 12.5px `#d4d4d8` line and a mono 10.5px `#94949c` caption.

| # | Beat | Caption |
| --- | --- | --- |
| 01 | A key is cut for one door | token scoped to one repository |
| 02 | The house does its own shelving | the target repo's consumer script runs inside |
| 03 | The checklist at the shelf | four files pass · a stray file bounces |
| 04 | Three checklists, side by side | a dataset cannot reach the article shelf |
| 05 | Commit, push, the site rebuilds | delivery bot · one rebase retry |
| 06 | Round the front, ticket against the page | two halves of the content hash match |
| 07 | Seven ticks, receipt filed | `[package:<hash12>]` |

Three beats carry a drawing rather than a line of type:

- **03** is a literal filter: a funnel with four file chips passing through
  and a fifth striking the rim and leaving at 24°. The bounce is the whole
  point and it is drawn, not written.
- **04** is three checklists side by side — edition, no-edition, dataset —
  each a column of allowed shelves. The dataset column's lane physically
  terminates at a wall glyph before the article shelf. Nothing is greyed out;
  the route is absent.
- **06** is two torn ticket halves meeting, their edges interlocking exactly.
  That is what carries the content-hash check, the same way the checklist
  carries the allowlist: a comparison of two strings drawn as two objects that
  either fit or do not.

### 7.5 The window and the signal

Two columns plus a footer band. This panel replaces "the two odd edges"
following the owner amendment.

**The window.** The sill drawn large, with the storefront outside pulling a
sanitized feed through it: the same two legs as the plan, at panel scale,
annotated with what crosses (*sanitized catalog feed*) and what cannot (*no
price, no stock, no purchase path*). A toggle shows the shuttered state:
shutter hatch, the return leg gone, and `concept mode` with
`commerceMode: precommerce` beneath. The annotation states the asymmetry in
one line: *an unreachable engine can close the window and can never open it*.

**The signal.** GoVIRAL's line at panel scale, with two termini inside the
magazine rooms and, at its other end, a crossed-out door glyph — no address of
its own. What crosses is labelled *at most one trend, as a tiebreaker between
equally sourced candidates*, and what cannot is labelled *never a substitute
for sourcing*.

**Footer band.** The plan's remaining edges as a single line: two courier
exits and one window, each with its address, so a reader who opens this panel
sees the whole edge set in one place.

## 8. The worked example

One real published edition threads the DNESKAi, workshop and courier panels.
The thread is one device used identically in all three, so continuity needs no
explanation:

| Panel | Where it sits | What it shows |
| --- | --- | --- |
| DNESKAi | header, right, the worked-example chip | `EDITION · <date>` and the headline in the panel's title area, on the desk's last node |
| Workshop | header, right, same chip, same position | the same date; the summary card is filled with this edition's kicker, headline, standfirst and passage count |
| Courier | header, right, same chip, same position | the same date; beat 07 carries its `[package:<hash12>]` and the footer carries the live link |

The chip is the same 3px `#fe45e2` left border in all three — DNESKAi's own
hue, because it is DNESKAi's edition — at the same pixel position in the same
header slot. The final link, `Read the published article ›`, appears once, in
the courier panel's footer, right-aligned, `#d4d4d8` → `#f4f4f5`. If any part
of the example cannot be resolved, the chip renders `NO EDITION ON RECORD YET`
in mono 10.5px `#94949c` with no left border and the link is absent — never a
placeholder date.

## 9. Motion table

Durations sit inside the page's existing feel: the wallboard counts up over
900ms and jumps settle in about a second. E1 = `cubic-bezier(.22,.61,.36,1)`,
E2 = `cubic-bezier(.2,.8,.3,1.2)`.

| # | What | Trigger | Duration | Delay | Easing |
| --- | --- | --- | --- | --- | --- |
| 1 | Outer envelope draws in (`stroke-dashoffset`) | `active` becomes true, once | 620ms | 0 | E1 |
| 2 | Interior partitions draw in | same | 380ms | 180ms | E1 |
| 3 | Room fills fade 0 → 1 | same | 300ms | 420ms | linear |
| 4 | Furniture fades in | same | 300ms | 480ms | linear |
| 5 | Room labels fade and rise 4 units, staggered 40ms west to east | same | 260ms | 560ms | E1 |
| 6 | Off-plan addresses and edge arrows draw out from the wall | same | 420ms | 720ms | E1 |
| 7 | Door notes scale .8 → 1 about their own centre, staggered 60ms | same | 220ms | 900ms | E2 |
| 8 | Lit room fill, outline and spill fade in | same | 700ms | 1000ms | linear |
| 9 | Halo fades in | same | 700ms | 1000ms | linear |
| 10 | Halo breathe, opacity .30 ↔ .42 | ambient state, infinite | 6s | 0 | ease-in-out |
| 11 | Working light, opacity .55 ↔ .70 | always, infinite | 4.2s | 0 | ease-in-out |
| 12 | Hour change while ambient: old lit room crossfades to new | the Prague hour changes | 900ms | 0 | ease |
| 13 | Enter replay: scrim to .42, halo out, contour in | `PLAY THE DAY` | 420ms | 0 | ease |
| 14 | Playhead travels one hour | replay running | 700ms | 0 | linear |
| 15 | Replay room light on | each hour | 260ms | 0 | ease-out |
| 16 | Replay room light off | each hour end | 420ms | 0 | ease-in |
| 17 | Replay note hangs | each close | 220ms | 0 | E2 |
| 18 | Waiting band widens 0 → 14 units | a late slot | the grace | 0 | linear |
| 19 | Leave replay: scrim out, contour out, halo in | `NOW` | 420ms | 0 | ease |
| 20 | Panel opens: scale .94 → 1, opacity 0 → 1, `transform-origin` at the opener's centre | selection | 420ms | 0 | E1 |
| 21 | Panel closes | Escape or close | 260ms | 0 | ease-in |
| 22 | Panel body content fades and rises 6px, staggered 50ms per column | panel opened | 300ms | 180ms | E1 |
| 23 | The fold: 22 hairlines collapse into the summary card | workshop panel opened | 900ms | 300ms | E1 |
| 24 | Hook rack: greying sweeps west to east across the 49 cards | workshop panel opened | 760ms | 500ms | linear |
| 25 | Courier beats advance | courier panel opened, auto | 520ms in, 260ms out, 2.4s dwell | 0 | E1 |
| 26 | Filter bounce (beat 03): stray file leaves at 24° | beat 03 shown | 480ms | 0 | E2 |
| 27 | Hover outline and label step-up | hover / focus | 140ms | 0 | ease-out |
| 28 | Note hover scale to 1.12 | hover / focus | 140ms | 0 | E2 |

Nothing on any of these paths animates a cost except row 22's cost bar inside
the DNESKAi panel, which advances only on the paid stages: curation and the
write/review loop. Summaries, hook assignment, question selection, rendering,
every gate and every verification move nothing.

Transforms animate without permanent promotion: no `will-change` on the plan
SVG or on any group inside it.

## 10. Reduced motion

Every row above has a resting end state, and with
`prefers-reduced-motion: reduce` the section renders that end state
immediately. Nothing is hidden, nothing waits for a frame, nothing loops.

| Row | Reduced-motion rendering |
| --- | --- |
| 1–9 | The plan renders complete on first paint: envelope, partitions, fills, furniture, labels, addresses, arrows, notes, the current hour's room lit with its outline, fill and spill, and its halo at a static `opacity: .34`. |
| 10, 11 | Static: halo at .34, working light at .62. |
| 12 | The lit room swaps with no crossfade. |
| 13, 19 | Mode changes apply instantly; the scrim, halo and contour switch with no transition. |
| 14–17 | The replay is replaced by an hour strip. Thirteen buttons, 44px minimum hit, one per slot, each carrying its hour in mono 11px and a 3 × 14 tick in its venture hue. Pressing one paints the plan at that hour, including every note hung up to it. The strip is a row of buttons with no playhead, no transport and no autoplay; the stamp still reads `REPLAY HH:00` and `NOW` still returns to ambient. Mark the strip `data-horizontal-scroll` if it scrolls. |
| 18 | The waiting band renders at its final width for a late slot, with the elapsed grace stated in that note's `<title>`. |
| 20–22 | Panels appear and disappear with no transform and no stagger; content is present at full opacity. |
| 23 | The fold renders folded: the 22 hairlines and the filled summary card both drawn, with a mono caption `1,100 words → one summary`. |
| 24 | The rack renders in its final state — eligible, greyed, cooled and drawn cards all as they end up, seal included. |
| 25, 26 | The courier becomes a numbered static strip: the seven beats laid out at once as `01`–`07`, every drawing at its end state, the stray file already outside the funnel, the two ticket halves already met, all seven ticks set. |
| 27, 28 | Hover and focus states apply with no transition. Focus remains visible. |

## 11. Below 1024px

The page is an ordinary document; nothing is intercepted, the section is
auto-height, and there is no horizontal page scroll.

| Part | Below 1024px |
| --- | --- |
| Board | full width minus the section's 16px gutters, same border, radius and background |
| Plan | the same SVG at `width: 100%; height: auto`, viewBox unchanged, as a static picture. At 360px it renders 192px tall, where one unit is 0.20px — no type inside the drawing can clear the 9.5px floor at any size the rooms can hold. So below 1024px every in-plan and off-plan `<text>` is hidden and the labels move out of the drawing (next row). The walls, doors, furniture, apron, data lines, exit arrows, sill and the current hour's lit room all still draw. |
| The key | replaces the plan's labels. Each room and the dock carry a 44-unit mono numeral, 600, `#f4f4f5`, centred in the room — 9.0px at 360px, and a numeral is the one glyph that survives there. Beneath the plan, an HTML key lists the numbered places in plan order: numeral (mono 11px `#94949c`), name (13px `#f4f4f5`), hours (mono 10.5px `#94949c`), and today's note as a 12 × 8 swatch drawn exactly like the note on the plan. The two courier addresses and the storefront are rows 9–11 with their edge type named in words. |
| Lit room | the current hour, static. No halo breathe. |
| Replay | absent. In its place, the hour strip from §10 — 13 buttons in a `data-horizontal-scroll` row, 44px hit targets, mono 11px. |
| Panels | not overlays. Four stacked expandable blocks beneath the plan, in the plan's own order — DNESKAi, the workshop, the courier, the window and the signal — each with the panel header vocabulary as its summary row (eyebrow, title, a chevron), expanding downward in flow. |
| Panel bodies | every multi-column body becomes one column: the DNESKAi panel's three columns stack, the courier's seven beats become the numbered strip, the hook rack becomes a 4 × 13 grid, the workshop's two rows stay two rows. |
| Legend and readout | neither exists at any width. The key row above carries every name, hour and note, and it is the only place they appear below 1024px. |

## 12. Colour and contrast ledger

Every value used, and where it comes from.

| Value | Source | Used for |
| --- | --- | --- |
| `#09090b` | page | focus-ring gap, replay scrim |
| `#0b0b0d` | page | board paper (at .9), panel body |
| `#0e0e12` | page | room floor, quiet-close tag fill, card fills |
| `#101013` | page family | control fills |
| `#101012` | derived: `rgba(11,11,13,.9)` over the plate's brightest pixel | the surface every board-level contrast figure is measured against |
| `#121216` | derived: page surface family | corridor floor |
| `#0c0c0f`, `#1d1d23` | derived from `#0b0b0d` / `#1e1e22` | dock apron base and hatch |
| `#1c1c20` | derived: `#d4d4d8` at 7% over `#0e0e12` | workshop floor at rest |
| `#1e1e22`, `#26262b` | page | hairlines, panel grid gaps, rail track |
| `#3f3f46` | page | control borders, panel frame |
| `#6c6c73` | derived: `#94949c` at 70% over `#0e0e12` | furniture at rest — 3.70:1 |
| `#818185` | derived: `#d4d4d8` at 55% over `#1c1c20` | working light at rest |
| `#9d9da1` | derived: `#d4d4d8` at 70% over `#1c1c20` | machine glyphs |
| `#c9c9cf` | derived: `#d4d4d8` at 85% over `#1c1c20` | working light while working |
| `#94949c` | page | partitions, doors, mono captions, empty clip, waiting band |
| `#a1a1aa` | page | outer envelope, dark-room labels, package outline |
| `#d4d4d8` | page + `carousel-studio` hue | controls, addresses, body copy, exit arrows |
| `#f4f4f5` | page | headings, playhead, lit-room labels |
| `#ff5a00` | `var(--bai-accent)`, `company` | the header's pulse dot, the focus ring, and Board HQ's room hue. Nowhere else. |
| The seven venture hues | `PROJECT_COLOR` | room outlines, lit fills, door notes, spills, rail ticks, panel accents |
| The eight composited lit fills | derived, tabulated in §5.1 | lit room floors |

Ember appears in exactly three places: the accent dot in the header, the focus
ring, and Board HQ, whose key is `company`. No venture room borrows it and no
venture panel uses it as an accent.

## 13. Acceptance self-check

- Every colour is a page colour, a `PROJECT_COLOR` hue, or a composited value
  derived and stated in §12.
- Every text/background pair states its ratio; the lowest is `#94949c` on
  `#1c1c20` at 4.96:1, and every other pair clears 5:1. Every informational
  graphic clears 3:1, including the empty note clip at 6.21:1, the furniture
  stroke at 3.70:1 and the focus ring at 4.58:1 in its worst surround.
- Greyscale, and without a key. There is no legend, so every state carries
  itself. The three light states separate by floor value, contour weight and
  the workshop's unique disc. The two notes and the missed state separate by
  silhouette: filled body, outlined body with a bar, open bracket with no
  body.
- The replay is identifiable as a recording with the sound off and the copy
  unread: chrome present, halo replaced by a hard offset contour, the plate's
  Prague wash switched off behind a flat scrim.
- Nothing animates a cost on a free path. The only moving cost is the DNESKAi
  panel's $0.50 bar, which advances on curation and the write/review loop
  only.
- The reduced-motion appendix covers all 28 motion rows, including the hour
  strip and the numbered courier strip.
- A reader who only sees depth 1 can answer where a decision goes when it
  leaves a room: one door per room onto one spine, the spine east into the
  roller door and the dock, two labelled exits from the dock, and two visible
  exceptions — the records room whose only door leads into the desk that uses
  it, and the window whose line begins and ends outside the wall.

## 14. Where this spec is deliberately silent

- Data resolution, types, file layout, tests and the `SECTIONS` / `NAV` index
  shift. Those are the build prompt's.
- The exact recorded sentences in the `<title>`s and the notes; they come from
  `readableSlotReason()` and the calendar feed, and the spec fixes only where
  they sit and how they are typed.
- The worked example's date, headline and URL, which resolve from committed
  state.
