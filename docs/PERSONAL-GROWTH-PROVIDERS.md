# Personal Growth provider audit

Verified on 2026-08-26. Only official provider documentation informed these contracts.

## Meta

The implementation pins Meta Graph API `v26.0`, released on 2026-07-29, for Instagram and the
official Threads API `v1.0` for Threads. Instagram Insights supports professional Business and
Creator accounts. The config records both current login
families because they use different permissions:

- Instagram Login: `instagram_business_basic`, `instagram_business_manage_insights`;
- Facebook Login: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`;
- Threads insights: `threads_basic`, `threads_manage_insights`;
- Threads public keyword search: `threads_basic`, `threads_keyword_search`.

Official references: [Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/),
[Instagram overview](https://developers.facebook.com/documentation/instagram-platform/overview),
[Instagram Insights](https://developers.facebook.com/documentation/instagram-platform/insights),
[Threads API](https://developers.facebook.com/documentation/threads),
[Threads Insights](https://developers.facebook.com/documentation/threads/insights), and
[Threads keyword search](https://developers.facebook.com/documentation/threads/keyword-search).

The adapter keeps Instagram account, Instagram media, Threads account, Threads post and Threads
search access separate. Live mode and token refresh have separate switches. All switches are off.
No switch enables publishing.

The normalizer accepts aggregate counts only. It drops audience identities, reply bodies,
demographic rows and unknown metrics. An empty response, unsupported or deprecated metric,
threshold restriction, missing permission, expired token and rate limit each produce an explicit
unavailable value. The implementation makes no fixed retention assumption. It records observations
at the useful 24-hour, 72-hour, 7-day and 28-day windows when Meta still supplies the metric.

Tokens, app secrets and refresh material belong to a server-side secret store. The adapter accepts
a transport that owns those values; its constructor cannot receive or serialize a token. The
repository and Admin client receive only the owner-only alias, native post metadata, aggregate
metrics and snapshot provenance.

## Buffer

Buffer's official API currently exposes GraphQL post creation, queue scheduling, scheduled-status
reads and Instagram/Threads channels. See [Posts & Scheduling](https://developers.buffer.com/guides/posts-and-scheduling.html).

`config/personal-growth-providers.json` records the audit but keeps the adapter disabled. The
repository assumes no plan, buys nothing and makes no external request. Current Personal Growth
authority also keeps Buffer mode, its queue flag and publishing closed. A future reviewed change
would need the owner's setup and approval before it could queue an already approved recommendation.
Manual posting remains the fallback.
