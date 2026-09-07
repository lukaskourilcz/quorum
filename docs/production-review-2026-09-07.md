# Production review · 7 September 2026

**Release status: not yet verified for production.** Repository fixes and offline
checks are complete in stages below. A fresh article/image delivery, deployed
configuration and responsive browser acceptance remain explicit launch gates.

Scope: DNESKAi, MMA FILES, marketingShark for devShark.app; shared goViral and
DesignLab. Paused ventures and historical evidence are retained. No subscription,
new account, social publishing permission or higher spend cap was introduced.

## Issues and implementation

| Repository | Issue / PR | Finding and change |
| --- | --- | --- |
| quorum | #520 / #519 | Pause remaining unrelated Kvórum and Personal Growth rooms; retain FightAIQ only as MMA FILES dependency. |
| quorum | #514 / #519 | Daily runs stopped at tests that assumed paused projects were operating. Fixtures and public calendar/index assertions now respect the registry. |
| quorum | #515 / #519 | Correct actor-specific inputs, Threads snake-case metrics, one result allowance across topics, per-request charge ceilings and reservation before network work. Paid discovery now targets dneskai, mma and devshark. |
| quorum + devShark | #516, react-express-app#126 / #519, #127 | Shared product-owned bank loader; 2,511 current questions, all with Czech fields, 661 with code. Committed-source import plus --check for drift. Ocean blue and the real product fin. |
| quorum | #517 / #519 | Content-addressed, bounded cache for pure template validation; fresh admin lifecycle/ratings/state reads remain uncached. New plain-question template removes the empty code panel; code-question logo placement is corrected. |
| quorum + DNESKAi | #518, aifirst#72 / #519, aifirst#73 | Historical source ledger pairs unrelated sources and claims. Current curation already has a pool-order regression test. Added writer rejection of missing, duplicate and ambiguous source IDs before any provider call. Reader-side editorial hold preserves original package evidence. |
| aifirst | #71 / #73 | Local MMA FILES banners in both placements, safe destinations/paths, narrow-screen asset switch and width constraints. |
| mma-files | #22 / #23 | DNESKAi promotions in empty placements, uncropped delivered creatives, safe links, real corrections-report fallback and configurable email. |
| react-express-app | #126 / #127 | Fixed the fflate dependency advisory and removed the unused client badge wrapper. Shared coding badges and stored records remain. |

## Evidence and verification

Baseline: the latest eight inspected BoardlessAI runs failed. Run 34093368539,
job 101651451160, had 2,580 passing orchestrator tests and two failing pause
assumptions. DNESKAi's missed-day issues #64–70 covered August 31–September 6.
The September 7 automated skips still name the repository release gate.

| Check | Evidence / limit |
| --- | --- |
| Original release blocker | 15 focused tests passed after isolating pause fixtures. |
| goViral contracts | Provider-contract and source suite pass; network mocked, no paid scrape performed. |
| Source integrity | Missing/duplicate/ambiguous references reject before fetch or model call. Existing curation-order regression passes. Semantic truth still requires actual source review. |
| Full orchestrator scan | Final scan ran 2,591 tests: 2,590 passed and one stale banner-flag assertion failed after reciprocal promotions were enabled. Corrected that assertion; focused marketing/config suite passes. Final all-workspace gate is recorded in PR #519. |
| Full site scan | All 822 tests across 175 files pass after selected-view loading and pause-aware calendar/index fixes. TypeScript, lint and production build pass. |
| Carousel studio | 180 tests passed in the full suite; its sole remaining seed-count assertion was updated for the new 13th layout. The complete 18-test renderer file and gallery rerun pass. |
| DNESKAi | 226 tests, content validation, lint, TypeScript and production build pass. Largest of 31 entries is 103.7 kB gzip against 110 kB. |
| MMA FILES | 68 tests, TypeScript, lint and a production build with demo mode disabled pass. Final contact changes also passed GitHub CI run 34115679222. |
| devShark | API typecheck, launch contracts, client TypeScript and both Vite builds pass. Root/client production audits: zero vulnerabilities. |
| marketingShark full dry run | 2026-09-07 selected testfix-10, drafted both languages, render summaries and four social draft records; $0, no external provider or publication. |
| Live credentials | Historical Actions presence observed; authentication/credit and current Vercel environment are not verified. |
| Responsive browser QA | Open. Preview service forwarded Vite flags to Next and failed to start; no substitute browser pass is claimed. |

All temporary tsx IPC failures in this container were bypassed by Node's supported
`node --import tsx` execution path, without changing project scripts or gates.

## Keys and configuration

Values are never printed here. “Observed” means present in the masked log of the
baseline Actions run, not a live API authentication result.

