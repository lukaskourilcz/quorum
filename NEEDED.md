# Co je potřeba udělat ze strany vlastníka

BoardlessAI je od 2026-08-01 v režimu `operating (pre-revenue)` a Caught Up je
Venture 001 z rozhodnutí vlastníka. Zakládací gate zůstává nesplněný. Níže jsou
blokátory integrace a zachovaný provozní checklist.

> Nikdy nevkládejte tokeny, hesla nebo API klíče do repozitáře. Patří pouze do
> GitHub Secrets nebo do secret store zvoleného hostingu.

## Caught Up integration

- [ ] **Create GitHub App "boardlessai-delivery"** — install on `aifirst` only,
  `contents: write`; store `DELIVERY_APP_ID` + `DELIVERY_APP_PRIVATE_KEY` in quorum
  Actions secrets. [imp:5] [owner:me] [time:30m] [kind:setup]
- [ ] **Resend account + domain** — the official free tier was verified on
  2026-07-31 at 3,000 emails/month and 100/day, covering one recipient at the
  expected ~150/month. Verify the sending domain and its SPF/DKIM records; create
  a sending-only key in the GitHub secret `RESEND_API_KEY`; store recipients in
  the secret `MEETING_EMAIL_TO`; then set repository variables
  `MEETING_EMAIL_MODE=resend`, `MEETING_EMAIL_FROM=meetings@<domain>`,
  `RESEND_FREE_TIER_MONTHLY=3000`, and `RESEND_FREE_TIER_DAILY=100`.
  Source: <https://resend.com/pricing>. [imp:4] [owner:me] [time:45m]
  [kind:setup]
- [ ] **Approve budget changes** — `MONTHLY_BUDGET_USD` 12→15, `DAILY_BUDGET_USD`
  0.40→0.70, two new envelopes; countersign in the adoption decision record. [imp:5]
  [owner:me] [time:5m] [kind:decision]
- [ ] **Migrate source API keys to quorum secrets** — GUARDIAN, NYTIMES, GNEWS,
  STACKEXCHANGE, FIRECRAWL/JINA (or drop those sources; they self-skip). [imp:3]
  [owner:me] [time:20m] [kind:setup]
- [ ] **Supply the Caught Up production domain** — set the quorum repository
  variable `CAUGHT_UP_SITE_URL` to its canonical HTTPS base URL and add its host
  to `config/network-allowlist.json` for RELAY's live check, edition email links,
  and evidence-linked social drafts. [imp:4] [owner:me] [time:5m] [kind:setup]
- [ ] **Sign the brand-clearance revisit** — acknowledge BoardlessAI collision risk
  now that scope is commercial-adjacent; confirm the rename-or-clear gate before any
  paid sponsorship. [imp:4] [owner:me] [time:20m] [kind:legal]
- [ ] **Run a Caught Up name check** — the product brand now carries the public
  identity; verify no blocking collision. [imp:3] [owner:me] [time:30m] [kind:legal]
- [x] **Confirm compliant hosting before revenue** — owner confirmed existing
  Vercel Pro coverage on 2026-07-31. Reopen the cap decision if either project
  leaves Pro or invoice allocation changes. [imp:4] [owner:me] [time:15m]
  [kind:decision]
- [x] **No billable avatar spend required** — six portraits and two QA repairs
  used the built-in session image tool. Actual project API cost remains unknown,
  not fabricated; the API-equivalent estimate is $1.70172 within the specified
  $1.80 envelope. [imp:2] [owner:me] [time:5m] [kind:decision]
