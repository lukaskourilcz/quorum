# Contest Radar: the two optional extensions, and what each is waiting for

Both extensions in the Contest Radar program are `held-optional`. Neither blocks the private core,
neither blocks its release audit, and both may stay held indefinitely without making anything
incomplete. This file records what each would be, what it would take to open it, and — for one of
them — why opening it is a decision rather than a piece of work.

## #414 — GoVIRAL-owned Instagram and TikTok contest discovery

**Held.** The contract is settled; nothing collects.

The idea is to test whether bounded public Instagram and TikTok discovery finds enough unique,
entry-ready Czech and Slovak contests to justify its share of the existing GoVIRAL Apify capacity.
The ownership split is already decided and is the reason the pilot can be considered at all:
GoVIRAL owns actor selection, queries, scheduling, retries, the shared quota and source health;
Contest Radar consumes recorded accepted leads and nothing else.

`social-contest-lead/1` exists in `orchestrator/src/contracts/contest-radar.ts` and is the shape a
lead would arrive in. It is a ceiling rather than a description: a URL, a caption clipped to 280
characters, a platform, when it was seen and when it stops mattering. It carries no handle, no
author, no follower count, no audience identity, no comment and no media. A lead points at a page
that might be a contest; everything that makes it one comes from that page's own rules, read
afterwards.

**To open it, all of these:**

1. The private core is complete and its release audit passes. *(Done.)*
2. Current shared-capacity evidence shows the GoVIRAL Apify quota can absorb the pilot's share.
3. A countersigned budget-capacity decision authorises the Apify rung — the same one
   `mayContestRadarSpend` already requires and refuses without.
4. Owner source authority for the specific actors, with their terms read at that time. Provisional
   actor names in the original brief are not authority.

Facebook is out of scope, along with private groups, login cookies, owner sessions, DMs, comment
collection, browser automation and any account interaction.

## #430 — Rule-permitted referral promotion through Social Distribution

**Held, and opening it is an owner decision rather than an implementation task.**

The idea is that a verified Contest Radar opportunity could become a transparent contest alert on
an owned social profile, but only where the contest's official rules explicitly permit public
promotion or referral sharing, and only where the target profile has an independent editorial
reason to publish it.

**This contradicts a rule the founding decision established**, and that is the honest blocker
rather than a missing dependency. `config/venture-capabilities.json` carries
`contest-radar-outbound-isolation`: Contest Radar has no outbound content edge to any venture,
service or public surface. The release audit checks it. Implementing #430 means removing or
narrowing that rule, which is a change to what the venture is — an owner-only tool becomes a
content source — and no amount of evidence gathered inside the tool can authorise that.

**To open it, in this order:**

1. An owner decision that amends the founding's outbound posture, naming exactly which capability
   edge it grants and to which target.
2. The Social Distribution foundations the issue lists, verified present rather than assumed.
3. A rule-permission check that reads the contest's own rules and refuses by default: silence is
   not permission to promote, exactly as silence is not evidence a contest is free.

Everything the issue rules out stays ruled out under any decision: no simulated profile as a
participant, no counting several owner-controlled profiles as several people, no automated entry
or follow or share, no invented referral link, no self or reciprocal referral, no click or view
recorded as an entry, and no broadening of a capability or routine scope through this route.

## Why both stay held

The private core is useful without either. It reads four free structured sources, clusters and
extracts at `$0`, ranks by what is worth an evening, resolves lawful entry capacity and opens the
windows a person should work — and it does all of that without a social collector or a publishing
path. Adding either extension buys reach or coverage; neither buys correctness, and both add a way
for this venture to touch the world it currently only reads.
