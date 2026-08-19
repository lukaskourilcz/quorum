# Admin visual QA

This is the reproducible visual, responsive, accessibility, and regression record for the protected BoardlessAI Admin completed under GitHub issue #370. It supplements `docs/ADMIN-DESIGN-SYSTEM.md`; it does not alter authentication, budgets, evidence rules, privacy, public/private boundaries, owner approvals, write controls, or release gates.

## Test boundary

Run the dedicated gate from the repository root:

```sh
pnpm admin:qa
```

The command first creates the optimized Next.js production artifact, then serves it on a dedicated local port and runs the `admin-qa-chromium` Playwright project with one worker and no retries. The project uses repository fixtures from the checked-out worktree, a synthetic HttpOnly Admin session, and a blank GitHub token. It does not receive an owner credential or a remote write authority.

Every dedicated Admin QA page installs a mutation guard before loading the protected surface. Unexpected non-GET/HEAD requests are aborted and reported. The boundary test also proves that:

- an authenticated request returns the protected Admin with `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, a matching robots meta tag, and a production CSP without `unsafe-eval`;
- the same route without the synthetic session redirects to the protected login flow and remains noindex;
- no mutation request is attempted during the read-only matrix.

The harness is local and test-only. It does not add a production fixture route or expose private repository state.

## Responsive and theme matrix

The geometry and overflow assertions run at every combination below in both light and dark themes:

| Width | Height | Navigation contract |
| ---: | ---: | --- |
| 360px | 800px | Mobile navigation; desktop sidebar absent |
| 430px | 932px | Mobile navigation; desktop sidebar absent |
| 768px | 1024px | Contained desktop window and sidebar |
| 1024px | 768px | Contained desktop window and sidebar |
| 1440px | 900px | Contained desktop window and sidebar |
| 1728px | 1117px | Contained desktop window and sidebar |

At widths of 768px and above, the window has a 30px horizontal and 20px vertical outer inset, fills the remaining viewport, and keeps the document at exactly one viewport height. Its content region owns vertical scrolling. The expanded sidebar is exactly 224px, the collapsed rail is exactly 64px, and the toolbar is exactly 52px. Below 768px, the window fills the viewport, the desktop sidebar is not rendered, and the mobile navigation is present.

Every matrix entry asserts that the document is no more than one CSS pixel wider than its client width and reports the first uncontained element if one exists. Additional 360px stress cases cover long owner labels, technical envelope identifiers, money values, and keyboard-focusable dense table regions.

The test captures browser console errors and uncaught page errors with their source URL. All 35 Admin tabs declared by `config/ventures.json` are opened from the production artifact and must show their canonical active route without a runtime recovery state or attempted mutation.

## Navigation and interaction proof

The navigation tests derive their expected destinations from the same venture registry as the product. They verify the complete canonical destination list and active URL through:

- the expanded desktop sidebar;
- the collapsed 64px desktop rail, including an accessible name for every icon link;
- the command palette, including filtering, keyboard selection, and `Command/Ctrl + K`;
- the mobile More dialog, while the persistent mobile controls retain at least 44px by 44px targets.

Keyboard coverage proves the skip link, dialog initial focus, forward and reverse focus containment, Escape dismissal, focus return to the opener, and exact restoration of the body scroll style. Reduced-motion coverage requires shell, backdrop, and dialog animation and transition durations to resolve to no more than 0.01ms.

## Workflow and accessibility proof

The representative workflow gate covers:

- owner approvals and write-disabled states;
- Door Money owner decisions, result entry, held prerequisites, and ratings;
- every registered venture workspace tab;
- Design Lab rendering and manual downloads while save and social publishing remain closed;
- fixed-cost and money displays at 430px;
- protected file details and a launch binder;
- explicit unavailable and held states instead of fabricated data.

Axe scans run in light and dark themes over the shell, command palette, mobile More dialog, owner decision/result/rating panels, and dense Design Lab tables. The gate fails on every serious or critical violation. Behavioral assertions remain authoritative; screenshots cover only stable shell and layout landmarks.

## Stable visual landmarks

The following baselines live in `site/tests/e2e/snapshots/`:

- `admin-shell-desktop-light.png`
- `admin-shell-desktop-dark-collapsed.png`
- `admin-shell-mobile-dark.png`

The snapshot stylesheet hides volatile content and freezes only the stable shell landmarks. Screenshot comparison disables animations and hides the caret. A screenshot pass does not replace route, geometry, overflow, keyboard, protection, mutation, or accessibility assertions.

## Project isolation and intentional selection

The optimized `admin:qa` project is intentionally read-only and matches only `admin-navigation-qa.spec.ts`, `admin-visual-qa.spec.ts`, and `admin-workflows-qa.spec.ts`. Canonical state-writing journeys are not skipped from the release gate: `pnpm --filter @boardlessai/site test:e2e` runs them in the isolated `chromium-write-journeys` project against the webpack development server, where each test mutates and restores the repository fixture through the real server boundary.

The normal E2E runner partitions its read-only route audit into bounded sequential invocations so Next.js receives a fresh server before its memory safeguard can restart a long-running audit. A focused command that names a spec file launches only compatible projects and accepts an empty grep partition; the unfiltered release command still runs every read-only test plus all tagged write journeys. No acceptance capability is excluded.

## Verified release record

The issue #370 release gate completed on 2026-08-19 from branch `agent/issue-370-admin-qa-gates` based on main commit `18096e731b4acf19826b7a6aa686ab5627a45634`.

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: site 142 files / 669 tests; studio 11 files / 169 tests; orchestrator 216 files / 1,843 tests |
| `pnpm build` | Passed: optimized site build, 246 pages |
| `pnpm docs:check` | Passed: `docs/ECOSYSTEM.md` current |
| `pnpm admin:design-audit` | Passed: 93 production Admin files; 0 raw colours, legacy tokens, disallowed public UI imports, or `UNWRAP` occurrences |
| `pnpm admin:qa` | Passed: 34/34 optimized-production Admin tests |
| `pnpm --filter @boardlessai/site test:e2e` | Passed: 317/317 tests, including 308 read-only tests and 9 isolated write journeys |

The build retained the repository's existing broad dynamic filesystem trace warnings; it produced the optimized artifact and exited successfully. During the development-server E2E audit, Next.js logged connection resets when Playwright closed completed navigation streams; every affected test and all subsequent partitions passed. Neither message represents a browser console failure or a weakened gate.

## Capability boundary after the gate

Live and verified capabilities are protected Admin navigation, responsive light/dark presentation, keyboard-accessible overlays, read-only workflow inspection, canonical owner-gated writes through their existing routes, manual Design Lab exports, and protected file/binder views.

Automatic social publishing, replies, account creation, credential entry, purchases, and plan upgrades remain disabled. No new human-only action was introduced, so `docs/NEEDED.md` is unchanged.