- [ ] **Approve go-live of the two new cron phases** — flip after phase 9 review.
  Set the quorum repository variable `CAUGHT_UP_LIVE_ENABLED=true` only after the
  delivery App secrets are present; the workflow otherwise fails closed to dry mode.
  [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Review first three delivered editions + first social packs in the queue** —
  quality gate before considering any channel unlock, which stays a separate future
  HUMAN_APPROVAL. [imp:4] [owner:me] [time:60m] [kind:content]
- [ ] **Verify assumed external facts** — Resend's 3,000/month and 100/day free
  tier was verified on 2026-07-31. ⚠ VERIFY model prices vs `prices.ts`, Threads
  carousel API limits, Instagram carousel limits, and gpt-image-2 per-image cost
  ≤ $0.30. [imp:3] [owner:me] [time:30m] [kind:setup]

## P0 — blokátory před veřejným spuštěním

Vyřešeno 2026-07-28 rozhodnutím vlastníka o **hobby / non-commercial** módu
(viz `state/BUSINESS.md` → Project mode). Původní úkoly ponechány jako
historický záznam:

- [x] **Vyřešit název BoardlessAI.** Vlastník vědomě přijal kolizní riziko `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
  pod hobby módem. Podklady: `state/brand-clearance/2026-07-28.md`.
- [x] **Rozhodnout o licenci.** MIT — přidán `LICENSE` soubor, `package.json` `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  aktualizován.
- [x] **Určit provozovatele projektu.** Fyzická osoba — Lukas Kouril. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [x] **Schválit skutečný měsíční rozpočet.** $20/měsíc přijat. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [x] **Určit člověka pro incidenty a schvalování.** Lukas Kouril `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  (single-operator setup).

## Projekt je od 27. 7. 2026 veřejně vidět v portfoliu

BoardlessAI je nově uvedený mezi projekty na lukaskouril.dev, včetně animovaného
náhledu nahraného ze spuštěného webu. Portfolio popisuje stav pravdivě:
web běží na označených historických datech a Caught Up je owner-adopted Venture
001 ve fázi VALIDATION.

- [x] **Rozhodnout o názvu dřív, než ho portfolio ponese dát dál.** Riziko `[imp:4]` `[owner:me]` `[time:1h]` `[kind:legal]`
  vědomě přijato pod hobby módem 2026-07-28. Portfolio karta může nést `BoardlessAI`.
- [ ] **Dodat veřejnou URL webu, pokud má karta v portfoliu odkazovat.** Repozitář žádnou nasazenou adresu neobsahuje (`PUBLIC_SITE_URL` je jen proměnná prostředí), takže položka v portfoliu je zatím bez odkazu. `[imp:2]` `[owner:me]` `[time:15m]` `[kind:decision]`
- [ ] **Po každém výrazném redesignu webu nahrát náhled znovu.** Postup je v `.claude/skills/preview-video/SKILL.md`; hotové soubory patří do `nxt-portfolio/public/previews/quorum/`. `[imp:2]` `[owner:ai]` `[time:30m]` `[kind:content]`

## P1 — GitHub a bezpečnost repozitáře

- [-] Branch protection ruleset pro `main` — vyžaduje GitHub Pro na privátním `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  repu; pro hobby SKIP.
- [x] Dependabot alerts a automated security fixes zapnuty 2026-07-28. Secret `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  scanning / push protection nedostupné bez GHAS.
- [x] Actions permissions omezeny (`read` + zákaz PR approve). Ruční kontrola `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  Collaborators a Apps zbývá.
- [x] Repository variables nastaveny: `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  `AUTONOMY_KILL_SWITCH=false` po schválení tří směn 2026-07-30;
  `SOCIAL_KILL_SWITCH=true`.
- [x] `HEALTH_CHECK_ENABLED=false` nastaveno 2026-07-28. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`

## P1 — AI poskytovatelé

- [ ] Nastavit billing limity u OpenAI a Anthropic (dashboardy). `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [x] GitHub secrets `OPENAI_API_KEY` a `ANTHROPIC_API_KEY` vloženy 2026-07-28. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] **Rotovat oba klíče** — pastnuty do transkriptu, leak surface. `[imp:5]` `[owner:me]` `[time:15m]` `[kind:setup]`
- [ ] Ověřit modely a ceny v `config/models.json` a `orchestrator/src/llm/prices.ts` `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  před prvním živým cyklem.
- [ ] `dry=true` napřed, pak jeden ohraničený živý běh. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [x] `API-CREDENTIALS-001` v `state/INBOX.md` vyřešeno 2026-07-28. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`

Bez obou klíčů se plánované cykly bezpečně přepnou do dry režimu.

## P1 — hosting a doména

- [x] Hosting: Vercel. Doména: `quorum-site-chi.vercel.app`. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [x] Vercel projekt `quorum-site` s `main` jako production branch. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] Nastavit produkční environment variables ve Vercel dashboardu: `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]` `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`

| Proměnná | Povinná | Účel |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | ano | Kanonická HTTPS URL, feedy, sitemap, health check a Instagram media |
| `ADMIN_USER` | ano pro admin | Uživatelské jméno Basic Auth |
| `ADMIN_PASSWORD` | ano pro admin | Dlouhé unikátní heslo uložené pouze jako secret |
| `BOARDLESSAI_REPO_ROOT` | dle hostingu | Absolutní kořen repozitáře pro serverový admin reader, pokud jej runtime neurčí správně |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | pouze při chráněném preview | Bypass ochrany automatizačních kontrol |

- [ ] Ověřit, že: `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  - `/`, `/standups`, `/feed.json` a `/robots.txt` vrací `200`;
  - `/admin` bez údajů vrací `401`, se správnými údaji `200`;
  - neúplná konfigurace admina vrací `503`;
  - produkční URL používá HTTPS;
  - fixture venture a standup nejsou v sitemapě ani feedech.
