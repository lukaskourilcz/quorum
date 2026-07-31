# O projektu BoardlessAI

BoardlessAI je auditovatelný operační systém pro portfolio řízené omezenou radou
AI rolí. Spojuje deterministické rozpočtové a bezpečnostní guardraily,
evidence pipeline, veřejný web, chráněný admin a kanonický stav uložený v Gitu.

Aktuální stav: **operating, pre-revenue, VALIDATION**. Web běží na Vercel Pro na
<https://quorum-site-chi.vercel.app>. Caught Up je Venture 001. Titty Tuesdays
je připravené jako pre-commerce Venture 002 a čeká na podpis vlastníka.
Magazine Incubator zůstává pouze výzkumný a nesmí sám založit nový produkt.

## Architektura

```text
GitHub Actions / lokální CLI
            │
            ▼
  TypeScript orchestrátor
  ├─ portfolio registry a routing
  ├─ budget, evidence a authority gates
  ├─ Caught Up, Titty Tuesdays a incubator rooms
  ├─ taste, ratings a venture ledgers
  └─ daily digest + draft-only social publisher
            │
            ▼
       state/ v Gitu
  ├─ interní kanonický stav
  └─ sanitizované veřejné projekce
            │
            ▼
       Next.js web
  ├─ veřejné stránky, feedy a osmislotový WeekBoard
  └─ fail-closed chráněný portfolio admin
```

Systém má čtyři hlasující agenty (`VIZE`, `FORGE`, `PULSE`, `AUDIT`) a 23
směrovaných specialistů. Registr všech 27 rolí je v `config/agents.json`.
Portfolio a jeho meetingy definuje `config/ventures.json`. Lidský popis modelu
je v `docs/PORTFOLIO.md`.

## Technologický stack

| Oblast | Technologie | Verze / režim |
| --- | --- | --- |
| Runtime | Node.js | `>=22` |
| Monorepo | pnpm workspaces | pnpm `10.30.0` |
| Jazyk | TypeScript | `5.9.3`, strict |
| Web | Next.js App Router | `16.2.11` |
| UI | React / React DOM | `19.2.8` |
| Styling | Tailwind CSS | `4.3.3` |
| Validace | Zod | `4.4.3` |
| Testy | Vitest + Playwright + axe | `4.1.10` + `1.62.0` |
| AI providers | OpenAI API, Anthropic API | pouze guarded adaptéry |
| Stav | JSON, JSONL a Markdown v Gitu | validace, atomické zápisy, serializace |
| CI/CD | GitHub Actions + Vercel Pro | pinned SHA, auto-deploy z `main` |

Web dále používá `class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react` a `server-only`. Orchestrátor používá OpenAI a Anthropic SDK,
`fast-xml-parser`, `sharp` a `tsx`. Přesné verze jsou zamčené v manifestech a
`pnpm-lock.yaml`.

## Portfolio a provoz

- **Caught Up** připravuje anglický a český článek, produktové rozhodnutí a oba
  jazykové balíčky pro Instagram a Threads. GitHub App smí zapisovat jen do
  `lukaskourilcz/aifirst`.
- **Titty Tuesdays** spravuje brand, 91denní season koncepty, publika a
  marketingové plány. Nemá eshop, sklad, platby, reklamy ani live publishing.
- **Magazine Incubator** smí vytvořit jen evidencí podložené niche proposals.
  Owner rating `Perfect` je přesune na shortlist, ale nezaloží venture.

PALATE před první schůzkou venture destiluje pouze preference citované na
konkrétní ratingy. Rating poznámky jsou nedůvěryhodná data, ne instrukce.

Společný Prague clock má sloty 05:00, 06:00, 07:00, 11:00, 14:00, 17:00,
21:00 a 22:00. Registry odmítá kolize pod 60 minut. GitHub Actions mají letní a
zimní UTC variantu; runtime neaktivní DST variantu přeskočí.

Rozhodnutí `budget-2026-08` používá do podpisu Shape B: `$15` měsíčně,
`$0.70` denně, TT `$0.06` a bez incubator synthesis. Podepsaná Shape A povolí
`$18`, `$1.00` a všech osm slotů. Hard cap `$20` a platby pouze člověkem se
nemění.

## Data, admin a bezpečnost

Kanonický stav je ve `state/`. Venture ideas, ratings, taste a plány jsou
namespaced. Veřejný web používá jen defensivně znovu validované projekce.
Externí text i owner notes jsou data-only. Číselná tvrzení potřebují evidence
reference.

`/admin` vrací `503`, pokud nejsou kompletní `ADMIN_USER` a `ADMIN_PASSWORD`, a
`401` při chybné autentizaci. Úspěšné přihlášené requesty se nepočítají do
limitu chybných pokusů. Produkční ratingy se zapisují přes fine-grained
`BOARDLESSAI_GITHUB_TOKEN`; bez něj write path selže zavřeně.

Admin obsahuje globální social archive, per-venture tabs, karty, historii
ratingů, incubator shortlist a print-ready TT launch binder. Neumí publikovat ani
vytvořit obchod.

## Vývoj a ověření

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm agents:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @boardlessai/site test:e2e
```

Dry cykly zapisují jen do ignorovaných temp adresářů. `pnpm site:smoke`
kontroluje produkční routy a interní odkazy proti spuštěnému buildu.

## Aktuální omezení

- BoardlessAI má otevřené kolizní riziko názvu před placeným sponzoringem.
- TT founding, budget shape a cron go-live čekají na vlastníka.
- Produkční admin, rating persistence, Caught Up delivery, denní e-mail digest a
  live proměnné vyžadují ruční kroky v `NEEDED.md`.
- Social output je draft-only. Čtyřsnímkový Instagram carousel současný
  connector neumí publikovat jako jednu transakci.
- Neexistuje live experiment, eshop, platba, sklad, reklama ani automatické
  založení venture.
- Git-backed persistence předpokládá jednoho serializovaného writera.

Konkrétní ruční kroky jsou v `NEEDED.md` a `MANUAL STEPS.md`; financování ve
`scaling.md`, možné příjmy v `monetization.md`.
