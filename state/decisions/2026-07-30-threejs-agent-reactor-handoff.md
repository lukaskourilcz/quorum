# Three.js Agent Council Reactor handoff

Date: 2026-07-30

Owner: Human

Status: Native preview released; Three.js renderer blocked on dependency policy

Scope: Spectator animation for the homepage and future live boardrooms

## Selected concept

Build an **Agent Council Reactor** behind the existing interface:

- all 14 agents occupy stable, recognizable positions in a three-dimensional
  constellation;
- the four council agents orbit the inner decision ring, bounded specialists
  orbit outside it and controls use a distinct square signal;
- real messages travel between agents as energy packets;
- a vote creates a positive bloom wave, while a handoff smoothly remaps the
  constellation to the next shift;
- selecting an agent brings its live state forward without replacing the
  existing navigation or editorial design.

This concept makes autonomy observable instead of adding decorative movement.
It keeps the current typography, palette, page structure and information
hierarchy.

## Idea scoring

Scores use a ten-point scale. Spectacle and narrative carry the most weight;
truthfulness, performance and implementation risk prevent a visually loud but
misleading result from winning.

| Concept | Spectacle | Agent narrative | Live-data fit | Performance | Delivery | Weighted score |
|---|---:|---:|---:|---:|---:|---:|
| Agent Council Reactor | 10 | 10 | 10 | 8 | 8 | **9.4** |
| Signal swarm / message flock | 9 | 8 | 9 | 8 | 8 | 8.5 |
| Individual robot dioramas | 9 | 10 | 6 | 5 | 5 | 7.4 |
| Decision galaxy / venture worlds | 9 | 7 | 8 | 7 | 7 | 7.8 |
| Autonomous factory floor | 8 | 9 | 7 | 6 | 4 | 7.1 |

## Research translated into the renderer

- Three.js demonstrates 500,000 GPU-computed particles. Use that visual
  language for message energy, but start at 3,000 particles and profile before
  increasing it:
  <https://threejs.org/examples/webgpu_compute_particles.html>
- Its GPGPU flocking demo shows how autonomous movement can react to a viewer.
  Use that behavior for specialist swarms and pointer deflection:
  <https://threejs.org/examples/webgl_gpgpu_birds.html>
- The official morph-and-skinning example crossfades between states and
  one-time actions. Give each future robot a calm idle loop plus short,
  positive `received`, `thinking`, `speaking`, `voting` and `handoff` actions:
  <https://threejs.org/examples/webgl_animation_skinning_morph.html>
- The official animation system can synchronize clips and crossfade or warp
  them. Drive clips from truthful agent events rather than a random animation
  timer: <https://threejs.org/manual/en/animation-system.html>
- Bloom is appropriate for a decision pulse, but the official docs warn that
  advanced bloom is more expensive. Apply it selectively to signal packets and
  accepted decisions, never to the entire scene:
  <https://threejs.org/docs/pages/BloomPass.html>
- The official volumetric fire example proves the ceiling for an occasional
  celebratory simulation. Its fluid technique is a later high-end mode, not the
  default homepage effect:
  <https://threejs.org/examples/webgpu_volume_fire.html>

## What is live now

The homepage has a dependency-free, Canvas 2D preview of the reactor:

- 14 labeled nodes preserve the Council / Specialist / Control hierarchy;
- deterministic energy packets move across agent-to-agent routes;
- pointer position gently deflects the field;
- particle density is deliberately bounded;
- the animation pauses off-screen and in hidden tabs;
- device pixel ratio is capped at 1.5;
- `prefers-reduced-motion` renders a calm static constellation.

This is an implementation preview, not a claim that Three.js is installed.

## Protected upgrade required

Interactive sessions may not edit `site/package.json` or the lockfile, and the
repository explicitly prohibits new dependencies. Do not load Three.js from a
CDN or disguise it as a vendored script. A human owner must:

1. approve Three.js as a maintained production dependency;
2. add a pinned `three` version and matching types through pnpm;
3. make the manifest and lockfile change in a reviewed human-owned commit;
4. hand the renderer implementation back to an allowed site session.

After that, replace the Canvas 2D drawing internals—not the public component
contract—with:

1. `WebGPURenderer` with a tested WebGL fallback;
2. instanced agent sigils and `BufferGeometry` points;
3. a 3,000-particle baseline with quality tiers and DPR caps;
4. event-driven `AnimationMixer` clips for robot models;
5. selective bloom and one short handoff shockwave;
6. frame-time telemetry, context-loss recovery and a static fallback.

The future live data contract should expose only verified events:
`agent_id`, `state`, `message_id`, `addressed_to`, `vote`, `occurred_at` and
`shift`. Until the three-shift runtime is active, the renderer must not invent
Morning, Afternoon or Night activity.
