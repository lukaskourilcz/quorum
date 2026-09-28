# NEEDED — inactive ventures

Outstanding work only. Do not execute these tasks while the ventures are inactive.
WebDev Signal joined this list on the owner’s instruction of 2026-09-28.
Historical completions and decisions remain in Git history and state/decisions/.

## Shared inactive-brand rendering

- [ ] **Name every other brand's faces the way the rasteriser finds them** — resvg resolves a static cut by its typographic family (name id 16), so `font-family="Archivo ExtraBold"`, `"Inter SemiBold"`, `"Petrona Black"` and the other legacy-named 600/800/900 cuts draw in the fallback face today. The kitted brands already use `rasterFamily`; switching the rest changes MMA Files' golden hashes, Tehdejší svět's pinned hash and WebDev Signal's renders, so it needs its own re-recording. [imp:3] [owner:ai] [time:1h] [kind:setup]

- [ ] **Decide whether the dark skins' quiet accents get fixed or the APCA floor stays at Lc 40** — over main's nine brands the worst pair reads Lc 41.2 (Door Money `#ff4d3d` on `#24191c`, 5.18:1 WCAG), 11% of 70,875 pairs sit below Lc 60 and 29% below Lc 75. Raising the floor means new accent or surface tokens for the dark brands in `studio/src/library.ts`. [imp:2] [owner:me] [time:20m] [kind:decision]

## WebDev Signal

- [ ] **Create the WebDev Signal accounts and record the handles** — #532. Two Instagram
  accounts, `@webdevsignal` (`en`) and `@webdevsignal.cz` (`cs`), each with its Threads profile,
  created by you in the platforms' own UIs after the trademark check. Nothing in the repository
  can create them, and no delivery feature is reconsidered before the handles exist. Never paste
  a credential into Git. [imp:4] [owner:me] [time:1h] [kind:setup]

- [ ] **Post the first rendered drafts by hand** — on a day the Design & delivery tab shows as
  rendered, copy the caption and Threads text from the draft card, take the panel PNGs from the
  repository paths the card lists under `state/ventures/webdev-signal/design-lab/assets/`, and
  post them from the accounts above. [imp:3] [owner:me] [time:20m] [kind:content]

- [ ] **Move WebDev Signal's health node off `planned`/`held`?** — `config/venture-slos.json`
  still gives webdev-signal `lifecycleStage: planned` and a `held` cadence, and the operations
  release audit pins it, while the venture has been operating since 2026-09-15. Moving it is a
  decision about what its SLO promises, not a refactor.
  [imp:2] [owner:me] [time:10m] [kind:decision]

## Contest Radar

- [ ] **Decide whether to open a Contest Radar social pilot lane** — the Instagram and TikTok slices
  are built, fixture-backed and disabled. Opening one needs a countersigned budget-capacity decision
  at `state/decisions/2026-08-30-contest-radar-budget-capacity.md` authorising the `$0.10/month`
  Apify rung, GoVIRAL's reservation against the shared quota, and your authority for the specific
  actors with their terms read at that time. Both lanes are `undecided`, which is the only honest
  verdict for a lane that has not run — a fixture proves the classification and the arithmetic and
  can prove nothing about yield. Leaving them shut is a legitimate answer.
  `docs/CONTEST-RADAR-OPTIONAL.md` has the detail. [imp:2] [owner:me] [time:20m] [kind:decision]

- [ ] **Decide whether a contest alert may ever be published** — the promotion candidate, its
  eligibility gate and the sanitized profile projection are built, and the capability edge to Social
  Distribution is registered `held` by
  `state/decisions/2026-08-30-contest-radar-promotion-posture.md`. Moving it to `allowed` needs a
  further countersigned decision naming the profile, the contest, the rule evidence and the
  disclosure text. Nothing publishes meanwhile, and campaign generation refuses every Contest Radar
  release independently of the edge. [imp:2] [owner:me] [time:20m] [kind:decision]

## MMA Files and FIGHTAIQ

- [ ] **Move MMA Files' and Titty Tuesdays' social drafts to queue v2 before either resumes** —
  `composeMmaFilesSocialQueue` and `composeTittyTuesdaysSocialQueue` in
  `orchestrator/src/social/venture-packs.ts` still write queue v1. The migration audit counts every
  v1 file as legacy evidence, so the first draft either venture writes after it resumes fails the
  post-cycle gate and loses that cycle's records, as DNESKAi's drafts did until #583. Write them the
  way `orchestrator/src/social/pack-drafts.ts` writes DNESKAi's. [imp:3] [owner:ai] [time:2h] [kind:setup]

