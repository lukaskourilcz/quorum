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
On 2026-09-27 Chrome showed the DNESKAi public profile while signed into a different profile.
Meta's developer portal required developer registration and acceptance of Platform Terms;
that acceptance was left pending for the owner. No Meta credentials were present in the
repository's Actions secret inventory. Threads profiles have not been verified.

Use one owner-controlled Meta developer app, with Instagram and Threads use cases/products.
Each Instagram account must be Business or Creator. For accounts managed by the app owner,
configure the necessary app roles/test accounts and accept their invitations. Follow the Meta
app dashboard's current review/business-verification requirements before expanding beyond
those accounts. Do not request messages, comments, ads or analytics access for this bridge.

The existing connection routes are:

| Account | API/login route | Required publishing permissions |
| --- | --- | --- |
| @devshark.app Instagram | Instagram Login; no Facebook Page required | `instagram_business_basic`, `instagram_business_content_publish` |
| @dneskai Instagram | Facebook Login; linked Facebook Page required with current registry | `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` |
| DNESKAi Threads | Threads OAuth, separate token/account ID | `threads_basic`, `threads_content_publish` |

If using Instagram Login for DNESKAi too, update its registry login mode and scope family
before installing its token. Never mix tokens from the two login routes.
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
