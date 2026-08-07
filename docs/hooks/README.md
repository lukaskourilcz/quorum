# Hook & Viral Copy Knowledge Base

Distilled, evidence-tagged knowledge for any agent writing or editing **hooks and short-form
viral copy** in this repo family: devShark / geoShark in-app quiz hooks, marketingShark
carousel slide-1 hooks, and social post copy generally.

Produced during the August 2026 hook-library rebuild (16 → 49 Tier A hooks + Tier B spec).
The live libraries (`quiz`, `news`, `mma`) sit beside these docs in the studio; these docs
are the *why* and *how* behind them.

## Files

| File | Read it when… |
|---|---|
| `01-hook-psychology.md` | You're writing or judging a hook and need the mechanism catalog + what the evidence actually supports |
| `02-hook-craft-rules.md` | You're writing copy — voice, hard limits, honesty rules, Czech rules, anti-patterns, pre-ship checklist |
| `03-metrics-and-testing.md` | You're evaluating hooks — metrics, cooldowns, wear-out, A/B design, kill rules |
| `04-schema-and-gates.md` | You're touching the hook system itself — schema, predicate semantics, known bug classes, Tier B build specs |
| `05-surfaces.md` | You're writing hooks for a venture other than the quiz apps — why strings don't port, per-surface predicate vocabularies, extra honesty rules for news and MMA |
| `06-hook-brain.md` | You're touching assignment or delivery — how the Carousel Studio evaluates gates, cooldown scopes (per-channel vs per-user), agent override limits, conformance vectors |

These docs are **canonical and live in one place**: the quorum monorepo, next to the
Carousel Studio engine — the studio is the assignment brain for all social content (see
`06-hook-brain.md`). Consuming repos (devShark/geoShark apps, DNESKAi, MMA Files) reference
these docs from their own `CLAUDE.md` and receive libraries as bounded deliveries — never a
copy; a forked playbook drifts within weeks.

Each venture ships its own hook library against the shared schema and lint. See
`05-surfaces.md` before writing hooks for any surface other than the quiz apps: the engine
ports everywhere, the strings do not.

## Evidence confidence tags

Every citation in these docs and in `hookResearch` carries a tag. **Never upgrade a tag to
sound more authoritative, and never invent a citation.**

- **[verified]** — checked against the actual source during the Aug 2026 research session.
- **[recalled]** — well-known literature cited from memory; re-verify before quoting in
  anything published externally.
- **[practitioner]** — industry practice (e.g. Duolingo streaks); no controlled evidence.
- **[mechanism-only]** — plausible psychology with no direct citation; never present as
  "research says".
- **[measured]** — reserved for effects confirmed by *our own* A/B data. The strongest tag.
  Promote findings here as readouts come in.

## Prime directives (apply to every surface)

1. **Never ship a claim the product can't honor.** No fake timers, no invented stats
   ("9 out of 10 devs get this wrong" is banned until we've measured it), no manufactured
   urgency, no assertions about the reader we can't verify.
2. **Concrete beats vague.** The largest modern headline meta-analysis shows vague
   curiosity-gap phrasing does not reliably win and generally loses to concrete phrasing
   (see 01, "The clickbait tax"). Open a *specific* gap, don't withhold the referent.
3. **Every hook is an experiment.** It ships with a mechanism, a citation + tag, a
   falsifiable prediction, and a `falsifiedIf` condition. If it can't be wrong, it doesn't ship.

## Update protocol

After each A/B readout: append the result to `03-metrics-and-testing.md` (Results log),
update the hook's entry in `hookResearch` (tag → `[measured]`), and prune or promote per the
kill rules. These files are living documents — an agent that learns something about what
works here is expected to write it down here.
