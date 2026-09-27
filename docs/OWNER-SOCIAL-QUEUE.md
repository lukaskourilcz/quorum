# Owner-reviewed DNESKAi and devShark publishing

Implementation: quorum #585–#588 and react-express-app #237. Authority is the
[owner's request](../state/decisions/2026-09-27-owner-editorial-queue.md).

## Daily workflow

1. Open `/admin/queue`. DNESKAi articles wait here before delivery to the reader app.
   Pick one of four Czech headlines (or edit it) and one of two licensed free-provider
   photos or the fal illustration. A failed provider or exhausted image budget shows an
   unavailable slot; it never substitutes an unrelated image silently.
2. Approve the article. A serialized workflow prepares its Design Lab carousel, social
   drafts and article delivery. A saved decision cannot be edited into different content.
3. Review each social draft separately. Edit captions in Queue. Open Design Lab to change
   slide text/layout, save, then create replacement drafts in Queue. DNESKAi also lets you
   choose another article image. Any replacement cancels the previous draft and clears approval.
4. Approve a specific post/window in Queue. The publisher checks the approved content hash,
   frame hashes, connected account, pause switches, cadence and provider limits before sending.
   Account setup never approves backlog posts. Old unreviewed DNESKAi drafts remain held.

Article rejection sends nothing. Leave a card pending to hold it. Article approval does not
approve Instagram or Threads. A provider timeout is reconciled rather than blindly retried.
MarketingShark uses the same social Queue for devShark's English content.

## Meta setup and current blockers

The intended Instagram handles are **@dneskai** and **@devshark.app**. Recording a handle is
not proof of account ownership or professional status. Both connections remain held.
On 2026-09-27 the owner created **BoardlessAI Social Studio**, Meta app
`1563788535067994`, with Instagram and Threads use cases. Its Instagram app ID is
`4543962322555848`. The Instagram permissions `instagram_business_basic` and
`instagram_business_content_publish` are ready for testing. No account OAuth grant or token
has been issued. The owner approved adding both handles as Instagram Testers, but Meta
rejected both submissions with “Form can't be saved,” including the direct Add account flow.
Manual owner verification of that Meta form is pending.

Chrome successfully switched into DNESKAi and its settings confirmed a Creator account;
Apps and websites showed no authorized application. The owner confirmed devShark still
needs professional conversion and neither account has a Threads profile. No Meta credentials
were present in the repository's Actions secret inventory.
Use one owner-controlled Meta developer app, with Instagram and Threads use cases/products.
Each Instagram account must be Business or Creator. For accounts managed by the app owner,
configure the necessary app roles/test accounts and accept their invitations. Follow the Meta
app dashboard's current review/business-verification requirements before expanding beyond
those accounts. Do not request messages, comments, ads or analytics access for this bridge.

The existing connection routes are:

| Account | API/login route | Required publishing permissions |
| --- | --- | --- |
| @devshark.app Instagram | Instagram Login; no Facebook Page required | `instagram_business_basic`, `instagram_business_content_publish` |
| @dneskai Instagram | Instagram Login; no Facebook Page required | `instagram_business_basic`, `instagram_business_content_publish` |
| DNESKAi Threads | Threads OAuth, separate token/account ID | `threads_basic`, `threads_content_publish` |

Both Instagram registry bindings use Instagram Login. Never install a Facebook Login token
in these bindings or mix the two scope families.
Meta's [official Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
confirms that this route needs a professional account but no linked Facebook Page.

Store tokens only in GitHub Actions secrets; store IDs as repository variables:

| Token secret | Account-ID variable |
| --- | --- |
| `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN` | `CAUGHT_UP_INSTAGRAM_USER_ID` |
| `CAUGHT_UP_THREADS_ACCESS_TOKEN` | `CAUGHT_UP_THREADS_USER_ID` |
| `DEVSHARK_INSTAGRAM_ACCESS_TOKEN` | `DEVSHARK_INSTAGRAM_USER_ID` |

The admin needs its existing `BOARDLESSAI_GITHUB_TOKEN` with repository contents write and
Actions write for saving decisions and waking the workflows. Do not put it in client variables.
Use the existing social activation runbook to verify identity/scopes and token health, activate
only these exact connections, then enable the publisher's schedule and social switch. Keep
LinkedIn and unrelated ventures held. Plan token refresh before expiry. Every real test post
still needs the owner's Queue approval; dry checks do not establish verified live delivery.

## Deployment and review records

The code must be deployed to expose the new admin UI. A Git merge alone is not a Vercel deploy.
Reviews live under `state/editorial/reviews`, immutable owner selections under `decisions`, and
release receipts under `releases`. No automatic delivery is permitted for an article without its
matching selection. Social revisions and approvals retain their own identities and hashes.

## Reference monitoring

`social-references.yml` polls the public feeds of `evolving.ai` and `activeprogrammer`
every six hours, with four results per account and a $0.03 provider charge ceiling per run.
Its $5 monthly ceiling is inside the existing shared $19 Apify credit, not an added allowance.
A fresh account-usage reading is required. The workflow pushes a reservation before the paid
request and retains it on failure. `state/PAUSED` and the autonomy kill switch stop polling.
Deduplication avoids treating a previously observed post as new; a failed poll preserves the
previous packet without renewing its expiry. This is bounded polling, not a source-post webhook;
more than four new posts between polls can exceed the sample.

Only post references and format measurements (slide count, caption length, question hooks)
are retained. Fresh observations from both accounts influence the initial DNESKAi Design Lab
family/type scale; recorded recipes and the owner's saved layouts take precedence. This is
format inspiration, not a claim to reproduce their typography or image composition exactly.
Posts use original Czech editorial copy and the selected licensed or generated image.
[Apify's input schema](https://apify.com/apify/instagram-scraper/input-schema) documents the
profile URLs and per-URL result limits. No Instagram login cookies are supplied to the scraper.

## devShark source sync

Before each live `ms-daily` room, the cycle imports question and coding-challenge snapshots
from the public `react-express-app` main branch, recording the exact source commit and hashes.
An import failure stops the room. Saturday quizzes and Sunday feature drafts extend the
existing weekday rotation to seven days. These are drafts; cadence and owner approval still
control actual posting. Product claims remain the existing reviewed MarketingShark facts.

The first live reference check on 2026-09-27 read eight posts across both accounts and
persisted a $0.03 reservation before scraping (Actions run `36326676457`). The shared
usage reader uses Apify's account-limits endpoint, `data.current.monthlyUsageUsd`;
unavailable or invalid totals refuse a new reference run.
