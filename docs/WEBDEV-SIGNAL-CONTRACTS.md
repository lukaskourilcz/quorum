# WebDev Signal contract ownership

Verified: 2026-08-28

The typed flow is intentionally one-way:

`webdev-source/1` → `webdev-candidate/1` → `webdev-record/1` →
`webdev-selection/1` → `webdev-evidence-brief/1` →
`webdev-edition-package/1` → bounded Design Lab and Social Distribution references.

Source adapters own only bounded candidates and parse/drop counts. #440 owns pure canonicalization,
records, gates, scores and the zero/one decision. #441 owns the accepted evidence brief and native
locale packages. #442 owns rendered bytes. #443 owns the independently authorized Social
Distribution handoff. No downstream artifact may rewrite the accepted brief.

The central topic, change-kind and impact-scope enums live with these contracts. Unknown values are
explicit, never hidden in tags. Strict objects reject raw source bodies, credentials, provider
state and invented publishing authority. The only cross-service values accepted by the edition
contract are the exact #424 Design Lab and Social Distribution capability references.

Meaningful corrections use a new version/hash and a supersession reference. Mutable “current
truth” is not duplicated across stages. A malformed source item is dropped and counted without
discarding its valid siblings. Fixture records are marked and must remain outside live health,
cost and KPI totals.

Both locale packages resolve every factual sentence to accepted claim IDs. Cross-package
validation requires the same core claims, rejects unsupported versions/audiences/actions, checks
prohibited phrases and rejects clones or high lexical overlap. Holding one locale never permits the
other to become factually broader.

## Rendered panels in the admin

The Design & delivery tab previews and downloads each rendered panel through
`/admin/api/webdev-signal/panel/<date>/<locale>/<number>` (`?download=1` for an attachment). The
route sits behind the admin session, reads only, and serves the file that the package's successful
`webdev-render-receipt/1` names, and only while its bytes still hash to the receipt's `pngHash`.
The cycle's daily queue-health step removes a render's panel directory 28 days after the newest
package day that used it (`orchestrator/src/ventures/webdev-signal/panel-retention.ts`) and commits
the deletions only. Receipts and payloads stay, so the card names a pruned panel, and its payload
can render it again.
