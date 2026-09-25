# Capability-aware Social Distribution publisher

Version: 2026-08-27

Authority: GitHub #409, consuming #405, #406, #415 and the exact capability/isolation map in #424.

## Runtime truth

`config/social-publisher-registry.json` is the versioned profile/connection registry used by the
publisher. It records three legacy primary profiles with six Instagram/Threads bindings, five
connectionless internal proposals (Door Money, BOOKSOFHISTORY, Tehdejší svět and WebDev Signal's
two editions) and, since #569, devShark's three proposed profiles under marketingShark with one
binding each: LinkedIn, Instagram and Threads. Door Money has the one exact #424 package edge;
BOOKSOFHISTORY and Tehdejší svět remain independently proposed and capability-denied. Every
committed binding is held, unverified and has null human activation. Credential
and native-account identifiers are environment **reference names** only; values are neither stored
nor returned by the target resolver.

The global `config/channels.json` remains the bounded connector-capability switch. A live attempt
needs both that global channel and the exact per-profile connection to be independently active.
The connection supplies provider/API version, official scopes, profile-specific daily cap and
Prague-time spacing. Multiple profiles may use one platform without sharing credentials, caps,
health or pause state.

#417 resolves that connection through `config/social-providers.json`. Every Instagram and Threads
connection has one held Direct Meta binding, devShark's LinkedIn connection has one held Buffer
binding, and the registry rejects more than one active provider for the same connection. Optional
Metricool and n8n postures are explicit but create no binding. Make remains deferred and Ayrshare rejected. See `docs/SOCIAL-PROVIDERS.md` for the exact
migration, ambiguity and rollback procedure.

## Queue v2 and legacy compatibility

New `schemaVersion: 2` items contain:

- source venture, release and campaign references plus an approved package reference;
- exact profile role and target role `primary | umbrella | amplifier`;
- one profile/connection/provider binding reference;
- the exact #424 capability where required;
- #415 and exact campaign approval for amplifiers;
- action fixed to `publish-original`;
- locale, variant, objective, destination, UTM, immutable content/checks/window;
- approval, selection and policy provenance;
- optional deterministic v1 migration evidence.

#410's verified-release campaign generator is upstream of this queue. It creates immutable owner-
review items and never writes queue v2 directly. Only its exact approved handoff can later enter
#418's per-profile inventory, where ratio, cooldown, cadence, provider, routine-scope and kill-
switch gates run again before any queue handoff.

`migrateLegacyQueueItem` reads DNESKAi, MMA Files and Titty Tuesdays queue v1 through explicit
registry mappings. It preserves source venture, campaign, locale, variant, content, checks, window,
attempt and receipt meaning, records the old content hash and recalculates the v2 target hash. It
does not rewrite the committed history. marketingShark no longer writes queue v1: since #568 its
devShark drafts are queue v2 items read directly, and a v1 item it left behind maps to the devShark
profile that owns its channel's connection (#569). A mapped connection must belong to one of the
venture's own primary profiles, which lets a venture keep one profile per platform. An unmapped
legacy producer stays a manual draft and cannot silently become a publisher.

`pnpm social:migration-audit` is the deterministic, read-only release check for that compatibility
path. `--write` may persist its one hash-addressed receipt at
`state/social/migrations/social-distribution-core-v1.json`; rerunning the same inputs does not write
a duplicate. The report classifies the current repository as 13 migrated records (three legacy
profiles, six explicit connection references and four queue-v1 compatibility projections), three
unchanged activation records and 22 held records (eight future profiles, nine provider bindings
and five optional-provider postures). Unchanged activation records are those of the migrated
ventures; marketingShark's record (#569) is new, not migration evidence. Unavailable, dropped and
malformed counts remain explicit. The categories describe migration evidence, not live
authority: all profiles, connections and bindings remain held. Rollback keeps the original queue files and the `QueueItemSchema` and
`SocialActivationSchema` readers intact.

## Deny-by-default target resolution

`resolvePublisherTarget` returns `eligible | held | denied`, never authority. In order, it checks:

1. strict queue and registry contracts;
2. exact real profile, role and platform connection; Instagram and Threads on Direct Meta at the
   registry's version, LinkedIn on Buffer;
3. simulation/contact/owner-personal and permanent source isolation;
4. own-primary relationship or exact current #424 cross-boundary edge;
5. bounded Door Money/WebDev Signal package input;
6. #415 support eligibility and exact campaign approval for an amplifier;
7. active/live profile and separately human-activated healthy connection;
8. token/App Review expiry, allowlisted credential/native-id reference availability;
9. profile and connection pause/kill files;
10. a transport with an adapter that sends to the connection's platform: Direct Meta for
    Instagram and Threads, Buffer for LinkedIn (#571). Anything else is held with
    `provider-adapter-unavailable`.

The runner then preserves venture release activation, the global kill switch, all immutable content
checks, Titty Tuesdays safety, per-connection cadence, idempotency, remote verification and durable
receipts. BOOKSOFHISTORY and future profiles can be added as held configuration without a code map;
they remain non-live until their own release authority and connection gates exist. Personal Growth,
Kvórum and GoVIRAL are denied. BOOKSOFHISTORY and Tehdejší svět cannot target each other. Door Money
accepts no raw/private payload.

## Connector and recovery boundary

The Meta adapter receives a validated resolved target and looks up only the two allowlisted
reference names on that connection. It contains no venture credential-prefix table and rejects a
call without a resolved target or with an API-version mismatch. Error text redacts referenced
credential/native-id values and common secret fields.

The runner invokes the idempotency reconciliation seam before publication and sends at most once.
Only read-only live verification may retry twice. A verified remote item receives an immutable
canonical receipt containing profile, connection, provider and target provenance plus a bounded
`provider-delivery-receipt/1` reference. An unresolved ambiguous outcome becomes
`needs_reconciliation`, writes a deterministic `provider-health/1` snapshot, pauses the connection
and invokes the existing venture pause. It is never resent or failed over to another
account/provider. Later company recovery may invoke these exact primitives but cannot broaden the
target, action or capability.

No code in this migration creates an account, completes OAuth, activates a connection, reads a
private audience, automates likes/follows/comments/reposts/DMs, buys ads/provider plans or exposes a
CONTEST RADAR source/action. Those require separate owner decisions; CONTEST RADAR stays deferred.
