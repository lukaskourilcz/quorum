# The Hook Brain — the Design Lab as assignment authority

The Design Lab is the single brain behind all social content: it renders the images,
renders the texts, and **assigns the hooks** from the central library. This doc defines how
that works and where the seams are.

## Where things live

Everything canonical sits in the quorum monorepo: libraries and their adjacent research JSON in
`studio/hooks/`, docs here, and the lint/evaluator in `studio/src/hooks/`. Consumer apps do not
orchestrate, receive or own hook copy.

## Active consumption mode

### Social packs (studio, pack-build time)
When a social pack is built for any venture:

1. The item payload arrives with its metadata (for quiz content: option count, difficulty,
   category, hasCode, question text; for news/MMA: their own vocabularies per
   `05-surfaces.md`).
2. The evaluator computes the **eligible set**: hooks whose `truthRequires` all hold, using
   that surface's declared predicate vocabulary. A predicate outside the vocabulary is a
   load-time error, not a silent skip.
3. Channel cooldowns filter the set (see scopes below), then archetype variety
   (no same archetype as the channel's previous post).
4. A **seeded deterministic pick** proposes one hook — seed derived from pack identity
   (channel + date + item id), never `Math.random()`, so renders stay hash-stable and
   reproducible.
5. Agents may **override within the eligible set only**, during their existing meetings.
   The gates are hard: no agent, no meeting, no override reaches outside the set.
   Assignment is $0 deterministic code; agent judgment is an optional swap, not a
   dependency.
6. The assignment is recorded in the pack (`hook-assignment/1`: hookId, surface, language,
   eligible-set hash, cooldown snapshot) and the studio renders the hook into the
   template's slide-1 text slot.
7. **Fallback:** an empty library or exhausted eligible/cooldown/variety set → the
   template's default headline renders instead, logged as `no-hook`. A missing hook never
   blocks a pack.

## Historical in-app design — deliberately not shipped
This described a second consumption mode: the quiz apps rendering a hook per user per
question at request time, receiving the library as a bounded `hook-library/1` delivery and
implementing their own selector (gate filter → per-user per-hook cooldown → session-memory
filter → random pick → LRU fallback).

It was built end to end against devShark in August 2026 and **withdrawn unmerged**. Two
reasons, both worth keeping on the record because they generalise:

- **The mechanism does not transfer.** A hook earns the *next* interaction. On a feed that is
  the whole game — the reader has chosen nothing and one line has to stop a scroll. In a quiz
  the reader has already opened the app, chosen a subject, chosen categories and pressed
  start; the question is in front of them and there is no next interaction in doubt. The
  design above assumes a swipe-card product, where each card must earn its swipe. devShark is
  a form.
- **The slot was already taken.** devShark carries a rotating advisory line under every
  question (`RotatingTip` / `quiz.tip1`: "Stuck? Take your best guess, then read the
  explanation.") — the same reassurance the pretesting hooks offer. Adding a hook put a second
  rotating line on one card.

So hooks front carousels only, and the quiz apps stay standalone with no copy delivered from
here. If a swipe-card surface is ever built, the design above is the one to build against —
and the selector, evaluator and conformance vectors it needs are recoverable from the closed
PR (`lukaskourilcz/react-express-app#104`).

## Cooldown and variety scopes

| Scope | Where enforced | Rule |
|---|---|---|
| Social channel | studio, per channel per hook | `max(2 × cooldownDays, 14)` — every follower sees every post, so there is no per-user dilution; wear-out hits the whole audience at once |
| Social variety | studio, per channel | no same archetype on consecutive posts |

## Drift control (one implementation, golden vectors)

Predicate semantics are implemented once in the studio evaluator. The committed
`hooks.predicates.spec.json` vectors pin boundary cases as (item metadata, library slice) →
expected eligible ids, and studio CI asserts the implementation against them. They are regression
fixtures for the canonical engine, not an app-delivery contract.

## Boundaries, restated

- **Studio**: custody of libraries and docs, gate evaluation, cooldown state, deterministic
  proposal, rendering (images and texts), receipts.
- **Agents**: creative choice *within* eligible sets; authoring new hooks and new surface
  libraries against the shipping bar in `02` (mechanism, tagged citation, prediction,
  `falsifiedIf`), submitted through the lint.
- **Ventures**: content payloads with honest metadata. A wrong `difficulty` in a payload
  silently makes a hook dishonest — payload accuracy is a venture responsibility.
- **Apps**: no hook responsibility; the withdrawn design remains historical context only.
