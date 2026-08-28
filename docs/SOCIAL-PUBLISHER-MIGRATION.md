# Capability-aware Social Distribution publisher

Version: 2026-08-27

Authority: GitHub #409, consuming #405, #406, #415 and the exact capability/isolation map in #424.

## Runtime truth

`config/social-publisher-registry.json` is the versioned profile/connection registry used by the
publisher. It records three legacy primary profiles, three connectionless internal proposals and
six separate Instagram/Threads bindings. Door Money has the one exact #424 package edge;
BOOKSOFHISTORY and Tehdejší svět remain independently proposed and capability-denied. Every
committed binding is held, unverified and has null human activation. Credential
and native-account identifiers are environment **reference names** only; values are neither stored
nor returned by the target resolver.

The global `config/channels.json` remains the bounded connector-capability switch. A live attempt
needs both that global channel and the exact per-profile connection to be independently active.
The connection supplies provider/API version, official scopes, profile-specific daily cap and
Prague-time spacing. Multiple profiles may use one platform without sharing credentials, caps,
health or pause state.

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

`migrateLegacyQueueItem` reads DNESKAi, MMA Files and Titty Tuesdays queue v1 through explicit
registry mappings. It preserves source venture, campaign, locale, variant, content, checks, window,
attempt and receipt meaning, records the old content hash and recalculates the v2 target hash. It
does not rewrite the committed history. An unmapped legacy producer such as marketingShark stays a
manual draft and cannot silently become a publisher.

## Deny-by-default target resolution

`resolvePublisherTarget` returns `eligible | held | denied`, never authority. In order, it checks:

1. strict queue and registry contracts;
2. exact real profile, role, platform connection and Direct Meta version;
3. simulation/contact/owner-personal and permanent source isolation;
4. own-primary relationship or exact current #424 cross-boundary edge;
5. bounded Door Money/WebDev Signal package input;
6. #415 support eligibility and exact campaign approval for an amplifier;
7. active/live profile and separately human-activated healthy connection;
8. token/App Review expiry, allowlisted credential/native-id reference availability;
9. profile and connection pause/kill files.

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

Before each of at most two attempts the runner invokes the idempotency reconciliation seam. A
verified remote item receives an immutable receipt containing profile, connection, provider and
target provenance. An unresolved ambiguous outcome becomes `needs_reconciliation`, writes a
per-connection pause and also invokes the existing venture pause. It is never failed over to
another account/provider. Later company recovery may invoke these exact primitives but cannot
broaden the target, action or capability.

No code in this migration creates an account, completes OAuth, activates a connection, reads a
private audience, automates likes/follows/comments/reposts/DMs, buys ads/provider plans or exposes a
CONTEST RADAR source/action. Those require separate owner decisions; CONTEST RADAR stays deferred.
