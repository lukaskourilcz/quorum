# WebDev Signal deterministic selection

WebDev Signal selects zero or one story per Prague day without network, model, render or publishing
calls. `config/webdev-signal-selection.json` is the single versioned source for URL/project aliases,
tracking removal, semantic-query preservation, thresholds, cooldowns and score weights.

The pure pipeline runs in this order:

1. canonicalize credential-free HTTPS URLs, projects and explicit release/advisory identifiers;
2. prefilter stale, promotional, rumor, generic AI, tutorial and minor-patch noise;
3. conservatively cluster exact targets or matching project/version identifiers;
4. build source-backed `webdev-record/1` facts and preserve conflicts;
5. apply hard official-evidence, conflict, high-risk-scope and recent-edition gates;
6. score eligible records with the centralized twelve-component resolver;
7. apply a stable score/date/id tie break and require threshold, confidence and winner margin;
8. emit exactly one selected record or an honest `NO_EDITION` receipt.

Secondary editorial candidates remain lead-only and disappear unless an equivalent official
candidate confirms them. Security, breaking and deprecation records cannot become eligible without
exact affected scope; security also needs a fixed scope. Recent project repetition is gated except
for a materially changed, exactly scoped security or breaking update.

GoVIRAL is an optional read-only overlay. Its capability must be independently allowed, its packet
must validate and be unexpired, and its topic must match a factual record. Contribution is capped at
five points—below the authority and impact components—and the record must cross the base threshold
without it. The selector never runs a GoVIRAL actor, creates a candidate, confirms a fact or records
duplicate cost.

Every selection stores the input snapshot hash, component contributions, confidence, hard-gate
reasons, fixed tie break, optional correction/supersession refs and idempotency hash. Receipt metrics
record prefilter drops, clusters, conflicts, eligible/scored counts, overlay state, reuse/calls
avoided, and literal zero network/model/provider cost for this stage.
