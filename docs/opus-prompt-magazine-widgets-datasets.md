# Implementation prompt — daily-fact widgets, AI lesson widget, banner slot, and datasets for DNESKAi (`lukaskourilcz/aifirst`) and MMA Files (`lukaskourilcz/mma-files`)

You are Opus 5, implementing this build end to end in two repositories that are already cloned locally. This prompt is the complete specification: every dataset entry is given in full below and you must not invent, extend, reword, or "improve" the data. Where this prompt and a repository's own control document (`CLAUDE.md`) disagree on product invariants, the control document wins; the architecture decisions below were made with both control documents in hand, so conflicts should not arise — if you find one anyway, follow `CLAUDE.md` and record the deviation in your final report.

## Objective (one paragraph)

Both magazine sites read as plain templates next to the freshly redesigned BoardlessAI site. Fix that with small, data-driven editorial furniture: a deterministic "Did you know" daily-fact widget on both sites (MMA facts on MMA Files, AI facts on DNESKAi), a "Dnešní AI lekce" daily buzzword widget on DNESKAi with a full archive page listing every lesson revealed so far grouped by category, and a config-driven, empty-by-default banner slot on DNESKAi reserved for an upcoming devShark creative. Everything is a React Server Component rendered at build time from JSON files committed to each repo — zero client JavaScript, zero runtime cost, zero build-time model calls, CSP untouched.

## Session protocol (do these before the first edit)

1. In each repo, invoke the repo's required session skills: `task-observer` (both repos) and `commit-discipline` (mma-files) — their CLAUDE.md files demand it.
2. Read the latest state of each repo before editing: branch, status, recent log. Work on branch `claude/magazine-widgets-datasets-pee5df` in **both** repos (create it from the default branch if it does not exist). Never push to any other branch. This task authorizes pushing that branch; it does **not** authorize pushing `main` — this overrides mma-files' usual "push to main at session end" habit and satisfies aifirst's "push only when authorized" rule.
3. Check `NEEDED.md` in each repo at start (per the shared session-start contract) and update it at the end.

## Corrections to the original brief (verified against the repos — trust these)

- **DNESKAi is Czech-first, not English-first.** Czech serves at the root; English routes are legacy compatibility. Both locales render through `app/[lang]/page.tsx` with `dict(locale)` from `lib/i18n/dictionaries.ts`, where the English object is the canonical shape and Czech must match key-for-key (compile-enforced `Dict` type). So: add every new UI string to **both** dictionaries; the widgets render on both locales automatically; do not restructure routes; never rename the `dispatches`/`wire` frontmatter keys.
- **MMA Files is Czech-only** (`LOCALES = ["cs"]`, `src/i18n/cs.ts` is the structural source of truth). Its widget UI is Czech; the dataset still carries `en` text for portfolio reuse and feeds — the UI simply never renders it. Do not add an English dictionary.
- **Budget:** the portfolio's operating cap is the hard $30/month all-in contract (stricter than the $50 the brief mentioned). Irrelevant at runtime here because this build costs $0 forever: no model calls, no external requests, no new dependencies.
- **Stacks:** aifirst is Next.js App Router + React + strict TS + plain CSS custom properties (**no Tailwind — do not add it**), `pnpm`, vitest, Playwright, hard 110 kB gzip page-entry ceiling with ~102 kB already spent. mma-files is Next.js App Router + strict TS + **Tailwind v4** (its native stack — Tailwind is correct there), `npm`, `node --test` with plain `.mjs` test files.

## Non-negotiable invariants (from the control documents — verify each at the end)

1. **Zero client JS.** Every new component is a Server Component. No `"use client"`, no hooks, no event handlers, no client-side fetching, no `Math.random()`, no `Date.now()` in render paths. The aifirst page-entry bundle must not grow past the 110 kB gzip ceiling (`pnpm check:bundle` enforces it; the headroom is ~8 kB and this build should consume approximately none of it).
2. **CSP unchanged.** No external fonts, scripts, styles, or images. All assets local. Banner creative, when it eventually exists, is a local file under `public/`.
3. **No new dependencies** in either repo. No schema library — validate datasets with plain TS + unit tests.
4. **aifirst design bans:** no generated imagery as filler, no neon/glow/mascots/fake charts, one dark reader theme, semantic tokens (`--surface-*`, `--text-*`, `--border-*`, `--accent-*`) from the palette block at the top of `app/globals.css`, flat zero-radius surfaces, one-pixel hairlines, text no dimmer than `#8d949f`. Space Grotesk for display/interface, IBM Plex Mono for machine metadata, Source Serif 4 for prose.
5. **mma-files editorial guardrails:** never invent fight facts (the dataset below is the content — ship it verbatim); no promotion logos; no affiliate/bookmaker anything. The facts dataset is real, verified content — it is **not** demo seed, so it must **not** carry `isDemo` and must render in both demo and live modes.
6. **Content boundaries:** in aifirst, `lib/delivery/` stays the only edition write path and `lib/content.ts` the only edition read path — the new datasets are a separate, additive read surface (`lib/facts.ts`, `lib/lessons.ts`) and must not touch either. In mma-files, `data/boardless/` remains delivery-only — the facts dataset lives in `src/data/`, not there, and `src/lib/repository.ts` remains untouched.
7. **aifirst has an existing glossary** (`glossary.yml`, `lib/glossary.ts`, `/glossary` route, `GlossaryBlock`). The lesson set is a *daily curriculum* (ordered, categorized, short+full, bilingual), which is a different contract. Do **not** merge the lessons into `glossary.yml`, do not modify the glossary loader, and do not cross-wire the two. They coexist.

## Architecture decision: what "today" means (read carefully — this resolves the brief's determinism clause)

The brief asked for `index = daysSinceEpochAnchor % length` computed in Europe/Prague. Both sites are fully static and rebuild when content lands, not on a clock. Therefore the deterministic date input is **the newest published content date, not the wall clock**:

- **aifirst:** `dateKey` = the lead edition's `frontmatter.date` (already loaded on the Today page). Edition dates are Prague publishing days by contract, so the Europe/Prague requirement is satisfied by construction, with no timezone code and no build-time clock. The fact and lesson belong to the edition: a day with no edition honestly keeps yesterday's fact, exactly like the rest of the page. Builds are reproducible — same content in, same HTML out.
- **mma-files:** `dateKey` = the lead article's published date from the repository read path. Same reasoning. In demo mode the seed dates are fictional but stable, which still yields a stable, deterministic pick.
- **Fallback:** if there is no content at all, or `dateKey` predates the anchor, use the anchor itself (index 0). ISO date strings compare correctly with `<`, so clamp with a string comparison.
- SSR/client identity is trivial: there is no client computation. EN/CS identity on aifirst is trivial: both locales pass the same `dateKey`.

The pure functions, exactly this logic (strict TS, `noUncheckedIndexedAccess`-safe — adjust only syntax, not semantics):

```ts
/** Whole days from anchor to dateKey; both are YYYY-MM-DD calendar dates. */
export function daysBetween(anchor: string, dateKey: string): number {
  const parse = (value: string): number => {
    const [y, m, d] = value.split("-").map(Number);
    if (y === undefined || m === undefined || d === undefined) {
      throw new Error(`invalid date key: ${value}`);
    }
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(dateKey) - parse(anchor)) / 86_400_000);
}

/** Clamp a possibly-missing or pre-anchor date to the anchor. ISO strings compare lexically. */
export function effectiveDateKey(anchor: string, dateKey: string | undefined): string {
  return dateKey !== undefined && dateKey >= anchor ? dateKey : anchor;
}

/** Deterministic daily pick: 0-based index into the entries array. */
export function dailyIndex(anchor: string, dateKey: string, length: number): number {
  if (length <= 0) throw new Error("dailyIndex requires a non-empty dataset");
  const n = daysBetween(anchor, dateKey);
  return ((n % length) + length) % length;
}

/** How many entries have been revealed so far (for the lesson archive). */
export function revealedCount(anchor: string, dateKey: string, length: number): number {
  if (length <= 0) throw new Error("revealedCount requires a non-empty dataset");
  return Math.max(1, Math.min(length, daysBetween(anchor, dateKey) + 1));
}
```

All three dataset files share `"anchor": "2026-07-01"`, so the lesson archive already has ~5 weeks of revealed entries on launch day ("substance from day one") while the daily reveal keeps running for weeks more before wrapping.

## Dataset schema (exact — identical in both repos)

`schemaVersion` follows the repos' existing convention (`edition-package/1`, `mma-files-article-store/1`):

```ts
interface LocalizedText {
  short: string; // one line, ≤ ~140 chars, ends without a period where it is a fragment
  full: string;  // 1–3 sentences, the complete checkable statement
}

interface DatasetEntry {
  id: string;        // "mma-001" | "ai-001" | "lex-001" — zero-padded, append-only, never reused
  slug: string;      // kebab-case, unique within the file
  category: string;  // key into the file's `categories` map
  promotion?: "ufc" | "oktagon" | "cross"; // mma-facts only; "cross" = Czech/Slovak fighters in UFC
  term?: string;     // ai-lessons only; display form of the buzzword, e.g. "GPU"
  en: LocalizedText;
  cs: LocalizedText;
  verified: string;  // YYYY-MM-DD — the date this entry was last checked against its source
  source: string;    // short human pointer for re-verification, not a URL requirement
}

interface DatasetFile {
  schemaVersion: "boardless-dataset/1";
  dataset: "ai-facts" | "mma-facts" | "ai-lessons";
  anchor: string;    // YYYY-MM-DD; origin of the daily index
  categories: Record<string, { en: string; cs: string }>;
  entries: DatasetEntry[]; // array order is the reveal order (day 0 = entries[0])
}
```

JSON Schema equivalent (for your validation tests; do not add a schema library):
required file keys `schemaVersion`, `dataset`, `anchor`, `categories`, `entries`; required entry keys `id`, `slug`, `category`, `en`, `cs`, `verified`, `source`; `en`/`cs` each require non-empty `short` and `full`; `anchor` and `verified` match `^\d{4}-\d{2}-\d{2}$`; `slug` matches `^[a-z0-9]+(-[a-z0-9]+)*$`; every `category` value must exist in `categories`; `id` and `slug` unique; `entries` non-empty. `mma-facts` entries additionally require `promotion`; `ai-lessons` entries additionally require `term`.

The three dataset files are given **in full** in the "DATASETS" section at the end of this prompt. Copy them byte-for-byte into the repos. Do not add entries, do not fix perceived typos in Czech (the Czech is deliberate), do not reorder — order is the reveal curriculum.

---

# Repo 1: `aifirst` (DNESKAi) — file-by-file plan

## Created files

| Path | Purpose |
| --- | --- |
| `data/ai-facts.json` | 50 AI facts dataset (contents given below, verbatim) |
| `data/ai-lessons.json` | 60-entry AI buzzword curriculum (contents given below, verbatim) |
| `data/README.md` | dataset contract + the documented append path (spec below) |
| `lib/daily.ts` | the four pure functions from the determinism section, exactly |
| `lib/facts.ts` | typed loader for `data/ai-facts.json`: parse once at module scope, export `loadAiFacts(): DatasetFile` and a `factOfTheDay(dateKey: string \| undefined)` helper returning `{ entry, dateKey }` |
| `lib/lessons.ts` | same pattern for `data/ai-lessons.json`, plus `lessonOfTheDay(dateKey)` and `revealedLessons(dateKey)` returning the first `revealedCount` entries grouped by category in `categories`-map order |
| `lib/banner.ts` | typed reader for `config/banner.json`; exports `bannerSlot(id: string): BannerSlot \| null` returning `null` unless the slot is `active` with complete desktop+mobile creatives whose `src` starts with `/images/banners/` |
| `components/editorial/DailyLesson.tsx` | hero lesson strip (contract below) |
| `components/editorial/DidYouKnow.tsx` | fact block (contract below) |
| `components/editorial/BannerSlot.tsx` | banner slot renderer (contract below) |
| `app/[lang]/lekce/page.tsx` | lesson archive page (contract below) |
| `config/banner.json` | the slot config (exact contents below) |
| `lib/__tests__/daily.test.ts` | unit tests for the pure functions (cases specified below) |
| `lib/__tests__/datasets.test.ts` | schema validation of both JSON files against the rules in the schema section |

## Modified files

| Path | Change |
| --- | --- |
| `app/[lang]/page.tsx` | mount the three components at the exact insertion points below |
| `lib/i18n/dictionaries.ts` | new keys in **both** `en` and `cs` (exact strings below) |
| `app/globals.css` | styles for the three components + archive table, semantic tokens only |
| `app/sitemap.ts` | add `/lekce` (mirror how existing static routes are listed) |
| `docs/…`, `README.md`, `DOCS.md`, `CLAUDE.md`, `about-project.md`, `NEEDED.md` | final .md walk (closing section) |

## Placement and breakpoint spec (exact — do not relocate)

`app/[lang]/page.tsx` renders, in order: `StructuredData` → `header.edition-intro` → `PublicationData` → `IssueMasthead` → `SponsorBlock` → `EditorialHighlights` → article body with Dispatches/Wire aside → `section.issue-reference-blocks` (Corrections, Glossary, Sources, Provenance) → `IssueNavigation` → `p.caught-up-completion` → `FeedActions` → recent issues. Insert:

1. **`<DailyLesson …/>` between `<PublicationData …/>` and `<IssueMasthead …/>`.** This is the widget that satisfies the "inside the initial hero viewport at both desktop and mobile" rule. It must be a single-row hairline-bounded strip: mono eyebrow `Dnešní AI lekce` (EN: `Today's AI lesson`), the `term` in Space Grotesk, the truncated `cs.short` (locale-appropriate), and the link `Celý popis →` (EN: `Full description →`) to `lp("/lekce")`. Height budget: ≤ 56 px at ≥ 768 px (one line, term and short on the same row); ≤ 2 wrapped lines at 360 px (stack term above short if needed via a container query or a plain 480 px media query). It must never push the lead headline out of a 1280×800 viewport; verify visually at 360, 768, 1280.
2. **`<DidYouKnow …/>` as the last child of `section.issue-reference-blocks`** (after `Provenance`). Different part of the page, per the brief. Render as a bordered reference block matching its siblings: mono eyebrow `Víte, že…` (EN: `Did you know…`), the fact's `full` text in prose serif, and a mono meta line `Ověřeno {verified} · {source}` (EN: `Verified {verified} · {source}`). No image, no chart, no decoration — text is the design.
3. **`<BannerSlot id="today-partner-belt" …/>` between `p.caught-up-completion` and `<FeedActions/>`.** One-line justification you may reuse in docs: *728×90 desktop / 320×100 mobile are IAB standard sizes so the future devShark creative is a drop-in local file, and the position after the completion mark is the back-page of the edition — a partner belt there cannot dilute the briefing.*
4. The homepage's no-edition early return stays as is — on an empty site none of the widgets render, which is the honest state. Widgets receive `dateKey = fm.date` from the already-loaded lead edition.
5. The `/lekce` page and the widgets are additive; touch nothing else in the page.

## Component contracts (aifirst)

All three are async-free, prop-driven Server Components; no data fetching inside JSX files beyond calling the `lib/` loaders; no `"use client"` anywhere.

```ts
// components/editorial/DailyLesson.tsx
export function DailyLesson(props: { dateKey: string | undefined; locale: Locale }): JSX.Element;
// internally: lessonOfTheDay(effectiveDateKey(anchor, dateKey)); renders <aside aria-labelledby=…>
// with a heading for a11y landmarks; the link uses localePrefixer(locale).

// components/editorial/DidYouKnow.tsx
export function DidYouKnow(props: { dateKey: string | undefined; locale: Locale }): JSX.Element;
// internally factOfTheDay(...); <aside> with its own accessible name; text-first.

// components/editorial/BannerSlot.tsx
export function BannerSlot(props: { id: string }): JSX.Element | null;
// returns null when bannerSlot(id) is null — renders NOTHING and reserves no space while empty.
// When active: an <a rel="sponsored noopener noreferrer" target="_blank"> wrapping a plain <img>
// with explicit width/height and loading="lazy"; desktop image hidden ≤ 480 px and mobile image
// shown there (CSS, not JS); a mono "Partner" label consistent with SponsorBlock's honesty
// semantics; hidden in print the same way the repo hides FeedActions/nav chrome.
// Because the page is statically rendered from build-time config, a filled slot causes zero CLS.
```

`config/banner.json`, exact initial contents:

```json
{
  "schemaVersion": "banner-slot/1",
  "slots": {
    "today-partner-belt": {
      "active": false,
      "advertiser": null,
      "href": null,
      "alt": null,
      "desktop": null,
      "mobile": null
    }
  }
}
```

When devShark's creative arrives (a later build — **do not** fabricate assets now), the filled shape is:
`{"active": true, "advertiser": "devShark", "href": "https://…", "alt": "…", "desktop": {"src": "/images/banners/devshark-728x90.webp", "width": 728, "height": 90}, "mobile": {"src": "/images/banners/devshark-320x100.webp", "width": 320, "height": 100}}`.
`lib/banner.ts` must type this precisely and refuse (return `null` + no throw at render) anything incomplete or with a non-local `src`. MMA Files gets **no** banner — do not add one there.

## `/lekce` archive page contract

- `app/[lang]/lekce/page.tsx`, `export const dynamic = "force-static"`, `generateMetadata` with `localeAlternates(lang, "/lekce")`, title from the new dictionary keys, described below.
- Content: one `h1` (`AI lekce` / EN `AI lessons`), an intro line (dictionary key), then **one table per category** in `categories`-map order, each with a `h2` (localized category label) — only categories that already have revealed entries appear. Table columns: `Termín` / `Popis` (EN `Term` / `Description`), rows = revealed entries of that category in reveal order, showing `term` (Space Grotesk) and the locale's `full` text (serif); a mono meta cell or suffix shows the reveal date (`anchor + index` days, format YYYY-MM-DD). Today's entry gets a subtle `Dnes` / `Today` mono tag — non-color cue, no highlight color alone.
- "Every buzzword rendered so far": `revealedLessons(effectiveDateKey(anchor, dateKey))` where `dateKey` is the lead edition date loaded the same way the homepage loads it (import `listArticles` and take the newest date; keep it cheap — you only need the date).
- Tables must not overflow the page horizontally: wrap each in the repo's accessible scroll-region idiom (search `app/globals.css` and existing wide-table handling before inventing one; long Czech copy is the wrapping worst case).
- Add the route to `app/sitemap.ts` mirroring the existing static-route entries. Do not add it to the main navigation — the widget link is the entry point. Do not touch `/glossary`.

## Dictionary keys (add to BOTH `en` and `cs` objects in `lib/i18n/dictionaries.ts`)

Add a new top-level section (name it `daily`) — exact strings:

| key | en | cs |
| --- | --- | --- |
| `daily.lessonKicker` | `Today's AI lesson` | `Dnešní AI lekce` |
| `daily.lessonLink` | `Full description →` | `Celý popis →` |
| `daily.factKicker` | `Did you know…` | `Víte, že…` |
| `daily.verified` | `Verified` | `Ověřeno` |
| `daily.lessonsTitle` | `AI lessons` | `AI lekce` |
| `daily.lessonsIntro` | `One term a day, from the daily briefing. Everything revealed so far, grouped by category.` | `Každý den jeden pojem z denního vydání. Vše, co už bylo odhaleno, seřazené podle kategorií.` |
| `daily.lessonsMetaDescription` | `The AI vocabulary DNESKAi has explained so far — one term a day, grouped by category.` | `Slovníček AI pojmů, které DNESKAi dosud vysvětlilo — každý den jeden, podle kategorií.` |
| `daily.term` | `Term` | `Termín` |
| `daily.description` | `Description` | `Popis` |
| `daily.today` | `Today` | `Dnes` |
| `daily.revealedOn` | `revealed` | `odhaleno` |
| `daily.partnerLabel` | `Partner` | `Partner` |

## aifirst tests (vitest, in `lib/__tests__/`)

- `daily.test.ts`: `daysBetween("2026-07-01","2026-07-01") === 0`; consecutive dates give consecutive indices (`dailyIndex(a,"2026-08-07",50) + 1 === dailyIndex(a,"2026-08-08",50)` when not wrapping); wraparound (`dailyIndex("2026-07-01","2026-08-20",50) === 0`); pre-anchor clamps via `effectiveDateKey`; `revealedCount` clamps to `[1, length]`; month/year boundaries (`"2026-12-31"`→`"2027-01-01"` differ by 1); throws on empty dataset and malformed date.
- `datasets.test.ts`: load both JSON files and assert every rule in the schema section (uniqueness, category membership, regexes, non-empty bilingual text, `promotion`/`term` presence rules, exact entry counts: 50 facts, 60 lessons).

---

# Repo 2: `mma-files` — file-by-file plan

## Created files

