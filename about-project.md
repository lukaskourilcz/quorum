# O projektu BoardlessAI

BoardlessAI je transparentní operační systém pro firmu řízenou omezenou radou
AI rolí. Spojuje deterministické rozhodovací a finanční guardraily, evidence
pipeline, experimenty, veřejný web, auditovatelný git-backed stav a volitelnou
automatizaci sociálních sítí.

Aktuální stav (od 2026-07-28): **hobby / non-commercial mode**. Implementace
je hotová, web běží na Vercelu (`https://quorum-site-chi.vercel.app`), ale
projekt je z rozhodnutí vlastníka trvale osobní explorací, ne založeným
venture. Fáze `DISCOVERY` zůstává zamčená; obsah obsahuje jen viditelně
označená fixture data a `EVIDENCE.jsonl` se nesmí měnit na reálná tvrzení.

## Architektura

```text
GitHub Actions / lokální CLI
            │
            ▼
  TypeScript orchestrátor
  ├─ budget a treasury gates
  ├─ evidence a opportunity gate
  ├─ Boardroom routing a consensus
  ├─ experimenty, metriky a finance
  ├─ guarded patch/network/content security
  └─ draft-first social publisher
            │
            ▼
       state/ v Gitu
  ├─ interní kanonický stav
  └─ sanitizované veřejné projekce
            │
            ▼
       Next.js web
  ├─ veřejné stránky, feedy a sitemap
  └─ fail-closed chráněný admin
```

Systém má čtyři hlasující council agenty (`VIZE`, `FORGE`, `PULSE`, `AUDIT`) a
deset směrovaných specialistů. Canonical registry všech 14 rolí je v
`config/agents.json`.

## Základní technologický stack

| Oblast | Technologie | Verze / režim |
| --- | --- | --- |
| Runtime | Node.js | `>=22` |
| Monorepo | pnpm workspaces | pnpm `10.30.0` |
| Jazyk | TypeScript | `5.9.3`, strict |
| Web framework | Next.js App Router | `16.2.11` |
| UI runtime | React / React DOM | `19.2.8` |
| Styling | Tailwind CSS | `4.3.3` |
| Test runner | Vitest | `4.1.10` |
| Lint | ESLint + eslint-config-next | `9.39.5` / `16.2.11` |
| CI/CD | GitHub Actions | pinned action SHAs |
| Stav | JSON, JSONL a Markdown v Gitu | atomické zápisy a file lock |
| AI providers | OpenAI API, Anthropic API | pouze přes guarded adaptéry |
| Sociální API | Meta Threads, Instagram Graph API | výchozí režim `draft` |
| Obrázky | WebP + Sharp | `sharp 0.35.3` |

Verze jsou připnuté v `package.json`, workspace manifestech a
`pnpm-lock.yaml`.

## Přímé knihovny webu

| Knihovna | Verze | Použití |
| --- | ---: | --- |
| `next` | `16.2.11` | App Router, SSG/SSR, metadata, feedy a Proxy |
| `react`, `react-dom` | `19.2.8` | Komponentový runtime |
| `class-variance-authority` | `0.7.1` | Typované varianty UI komponent |
| `clsx` | `2.1.1` | Podmíněné skládání tříd |
| `tailwind-merge` | `3.6.0` | Bezpečné slučování Tailwind tříd |
| `lucide-react` | `1.26.0` | Ikony |
| `server-only` | `0.0.1` | Ochrana serverového admin readeru |
| `tailwindcss` | `4.3.3` | Token-based responzivní design |

Vizuální systém používá DM Sans, zinc/white paletu a Ember akcent. Kanonické
hodnoty jsou v `site/src/brand/tokens.css`; komponenty je nesmí obcházet
hardcoded barvami.

## Přímé knihovny orchestrátoru

| Knihovna | Verze | Použití |
| --- | ---: | --- |
| `openai` | `6.48.0` | OpenAI council/specialist adaptéry |
| `@anthropic-ai/sdk` | `0.113.0` | Anthropic council/specialist adaptéry |
| `zod` | `4.4.3` | Runtime validace všech důležitých kontraktů |
| `fast-xml-parser` | `5.10.1` | Bezpečné zpracování RSS/XML zdrojů |
| `sharp` | `0.35.3` | Kontrola a kompozice obrazových assetů |
| `tsx` | `4.23.1` | Spouštění TypeScript CLI |

## Struktura repozitáře

```text
config/                    modely, role, routing, stages a politiky
orchestrator/
  prompts/                 smlouvy council a specialistů
  src/                     runtime, guardraily a adaptéry
  tests/                   deterministické a end-to-end testy
site/
  src/app/                 veřejné a admin routy
  src/components/          sdílené komponenty
  src/brand/               tokeny a SVG identita
  public/agents/           14 stabilních WebP portrétů
state/                     kanonický provozní stav a veřejné projekce
.claude/                   role, příkazy a provozní skills pro Claude
.agents/skills/            byte-identické Codex varianty skills
.github/workflows/         CI, cykly, social publisher a health check
scripts/                   produkční smoke crawler
```