| Setting | Location / purpose | Audit status |
| --- | --- | --- |
| APIFY_TOKEN | quorum Actions; approved Apify actors share one account token | Observed. No separate per-actor API keys required. Check account credit/spending limit and actor access. |
| ANTHROPIC_API_KEY | quorum Actions; editorial/marketing models | Observed; live call not repeated. |
| OPENAI_API_KEY | quorum Actions; configured model/vision tasks | Observed; live authentication not verified. |
| FAL_KEY | quorum Actions; generated illustration rung | Observed; prepaid balance and generation not verified. |
| ARTICLE_ILLUSTRATION_ENABLED | quorum secret or variable | `true` observed; workflow reads both supported locations. |
| PEXELS_API_KEY, PIXABAY_API_KEY | quorum Actions; optional licensed-photo search | Optional alternatives, never needed in magazine consumers. No current validity claim. |
| DELIVERY_APP_ID, DELIVERY_APP_PRIVATE_KEY | quorum Actions; narrowly scoped cross-repo delivery | Presence guards true. Verify installation includes both readers and Contents permissions. |
| CAUGHT_UP_LIVE_ENABLED, PORTFOLIO_LIVE_ENABLED, MMA_FILES_LIVE_ENABLED | quorum variables | `true` observed. Does not override the quality gate. |
| ADMIN_USER, ADMIN_PASSWORD | BoardlessAI Vercel | Code checks signed, expiring, HttpOnly/SameSite cookies and fails closed when missing. Live setup unverified. |
| CRON_SECRET, QUORUM_DISPATCH_TOKEN | BoardlessAI Vercel | Cron authentication and workflow dispatch wiring reviewed; current values/access unverified. |
| BOARDLESSAI_GITHUB_TOKEN / repository / branch | BoardlessAI admin writes | Verify production targets quorum/main with required scoped permissions. Never use a browser-visible secret. |
| CAUGHT_UP_SITE_URL, MMA_FILES_SITE_URL | quorum variables | Match actual reader origins; fallback readers are caughtup-ai.vercel.app and mma-files.vercel.app. |
| NEXT_PUBLIC_DEMO_MODE | MMA FILES Vercel | Must be false after a real delivery. Local production build tested with false; deployed value unknown. |
| NEXT_PUBLIC_ALLOW_INDEXING | MMA FILES Vercel | Keep false until real content/rights review. |
| NEXT_PUBLIC_CORRECTIONS_EMAIL | MMA FILES Vercel | New optional monitored address; public issue form is the working fallback. |
| Supabase/session/rate-limit settings | devShark Vercel | Follow devShark NEEDED.md. Code/build review does not verify live auth, data or ACL. |

Vercel's connector returned `teams: []` twice. No usable project scope was
available. GitHub's connector does not expose secrets APIs; masked run logs were
used only to distinguish absence from runtime failures. Do not rotate, copy or
recreate keys merely because this session cannot inspect their live environment.

## goViral operation

- One APIFY_TOKEN is sufficient for the scheduled Instagram search, hashtag,
  Threads and Explore actors. Check actor access in the same Apify account.