| Path | Purpose |
| --- | --- |
| `src/data/mma-facts.json` | 50 MMA facts dataset (contents given below, verbatim) |
| `src/data/README.md` | dataset contract + append path (same spec as aifirst's `data/README.md`) |
| `src/lib/daily-index.mjs` | the four pure functions as dependency-free plain ESM with JSDoc types — one canonical implementation importable by BOTH the TS app code and the `node --test` suite (the repo's tests are `.mjs` and cannot import TS). Verify the TS config accepts the `.mjs` import (`allowJs` or an ambient `.d.mts`); if the repo's TS setup fights it, keep `src/lib/daily-index.mjs` as canon for tests and add a thin `src/lib/daily.ts` that re-exports with types — never two diverging implementations |
| `src/lib/facts.ts` | typed loader: parse `src/data/mma-facts.json` once, export `factOfTheDay(dateKey: string \| undefined)` |
| `src/components/site/DidYouKnow.tsx` | the fact belt (contract below) |
| `tests/facts.test.mjs` | dataset schema validation (same rules; exact count 50; `promotion` required; ≥ 12 entries with `promotion` of `oktagon` and ≥ 5 of `cross` — the dataset below satisfies this) + determinism tests importing `src/lib/daily-index.mjs` (same cases as the aifirst suite) |

## Modified files

| Path | Change |
| --- | --- |
| `src/app/[locale]/page.tsx` | mount `<DidYouKnow …/>` (placement below) |
| `src/i18n/cs.ts` | new `didYouKnow` section (exact strings below) |
| `README.md`, `CLAUDE.md`, `NEEDED.md`, `docs/…` | final .md walk (closing section) |

## Placement and breakpoint spec (exact)

The homepage (`src/app/[locale]/page.tsx`) opens with `LeadStory` (the hero), then Results, Fight Week, Files. On a 360–430 px viewport the LeadStory fills the first screen, so a widget placed after it would fail the hero-viewport rule. Therefore:

- **`<DidYouKnow …/>` is the first element of the returned fragment, before `LeadStory`** (and before its no-lead fallback), rendered as a slim full-width belt: `border-b border-rule-strong bg-card` to match the page's section rhythm, single row at ≥ 768 px (mono-style kicker `Víte, že…`, the fact's `cs.short`, and nothing else — no link, the belt is self-contained), wrapping to at most 3 short lines at 360 px. Height budget ≤ 88 px at 360 px, ≤ 56 px at ≥ 1024 px. Use existing `Container` and the repo's `text-ink-muted`/rule/card token classes; check the components under `src/components/site/` and `src/components/ui/primitives` first and reuse their idioms. `aria-label` from the dictionary; render the `full` text in a `title` attribute? **No** — tooltips are not accessible; render `cs.short` only, and show `Ověřeno {verified}` as a small trailing mono note at ≥ 768 px (hidden on mobile to hold the height budget).
- It is a Server Component; `dateKey` comes from the lead article via the existing repository read path (`getLeadArticle()` in the page already; pass its date down as a prop — the component must not import the repository itself, mirroring how the page passes data to `LeadStory`).
- MMA Files gets exactly this one widget and **no banner slot**.

## Component contract (mma-files)

```ts
// src/components/site/DidYouKnow.tsx
export function DidYouKnow(props: { dateKey: string | undefined }): JSX.Element;
// internally: factOfTheDay(effectiveDateKey(anchor, dateKey)); Czech UI only; Tailwind classes only,
// no new CSS files; no client boundary.
```

## Dictionary keys (`src/i18n/cs.ts`, new `didYouKnow` section — Czech only, this repo has no other locale)

| key | cs |
| --- | --- |
| `didYouKnow.kicker` | `Víte, že…` |
| `didYouKnow.verified` | `Ověřeno` |
| `didYouKnow.ariaLabel` | `Zajímavost dne` |

---

# Growth hook: the documented append path (both repos)

Write the same contract into `data/README.md` (aifirst) and `src/data/README.md` (mma-files), adapted for paths. Required content, in the repo's calm documentation voice:

1. **The files are append-only.** Existing entries are never edited, reordered, or deleted except to correct a factual error, and a correction changes `verified` to the re-check date. Array order is the reveal order; new entries go at the end and extend the cycle length (the modulo simply grows — no schema change, no code change).
2. **Who may append:** BoardlessAI agents, through the same content-only GitHub App commit channel that delivers editions/articles — never a runtime write, never a human-invoked side door. An append commit touches only the dataset file, carries the standard delivery attribution, and each new entry ships with its receipt inside the entry itself: `verified` (the check date) and `source` (where a human can re-verify). Upstream, quorum records the append in its content inventory; that recording is quorum's job, not this repo's.
3. **Validation is the gate:** the dataset unit tests (`lib/__tests__/datasets.test.ts` / `tests/facts.test.mjs`) run in the release gates, so a malformed append fails CI rather than shipping. Update the exact-count assertions to minimum-count assertions (`>= 50` / `>= 60`) so an append does not require a test edit — implement the tests that way from the start.
4. **Never**: entries without a checkable `source`, invented numbers, model-generated "facts" without human-verifiable grounding, or ids/slugs reused after removal.

---

# Acceptance criteria (all must hold; report each with evidence, not adjectives)

1. **Bundle:** record aifirst's page-entry sizes from `pnpm check:bundle` (or the build output it reads) **before** your first change and **after** your last; both ≤ 110 kB gzip; the delta attributable to this build ≈ 0 kB of client JS (server components only). Paste both numbers in the final report and PR body.
2. **CSP and headers unchanged:** no edits to CSP/middleware/headers config in either repo; grep your diff to prove it.
3. **EN/CS parity (aifirst):** every dataset entry has non-empty `en.short/full/cs.short/full` (unit-tested); the Today page at the Czech root and the legacy English locale render the **same entry id** for the same build, with the locale's own text and dictionary strings; `/lekce` renders in both locales with `localeAlternates`.
4. **Determinism:** unit tests prove two consecutive `dateKey`s yield consecutive indices and the same date always yields the same entry; no `Math.random`, no `Date.now`, no `new Date()` in any new code path (grep the diff for all three).
5. **Placement:** at 360 px and 1280 px, DNESKAi's initial viewport shows the `Dnešní AI lekce` strip and MMA Files' initial viewport shows the `Víte, že…` belt, without pushing the lead headline (DNESKAi) or LeadStory (MMA Files) fully out of view at 1280×800. Verify in the real UI (each repo has a dev/preview flow; aifirst also has Playwright — extend its e2e checks only if an existing suite obviously covers the homepage's structure, otherwise leave e2e untouched).
6. **Empty banner is invisible:** with `active: false`, the rendered Today page HTML contains no banner markup and no reserved space; flipping the config to a complete entry (locally, uncommitted) renders the belt with explicit dimensions and `rel="sponsored"`; revert before committing.
7. **Datasets verbatim:** `data/ai-facts.json` (50), `data/ai-lessons.json` (60), `src/data/mma-facts.json` (50) match this prompt byte-for-byte apart from JSON formatting produced by your serializer — entry text must be identical.
8. **Gates green:** aifirst `pnpm verify` (lint, typecheck, vitest, content checks, build, bundle) passes; run `pnpm e2e` and report honestly (fix regressions your change caused; pre-existing failures are reported, not silently absorbed). mma-files `npm run check` and `npm run build` pass. Never claim a command passed unless it ran and passed.
9. **No violated boundaries:** no changes under aifirst `lib/delivery/`, `lib/content.ts`, `glossary.yml`; no changes under mma-files `data/boardless/`, `src/lib/repository.ts`, `src/content/`.

# Commit / PR plan (frequent, coherent commits — never one batch)

Per repo, on `claude/magazine-widgets-datasets-pee5df`, roughly this sequence (adjust granularity, keep the spirit):

- aifirst: (1) `data: add ai-facts and ai-lessons datasets with contract README` → (2) `lib: deterministic daily pick + dataset loaders + tests` → (3) `feat: Dnešní AI lekce strip and Víte, že block on Today` → (4) `feat: /lekce lesson archive page` → (5) `feat: config-driven partner banner slot, empty by default` → (6) `docs: align markdown with the shipped widgets`.
- mma-files: (1) `data: add verified MMA facts dataset with contract README` → (2) `lib: deterministic daily pick + facts loader + tests` → (3) `feat: Víte, že belt on the homepage` → (4) `docs: align markdown with the shipped widget`.
- Commit messages in the repos' existing style (inspect `git log`); apply the stop-slop skill to every commit body and PR description. Push each repo's branch with `git push -u origin claude/magazine-widgets-datasets-pee5df` (retry up to 4 times with 2s/4s/8s/16s backoff on network failure only).
- Open one PR per repo only if your harness instructions permit PR creation; otherwise the pushed branches are the deliverable. PR bodies: what shipped, the before/after bundle numbers, the determinism proof (test names), the placement screenshots if your environment can take them, and the append-path summary.

# Closing instruction: the .md walk

After implementation and green gates, walk **every** `.md` file in both repos (README, CLAUDE.md, DOCS.md, about-project.md, NEEDED.md, docs/ including design docs, scaling.md, monetization.md — everything except vendored skill files under `.claude/`/`.agents/`, which you must not edit) and update each one that this build made stale so it matches reality: new paths (`data/`, `src/data/`, `lib/daily.ts`, `/lekce`, `config/banner.json`), the widgets' existence and placement, the append contract, the banner slot's empty-by-default state. Do not rewrite unrelated content; do not touch the locked brand/identity language (DNESKAi's split-name rule stays exactly as documented). Update `NEEDED.md` per the shared marker format: tick what this build finished, add `[owner:me]` items only for things genuinely blocked on the owner.

If — and only if — a blocker remains that only the owner can clear (for example: a permission you lacked, a gate that cannot pass without an owner action, a decision this prompt reserves to the owner), create a root `NEEDS_YOUR_HELP_NOW.md` in the affected repo listing the exact owner actions, one checkbox each, nothing else. Its absence means all-clear — so if nothing is blocked, make sure the file does not exist.

The one candidate you already know about: the devShark banner **creative** is intentionally out of scope (slot only). That is not a blocker — do not create `NEEDS_YOUR_HELP_NOW.md` for it; note it in `NEEDED.md` as a future `[owner:me]` item (supply creative + target URL) instead.

---

# DATASETS (complete file contents — copy verbatim; array order is the reveal order)

## `mma-files: src/data/mma-facts.json` — 50 entries (30 UFC · 13 Oktagon · 7 Czech/Slovak cross)

```json
{
  "schemaVersion": "boardless-dataset/1",
  "dataset": "mma-facts",
  "anchor": "2026-07-01",
  "categories": {
    "history": { "en": "History", "cs": "Historie" },
    "records": { "en": "Records", "cs": "Rekordy" },
    "fighters": { "en": "Fighters", "cs": "Bojovníci" },
    "events": { "en": "Events", "cs": "Turnaje" },
    "business": { "en": "Business", "cs": "Byznys" }
  },
  "entries": [
    {
      "id": "mma-001",
      "slug": "ufc-1-royce-gracie",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "Royce Gracie won the first UFC tournament in 1993 with under five minutes of total fight time",
        "full": "At UFC 1 in Denver on 12 November 1993, Royce Gracie submitted three opponents in a single night with less than five minutes of combined fight time — and took home $50,000. The one-night, open-weight tournament was built to answer a simple question: which martial art actually works."
      },
      "cs": {
        "short": "Royce Gracie vyhrál první turnaj UFC v roce 1993 za méně než pět minut čistého času v kleci",
        "full": "Na UFC 1 v Denveru 12. listopadu 1993 Royce Gracie uškrtil tři soupeře během jediného večera — dohromady strávil v zápasech necelých pět minut a odnesl si 50 000 dolarů. Jednodenní turnaj bez váhových kategorií měl odpovědět na prostou otázku: které bojové umění doopravdy funguje."
      },
      "verified": "2026-08-07",
      "source": "UFC 1 official results"
    },
    {
      "id": "mma-002",
      "slug": "oktagon-zalozeni-2016",
      "category": "history",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon MMA was founded in 2016 by Ondřej Novotný and Pavol Neruda — and grew into Europe's leading promotion",
        "full": "Ondřej Novotný and Pavol Neruda founded Oktagon MMA in 2016 as a Czech-Slovak project. Within a decade it grew from national TV beginnings into one of the biggest MMA promotions in Europe, selling out arenas in Czechia, Slovakia and Germany."
      },
      "cs": {
        "short": "Oktagon MMA založili v roce 2016 Ondřej Novotný a Pavol Neruda — a vyrostl v jedničku evropského MMA",
        "full": "Oktagon MMA založili v roce 2016 Ondřej Novotný a Pavol Neruda jako česko-slovenský projekt. Za dekádu vyrostl z televizních začátků v jednu z největších MMA organizací v Evropě, která vyprodává arény v Česku, na Slovensku i v Německu."
      },
      "verified": "2026-08-07",
      "source": "Oktagon MMA company history"
    },
    {
      "id": "mma-003",
      "slug": "masvidal-nejrychlejsi-ko",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "The fastest knockout in UFC history took five seconds: Masvidal's flying knee on Askren in 2019",
        "full": "At UFC 239 in July 2019, Jorge Masvidal sprinted across the cage and knocked out the previously unbeaten Ben Askren with a flying knee in five seconds — the fastest knockout in UFC history. Masvidal later said he had rehearsed exactly that start backstage."
      },
      "cs": {
        "short": "Nejrychlejší KO v historii UFC trvalo pět sekund: Masvidalovo letící koleno na Askrena v roce 2019",
        "full": "Na UFC 239 v červenci 2019 Jorge Masvidal vystřelil přes klec a do té doby neporaženého Bena Askrena knockoutoval letícím kolenem za pět sekund — nejrychlejší KO v historii UFC. Masvidal později přiznal, že přesně tenhle začátek nacvičoval v šatně."
      },
      "verified": "2026-08-07",
      "source": "UFC record book, UFC 239"
    },
    {
      "id": "mma-004",
      "slug": "vemola-prvni-cech-v-ufc",
      "category": "fighters",
      "promotion": "cross",
      "en": {
        "short": "Karlos Vémola became the first Czech fighter in the UFC back in 2010",
        "full": "Karlos Vémola made history in 2010 as the first Czech fighter to compete in the UFC, debuting at UFC 116 in Las Vegas. Years before Oktagon superstardom, the 'Terminator' was carrying the Czech flag on MMA's biggest stage."
      },
      "cs": {
        "short": "Karlos Vémola se v roce 2010 stal prvním Čechem v UFC",
        "full": "Karlos Vémola vstoupil do historie v roce 2010 jako první český zápasník v UFC — debutoval na turnaji UFC 116 v Las Vegas. Roky předtím, než se stal hvězdou Oktagonu, nesl 'Terminátor' českou vlajku na největší scéně MMA."
      },
      "verified": "2026-08-07",
      "source": "UFC 116 official results"
    },
    {
      "id": "mma-005",
      "slug": "ufc-koupeno-za-2-miliony",
      "category": "business",
      "promotion": "ufc",
      "en": {
        "short": "The UFC sold for $2 million in 2001 — and for about $4 billion fifteen years later",
        "full": "In January 2001 the Fertitta brothers and Dana White bought the struggling UFC for roughly $2 million. In 2016 they sold it for about $4.025 billion — at the time the largest single sale in sports history, a roughly 2,000-fold return."
      },
      "cs": {
        "short": "UFC se v roce 2001 prodalo za 2 miliony dolarů — a o patnáct let později za zhruba 4 miliardy",
        "full": "V lednu 2001 koupili bratři Fertittové s Danou Whitem skomírající UFC za zhruba 2 miliony dolarů. V roce 2016 ho prodali za přibližně 4,025 miliardy — tehdy největší jednorázový prodej ve sportovní historii a asi dvoutisícinásobné zhodnocení."
      },
      "verified": "2026-08-07",
      "source": "Zuffa acquisition and 2016 WME-IMG sale coverage"
    },
    {
      "id": "mma-006",
      "slug": "souboj-stoleti-o2",
      "category": "events",
      "promotion": "oktagon",
      "en": {
        "short": "Vémola vs. Végh in 2019 was the first MMA event to sell out Prague's O2 Arena — Végh won in round one",
        "full": "On 9 November 2019, Oktagon 15 staged Karlos Vémola vs. Attila Végh, billed as the 'Fight of the Century' — the first MMA event to sell out Prague's O2 Arena. The biggest Czech-Slovak fight ever ended inside one round, with Végh knocking Vémola out."
      },
      "cs": {
        "short": "Vémola vs. Végh v roce 2019 jako první MMA akce vyprodal pražskou O2 arenu — Végh vyhrál v prvním kole",
        "full": "9. listopadu 2019 postavil Oktagon 15 proti sobě Karlose Vémolu a Attilu Végha v 'Souboji století' — první MMA akci, která vyprodala pražskou O2 arenu. Největší česko-slovenský zápas historie skončil už v prvním kole, když Végh Vémolu knockoutoval."
      },
      "verified": "2026-08-07",
      "source": "Oktagon 15 official results"
    },
    {
      "id": "mma-007",
      "slug": "mcgregor-13-sekund",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "The fastest finish in a UFC title fight: McGregor knocked out Aldo in 13 seconds",
        "full": "At UFC 194 in December 2015, Conor McGregor knocked out featherweight champion José Aldo with a single left hand in 13 seconds — the fastest finish in UFC title-fight history. Aldo had not lost a fight in ten years."
      },
      "cs": {
        "short": "Nejrychlejší konec titulového zápasu UFC: McGregor knockoutoval Alda za 13 sekund",
        "full": "Na UFC 194 v prosinci 2015 Conor McGregor jedinou levačkou knockoutoval šampiona pérové váhy Josého Alda za 13 sekund — nejrychlejší konec titulového zápasu v historii UFC. Aldo do té doby neprohrál deset let."
      },
      "verified": "2026-08-07",
      "source": "UFC record book, UFC 194"
    },
    {
      "id": "mma-008",
      "slug": "prochazka-prvni-cesky-sampion",
      "category": "records",
      "promotion": "cross",
      "en": {
        "short": "Jiří Procházka won the UFC light heavyweight title in only his third UFC fight — the first Czech champion",
        "full": "At UFC 275 in June 2022, Jiří Procházka submitted Glover Teixeira with 28 seconds left in the final round of a fight he was losing on the scorecards — becoming the first Czech UFC champion, in only his third fight in the organization."
      },
      "cs": {
        "short": "Jiří Procházka získal titul UFC už ve svém třetím zápase v organizaci — jako první Čech v historii",
        "full": "Na UFC 275 v červnu 2022 Jiří Procházka uškrtil Glovera Teixeiru 28 sekund před koncem posledního kola zápasu, který na bodech prohrával — a stal se prvním českým šampionem UFC, už ve svém třetím zápase v organizaci."
      },
      "verified": "2026-08-07",
      "source": "UFC 275 official results"
    },
    {
      "id": "mma-009",
      "slug": "ufc-bez-pravidel",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "Early UFC had no gloves, no weight classes, no rounds and no judges — only biting and eye-gouging were banned",
        "full": "For its first years the UFC ran with no gloves, no weight classes, no rounds and no judges; the only firm rules banned biting and eye-gouging. Gloves became mandatory in 1997, weight classes arrived the same year, and five-minute rounds only in 1999."
      },
      "cs": {
        "short": "Rané UFC nemělo rukavice, váhové kategorie, kola ani rozhodčí u stolku — zakázané bylo jen kousání a píchání do očí",
        "full": "První roky se v UFC zápasilo bez rukavic, bez váhových kategorií, bez kol a bez bodových rozhodčích; pevná pravidla zakazovala jen kousání a píchání do očí. Rukavice se staly povinnými v roce 1997, ve stejném roce přišly váhové kategorie a pětiminutová kola až v roce 1999."
      },
      "verified": "2026-08-07",
      "source": "UFC rules history (UFC 14, UFC 12, UFC 21)"
    },
    {
      "id": "mma-010",
      "slug": "oktagon-55-frankfurt",
      "category": "events",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon 55 in Frankfurt drew over 57,000 fans — the biggest MMA event ever held in Europe",
        "full": "On 8 June 2024, Oktagon 55 filled Frankfurt's Deutsche Bank Park football stadium with more than 57,000 fans for the German derby Christian Eckerlin vs. Christian Jungwirth — the largest attendance for any MMA event ever held in Europe, staged by a Czech-Slovak promotion."
      },
      "cs": {
        "short": "Oktagon 55 ve Frankfurtu přilákal přes 57 000 diváků — největší MMA akce, jaká se kdy v Evropě konala",
        "full": "8. června 2024 zaplnil Oktagon 55 frankfurtský fotbalový stadion Deutsche Bank Park více než 57 000 diváky na německé derby Christian Eckerlin vs. Christian Jungwirth — nejvyšší návštěva MMA akce v evropské historii, kterou uspořádala česko-slovenská organizace."
      },
      "verified": "2026-08-07",
      "source": "Oktagon 55 attendance reports"
    },
    {
      "id": "mma-011",
      "slug": "khabib-29-0",
      "category": "fighters",
      "promotion": "ufc",
      "en": {
        "short": "Khabib Nurmagomedov retired as undefeated champion with a perfect 29-0 record",
        "full": "Khabib Nurmagomedov retired in October 2020 as the reigning UFC lightweight champion with a perfect 29-0 professional record, walking away immediately after defending his belt — keeping a promise to his mother following his father's death."
      },
      "cs": {
        "short": "Khabib Nurmagomedov ukončil kariéru jako neporažený šampion s bilancí 29-0",
        "full": "Khabib Nurmagomedov ukončil kariéru v říjnu 2020 jako úřadující šampion lehké váhy UFC s dokonalou bilancí 29-0. Odešel hned po obhajobě titulu — splnil tím slib, který dal matce po smrti svého otce."
      },
      "verified": "2026-08-07",
      "source": "UFC 254 and Nurmagomedov retirement coverage"
    },
    {
      "id": "mma-012",
      "slug": "gamechanger-milion-eur",
      "category": "business",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon's Tipsport Gamechanger tournament pays the winner €1,000,000 — the richest prize in European MMA",
        "full": "Oktagon's Tipsport Gamechanger, a 16-man welterweight pyramid launched in 2022, put up €1,000,000 for the winner — the richest tournament prize in European MMA history. Czech veteran David Kozma fought his way through the bracket and claimed the first million in 2023."
      },
      "cs": {
        "short": "Turnaj Tipsport Gamechanger od Oktagonu vyplácí vítězi 1 000 000 eur — nejvyšší prémii v evropském MMA",
        "full": "Tipsport Gamechanger, pyramida šestnácti zápasníků velterové váhy, kterou Oktagon spustil v roce 2022, nabídla vítězi 1 000 000 eur — nejvyšší turnajovou prémii v historii evropského MMA. Prvním milionářem se v roce 2023 stal český veterán David Kozma, který prošel celým pavoukem."
      },
      "verified": "2026-08-07",
      "source": "Oktagon Tipsport Gamechanger coverage"
    },
    {
      "id": "mma-013",
      "slug": "johnson-11-obhajob",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Demetrious Johnson defended a UFC title 11 times in a row — still the all-time record",
        "full": "Between 2012 and 2017, flyweight champion Demetrious 'Mighty Mouse' Johnson defended his UFC title eleven consecutive times — a record no champion in any division has matched since."
      },
      "cs": {
        "short": "Demetrious Johnson obhájil titul UFC jedenáctkrát v řadě — dodnes absolutní rekord",
        "full": "Šampion muší váhy Demetrious 'Mighty Mouse' Johnson v letech 2012 až 2017 obhájil titul UFC jedenáctkrát za sebou — rekord, který od té doby nevyrovnal žádný šampion v žádné divizi."
      },
      "verified": "2026-08-07",
      "source": "UFC record book"
    },
    {
      "id": "mma-014",
      "slug": "ufc-poprve-v-praze",
      "category": "events",
      "promotion": "cross",
      "en": {
        "short": "The UFC came to Czechia for the first time in February 2019 — a sold-out O2 Arena in Prague",
        "full": "On 23 February 2019 the UFC held its first event on Czech soil: UFC Fight Night Prague in a sold-out O2 Arena, headlined by Thiago Santos' TKO of Jan Błachowicz. The demand proved what Czech MMA fans had long known — the country is fight territory."
      },
      "cs": {
        "short": "UFC dorazilo do Česka poprvé v únoru 2019 — do vyprodané pražské O2 areny",
        "full": "23. února 2019 uspořádalo UFC první turnaj na české půdě: UFC Fight Night Prague ve vyprodané O2 areně, v jejímž hlavním zápase Thiago Santos ukončil Jana Błachowicze TKO. Zájem potvrdil, co čeští fanoušci věděli dávno — tahle země je zápasnický region."
      },
      "verified": "2026-08-07",
      "source": "UFC Fight Night 145 official results"
    },
    {
      "id": "mma-015",
      "slug": "lidske-kohouti-zapasy",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "Senator McCain called the UFC 'human cockfighting' — and got it banned across much of the US in the 1990s",
        "full": "In 1996, Senator John McCain wrote to the governors of all fifty states calling the UFC 'human cockfighting'. Dozens of states banned the sport and cable carriers dropped it — nearly killing the company and forcing the Unified Rules that legitimized modern MMA in 2000."
      },
      "cs": {
        "short": "Senátor McCain nazval UFC 'lidskými kohoutími zápasy' — a v 90. letech ho dostal do zákazu ve velké části USA",
        "full": "Senátor John McCain v roce 1996 napsal guvernérům všech padesáti států, že UFC jsou 'lidské kohoutí zápasy'. Desítky států sport zakázaly a kabelové televize ho vyřadily — společnost to téměř zabilo a vynutilo si to Sjednocená pravidla, která v roce 2000 dala modernímu MMA legitimitu."
      },
      "verified": "2026-08-07",
      "source": "1990s UFC regulation history, Unified Rules of MMA"
    },
    {
      "id": "mma-016",
      "slug": "vegh-sampion-bellatoru",
      "category": "fighters",
      "promotion": "oktagon",
      "en": {
        "short": "Attila Végh held a major American world title: he was Bellator light heavyweight champion in 2013",
        "full": "Years before becoming an Oktagon icon, Slovakia's Attila Végh won the Bellator light heavyweight world title in 2013, beating champion Christian M'Pumbu after winning the season tournament — a Slovak holding one of America's major MMA belts."
      },
      "cs": {
        "short": "Attila Végh držel velký americký titul: v roce 2013 byl šampionem polotěžké váhy Bellatoru",
        "full": "Roky předtím, než se stal ikonou Oktagonu, vybojoval Slovák Attila Végh v roce 2013 světový titul polotěžké váhy organizace Bellator — po vítězství v sezónním turnaji porazil šampiona Christiana M'Pumbua. Slovák tehdy držel jeden z velkých amerických opasků MMA."
      },
      "verified": "2026-08-07",
      "source": "Bellator 91 official results"
    },
    {
      "id": "mma-017",
      "slug": "ufc-229-ppv-rekord",
      "category": "business",
      "promotion": "ufc",
      "en": {
        "short": "Khabib vs. McGregor sold about 2.4 million pay-per-views — the biggest MMA event ever sold",
        "full": "UFC 229 in October 2018, headlined by Khabib Nurmagomedov vs. Conor McGregor, sold approximately 2.4 million pay-per-view buys — the highest-selling MMA event in history, roughly double the previous UFC record."
      },
      "cs": {
        "short": "Khabib vs. McGregor prodal zhruba 2,4 milionu pay-per-view — komerčně největší MMA akce historie",
        "full": "UFC 229 z října 2018 s hlavním zápasem Khabib Nurmagomedov vs. Conor McGregor prodalo přibližně 2,4 milionu pay-per-view — nejprodávanější MMA akce v historii, zhruba dvojnásobek předchozího rekordu UFC."
      },
      "verified": "2026-08-07",
      "source": "UFC 229 PPV reporting"
    },
    {
      "id": "mma-018",
      "slug": "silva-16-vyher",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Anderson Silva won 16 UFC fights in a row and held the middleweight title for 2,457 days",
        "full": "Anderson Silva ran off sixteen straight UFC wins between 2006 and 2012 and reigned as middleweight champion for 2,457 days — both still records for the longest win streak and the longest single title reign in UFC history."
      },
      "cs": {
        "short": "Anderson Silva vyhrál 16 zápasů UFC v řadě a titul střední váhy držel 2 457 dní",
        "full": "Anderson Silva mezi lety 2006 a 2012 vyhrál šestnáct zápasů UFC v řadě a titul střední váhy držel 2 457 dní — dodnes rekordy pro nejdelší vítěznou sérii i nejdelší nepřerušenou vládu šampiona v historii UFC."
      },
      "verified": "2026-08-07",
      "source": "UFC record book"
    },
    {
      "id": "mma-019",
      "slug": "oktagon-underground",
      "category": "history",
      "promotion": "oktagon",
      "en": {
        "short": "When COVID stopped sport in 2020, Oktagon kept fighting behind closed doors with the Underground series",
        "full": "During the 2020 lockdowns, Oktagon launched Oktagon Underground — a televised behind-closed-doors tournament series from an empty gym. While most European sport stood still, Czech and Slovak fighters kept competing and the promotion kept its audience."
      },
      "cs": {
        "short": "Když covid v roce 2020 zastavil sport, Oktagon zápasil dál za zavřenými dveřmi v sérii Underground",
        "full": "Během lockdownů v roce 2020 spustil Oktagon sérii Oktagon Underground — televizní turnaje bez diváků z prázdné tělocvičny. Zatímco většina evropského sportu stála, čeští a slovenští bojovníci zápasili dál a organizace si udržela publikum."
      },
      "verified": "2026-08-07",
      "source": "Oktagon Underground 2020 series"
    },
    {
      "id": "mma-020",
      "slug": "rousey-prvni-zena",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "Dana White said women would 'never' fight in the UFC — a year later he signed Ronda Rousey",
        "full": "In 2011 Dana White said women would 'never' fight in the UFC. In late 2012 he signed Ronda Rousey, and at UFC 157 in February 2013 she beat Liz Carmouche in the promotion's first women's bout — launching divisions that produced some of its biggest stars."
      },
      "cs": {
        "short": "Dana White prohlásil, že ženy v UFC 'nikdy' zápasit nebudou — o rok později podepsal Rondu Rousey",
        "full": "V roce 2011 Dana White prohlásil, že ženy v UFC 'nikdy' zápasit nebudou. Koncem roku 2012 podepsal Rondu Rousey a na UFC 157 v únoru 2013 porazila Liz Carmouche v prvním ženském zápase organizace — a odstartovala divize, které daly UFC některé z jeho největších hvězd."
      },
      "verified": "2026-08-07",
      "source": "UFC 157 and Rousey signing coverage"
    },
    {
      "id": "mma-021",
      "slug": "prochazka-vzdal-se-titulu",
      "category": "fighters",
      "promotion": "cross",
      "en": {
        "short": "Procházka vacated the UFC belt undefeated in 2022 with a shoulder injury doctors called among the worst they'd seen",
        "full": "In November 2022, Jiří Procházka vacated the UFC light heavyweight title without ever losing it, after wrecking his shoulder in training — an injury UFC officials described as among the most severe doctors had seen in the sport. A year later he was back fighting for the same belt."
      },
      "cs": {
        "short": "Procházka se v roce 2022 vzdal titulu UFC neporažen — s ramenem, které lékaři popsali jako jedno z nejhorších zranění, jaké viděli",
        "full": "V listopadu 2022 se Jiří Procházka vzdal titulu polotěžké váhy UFC, aniž by ho kdy prohrál — v tréninku si zničil rameno a zástupci UFC zranění popsali jako jedno z nejtěžších, jaké lékaři ve sportu viděli. O rok později už znovu boxoval o stejný opasek."
      },
      "verified": "2026-08-07",
      "source": "UFC title vacation announcement, Nov 2022; UFC 295"
    },
    {
      "id": "mma-022",
      "slug": "zapas-ktery-zachranil-ufc",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "Griffin vs. Bonnar in 2005 is 'the most important fight in UFC history' — it saved the company",
        "full": "The Ultimate Fighter finale on 9 April 2005 saw Forrest Griffin and Stephan Bonnar trade blows for three wild rounds on live TV. Dana White calls it the most important fight in UFC history: it convinced Spike TV to keep the show, both men got contracts, and the near-bankrupt UFC turned around."
      },
      "cs": {
        "short": "Griffin vs. Bonnar z roku 2005 je 'nejdůležitější zápas historie UFC' — zachránil celou firmu",
        "full": "Ve finále reality show The Ultimate Fighter 9. dubna 2005 se Forrest Griffin a Stephan Bonnar tři divoká kola přetahovali v přímém přenosu. Dana White ho označuje za nejdůležitější zápas historie UFC: přesvědčil stanici Spike TV, oba muži dostali smlouvu a UFC na pokraji bankrotu se odrazilo ode dna."
      },
      "verified": "2026-08-07",
      "source": "TUF 1 Finale, Dana White interviews"
    },
    {
      "id": "mma-023",
      "slug": "chochlikova-prvni-sampionka",
      "category": "fighters",
      "promotion": "oktagon",
      "en": {
        "short": "Monika Chochlíková became Oktagon's first women's champion in 2023",
        "full": "In 2023, Slovak striker Monika Chochlíková beat Lucia Szabová in an all-Slovak headline fight to become the first women's champion in Oktagon history — a milestone for women's MMA in the region."
      },
      "cs": {
        "short": "Monika Chochlíková se v roce 2023 stala první šampionkou v historii Oktagonu",
        "full": "Slovenská úderkářka Monika Chochlíková v roce 2023 porazila Luciu Szabovou v čistě slovenském hlavním zápase a stala se první šampionkou v historii Oktagonu — milník pro ženské MMA v regionu."
      },
      "verified": "2026-08-07",
      "source": "Oktagon women's title fight coverage, 2023"
    },
    {
      "id": "mma-024",
      "slug": "jones-nejmladsi-sampion",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Jon Jones became the youngest UFC champion ever at 23",
        "full": "At UFC 128 in March 2011, Jon Jones beat Maurício 'Shogun' Rua to become UFC light heavyweight champion at 23 years old — still the youngest champion in the promotion's history."
      },
      "cs": {
        "short": "Jon Jones se stal nejmladším šampionem UFC v historii — ve 23 letech",
        "full": "Na UFC 128 v březnu 2011 porazil Jon Jones Maurícia 'Shoguna' Ruu a ve 23 letech se stal šampionem polotěžké váhy — dodnes nejmladším šampionem v historii UFC."
      },
      "verified": "2026-08-07",
      "source": "UFC 128 official results"
    },
    {
      "id": "mma-025",
      "slug": "nejdelsi-zapas-36-minut",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "The longest fight in UFC history ran 36 minutes without a winner: Gracie vs. Shamrock in 1995",
        "full": "The UFC 5 'Superfight' between Royce Gracie and Ken Shamrock in April 1995 ran 36 minutes and 6 seconds — with no rounds and no judges, it simply ended as a draw when time expired. It remains the longest fight in UFC history and helped force the introduction of time limits."
      },
      "cs": {
        "short": "Nejdelší zápas historie UFC trval 36 minut a nikdo nevyhrál: Gracie vs. Shamrock v roce 1995",
        "full": "'Superfight' Royce Gracie vs. Ken Shamrock na UFC 5 v dubnu 1995 trval 36 minut a 6 sekund — bez kol a bez rozhodčích skončil po vypršení času prostě remízou. Dodnes je to nejdelší zápas historie UFC a přispěl k zavedení časových limitů."
      },
      "verified": "2026-08-07",
      "source": "UFC 5 official results"
    },
    {
      "id": "mma-026",
      "slug": "odveta-po-triech-rokoch",
      "category": "events",
      "promotion": "oktagon",
      "en": {
        "short": "Vémola avenged the 'Fight of the Century' — winning the rematch with Végh at a packed O2 Arena in 2022",
        "full": "On 30 December 2022, Oktagon 35 brought Karlos Vémola and Attila Végh back to Prague's O2 Arena for the rematch of the biggest Czech-Slovak fight ever. Three years after his round-one loss, Vémola won — closing the rivalry that built modern Czech MMA's popularity."
      },
      "cs": {
        "short": "Vémola odčinil 'Souboj století' — odvetu s Véghem v zaplněné O2 areně v roce 2022 vyhrál",
        "full": "30. prosince 2022 přivedl Oktagon 35 Karlose Vémolu a Attilu Végha zpět do pražské O2 areny k odvetě největšího česko-slovenského zápasu historie. Tři roky po porážce v prvním kole Vémola vyhrál — a uzavřel rivalitu, která vybudovala popularitu moderního českého MMA."
      },
      "verified": "2026-08-07",
      "source": "Oktagon 35 official results"
    },
    {
      "id": "mma-027",
      "slug": "nunes-51-sekund",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Amanda Nunes knocked out the 'most dangerous woman on the planet' in 51 seconds to hold two belts at once",
        "full": "At UFC 232 in December 2018, Amanda Nunes knocked out Cris Cyborg — unbeaten for 13 years — in 51 seconds, becoming the first woman to hold two UFC titles simultaneously, at bantamweight and featherweight."
      },
      "cs": {
        "short": "Amanda Nunes knockoutovala 'nejnebezpečnější ženu planety' za 51 sekund a držela dva tituly najednou",
        "full": "Na UFC 232 v prosinci 2018 Amanda Nunes za 51 sekund knockoutovala Cris Cyborg, která neprohrála 13 let — a stala se první ženou se dvěma tituly UFC současně, v bantamové a pérové váze."
      },
      "verified": "2026-08-07",
      "source": "UFC 232 official results"
    },
    {
      "id": "mma-028",
      "slug": "muradov-mayweather",
      "category": "fighters",
      "promotion": "cross",
      "en": {
        "short": "Prague-based Makhmud Muradov was promoted by Floyd Mayweather's team — and won his first three UFC fights",
        "full": "Makhmud Muradov, the Uzbek middleweight who built his career out of Prague, signed a promotional deal with Floyd Mayweather's 'The Money Team' before joining the UFC in 2019 — where he won his first three fights in the organization."
      },
      "cs": {
        "short": "Machmud Muradov z Prahy měl za zády tým Floyda Mayweathera — a první tři zápasy v UFC vyhrál",
        "full": "Machmud Muradov, uzbecký zápasník střední váhy, který kariéru vybudoval v Praze, podepsal před vstupem do UFC v roce 2019 smlouvu s 'The Money Team' Floyda Mayweathera — a první tři zápasy v organizaci vyhrál."
      },
      "verified": "2026-08-07",
      "source": "Muradov UFC record 2019-2021"
    },
    {
      "id": "mma-029",
      "slug": "ngannou-nejtvrdsi-uder",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Francis Ngannou holds the hardest punch ever measured by the UFC — 'like getting hit by a Ford Escort'",
        "full": "Francis Ngannou's punch measured 129,161 units on the PowerKube — the hardest ever recorded by the UFC. Dana White compared it to being hit by a Ford Escort at full speed; the record stands more than a decade later."
      },
      "cs": {
        "short": "Francis Ngannou drží nejtvrdší úder, jaký kdy UFC naměřilo — 'jako když vás srazí Ford Escort'",
        "full": "Úder Francise Ngannoua naměřil na zařízení PowerKube 129 161 jednotek — nejvíc, co kdy UFC zaznamenalo. Dana White ho přirovnal ke srážce s Fordem Escort v plné rychlosti; rekord platí i po více než dekádě."
      },
      "verified": "2026-08-07",
      "source": "UFC Performance Institute PowerKube measurement, 2017"
    },
    {
      "id": "mma-030",
      "slug": "novotny-survivor",
      "category": "history",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon's co-founder calls the fights himself — and hosted the Czech-Slovak Survivor on the side",
        "full": "Ondřej Novotný is a rare promoter who is also his organization's voice: Oktagon's co-founder works as its lead commentator and public face, and mainstream Czech-Slovak audiences also know him as the host of the TV show Survivor — reach few fight promoters anywhere can match."
      },
      "cs": {
        "short": "Spoluzakladatel Oktagonu si zápasy sám komentuje — a vedle toho moderoval česko-slovenský Survivor",
        "full": "Ondřej Novotný je vzácný případ promotéra, který je zároveň hlasem své organizace: spoluzakladatel Oktagonu dělá hlavního komentátora i tvář promotion a mainstreamové česko-slovenské publikum ho zná také jako moderátora show Survivor — dosah, jaký má málokterý promotér na světě."
      },
      "verified": "2026-08-07",
      "source": "Oktagon broadcasts; Survivor Česko & Slovensko"
    },
    {
      "id": "mma-031",
      "slug": "mcgregor-dva-tituly",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "McGregor became the first fighter to hold two UFC titles at once — at the first UFC event in New York",
        "full": "At UFC 205 in November 2016 — the first UFC event at Madison Square Garden after New York finally legalized MMA — Conor McGregor knocked out Eddie Alvarez to add the lightweight belt to his featherweight title, becoming the first simultaneous two-division champion in UFC history."
      },
      "cs": {
        "short": "McGregor jako první v historii držel dva tituly UFC najednou — na prvním turnaji UFC v New Yorku",
        "full": "Na UFC 205 v listopadu 2016 — prvním turnaji UFC v Madison Square Garden poté, co New York konečně legalizoval MMA — knockoutoval Conor McGregor Eddieho Alvareze a k titulu pérové váhy přidal opasek lehké váhy. Stal se prvním šampionem dvou divizí současně v historii UFC."
      },
      "verified": "2026-08-07",
      "source": "UFC 205 official results"
    },
    {
      "id": "mma-032",
      "slug": "dvorak-tri-vyhry",
      "category": "fighters",
      "promotion": "cross",
      "en": {
        "short": "Czech flyweight David Dvořák won his first three UFC fights",
        "full": "David Dvořák entered the UFC in 2020 riding a years-long win streak and beat his first three opponents in the organization — for a stretch, the quiet man from Hradec Králové was ranked among the world's top flyweights."
      },
      "cs": {
        "short": "Český mušák David Dvořák vyhrál své první tři zápasy v UFC",
        "full": "David Dvořák vstoupil do UFC v roce 2020 na několikaleté vítězné vlně a první tři soupeře v organizaci porazil — tichý zápasník z Hradce Králové se na čas zařadil mezi nejlepší mušáky světového žebříčku."
      },
      "verified": "2026-08-07",
      "source": "Dvořák UFC record 2020-2021"
    },
    {
      "id": "mma-033",
      "slug": "holloway-445-uderu",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Max Holloway landed 445 significant strikes in one fight — while chatting to the commentary desk mid-round",
        "full": "In January 2021, Max Holloway landed a UFC-record 445 significant strikes on Calvin Kattar over five rounds. At one point he turned to the commentary desk mid-round, told them he was the best boxer in the UFC — and kept slipping punches while looking away from his opponent."
      },
      "cs": {
        "short": "Max Holloway trefil v jednom zápase 445 přesných úderů — a mezitím se bavil s komentátory",
        "full": "V lednu 2021 Max Holloway zasáhl Calvina Kattara rekordními 445 přesnými údery za pět kol. V jednu chvíli se uprostřed kola otočil ke komentátorskému stolku, oznámil jim, že je nejlepší boxer v UFC — a dál uhýbal úderům, aniž by se na soupeře díval."
      },
      "verified": "2026-08-07",
      "source": "UFC Fight Island 7 statistics"
    },
    {
      "id": "mma-034",
      "slug": "oktagon-vyzva",
      "category": "history",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon runs its own reality show: the winner of Oktagon Výzva earns a contract with the promotion",
        "full": "Oktagon Výzva (Challenge) is the promotion's own reality competition, putting prospects through a fight-camp show format with an Oktagon contract for the winner — the same TV-first playbook that once saved the UFC, applied to the Czech-Slovak scene."
      },
      "cs": {
        "short": "Oktagon má vlastní reality show: vítěz Oktagon Výzvy získává smlouvu s organizací",
        "full": "Oktagon Výzva je vlastní reality soutěž organizace: talenty prověřuje formátem zápasnického kempu a vítěz získává smlouvu s Oktagonem — stejný televizní recept, který kdysi zachránil UFC, přenesený na česko-slovenskou scénu."
      },
      "verified": "2026-08-07",
      "source": "Oktagon Výzva series"
    },
    {
      "id": "mma-035",
      "slug": "teixeira-nejstarsi-prvosampion",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Glover Teixeira won his first UFC title at 42 — nineteen years into his professional career",
        "full": "At UFC 267 in October 2021, Glover Teixeira submitted Jan Błachowicz to become UFC light heavyweight champion at age 42 — the oldest first-time champion in UFC history, nineteen years after his professional debut."
      },
      "cs": {
        "short": "Glover Teixeira získal svůj první titul UFC ve 42 letech — devatenáct let po startu kariéry",
        "full": "Na UFC 267 v říjnu 2021 uškrtil Glover Teixeira Jana Błachowicze a ve 42 letech se stal šampionem polotěžké váhy — nejstarším prvošampionem v historii UFC, devatenáct let po svém profesionálním debutu."
      },
      "verified": "2026-08-07",
      "source": "UFC 267 official results"
    },
    {
      "id": "mma-036",
      "slug": "rekordni-navsteva-melbourne",
      "category": "events",
      "promotion": "ufc",
      "en": {
        "short": "The UFC's attendance record is 57,127 — set in Melbourne in 2019",
        "full": "UFC 243 at Melbourne's Marvel Stadium in October 2019, headlined by Robert Whittaker vs. Israel Adesanya, drew 57,127 fans — the largest attendance in UFC history. Europe's Oktagon 55 later matched that scale on its own continent."
      },
      "cs": {
        "short": "Rekordní návštěva UFC je 57 127 diváků — z Melbourne 2019",
        "full": "UFC 243 na stadionu Marvel Stadium v Melbourne v říjnu 2019 s hlavním zápasem Robert Whittaker vs. Israel Adesanya přilákalo 57 127 diváků — nejvíc v historii UFC. Evropský Oktagon 55 později dosáhl stejného měřítka na vlastním kontinentu."
      },
      "verified": "2026-08-07",
      "source": "UFC 243 attendance figures"
    },
    {
      "id": "mma-037",
      "slug": "oktagon-pres-70-turnaju",
      "category": "business",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon passed 70 numbered events by 2025 — running at a near-monthly pace across three countries",
        "full": "By 2025, less than a decade after its founding, Oktagon had staged more than seventy numbered events at a near-monthly cadence across Czechia, Slovakia and Germany — one of the busiest MMA schedules of any promotion in Europe."
      },
      "cs": {
        "short": "Oktagon do roku 2025 překonal 70 očíslovaných turnajů — v téměř měsíčním tempu ve třech zemích",
        "full": "Do roku 2025, ani ne dekádu od založení, uspořádal Oktagon přes sedmdesát očíslovaných turnajů v téměř měsíčním tempu napříč Českem, Slovenskem a Německem — jeden z nejnabitějších kalendářů ze všech MMA organizací v Evropě."
      },
      "verified": "2026-08-07",
      "source": "Oktagon event numbering through 2025"
    },
    {
      "id": "mma-038",
      "slug": "cejudo-olympijske-zlato",
      "category": "fighters",
      "promotion": "ufc",
      "en": {
        "short": "Henry Cejudo is the only Olympic gold medalist to also win a UFC title",
        "full": "Henry Cejudo won Olympic gold in freestyle wrestling in 2008 and later became UFC flyweight and bantamweight champion — the only athlete in history to hold both an Olympic gold medal and a UFC belt."
      },
      "cs": {
        "short": "Henry Cejudo je jediný olympijský vítěz, který získal i titul UFC",
        "full": "Henry Cejudo vybojoval v roce 2008 olympijské zlato ve volném stylu a později se stal šampionem UFC v muší i bantamové váze — jediný sportovec v historii, který drží olympijské zlato i opasek UFC."
      },
      "verified": "2026-08-07",
      "source": "2008 Olympics; UFC 227, UFC 238"
    },
    {
      "id": "mma-039",
      "slug": "pudilova-prvni-ceska",
      "category": "fighters",
      "promotion": "cross",
      "en": {
        "short": "Lucie Pudilová became the first Czech woman to fight in the UFC in 2017",
        "full": "Lucie Pudilová debuted in the UFC in February 2017 as the first Czech woman to fight in the organization, and went on to face top-ranked opposition across two stints — opening the door other Czech women's MMA prospects now walk through."
      },
      "cs": {
        "short": "Lucie Pudilová se v roce 2017 stala první Češkou v UFC",
        "full": "Lucie Pudilová debutovala v UFC v únoru 2017 jako první česká zápasnice v organizaci a během dvou angažmá se postavila i soupeřkám z čela žebříčku — otevřela dveře, kterými dnes procházejí další české naděje ženského MMA."
      },
      "verified": "2026-08-07",
      "source": "Pudilová UFC debut, Feb 2017"
    },
    {
      "id": "mma-040",
      "slug": "zuffa-44-milionu-ztraty",
      "category": "business",
      "promotion": "ufc",
      "en": {
        "short": "The UFC's owners burned through $44 million before the company ever turned a profit",
        "full": "Before The Ultimate Fighter turned the business around in 2005, the Fertitta brothers had sunk roughly $44 million of casino money into a UFC that kept losing — Dana White has said they came within a conversation of selling it all."
      },
      "cs": {
        "short": "Majitelé UFC prodělali 44 milionů dolarů, než firma poprvé vydělala",
        "full": "Než reality show The Ultimate Fighter v roce 2005 obrátila byznys, nasypali bratři Fertittové do ztrátového UFC zhruba 44 milionů dolarů z kasinových peněz — Dana White přiznal, že od prodeje celé firmy je dělil jediný rozhovor."
      },
      "verified": "2026-08-07",
      "source": "Zuffa pre-2005 financials as reported by Dana White"
    },
    {
      "id": "mma-041",
      "slug": "pereira-dva-sporty",
      "category": "fighters",
      "promotion": "ufc",
      "en": {
        "short": "Alex Pereira won world titles in two divisions in kickboxing AND two divisions in the UFC — nobody else has",
        "full": "Alex Pereira held Glory kickboxing world titles in two weight classes, then won the UFC middleweight and light heavyweight titles as well — the only athlete to be a two-division world champion in both sports. He also beat Israel Adesanya in kickboxing and MMA alike."
      },
      "cs": {
        "short": "Alex Pereira získal světové tituly ve dvou vahách v kickboxu I ve dvou divizích UFC — jako jediný v historii",
        "full": "Alex Pereira držel světové tituly organizace Glory ve dvou váhových kategoriích kickboxu a poté vybojoval i tituly UFC ve střední a polotěžké váze — jediný sportovec, který je dvojnásobným šampionem dvou divizí v obou sportech. Israele Adesanyu navíc porazil v kickboxu i v MMA."
      },
      "verified": "2026-08-07",
      "source": "Glory and UFC title histories"
    },
    {
      "id": "mma-042",
      "slug": "oktagon-stvanice",
      "category": "events",
      "promotion": "oktagon",
      "en": {
        "short": "Oktagon fights under the open sky: the promotion staged summer events at Prague's Štvanice island stadium",
        "full": "In the summer of 2023, Oktagon brought MMA to the historic open-air tennis stadium on Prague's Štvanice island — cage, floodlights and river air in a venue built for Davis Cup tennis, and the format returned in following seasons."
      },
      "cs": {
        "short": "Oktagon zápasí pod širým nebem: letní turnaje uspořádal na pražském ostrově Štvanice",
        "full": "V létě 2023 přivedl Oktagon MMA do historického otevřeného tenisového stadionu na pražské Štvanici — klec, reflektory a vzduch od řeky v aréně postavené pro daviscupový tenis. Formát se vracel i v dalších sezónách."
      },
      "verified": "2026-08-07",
      "source": "Oktagon Štvanice open-air events, 2023-2024"
    },
    {
      "id": "mma-043",
      "slug": "rousey-14-sekund",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Ronda Rousey once defended her title in 14 seconds — the fastest submission in UFC title-fight history",
        "full": "At UFC 184 in February 2015, Ronda Rousey armbarred the undefeated Cat Zingano in 14 seconds — still the fastest submission in a UFC title fight. Three of her title defenses ended in 14, 16 and 34 seconds."
      },
      "cs": {
        "short": "Ronda Rousey jednou obhájila titul za 14 sekund — nejrychlejší submise v titulovém zápase UFC",
        "full": "Na UFC 184 v únoru 2015 nasadila Ronda Rousey do té doby neporažené Cat Zingano páku na loket po 14 sekundách — dodnes nejrychlejší submise v titulovém zápase UFC. Tři její obhajoby skončily do 34 sekund: za 14, 16 a 34 sekund."
      },
      "verified": "2026-08-07",
      "source": "UFC 184 official results"
    },
    {
      "id": "mma-044",
      "slug": "ufc-vratilo-sport-2020",
      "category": "history",
      "promotion": "ufc",
      "en": {
        "short": "In May 2020 the UFC was the first major US sports organization back during the pandemic — then built 'Fight Island'",
        "full": "UFC 249 on 9 May 2020 made the UFC the first major American sports organization to return during the COVID shutdown, in an empty arena in Jacksonville. Weeks later it stood up 'Fight Island' in Abu Dhabi so international fighters could keep competing."
      },
      "cs": {
        "short": "V květnu 2020 se UFC vrátilo jako první velká americká sportovní liga — a pak postavilo 'Fight Island'",
        "full": "Turnajem UFC 249 z 9. května 2020 se UFC stalo první velkou americkou sportovní organizací, která se vrátila během covidové uzávěry — v prázdné aréně v Jacksonville. O pár týdnů později postavilo v Abú Zabí 'Fight Island', aby mohli zápasit i bojovníci ze zahraničí."
      },
      "verified": "2026-08-07",
      "source": "UFC 249; UFC Fight Island, 2020"
    },
    {
      "id": "mma-045",
      "slug": "zhang-weili-42-sekund",
      "category": "fighters",
      "promotion": "ufc",
      "en": {
        "short": "Zhang Weili became the first Chinese UFC champion — winning the belt in 42 seconds at home",
        "full": "In August 2019 in Shenzhen, Zhang Weili stopped Jéssica Andrade in 42 seconds to take the strawweight title — the first UFC champion from China, crowned in front of a home crowd in one of the fastest title wins ever."
      },
      "cs": {
        "short": "Zhang Weili se stala první čínskou šampionkou UFC — titul doma získala za 42 sekund",
        "full": "V srpnu 2019 v Šen-čenu zastavila Zhang Weili Jéssicu Andrade za 42 sekund a vzala jí titul slámové váhy — první šampionka UFC z Číny, korunovaná před domácím publikem v jednom z nejrychlejších titulových vítězství historie."
      },
      "verified": "2026-08-07",
      "source": "UFC Fight Night Shenzhen official results"
    },
    {
      "id": "mma-046",
      "slug": "oktagon-dobyl-nemecko",
      "category": "business",
      "promotion": "oktagon",
      "en": {
        "short": "A Czech-Slovak league exporting fights westward: Oktagon has run events in Germany since 2019",
        "full": "Oktagon expanded into Germany in 2019 and grew into one of the country's leading MMA promotions, filling arenas in Frankfurt, Munich and beyond — a Czech-Slovak organization exporting a sports product to Western Europe, capped by the record-breaking stadium show at Oktagon 55."
      },
      "cs": {
        "short": "Česko-slovenská liga vyváží zápasy na západ: Oktagon pořádá turnaje v Německu od roku 2019",
        "full": "Oktagon expandoval do Německa v roce 2019 a vyrostl v jednu z tamních vedoucích MMA organizací — plní arény ve Frankfurtu, Mnichově a dalších městech. Česko-slovenská firma vyváží sportovní produkt do západní Evropy; vrcholem byla rekordní stadionová show Oktagon 55."
      },
      "verified": "2026-08-07",
      "source": "Oktagon Germany expansion since 2019"
    },
    {
      "id": "mma-047",
      "slug": "holloway-ko-v-posledni-sekunde",
      "category": "events",
      "promotion": "ufc",
      "en": {
        "short": "At UFC 300, Holloway pointed at the canvas with 10 seconds left — and knocked Gaethje out with one second on the clock",
        "full": "Winning the BMF title fight on every scorecard at UFC 300 in April 2024, Max Holloway pointed at the canvas with ten seconds remaining, inviting Justin Gaethje to trade in the center — and knocked him out cold with one second left in the final round."
      },
      "cs": {
        "short": "Na UFC 300 ukázal Holloway 10 sekund před koncem na zem — a knockoutoval Gaethjeho sekundu před sirénou",
        "full": "Ačkoli na UFC 300 v dubnu 2024 vedl titulový zápas o pás BMF na všech kartách, ukázal Max Holloway deset sekund před koncem na zem a vyzval Justina Gaethjeho k přestřelce uprostřed klece — a sekundu před závěrečnou sirénou ho poslal do tvrdého KO."
      },
      "verified": "2026-08-07",
      "source": "UFC 300 official results"
    },
    {
      "id": "mma-048",
      "slug": "couture-titul-ve-43",
      "category": "fighters",
      "promotion": "ufc",
      "en": {
        "short": "Randy Couture came out of retirement at 43 to win the UFC heavyweight title",
        "full": "In March 2007, 43-year-old Randy Couture came out of a year-long retirement to dominate heavyweight champion Tim Sylvia at UFC 68 — winning a UFC title at an age when most fighters are long done, and competing until he was 47."
      },
      "cs": {
        "short": "Randy Couture se ve 43 letech vrátil z důchodu a získal titul těžké váhy UFC",
        "full": "V březnu 2007 se třiačtyřicetiletý Randy Couture vrátil po roce v důchodu a na UFC 68 jasně přehrál šampiona těžké váhy Tima Sylviu — titul UFC vybojoval ve věku, kdy většina zápasníků dávno končí, a zápasil až do 47 let."
      },
      "verified": "2026-08-07",
      "source": "UFC 68 official results"
    },
    {
      "id": "mma-049",
      "slug": "ufc-306-sphere",
      "category": "events",
      "promotion": "ufc",
      "en": {
        "short": "UFC 306 was the first combat-sports event inside the Las Vegas Sphere — the most expensive show the UFC ever produced",
        "full": "In September 2024, UFC 306 became the first combat-sports event held inside the Las Vegas Sphere, its giant interior screen turned into chapters of a film celebrating Mexican fighting history. Dana White called it the most expensive event the UFC had ever produced."
      },
      "cs": {
        "short": "UFC 306 bylo první bojovou akcí uvnitř Sphere v Las Vegas — nejdražší show, jakou kdy UFC vyrobilo",
        "full": "V září 2024 se UFC 306 stalo první bojovou akcí uvnitř lasvegaské Sphere; obří vnitřní obrazovka se proměnila v kapitoly filmu oslavujícího mexickou zápasnickou historii. Dana White akci označil za nejdražší, jakou kdy UFC vyprodukovalo."
      },
      "verified": "2026-08-07",
      "source": "UFC 306 at Sphere coverage"
    },
    {
      "id": "mma-050",
      "slug": "topuria-dve-divize-bez-porazky",
      "category": "records",
      "promotion": "ufc",
      "en": {
        "short": "Ilia Topuria knocked out champions in two divisions without a single career loss",
        "full": "Ilia Topuria knocked out Alexander Volkanovski at UFC 298 in February 2024 for the featherweight title, then knocked out Charles Oliveira at UFC 317 in June 2025 to take the lightweight belt — titles in two divisions with an unbeaten record (17-0 at the time)."
      },
      "cs": {
        "short": "Ilia Topuria knockoutem sebral tituly ve dvou divizích — bez jediné porážky v kariéře",
        "full": "Ilia Topuria knockoutoval Alexandera Volkanovského na UFC 298 v únoru 2024 a vzal mu titul pérové váhy; v červnu 2025 na UFC 317 knockoutoval Charlese Oliveiru a získal i opasek lehké váhy — tituly ve dvou divizích s neporaženou bilancí (tehdy 17-0)."
      },
      "verified": "2026-08-07",
      "source": "UFC 298, UFC 317 official results"
    }
  ]
}
```

## `aifirst: data/ai-facts.json` — 50 entries

```json
{
  "schemaVersion": "boardless-dataset/1",
  "dataset": "ai-facts",
  "anchor": "2026-07-01",
  "categories": {
    "history": { "en": "History", "cs": "Historie" },
    "models": { "en": "Models", "cs": "Modely" },
    "hardware": { "en": "Hardware & compute", "cs": "Hardware a výpočty" },
    "science": { "en": "AI in science", "cs": "AI ve vědě" },
    "business": { "en": "Business", "cs": "Byznys" },
    "culture": { "en": "Culture & society", "cs": "Kultura a společnost" }
  },
  "entries": [
    {
      "id": "ai-001",
      "slug": "chatgpt-nejrychlejsi-aplikace",
      "category": "business",
      "en": {
        "short": "ChatGPT reached 100 million users in two months — the fastest-growing consumer app in history at the time",
        "full": "ChatGPT launched on 30 November 2022 as a low-key 'research preview'. It hit a million users in five days and an estimated 100 million monthly users within two months — the fastest consumer-application growth ever recorded at the time, per a UBS study."
      },
      "cs": {
        "short": "ChatGPT získal 100 milionů uživatelů za dva měsíce — tehdy nejrychleji rostoucí aplikace historie",
        "full": "ChatGPT vyšel 30. listopadu 2022 jako nenápadný 'výzkumný náhled'. Milion uživatelů měl za pět dní a odhadem 100 milionů měsíčních uživatelů za dva měsíce — podle studie UBS tehdy nejrychlejší růst spotřebitelské aplikace v historii."
      },
      "verified": "2026-08-07",
      "source": "UBS/Similarweb analysis, Feb 2023"
    },
    {
      "id": "ai-002",
      "slug": "slovo-robot-je-ceske",
      "category": "culture",
      "en": {
        "short": "The word 'robot' is Czech — Karel Čapek introduced it to the world in 1920",
        "full": "The world's word for an artificial worker is Czech: Karel Čapek introduced 'robot' in his 1920 play R.U.R., deriving it from 'robota' (drudgery) — and credited his brother, the painter Josef Čapek, with suggesting it. Every robotics lab on Earth speaks a bit of Czech."
      },
      "cs": {
        "short": "Slovo 'robot' je české — světu ho v roce 1920 dal Karel Čapek",
        "full": "Slovo, kterým celý svět označuje umělého pracovníka, je české: Karel Čapek ho uvedl v dramatu R.U.R. z roku 1920, odvozené od 'roboty' — a autorství nápadu připsal bratru Josefovi. Každá robotická laboratoř na světě tak mluví trochu česky."
      },
      "verified": "2026-08-07",
      "source": "Karel Čapek, R.U.R. (1920)"
    },
    {
      "id": "ai-003",
      "slug": "alphago-tah-37",
      "category": "history",
      "en": {
        "short": "AlphaGo's 'Move 37' had a 1-in-10,000 chance of being played by a human — and it won the game",
        "full": "In March 2016, DeepMind's AlphaGo beat Go legend Lee Sedol 4-1 in a match watched by an estimated 200 million people. Its famous 'Move 37' was a play AlphaGo estimated a human would make once in 10,000 times — commentators first called it a mistake, then a masterpiece."
      },
      "cs": {
        "short": "'Tah 37' od AlphaGo by člověk zahrál s pravděpodobností 1 : 10 000 — a vyhrál partii",
        "full": "V březnu 2016 porazil systém AlphaGo od DeepMind legendu hry go Lee Sedola 4:1 v zápase, který sledovalo odhadem 200 milionů lidí. Slavný 'tah 37' by podle vlastního odhadu AlphaGo zahrál člověk jednou z 10 000 případů — komentátoři ho nejdřív označili za chybu, pak za mistrovské dílo."
      },
      "verified": "2026-08-07",
      "source": "DeepMind AlphaGo match records, 2016"
    },
    {
      "id": "ai-004",
      "slug": "nvidia-ctyri-biliony",
      "category": "business",
      "en": {
        "short": "A gaming-card maker became the first $4 trillion company in history — because of AI",
        "full": "Nvidia, founded in 1993 to make graphics cards for gamers, became the most valuable company in the world on demand for AI chips — and in July 2025 the first company in history to close above a $4 trillion market value."
      },
      "cs": {
        "short": "Výrobce herních grafik se stal první firmou historie s hodnotou 4 bilionů dolarů — díky AI",
        "full": "Nvidia, založená v roce 1993 kvůli grafickým kartám pro hráče, se na poptávce po AI čipech stala nejhodnotnější firmou světa — a v červenci 2025 první společností v historii, která uzavřela obchodování nad hranicí 4 bilionů dolarů."
      },
      "verified": "2026-08-07",
      "source": "Market data, July 2025"
    },
    {
      "id": "ai-005",
      "slug": "transformer-osm-autoru",
      "category": "history",
      "en": {
        "short": "The 2017 paper behind every modern chatbot had 8 authors — all of whom left Google",
        "full": "'Attention Is All You Need' (2017) introduced the Transformer, the architecture behind essentially every modern language model, and became one of the most-cited papers of the century. All eight Google authors later left — most to found or join AI startups collectively worth billions."
      },
      "cs": {
        "short": "Studie z roku 2017, na které stojí všechny dnešní chatboty, měla 8 autorů — a všichni z Googlu odešli",
        "full": "Studie 'Attention Is All You Need' (2017) představila architekturu Transformer, na níž stojí prakticky každý moderní jazykový model, a patří k nejcitovanějším pracím století. Všech osm autorů z Googlu později odešlo — většina zakládat nebo posílit AI startupy v souhrnné hodnotě miliard dolarů."
      },
      "verified": "2026-08-07",
      "source": "Vaswani et al., 2017; author career coverage"
    },
    {
      "id": "ai-006",
      "slug": "deepseek-rekordni-propad",
      "category": "business",
      "en": {
        "short": "A Chinese model trained for a claimed ~$6M wiped ~$589 billion off Nvidia in one day — the largest single-day loss ever",
        "full": "In January 2025, Chinese lab DeepSeek released R1, claiming headline training costs around $5.6 million. On 27 January, Nvidia's market value fell by roughly $589 billion — the largest one-day loss of value by any company in stock-market history."
      },
      "cs": {
        "short": "Čínský model s údajnými náklady ~6 mil. dolarů smazal Nvidii ~589 miliard za den — největší jednodenní propad historie",
        "full": "V lednu 2025 vydala čínská laboratoř DeepSeek model R1 s udávanými náklady na trénink kolem 5,6 milionu dolarů. 27. ledna spadla tržní hodnota Nvidie zhruba o 589 miliard dolarů — největší jednodenní ztráta hodnoty firmy v historii burz."
      },
      "verified": "2026-08-07",
      "source": "DeepSeek R1 technical report; market data, 27 Jan 2025"
    },
    {
      "id": "ai-007",
      "slug": "dartmouth-1956",
      "category": "history",
      "en": {
        "short": "The term 'artificial intelligence' was coined in 1956 — for a workshop expected to crack it in one summer",
        "full": "John McCarthy coined 'artificial intelligence' for the 1956 Dartmouth summer workshop, whose proposal suggested a significant advance could be made if 'a carefully selected group of scientists work on it together for a summer'. The field is still working on it, seventy years later."
      },
      "cs": {
        "short": "Pojem 'umělá inteligence' vznikl v roce 1956 — pro workshop, který ji měl vyřešit za jedno léto",
        "full": "John McCarthy vymyslel pojem 'artificial intelligence' pro letní workshop v Dartmouthu v roce 1956. Návrh projektu tvrdil, že výrazný pokrok nastane, když na problému 'pečlivě vybraná skupina vědců společně stráví jedno léto'. Obor na tom pracuje dodnes, o sedmdesát let později."
      },
      "verified": "2026-08-07",
      "source": "Dartmouth workshop proposal, 1955"
    },
    {
      "id": "ai-008",
      "slug": "alphafold-vyresil-proteiny",
      "category": "science",
      "en": {
        "short": "AlphaFold predicted the structures of ~200 million proteins — a 50-year scientific problem, solved and given away",
        "full": "Protein-structure prediction was a grand challenge of biology for half a century. DeepMind's AlphaFold cracked it, and its public database grew to roughly 200 million predicted structures — nearly every protein known to science — free for any researcher, with millions of scientists using it."
      },
      "cs": {
        "short": "AlphaFold předpověděl struktury ~200 milionů proteinů — 50 let starý vědecký problém, vyřešený a rozdaný zdarma",
        "full": "Predikce struktury proteinů byla půl století velkou výzvou biologie. AlphaFold od DeepMind ji rozlouskl a jeho veřejná databáze narostla na zhruba 200 milionů predikovaných struktur — téměř všechny proteiny, které věda zná — zdarma pro každého; využívají ji miliony vědců."
      },
      "verified": "2026-08-07",
      "source": "AlphaFold Protein Structure Database"
    },
    {
      "id": "ai-009",
      "slug": "alexnet-herni-grafiky",
      "category": "history",
      "en": {
        "short": "The deep-learning revolution started on two consumer gaming GPUs in 2012",
        "full": "AlexNet, the network that ignited the deep-learning era by crushing the 2012 ImageNet competition, was trained on two consumer NVIDIA GTX 580 gaming cards. A decade later, frontier models train on clusters of tens of thousands of data-center GPUs."
      },
      "cs": {
        "short": "Revoluce hlubokého učení začala v roce 2012 na dvou běžných herních grafikách",
        "full": "AlexNet, síť, která rozpoutala éru hlubokého učení drtivým vítězstvím v soutěži ImageNet 2012, se trénovala na dvou běžných herních kartách NVIDIA GTX 580. O dekádu později se špičkové modely trénují na clusterech desítek tisíc datacentrových GPU."
      },
      "verified": "2026-08-07",
      "source": "Krizhevsky, Sutskever, Hinton (2012)"
    },
    {
      "id": "ai-010",
      "slug": "ai-act-prvni-zakon",
      "category": "culture",
      "en": {
        "short": "The EU passed the world's first comprehensive AI law — with fines up to 7% of global revenue",
        "full": "The EU AI Act, in force since 1 August 2024, is the world's first comprehensive AI law. It sorts systems into risk tiers, bans some uses outright, and can fine violators up to 7% of global annual revenue — rules that apply in Czechia as across the Union."
      },
      "cs": {
        "short": "EU přijala první ucelený zákon o AI na světě — s pokutami až 7 % globálního obratu",
        "full": "Akt o umělé inteligenci, účinný od 1. srpna 2024, je první ucelený zákon o AI na světě. Systémy třídí podle rizika, některá použití rovnou zakazuje a za porušení může uložit pokutu až 7 % celosvětového ročního obratu — pravidla platí v Česku stejně jako v celé Unii."
      },
      "verified": "2026-08-07",
      "source": "EU AI Act (Regulation 2024/1689)"
    },
    {
      "id": "ai-011",
      "slug": "gpt4-advokatni-zkousky",
      "category": "models",
      "en": {
        "short": "GPT-4 passed a simulated bar exam in the top 10% of test takers — its predecessor was in the bottom 10%",
        "full": "OpenAI reported in 2023 that GPT-4 passed a simulated US bar exam with a score around the top 10% of test takers. GPT-3.5, released months earlier, had scored around the bottom 10% — a single model generation crossed the professional threshold."
      },
      "cs": {
        "short": "GPT-4 složil simulované advokátní zkoušky mezi 10 % nejlepších — jeho předchůdce byl mezi 10 % nejhorších",
        "full": "OpenAI v roce 2023 uvedla, že GPT-4 složil simulovanou americkou advokátní zkoušku s výsledkem kolem horních 10 % uchazečů. GPT-3.5, vydaný jen o měsíce dříve, skončil kolem dolních 10 % — jediná modelová generace překročila profesní laťku."
      },
      "verified": "2026-08-07",
      "source": "OpenAI GPT-4 technical report, 2023"
    },
    {
      "id": "ai-012",
      "slug": "nobelovky-2024",
      "category": "science",
      "en": {
        "short": "AI swept two Nobel Prizes in one year: Physics for neural networks, Chemistry for AlphaFold",
        "full": "In 2024, Geoffrey Hinton and John Hopfield won the Nobel Prize in Physics for foundational neural-network work, while Demis Hassabis and John Jumper shared the Chemistry prize for AlphaFold — the first year AI research took two Nobels at once."
      },
      "cs": {
        "short": "AI v jednom roce posbírala dvě Nobelovy ceny: fyziku za neuronové sítě, chemii za AlphaFold",
        "full": "V roce 2024 získali Geoffrey Hinton a John Hopfield Nobelovu cenu za fyziku za základy neuronových sítí a Demis Hassabis s Johnem Jumperem se podělili o cenu za chemii za AlphaFold — poprvé si výzkum AI odnesl dvě Nobelovy ceny naráz."
      },
      "verified": "2026-08-07",
      "source": "Nobel Prize announcements, October 2024"
    },
    {
      "id": "ai-013",
      "slug": "kontextove-okno-lotr",
      "category": "models",
      "en": {
        "short": "Context windows grew ~4,000× in a few years — some models can read the whole Lord of the Rings in one prompt, three times over",
        "full": "Early GPT-3 handled about 2,048 tokens of context. By 2024, Gemini 1.5 accepted up to 2 million tokens — roughly 1.5 million words, enough to fit the entire Lord of the Rings trilogy about three times into a single prompt."
      },
      "cs": {
        "short": "Kontextová okna narostla ~4000×: některé modely přečtou celého Pána prstenů v jednom promptu, a to třikrát",
        "full": "Rané GPT-3 zvládlo kontext zhruba 2 048 tokenů. V roce 2024 přijímalo Gemini 1.5 až 2 miliony tokenů — asi 1,5 milionu slov, takže by se do jediného promptu vešla celá trilogie Pána prstenů přibližně třikrát."
      },
      "verified": "2026-08-07",
      "source": "OpenAI and Google model documentation"
    },
    {
      "id": "ai-014",
      "slug": "turing-1950",
      "category": "history",
      "en": {
        "short": "Alan Turing proposed the test for machine intelligence in 1950 — before 'AI' was even a word",
        "full": "Alan Turing's 1950 paper 'Computing Machinery and Intelligence' opened with 'Can machines think?' and proposed the imitation game — the Turing test — six years before the term 'artificial intelligence' existed. He predicted machines would credibly imitate humans by around 2000."
      },
      "cs": {
        "short": "Alan Turing navrhl test strojové inteligence v roce 1950 — dřív, než slovo 'AI' vůbec existovalo",
        "full": "Turingova studie 'Computing Machinery and Intelligence' z roku 1950 začínala otázkou 'Mohou stroje myslet?' a navrhla imitační hru — Turingův test — šest let předtím, než vznikl pojem 'umělá inteligence'. Turing předpověděl, že stroje budou věrohodně napodobovat člověka kolem roku 2000."
      },
      "verified": "2026-08-07",
      "source": "Turing, Mind (1950)"
    },
    {
      "id": "ai-015",
      "slug": "altman-pet-dni",
      "category": "business",
      "en": {
        "short": "OpenAI fired Sam Altman on a Friday — and rehired him within five days after ~95% of staff threatened to quit",
        "full": "On 17 November 2023, OpenAI's board fired CEO Sam Altman. Over the weekend Microsoft offered to hire him, and more than 700 of roughly 770 OpenAI employees signed a letter threatening to leave. Within five days Altman was back as CEO and the board was rebuilt."
      },
      "cs": {
        "short": "OpenAI v pátek vyhodila Sama Altmana — a do pěti dnů ho vzala zpět, když výpovědí hrozilo ~95 % firmy",
        "full": "17. listopadu 2023 správní rada OpenAI odvolala ředitele Sama Altmana. Přes víkend mu Microsoft nabídl práci a přes 700 z asi 770 zaměstnanců OpenAI podepsalo dopis s pohrůžkou odchodu. Do pěti dnů byl Altman zpět ve funkci a rada se přeskládala."
      },
      "verified": "2026-08-07",
      "source": "OpenAI board crisis coverage, Nov 2023"
    },
    {
      "id": "ai-016",
      "slug": "halicin-antibiotikum",
      "category": "science",
      "en": {
        "short": "The first antibiotic discovered by AI was named after HAL 9000",
        "full": "In 2020, MIT researchers used a neural network to screen millions of molecules and found a powerful new antibiotic effective against drug-resistant bacteria. They named it halicin — after HAL 9000, the AI from 2001: A Space Odyssey."
      },
      "cs": {
        "short": "První antibiotikum objevené umělou inteligencí dostalo jméno po HAL 9000",
        "full": "Výzkumníci z MIT v roce 2020 nechali neuronovou síť prosít miliony molekul a našli silné nové antibiotikum účinné i na rezistentní bakterie. Pojmenovali ho halicin — po HAL 9000, umělé inteligenci z filmu 2001: Vesmírná odysea."
      },
      "verified": "2026-08-07",
      "source": "Stokes et al., Cell (2020)"
    },
    {
      "id": "ai-017",
      "slug": "eliza-1966",
      "category": "history",
      "en": {
        "short": "The first chatbot ran in 1966 — and its creator's secretary asked him to leave the room so she could talk to it",
        "full": "Joseph Weizenbaum's ELIZA (1966) parodied a psychotherapist using simple pattern matching. People confided in it anyway — famously, Weizenbaum's secretary asked him to leave the room during her session. Unsettled by how readily humans bonded with a program, he became one of AI's earliest critics."
      },
      "cs": {
        "short": "První chatbot běžel už v roce 1966 — a sekretářka jeho tvůrce ho poprosila, ať odejde z místnosti, že chce mluvit o samotě",
        "full": "ELIZA Josepha Weizenbauma (1966) parodovala psychoterapeuta pomocí jednoduchého porovnávání vzorů. Lidé se jí přesto svěřovali — Weizenbaumova sekretářka ho proslule požádala, aby odešel z místnosti, že chce mluvit o samotě. Weizenbauma zaskočilo, jak snadno si lidé k programu vytvořili vztah, a stal se jedním z prvních kritiků AI."
      },
      "verified": "2026-08-07",
      "source": "Weizenbaum, Computer Power and Human Reason (1976)"
    },
    {
      "id": "ai-018",
      "slug": "cestina-stoji-vic-tokenu",
      "category": "models",
      "en": {
        "short": "The same sentence costs significantly more tokens in Czech than in English — tokenizers were trained mostly on English",
        "full": "Language models bill and think in tokens, and their tokenizers were trained on predominantly English text. The same sentence therefore splits into significantly more tokens in Czech — often nearly twice as many — making Czech prompts literally more expensive and context windows effectively smaller."
      },
      "cs": {
        "short": "Stejná věta stojí v češtině výrazně víc tokenů než v angličtině — tokenizéry se učily hlavně na angličtině",
        "full": "Jazykové modely účtují i 'přemýšlejí' v tokenech a jejich tokenizéry vznikly převážně na anglickém textu. Stejná věta se proto v češtině rozpadne na výrazně víc tokenů — často téměř dvakrát tolik — takže české prompty jsou doslova dražší a kontextové okno je fakticky menší."
      },
      "verified": "2026-08-07",
      "source": "Tokenizer behavior, documented across BPE vocabularies"
    },
    {
      "id": "ai-019",
      "slug": "midjourney-vyhral-soutez",
      "category": "culture",
      "en": {
        "short": "An AI image won a US state-fair art prize in 2022 — and was later refused copyright registration",
        "full": "Jason Allen's Midjourney-generated 'Théâtre D'opéra Spatial' won first prize in digital arts at the 2022 Colorado State Fair, before most judges knew such tools existed. The US Copyright Office later refused to register it — AI-generated imagery lacked human authorship."
      },
      "cs": {
        "short": "Obraz z AI vyhrál v roce 2022 uměleckou soutěž v Coloradu — a později mu úřad odmítl přiznat autorská práva",
        "full": "'Théâtre D'opéra Spatial', který Jason Allen vygeneroval v Midjourney, vyhrál v roce 2022 první cenu za digitální umění na Colorado State Fair — dřív, než většina porotců o takových nástrojích věděla. Americký úřad pro autorská práva pak registraci odmítl: obrazu generovanému AI chybí lidské autorství."
      },
      "verified": "2026-08-07",
      "source": "Colorado State Fair 2022; US Copyright Office decision"
    },
    {
      "id": "ai-020",
      "slug": "vypocty-se-zdvojnasobuji",
      "category": "hardware",
      "en": {
        "short": "Training compute for frontier AI has doubled roughly every six months — four times faster than Moore's law",
        "full": "Epoch AI's analyses show the compute used to train frontier models doubling roughly every six months since around 2010 — a pace about four times faster than Moore's law, sustained for over a decade and paid for in ever-larger GPU clusters."
      },
      "cs": {
        "short": "Výpočty na trénink špičkové AI se zdvojnásobují zhruba každých šest měsíců — čtyřikrát rychleji než Moorův zákon",
        "full": "Analýzy Epoch AI ukazují, že výpočetní výkon na trénink špičkových modelů se od roku 2010 zdvojnásobuje zhruba každých šest měsíců — asi čtyřikrát rychleji, než velel Moorův zákon. Tempo se drží přes dekádu a platí se stále většími clustery GPU."
      },
      "verified": "2026-08-07",
      "source": "Epoch AI compute trends"
    },
    {
      "id": "ai-021",
      "slug": "deep-blue-1997",
      "category": "history",
      "en": {
        "short": "Deep Blue beat Kasparov in 1997 while checking up to 200 million positions per second",
        "full": "IBM's Deep Blue defeated world chess champion Garry Kasparov in their 1997 rematch — the first time a computer beat a reigning world champion in a classical match — evaluating up to around 200 million chess positions per second. Kasparov later helped popularize 'centaur' chess, pairing humans with machines."
      },
      "cs": {
        "short": "Deep Blue porazil Kasparova v roce 1997 — při prověřování až 200 milionů pozic za sekundu",
        "full": "Deep Blue od IBM porazil v odvetě roku 1997 mistra světa v šachu Garryho Kasparova — poprvé stroj přehrál úřadujícího šampiona v klasickém zápase — a vyhodnocoval přitom až kolem 200 milionů pozic za sekundu. Kasparov později spolupopularizoval 'kentauří' šach, spojení člověka se strojem."
      },
      "verified": "2026-08-07",
      "source": "IBM Deep Blue match records, 1997"
    },
    {
      "id": "ai-022",
      "slug": "recaptcha-prepsala-knihy",
      "category": "culture",
      "en": {
        "short": "Every CAPTCHA you solved helped digitize books and newspapers — for free",
        "full": "reCAPTCHA turned proving-you're-human into unpaid transcription: the distorted words people typed helped digitize the New York Times archive and Google Books, and later image challenges labeled photos useful for training vision systems. Humanity proofread the archives one login at a time."
      },
      "cs": {
        "short": "Každá vyplněná CAPTCHA pomáhala zadarmo digitalizovat knihy a noviny",
        "full": "Systém reCAPTCHA proměnil dokazování, že nejste robot, v neplacený přepis: rozmazaná slova, která lidé opisovali, pomohla digitalizovat archiv New York Times a Google Books, a pozdější obrázkové úlohy popisovaly fotky užitečné pro trénink strojového vidění. Lidstvo korigovalo archivy jedno přihlášení za druhým."
      },
      "verified": "2026-08-07",
      "source": "reCAPTCHA project, von Ahn et al."
    },
    {
      "id": "ai-023",
      "slug": "llama-uniklo-na-4chan",
      "category": "models",
      "en": {
        "short": "Meta's LLaMA leaked on 4chan within a week of release — accidentally kick-starting the open-weights era",
        "full": "In March 2023, Meta shared its LLaMA model weights with approved researchers; within about a week they were leaked on 4chan for anyone to download. The leak seeded an explosion of community-run models and helped push the industry toward openly released weights."
      },
      "cs": {
        "short": "Váhy modelu LLaMA od Mety unikly do týdne na 4chan — a nechtěně odstartovaly éru otevřených modelů",
        "full": "V březnu 2023 poskytla Meta váhy modelu LLaMA schváleným výzkumníkům; zhruba do týdne se objevily na fóru 4chan ke stažení komukoli. Únik zasel explozi komunitních modelů a přispěl k posunu oboru směrem k otevřeně vydávaným vahám."
      },
      "verified": "2026-08-07",
      "source": "LLaMA leak coverage, March 2023"
    },
    {
      "id": "ai-024",
      "slug": "alphago-zero-100-0",
      "category": "models",
      "en": {
        "short": "AlphaGo Zero learned Go from scratch with no human games — and beat the champion-beating AlphaGo 100-0",
        "full": "AlphaGo Zero (2017) started from random play and learned Go purely from self-play, with no human game data. After about three days of training it defeated the version of AlphaGo that had beaten Lee Sedol by 100 games to 0."
      },
      "cs": {
        "short": "AlphaGo Zero se naučilo go od nuly bez lidských partií — a verzi, která porazila šampiona, zdolalo 100:0",
        "full": "AlphaGo Zero (2017) začalo od náhodných tahů a go se naučilo čistě hraním samo se sebou, bez dat z lidských partií. Po zhruba třech dnech tréninku porazilo verzi AlphaGo, která zdolala Lee Sedola, poměrem 100:0."
      },
      "verified": "2026-08-07",
      "source": "Silver et al., Nature (2017)"
    },
    {
      "id": "ai-025",
      "slug": "datacentra-jako-japonsko",
      "category": "hardware",
      "en": {
        "short": "Data centres used ~1.5% of world electricity in 2024 — and the IEA expects that to roughly double by 2030, driven by AI",
        "full": "The International Energy Agency put data-centre electricity use at about 415 TWh in 2024, roughly 1.5% of global consumption, and projects it approaching 945 TWh by 2030 — comparable to Japan's entire current electricity use — with AI the main driver of the growth."
      },
      "cs": {
        "short": "Datacentra v roce 2024 spotřebovala ~1,5 % světové elektřiny — a podle IEA se to do roku 2030 kvůli AI zhruba zdvojnásobí",
        "full": "Mezinárodní energetická agentura odhadla spotřebu datacenter v roce 2024 na asi 415 TWh, zhruba 1,5 % světové elektřiny, a do roku 2030 čeká růst k 945 TWh — což se blíží celé dnešní spotřebě Japonska. Hlavním tahounem růstu je AI."
      },
      "verified": "2026-08-07",
      "source": "IEA, Energy and AI report (2025)"
    },
    {
      "id": "ai-026",
      "slug": "sophia-obcanstvi",
      "category": "culture",
      "en": {
        "short": "Saudi Arabia granted citizenship to a robot in 2017 — the first 'robot citizen' in history",
        "full": "In October 2017, Saudi Arabia granted citizenship to Sophia, a humanoid robot built by Hanson Robotics — a marketing spectacle that made her history's first 'robot citizen' and set off debates about why a machine received rights before many humans."
      },
      "cs": {
        "short": "Saúdská Arábie udělila v roce 2017 občanství robotovi — prvnímu 'robotímu občanovi' historie",
        "full": "V říjnu 2017 udělila Saúdská Arábie občanství Sophii, humanoidnímu robotovi od Hanson Robotics — marketingová podívaná z ní udělala prvního 'robotího občana' historie a rozpoutala debatu, proč stroj dostal práva dřív než mnozí lidé."
      },
      "verified": "2026-08-07",
      "source": "Future Investment Initiative, Riyadh 2017"
    },
    {
      "id": "ai-027",
      "slug": "zlato-z-matematicke-olympiady",
      "category": "models",
      "en": {
        "short": "In 2025, AI systems hit gold-medal standard at the International Mathematical Olympiad for the first time",
        "full": "In July 2025, systems from Google DeepMind and OpenAI solved five of six problems from that year's International Mathematical Olympiad under competition-style conditions — the first time AI reached the gold-medal standard at the world's hardest high-school math contest."
      },
      "cs": {
        "short": "V roce 2025 dosáhla AI poprvé na zlatou úroveň Mezinárodní matematické olympiády",
        "full": "V červenci 2025 vyřešily systémy Google DeepMind a OpenAI pět ze šesti úloh ročníku Mezinárodní matematické olympiády v soutěžních podmínkách — poprvé, kdy AI dosáhla zlaté medailové úrovně nejtěžší středoškolské matematické soutěže světa."
      },
      "verified": "2026-08-07",
      "source": "DeepMind and OpenAI IMO 2025 results"
    },
    {
      "id": "ai-028",
      "slug": "perceptron-1958",
      "category": "history",
      "en": {
        "short": "In 1958 the New York Times reported a machine that would 'walk, talk, see and reproduce' — it was one layer of neurons",
        "full": "When Frank Rosenblatt demonstrated the Perceptron in 1958, the New York Times relayed Navy claims of a machine expected to 'walk, talk, see, write, reproduce itself and be conscious of its existence'. A 1969 book proving the single layer's limits helped freeze funding for a decade — the first AI winter."
      },
      "cs": {
        "short": "V roce 1958 psal New York Times o stroji, který bude 'chodit, mluvit, vidět a rozmnožovat se' — byla to jedna vrstva neuronů",
        "full": "Když Frank Rosenblatt v roce 1958 předvedl Perceptron, New York Times citoval očekávání námořnictva, že stroj bude 'chodit, mluvit, vidět, psát, rozmnožovat se a být si vědom své existence'. Kniha z roku 1969, která dokázala meze jediné vrstvy, pak na dekádu zmrazila financování — první zima AI."
      },
      "verified": "2026-08-07",
      "source": "NYT (1958); Minsky & Papert, Perceptrons (1969)"
    },
    {
      "id": "ai-029",
      "slug": "waymo-bez-ridice",
      "category": "science",
      "en": {
        "short": "By 2025, Waymo's driverless cars were giving over 250,000 paid rides every week",
        "full": "Waymo's robotaxis went from research project to routine: by 2025 the company reported more than 250,000 paid fully-driverless rides per week across US cities, with tens of millions of autonomous miles driven and safety data showing far fewer injury crashes than human drivers in the same conditions."
      },
      "cs": {
        "short": "Auta Waymo bez řidiče vozila v roce 2025 přes 250 000 platících jízd týdně",
        "full": "Robotaxíky Waymo přešly z výzkumu do rutiny: v roce 2025 firma hlásila přes 250 000 placených plně autonomních jízd týdně v amerických městech, desítky milionů najetých autonomních mil a bezpečnostní data s výrazně menším počtem nehod se zraněním, než mají lidští řidiči ve stejných podmínkách."
      },
      "verified": "2026-08-07",
      "source": "Waymo ridership and safety reports, 2025"
    },
    {
      "id": "ai-030",
      "slug": "gpt2-prilis-nebezpecny",
      "category": "history",
      "en": {
        "short": "In 2019 OpenAI called GPT-2 too dangerous to release in full — it had 1.5 billion parameters; today's models are thousands of times bigger",
        "full": "In February 2019, OpenAI withheld the full 1.5-billion-parameter GPT-2, saying it was too risky to release because of potential misuse — then published it in stages within the year. Models thousands of times larger are now standard products."
      },
      "cs": {
        "short": "OpenAI v roce 2019 označila GPT-2 za příliš nebezpečný k vydání — měl 1,5 miliardy parametrů; dnešní modely jsou tisíckrát větší",
        "full": "V únoru 2019 OpenAI zadržela plnou verzi GPT-2 s 1,5 miliardy parametrů s tím, že vydání je kvůli možnému zneužití příliš riskantní — a do konce roku ji po částech zveřejnila. Modely tisíckrát větší jsou dnes běžný produkt."
      },
      "verified": "2026-08-07",
      "source": "OpenAI GPT-2 staged release, 2019"
    },
    {
      "id": "ai-031",
      "slug": "h100-jako-superpocitac",
      "category": "hardware",
      "en": {
        "short": "One modern AI GPU matches the double-precision power of the fastest supercomputer on Earth from 2002",
        "full": "A single NVIDIA H100 delivers on the order of 30+ teraflops of double-precision compute — comparable to Japan's Earth Simulator, the fastest supercomputer in the world from 2002 to 2004, which filled a purpose-built hall. AI clusters chain tens of thousands of such chips."
      },
      "cs": {
        "short": "Jedna moderní AI grafika má výkon nejrychlejšího superpočítače světa z roku 2002",
        "full": "Jediná NVIDIA H100 zvládne řádově přes 30 teraflopů ve dvojité přesnosti — srovnatelně s japonským Earth Simulatorem, nejrychlejším superpočítačem světa let 2002 až 2004, který plnil celou halu. AI clustery řadí desítky tisíc takových čipů vedle sebe."
      },
      "verified": "2026-08-07",
      "source": "NVIDIA H100 specs; TOP500 history"
    },
    {
      "id": "ai-032",
      "slug": "hinton-odesel-varovat",
      "category": "culture",
      "en": {
        "short": "The 'godfather of AI' quit Google in 2023 so he could warn about his own field freely",
        "full": "Geoffrey Hinton, whose work made deep learning possible, resigned from Google in May 2023 explicitly so he could speak freely about AI risks — saying part of him regrets his life's work. A year later that same work won him the Nobel Prize in Physics."
      },
      "cs": {
        "short": "'Kmotr AI' v roce 2023 odešel z Googlu, aby mohl před vlastním oborem svobodně varovat",
        "full": "Geoffrey Hinton, jehož práce umožnila hluboké učení, v květnu 2023 rezignoval v Googlu výslovně proto, aby mohl svobodně mluvit o rizicích AI — s tím, že části svého životního díla lituje. O rok později mu totéž dílo vyneslo Nobelovu cenu za fyziku."
      },
      "verified": "2026-08-07",
      "source": "Hinton resignation interviews, May 2023; Nobel 2024"
    },
    {
      "id": "ai-033",
      "slug": "gpt3-175-miliard",
      "category": "models",
      "en": {
        "short": "GPT-3 jumped to 175 billion parameters in 2020 — over 100× its predecessor — and learned tasks nobody trained it for",
        "full": "GPT-3 (2020) scaled to 175 billion parameters, more than a hundred times GPT-2, and showed 'few-shot' abilities nobody explicitly trained: translation, arithmetic, code. Its paper made scale itself look like an algorithm — the bet the whole industry then took."
      },
      "cs": {
        "short": "GPT-3 v roce 2020 skočil na 175 miliard parametrů — přes 100× víc než předchůdce — a uměl úlohy, na které ho nikdo netrénoval",
        "full": "GPT-3 (2020) narostl na 175 miliard parametrů, více než stonásobek GPT-2, a předvedl schopnosti 'few-shot', které nikdo cíleně netrénoval: překlad, počítání, kód. Jeho studie ukázala škálování jako samostatný algoritmus — sázku, kterou pak podnikl celý obor."
      },
      "verified": "2026-08-07",
      "source": "Brown et al., 2020"
    },
    {
      "id": "ai-034",
      "slug": "pokerovy-stroj-za-150-dolaru",
      "category": "models",
      "en": {
        "short": "The AI that beat poker pros at six-player no-limit hold'em trained on about $150 of cloud compute",
        "full": "Pluribus (2019) beat elite professionals at six-player no-limit Texas hold'em — a game of hidden information and bluffing long considered out of reach. Its creators reported the training cost as the equivalent of roughly $144 of cloud computing."
      },
      "cs": {
        "short": "AI, která porazila profesionály v šestihráčovém no-limit hold'emu, se natrénovala za zhruba 150 dolarů v cloudu",
        "full": "Pluribus (2019) porazil elitní profesionály v šestihráčovém no-limit Texas hold'emu — hře skrytých informací a blafování, dlouho považované za nedostižnou. Autoři vyčíslili trénink na ekvivalent zhruba 144 dolarů cloudových výpočtů."
      },
      "verified": "2026-08-07",
      "source": "Brown & Sandholm, Science (2019)"
    },
    {
      "id": "ai-035",
      "slug": "imagenet-49-tisic-lidi",
      "category": "history",
      "en": {
        "short": "ImageNet was labeled by ~49,000 crowd workers from 167 countries — and made the deep-learning era possible",
        "full": "Fei-Fei Li's ImageNet assembled over 14 million labeled images, annotated by roughly 49,000 Amazon Mechanical Turk workers from 167 countries. Colleagues advised against the project; its 2012 competition then produced AlexNet and set off the deep-learning era."
      },
      "cs": {
        "short": "ImageNet popsalo ~49 000 lidí ze 167 zemí — a umožnili tím éru hlubokého učení",
        "full": "ImageNet Fei-Fei Li shromáždil přes 14 milionů popsaných obrázků, které anotovalo zhruba 49 000 pracovníků platformy Mechanical Turk ze 167 zemí. Kolegové projekt rozmlouvali; jeho soutěž v roce 2012 pak zrodila AlexNet a odstartovala éru hlubokého učení."
      },
      "verified": "2026-08-07",
      "source": "ImageNet project history, Fei-Fei Li"
    },
    {
      "id": "ai-036",
      "slug": "halucinovat-slovo-roku",
      "category": "culture",
      "en": {
        "short": "'Hallucinate' was Cambridge Dictionary's 2023 Word of the Year — because of AI; Collins picked 'AI' itself",
        "full": "In 2023, Cambridge Dictionary named 'hallucinate' its Word of the Year for the new AI sense — a model confidently producing false information — while Collins simply chose 'AI'. The industry's failure mode entered the language faster than its fixes."
      },
      "cs": {
        "short": "'Halucinovat' bylo slovem roku 2023 slovníku Cambridge — kvůli AI; Collins vybral rovnou 'AI'",
        "full": "Cambridge Dictionary vyhlásil slovem roku 2023 'hallucinate' v novém významu z AI — model sebejistě produkující nepravdy — a slovník Collins zvolil rovnou 'AI'. Selhání oboru vstoupilo do jazyka rychleji než jeho opravy."
      },
      "verified": "2026-08-07",
      "source": "Cambridge Dictionary and Collins WOTY 2023"
    },
    {
      "id": "ai-037",
      "slug": "ctvrtina-kodu-googlu",
      "category": "business",
      "en": {
        "short": "Google's CEO said in late 2024 that more than a quarter of the company's new code is written by AI",
        "full": "On an October 2024 earnings call, Sundar Pichai said more than 25% of all new code at Google is generated by AI and then reviewed by engineers — a concrete number for how fast AI moved inside the world's biggest software companies."
      },
      "cs": {
        "short": "Šéf Googlu koncem roku 2024 uvedl, že přes čtvrtinu nového kódu firmy píše AI",
        "full": "Sundar Pichai na výsledkovém callu v říjnu 2024 řekl, že více než 25 % veškerého nového kódu v Googlu generuje AI a inženýři ho následně kontrolují — konkrétní číslo o tom, jak rychle AI pronikla do největších softwarových firem světa."
      },
      "verified": "2026-08-07",
      "source": "Alphabet Q3 2024 earnings call"
    },
    {
      "id": "ai-038",
      "slug": "gnome-800-let-materialu",
      "category": "science",
      "en": {
        "short": "DeepMind's GNoME predicted 2.2 million new crystal materials — what it called ~800 years' worth of knowledge",
        "full": "In 2023, DeepMind's GNoME system predicted 2.2 million previously unknown crystal structures, about 380,000 of them stable candidates for real materials — an expansion the team described as roughly 800 years of accumulated knowledge, released openly to materials scientists."
      },
      "cs": {
        "short": "Systém GNoME od DeepMind předpověděl 2,2 milionu nových krystalických materiálů — podle autorů ~800 let poznání",
        "full": "Systém GNoME od DeepMind v roce 2023 předpověděl 2,2 milionu dosud neznámých krystalických struktur, z toho asi 380 000 stabilních kandidátů na reálné materiály — rozšíření, které tým popsal jako zhruba 800 let nahromaděného poznání, zveřejněné materiálovým vědcům zdarma."
      },
      "verified": "2026-08-07",
      "source": "Merchant et al., Nature (2023)"
    },
    {
      "id": "ai-039",
      "slug": "chinchilla-podvyzivene-modely",
      "category": "models",
      "en": {
        "short": "The 2022 'Chinchilla' paper showed most big models were badly undertrained — data mattered as much as size",
        "full": "DeepMind's 2022 Chinchilla paper showed the era's giant models were undertrained for their size: compute is best spent scaling parameters and training data together, roughly 20 tokens per parameter. Smaller-but-better-fed Chinchilla beat models far larger — and rewrote industry training recipes."
      },
      "cs": {
        "short": "Studie 'Chinchilla' z roku 2022 ukázala, že velké modely byly podtrénované — data rozhodují stejně jako velikost",
        "full": "Studie Chinchilla od DeepMind z roku 2022 ukázala, že obří modely té doby byly na svou velikost podtrénované: výpočty se vyplatí dělit mezi parametry a trénovací data společně, zhruba 20 tokenů na parametr. Menší, ale lépe 'nakrmená' Chinchilla porazila mnohem větší modely — a přepsala tréninkové recepty oboru."
      },
      "verified": "2026-08-07",
      "source": "Hoffmann et al., 2022"
    },
    {
      "id": "ai-040",
      "slug": "lee-sedol-konec-kariery",
      "category": "culture",
      "en": {
        "short": "Lee Sedol won a single game against AlphaGo — then retired from Go, saying AI 'cannot be defeated'",
        "full": "Lee Sedol's Game 4 win — built on a move so unlikely it was dubbed 'God's touch' — remains the only game a human ever took from AlphaGo in that match. He retired professionally in 2019, saying that with AI 'even if I become the number one, there is an entity that cannot be defeated'."
      },
      "cs": {
        "short": "Lee Sedol vyhrál nad AlphaGo jedinou partii — a pak ukončil kariéru se slovy, že AI 'nelze porazit'",
        "full": "Výhra Lee Sedola ve čtvrté partii — postavená na tahu tak nepravděpodobném, že se mu přezdívá 'boží dotek' — zůstala jedinou partií, kterou v zápase člověk nad AlphaGo získal. V roce 2019 ukončil profesionální kariéru se slovy, že i kdyby byl jednička, 'existuje entita, kterou nelze porazit'."
      },
      "verified": "2026-08-07",
      "source": "AlphaGo match, Game 4 (2016); Lee retirement, 2019"
    },
    {
      "id": "ai-041",
      "slug": "graphcast-predpoved-za-minutu",
      "category": "science",
      "en": {
        "short": "An AI model produces a 10-day global weather forecast in under a minute on one chip — beating supercomputer models",
        "full": "DeepMind's GraphCast generates a 10-day global weather forecast in less than a minute on a single TPU, outperforming the European gold-standard physics model on the large majority of measured targets — forecasts that otherwise take hours on supercomputers."
      },
      "cs": {
        "short": "AI model spočítá desetidenní předpověď počasí pro celý svět pod minutu na jednom čipu — a poráží superpočítače",
        "full": "GraphCast od DeepMind vygeneruje desetidenní globální předpověď počasí za méně než minutu na jediném čipu TPU a na velké většině měřených ukazatelů překonává evropský fyzikální model, zlatý standard oboru — předpovědi, které jinak superpočítačům trvají hodiny."
      },
      "verified": "2026-08-07",
      "source": "Lam et al., Science (2023)"
    },
    {
      "id": "ai-042",
      "slug": "anthropic-sourozenci",
      "category": "business",
      "en": {
        "short": "Anthropic was founded in 2021 by siblings who left OpenAI to put safety first — and built Claude into a frontier lab",
        "full": "Anthropic was founded in 2021 by Dario and Daniela Amodei with a group of former OpenAI researchers who wanted safety research at the core of frontier AI. Within a few years, its Claude models were competing at the industry's front line."
      },
      "cs": {
        "short": "Anthropic založili v roce 2021 sourozenci, kteří odešli z OpenAI kvůli důrazu na bezpečnost — a z Claudea udělali špičku",
        "full": "Anthropic založili v roce 2021 Dario a Daniela Amodeiovi se skupinou bývalých výzkumníků OpenAI, kteří chtěli mít bezpečnostní výzkum v jádru vývoje špičkové AI. Během několika let jejich modely Claude konkurovaly na první linii oboru."
      },
      "verified": "2026-08-07",
      "source": "Anthropic founding, 2021"
    },
    {
      "id": "ai-043",
      "slug": "deepfake-jmeno-z-redditu",
      "category": "culture",
      "en": {
        "short": "The word 'deepfake' comes from a Reddit username in 2017",
        "full": "The term 'deepfake' entered the language in late 2017 from the Reddit username 'deepfakes', an account posting AI face-swapped videos. Within a few years the coinage of one anonymous account named a global category of synthetic media — and of law."
      },
      "cs": {
        "short": "Slovo 'deepfake' vzniklo v roce 2017 z přezdívky na Redditu",
        "full": "Pojem 'deepfake' vstoupil do jazyka koncem roku 2017 z redditové přezdívky 'deepfakes' — účtu, který zveřejňoval videa s AI výměnou tváří. Během pár let výtvor jednoho anonymního účtu pojmenoval celosvětovou kategorii syntetických médií — i legislativy."
      },
      "verified": "2026-08-07",
      "source": "Origin of the term, Reddit 2017"
    },
    {
      "id": "ai-044",
      "slug": "zima-ai-lighthill",
      "category": "history",
      "en": {
        "short": "AI has frozen over before: a single 1973 report helped cut funding for a decade — the field calls them 'AI winters'",
        "full": "The 1973 Lighthill Report for the British government judged AI's grand promises unmet and helped collapse research funding in the UK and beyond; a second freeze followed in the late 1980s. The field named these collapses 'AI winters' — a standing reminder that hype has failed before."
      },
      "cs": {
        "short": "AI už zamrzla dřív: jediná zpráva z roku 1973 pomohla na dekádu utnout financování — obor tomu říká 'zimy AI'",
        "full": "Lighthillova zpráva pro britskou vládu z roku 1973 shledala velké sliby AI nesplněnými a pomohla zhroutit financování výzkumu v Británii i jinde; druhé zamrznutí přišlo koncem 80. let. Obor tyto propady pojmenoval 'zimy AI' — trvalá připomínka, že humbuk už selhal dřív."
      },
      "verified": "2026-08-07",
      "source": "Lighthill Report (1973); AI winter historiography"
    },
    {
      "id": "ai-045",
      "slug": "gpt4-pres-100-milionu",
      "category": "business",
      "en": {
        "short": "Training GPT-4 cost more than $100 million, according to OpenAI's CEO",
        "full": "Sam Altman said the training of GPT-4 cost 'more than' $100 million. Estimates for later frontier runs go higher still — a scale of scientific experiment that, a decade earlier, trained on two gaming GPUs."
      },
      "cs": {
        "short": "Trénink GPT-4 stál podle šéfa OpenAI přes 100 milionů dolarů",
        "full": "Sam Altman uvedl, že trénink GPT-4 stál 'víc než' 100 milionů dolarů. Odhady pozdějších špičkových běhů jdou ještě výš — rozměr vědeckého experimentu, který se o dekádu dřív vešel na dvě herní grafiky."
      },
      "verified": "2026-08-07",
      "source": "Altman interview, Wired (2023)"
    },
    {
      "id": "ai-046",
      "slug": "moravcuv-paradox",
      "category": "history",
      "en": {
        "short": "Moravec's paradox: AI finds chess easy and walking hard — the opposite of humans",
        "full": "Roboticist Hans Moravec observed in the 1980s that computers excel at what humans find hard — logic, chess, calculus — while failing at what a toddler does effortlessly: seeing, grasping, walking. Decades later the paradox still shapes robotics, where dexterity lags far behind language."
      },
      "cs": {
        "short": "Moravcův paradox: pro AI jsou šachy snadné a chůze těžká — přesně naopak než pro člověka",
        "full": "Robotik Hans Moravec si v 80. letech všiml, že počítače vynikají v tom, co je pro lidi těžké — logika, šachy, integrály — a selhávají v tom, co batole zvládá bez námahy: vidět, uchopit, jít. Paradox formuje robotiku dodnes; zručnost zaostává daleko za jazykem."
      },
      "verified": "2026-08-07",
      "source": "Moravec, Mind Children (1988)"
    },
    {
      "id": "ai-047",
      "slug": "cena-inteligence-pada",
      "category": "business",
      "en": {
        "short": "The price of GPT-4-level output fell roughly 100× between 2023 and 2024 — per public API price lists",
        "full": "OpenAI's GPT-4 launched in March 2023 at $60 per million output tokens; by mid-2024, GPT-4o mini offered comparable everyday capability at $0.60 — a roughly 100× price collapse in about 18 months, mirrored across the industry."
      },
      "cs": {
        "short": "Cena výstupu na úrovni GPT-4 spadla mezi lety 2023 a 2024 zhruba 100× — podle veřejných ceníků API",
        "full": "GPT-4 od OpenAI startoval v březnu 2023 na 60 dolarech za milion výstupních tokenů; v polovině roku 2024 nabízel GPT-4o mini srovnatelnou běžnou užitečnost za 0,60 dolaru — zhruba stonásobný cenový propad za asi 18 měsíců, který se opakoval napříč oborem."
      },
      "verified": "2026-08-07",
      "source": "OpenAI public API pricing, 2023-2024"
    },
    {
      "id": "ai-048",
      "slug": "dota-a-starcraft-2019",
      "category": "models",
      "en": {
        "short": "In 2019 AI beat the world champions at Dota 2 and reached Grandmaster in StarCraft II",
        "full": "In April 2019, OpenAI Five beat OG, the reigning world champions, at Dota 2; the same year DeepMind's AlphaStar reached Grandmaster rank in StarCraft II, above 99.8% of ranked human players — real-time games of teamwork, deception and incomplete information."
      },
      "cs": {
        "short": "V roce 2019 porazila AI mistry světa v Dota 2 a dosáhla na Grandmastera ve StarCraftu II",
        "full": "V dubnu 2019 porazil systém OpenAI Five úřadující mistry světa z týmu OG v Dota 2; tentýž rok dosáhl AlphaStar od DeepMind ve StarCraftu II hodnosti Grandmaster, nad 99,8 % hodnocených hráčů — v realtimových hrách týmové spolupráce, klamání a neúplných informací."
      },
      "verified": "2026-08-07",
      "source": "OpenAI Five vs OG; AlphaStar, Nature (2019)"
    },
    {
      "id": "ai-049",
      "slug": "backprop-1986",
      "category": "history",
      "en": {
        "short": "The algorithm training every neural network today was popularized in 1986 — then waited ~25 years for hardware to catch up",
        "full": "Rumelhart, Hinton and Williams' 1986 paper popularized backpropagation, the learning algorithm behind essentially every modern neural network. The math was ready decades before the compute: it took until the GPU era around 2010 for deep networks to become practical."
      },
      "cs": {
        "short": "Algoritmus, kterým se dnes učí každá neuronová síť, byl popularizován v roce 1986 — a ~25 let čekal na hardware",
        "full": "Studie Rumelharta, Hintona a Williamse z roku 1986 popularizovala backpropagation, učicí algoritmus prakticky každé moderní neuronové sítě. Matematika byla hotová dekády před výpočetním výkonem: hluboké sítě se staly praktickými až s érou GPU kolem roku 2010."
      },
      "verified": "2026-08-07",
      "source": "Rumelhart, Hinton, Williams, Nature (1986)"
    },
    {
      "id": "ai-050",
      "slug": "fotograf-odmitl-cenu",
      "category": "culture",
      "en": {
        "short": "A photographer won the Sony World Photography Award with an AI image — and refused the prize to prove a point",
        "full": "In April 2023, Boris Eldagsen won a Sony World Photography Award category with 'Pseudomnesia: The Electrician', then revealed it was AI-generated and refused the prize — he had entered, he said, to test whether competitions were ready. They were not."
      },
      "cs": {
        "short": "Fotograf vyhrál Sony World Photography Award se snímkem z AI — a cenu odmítl, aby něco dokázal",
        "full": "V dubnu 2023 vyhrál Boris Eldagsen kategorii Sony World Photography Awards se snímkem 'Pseudomnesia: The Electrician', pak odhalil, že jde o obraz z AI, a cenu odmítl — přihlásil ho prý proto, aby otestoval, zda jsou soutěže připravené. Nebyly."
      },
      "verified": "2026-08-07",
      "source": "Sony World Photography Awards, April 2023"
    }
  ]
}
```

## `aifirst: data/ai-lessons.json` — 60 entries (reveal order = teaching order; day 0 = machine learning, day 59 = AGI)

```json
{
  "schemaVersion": "boardless-dataset/1",
  "dataset": "ai-lessons",
  "anchor": "2026-07-01",
  "categories": {
    "models": { "en": "Models", "cs": "Modely" },
    "hardware": { "en": "Hardware", "cs": "Hardware" },
    "training": { "en": "Training", "cs": "Trénink" },
    "inference": { "en": "Inference", "cs": "Inference" },
    "data": { "en": "Data", "cs": "Data" },
    "agents": { "en": "Agents & tooling", "cs": "Agenti a nástroje" },
    "safety": { "en": "Safety & evals", "cs": "Bezpečnost a hodnocení" },
    "economics": { "en": "Economics", "cs": "Ekonomika" }
  },
  "entries": [
    {
      "id": "lex-001",
      "slug": "machine-learning",
      "term": "Machine learning",
      "category": "models",
      "en": {
        "short": "Software that learns rules from examples instead of being given them",
        "full": "Machine learning is the approach where a program improves at a task by finding patterns in examples, rather than following rules a programmer wrote by hand. Nearly everything called 'AI' today — including language models — is machine learning underneath."
      },
      "cs": {
        "short": "Software, který se pravidla učí z příkladů, místo aby je dostal předepsaná",
        "full": "Strojové učení je přístup, kdy se program v úloze zlepšuje hledáním vzorů v příkladech, místo aby se řídil pravidly napsanými programátorem. Téměř vše, čemu se dnes říká 'AI' — včetně jazykových modelů — je uvnitř strojové učení."
      },
      "verified": "2026-08-07",
      "source": "Standard ML textbooks (Mitchell, 1997)"
    },
    {
      "id": "lex-002",
      "slug": "neural-network",
      "term": "Neural network",
      "category": "models",
      "en": {
        "short": "Layers of simple numeric units that together learn to transform inputs into outputs",
        "full": "A neural network is many layers of simple units, each multiplying inputs by learned weights and passing the result on. No single unit understands anything; stacked in millions, they learn to map text to text, pixels to labels, sound to words. 'Deep learning' just means many layers."
      },
      "cs": {
        "short": "Vrstvy jednoduchých početních jednotek, které se společně naučí převádět vstupy na výstupy",
        "full": "Neuronová síť je mnoho vrstev jednoduchých jednotek; každá násobí vstupy naučenými vahami a posílá výsledek dál. Žádná jednotka sama nic nechápe, ale v milionech naskládané na sebe se naučí převádět text na text, pixely na popisky, zvuk na slova. 'Hluboké učení' znamená prostě hodně vrstev."
      },
      "verified": "2026-08-07",
      "source": "Standard deep-learning literature (Goodfellow et al.)"
    },
    {
      "id": "lex-003",
      "slug": "llm",
      "term": "LLM",
      "category": "models",
      "en": {
        "short": "Large language model — a neural network trained on huge text corpora to predict the next token",
        "full": "A large language model is a neural network trained on enormous amounts of text to do one thing: predict the next token. At sufficient scale that single skill yields translation, summarization, coding and conversation. ChatGPT, Claude and Gemini are all LLMs with extra training for dialogue."
      },
      "cs": {
        "short": "Velký jazykový model — neuronová síť natrénovaná na obřích textech, aby předpovídala další token",
        "full": "Velký jazykový model je neuronová síť natrénovaná na obrovském množství textu na jedinou úlohu: předpovědět další token. V dostatečném měřítku z této jediné dovednosti vznikne překlad, shrnutí, programování i konverzace. ChatGPT, Claude i Gemini jsou LLM s dodatečným tréninkem pro dialog."
      },
      "verified": "2026-08-07",
      "source": "GPT-3 paper (Brown et al., 2020) and successors"
    },
    {
      "id": "lex-004",
      "slug": "token",
      "term": "Token",
      "category": "inference",
      "en": {
        "short": "The chunk of text a model actually reads and writes — usually a word piece, not a whole word",
        "full": "Models don't process letters or words but tokens: frequent chunks of characters from a fixed vocabulary. 'Praha' may be one token, a rare Czech word may be four. Models are priced, limited and measured in tokens — which is why the same sentence costs more in Czech than in English."
      },
      "cs": {
        "short": "Kousek textu, který model doopravdy čte a píše — obvykle část slova, ne celé slovo",
        "full": "Modely nezpracovávají písmena ani slova, ale tokeny: časté úseky znaků z pevného slovníku. 'Praha' může být jeden token, vzácné české slovo klidně čtyři. V tokenech se modely účtují, omezují i měří — proto stejná věta stojí v češtině víc než v angličtině."
      },
      "verified": "2026-08-07",
      "source": "BPE tokenization (Sennrich et al., 2016); provider docs"
    },
    {
      "id": "lex-005",
      "slug": "gpu",
      "term": "GPU",
      "category": "hardware",
      "en": {
        "short": "The graphics chip that turned out to be perfect for AI: thousands of small cores computing in parallel",
        "full": "A graphics processing unit was built to color millions of pixels at once — thousands of small cores doing simple math in parallel. Neural networks need exactly that, so GPUs became the engine of the AI era, the most sought-after hardware in tech, and the foundation of Nvidia's rise."
      },
      "cs": {
        "short": "Grafický čip, který se ukázal jako ideální pro AI: tisíce malých jader počítajících paralelně",
        "full": "Grafický procesor vznikl, aby naráz obarvil miliony pixelů — tisíce malých jader dělajících jednoduchou matematiku paralelně. Neuronové sítě potřebují přesně tohle, a tak se GPU staly motorem éry AI, nejžádanějším hardwarem v technologiích a základem vzestupu Nvidie."
      },
      "verified": "2026-08-07",
      "source": "GPGPU literature; AlexNet (2012)"
    },
    {
      "id": "lex-006",
      "slug": "parameters",
      "term": "Parameters",
      "category": "models",
      "en": {
        "short": "The learned numbers inside a model — its entire 'knowledge', often billions of them",
        "full": "Parameters (weights) are the numbers a model adjusts during training; everything it 'knows' is encoded in them. Model sizes are quoted in parameters — GPT-3 had 175 billion. More parameters mean more capacity, more memory to store them, and more compute to run them."
      },
      "cs": {
        "short": "Naučená čísla uvnitř modelu — celé jeho 'vědění', často v miliardách",
        "full": "Parametry (váhy) jsou čísla, která model během tréninku ladí; vše, co 'ví', je zakódováno v nich. Velikost modelů se udává v parametrech — GPT-3 měl 175 miliard. Víc parametrů znamená větší kapacitu, víc paměti na uložení a víc výpočtů na provoz."
      },
      "verified": "2026-08-07",
      "source": "Standard ML terminology"
    },
    {
      "id": "lex-007",
      "slug": "pretraining",
      "term": "Pretraining",
      "category": "training",
      "en": {
        "short": "The massive first phase of training: months of next-token prediction over much of the internet",
        "full": "Pretraining is the expensive foundation phase: the model reads trillions of tokens and learns to predict the next one, absorbing grammar, facts and reasoning patterns along the way. It costs the vast majority of a frontier model's budget; everything after is comparatively cheap refinement."
      },
      "cs": {
        "short": "Mohutná první fáze tréninku: měsíce předpovídání dalšího tokenu nad velkou částí internetu",
        "full": "Pretraining je drahá základová fáze: model přečte biliony tokenů a učí se předpovídat ten další, přičemž cestou nasaje gramatiku, fakta i vzorce uvažování. Spolkne drtivou většinu rozpočtu špičkového modelu; vše ostatní je proti tomu levné dolaďování."
      },
      "verified": "2026-08-07",
      "source": "LLM training literature"
    },
    {
      "id": "lex-008",
      "slug": "inference",
      "term": "Inference",
      "category": "inference",
      "en": {
        "short": "Running a trained model to get answers — where all the day-to-day cost lives",
        "full": "Inference is using a finished model: every chat reply, every generated image is inference. Training happens once; inference happens billions of times a day, so its speed and cost dominate AI economics — and most engineering effort now goes into making it cheaper."
      },
      "cs": {
        "short": "Provoz natrénovaného modelu — tady vzniká veškerý každodenní náklad",
        "full": "Inference je používání hotového modelu: každá odpověď v chatu, každý vygenerovaný obrázek je inference. Trénink proběhne jednou; inference miliardkrát denně, takže její rychlost a cena určují ekonomiku AI — a většina inženýrského úsilí dnes směřuje k jejímu zlevnění."
      },
      "verified": "2026-08-07",
      "source": "Standard ML terminology"
    },
    {
      "id": "lex-009",
      "slug": "prompt",
      "term": "Prompt",
      "category": "agents",
      "en": {
        "short": "Everything you hand the model before it answers — its entire working brief",
        "full": "The prompt is the full input a model sees: your question, the conversation so far, pasted documents, instructions. The model has no memory beyond it (and its training), so what is and isn't in the prompt largely decides the quality of the answer."
      },
      "cs": {
        "short": "Vše, co modelu předáte, než odpoví — celé jeho pracovní zadání",
        "full": "Prompt je úplný vstup, který model vidí: vaše otázka, dosavadní konverzace, vložené dokumenty, instrukce. Mimo prompt (a svůj trénink) model žádnou paměť nemá, takže co v promptu je a co chybí, do velké míry rozhoduje o kvalitě odpovědi."
      },
      "verified": "2026-08-07",
      "source": "Provider documentation"
    },
    {
      "id": "lex-010",
      "slug": "context-window",
      "term": "Context window",
      "category": "inference",
      "en": {
        "short": "The maximum amount of text a model can hold in mind at once, measured in tokens",
        "full": "The context window is the model's working memory: the maximum tokens it can consider in one go — prompt and answer combined. Anything beyond it is invisible. Windows grew from ~2 thousand tokens (GPT-3) to millions, enabling whole-book and whole-codebase workflows."
      },
      "cs": {
        "short": "Maximum textu, které model udrží v hlavě najednou, měřené v tokenech",
        "full": "Kontextové okno je pracovní paměť modelu: maximum tokenů, které dokáže zvážit naráz — prompt i odpověď dohromady. Co se nevejde, model nevidí. Okna narostla z ~2 tisíc tokenů (GPT-3) na miliony, což umožnilo pracovat s celými knihami i kódovými bázemi."
      },
      "verified": "2026-08-07",
      "source": "Model documentation across providers"
    },
    {
      "id": "lex-011",
      "slug": "transformer",
      "term": "Transformer",
      "category": "models",
      "en": {
        "short": "The 2017 architecture behind virtually every modern AI model",
        "full": "The Transformer, introduced in Google's 2017 paper 'Attention Is All You Need', processes all tokens in parallel and lets each attend to every other. That parallelism fit GPUs perfectly and scaled — the 'T' in GPT, and the architecture under essentially every frontier model since."
      },
      "cs": {
        "short": "Architektura z roku 2017, na které stojí prakticky každý moderní model AI",
        "full": "Transformer, představený v roce 2017 ve studii Googlu 'Attention Is All You Need', zpracovává všechny tokeny paralelně a každému dovoluje sledovat všechny ostatní. Tato paralelnost dokonale sedla GPU a škálovala — je to ono 'T' v GPT a architektura prakticky každého špičkového modelu od té doby."
      },
      "verified": "2026-08-07",
      "source": "Vaswani et al., 2017"
    },
    {
      "id": "lex-012",
      "slug": "attention",
      "term": "Attention",
      "category": "models",
      "en": {
        "short": "The mechanism letting each word weigh every other word when computing meaning",
        "full": "Attention lets the model decide, for each token, which other tokens matter right now — linking 'it' to the noun it refers to, a verb to its subject. It is the Transformer's core trick and the reason models handle long-range structure that older architectures lost."
      },
      "cs": {
        "short": "Mechanismus, kterým každé slovo váží všechna ostatní při výpočtu významu",
        "full": "Attention dovoluje modelu u každého tokenu rozhodnout, které ostatní tokeny jsou právě teď důležité — spojit 'ono' s podstatným jménem, k němuž odkazuje, sloveso s podmětem. Je to jádro Transformeru a důvod, proč modely zvládají vazby na dlouhou vzdálenost, které starší architektury ztrácely."
      },
      "verified": "2026-08-07",
      "source": "Vaswani et al., 2017"
    },
    {
      "id": "lex-013",
      "slug": "cpu",
      "term": "CPU",
      "category": "hardware",
      "en": {
        "short": "The computer's general-purpose brain: few powerful cores, built for sequential logic — not for AI math",
        "full": "A central processing unit runs everything general on a computer with a handful of powerful cores optimized for sequential logic and branching. Neural networks instead need millions of identical multiplications at once — which is why AI runs on GPUs while the CPU orchestrates around them."
      },
      "cs": {
        "short": "Univerzální mozek počítače: pár výkonných jader stavěných na postupnou logiku — ne na matematiku AI",
        "full": "Centrální procesor obstarává v počítači vše obecné hrstkou výkonných jader optimalizovaných pro postupnou logiku a větvení. Neuronové sítě ale potřebují miliony stejných násobení naráz — proto AI běží na GPU, zatímco CPU kolem nich diriguje."
      },
      "verified": "2026-08-07",
      "source": "Computer architecture fundamentals"
    },
    {
      "id": "lex-014",
      "slug": "fine-tuning",
      "term": "Fine-tuning",
      "category": "training",
      "en": {
        "short": "Taking a pretrained model and training it further on a narrow dataset to specialize it",
        "full": "Fine-tuning continues training an already-pretrained model on a smaller, targeted dataset — a company's support tickets, legal contracts, a house style. It buys specialization for a fraction of pretraining's cost, which is why one foundation model spawns thousands of variants."
      },
      "cs": {
        "short": "Dotrénování hotového modelu na úzkých datech, aby se specializoval",
        "full": "Fine-tuning pokračuje v tréninku už předtrénovaného modelu na menší, cílené sadě dat — firemních tiketech podpory, právních smlouvách, domácím stylu psaní. Specializaci pořídí za zlomek ceny pretrainingu, a proto z jednoho základového modelu vznikají tisíce variant."
      },
      "verified": "2026-08-07",
      "source": "Transfer-learning literature"
    },
    {
      "id": "lex-015",
      "slug": "hallucination",
      "term": "Hallucination",
      "category": "safety",
      "en": {
        "short": "When a model states false things fluently and confidently — a side effect of predicting plausible text",
        "full": "A hallucination is confident, fluent output that is simply false — an invented citation, date or API. It is not a bug in one product but a consequence of how LLMs work: they generate plausible continuations, and plausible is not the same as true. Verification remains the reader's job."
      },
      "cs": {
        "short": "Když model plynule a sebejistě tvrdí nepravdy — vedlejší účinek predikce věrohodného textu",
        "full": "Halucinace je sebejistý, plynulý výstup, který je prostě nepravdivý — vymyšlená citace, datum nebo API. Není to chyba jednoho produktu, ale důsledek fungování LLM: generují věrohodná pokračování, a věrohodné není totéž co pravdivé. Ověřování zůstává na čtenáři."
      },
      "verified": "2026-08-07",
      "source": "LLM evaluation literature"
    },
    {
      "id": "lex-016",
      "slug": "embedding",
      "term": "Embedding",
      "category": "data",
      "en": {
        "short": "Text turned into a list of numbers where similar meanings land close together",
        "full": "An embedding represents text (or an image) as a vector — hundreds of numbers — positioned so that similar meanings sit near each other. 'Invoice' and 'faktura' land close despite sharing no letters. Embeddings power semantic search, recommendations and retrieval for AI."
      },
      "cs": {
        "short": "Text převedený na řadu čísel, kde podobné významy leží blízko sebe",
        "full": "Embedding reprezentuje text (nebo obrázek) jako vektor — stovky čísel — umístěný tak, aby podobné významy ležely blízko sebe. 'Invoice' a 'faktura' skončí vedle sebe, ač nesdílejí jediné písmeno. Embeddingy pohánějí sémantické vyhledávání, doporučování i dohledávání podkladů pro AI."
      },
      "verified": "2026-08-07",
      "source": "word2vec (2013) through modern embedding models"
    },
    {
      "id": "lex-017",
      "slug": "dataset",
      "term": "Dataset",
      "category": "data",
      "en": {
        "short": "The collection of examples a model learns from — its quality sets the model's ceiling",
        "full": "A dataset is the curated collection of examples a model trains on: web text, code, labeled images. Scale matters, but quality decides the ceiling — garbage in, garbage out at billion-token scale. Frontier labs now guard dataset composition as closely as architecture."
      },
      "cs": {
        "short": "Sbírka příkladů, ze kterých se model učí — její kvalita určuje strop modelu",
        "full": "Dataset je uspořádaná sbírka příkladů, na nichž se model trénuje: text z webu, kód, popsané obrázky. Objem je důležitý, ale strop určuje kvalita — odpad dovnitř, odpad ven, jen v miliardách tokenů. Špičkové laboratoře dnes střeží složení datasetů stejně přísně jako architekturu."
      },
      "verified": "2026-08-07",
      "source": "ML data-curation literature"
    },
    {
      "id": "lex-018",
      "slug": "rlhf",
      "term": "RLHF",
      "category": "training",
      "en": {
        "short": "Reinforcement learning from human feedback — how raw text predictors become helpful assistants",
        "full": "RLHF trains a model on human preferences: people rank candidate answers, a reward model learns those rankings, and the LLM is optimized against it. It is the step that turned raw next-token predictors into assistants that follow instructions — the technique behind ChatGPT's breakthrough."
      },
      "cs": {
        "short": "Posilované učení z lidské zpětné vazby — jak se z prediktorů textu stali užiteční asistenti",
        "full": "RLHF trénuje model na lidských preferencích: lidé řadí kandidátské odpovědi, odměnový model se jejich pořadí naučí a LLM se proti němu optimalizuje. Právě tenhle krok proměnil syrové prediktory dalšího tokenu v asistenty, kteří plní pokyny — technika stojící za průlomem ChatGPT."
      },
      "verified": "2026-08-07",
      "source": "InstructGPT (Ouyang et al., 2022)"
    },
    {
      "id": "lex-019",
      "slug": "agent",
      "term": "Agent",
      "category": "agents",
      "en": {
        "short": "An AI that doesn't just answer but acts: plans steps, uses tools, checks results, iterates",
        "full": "An agent is a model wrapped in a loop: it plans, calls tools (search, code, browsers, files), reads the results and decides the next step until the task is done. The shift from answering questions to completing tasks is the defining AI product trend of this era."
      },
      "cs": {
        "short": "AI, která jen neodpovídá, ale jedná: plánuje kroky, používá nástroje, kontroluje výsledky a opakuje",
        "full": "Agent je model obalený smyčkou: plánuje, volá nástroje (vyhledávání, kód, prohlížeč, soubory), čte výsledky a rozhoduje o dalším kroku, dokud úkol nedokončí. Posun od odpovídání na otázky k dokončování úkolů je určující produktový trend této éry AI."
      },
      "verified": "2026-08-07",
      "source": "Agent frameworks and provider docs, 2023-2025"
    },
    {
      "id": "lex-020",
      "slug": "api",
      "term": "API",
      "category": "economics",
      "en": {
        "short": "The paid interface through which apps call someone else's model — the business model of AI labs",
        "full": "An application programming interface lets software call a model over the network: send a prompt, get tokens back, pay per token. Most 'AI products' are apps built on someone else's model API — which is why token prices and rate limits shape the whole industry's economics."
      },
      "cs": {
        "short": "Placené rozhraní, přes které aplikace volají cizí model — obchodní model AI laboratoří",
        "full": "API dovoluje softwaru volat model po síti: pošleš prompt, dostaneš tokeny, platíš za token. Většina 'AI produktů' jsou aplikace postavené na cizím modelovém API — proto ceny tokenů a limity požadavků formují ekonomiku celého oboru."
      },
      "verified": "2026-08-07",
      "source": "Provider API documentation"
    },
    {
      "id": "lex-021",
      "slug": "multimodal",
      "term": "Multimodal",
      "category": "models",
      "en": {
        "short": "A model that handles more than text: images, audio, video in and out",
        "full": "A multimodal model works across media — reading images, hearing audio, sometimes generating both — in one system, in one conversation. It's what lets an assistant read a screenshot of an error, describe a photo, or hold a spoken conversation."
      },
      "cs": {
        "short": "Model, který zvládá víc než text: obrázky, zvuk i video na vstupu i výstupu",
        "full": "Multimodální model pracuje napříč médii — čte obrázky, slyší zvuk, někdy obojí i generuje — v jednom systému a jedné konverzaci. Díky tomu asistent přečte screenshot chyby, popíše fotku nebo vede mluvený rozhovor."
      },
      "verified": "2026-08-07",
      "source": "GPT-4V, Gemini, Claude multimodal documentation"
    },
    {
      "id": "lex-022",
      "slug": "tool-calling",
      "term": "Tool calling",
      "category": "agents",
      "en": {
        "short": "Letting the model invoke functions — search, code, databases — instead of only writing prose",
        "full": "Tool calling (function calling) lets a model output a structured request — 'call the weather API with city=Brno' — that the surrounding software executes, feeding results back. It grounds models in live data and real actions, and it is the mechanism agents are built on."
      },
      "cs": {
        "short": "Model smí volat funkce — vyhledávání, kód, databáze — místo aby jen psal text",
        "full": "Tool calling (volání funkcí) dovoluje modelu vypsat strukturovaný požadavek — 'zavolej API počasí s city=Brno' — který okolní software vykoná a výsledek vrátí. Ukotvuje modely v živých datech a skutečných akcích a je to mechanismus, na němž stojí agenti."
      },
      "verified": "2026-08-07",
      "source": "Function-calling APIs, 2023-2025"
    },
    {
      "id": "lex-023",
      "slug": "quantization",
      "term": "Quantization",
      "category": "inference",
      "en": {
        "short": "Storing model weights in fewer bits so it runs smaller, faster and cheaper — with a small accuracy cost",
        "full": "Quantization compresses a model by storing weights at lower precision — 16-bit numbers squeezed to 8 or 4 bits. Memory and cost drop severalfold while quality falls only slightly. It's the technique that lets open models run on a laptop or phone instead of a data center."
      },
      "cs": {
        "short": "Uložení vah modelu v méně bitech, aby běžel menší, rychlejší a levnější — za malou cenu v přesnosti",
        "full": "Kvantizace model komprimuje uložením vah v nižší přesnosti — 16bitová čísla stlačí na 8 nebo 4 bity. Paměť a náklady klesnou několikanásobně, kvalita jen mírně. Právě díky ní běží otevřené modely na notebooku nebo telefonu místo v datacentru."
      },
      "verified": "2026-08-07",
      "source": "Quantization literature (GPTQ, GGUF ecosystems)"
    },
    {
      "id": "lex-024",
      "slug": "vram",
      "term": "VRAM",
      "category": "hardware",
      "en": {
        "short": "The GPU's own memory — the hard limit on how big a model fits on a card",
        "full": "VRAM is the memory soldered onto a GPU, far faster than system RAM. A model's weights must fit in it to run well, so VRAM — 80 GB on data-center cards, 8-24 GB on consumer ones — is the practical limit on what runs where, and a big reason AI hardware is expensive."
      },
      "cs": {
        "short": "Vlastní paměť GPU — tvrdý limit toho, jak velký model se na kartu vejde",
        "full": "VRAM je paměť napájená přímo na GPU, mnohem rychlejší než systémová RAM. Váhy modelu se do ní musejí vejít, aby běžel svižně, takže VRAM — 80 GB u datacentrových karet, 8-24 GB u herních — je praktická hranice toho, co kde poběží, a velký důvod, proč je AI hardware drahý."
      },
      "verified": "2026-08-07",
      "source": "GPU specifications"
    },
    {
      "id": "lex-025",
      "slug": "chain-of-thought",
      "term": "Chain of thought",
      "category": "agents",
      "en": {
        "short": "Making the model write out intermediate reasoning steps before the answer — accuracy jumps",
        "full": "Chain-of-thought prompting has the model reason step by step in text before answering. Writing the intermediate steps measurably improves math, logic and planning — and the idea grew into 'reasoning models' that deliberate internally at length before replying."
      },
      "cs": {
        "short": "Model nejdřív vypíše mezikroky uvažování a teprve pak odpoví — přesnost skokově roste",
        "full": "Chain-of-thought vede model k tomu, aby před odpovědí uvažoval krok za krokem v textu. Vypsání mezikroků měřitelně zlepšuje matematiku, logiku i plánování — a z nápadu vyrostly 'reasoning modely', které před odpovědí dlouze rozvažují uvnitř."
      },
      "verified": "2026-08-07",
      "source": "Wei et al., 2022"
    },
    {
      "id": "lex-026",
      "slug": "data-labeling",
      "term": "Data labeling",
      "category": "data",
      "en": {
        "short": "Humans annotating examples so models can learn from them — AI's least visible workforce",
        "full": "Labeling is the human work of annotating data: tagging images, ranking model answers, marking toxicity. Modern AI rests on millions of hours of it, much performed by low-paid workers worldwide — the industry's least visible but essential layer."
      },
      "cs": {
        "short": "Lidé popisují příklady, aby se z nich modely mohly učit — nejméně viditelná pracovní síla AI",
        "full": "Labeling je lidská práce s anotací dat: štítkování obrázků, řazení odpovědí modelu, značení toxicity. Moderní AI stojí na milionech hodin takové práce, z velké části odvedené špatně placenými pracovníky po celém světě — nejméně viditelná, ale nezbytná vrstva oboru."
      },
      "verified": "2026-08-07",
      "source": "ImageNet history; RLHF pipelines"
    },
    {
      "id": "lex-027",
      "slug": "temperature",
      "term": "Temperature",
      "category": "inference",
      "en": {
        "short": "The randomness dial: low = predictable and repeatable, high = varied and creative",
        "full": "Temperature controls how the model picks among candidate tokens. Near zero it takes the most likely one every time — stable, repeatable, dull. Higher values give unlikely tokens a chance — more variety and creativity, more risk of nonsense. Same model, different personality."
      },
      "cs": {
        "short": "Kolečko náhodnosti: nízká = předvídatelné a opakovatelné, vysoká = pestré a kreativní",
        "full": "Temperature řídí, jak model vybírá z kandidátských tokenů. Blízko nule bere pokaždé ten nejpravděpodobnější — stabilní, opakovatelné, nudné. Vyšší hodnoty dají šanci i méně pravděpodobným tokenům — víc pestrosti a nápadů, ale i rizika nesmyslů. Stejný model, jiná povaha."
      },
      "verified": "2026-08-07",
      "source": "Sampling parameters, provider docs"
    },
    {
      "id": "lex-028",
      "slug": "open-weights",
      "term": "Open weights",
      "category": "economics",
      "en": {
        "short": "Models whose weights anyone can download and run — free to use, not always free to see how they were made",
        "full": "An open-weights model publishes its trained parameters for anyone to download, run locally and fine-tune (Llama, Mistral, DeepSeek). It's not full open source — training data and code often stay private — but it moved real capability outside the big labs' clouds."
      },
      "cs": {
        "short": "Modely s vahami ke stažení pro každého — zdarma k použití, ne vždy s recepturou vzniku",
        "full": "Model s otevřenými vahami zveřejňuje natrénované parametry: kdokoli si je stáhne, spustí lokálně a doladí (Llama, Mistral, DeepSeek). Není to plný open source — trénovací data a kód často zůstávají soukromé — ale přenesl skutečné schopnosti mimo cloudy velkých laboratoří."
      },
      "verified": "2026-08-07",
      "source": "Open-weights releases, 2023-2025"
    },
    {
      "id": "lex-029",
      "slug": "distillation",
      "term": "Distillation",
      "category": "training",
      "en": {
        "short": "Training a small, cheap model to imitate a big one — keeping most quality at a fraction of the cost",
        "full": "Distillation uses a large 'teacher' model's outputs to train a small 'student', transferring much of the capability into something far cheaper to run. It's why capable mini models exist — and why labs argue about competitors training on each other's outputs."
      },
      "cs": {
        "short": "Trénink malého levného modelu, aby napodobil velký — většina kvality za zlomek nákladů",
        "full": "Destilace používá výstupy velkého modelu-'učitele' k tréninku malého 'žáka' a přenese velkou část schopností do něčeho mnohem levnějšího na provoz. Díky ní existují schopné mini modely — a laboratoře se přou, kdo trénoval na čích výstupech."
      },
      "verified": "2026-08-07",
      "source": "Hinton et al., 2015; modern mini-model families"
    },
    {
      "id": "lex-030",
      "slug": "rag",
      "term": "RAG",
      "category": "data",
      "en": {
        "short": "Retrieval-augmented generation: fetch relevant documents first, then have the model answer from them",
        "full": "RAG bolts a search step onto generation: the system retrieves relevant passages (typically via embeddings) and puts them into the prompt, so the model answers from your documents rather than from memory alone. It cuts hallucinations, enables citations, and keeps knowledge current without retraining."
      },
      "cs": {
        "short": "Generování obohacené vyhledáváním: nejdřív najdi relevantní dokumenty, pak z nich nech model odpovědět",
        "full": "RAG přišroubuje ke generování krok vyhledávání: systém dohledá relevantní pasáže (typicky přes embeddingy) a vloží je do promptu, takže model odpovídá z vašich dokumentů, ne jen z paměti. Omezuje halucinace, umožňuje citace a udržuje znalosti aktuální bez přetrénování."
      },
      "verified": "2026-08-07",
      "source": "Lewis et al., 2020; production RAG patterns"
    },
    {
      "id": "lex-031",
      "slug": "vector-database",
      "term": "Vector database",
      "category": "data",
      "en": {
        "short": "A database that stores embeddings and finds 'nearest in meaning' fast",
        "full": "A vector database indexes embeddings so that 'find the most similar items' stays fast across millions of entries. It is the storage layer under semantic search and most RAG systems — the query is not a keyword but a point in meaning-space."
      },
      "cs": {
        "short": "Databáze, která ukládá embeddingy a rychle hledá 'nejbližší významem'",
        "full": "Vektorová databáze indexuje embeddingy tak, aby dotaz 'najdi nejpodobnější položky' zůstal rychlý i nad miliony záznamů. Je to úložná vrstva pod sémantickým vyhledáváním a většinou systémů RAG — dotazem není klíčové slovo, ale bod v prostoru významů."
      },
      "verified": "2026-08-07",
      "source": "ANN search literature; vector DB products"
    },
    {
      "id": "lex-032",
      "slug": "cuda",
      "term": "CUDA",
      "category": "hardware",
      "en": {
        "short": "Nvidia's programming platform for GPUs — and one of the deepest moats in tech",
        "full": "CUDA is Nvidia's platform for programming its GPUs for general computation. Nearly two decades of tools, libraries and trained developers mean AI software works on Nvidia first — a software moat competitors with comparable chips still struggle to cross."
      },
      "cs": {
        "short": "Programovací platforma Nvidie pro GPU — a jeden z nejhlubších příkopů v technologiích",
        "full": "CUDA je platforma Nvidie pro obecné výpočty na jejích GPU. Skoro dvě dekády nástrojů, knihoven a vyškolených vývojářů znamenají, že AI software funguje nejdřív na Nvidii — softwarový příkop, který konkurenti se srovnatelnými čipy stále obtížně překonávají."
      },
      "verified": "2026-08-07",
      "source": "CUDA ecosystem since 2007"
    },
    {
      "id": "lex-033",
      "slug": "in-context-learning",
      "term": "In-context learning",
      "category": "agents",
      "en": {
        "short": "Teaching the model inside the prompt — show a few examples, get the pattern back, no training involved",
        "full": "In-context learning is a model picking up a task from the prompt itself: show three example email replies in your tone and it writes the fourth. Nothing is trained or stored — the 'learning' lives only for that conversation. Few-shot prompting is this."
      },
      "cs": {
        "short": "Učení uvnitř promptu — ukažte pár příkladů a model vzor převezme, bez jakéhokoli tréninku",
        "full": "In-context learning znamená, že model úlohu pochytí přímo z promptu: ukažte tři vzorové odpovědi ve svém tónu a čtvrtou napíše sám. Nic se netrénuje ani neukládá — 'naučené' žije jen v dané konverzaci. Few-shot prompting je přesně tohle."
      },
      "verified": "2026-08-07",
      "source": "GPT-3 paper (Brown et al., 2020)"
    },
    {
      "id": "lex-034",
      "slug": "prompt-engineering",
      "term": "Prompt engineering",
      "category": "agents",
      "en": {
        "short": "The craft of writing inputs that reliably get the output you want",
        "full": "Prompt engineering is deliberately structuring instructions, context, examples and output format so a model performs reliably. Less mystical than its reputation: clear brief, relevant context, defined format. As models improve it converges with simply writing well."
      },
      "cs": {
        "short": "Řemeslo psaní vstupů, které spolehlivě vedou k požadovanému výstupu",
        "full": "Prompt engineering je promyšlené skládání instrukcí, kontextu, příkladů a formátu výstupu, aby model fungoval spolehlivě. Méně mystické, než zní: jasné zadání, relevantní kontext, definovaný formát. S lepšími modely splývá prostě s uměním dobře psát."
      },
      "verified": "2026-08-07",
      "source": "Provider prompting guides"
    },
    {
      "id": "lex-035",
      "slug": "reasoning-model",
      "term": "Reasoning model",
      "category": "agents",
      "en": {
        "short": "A model trained to think at length before answering — spending extra compute per question on purpose",
        "full": "Reasoning models (OpenAI's o-series, DeepSeek R1, extended-thinking Claude) are trained to deliberate internally — exploring, backtracking, checking — before replying. They trade seconds and tokens for large gains on math, code and planning, creating a new dial: how much thinking to buy per question."
      },
      "cs": {
        "short": "Model natrénovaný před odpovědí dlouze přemýšlet — záměrně utrácí výpočty navíc za každou otázku",
        "full": "Reasoning modely (řada o od OpenAI, DeepSeek R1, Claude s rozšířeným přemýšlením) jsou trénované vnitřně rozvažovat — zkoušet, vracet se, ověřovat — než odpovědí. Vyměňují sekundy a tokeny za velké zisky v matematice, kódu a plánování, a přidávají nové kolečko: kolik přemýšlení si u otázky koupit."
      },
      "verified": "2026-08-07",
      "source": "o1/R1 model cards, 2024-2025"
    },
    {
      "id": "lex-036",
      "slug": "tpu",
      "term": "TPU",
      "category": "hardware",
      "en": {
        "short": "Google's custom AI chip — proof the giants would rather build silicon than queue for GPUs",
        "full": "The Tensor Processing Unit is Google's in-house chip built specifically for neural-network math, powering its data centers since 2015. Amazon, Microsoft and Meta followed with their own silicon — the clearest sign of how strategic AI compute has become."
      },
      "cs": {
        "short": "Vlastní AI čip Googlu — důkaz, že giganti si raději postaví křemík, než aby stáli frontu na GPU",
        "full": "Tensor Processing Unit je čip, který si Google od roku 2015 staví přímo pro matematiku neuronových sítí ve svých datacentrech. Amazon, Microsoft i Meta přišly s vlastním křemíkem po něm — nejjasnější známka toho, jak strategickými se AI výpočty staly."
      },
      "verified": "2026-08-07",
      "source": "Google TPU papers since 2017"
    },
    {
      "id": "lex-037",
      "slug": "scaling-laws",
      "term": "Scaling laws",
      "category": "training",
      "en": {
        "short": "The empirical finding that models get predictably better as you add compute, data and parameters",
        "full": "Scaling laws describe how model quality improves smoothly and predictably as compute, data and parameters grow together. They turned AI progress into an investment equation — if performance is predictable, spending billions is a plan, not a gamble — and they are why frontier budgets exploded."
      },
      "cs": {
        "short": "Empirický poznatek, že modely se předvídatelně zlepšují s přidáváním výpočtů, dat a parametrů",
        "full": "Škálovací zákony popisují, jak kvalita modelu hladce a předvídatelně roste, když se výpočty, data a parametry zvětšují společně. Proměnily pokrok AI v investiční rovnici — když je výkon předvídatelný, jsou miliardy plán, ne sázka — a stojí za explozí rozpočtů špičkových laboratoří."
      },
      "verified": "2026-08-07",
      "source": "Kaplan et al., 2020; Hoffmann et al., 2022"
    },
    {
      "id": "lex-038",
      "slug": "alignment",
      "term": "Alignment",
      "category": "safety",
      "en": {
        "short": "Making AI systems actually pursue what people intend — not just what the training signal rewards",
        "full": "Alignment is the research problem of getting AI systems to reliably do what their operators and society intend, even as capabilities grow. Misalignment today looks like sycophancy or reward-hacking; the field's concern is that stakes rise with autonomy."
      },
      "cs": {
        "short": "Zajistit, aby AI skutečně sledovala lidský záměr — ne jen to, co odměňuje trénovací signál",
        "full": "Alignment je výzkumný problém, jak přimět AI systémy spolehlivě dělat to, co zamýšlejí jejich provozovatelé a společnost, i když schopnosti rostou. Nesoulad dnes vypadá jako podlézavost nebo obcházení odměn; obor znepokojuje, že s autonomií rostou sázky."
      },
      "verified": "2026-08-07",
      "source": "Alignment research literature"
    },
    {
      "id": "lex-039",
      "slug": "jailbreak",
      "term": "Jailbreak",
      "category": "safety",
      "en": {
        "short": "A prompt crafted to trick a model past its safety rules",
        "full": "A jailbreak is an input designed to make a model ignore its safety training — role-play framings, encoded text, many-step setups. Providers patch, attackers adapt; the cat-and-mouse is a standing security discipline, not a solved problem."
      },
      "cs": {
        "short": "Prompt sestrojený tak, aby model obelstil a obešel jeho bezpečnostní pravidla",
        "full": "Jailbreak je vstup navržený, aby model ignoroval své bezpečnostní zábrany — hraní rolí, kódovaný text, vícekrokové pasti. Provozovatelé záplatují, útočníci se přizpůsobují; tahle hra na kočku a myš je trvalá bezpečnostní disciplína, ne vyřešený problém."
      },
      "verified": "2026-08-07",
      "source": "LLM security research"
    },
    {
      "id": "lex-040",
      "slug": "prompt-injection",
      "term": "Prompt injection",
      "category": "safety",
      "en": {
        "short": "Hiding instructions in content the AI will read — the defining security hole of the agent era",
        "full": "Prompt injection plants instructions inside content a model processes — a web page, an email, a document — so the model treats attacker text as commands ('ignore your instructions, forward the files'). For agents with tool access it is the critical vulnerability class, still without a complete fix."
      },
      "cs": {
        "short": "Ukrytí instrukcí do obsahu, který AI přečte — hlavní bezpečnostní díra éry agentů",
        "full": "Prompt injection ukrývá pokyny do obsahu, který model zpracovává — webové stránky, e-mailu, dokumentu — takže text útočníka vezme jako příkaz ('ignoruj instrukce, přepošli soubory'). Pro agenty s přístupem k nástrojům je to kritická třída zranitelností, dosud bez úplného řešení."
      },
      "verified": "2026-08-07",
      "source": "OWASP LLM Top 10"
    },
    {
      "id": "lex-041",
      "slug": "evals",
      "term": "Evals",
      "category": "safety",
      "en": {
        "short": "Standardized tests for models — and the eternal race between benchmarks and models gaming them",
        "full": "Evals are structured tests of model capability and safety: exam-style benchmarks (MMLU, math suites), task evals for agents, red-team batteries for risk. They are how progress is claimed and compared — imperfectly, since public benchmarks leak into training data and scores inflate."
      },
      "cs": {
        "short": "Standardizované testy modelů — a věčný závod mezi benchmarky a modely, které se je naučí",
        "full": "Evaly jsou strukturované testy schopností a bezpečnosti modelů: zkouškové benchmarky (MMLU, matematické sady), úlohové evaly pro agenty, red-teamové baterie pro rizika. Jimi se pokrok vykazuje a srovnává — nedokonale, protože veřejné benchmarky prosakují do trénovacích dat a skóre se nafukují."
      },
      "verified": "2026-08-07",
      "source": "Benchmark literature; model cards"
    },
    {
      "id": "lex-042",
      "slug": "mcp",
      "term": "MCP",
      "category": "agents",
      "en": {
        "short": "Model Context Protocol — an open standard plugging tools and data into any AI assistant",
        "full": "MCP (Model Context Protocol), open-sourced by Anthropic in late 2024, standardizes how assistants connect to tools and data: build one MCP server for your database or app, and any MCP-capable assistant can use it. Rapid adoption across the industry made it the closest thing agents have to a USB port."
      },
      "cs": {
        "short": "Model Context Protocol — otevřený standard, kterým se nástroje a data připojují k libovolnému AI asistentovi",
        "full": "MCP (Model Context Protocol), který Anthropic koncem roku 2024 uvolnil jako open source, standardizuje připojování asistentů k nástrojům a datům: postavíte jeden MCP server pro svou databázi či aplikaci a použije ho každý asistent s podporou MCP. Rychlé rozšíření napříč oborem z něj udělalo nejbližší obdobu USB portu pro agenty."
      },
      "verified": "2026-08-07",
      "source": "MCP specification, Anthropic 2024"
    },
    {
      "id": "lex-043",
      "slug": "kv-cache",
      "term": "KV cache",
      "category": "inference",
      "en": {
        "short": "The memory trick that keeps chat responsive: remember the processed conversation instead of re-reading it",
        "full": "The KV (key-value) cache stores the attention computations for tokens already processed, so each new token doesn't re-read the whole conversation. It's why long chats stay responsive — and a top consumer of GPU memory, which is what 'prompt caching' discounts are built on."
      },
      "cs": {
        "short": "Paměťový trik, který drží chat svižný: zapamatuj si zpracovanou konverzaci, místo abys ji četl znovu",
        "full": "KV (key-value) cache ukládá výpočty attention pro už zpracované tokeny, takže každý nový token nečte celou konverzaci znovu. Díky ní zůstávají dlouhé chaty svižné — a je to velký žrout paměti GPU, na kterém stojí i slevy za 'prompt caching'."
      },
      "verified": "2026-08-07",
      "source": "Transformer inference optimization literature"
    },
    {
      "id": "lex-044",
      "slug": "lora",
      "term": "LoRA",
      "category": "training",
      "en": {
        "short": "Fine-tuning on the cheap: train a tiny add-on instead of the whole model",
        "full": "LoRA (low-rank adaptation) freezes the original model and trains only small added matrices — often under 1% of the parameters. Specialization that once needed a data center fits on one GPU, and 'adapters' can be swapped like plugins. It made custom models a hobbyist activity."
      },
      "cs": {
        "short": "Levný fine-tuning: natrénuj drobný přídavek místo celého modelu",
        "full": "LoRA (low-rank adaptation) původní model zmrazí a trénuje jen malé přidané matice — často pod 1 % parametrů. Specializace, na kterou dřív bylo třeba datacentrum, se vejde na jedno GPU a 'adaptéry' se dají vyměňovat jako pluginy. Vlastní modely se díky ní staly koníčkem."
      },
      "verified": "2026-08-07",
      "source": "Hu et al., 2021"
    },
    {
      "id": "lex-045",
      "slug": "synthetic-data",
      "term": "Synthetic data",
      "category": "data",
      "en": {
        "short": "Training data generated by models — the answer to the internet running out of text",
        "full": "Synthetic data is model-generated training material: worked math solutions, code with tests, dialogue variations. With high-quality human text finite, frontier labs generate and filter synthetic data at scale — betting careful curation avoids the degradation of models feeding on themselves."
      },
      "cs": {
        "short": "Trénovací data vygenerovaná modely — odpověď na docházející text internetu",
        "full": "Syntetická data jsou trénovací materiál vyrobený modely: vypočítaná matematická řešení, kód s testy, variace dialogů. Kvalitního lidského textu je konečně, a tak špičkové laboratoře syntetická data hromadně generují a filtrují — sázejí na to, že pečlivá kurátorská práce odvrátí degradaci modelů krmících se sebou samými."
      },
      "verified": "2026-08-07",
      "source": "Synthetic-data pipelines; Epoch data estimates"
    },
    {
      "id": "lex-046",
      "slug": "overfitting",
      "term": "Overfitting",
      "category": "training",
      "en": {
        "short": "When a model memorizes its training data instead of learning the pattern — great on tests it has seen, lost on new ones",
        "full": "Overfitting is memorizing the training set instead of learning what generalizes: performance looks great on seen data and collapses on new data. It's the reason models are judged on held-out tests — and why a benchmark leaking into training data quietly invalidates the score."
      },
      "cs": {
        "short": "Když se model nabifluje trénovací data místo pochopení vzoru — skvělý na tom, co viděl, ztracený na novém",
        "full": "Overfitting znamená nabiflovat se trénovací sadu místo naučení toho, co zobecňuje: na viděných datech výsledky září, na nových se hroutí. Proto se modely posuzují na odložených testech — a proto benchmark proteklý do trénovacích dat potichu znehodnotí skóre."
      },
      "verified": "2026-08-07",
      "source": "Standard ML methodology"
    },
    {
      "id": "lex-047",
      "slug": "backpropagation",
      "term": "Backpropagation",
      "category": "training",
      "en": {
        "short": "The algorithm behind all neural-net learning: trace each error backward and nudge every weight",
        "full": "Backpropagation computes, for every weight in the network, how much it contributed to the current error — then nudges each one to reduce it. Repeated trillions of times, this is what 'training' physically is, essentially unchanged since 1986."
      },
      "cs": {
        "short": "Algoritmus, kterým se učí všechny neuronové sítě: chybu protrasuj zpět a posuň každou váhu",
        "full": "Backpropagation spočítá pro každou váhu v síti, jak moc přispěla k aktuální chybě — a každou pak posune tak, aby se chyba zmenšila. Zopakováno bilionkrát je tohle fyzická podstata 'tréninku', v jádru nezměněná od roku 1986."
      },
      "verified": "2026-08-07",
      "source": "Rumelhart, Hinton, Williams (1986)"
    },
    {
      "id": "lex-048",
      "slug": "mixture-of-experts",
      "term": "Mixture of experts",
      "category": "models",
      "en": {
        "short": "A model built of specialist sub-networks, waking only a few per token — huge capacity, modest cost",
        "full": "A mixture-of-experts model splits its layers into many 'experts' and routes each token to just a few of them, so only a fraction of the parameters compute at any moment. Total capacity can be enormous while per-token cost stays modest — the architecture behind many frontier and open flagship models."
      },
      "cs": {
        "short": "Model složený ze specializovaných podsítí, z nichž se pro každý token probudí jen pár — obří kapacita, mírná cena",
        "full": "Model mixture-of-experts rozdělí vrstvy na mnoho 'expertů' a každý token pošle jen několika z nich, takže v každém okamžiku počítá zlomek parametrů. Celková kapacita může být obrovská, zatímco cena za token zůstává mírná — architektura řady špičkových i otevřených vlajkových modelů."
      },
      "verified": "2026-08-07",
      "source": "MoE literature (Switch Transformer; Mixtral; DeepSeek)"
    },
    {
      "id": "lex-049",
      "slug": "diffusion-model",
      "term": "Diffusion model",
      "category": "models",
      "en": {
        "short": "The image generator that learns by destroying pictures with noise, then reversing the process",
        "full": "Diffusion models train by adding noise to images until only static remains — and learning to undo each step. Generation runs the reversal from pure noise, guided by your text prompt. Stable Diffusion, Midjourney and most video generators work this way."
      },
      "cs": {
        "short": "Generátor obrázků, který se učí ničením snímků šumem — a pak proces obrací",
        "full": "Difuzní modely se trénují přidáváním šumu do obrázků, dokud nezbude jen zrnění — a učí se každý krok vracet zpět. Generování pak spouští obrácený postup z čistého šumu, vedený vaším textovým zadáním. Takhle fungují Stable Diffusion, Midjourney i většina generátorů videa."
      },
      "verified": "2026-08-07",
      "source": "Ho et al., 2020; Stable Diffusion (2022)"
    },
    {
      "id": "lex-050",
      "slug": "red-teaming",
      "term": "Red teaming",
      "category": "safety",
      "en": {
        "short": "Paying people to attack your model before the internet does",
        "full": "Red teaming is adversarial testing: experts (and automated attackers) probe a model for harmful outputs, jailbreaks, bias and dangerous capabilities before and after release. Frontier labs run standing red teams and publish parts of the results in model cards — the AI equivalent of penetration testing."
      },
      "cs": {
        "short": "Platit lidi, aby váš model napadli dřív, než to udělá internet",
        "full": "Red teaming je nepřátelské testování: experti (i automatizovaní útočníci) zkoušejí z modelu dostat škodlivé výstupy, jailbreaky, předpojatost a nebezpečné schopnosti před vydáním i po něm. Špičkové laboratoře drží stálé red teamy a část výsledků zveřejňují v kartách modelů — obdoba penetračních testů v AI."
      },
      "verified": "2026-08-07",
      "source": "Model cards; red-team methodology papers"
    },
    {
      "id": "lex-051",
      "slug": "npu",
      "term": "NPU",
      "category": "hardware",
      "en": {
        "short": "The small AI chip inside your phone and laptop — models running locally, no cloud involved",
        "full": "A neural processing unit is a power-efficient AI accelerator built into phones and laptops. It runs smaller models on the device itself — transcription, photo magic, translation — with no server round-trip: faster, offline-capable, and private, since the data never leaves the machine."
      },
      "cs": {
        "short": "Malý AI čip v telefonu a notebooku — modely běží lokálně, bez cloudu",
        "full": "Neural processing unit je úsporný AI akcelerátor zabudovaný do telefonů a notebooků. Menší modely pouští přímo v zařízení — přepis řeči, úpravy fotek, překlad — bez cesty na server: rychleji, offline a soukromě, protože data stroj nikdy neopustí."
      },
      "verified": "2026-08-07",
      "source": "Apple/Qualcomm/Intel NPU documentation"
    },
    {
      "id": "lex-052",
      "slug": "data-center",
      "term": "Data center",
      "category": "hardware",
      "en": {
        "short": "The physical home of AI: warehouses of GPUs measured in megawatts, not square meters",
        "full": "AI lives in data centers — halls of racked GPUs with industrial power and cooling. New AI builds are described by power draw (hundreds of megawatts, gigawatts planned) because electricity, not floor space, is the limit; siting now revolves around grid capacity and cooling water."
      },
      "cs": {
        "short": "Fyzický domov AI: haly plné GPU, měřené v megawattech, ne v metrech čtverečních",
        "full": "AI bydlí v datacentrech — halách s racky GPU, průmyslovým napájením a chlazením. Nové AI stavby se popisují odběrem (stovky megawattů, v plánech gigawatty), protože limitem je elektřina, ne podlahová plocha; o umístění dnes rozhoduje kapacita sítě a chladicí voda."
      },
      "verified": "2026-08-07",
      "source": "IEA Energy and AI (2025); hyperscaler disclosures"
    },
    {
      "id": "lex-053",
      "slug": "token-pricing",
      "term": "Per-token pricing",
      "category": "economics",
      "en": {
        "short": "AI is billed like a utility: per million tokens in and out — output costing several times more",
        "full": "Model APIs charge per million tokens, with separate input and output rates — output typically costs several times more because generating is heavier than reading. Product margins live and die on token math: context length, caching and model choice are all pricing decisions."
      },
      "cs": {
        "short": "AI se účtuje jako energie: za milion tokenů na vstupu a výstupu — výstup je několikrát dražší",
        "full": "Modelová API účtují za milion tokenů, zvlášť vstup a výstup — výstup bývá několikanásobně dražší, protože generovat je náročnější než číst. Marže produktů stojí a padají s tokenovou matematikou: délka kontextu, cachování i volba modelu jsou cenová rozhodnutí."
      },
      "verified": "2026-08-07",
      "source": "Public provider price lists"
    },
    {
      "id": "lex-054",
      "slug": "compute",
      "term": "Compute",
      "category": "economics",
      "en": {
        "short": "Raw processing power — the strategic commodity of the AI era, measured in FLOPs and GPU-hours",
        "full": "'Compute' is the industry's word for processing power as a resource: FLOPs, GPU-hours, cluster time. It is the scarce input frontier progress runs on — allocated between training and inference, hoarded, export-controlled, and the reason 'GPU-rich' and 'GPU-poor' became real categories of company."
      },
      "cs": {
        "short": "Hrubý výpočetní výkon — strategická komodita éry AI, měřená ve FLOPech a GPU-hodinách",
        "full": "'Compute' je oborové slovo pro výpočetní výkon jako surovinu: FLOPy, GPU-hodiny, čas na clusteru. Je to vzácný vstup, na němž běží špičkový pokrok — dělí se mezi trénink a inferenci, hromadí se, podléhá exportním kontrolám a rozdělil firmy na reálné kategorie 'GPU-rich' a 'GPU-poor'."
      },
      "verified": "2026-08-07",
      "source": "Epoch AI; export-control coverage"
    },
    {
      "id": "lex-055",
      "slug": "wrapper",
      "term": "Wrapper",
      "category": "economics",
      "en": {
        "short": "An app that is mostly someone else's model underneath — dismissive nickname, sometimes great business",
        "full": "A 'wrapper' is a product whose core is a third-party model API plus interface and workflow. The term is dismissive — no moat, one price change from trouble — yet well-built wrappers with real distribution and domain depth have become substantial businesses. The insult and the opportunity are the same fact."
      },
      "cs": {
        "short": "Aplikace, která je uvnitř hlavně cizí model — posměšná nálepka, občas skvělý byznys",
        "full": "'Wrapper' je produkt, jehož jádrem je cizí modelové API plus rozhraní a workflow. Nálepka je posměšná — žádný příkop, jedna změna ceníku od potíží — ale dobře postavené wrappery se skutečnou distribucí a znalostí domény vyrostly v pořádné firmy. Urážka i příležitost jsou tentýž fakt."
      },
      "verified": "2026-08-07",
      "source": "AI product commentary, 2023-2025"
    },
    {
      "id": "lex-056",
      "slug": "moat",
      "term": "Moat",
      "category": "economics",
      "en": {
        "short": "What stops competitors from copying you — in AI, famously scarce ('we have no moat')",
        "full": "A moat is a durable competitive advantage. In AI the debate is what actually holds: models get copied and prices collapse, while data flywheels, distribution, switching costs and ecosystems (like CUDA) endure. A leaked 2023 Google memo — 'We have no moat, and neither does OpenAI' — named the anxiety."
      },
      "cs": {
        "short": "To, co konkurenci brání vás okopírovat — v AI proslule vzácné ('nemáme žádný příkop')",
        "full": "Moat (příkop) je trvalá konkurenční výhoda. V AI se vede spor, co skutečně drží: modely se kopírují a ceny hroutí, zatímco datové setrvačníky, distribuce, náklady na přechod a ekosystémy (jako CUDA) vydrží. Uniklé memo z Googlu z roku 2023 — 'Nemáme žádný příkop a OpenAI také ne' — dalo té úzkosti jméno."
      },
      "verified": "2026-08-07",
      "source": "Leaked Google memo, May 2023; strategy commentary"
    },
    {
      "id": "lex-057",
      "slug": "harness",
      "term": "Harness",
      "category": "agents",
      "en": {
        "short": "The software scaffolding around a model that turns it into a working agent — often worth more than model choice",
        "full": "A harness is everything wrapped around the model to make it effective: system prompts, tools, memory and context management, retries, guardrails, evaluation hooks. The same model performs wildly differently in different harnesses — much of 'agent quality' is harness engineering, not model choice."
      },
      "cs": {
        "short": "Softwarová konstrukce kolem modelu, která z něj dělá funkčního agenta — často důležitější než volba modelu",
        "full": "Harness (postroj) je vše obalené kolem modelu, aby fungoval: systémové prompty, nástroje, správa paměti a kontextu, opakované pokusy, zábrany, měřicí háčky. Tentýž model podává v různých harnessech divoce různé výkony — velká část 'kvality agenta' je inženýrství harnessu, ne volba modelu."
      },
      "verified": "2026-08-07",
      "source": "Agent engineering practice, 2023-2025"
    },
    {
      "id": "lex-058",
      "slug": "deepfake",
      "term": "Deepfake",
      "category": "safety",
      "en": {
        "short": "Synthetic audio or video of a real person — now cheap enough to fool banks, voters and families",
        "full": "A deepfake is AI-synthesized media of a real person doing or saying something they didn't. Once a research demo, now commodity fraud tooling: cloned voices for scam calls, fabricated executives on video conferences. Detection lags generation, so provenance and verification, not eyesight, are the defense."
      },
      "cs": {
        "short": "Syntetické audio nebo video skutečného člověka — už dost levné, aby klamalo banky, voliče i rodiny",
        "full": "Deepfake je AI syntéza médií, v níž skutečný člověk dělá nebo říká, co nikdy neřekl. Z výzkumného dema je běžný podvodný nástroj: klonované hlasy pro podvodné hovory, falešní manažeři na videokonferencích. Detekce zaostává za generováním — obranou je původ a ověřování, ne oko."
      },
      "verified": "2026-08-07",
      "source": "Deepfake fraud case coverage, 2019-2025"
    },
    {
      "id": "lex-059",
      "slug": "ai-slop",
      "term": "AI slop",
      "category": "safety",
      "en": {
        "short": "The flood of low-effort machine-generated content clogging the web — the pollution problem of generative AI",
        "full": "'Slop' is careless mass-produced AI content: filler articles, fake photos, spam books, bot comments. It pollutes search results and social feeds and — by contaminating future training data — the models themselves. The word became mainstream in 2024 as the web's new litter."
      },
      "cs": {
        "short": "Záplava lacino generovaného obsahu ucpávající web — problém znečištění generativní AI",
        "full": "'Slop' je bezstarostně chrlený AI obsah: vycpávkové články, falešné fotky, spamové knihy, robotické komentáře. Znečišťuje vyhledávání a sociální sítě a — kontaminací budoucích trénovacích dat — i samotné modely. Slovo v roce 2024 zdomácnělo jako název pro nový odpad webu."
      },
      "verified": "2026-08-07",
      "source": "Slop discourse, 2024-2025"
    },
    {
      "id": "lex-060",
      "slug": "agi",
      "term": "AGI",
      "category": "models",
      "en": {
        "short": "Artificial general intelligence: AI matching humans across most cognitive work — definition contested, stakes not",
        "full": "AGI means AI that matches or exceeds human ability across most cognitive work, not just single tasks. There is no agreed definition or test — one lab's charter milestone is another's marketing term — yet it anchors the field's biggest investments, timelines and safety debates. The dictionary's last entry is the field's open question."
      },
      "cs": {
        "short": "Obecná umělá inteligence: AI na lidské úrovni ve většině duševní práce — definice sporná, sázky ne",
        "full": "AGI označuje AI, která se vyrovná člověku nebo ho předčí ve většině duševní práce, ne jen v jednotlivých úlohách. Shodná definice ani test neexistují — co je pro jednu laboratoř milník charty, je pro druhou marketing — přesto AGI kotví největší investice, odhady i bezpečnostní debaty oboru. Poslední heslo slovníčku je otevřená otázka oboru."
      },
      "verified": "2026-08-07",
      "source": "Lab charters and AGI definitions debate"
    }
  ]
}
```

---

*End of specification. Implement exactly this; where the repo contradicts an assumption, the repo and its control documents win and the deviation goes in your final report.*