- [ ] Uložit `PUBLIC_SITE_URL` také jako GitHub secret a teprve potom nastavit `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  repository variable `HEALTH_CHECK_ENABLED=true`.
- [ ] Nastavit monitoring dostupnosti a kontakt pro alerty. GitHub health `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  workflow je základní kontrola, nikoliv plná observabilita.
- [ ] Ověřit zálohu a rollback posledního známého dobrého deploymentu. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`

## P1 — právní a provozní minimum

- [ ] Nechat zkontrolovat privacy text a doplnit skutečné identifikační a `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  kontaktní údaje provozovatele.
- [ ] Před sběrem analytiky, e-mailů nebo jiných osobních údajů zpracovat `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  právní základ, retenční pravidla, DPA se zpracovateli a případný consent
  mechanismus.
- [ ] Před placenou nabídkou doplnit obchodní podmínky, reklamační/refund `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  proces, fakturaci a daňové zacházení.
- [ ] Vytvořit reálný incident-response kontakt a proces pro žádosti subjektů `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  údajů.
- [ ] Zkontrolovat povinná AI a komerční sdělení pro cílové země. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`

## P2 — skutečné založení venture

**Neaktivní pro Venture 001.** Caught Up přijal vlastník mimo founding gate.
`FIX-*` záznamy zůstávají fixture a nesmí být použity jako obchodní důkaz.
Živý `founding` cyklus zůstává zakázaný.

- [-] Dodat nebo schválit zdroje pro skutečný market research. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [-] Získat minimálně tři nezávislé reálné důkazní položky. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [-] Získat alespoň jeden přímý signál problému nebo nákupního záměru. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [-] Popsat dosažitelný distribuční kanál. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [-] Definovat první omezený experiment včetně baseline, targetu, maximální `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  ceny, maximální ztráty a stop condition.
- [-] Nechat deterministický DISCOVERY gate potvrdit skóre alespoň `35/50` a `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  žádnou dimenzi pod `2`.

## P2 — analytika, tržby a platby

