# Design Lab becomes the working social design tool

Date: 2026-08-08

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `design-lab-2026-08-08`

Source: Owner instruction in the 2026-08-08 Design Lab review session

## Decision

The Design Lab (venture `carousel-studio`) becomes the company's working
design tool for social content in three formats — Instagram posts and
carousels, Instagram stories, Threads posts — with one render engine, one
template language, and two users: the pipeline, which derives a complete
design recipe and copy pack for every delivered article at delivery time,
and the owner, who can open any article in the Lab, switch families,
formats and type, edit slide text within the engine's own limits, save
presets, and download every slide with its captions.

The render engine stays deterministic and free: no model call at or below
the renderer (decision D11 stands), typography ships as committed
openly-licensed font files with machine-independent rasterization, and the
five current deck styles grow into a library of genuinely distinct template
families with real per-slide variants. The recorded recipe — family,
variant, treatment, type scale, phase — is seeded from the article's own
identity and the venture's recent receipts, so decks vary across the week
without a clock, a die, or a person in the loop, and replay byte-identical.

Social copy — Instagram caption, hashtags, Threads text, story line — is
written by the same desk call that writes the article, the way the
carousel cover line already is. Code, not the model, appends the
photograph's licence credit to every caption; a caption without its credit
is unbuildable. No new paid call site is created.

Recording recipes and copy at delivery is inventory, not composition:
it requires no enabled channel and posts nothing. Composition for
channels, the triple-lock, the kill switch, channel enablement and
`social-2026-08a`'s ten-article threshold are untouched by this decision;
the queue's A/B pairs must, however, become genuinely different renders or
collapse to one item — shipping two filenames of one byte stream ends.

In the same instruction the owner directed six corrections to the public
office site, carried as DL-14 through DL-19 on this program's branch and
gates: calendar tooltips clearing the header row, the meetings room's type
sizes and the removal of its channels label, the facilities plan centred
with rooms opening as accessible dialogs instead of a zoom and the loading
dock rewritten in plain words, the roster listing every agent with its
status, the footer links opening heavily simplified content in dialogs
while feeds stay direct, and the navigation losing the layout space it
reserves for an invisible dot.

The venture id `carousel-studio` is permanent; `design-lab` becomes a URL
alias. The article-image program merged first (`f9a4ccd`), as this program
requires. The implementation contract is
`docs/DESIGN-LAB-OPUS-BUILD-PROMPT.md`, deleted when executed, and the work
is tracked as GitHub issues `DL-01` through `DL-20`, one per task, worked
in title order. Where a task below, that document and an issue disagree,
this decision wins, then the document, then — being newest — the issue.

## Tasks

- [x] DL-01 — Persistence tells the truth: create path, visible save states (contract §DL-01)
- [x] DL-02 — Deck identity is venture+slug+date everywhere (contract §DL-02)
- [x] DL-03 — Schema v2 capabilities, additive, fully validated (contract §DL-03)
- [x] DL-04 — Committed fonts, real metrics, machine-independent PNG hashes (contract §DL-04)
- [x] DL-05 — The family library replaces five wallpapers; CSS gallery retired (contract §DL-05)
- [x] DL-06 — Stories, squares and Threads covers; no render-and-discard (contract §DL-06)
- [x] DL-07 — Recipe variety engine with receipt-based anti-repeat (contract §DL-07)
- [x] DL-08 — Copy pack in the existing desk calls; credit appended by code (contract §DL-08)
- [x] DL-09 — Recipes and copy recorded at delivery as inventory (contract §DL-09)
- [x] DL-10 — One studio workspace: rail, canvas, controls, output (contract §DL-10)
- [x] DL-11 — Export: per-slide PNG and whole-deck ZIP with captions (contract §DL-11)
- [x] DL-12 — Presets with owner lifecycle; engine draws from live pool (contract §DL-12)
- [x] DL-13 — design-lab alias, stale-truth sweep, owner items (contract §DL-13)
- [x] DL-14 — Calendar tooltips clear the header row (contract §DL-14)
- [x] DL-15 — Meetings room type sizes; channels label removed (contract §DL-15)
- [x] DL-16 — Rooms open as dialogs, zoom removed, dock in plain words (contract §DL-16)
- [x] DL-17 — The roster lists every agent with status (contract §DL-17)
- [ ] DL-18 — Footer links open simplified content in dialogs (contract §DL-18)
- [ ] DL-19 — Navigation hover reserves no space for an invisible dot (contract §DL-19)
- [ ] DL-20 — Full gates, self-review, merge, contract retired (contract §DL-20)

## Approval reference

`owner-request:2026-08-08-design-lab`
