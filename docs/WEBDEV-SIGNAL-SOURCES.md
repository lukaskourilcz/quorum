# WebDev Signal source audit

Verified: 2026-08-28

This is the founding source record for GitHub #436. Logged-out first-party pages and documented
public APIs were inspected; no production fetch, credential, subscription or account was used.
`ETag`/`Last-Modified` says “observable” only where a direct response was verified. Otherwise the
adapter must discover it during an authorized source probe and still use content hashes.

The default quotation posture for every retained source is short attributed factual terms only.
No raw page body is persisted. Public access does not transfer copyright or grant republishing
rights. Terms and robots must be rechecked before an official-HTML adapter is enabled.

| Id | Owner/project; host | Public endpoint; type/cadence | Access, terms, cache observation | Value, overlap and parser posture | Verdict |
| --- | --- | --- | --- | --- | --- |
| `chrome-developers` | Google Chrome; `developer.chrome.com` | <https://developer.chrome.com/feeds>; documented RSS index, frequent | Logged-out; Google developer-site terms/attribution; conditional headers to be probed | Browser/platform authority; overlaps web.dev and release notes; bounded RSS fixtures feasible | **keep** |
| `webdev` | Google web.dev; `web.dev` | <https://web.dev/feed.xml>; RSS, irregular | Logged-out; site terms and attribution; `Last-Modified` observed | Broad platform practice and launches; overlaps Chrome; RSS fixture feasible | **keep** |
| `mdn-blog` | Mozilla MDN; `developer.mozilla.org` | <https://developer.mozilla.org/en-US/blog/rss.xml>; RSS, irregular | Official blog states RSS; logged-out; Mozilla/MDN terms and attribution; headers unconfirmed | Web docs, standards and browser context; overlaps web.dev; RSS fixture feasible | **optional** pending first fixture probe |
| `react-releases` | Meta React; `api.github.com` | <https://api.github.com/repos/facebook/react/releases>; official GitHub Releases JSON | Public REST; GitHub API terms/rate limits and attribution; ETag expected, probe required | Framework releases; release-candidate noise filter required; JSON fixture feasible | **keep** |
| `next-releases` | Vercel Next.js; `api.github.com` | <https://api.github.com/repos/vercel/next.js/releases>; official GitHub Releases JSON | Public REST; same GitHub posture | Meta-framework; overlaps Vercel changelog; strict stable/major/material filter | **keep** |
| `vue-blog` | Vue core; `blog.vuejs.org` | <https://blog.vuejs.org/feed.rss>; RSS, release-driven | Logged-out official blog with RSS link; attribution; headers unconfirmed | Framework releases and governance; low duplicate risk; RSS fixture feasible | **keep** |
| `angular-releases` | Google Angular; `api.github.com` | <https://api.github.com/repos/angular/angular/releases>; official Releases JSON | Public REST; same GitHub posture | Framework releases; prerelease/noise filter; JSON fixture feasible | **optional** |
| `typescript-blog` | Microsoft TypeScript; `devblogs.microsoft.com` | <https://devblogs.microsoft.com/typescript/feed/>; RSS, release-driven | Logged-out; Microsoft site terms and attribution; conditional headers unconfirmed | Language/tooling authority; overlaps GitHub releases; RSS fixture feasible | **keep** |
| `tc39-proposals` | Ecma TC39; `github.com` | <https://github.com/tc39/proposals>; official repository listing, change-driven | Logged-out; repository licensing/attribution; no stable bounded release feed proven | Standards authority but raw change noise and stage semantics need a dedicated adapter | **held** |
| `vite-releases` | Vite; `api.github.com` | <https://api.github.com/repos/vitejs/vite/releases>; official Releases JSON | Public REST; same GitHub posture | Build tooling; major/stable/material filter; JSON fixture feasible | **keep** |
| `node-releases` | OpenJS Node.js; `api.github.com` | <https://api.github.com/repos/nodejs/node/releases>; official Releases JSON | Public REST; same GitHub posture | Runtime/security releases; release channel/version filters required | **keep** |
| `deno-releases` | Deno Land; `api.github.com` | <https://api.github.com/repos/denoland/deno/releases>; official Releases JSON | Public REST; same GitHub posture | Runtime/toolchain; frequent release noise filter | **optional** |
| `bun-releases` | Oven Bun; `api.github.com` | <https://api.github.com/repos/oven-sh/bun/releases>; official Releases JSON | Public REST; same GitHub posture | Runtime/toolchain; frequent patch noise filter | **optional** |
| `pnpm-releases` | pnpm; `api.github.com` | <https://api.github.com/repos/pnpm/pnpm/releases>; official Releases JSON | Public REST; same GitHub posture | Package manager; major/breaking/security filter | **optional** |
| `npm-changelog` | npm/GitHub; `github.blog` | <https://github.blog/changelog/label/npm/feed/>; official Atom/RSS label feed | Logged-out; GitHub site terms/attribution; headers unconfirmed | npm platform changes; may overlap advisories; fixture probe required | **optional** |
| `github-npm-advisories` | GitHub Advisory Database; `api.github.com` | <https://api.github.com/advisories?ecosystem=npm>; official REST JSON, continuous | Public global-advisory endpoint; GitHub API terms/rate limits; ETag expected | Security authority with exact advisory/version ranges; pagination and severity caps | **keep** |
| `cloudflare-developer-platform` | Cloudflare Developers; `developers.cloudflare.com` | <https://developers.cloudflare.com/changelog/rss/developer-platform.xml>; official developer-platform RSS | Logged-out; Cloudflare terms/attribution; official feed catalog verified 2026-08-28; conditional headers unconfirmed | Deployment/developer-platform authority; scoped feed avoids the global changelog's unrelated product noise; RSS fixture feasible | **keep** |
| `vercel-changelog` | Vercel; `vercel.com` | <https://vercel.com/changelog>; official HTML listing, frequent | Logged-out; Vercel terms/robots must be rechecked; no structured feed proven | Deployment platform; overlaps Next.js; official-HTML parser would be brittle | **held** |
| `netlify-changelog` | Netlify; `www.netlify.com` | <https://www.netlify.com/changelog/>; official HTML listing, frequent | Logged-out; Netlify terms/robots must be rechecked; no structured feed proven | Deployment platform; official-HTML fixture and layout policy absent | **held** |
| `w3c-news` | W3C; `www.w3.org` | <https://www.w3.org/news/>; official standards listing, irregular | Logged-out; W3C document licenses/attribution vary; exact bounded feed not proven | Standards/interoperability authority; stage/status parsing required | **held** |
| `wai-news` | W3C WAI; `www.w3.org` | <https://www.w3.org/WAI/news/>; official accessibility listing, irregular | Logged-out; W3C/WAI terms and attribution; exact feed unproven | Accessibility authority; low cadence; fixture absent | **held** |
| `interop` | Web Platform Tests/Interop; `web.dev` and project repos | <https://web.dev/baseline>; official documentation/listing | Logged-out; source-specific terms; no single change feed proven | Interoperability value, overlaps browser feeds; canonical event adapter undefined | **held** |
| `react-blog` | Meta React; `react.dev` | <https://react.dev/blog>; official HTML blog | Logged-out and explicitly official; terms/robots recheck; no structured feed proven | High-value announcements; releases adapter covers initial core without HTML scraping | **held** |
| `secondary-discovery` | Independent magazines/newsletters; variable | No endpoint approved | May be public or paywalled; never bypass access or copy bodies | Lead/corroboration only; no factual authority, score or popularity proof | **rejected** for initial registry; later source-specific audit required |

## Registry admission and re-audit

Only `keep` rows with a proven structured endpoint and a shape-preserving fixture may be enabled in
#439. `optional` rows may be present but default off until their first bounded probe and fixture
pass. `held` and `rejected` rows are audit evidence, not runtime sources. `api.github.com` projects
must be an exact repository allowlist; sharing a host never grants access to another repository.

Each admitted source record carries owner/project, host, endpoint, authority, type, expected
cadence, request/item/byte/time limits, public/auth posture, terms/robots/licensing/attribution,
conditional-header posture, parser and fixture versions, overlap, health policy, verdict, verified
date and these source refs. Verification expires after 90 days, or immediately after a redirect,
content-type, terms, robots, schema or layout change. Repeated schema/layout failures hold that
source alone; a valid empty or unchanged response remains healthy.
