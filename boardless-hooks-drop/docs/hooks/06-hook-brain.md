# The Hook Brain — Carousel Studio as assignment authority

The Carousel Studio is the single brain behind all social content: it renders the images,
renders the texts, and **assigns the hooks** from the central library. This doc defines how
that works and where the seams are.

## Where things live

Everything canonical sits in the quorum monorepo next to the Carousel Studio engine:
the hook libraries (`quiz`, `news`, `mma`), the research files, these docs, the lint, and
the predicate evaluator. Consumer apps never orchestrate and never own hook copy — they
receive bounded, hash-receipted data through the standard delivery channel, same as
articles.

## Two consumption modes

### 1. Social packs (studio, pack-build time)
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
7. **Fallback:** empty eligible set, or an unwritten library (news/MMA today) → the
   template's default headline renders instead, logged as `no-hook`. A missing hook never
   blocks a pack.

### 2. In-app (devShark / geoShark runtime)
The quiz apps render hooks per user, per question, at request time. Per-user cooldown
state can only live where the user is, so:

- The library is **delivered** to the app repo as bounded JSON (`hook-library/1`,
  hash + receipt), re-delivered only after the central lint passes.
- The app implements its own selector: gate filter → per-user per-hook cooldown →
  session-memory filter → random pick → **LRU fallback** when everything is cooling.
  Never empty, never a within-session repeat.

## Cooldown scopes (do not mix these up)

| Scope | Where enforced | Rule |
|---|---|---|
| In-app | app runtime, per user per hook | `cooldownDays` as shipped |
| Social channel | studio, per channel per hook | `max(2 × cooldownDays, 14)` — every follower sees every post, so there is no per-user dilution; wear-out hits the whole audience at once |
| Social variety | studio, per channel | no same archetype on consecutive posts |

## Drift control (six predicates, two implementations)

Predicate semantics are specified once (`04-schema-and-gates.md`) but implemented twice:
in the studio evaluator and in each app's selector. To pin them together, the studio
generates **conformance vectors** — `hooks.predicates.spec.json`, a fixture of
(item metadata, library slice) → expected eligible ids — and ships them with every library
delivery. Studio CI and app CI both assert against the same vectors. If the vectors and an
implementation disagree, the implementation is wrong.

## Boundaries, restated

- **Studio**: custody of libraries and docs, gate evaluation, cooldown state, deterministic
  proposal, rendering (images and texts), receipts.
- **Agents**: creative choice *within* eligible sets; authoring new hooks and new surface
  libraries against the shipping bar in `02` (mechanism, tagged citation, prediction,
  `falsifiedIf`), submitted through the lint.
- **Ventures**: content payloads with honest metadata. A wrong `difficulty` in a payload
  silently makes a hook dishonest — payload accuracy is a venture responsibility.
- **Apps**: selection mechanics and per-user state. Never copy edits; problems with strings
  go upstream.
