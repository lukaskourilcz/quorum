# Task: extend Carousel Studio with the Hook Brain (quorum monorepo)

You are working in `lukaskourilcz/quorum` (BoardlessAI). The Carousel Studio venture
already exists in this monorepo: a deterministic, $0, template-based carousel engine with
hash-stable renders, /admin previews per brand, design agents (EASEL/MOTIF), and social
packs that reference a `template_id`. **Do not re-specify or restructure the studio.**
This task extends it with one new capability: the studio becomes the assignment brain for
hook copy across all social content.

A "hook" is a one-line piece of copy on slide 1 whose job is to earn the next interaction.
Hooks are gated: each declares `truthRequires` predicates, and it may only render on
content whose metadata makes those predicates true. Gates license claims — that is the
entire honesty model.

## Files I've dropped in the repo (unstaged)

- `hooks/quiz.hooks.json` — 49 quiz hooks (devShark/geoShark), ships today
- `hooks/quiz.research.json` — parallel array, same ids/order: mechanism, citation +
  confidence tag, prediction, `falsifiedIf`, cooldown rationale, risk, gate justification
- `hooks/quiz.tier-b.json` — 9 hooks blocked on predicates that don't exist yet (do NOT
  wire into anything)
- `docs/hooks/` — seven .md files: README, 01-hook-psychology, 02-hook-craft-rules,
  03-metrics-and-testing, 04-schema-and-gates, 05-surfaces, 06-hook-brain

**Read all seven docs before writing code**, especially `06-hook-brain.md` (this task's
spec) and `04-schema-and-gates.md` (predicate semantics). Apply them; don't summarise
them back to me.

## Work items

### 1. Hook module beside the studio engine
Place libraries + docs canonically next to the Carousel Studio engine, following the
monorepo's existing conventions (locate the studio package first; mirror its layout).
Implement:
- **Schema types**: Hook, Library, Predicate as a discriminated union; `:N` / `:X`
  suffixes parsed at load time.
- **Per-surface predicate vocabularies**: `quiz` implemented fully (`always`,
  `optionsAtLeast:N`, `difficultyAtLeast:N`, `categoryIn:X`, `questionStartsWith:X`,
  `hasCode`); `news` and `mma` vocabularies typed from `docs/hooks/05-surfaces.md` with
  **empty libraries as a valid state**. A predicate outside a surface's vocabulary is a
  load-time error naming the hook id and surface.
- `questionStartsWith` must be language-aware (`{ en: "Why", cs: "Proč" }`) or explicitly
  bound to canonical EN text — choose, implement, and say why in the PR body.

### 2. Lint, wired into quorum CI
`lint:hooks` runs over every library and fails on: EN > 58 chars, CS > 66, CS > 1.25 × its
EN sibling; more than 2 byte-identical dev/geo pairs per library (quiz has exactly 2 —
`streak-cold`, `streak-breaker` — intentional); duplicate ids; library/research id
mismatches or missing research fields; any archetype over 20% of its library; any
predicate outside its surface vocabulary; `{topic}` in a `cs` string outside a
declension-safe slot (sentence subject or immediately after a colon) —
`everyday-blindspot`'s `dev.cs` is a known allow-listed exception, keep the rule strict;
fewer than 5 hooks on any gate a selector relies on. **Warns** (not fails) on variants
whose gate makes them effectively unreachable in their vertical (the `geo` variants behind
`hasCode`). Run it; it passes on the shipped files.

### 3. Pack-build assignment
Wire hook assignment into the social-pack build path:
1. Evaluate the eligible set from the item payload's metadata against the surface
   vocabulary.
2. Filter by **channel cooldown**: per (venture-channel × hook), rule
   `max(2 × cooldownDays, 14)` days, state stored alongside the studio's existing state
   files with the repo's usual conventions.
3. Filter by **archetype variety**: never the same archetype as that channel's previous
   post.
4. Propose one hook by **seeded deterministic pick** — seed derived from pack identity
   (channel + date + item id). Never `Math.random()`: the studio's hash-stable render
   guarantee must hold for hook text exactly as it does for pixels.
5. Record the assignment in the pack under a new bounded contract `hook-assignment/1`:
   hookId, surface, vertical, language, eligible-set hash, cooldown snapshot.
