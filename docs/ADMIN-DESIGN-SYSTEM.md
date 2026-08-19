# Admin design system

This document is the canonical visual contract for the protected BoardlessAI Admin. It governs Admin tokens and shared interface primitives. It does not alter the locked public presentation, business rules, evidence requirements, privacy boundaries, write controls, or release gates.

## Governing sources

The program order and invariants come from GitHub issue #382. Issue #366 owns only the design foundation described here. Repository authority remains `AGENTS.md`, `CLAUDE.md`, `GOVERNANCE.md`, `docs/ENGINEERING.md`, `docs/NEEDED.md`, and applicable decision records. In particular, D12 in `state/decisions/2026-08-02-workplace-show-design-rollback.md` continues to govern public presentation. This Admin-only foundation does not reopen that decision.

The visual reference is [`lukaskourilcz/own-dashboard`](https://github.com/lukaskourilcz/own-dashboard) pinned at commit `3049c5008b53e7d34d794822eedd552a470492c1`. The implementation audit used these files from that exact commit:

- `docs/design/design-system.md`
- `docs/design/product-design-audit.md`
- `docs/design/visual-qa.md`
- `src/app/globals.css`
- `src/components/dashboard-shell.tsx`
- `src/components/nav/sidebar.tsx`
- `src/components/nav/app-toolbar.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/empty-state.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/metric.tsx`
- `src/components/ui/page-header.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/status-badge.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/tooltip.tsx`

The deployed guest tour was also checked at desktop light, desktop dark, and a 390 by 844 mobile viewport. The pinned source remains the reproducible authority when deployed output changes.

## Scope and theme activation

Admin tokens are defined in `site/src/app/globals.css` under `[data-admin]`. The base selector is the light palette. `[data-admin][data-admin-theme="dark"]` overrides it with the dark palette. No `--admin-*` token is declared on `:root`, so public pages cannot inherit this system accidentally.

The current legacy shell sets `data-admin-theme="dark"` until issue #367 migrates shell geometry and theme behavior. Portalled Admin dialogs and tooltips copy both Admin data attributes to their portal root because a body-level portal is outside the shell's CSS inheritance tree.

Raw colour values are allowed only at the scoped token boundary. Production Admin primitives consume semantic variables. A venture identity colour may enter through `--admin-section-accent`; it must not be reused to communicate success, warning, risk, or destructive state.

## Visual contract

### Surfaces and structure

The interface uses one page background, restrained card surfaces, one inset field surface, one hover surface, and an elevated overlay surface. Cards use a quiet one-pixel border and low shadow. Nested cards, black feature slabs, decorative gradients, glow, glass decoration, and marketing-page treatments are outside this system.

The semantic surface tokens are `--admin-background`, `--admin-surface`, `--admin-surface-secondary`, `--admin-surface-muted`, `--admin-surface-inset`, `--admin-surface-hover`, `--admin-surface-selected`, and `--admin-surface-elevated`. Structure uses `--admin-border` and `--admin-border-strong`.

### Typography

Admin uses the system UI stack with DM Sans as a fallback. The base body size is 13px. The token scale is:

| Use | Token | Size |
| --- | --- | ---: |
| Micro labels and table headers | `--admin-type-micro` | 10px |
| Status and entity labels | `--admin-type-label` | 11px |
| Controls and compact support text | `--admin-type-control` | 12px |
| Body copy | `--admin-type-body` | 13px |
| Section headings | `--admin-type-section` | 14px |
| Dialog headings | `--admin-type-dialog` | 18px |
| Page headings | `--admin-type-page` | 22px |
| Metrics | `--admin-type-metric` | 24px |

Page headings and metrics use restrained negative tracking. Labels use `--admin-tracking-label`, sentence case where possible, and uppercase only for compact metadata. Numeric metrics use tabular figures. Monospace is reserved for code, identifiers, and data whose alignment requires it.

### Shape, density, and motion

The radius scale is 5px for small tags, 7px for controls, 12px for cards, and 14px for elevated overlays. Dense rows are 38px, regular rows are 46px, desktop controls are 32px, and touch targets are at least 44px on mobile. Default card padding is 16px. The shell dimensions reserved for issue #367 are a 224px sidebar, 64px collapsed rail, and 52px toolbar.

Motion is short and functional: 110ms for control feedback and 170ms for standard transitions. Motion never obscures state changes and must respect reduced-motion preferences.

### Focus and state

Every interactive primitive uses the shared `admin-focus-ring` treatment. It must remain visible in both themes. Disabled appearance cannot be the only signal that an action is unavailable.

State uses six named tones: neutral, information, success, warning, risk, and destructive. Each status badge includes visible text and a non-text marker so colour is never the sole distinction. Destructive controls use their own semantic button token and cannot be restyled as ordinary primary actions.

### Responsive behavior

Desktop is compact, but mobile controls retain the 44px touch target. Page headers stack before actions overlap. Wide tables sit inside a named, keyboard-focusable scroll region. Long labels and identifiers must wrap or truncate without widening the viewport. Shell navigation behavior is owned by issue #367; full responsive regression proof is owned by issue #370.

## Shared primitives

Static primitives live in `site/src/components/admin/admin-primitives.tsx` and remain server-compatible. Interactive overlays live in `site/src/components/admin/admin-overlays.tsx` as client leaves.

| Capability | Shared primitive |
| --- | --- |
| Page and section hierarchy | `AdminPageHeader`, `AdminSectionHeading` |
| Card composition | `AdminCard`, `AdminCardHeader`, `AdminCardContent`, `AdminCardFooter` |
| Metrics | `AdminMetric` |
| Actions | `AdminButton`, `adminButtonVariants` |
| Fields | `AdminLabel`, `AdminInput`, `AdminSelect`, `AdminTextarea` |
| State and identity | `AdminStatusBadge`, `AdminEntityBadge` |
| Empty results | `AdminEmptyState` |
| Dense data | `AdminTableRegion`, `AdminTable`, `AdminTableHead`, `AdminTableCell`, `AdminListRow` |
| Overlays | `AdminDialog`, `AdminTooltip` |

`site/src/components/admin/panel.tsx` is a compatibility adapter over the shared card and metric primitives. Its temporary direct-section gutter normalization remains until issue #368 removes the legacy nesting workaround.

The shared public dialog and tooltip accept optional visual slots and portal data attributes. Their default class strings and behavior are unchanged. Admin wrappers are the only callers that opt into the scoped Admin appearance.

## Existing implementation audit

Run `pnpm admin:design-audit` from the repository root to reproduce the complete per-file inventory. Use `pnpm --silent admin:design-audit -- --json` for machine-readable output. The audit walks every production `.css`, `.ts`, and `.tsx` file under `site/src/app/admin` and `site/src/components/admin`, excluding test and spec files.

The raw-colour count includes literal hex values, `rgb()` or `rgba()` values, and named Tailwind palette utilities. Radius, typography, and spacing counts are source-rule occurrences. Those three categories include semantic foundation consumers, so zero is not their migration target. Their purpose is to ensure every existing choice is examined rather than silently carried forward.

Baseline captured for issue #366 after adding the foundation:

| Scope | Files | Raw colour | Radius | Typography | Spacing |
| --- | ---: | ---: | ---: | ---: | ---: |
| All production Admin sources | 86 | 618 | 248 | 2,583 | 1,646 |
| Files with no visual rules | 35 | 0 | 0 | 0 | 0 |

The largest raw-colour inventories are:

| File | Occurrences |
| --- | ---: |
| `components/admin/kvorum-recommendations-panel.tsx` | 123 |
| `components/admin/booksofhistory-features-panel.tsx` | 87 |
| `components/admin/kvorum-monitor-panel.tsx` | 77 |
| `components/admin/caught-up-events-panel.tsx` | 48 |
| `components/admin/titty-tuesdays-proposals-panel.tsx` | 36 |
| `components/admin/future-panels.tsx` | 32 |
| `components/admin/admin-shell.tsx` | 31 |
| `components/admin/kvorum-claims-panel.tsx` | 29 |
| `components/admin/booksofhistory-dossiers-panel.tsx` | 27 |
| `components/admin/rendered-desk-panel.tsx` | 25 |

The 618 occurrences are pre-existing migration inventory, not approval for new literals. The new production foundation files and the `Panel` and `Tile` compatibility wrappers contain zero raw-colour literals. Issue #367 owns the shell inventory. Issue #368 owns panel and view migration, including replacement of raw colour, arbitrary radii, divergent type, excess spacing, nested cards, and ad hoc status treatments. Issue #370 owns final visual, responsive, accessibility, and regression proof.

## Protected behavior

This foundation does not change authentication, protected routes, loaders, server actions, canonical writes, budgets, evidence rules, privacy, public/private boundaries, release gates, or operational controls. It does not enable publishing, replies, account creation, credentials, purchases, or plan upgrades. Personal Growth implementation remains blocked until issue #370 is complete and its Admin gates pass.

Any human-only follow-up belongs exclusively in `docs/NEEDED.md`; this foundation introduces none.

## Foundation gate

Changes to this foundation must pass:

- Admin token and primitive unit tests
- the complete site unit suite
- site typecheck
- site lint
- site production build
- documentation consistency checks
- `pnpm admin:design-audit`, with no new raw colour in the foundation files

Issue #370 adds automated accessibility, route-matrix, and screenshot-diff gates for the fully migrated Admin.