- [ ] **Delete the dead Actions variables and secrets after #559** (the session had no tool for repository settings) — `MMA_FILES_LIVE_ENABLED`, `FIGHTAIQ_LIVE_ENABLED`, `FIGHTAIQ_ANALYSIS_ENABLED`, `MMA_FILES_INDEXING_ENABLED`, and the MMA Files and Titty Tuesdays Threads/Instagram variables and secrets in the repository settings. [imp:2] [owner:me] [time:10m] [kind:setup]

- [ ] **Delete the superseded `claude/article-image-selection-61rs70` branch in mma-files** — its
  correction path landed on `main` as `1c276eb`; the branch head `777ba7d` is not an ancestor of
  `main` and nothing on it is needed. [imp:1] [owner:me] [time:2m] [kind:setup]

- [ ] **Replace three curated MMA photographs that no longer exist on Commons** — probed on
  2026-08-09: `UFC Fight Night Belfast weigh-ins (29923390484).jpg`, `MMA gloves (Unsplash).jpg`
  and `O2 arena Praha 2019.jpg` all return `missing`. The rotation in
  `orchestrator/src/images/illustrative.ts` skips them, so nothing breaks and every article that
  reaches that rung simply loses its first choice; six of the nine still resolve. Finding
  replacements is the curated-set rule: open a candidate at 640px, check that no face in it is
  recognisable, write the Czech scene line. The scene-proposal queue below is where candidates
  now collect. [imp:2] [owner:me] [time:30m] [kind:content]

- [ ] **MMA Files' room card cannot link its article** — no delivery receipt under
  `state/ventures/mma-files/deliveries/articles/` records an `articleUrl`, so the card shows a
  title and a date with no link and no thumbnail; DNESKAi's card is complete because its receipt
  records one. If the MMA delivery path starts writing `articleUrl` the card fills in with no
  further work — decide whether that path change is wanted.
  [imp:2] [owner:me] [time:10m] [kind:decision]

## Titty Tuesdays

- [ ] **Rate the Titty Tuesdays idea cards in `/admin`** — the marketing room writes concrete
  campaign ideas every day and nothing has ever rated one, so the taste loop that turns your
  ratings into written style rules has no input and PALATE has nothing to work from. Nine cards sit
  unrated under the venture's ideas tab, every one still `proposed`
  (`state/ideas/titty-tuesdays/ledger.jsonl`); the count grows by roughly one a day until you rate
  them. Rating them is the whole of what starts the loop.
  [imp:4] [owner:me] [time:20m] [kind:decision]

- [ ] **Write season 002 for Titty Tuesdays before 2026-10-30** — season 001 expires then and the
  marketing room works from the current season; with none it has a standing objective and no
  material. The warning appears in the room's own daily brief as the date approaches.
  [imp:2] [owner:me] [time:60m] [kind:content]

- [ ] **Decide the Titty Tuesdays dock bay** — a bay is where a courier loads, and that venture
  *collects*: it pulls a feed and nothing is delivered to it. The bay lines up with no courier exit
  and a dashed lane in its own hue points back at the room, but the old window-and-sill drawing
  said the asymmetry more plainly. The day performance does not depend on the bay either way.
  [imp:2] [owner:me] [time:10m] [kind:decision]

## BOOKSOFHISTORY

- [ ] **Answer the BOOKSOFHISTORY launch questions** — lane priority (both at once, or
  English first with Czech two weeks behind), the starting cycle length (3 days or 4),
  and any must-include books or hard exclusions to append or correct in the authored
  200-entry seed library before its first live cycle. All three are listed in the
  design's "Open questions".
  [imp:2] [owner:me] [time:15m] [kind:decision]

## Door Money

- [ ] **Create Door Money's private source repository** — `BOOK-SOURCE-001` was signed on
  2026-08-29, so what is left is yours to create rather than to decide: the English manuscript's
  private Git repository, with the working clone outside this
  public checkout. Put the manuscript at the gitignored local path or pass it explicitly to the
  CLI; set `BOOK_PRIVATE_CLONE_PATH` for a local live desk. The optional fine-grained
  `BOOK_SOURCE_TOKEN` is only for the owner's read-only checkout step: the shipped runtime does not
  fetch a hosted database or send the token to the site. Check the matching item in
  `state/INBOX.md` only after accepting the 600-character excerpt cap, the 40 × 280-character
  exemplar cap and the rule that full text, chunks and embeddings stay private. Also record any
  English-edition launch date the growth room should plan backwards from.
  [imp:5] [owner:me] [time:20m] [kind:setup]

