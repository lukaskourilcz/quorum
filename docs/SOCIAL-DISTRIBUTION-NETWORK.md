# Optional Social Distribution Network

Version: 2026-08-28

Authority: GitHub #411, the Social Distribution operating decision and capability map #424.

## Posture

The Network is an optional private directory for genuine people and organisations that may choose
to share relevant BoardlessAI work. It is not part of Social Distribution core completion. The
planning benchmark is 50 relationships; only validated owner-entered records count toward the
actual total, and an empty directory is a complete and honest state.

Contacts never become profiles, connections, provider bindings or queue identities. BoardlessAI
does not log in, publish, send email or direct messages, follow, comment or act as a contact.

## State ownership

| State | Path | Writer |
| --- | --- | --- |
| Relationship records | `state/social/network/contacts/` | bounded owner-confirmed import |
| Relationship history | `state/social/network/contact-events/` | append-only owner evidence |
| Assigned share kits | `state/social/network/share-kits/` | exact campaign/contact assignment |
| Kit outcomes | `state/social/network/share-kit-events/` | append-only owner/manual or aggregate evidence |

Missing directories mean zero recorded relationships or kits. Malformed files cost one record and
increment the protected Admin drop count.

## Import boundary

`previewDistributionNetworkImport` accepts bounded JSON arrays or one exact CSV header, at most
100 rows and 128 KiB. It normalizes explicit public references, reports `new`, `update`, `conflict`
or `drop` per row, rejects spreadsheet formulas, markup, credentials, cookies, private messages
and follower-list fields, and grants neither persistence nor outbound authority.

Only explicitly confirmed `new` prospect or qualified records may be persisted. Imported records
carry a deterministic batch reference and never start opted in. Duplicate, update and ambiguous
rows stay in owner review rather than overwriting canonical state.

## Consent and assignment

Recurring assignment requires `opted-in` or `active`, a dated consent reference, exact venture,
topic, platform, language and market fit, an approved campaign and a current #424
`approved-publish-package/1` edge. `declined`, `do-not-contact` and `retired` block assignment.

A share kit contains bounded factual text, approved assets and alt text, one unique manual-share
UTM, disclosure, expiry and `copy | download | manual-send` mode. It cannot enter the owned-profile
queue. The protected Admin lets the owner copy or download the kit; sending remains manual.

## Outcome evidence

Only owner-recorded evidence may mark a kit delivered or shared. Aggregate UTM activity can remain
`unknown`; it cannot identify a contact, prove consent or prove sharing. Earlier evidence remains
immutable and later events reduce the current protected view.

## Capability and privacy guards

- Personal Growth, Kvórum, GoVIRAL and Contest Radar cannot source Network kits.
- BOOKSOFHISTORY and Tehdejší svět retain their permanent cross-assignment isolation.
- Door Money accepts only its bounded approved package reference; manuscript and private payload
  fields do not exist in the contracts.
- No credential, session, private message, follower list, sensitive profile or scraped contact
  database can parse.
- Simulations never appear in Network totals, imports, assignments or outcomes.

The Network can be removed by leaving its state directories empty. Removing it changes no profile,
campaign, publisher, provider, metric, inventory or daily-operation behavior.
