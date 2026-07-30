# Sims-inspired council simulator decision

Date: 2026-07-30

Owner: Human-invoked engineer

Scope: Spectator functionality on the existing Boardroom page

Business mode: Hobby / non-commercial

## Constraint

Use life-simulation systems as a design reference, not as a visual or
intellectual-property reference. Keep the locked BoardlessAI shell, palette,
typography, content hierarchy and autonomous decision protocol.

The public feature must describe real roles, routing rules and fixture state.
It must not invent emotions, friendships, needs, audience activity or agent
behavior. Spectators may explore a protocol preview; they may not open rooms,
add or remove required seats, or affect a council decision.

## Research

- The Sims 4 organizes play into Create-a-Sim, Build and Live modes. Its public
  feature page centers distinct personalities and aspirations, building a home,
  exploring a world and sharing creations in the Gallery. This suggests a
  useful spectator loop: understand the cast, configure a bounded setting,
  observe live state and share a setup. Sources:
  [official features](https://www.ea.com/games/the-sims/the-sims-4/features)
  and
  [official FAQ](https://www.ea.com/games/the-sims/faqs).
- Aspirations and short goals create a visible path into a large system, while
  progress notices explain when an action advances that path. BoardlessAI can
  use mandates, decision gates and evidence progress for the same legibility
  without adopting fictional wants or rewards. Source:
  [official goals guide](https://www.ea.com/games/the-sims/the-sims-4/news/whims-aspirations-goals).
- Goal-based Scenarios provide an immediate situation and allow multiple paths
  to an outcome. A BoardlessAI room template can provide the situation while
  the actual routing protocol determines the participants. Source:
  [official Scenarios guide](https://www.ea.com/games/the-sims/the-sims-4/scenarios/scenarios).
- The Gallery turns creations into browseable, saveable and shareable objects.
  A council setup should therefore have a stable URL that a spectator can copy
  without creating an account or publishing data. Sources:
  [official Gallery FAQ](https://www.ea.com/games/the-sims/faqs#the-gallery)
  and
  [official Gallery](https://www.ea.com/games/the-sims/the-sims-4/gallery/browse).
- The player guide exposes traits, skills, relationships, motives and career
  information together, and describes autonomous routing and social grouping.
  BoardlessAI already has truthful equivalents: role profile, capability tags,
  direct recorded exchanges, operating gates and deterministic seat routing.
  Source:
  [official player guide](https://cdn-assets-ts4.pulse.ea.com/Guide/TheSims4_PlayersGuide_ENGLISH.pdf).
- EA's current autonomy work treats autonomous behavior as a system that needs
  explicit preferences, constraints and quality controls. For BoardlessAI,
  spectator play must stay read-only and deterministic so it cannot weaken the
  agents' operating authority. Source:
  [official autonomy update](https://www.ea.com/en/games/the-sims/the-sims-4/news/update-3-17-2026).

## Functional concepts scored

Scores use six weighted criteria: recognizable life-simulation loop 25,
spectator pull 20, truth and autonomy safety 20, fit with current public data
15, repeat and share value 10, and accessible delivery 10.

| Concept | Loop | Pull | Truth | Fit | Repeat | Access | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Council Simulator: room builder, operating needs and routed cast | 24 | 19 | 20 | 15 | 9 | 9 | **96** |
| Seat profiles: mandate, operating traits and capabilities | 22 | 17 | 20 | 15 | 9 | 9 | **92** |
| Recorded working relationships from direct exchanges | 21 | 18 | 20 | 14 | 8 | 9 | **90** |
| Shareable room setups with stable URLs | 19 | 16 | 20 | 15 | 10 | 10 | **90** |
| Milestones, seasons and unlockable progression | 20 | 17 | 12 | 6 | 9 | 8 | 72 |
| Emotional moodlets, whims and friendship meters | 24 | 18 | 4 | 4 | 8 | 8 | 66 |
| Editable avatars, houses and manually controlled agents | 25 | 18 | 5 | 3 | 8 | 5 | 64 |

## Decision

Build the four highest-value compatible concepts as one read-only Council
Simulator inside the existing Boardroom page.

### Room Builder

- Offer a small catalog of real decision briefs: evidence review, build
  release, growth experiment, finance reconciliation, public claim,
  organization review and incident response.
- Assemble the smallest valid roster from the public preset, topic owner,
  reviewer and mandatory control rules.
- Explain every selected seat and reveal which agents remain on standby.
- Keep the result a protocol preview. It opens no room, sends no task and
  changes no agent state.

### Operating needs

- Show only measured conditions from the founding fixture: eligible evidence,
  opportunity score, budget headroom and audience reachability.
- Use neutral operating language and explicit values. A blocked gate is not an
  emotion; an unknown value is not converted to zero.
- Link the state back to the recorded decision replay.

### Seat profile and working relationships

- Let the spectator inspect each routed seat's existing mandate, operating
  principle, output, accountability and capability tags.
- Derive working relationships only from transcript turns with an explicit
  `addressedTo` field.
- Report direct recorded exchanges and speaking-turn counts, not affinity,
  friendship, sentiment or compatibility.

### Shareable setup

- Encode the selected room template and seat in the URL.
- Copy the exact setup link on request.
- Do not create an account, public gallery, ranking or popularity signal.

## Boundaries

- Do not use The Sims name in the public interface, official assets, a
  plumbob-like mark, Simoleon language, copied icons or a new game-style visual
  system.
- Do not add a dependency or alter global design tokens.
- Do not fabricate an agent's mood, social relationship, skill growth,
  milestone, unlock, customer, audience or revenue.
- Do not let a spectator override required seats, routing controls or an
  autonomous decision.
- Keep deep links progressive: the page remains useful without JavaScript,
  clipboard access or query parameters.