- [ ] **Run the bounded ingestion** — `BOOK-INGEST-002` was signed on 2026-08-29 at $3.00 for the
  program, $0.80 per day and $0.10 per call, all inside the company caps. With the private
  repository above in place, run
  `pnpm book:ingest -- --manuscript <ignored-path> --private-root <private-clone>` locally. A stop
  is resumable for the same manuscript hash; do not copy the source or private output into this
  repository to make a hosted run convenient.
  [imp:4] [owner:me] [time:20m] [kind:decision]

- [ ] **Clear the Door Money handle and create its accounts** — `DM-ACCOUNTS-003` was signed on
  2026-08-29. What is left: the shared handle/collision/trademark screen for "Door Money", whether
  the account should carry the English book title instead, and which of Instagram, TikTok, X,
  Threads or YouTube to open. You create and configure it;
  BoardlessAI remains drafts-only and has no credential, publisher or autopublish permission.
  [imp:3] [owner:me] [time:20m] [kind:legal]

## Tehdejší svět

- [ ] **Land the production domain and clear the handle** — `TS-ACCOUNTS-003` was signed on
  2026-08-29; the domain and the handle are what remain. Finish the product's existing `[imp:5]` domain task and
  absolute OG URLs, then clear `@tehdejsisvet` (or record a fallback), approve the
  no-flags bilingual bio in `state/INBOX.md`, and personally create the Instagram,
  Facebook and Threads profiles if approved. `dontwannaknow.vercel.app` must never
  appear in a bio; no agent receives a credential or channel.
  [imp:5] [owner:me] [time:40m] [kind:setup]

- [ ] **Approve Tehdejší svět's first 12-feature content bank** — review both language
  packages, their source coverage, tier labels, licences, send-target questions and
  Design Lab previews before day 1. Approval of an individual feature still does not
  create an account or post it; the owner performs every external post by hand.
  [imp:4] [owner:me] [time:60m] [kind:content]

- [ ] **Decide whether the product should move from Vercel Hobby to the existing Pro
  team** — this is likely `$0` marginal but remains a product-side owner decision.
  Tehdejší svět does not move the product, change its plan or infer permission from the
  BoardlessAI Pro subscription. [imp:2] [owner:me] [time:10m] [kind:decision]

## Personal Growth

- [ ] **Configure the separate Personal Growth private clone and ingest owner-selected journals.**
  Set `PERSONAL_GROWTH_PRIVATE_CLONE_PATH` to a private clone that does not overlap this
  repository, then run the documented ingestion command separately for the Czech and optional
  English Rapovej deník sources. Select the files and titles yourself; no agent may infer,
  translate or move private journal text into Git. [imp:3] [owner:me] [time:30m] [kind:setup]

- [ ] **Review the Personal Growth recurrence anchors in Admin.** Confirm the first OKRAJ and
  BBARAK dates and adjust them through the protected Timeline controls if the seeded dates no
  longer match the real publishing rhythm. The owner writes and publishes both artifacts.
  [imp:2] [owner:me] [time:10m] [kind:decision]

- [ ] **Authorise the owner-only Meta insight connection.** Create or select the Meta app for
  `lukaskouril93`, grant only the Instagram/Threads read permissions listed in
  `docs/PERSONAL-GROWTH-PROVIDERS.md`, and place the access token plus Instagram and Threads account
  ids in the approved server-side secret store. Do not reuse a brand publisher credential or put a
  token in Git. Leave `instagramInsights`, `threadsInsights`, `threadsSearch`, `providerLive` and
  `tokenRefresh` false until a reviewed connection test confirms the exact scopes and renewal path.
  This task grants no posting or Buffer authority. [imp:2] [owner:me] [time:30m] [kind:setup]

- [ ] **Decide whether Personal Growth should ever use Buffer.** The adapter, queue, purchase and
  publishing authorities are all held. If scheduling becomes useful, approve the exact plan,
  account and queue scope first; do not enable `bufferQueue` or select the buffer allocation
  merely because the seam exists. [imp:1] [owner:me] [time:10m] [kind:decision]

- [ ] **Enable Personal Growth provider flags only after the reviewed connection test.** Once the
  exact read scopes, account ids, token storage and renewal path are verified, countersign the
  production change that enables only the required insight flags. Keep `publishing` false;
  Personal Growth has no posting authority. [imp:2] [owner:me] [time:10m] [kind:decision]

## Retired automation — GoVIRAL, Marketing Shark and social distribution

These tasks apply only if the owner explicitly restores these ventures or social automation.

- [ ] **Finish the Meta connection app** — developer registration is complete on the account confirmed in-session. The BoardlessAI Social Studio form is ready with Instagram and Threads; final app creation and DNESKAi account OAuth remain pending. Marketing Shark connections are on hold. [imp:5] [owner:me] [time:10m] [kind:setup]