- [ ] Vybrat privacy-respecting analytiku a přesně definovat: `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  `qualified_visit`, `value_action`, `opt_in`, `monetization_intent` a
  konverzní okna.
- [ ] Připojit analytiku až po právní kontrole a doplnit ji do CSP a network `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  allowlistu samostatným review.
- [ ] Vybrat platební nebo fakturační systém až po validaci nabídky. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
- [ ] Zavést ověřitelný zdroj tržeb, refundů a payment fees. Do první `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  přijaté platby zůstává recognized revenue na měřených `$0`; neznámé fee a
  refund údaje zůstávají `unavailable`.
- [ ] Nastavit účetní export a měsíční reconciliation proti `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  `state/finance/ledger.json` a `state/treasury/ledger.json`.
- [ ] Každý externí výdaj provádí člověk až po položce `HUMAN_APPROVAL` nebo `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  `SPEND`; agent nesmí držet platební údaje ani sám provést platbu.

## P2 — Threads a Instagram, pouze pokud je chcete používat

- [ ] Založit a zabezpečit firemní Meta účty; zapnout 2FA a určit vlastníka. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] Nechat schválit konkrétní OAuth scopes a aktuální podmínky platforem. `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
- [ ] Nastavit GitHub variables: `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  - `META_GRAPH_API_VERSION`;
  - `META_THREADS_USER_ID`;
  - `META_INSTAGRAM_IG_USER_ID`.
- [ ] Nastavit GitHub secrets: `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
  - `META_THREADS_ACCESS_TOKEN`;
  - `META_INSTAGRAM_ACCESS_TOKEN`;
  - `PUBLIC_SITE_URL`.
- [ ] V samostatném review doplnit přesně schválené scopes a `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
  `enabledByHumanAt` do `config/channels.json`.
- [ ] Nejprve použít `workflow_dispatch` s `validate_only=true`. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] Teprve po ověření přepnout konkrétní kanál z `draft` na `autopublish`. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`

Nejasný výsledek publikace skončí v `needs_reconciliation` a vyžaduje ruční
kontrolu. Odpovědi, reklamy, mazání a opravy nejsou součástí běžného
autopublishing scope.

## Volitelné integrace

- [ ] `PRODUCTHUNT_TOKEN` nastavovat pouze při existenci schváleného Product `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  Hunt procesu; současný runtime jej aktivně nepoužívá.
- [ ] `MEDIA_PROVIDER` a `MEDIA_MODEL` jsou rezervované konfigurační body; `[imp:3]` `[owner:me]` `[time:1h]` `[kind:content]`
  nenastavovat je bez implementovaného a otestovaného provider adapteru.
- [ ] Reddit nebo jiný autentizovaný zdroj přidat jen s aktuálními podmínkami, `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
  schváleným účtem a rozšířením network allowlistu.

## Finální go-live acceptance

- [ ] Brand clearance vyřešen. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] `main` chráněný a CI zelené. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
- [ ] Produkční build je vytvořen z konkrétního commitu. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
- [ ] Secrets nejsou v git historii. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [ ] Rozpočet a provider billing limity jsou nastavené. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [ ] Admin a veřejné security headers jsou ověřené. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
- [ ] Právní texty odpovídají skutečnému provozu. `[imp:3]` `[owner:me]` `[time:2h]` `[kind:legal]`
- [ ] Kill switche a rollback byly prakticky vyzkoušené. `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
- [ ] Žádné fixture tvrzení není prezentované jako reálný výsledek. `[imp:3]` `[owner:me]` `[time:20m]` `[kind:setup]`
- [x] Vlastník projektu výslovně schválil živé směny 2026-07-30. `[imp:3]` `[owner:me]` `[time:30m]` `[kind:decision]`
- [ ] **Zapnout Vercel Web Analytics pro tento projekt** — v projektu na Vercelu zapni Web Analytics, aby OwnDashboard v přehledu projektu ukazoval návštěvníky a zobrazení stránek (načítá je přes Vercel API podle tohoto repozitáře). `[imp:2]` `[owner:me]` `[time:15m]` `[kind:setup]`
- [ ] **Hlásit GitHub Actions crony do OwnDashboardu** — do repository Actions secrets přidej `OWNDASHBOARD_CRON_URL` (URL na `/api/crons/log` v OwnDashboardu) a `OWNDASHBOARD_CRON_TOKEN` (stejná hodnota jako `CRON_REGISTRY_TOKEN` v OwnDashboardu), aby se běhy plánovaných workflow objevily v panelu Crony. `[imp:2]` `[owner:me]` `[time:10m]` `[kind:setup]`
