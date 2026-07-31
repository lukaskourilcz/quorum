# Caught Up adoption

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: accepted

## Decision

The owner adopts Caught Up as Venture 001 by owner fiat. The founding council did
not discover this venture, and no fixture or live evidence is reclassified to
suggest otherwise. Live `founding` cycles remain disabled and must keep throwing.

BoardlessAI moves to operating, pre-revenue mode. The current stage advances from
DISCOVERY to VALIDATION by changing the existing `current` field in
`config/stages.json`. This is the first post-discovery stage defined by that file.
SCOUT may resume live evidence collection, while every fixture stays ineligible.

## Operating budgets

The owner sets these envelopes:

| Envelope | Previous | Adopted |
| --- | ---: | ---: |
| Monthly API | $12 | $15 |
| Daily API | $0.40 | $0.70 |
| Venture standup | $0.20 | $0.20 |
| Caught Up meeting | none | $0.08 |
| Edition production | none | $0.35 |

The expected API run rate is about $10.71 per month. The fail-closed monthly
reserve remains $15 API plus $2 media. Hosting has $0 incremental project cost
under the owner's existing Vercel Pro subscription, and email fits the verified
Resend free tier. The planned maximum stays $17 under the $20 all-in cap. The
owner must countersign the API envelopes before the new meeting phases go live.

## Brand decision

The 2026-07-28 BoardlessAI clearance covered hobby use only. Public product
identity and any future revenue attach to Caught Up. BoardlessAI remains the
studio label. The owner must rename or clear BoardlessAI before accepting the
first paid sponsorship.

## Hosting and email decisions

The owner confirmed on 2026-07-31 that the projects use an existing Vercel Pro
subscription. The project records $0 incremental hosting cost under that
subscription. The owner must review the cap if either project leaves Pro or the
invoice allocation changes. Vercel's Pro documentation lists a $20 monthly
platform fee with one deploying seat and $20 usage credit.

Resend's official pricing and account-limit pages were checked on 2026-07-31.
The free transactional plan includes 3,000 emails per month and 100 per day.
Five meeting emails per day need about 150 emails per month, so the planned cost
is $0. The runtime must stop and create an INBOX item before using a paid tier.

Sources:

- <https://vercel.com/legal/terms>
- <https://vercel.com/docs/plans/pro-plan>
- <https://resend.com/pricing>
- <https://resend.com/docs/knowledge-base/account-quotas-and-limits>

## Media and storage

Daily media uses deterministic composition and costs $0. Generated imagery needs
a board vote and the existing media budget path. Social assets remain committed
under the first-party `/social/` path. Caught Up heroes remain in
`public/illustrations/`.

The project adopts Vercel Blob, not Supabase, only after social assets add about
250 MB to the repository or a channel begins autopublishing more than one post a
day. Bytes remain reproducible cache until one of those triggers fires.

## Portfolio notification amendment

The 2026-08-01 portfolio expansion retires the planned five per-meeting emails.
The runtime now produces one idempotent digest after the night room, with one
line per active meeting and a 400-word ceiling. At one recipient this needs at
most 31 transactional messages in a long month. The verified Resend Free limits
remain 3,000 per month and 100 per day. The original paragraph above is retained
as historical decision context, not current runtime behavior.

## Authority

`config/board-authority.json` defines three rings. The board may select and write
editions inside its gates. The owner approves money, accounts, scopes, new code
surface and Caught Up code. Security, honesty, compatibility, accessibility,
sanitization and human-only payments remain locked.