- [ ] **Create the DNESKAi Threads profile and authorize the exact Meta connections** — neither account has Threads yet. Store only tokens as secrets and IDs as variables, using the runbook. Verify identity before activating a connection. [imp:5] [owner:me] [time:30m] [kind:setup]

- [ ] **Approve the first article and each actual social post in Queue** — no account setup, agent instruction or dry check substitutes for those approvals. [imp:5] [owner:me] [time:15m] [kind:decision]

- [ ] **Record the first plays in GoVIRAL's library** — `state/ventures/goviral/plays/library.json` is empty, so the weekly brief's Key Lessons section says so (#550). A play needs a screenshot in `plays/screenshots/`, a category, the benchmark it beat and a RICE rating; `plays/README.md` has the scales. No room may write one, because nothing here measures a marketing result. [imp:3] [owner:me] [time:40m] [kind:content]

- [ ] **Turn on the practical item once DNESKAi renders it** — set `article.practicalItem` to `true` in `config/edition-quality.json` (#553) now that aifirst#99 validates and renders the field (the reader accepts quorum's `{ variant, items[] }` block as it stands). Until the switch is on the writer never sees the field, the story card falls back to the day's lesson, and the Friday tools post finds no tools and records why. The branch estimated under $0.20 a month of the existing model share. [imp:3] [owner:me] [time:5m] [kind:decision]

- [ ] **Fill the Friday tools prices before approving** — each Friday draft carries a `[DOPLNIT: ověřit u výrobce]` slot per tool; check the maker's price, edit it into the caption (or drop the line), then approve (#592). [imp:2] [owner:me] [time:10m] [kind:content]

- [ ] **Give `BOARDLESSAI_GITHUB_TOKEN` the `actions: write` permission** so an approval can dispatch the publisher (#574), under DEVSHARK-SOCIAL-003. [imp:4] [owner:me] [time:5m] [kind:setup]

- [ ] **Re-enable the social publisher's schedule trigger when a channel connects** — its hourly
  cron is commented out in `.github/workflows/social-publisher.yml` because it fired twenty-four
  times a day to confirm everything was still switched off. Restore it in the same change that
  connects the first account. [imp:1] [owner:me] [time:5m] [kind:setup]

- [ ] **Stripe live for devShark by 2 Oct** — the whole devShark plan sells the launch price (55 % below the regular Premium price, kept for the lifetime of subscriptions started 4 Oct – 2 Nov). The steps, the coupon and its env var are in react-express-app `NEEDED.md`; until `BILLING_ENABLED=true` the offer cannot be bought. If it slips, move the fact sheet block dated 2026-10-04 in `config/marketingshark.json` to the day billing goes live, so no draft names a price nobody can pay. [imp:5] [owner:me] [time:1h] [kind:setup]

- [ ] **Create both Threads profiles before 4 Oct** — @devshark.app and @dneskai, each from its Instagram account with the same handle; keep them empty until launch day and record the URLs in the plans' `channels[]`. The Meta connection items above cover the tokens. [imp:5] [owner:me] [time:20m] [kind:setup]

- [ ] **Send the rest of the devShark handoff** — the kit in `studio/brand-kits/marketingshark/` holds the 18 `recommended/` SVGs and the rules from react-express-app's brand guidelines and interim social skill. The README names a brand manual (`devshark-02-brand-manual.dc.html`), social templates (`devshark-04-social.dc.html`, `social/SKILL.md`) and `CHANGES.md` that are in neither the export nor the repository. Drop them in `studio/brand-kits/marketingshark/` if their rules should bind. The studio measured the clear space (the height of the d) as 77 % of the logo's height; correct it if the manual says otherwise. [imp:2] [owner:me] [time:10m] [kind:content]

- [ ] **Post the code question's first reply by hand** — until #587 connects devShark's Threads, approve and export `ms-<date>-devshark-en-threads-qotd` in the Queue, post the question at 09:00, then post `first-reply.txt` under it (#592). [imp:3] [owner:me] [time:5m] [kind:content]

- [ ] **Create the devShark profiles** — a LinkedIn Company Page (desktop or iOS), an Instagram professional account (Instagram Login, no Facebook Page needed) and its Threads profile; record the URLs here and in devShark's `client/product-catalog.ts`. [imp:5] [owner:me] [time:1h] [kind:setup]

- [ ] **Buffer Free account** — connect the LinkedIn Page and create the API key; store `BUFFER_API_KEY` as an Actions **secret** and `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN` as an Actions **variable**. Then run the live test in `docs/SOCIAL-PROVIDERS.md` ("The live test"): one multi-image post from the API, and write the result under its "Result" line. That is all; an agent session flips Buffer's verdict from it (the `[owner:ai]` item below). [imp:4] [owner:me] [time:45m] [kind:setup]

- [ ] **Meta developer app** with the Instagram use case (Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`) and the Threads use case (`threads_basic`, `threads_content_publish`), the devShark accounts as testers; store `DEVSHARK_INSTAGRAM_ACCESS_TOKEN` and `DEVSHARK_THREADS_ACCESS_TOKEN` as Actions **secrets** and `DEVSHARK_INSTAGRAM_USER_ID` and `DEVSHARK_THREADS_USER_ID` as Actions **variables**, as DNESKAi's are; calendar the 60-day token refresh. The adapter (#572) refuses a connection missing any of those four scopes. [imp:4] [owner:me] [time:45m] [kind:setup]

- [ ] **Flip Buffer's verdict from the recorded live test** — once "The live test" in `docs/SOCIAL-PROVIDERS.md` has a result: in one commit, set `BUFFER_LINKEDIN_FORMAT` from the result, set Buffer's `verdict` to `enabled` in `config/social-providers.json`, tick B4 in the decision, and move the four gates that pin Buffer as held, each citing the recorded test: `orchestrator/tests/social-providers.test.ts`, the migration audit's counts and `optionalProvidersHeld` (`migration-audit.ts`, `social-migration-audit.test.ts`), and the release audit's `provider-and-queue-safety` and `idempotent-migration-rollback` checks, which must accept a LinkedIn-only `enabled` Buffer and nothing else. [imp:3] [owner:ai] [time:45m] [kind:setup]

- [ ] **Hand devShark's credentials to the publisher in the activation commit** — beside the channel flip, add to the `publish` job's `env:` in `.github/workflows/social-publisher.yml`: `DEVSHARK_INSTAGRAM_USER_ID: ${{ vars.DEVSHARK_INSTAGRAM_USER_ID }}`, `DEVSHARK_INSTAGRAM_ACCESS_TOKEN: ${{ secrets.DEVSHARK_INSTAGRAM_ACCESS_TOKEN }}`, `DEVSHARK_THREADS_USER_ID: ${{ vars.DEVSHARK_THREADS_USER_ID }}`, `DEVSHARK_THREADS_ACCESS_TOKEN: ${{ secrets.DEVSHARK_THREADS_ACCESS_TOKEN }}`, `BUFFER_API_KEY: ${{ secrets.BUFFER_API_KEY }}` and `BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN: ${{ vars.BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN }}`. The same commit lists `marketingshark` in `social-post-receipt/1`'s venture enum and makes it a publishing venture. Without the env lines every devShark item resolves `credential-unavailable` and nothing sends. [imp:4] [owner:ai] [time:30m] [kind:deploy]

- [ ] **Time the first live approval** — once a devShark connection is active, approve one post with "Approve and publish now", follow the run link on its card, and record here the minutes from the click to the post's permalink (#574; target under five). [imp:3] [owner:me] [time:10m] [kind:setup]

- [ ] **Append the Premium launch block to devShark's fact sheet** — the 2026-09-25 block in `config/marketingshark.json` records the freemium decision and the English-only product. It names what every account gets, keeps the price out of anything a post may quote, and forbids both a price and any claim that learning is free. Read it and correct it there if devShark's facts differ. On the day Premium goes on sale, append one block dated that day with the price and the launch date, so the announcement below can state them. [imp:3] [owner:me] [time:15m] [kind:content]

- [ ] **Write the premium launch announcement** on launch day, after devShark's public copy step ships and the fact sheet has a block with the price and the date: save your copy as `state/ventures/marketingshark/announcements/<date>-devshark.json` in the shape of `contracts/fixtures/marketingshark-announcement.fixture.json`, dated that day. That morning the room drafts it with no model call and puts three drafts in the Queue for you to approve; a number the fact sheet does not state is refused (#576). [imp:3] [owner:me] [time:30m] [kind:content]

- [ ] **Read the three new closing lines** in `config/marketingshark.json` (`postKinds.*.footer`: the spotlight's, the teaser's and the weekly note's), written by #576 in the slide-5 line's register. Change them there if they do not sound like devShark; every post also waits for your approval in the Queue. [imp:2] [owner:me] [time:5m] [kind:content]

- [ ] **Reauthorize social connections if social automation is restored** — review `SOCIAL-DISTRIBUTION-CONNECTION-001` and countersign a new scope before connecting accounts or restoring publishing. Current article production needs no social connection. [imp:3] [owner:me] [time:20m] [kind:decision]
