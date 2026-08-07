# Task: adopt the delivered hook library in devShark

You are working in `react-express-app` (devShark). The hook system — the one-line hook
rendered above the question, on the same card, where a right-swipe advances to the
answer/explanation — is now owned centrally: the hook library and its knowledge docs live
in the quorum monorepo next to the Carousel Studio, and this repo **receives the library
as bounded data** (`hook-library/1` delivery: `quiz.hooks.json` + conformance vectors,
hash + receipt). This repo owns selection mechanics and per-user state — never the copy.

**Run this after the quorum-side Hook Brain task has shipped.** If the first delivery has
not landed yet, I've dropped `hooks.json` and `hooks.predicates.spec.json` in the repo
root — commit them at the delivery target path as the initial payload; future updates
arrive through the channel.

## Steps

### 1. Retire the local library
Delete the existing 16-hook library and its types. Load the delivered `quiz.hooks.json`
(schema-validate on load; a malformed delivery fails loudly at startup, not silently at
render). Hook copy is never edited in this repo — if a string is wrong, report it
upstream; a local edit will be overwritten by the next delivery anyway.

Three ids are cut and must disappear from this codebase entirely, including tests,
fixtures and analytics enums: `speed-run`, `looks-easy`, `hard-mode`.

Nine ids are revised in place (same id, new strings): `no-google`, `bet-on-it`,
`two-look-right`, `everyday-blindspot`, `one-detail`, `streak-breaker`, `explain-it`,
`know-why`, `spot-it`, `daily-rep`. Historical analytics rows keep those ids, so tag new
impression events with `libraryVersion: 2` rather than renaming anything.

Four ids are unchanged in concept: `seniors-know`, `interview-favorite`, `depends-on-it`,
plus the dev variants of `two-look-right` and `know-why`. **Diff their strings against git
history and report any differences in the PR body** — those lines were reconstructed from
notes, not copied from source. If the committed originals differ, don't edit here: flag
them for correction upstream.

### 2. Implement the selector
Types first: Hook, Predicate as a discriminated union, `:N`/`:X` suffixes parsed at load
time. Then selection, per request: filter to hooks whose gates the question satisfies →
drop hooks inside their per-user per-hook cooldown → drop hooks already shown this session
→ pick at random. **If the result is empty, fall back to the least-recently-shown eligible
hook.** Never render no hook, never throw, never repeat within a session.

Cooldown and session state use whatever storage this app already has. Unit-test the
starvation path explicitly: simulate a user doing 8 questions/day for 14 days and assert
no empty selection and no within-session repeat.

`questionStartsWith` semantics (language-aware vs canonical-EN) are decided upstream and
pinned by the conformance vectors — implement to the vectors, don't re-decide.

### 3. Run the conformance vectors in CI
Add a test that runs this repo's evaluator against the delivered
`hooks.predicates.spec.json` and asserts every expected eligible set. This is the drift
guard between the studio's evaluator and this one: if the vectors and this implementation
disagree, this implementation is wrong.

### 4. Feed the selector real question metadata
The gates need `optionCount`, `difficulty`, `category`, `hasCode` and the question text.
Map this app's question shape onto the evaluator's context type at the call site. If any
field isn't available where the hook renders, say so rather than passing a default — a
wrong `difficulty` silently makes hooks dishonest.

### 5. Point agents at the canonical docs
Add to `CLAUDE.md`:

> Hook copy for this app is delivered from the quorum repo (Carousel Studio / Hook Brain)
> and is never edited here. Before writing, editing or reviewing anything hook-related,
> read `docs/hooks/README.md` in quorum and the file it routes you to. Hooks ship only
> with a mechanism, a tagged citation, a falsifiable prediction and a `falsifiedIf`
> condition. Never invent a statistic and never claim anything a gate doesn't license.

### 6. Instrument the metric
Primary: swipe-through rate from the hook+question card to the answer card. Guardrails
that must not degrade: question-completion rate, next-day return rate. Log hook id,
vertical, language, difficulty and `libraryVersion` on every impression so results can be
sliced — never pool CS and EN, the effects are per-language.

## Constraints

- Do not edit hook strings or vendor the quorum docs — link them.
- No new dependencies.

## Deliverable

A PR: local library deleted, delivered payload loaded with validation, selector + stores +
starvation test, conformance vectors green in CI, real question metadata mapped, analytics
instrumented, `CLAUDE.md` updated. In the PR body: the string diffs from step 1 and any
question metadata that wasn't available at the hook render site.