## Orchestrátor a governance

- Každý cyklus má předem spočítaný worst-case rozpočet.
- Rada používá anonymní návrhy, Borda ranking, `NO_ACTION`, konkrétní veto a
  opakovanou kontrolu fallback návrhu.
- Routing přibírá jen relevantní specialisty a povinné kontrolní role.
- Fáze jsou `DISCOVERY`, `VALIDATION`, `AUDIENCE`, `MONETIZATION` a
  `OPTIMIZATION`.
- Fixture evidence nikdy nemůže založit skutečný venture.
- Externí obsah je považován za nedůvěryhodná data, ne za instrukce.
- Síťové požadavky jsou HTTPS-only, omezené allowlistem, velikostí odpovědi a
  kontrolou redirectů.
- Generované patche mají path, secret, dependency, environment, network a
  dynamic-code kontroly.
- Organizace agentů se nemůže sama nekontrolovaně přepisovat.

## Data a persistence

Kanonický stav je uložen v `state/` jako reviewovatelný Git obsah. Citlivé
interní záznamy se veřejnému webu neposkytují; web smí číst jen fixture data
nebo sanitizované veřejné projekce.

Zápisy runtime používají:

- Zod validaci schémat;
- dočasný soubor a atomický rename;
- file lock proti souběžnému writeru;
- idempotency klíče a reconciliation;
- jeden normální git commit na úspěšný runtime cyklus.

Tento model je vhodný pro nízkou frekvenci a auditovatelnost. Limity a cesta ke
škálování jsou popsané v `scaling.md`.

## Veřejný web

Web obsahuje:

- firemní homepage a vysvětlení governance;
- seznam a detail všech 14 agentů;
- Boardroom, metrics, log, standupy a venture routy;
- privacy a AI disclosure;
- RSS, JSON Feed, sitemap, robots a web manifest;
- dynamický admin chráněný Basic Auth.

Fixture venture a standup detail jsou `noindex` a nejsou zahrnuté ve feedech
ani sitemapě.

## Admin a bezpečnost webu

- Bez kompletního `ADMIN_USER` + `ADMIN_PASSWORD` vrací admin `503`.
- Bez správného Basic Auth vrací `401`.
- Porovnání credentialů je constant-time.
- Pokusy jsou lokálně rate-limitované.
- Admin má `no-store` a `noindex`.
- CSP blokuje cizí zdroje, framing, objekty, kamery, mikrofon, geolokaci a
  payment API.
- Serverový state reader má explicitní allowlist souborů.

Basic Auth je záměrně malý výchozí mechanismus. Při více administrátorech nebo
citlivějších datech má být nahrazen identity-aware proxy/SSO s MFA a audit logem.

## Sociální publisher

Threads a Instagram začínají v `draft` režimu bez scopes a bez data lidského
schválení. Publikace vyžaduje:

1. schema-valid queue item;
2. výběr agentem PULSE;
3. všech osm kontrol ve stavu `pass`;
4. immutable `contentHash`;
5. publikaci uvnitř schváleného okna;
6. human-enabled kanál, scope a credential;
7. dvoufázový claim před externím API requestem.

Nejasný výsledek se označí `needs_reconciliation` a automaticky se neopakuje.

## Automatizace

| Workflow | Účel |
| --- | --- |
| `CI` | agent assets, lint, typecheck, testy, build a route/link smoke |
| `Guarded council cycle` | cykly v 07:30 a 19:30 Europe/Prague |
| `Guarded social publisher` | validace nebo publikace schválené fronty |
| `Production health` | HTTPS kontrola veřejných endpointů |

GitHub Actions jsou časově omezené, mají concurrency guardy a používají
zamčené dependency instalace. Chybějící AI credentials vynutí dry režim.

## Vývoj a ověření

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm agents:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Další důležité příkazy:

```bash
pnpm cycle -- --phase founding --dry --explain-budget --explain-routing
pnpm social:publish -- --dry-if-disabled --validate-only
pnpm site:smoke
```

Dry cyklus zapisuje pouze do ignorovaného `tmp/dry-run/state/`.

## Aktuální omezení

- Název: kolizní riziko vědomě přijato pod hobby módem; komerční launch by
  vyžadoval znovuotevření rozhodnutí
  (`state/brand-clearance/2026-07-28.md`).
- Neexistuje validovaný venture ani skutečný experiment — a v hobby módu
  ani nebude.
- Hosting: Vercel `quorum-site`, doména `quorum-site-chi.vercel.app`.
- AI credentials: nastaveny jako GitHub secrets 2026-07-28 (dev klíče jsou
  v gitignored `.env`); analytics, revenue a sociální credentials
  nepřipojené.
- Git-backed persistence předpokládá jediného writera.
- Admin nepodporuje více uživatelů, obnovu hesla ani SSO.
- Ceny a platformní API kontrakty je nutné před aktivací znovu ověřit.

Konkrétní kroky vlastníka jsou v `NEEDED.md` a `MANUAL STEPS.md`; finance
a škálování v `scaling.md`.
