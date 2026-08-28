# Social Distribution results and experiments

Version: 2026-08-28

Authority: GitHub #412, consuming #409, #410, #415, #417 and #424. Personal Growth result
records remain isolated. Optional Network and Contest Radar attribution are not core dependencies.

## Official observation boundary

`social-metric-observation/1` is one immutable 24h, 72h, 7d or 28d snapshot for one verified
owned-account post. It records the exact profile, primary/umbrella/amplifier role, connection,
platform, native post, campaign/release when applicable, current #424 capability edge, provider/API
version, format/locale, original/support classification, amplifier policy/strategy evidence, valid
aggregate metrics, unavailable reasons, provenance and recorded cost.

The official collector reuses #417's exact provider/binding resolver with the `own-insights`
capability. The transport owns credentials; the collector receives reference names only. It drops
unknown or identity-shaped provider metrics and never retains a raw provider response, audience
identity, comment body or private message. Likes may remain aggregate evidence but are not treated
as a north-star result.

Every current Direct Meta binding remains held for insights because the owner has not authorized
the extra insight capability/scopes. This produces `missing-permission`, not zero and not a provider
call. Token, app review, rate, outage, unsupported-account, malformed, no-post, invalid-denominator,
manual-only and insufficient-baseline states remain distinct. Provider failure does not modify the
campaign, profile or content inventory.

Observation IDs derive from an idempotency hash. A retry returns the existing byte-equivalent
file; a conflict is refused. A correction is a new observation whose `correctionOfRef` points to
the earlier file. Records live under `state/social/results/observations/`.

## Privacy-safe UTM attribution

`resolveSocialAttributionEvent` is the only resolver for #410's unique four-part UTM tuple. It
accepts a validated aggregate first-party destination event, matches the exact source, medium,
campaign and content values to one immutable campaign item, and records primary, umbrella or
amplifier attribution. Absent or unknown UTMs remain unattributed; a partial tuple is invalid.

Deduplication uses the source analytics contract plus its event ID. A referral visit does not imply
that anyone shared, consented or converted. Qualified actions and conversions are accepted only as
the destination's explicitly validated event type. The strict input has no visitor ID, fingerprint,
email or cross-site identity. Optional `relationship-kit` and Contest Radar refs are structurally
null in the core event.

## Baseline, experiments and boost proposals

`config/social-results-policy.json` fixes a 28-day organic baseline and a maximum of two active or
review experiments. A started experiment has exactly one changed variable, primary metric,
guardrail, scope, dates, minimum sample, stop condition and complete-baseline ref. Its hard-gate,
privacy, manipulation and publishing-authority flags are frozen; evidence appends. Purpose,
capability, ratio, runway, cooldown, duplicate, stagger, privacy, authority and kill switches can
never become experimental variables. A result below the preregistered measured sample remains
`INSUFFICIENT_DATA`.

After a complete baseline, sufficient organic observations, content/destination checks and an
existing budget authority ref, the system may create `social-boost-proposal/1`. It is always
`held-owner-proposal`: no ad API call, purchase, plan upgrade, spend or automatic publish exists.
Monetization catalog state never triggers it.

## Admin Results

`/admin/social-profiles?section=results` provides accessible tables rather than a new chart
dependency. It separates:

- Venture Profile primary and umbrella reliability, reach, referral/action/conversion, provider
  state and cost;
- Amplification Profile original baseline, venture-support sample, ratio, policy incidents and
  evidence sufficiency;
- campaign result sets by venture, role, platform, format and locale, including primary-only,
  time-to-distribute, cost and held/failure/unavailable states.

The page also shows the 28-day baseline, bounded experiments and held proposal count. Missing
records remain unavailable. It exposes no identity, private message, ad purchase or spend control.

