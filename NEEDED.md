# Co je potřeba udělat ze strany vlastníka

Tento dokument je praktický checklist pro přechod z bezpečného lokálního
prototypu do reálného provozu. Aktuálně je projekt ve fázi `DISCOVERY`, nemá
ověřený podnikatelský záměr, připojené tržby ani produkční deployment.

> Nikdy nevkládejte tokeny, hesla nebo API klíče do repozitáře. Patří pouze do
> GitHub Secrets nebo do secret store zvoleného hostingu.

## P0 — blokátory před veřejným spuštěním

- [ ] **Vyřešit název BoardlessAI.** Současný název má vysoké kolizní riziko.
  Nechte provést právní rešerši a buď výslovně schvalte použití názvu, nebo
  autorizujte přejmenování. Podklady jsou v
  `state/brand-clearance/2026-07-23.md`.
- [ ] **Rozhodnout o licenci.** Repozitář je nyní `UNLICENSED`. Před sdílením
  zdrojového kódu mimo soukromý tým zvolte licenci nebo ponechte výslovně
  proprietární režim.
- [ ] **Určit provozovatele projektu.** Rozhodněte, zda bude provozovatelem
  fyzická osoba, OSVČ, nebo právnická osoba. Podle toho nastavte fakturaci,
  účetnictví, daně a vlastnictví domén a účtů.
- [ ] **Schválit skutečný měsíční rozpočet.** Výchozí hard cap je `$20/měsíc`.
  Navýšení musí být vědomé, financované a provedené jako samostatná změna
  konfigurace se zachováním všech guardrailů.
- [ ] **Určit člověka pro incidenty a schvalování.** Musí existovat vlastník,
  který může zastavit automatizaci, řešit účty, platby, právní otázky a
  nejednoznačné publikační výsledky.

## P1 — GitHub a bezpečnost repozitáře

- [ ] V GitHubu pro `main` zapnout branch protection nebo ruleset:
  - vyžadovat pull request;
  - vyžadovat úspěšný workflow `CI`;
  - blokovat force-push a mazání větve;
  - požadovat vyřešení review vláken;
  - podle velikosti týmu vyžadovat alespoň jedno schválení.
- [ ] Zapnout Dependabot security alerts, secret scanning a push protection,
  pokud je daný tarif repozitáře podporuje.
- [ ] Omezit oprávnění GitHub Actions na minimum a pravidelně kontrolovat
  přístupy spolupracovníků a nainstalovaných GitHub Apps.
- [ ] Nastavit nouzové repository variables:
  - `AUTONOMY_KILL_SWITCH=true`, dokud nejsou připravené živé AI cykly;
  - `SOCIAL_KILL_SWITCH=true`, dokud nejsou schválené sociální účty.
- [ ] Nechat `HEALTH_CHECK_ENABLED=false`, dokud neexistuje produkční HTTPS
  URL.

## P1 — AI poskytovatelé

- [ ] Založit nebo vybrat OpenAI projekt a nastavit jeho vlastní billing limit
  a upozornění.
- [ ] Založit nebo vybrat Anthropic workspace a nastavit jeho vlastní billing
  limit a upozornění.
- [ ] Do GitHub repository secrets vložit:
  - `OPENAI_API_KEY`;
  - `ANTHROPIC_API_KEY`.
- [ ] Před prvním živým cyklem znovu ověřit dostupnost modelů a ceny uvedené v
  `config/models.json` a `orchestrator/src/llm/prices.ts`. Poslední interní
  ověření je datované `2026-07-23`.
- [ ] Spustit ruční founding workflow nejprve s `dry=true`; teprve po kontrole
  rozpočtu, routingu a výstupů povolit jeden ohraničený živý běh.
- [ ] Po přidání klíčů označit položku `API-CREDENTIALS-001` v
  `state/INBOX.md` jako schválenou s datem. Samotná existence klíče nenahrazuje
  schválení.

Bez obou klíčů se plánované cykly bezpečně přepnou do dry režimu.

## P1 — hosting a doména

- [ ] Až po vyřešení názvu zvolit doménu a hosting s podporou Node.js 22 a
  Next.js 16.
- [ ] Vytvořit produkční projekt z větve `main`.
- [ ] Nastavit produkční environment variables:

| Proměnná | Povinná | Účel |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | ano | Kanonická HTTPS URL, feedy, sitemap, health check a Instagram media |
| `ADMIN_USER` | ano pro admin | Uživatelské jméno Basic Auth |
| `ADMIN_PASSWORD` | ano pro admin | Dlouhé unikátní heslo uložené pouze jako secret |
| `BOARDLESSAI_REPO_ROOT` | dle hostingu | Absolutní kořen repozitáře pro serverový admin reader, pokud jej runtime neurčí správně |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | pouze při chráněném preview | Bypass ochrany automatizačních kontrol |

- [ ] Ověřit, že:
  - `/`, `/standups`, `/feed.json` a `/robots.txt` vrací `200`;
  - `/admin` bez údajů vrací `401`, se správnými údaji `200`;
  - neúplná konfigurace admina vrací `503`;
  - produkční URL používá HTTPS;
  - fixture venture a standup nejsou v sitemapě ani feedech.
