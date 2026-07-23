---
name: boardroom-routing
description: Use when routing agent work, opening a room, choosing participants, minimizing context/cost, or publishing a sanitized room summary.
---

# Boardroom routing

1. Read section 0.1.3, `config/agent-routing.json`, active agent registry,
   current objective, task type, risk tags and budget impact.
2. Select one owner and the smallest capable review set. Add every mandatory
   control role; never invite all agents as a fallback. Record a short factual
   reason for every selected role and why optional roles were skipped.
3. Create an immutable typed room packet with evidence refs, decision needed,
   TTL and round/turn/token/cost caps. Give each role only its relevant context
   envelope; share tool results by reference and deduplicate calls.
4. Run at most two rounds: owner brief, selected parallel reviews, CHAIR
   synthesis. One evidence-backed request may add one role. Auto-close on
   decision, cap or TTL.
5. Persist structured conclusions, not hidden reasoning. Public output exposes
   topic, participants/reasons, evidence, decision, cost/latency and outcome
   only after allowlist sanitization.
6. Run routing fixtures, mandatory-rule tests, no-irrelevant-call assertions,
   budget explain and sanitizer tests.
