# Social asset hosting

Status: built and held. Authority: GitHub #570 (step B3 of `SECOND-HANDOFF-25-9-2026.md`) under
`state/decisions/2026-09-26-devshark-social-queue.md`.

Instagram and Threads fetch images from a public URL when you publish. They do not accept an upload.
This page covers where that URL points, how the publisher proves it before a send, and how long a
committed frame stays in the tree.

## Where the URL points

`SOCIAL_ASSET_BASE` picks the base. Leave it empty and you get `jsdelivr`.

| Value | URL Meta fetches | Needs |
| --- | --- | --- |
| `jsdelivr` (default) | `https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@<sha>/site/public/social/<rest>` | nothing: the repository is public and the file is committed |
| `site` | `PUBLIC_SITE_URL` + `/social/<rest>`, the earlier behaviour | a deploy that carries the frame; site deploys are manual (`git.deploymentEnabled: false`) |
| `blob` | Vercel Blob, the documented fallback | `BLOB_READ_WRITE_TOKEN` and an adapter; neither exists, so every item with an image is held |

`<sha>` is the newest commit that touched the frame: `git log -1 --format=%H -- <path>` in the
publisher's full-history checkout, which runs after the cycle commit. jsDelivr serves a file at a
commit hash forever (`cache-control: immutable`, `x-jsd-version-type: commit`), so a URL handed to
Meta keeps working after the file leaves the tree. `orchestrator/src/social/media/assets.ts` pins
the repository name; a runner in a fork cannot point Meta at the fork.

jsDelivr costs nothing and needs no account or secret. It serves
GitHub files up to 20 MB and caches a commit-hash URL for good (https://github.com/jsdelivr/jsdelivr).
A devShark frame runs about 50 KB as PNG and 70 KB as JPEG.

## The check before a send

`gateSocialAssets` in `orchestrator/src/social/media/gate.ts` runs after every other publisher gate
and before any provider call. For each frame, in this order:

1. The format must be one the item's platform takes: a PNG for Instagram is held here, before git
   or the network is asked, because Instagram takes JPEG only.
2. A recorded hash must exist. An approved package records each hosted file as `{ path, sha256 }`
   and counts only while it still hashes to the item's `sourcePackage.packageHash`. DNESKAi's
   composer records `frameHashes` in `state/social/assets/<date>.json`. MMA Files and Titty Tuesdays
   record deck hashes without paths, so their frames are held; both ventures are paused.
3. For `jsdelivr`: a commit must carry the frame, and the bytes in that commit must match the
   recorded hash. The publisher reads the commit rather than the working tree, because jsDelivr
   serves the commit. Those bytes must then meet the platform's own image rules
   (`PLATFORM_IMAGE_RULES` in `orchestrator/src/social/media/validate.ts`, from Meta's references):
   at most 8 MB and a width of 320 to 1,440 on both; for Instagram JPEG only, aspect 4:5 to
   1.91:1, sRGB; for Threads JPEG or PNG, aspect up to 10:1.
4. A `HEAD` to the exact URL, through `safeFetch`: the host must be in `runtimeHosts` of
   `config/network-allowlist.json` (`cdn.jsdelivr.net`), the answer a 200 with no redirect, and the
   content type the one the extension promises (`image/png` or `image/jpeg`).
5. For `site`, nothing in git proves what a deployed site serves, so the publisher downloads the
   frame from the configured host, hashes it and applies the same image rules.

A re-render from the Design Lab (#575) writes its own frames under
`site/public/social/<brand>/<date>/<locale>/<revision>/` and a package revision under
`state/ventures/marketingshark/packages/<date>/<brand>/revisions/<revision>.json` that records
their hashes. The new item's `packageHash` names that revision, so step 2 counts its records exactly
as it counts the room's, and retention prunes the frames by the same date segment.

The adapter receives the URLs that passed and never builds one, together with each frame's alt text
when the approved package pairs frames with slides. `meta.ts` refuses a frame without a proved URL
before it makes any request.

## A held item

One failed frame holds the whole item. The queue file stays byte for byte as it was, so the item is
still due and the next run checks again. The runner writes why to
`state/social/asset-holds/<queue-file>.json` (`social-asset-hold/1`) and removes that file once the
frames pass. A hold is not a send, a failure or an ambiguous delivery: it pauses no connection and
no venture, and the report counts it as `assetHeld`.

| Reason | Means |
| --- | --- |
| `asset-hash-mismatch` | the committed or served bytes differ from the record, or the package changed after the item was drafted |
| `asset-hash-unrecorded` | no record names the frame's hash |
| `asset-unsupported` | the approved bytes are not an image the platform takes: a PNG for Instagram, the wrong size, aspect or colour space |
| `asset-unreachable` | anything else: uncommitted, removed by the newest commit, not on the allowlist, not a 200, the wrong type, or a base that is invalid or not built |

The publisher never tries a second URL for a frame that missed.

## Retention

The cycle's daily queue-health step (`pnpm queue:health`) also runs
`orchestrator/src/social/media/retention.ts`. It removes a file under `site/public/social/` once
the first `YYYY-MM-DD` segment of its path falls more than 90 days before the run date. Before it
deletes anything it hashes the file into `state/social/asset-retention/<date>.json`
(`social-asset-retention/1`); a second run the same day adds to that record. A file with no date
segment or an unexpected name stays and the record names it.

The workflow step stages the record and the deletions only (`git ls-files --deleted`). The step
also runs after a failed cycle, and a frame that cycle wrote has not passed the post-cycle gate.
The packages and the composer's asset records keep the hash of every frame an item named.

## The Vercel Blob fallback, not built

Choose Blob only if jsDelivr stops serving GitHub files. It would upload each approved frame with
`@vercel/blob` `put()` using `BLOB_READ_WRITE_TOKEN`, record the returned URL and its hash beside the
item, and let the same pre-send check `HEAD` it. On Hobby, Blob is free within 1 GB of storage,
10,000 simple and 2,000 advanced operations and 10 GB of transfer a month, shared with the rest of
the project, and it stops for 30 days past any of them. On Pro it bills against the monthly credit
(https://vercel.com/docs/vercel-blob/usage-and-pricing, read 25 September 2026). Building it takes a
new token and an owner decision; a Pro bill also takes a ledger line in `state/treasury/ledger.json`.
Until then `SOCIAL_ASSET_BASE=blob` holds every item with an image.