- Correct fields were checked against the actors' official input documentation:
  [Instagram search](https://apify.com/apify/instagram-search-scraper/input-schema),
  [hashtag scraper](https://apify.com/scrapesmith/instagram-hashtag-scraper/input-schema),
  [Threads](https://apify.com/themineworks/threads-scraper),
  [Explore](https://apify.com/agentx/instagram-trending-scraper/input-schema).
- Search uses a comma-separated string; hashtag limits are per hashtag; Threads
  uses mode/searchQuery/maxPosts and returns snake-case engagement fields;
  Explore requires max_results and a country. The configured US Explore feed is
  broad context, not evidence of a Czech trend.
- The current profile-monitor step deliberately skips while trackedAccounts is
  empty. Add real public benchmark accounts relevant to the three launch brands;
  do not invent accounts or send social credentials/cookies to scrapers.
- `threads-fallback` is configured but not actually an automatic failover. It is
  disabled, and its old per-1,000 estimate is not a current verified quote. Recheck
  its pay-per-usage plan and adapter before enabling it.
- Failures keep their full reservation because a timeout may still bill. Reconcile
  estimates against provider usage. An account-level hard spend limit supplements
  the local $5 allowance; do not assume a token implies the Free plan.
- Prioritize freshness, distinct authors, relevant language and source diversity
  over raw post count. Measure useful accepted signals per dollar. Add fallback
  only after a failed-run rate and stale-data interval justify its cost.

## DesignLab and marketingShark

The code uses deterministic typography/layout, font metrics, truncation checks
and content hashes. Preserve these advantages. The new cache stores only pure
validation by full template-content hash (maximum 128 entries), so an edited
proposal invalidates its verdict without hiding fresh admin ratings.

The current source snapshot comes from devShark commit
77c8dfd1e20410ba3ad5c702fea49e2a3619119b. Re-import from a clean committed clone,
then check without rewriting:

```sh
# Run from quorum/orchestrator; use the actual absolute clone path.
node --import tsx ../scripts/marketingshark-import-bank.ts --brand devshark --source /path/to/react-express-app
node --import tsx ../scripts/marketingshark-import-bank.ts --brand devshark --source /path/to/react-express-app --check
```

The gallery includes the plain-question template and packages record the actual
rendered template ID. A no-code question no longer reserves an empty code panel;
its options come directly from the source bank and have separate text frames.
The product fin is the same path used by devShark's SharkFin component.

The [five-slide contact sheet](production-review-2026-09-07/devshark-preview.png)
is a deterministic review sample based on question rm-react-102. It is not a
published post or a live model generation. SVGs beside it preserve exact text.

Next improvements, in order:

1. Extend the new selected-view loading to the remaining admin readers. Full
   DesignLab template/state validation and selected-brand details now load only
   in DesignLab; navigation uses lightweight accurate counts. Other venture
   readers still need the same separation.
2. Render preview thumbnails on demand and reuse exact content-hash assets. Show
   per-slide fit failures before export; keep a one-action regenerate for the
   failing slide, without regenerating the whole deck.
3. Add an owner workflow that picks brand, question/topic and format once, then
   exposes copy editing alongside previews, with autosaved drafts, version history
   and one export of the complete approved set. Keep correct answers source-owned.
4. Add plain-language quality checks for vague hooks, long options, repeated CTAs
   and factual claims. Evaluate a fixed multilingual sample set before changing
   prompts or models; compare rejection rate, latency and cost per accepted deck.
5. Add a scheduled source-snapshot drift report across devShark/quorum. The new
   --check command is the enforcement primitive; cloning private sources requires
   an explicitly scoped repository integration, not a general admin token.

## Mobbin references and product choices

- [Ghost news theme](https://mobbin.com/screens/756cbee5-cff7-4fe2-9b56-0c6d4e5a6baf):
  one dominant story, secondary cards and a narrow featured column. For the
  magazines use one reading column on mobile, two on tablet, an optional rail on
  desktop; prioritize headline/date/source over extra panels.
- [Perplexity Discover](https://mobbin.com/screens/423c2053-3a7f-4e84-ac8a-0723f1790a45):
  concise source and recency metadata beside stories. Use this to clarify evidence
  and edition age, not to turn source count into a quality score.
- [Buffer content workspace](https://mobbin.com/screens/f24bfc15-76c1-49ac-82c7-e41dd16d1738):
  separate ideas/templates/feeds and show thumbnail, title and source together.
  Useful for DesignLab's create/review/export flow.
- [Threads trends](https://mobbin.com/screens/d73b99cf-cea7-4e78-ab32-dcee518537cb):
  useful as a reference for concise trend discovery, not a replacement for measured
  timestamps and source attribution in goViral.

## Paid tools: proposals only

| Option | Benefit | Trade-off / next decision |
| --- | --- | --- |
| Existing fal API | Generated illustrations where licensed search has no suitable image | Already wired. Verify balance and evaluate a small quality sample within existing caps before buying another image provider. |
| [Placid](https://placid.app/pricing) | Template editor, REST/URL generation and MCP; suitable for owner-edited branded slides | Test Czech typography and a 5-slide export. Basic lists 500 credits, one image per credit; confirm current currency price in the account. |
| [Bannerbear](https://www.bannerbear.com/pricing/) | Hosted templates and [image-generation API](https://developers.bannerbear.com/v2) | Automate was listed at $49/month with 1,000 image credits. It would consume nearly the entire current $50 operating cap; do not add without a budget change. |
| Apify paid allowance | More samples after useful-signal yield is measured | Repair contracts and focus the three products first. A larger plan cannot fix malformed inputs or stale sources. Verify [current pricing](https://apify.com/pricing) before choosing a plan. |

Do not subscribe to multiple render services at once. Compare one representative
CZ/EN deck against the current deterministic renderer: text fidelity, edit time,
render latency and cost per accepted five-slide carousel.

## Final production gates

- [ ] All final PR checks pass; merge only the reviewed branch heads at the end.
- [ ] Verify BoardlessAI's Vercel environment and deploy the final build. Its
  vercel.json disables automatic Git deployments, so merging main alone is not deployment.
- [ ] One fresh cu-day and one mma-day complete source selection → writing → image
  validation → delivery → admin receipt. Verify actual image bytes, licence, alt,
  source associations and hashes. Replay must not duplicate or alter a same-day edition.
- [ ] One real ms-daily produces a correct devShark question, bilingual copy and
  complete readable carousel in admin. Dry fixtures are not live-provider proof.
- [ ] Check home/article/archive plus admin create/edit/export at 360, 390, 768,
  1024 and 1440px, 200% zoom, keyboard navigation and reduced motion. Resolve all
  overflow, focus and sticky-header failures before calling the sites responsive-ready.
- [ ] Review the next scheduled day's receipts and failures. Close live-readiness
  issues only with that evidence; never replace a failure with a fabricated receipt.

The former devShark banner staging flag is off: DNESKAi placements now belong to
the reciprocal MMA FILES promotion requested by the owner. This does not disable
marketingShark post generation.

## Cleanup decisions

Deleted DNESKAi's duplicate stale MANUAL STEPS.md and devShark's unreferenced badge
wrapper. Updated current checklists and incorrect image-budget arithmetic. Kept
AGENTS/CLAUDE instructions, governance mirrors, migrations, delivery contracts,
licensed assets and state history. Paused code is not automatically dead code.