- [ ] Uložit `PUBLIC_SITE_URL` také jako GitHub secret a teprve potom nastavit
  repository variable `HEALTH_CHECK_ENABLED=true`.
- [ ] Nastavit monitoring dostupnosti a kontakt pro alerty. GitHub health
  workflow je základní kontrola, nikoliv plná observabilita.
- [ ] Ověřit zálohu a rollback posledního známého dobrého deploymentu.

## P1 — právní a provozní minimum

- [ ] Nechat zkontrolovat privacy text a doplnit skutečné identifikační a
  kontaktní údaje provozovatele.
- [ ] Před sběrem analytiky, e-mailů nebo jiných osobních údajů zpracovat
  právní základ, retenční pravidla, DPA se zpracovateli a případný consent
  mechanismus.
- [ ] Před placenou nabídkou doplnit obchodní podmínky, reklamační/refund
  proces, fakturaci a daňové zacházení.
- [ ] Vytvořit reálný incident-response kontakt a proces pro žádosti subjektů
  údajů.
- [ ] Zkontrolovat povinná AI a komerční sdělení pro cílové země.

## P2 — skutečné založení venture

Projekt nesmí předstírat nalezený business. Nejdříve je potřeba:

- [ ] Dodat nebo schválit zdroje pro skutečný market research.
- [ ] Získat minimálně tři nezávislé reálné důkazní položky.
- [ ] Získat alespoň jeden přímý signál problému nebo nákupního záměru.
- [ ] Popsat dosažitelný distribuční kanál.
- [ ] Definovat první omezený experiment včetně baseline, targetu, maximální
  ceny, maximální ztráty a stop condition.
- [ ] Nechat deterministický DISCOVERY gate potvrdit skóre alespoň `35/50` a
  žádnou dimenzi pod `2`.

Do té doby jsou záznamy `FIX-*` pouze testovací fixture a nesmí být použity
jako obchodní důkaz.

## P2 — analytika, tržby a platby

- [ ] Vybrat privacy-respecting analytiku a přesně definovat:
  `qualified_visit`, `value_action`, `opt_in`, `monetization_intent` a
  konverzní okna.
- [ ] Připojit analytiku až po právní kontrole a doplnit ji do CSP a network
  allowlistu samostatným review.
- [ ] Vybrat platební nebo fakturační systém až po validaci nabídky.
- [ ] Zavést ověřitelný zdroj tržeb, refundů a payment fees. Dokud není
  připojen, musí zůstat revenue a gross profit `n/a`, nikoliv nula.
- [ ] Nastavit účetní export a měsíční reconciliation proti
  `state/finance/ledger.json` a `state/treasury/ledger.json`.
- [ ] Každý externí výdaj provádí člověk až po položce `HUMAN_APPROVAL` nebo
  `SPEND`; agent nesmí držet platební údaje ani sám provést platbu.

## P2 — Threads a Instagram, pouze pokud je chcete používat

- [ ] Založit a zabezpečit firemní Meta účty; zapnout 2FA a určit vlastníka.
- [ ] Nechat schválit konkrétní OAuth scopes a aktuální podmínky platforem.
- [ ] Nastavit GitHub variables:
  - `META_GRAPH_API_VERSION`;
  - `META_THREADS_USER_ID`;
  - `META_INSTAGRAM_IG_USER_ID`.
- [ ] Nastavit GitHub secrets:
  - `META_THREADS_ACCESS_TOKEN`;
  - `META_INSTAGRAM_ACCESS_TOKEN`;
  - `PUBLIC_SITE_URL`.
- [ ] V samostatném review doplnit přesně schválené scopes a
  `enabledByHumanAt` do `config/channels.json`.
- [ ] Nejprve použít `workflow_dispatch` s `validate_only=true`.
- [ ] Teprve po ověření přepnout konkrétní kanál z `draft` na `autopublish`.

Nejasný výsledek publikace skončí v `needs_reconciliation` a vyžaduje ruční
kontrolu. Odpovědi, reklamy, mazání a opravy nejsou součástí běžného
autopublishing scope.

## Volitelné integrace

- [ ] `PRODUCTHUNT_TOKEN` nastavovat pouze při existenci schváleného Product
  Hunt procesu; současný runtime jej aktivně nepoužívá.
- [ ] `MEDIA_PROVIDER` a `MEDIA_MODEL` jsou rezervované konfigurační body;
  nenastavovat je bez implementovaného a otestovaného provider adapteru.
- [ ] Reddit nebo jiný autentizovaný zdroj přidat jen s aktuálními podmínkami,
  schváleným účtem a rozšířením network allowlistu.

## Finální go-live acceptance

- [ ] Brand clearance vyřešen.
- [ ] `main` chráněný a CI zelené.
- [ ] Produkční build je vytvořen z konkrétního commitu.
- [ ] Secrets nejsou v git historii.
- [ ] Rozpočet a provider billing limity jsou nastavené.
- [ ] Admin a veřejné security headers jsou ověřené.
- [ ] Právní texty odpovídají skutečnému provozu.
- [ ] Kill switche a rollback byly prakticky vyzkoušené.
- [ ] Žádné fixture tvrzení není prezentované jako reálný výsledek.
- [ ] Vlastník projektu výslovně schválil první živý cyklus.