6. Render the hook string into the template's slide-1 text slot.
7. **Fallback**: empty eligible set or unwritten library → the template's default headline
   renders, logged as `no-hook`. A missing hook never blocks a pack. This is the standing
   behavior for DNESKAi and MMA Files until their libraries are authored.

### 4. Agent override, bounded
Existing marketing meetings may swap the proposed hook — **only for another member of the
recorded eligible set**. Enforce in pack validation: the assigned hookId must hash-verify
against the eligible-set snapshot. No new meetings, no new agents, no new spend:
assignment is deterministic $0 code; agent judgment is an optional swap on top.

### 5. /admin
Extend the existing per-brand template previews so each fixture renders slide 1 with an
assigned hook (add fixture payloads carrying quiz metadata). Add a small Hook Brain panel:
per-surface library counts, channel-cooldown occupancy, and the last 20 assignments with
eligible-set sizes and any `no-hook` fallbacks.

### 6. Delivery to the quiz apps
New bounded contract `hook-library/1` delivering `quiz.hooks.json` plus the conformance
vectors (below) to `react-express-app` through the existing GitHub App channel (Contents-
only, per-repo allowlist, hash + receipt, same as article deliveries). Re-delivery happens
only after `lint:hooks` passes. The app implements its own per-user selector — that is its
concern, not this repo's.

### 7. Conformance vectors
Generate `hooks.predicates.spec.json`: fixtures of (item metadata, library slice) →
expected eligible ids, produced by this repo's evaluator, covering every predicate
including the language-aware case and boundary values (`difficultyAtLeast:4` at 3/4/5,
`optionsAtLeast:4` at 3/4/6). Studio CI asserts the evaluator matches the vectors; the
vectors ship with every `hook-library/1` delivery so app CI can assert the same. Two
implementations, one spec, one fixture set.

### 8. Issues, not implementations
- One issue per Tier B predicate, specs from `docs/hooks/04-schema-and-gates.md`, ordered:
  `missedTopicBefore` (unlocks `rematch` — highest expected lift, smallest build) →
  `statsReady` + accuracy predicates + `{missRate}` → `streakAtLeast` + `{streak}` →
  `timerEnabled` (note: `real-timer` copy hardcodes ten seconds; if durations vary, add
  `{timerSeconds}`) → `optionsExactly`.
- Two authoring issues: **`news.hooks.json` (DNESKAi)** and **`mma.hooks.json` (MMA
  Files)**, each linking `docs/hooks/05-surfaces.md`, stating that step one is enumerating
  the metadata those items actually carry at render time, and that the extra honesty rules
  in that doc (no teasing beyond the item; **no betting claims in MMA hooks, ever**) are
  hard constraints.

### 9. Registration + KPI
Register the docs as canonical in the ecosystem guide; add a CONTRIBUTING note that A/B
learnings get written into `docs/hooks/03-metrics-and-testing.md`'s results log **in this
repo**, never in a venture repo. Append one line to the Carousel Studio KPI seed: 100% of
posted venture carousels carry either a gate-valid hook assignment or a logged `no-hook`
fallback; determinism test stays green.

## Constraints

- Do not rewrite any hook copy — the strings are final and length-budgeted; if a lint rule
  fails on a shipped string, report it, don't "fix" the line.
- Do not implement Tier B predicates or author news/MMA hooks in this pass.
- No new dependencies; everything here is deterministic $0 within the operating cap.
- Social posting remains draft-locked behind the existing kill switch — this is wiring, so
  everything runs through the engine from day one, not a go-live.

## Deliverable

A PR with: the hook module + vocabularies, lint green in CI, pack-build assignment with
seeded determinism and `hook-assignment/1`, cooldown + variety state, bounded agent
override, /admin extensions, `hook-library/1` delivery with conformance vectors, the seven
issues, docs registered, KPI line added. Visible test run: lint output plus one fixture
pack per brand showing the assignment (and the `no-hook` fallback for DNESKAi/MMA).
`NEEDS_YOUR_HELP_NOW.md` only for real blockers; its absence means all-clear. In the PR
body: the `questionStartsWith` decision and anything in the docs that contradicts what you
found in the codebase.
