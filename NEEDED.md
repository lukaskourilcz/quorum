# Co je potřeba udělat ze strany vlastníka

Tento dokument je praktický checklist pro přechod z bezpečného lokálního
prototypu do reálného provozu. Aktuálně je projekt ve fázi `DISCOVERY`, nemá
ověřený podnikatelský záměr, připojené tržby ani produkční deployment.

> Nikdy nevkládejte tokeny, hesla nebo API klíče do repozitáře. Patří pouze do
> GitHub Secrets nebo do secret store zvoleného hostingu.

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
implementace hotová, venture nezaložený, web běží na označených fixture datech.

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

**Neaktivní** v hobby módu (viz `state/BUSINESS.md` → Project mode). Sekce se
znovu otevře pouze při reklasifikaci projektu na komerční. `FIX-*` záznamy
zůstávají fixture a nesmí být použity jako obchodní důkaz.

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
- [ ] Zavést ověřitelný zdroj tržeb, refundů a payment fees. Dokud není `[imp:3]` `[owner:me]` `[time:1h]` `[kind:deploy]`
  připojen, musí zůstat revenue a gross profit `n/a`, nikoliv nula.
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
