# Secrets audit — quorum, aifirst, mma-files

Date: 2026-08-06 · Scope: working tree **and** full git history (`--all`) of all three
repositories · Reason: the owner intends to make `quorum` public, which is what buys unlimited
free Actions minutes on standard runners.

## Verdict

**No secret was found in the working tree or in the history of any of the three repositories.
Safe to publish.**

Repository visibility, billing and plan are unchanged — those are the owner's to flip.

## What was scanned, and with what

`gitleaks` is not installable in this environment (no published `gitleaks@8` on npm and no
pinned binary available), so the sweep was done with `git log --all -p` piped through targeted
patterns. That reads every added line of every commit on every ref — 425,307 added lines across
97 commits in `quorum` — which is the same surface `gitleaks detect --log-opts="--all"` reads.
The patterns are narrower than gitleaks' full ruleset; the specific credential shapes this
system could hold are all covered below.

| Check | Pattern | Result |
| --- | --- | --- |
| Model provider keys | `sk-…`, `sk-ant-…` | none |
| GitHub tokens | `ghp_…`, `github_pat_…`, `ghs_…`, `x-access-token` literals | none |
| Apify token | `apify_api_…` | none |
| AWS keys | `AKIA[0-9A-Z]{16}` | none |
| Slack tokens | `xox[baprs]-…` | none |
| Private keys | `-----BEGIN … PRIVATE KEY-----` | none |
| Assigned credential literals | `(api_key\|token\|secret\|password\|credential) = "…"` with a 16+ char value, excluding `process.env`, `secrets.`, `vars.`, `${…}` and placeholders | none |
| Bearer literals | `Authorization: Bearer <20+ chars>` not sourced from a secret | none |
| Connection strings | `postgres/mysql/mongodb/redis/amqp://user:pass@` | none |
| Committed `.env` | any `.env` / `.env.*` ever added, excluding `.env.example` | none |
| Secret-shaped filenames | `*secret*`, `*credential*`, `*.pem`, `*.key`, `id_rsa`, `*.p12`, `*.pfx` ever added | none |
| Long opaque literals in tracked source | 40+ char quoted strings, excluding hashes, base64 payloads and pinned action SHAs | none that are credentials — every hit is an article slug or a test fixture |

## Non-code surfaces

- **`state/**`** — no token, no connection string, no third-party personal data. The only email
  addresses present are `boardlessai-cycle[bot]@users.noreply.github.com` and the owner's own
  public address; no card number, IBAN, SWIFT or VAT identifier appears in `state/INBOX.md` or
  `state/treasury/`.
- **`media/**`** — three committed files (`preview.webm`, `preview.mp4`, `preview-poster.png`).
  The PNG carries no `tEXt`, `iTXt`, `zTXt` or `eXIf` chunk. No JPEG is tracked anywhere in the
  repository, so there is no EXIF surface to leak location or device data.
- **`docs/**`** — prose only.
- **`orchestrator/.dry-run/`** — git-ignored, so its edition artifacts were never committed.

## Cross-repository leakage

`quorum` embeds no token or private URL for `aifirst` or `mma-files`. The delivery path mints a
short-lived GitHub App installation token at run time (`steps.delivery-token.outputs.token`) and
interpolates it into the clone URL inside the step; nothing is written to a tracked file. The
delivery App's private key exists only as an Actions secret — no `BEGIN … PRIVATE KEY` block
appears anywhere in any of the three histories.

Both magazine repositories were scanned the same way: zero matches for every credential pattern,
and no `.env` file ever committed to either.

## What is deliberately in the open, and is not a secret

- `.env.example` — variable **names** with empty values and the four budget caps. No values.
- Public URLs: `boardless-ai.vercel.app`, `caughtup-ai.vercel.app`, `mma-files.vercel.app`.
- Repository names, the venture id `caught-up`, Actions **variable** names, and the model ids in
  `config/models.json`. All identifiers, none of them credentials.
- Package hashes, commit SHAs and pinned action SHAs — content addresses, not secrets.

## If this changes

A future finding is handled as rotate-then-rewrite: rotate the credential at its provider first,
then rewrite history with `git filter-repo` or BFG, then force-push and re-verify. Neither a
rewrite nor a visibility, billing or plan change is done from a session — the first destroys
shared history and the second three are the owner's decisions.
