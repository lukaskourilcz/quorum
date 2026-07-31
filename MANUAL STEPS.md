# Manual Steps — co udělat ručně

Praktický průvodce úkoly z `NEEDED.md`, které nejde spustit z Claude Code.
Řeš odshora dolů — bloky P0 blokují cokoliv veřejného, P1 blokují spuštění,
P2 blokují reálný venture a monetizaci.

Zdroj: `NEEDED.md`, aktualizováno 2026-08-01. Když úkol dokončíš, odškrtni ho tady
i v `NEEDED.md`.

---

## Co agent zvládne sám (nic ke schválení nepotřebuje)

Jediný `[owner:ai]` úkol v `NEEDED.md` (znovunahrání náhledu webu do portfolia
po redesignu) byl už splněn v commitu `81dced6`. Jakmile změníš vzhled webu,
řekni "obnov náhled" a agent to spustí — postup je v
`.claude/skills/preview-video/SKILL.md`.

## Reclassification update: 2026-08-01

Vlastník přijal Caught Up jako Venture 001 a přepnul BoardlessAI do režimu
**operating (pre-revenue)**. Původní hobby rozhodnutí zůstává historickým
záznamem. Aktuální blokátory jsou v horní části `NEEDED.md`.

- Founding gate neprošel a živý `founding` cyklus zůstává zakázaný.
- Fixture evidence se nesmí změnit na live evidence.
- Tržby jsou měřených $0; neznámé fee a refund údaje zůstávají unavailable.
- První platbu blokuje hosting a brand clearance.
- Sociální kanály zůstávají v draft režimu.

---

## P0 — vyřešeno 2026-07-28 (hobby mode)

- [x] **1. Název BoardlessAI** — kolizní riziko vědomě přijato pod hobby módem,
  viz `state/brand-clearance/2026-07-28.md`.
- [x] **2. Licence** — MIT, `LICENSE` v repu, `package.json` aktualizován.
- [x] **3. Provozovatel** — fyzická osoba Lukas Kouril, zapsáno v
  `state/BUSINESS.md`.
- [x] **4. Rozpočet** — $20/měsíc přijat, zapsáno v `state/BUSINESS.md`.
- [x] **5. Incident owner** — Lukas Kouril (single-operator), zapsáno v
  `state/BUSINESS.md`.
- [x] **6. Portfolio karta** — název `BoardlessAI` může zůstat. Veřejnou URL
  doplň, až budeš mít hosting (viz bod 21).

Pokud projekt někdy přestane být hobby, musíš tato rozhodnutí znovu otevřít
(triggery jsou vypsané v `state/brand-clearance/2026-07-28.md`).

---

## P1 — GitHub (vyřešeno 2026-07-28)

- [-] **7. Branch protection pro `main`** — vyžaduje GitHub Pro na privátním
  repu ($4/mo, mimo $20 cap). Pro hobby SKIP nebo repo zveřejni.
- [x] **8. Dependabot alerts + automated security fixes** — zapnuto přes `gh
  api`. Secret scanning a push protection **nejsou dostupné** na free
  privátním repu (GHAS placený feature).
- [x] **9. Omezit oprávnění GitHub Actions** — `default_workflow_permissions`
  = `read`, `can_approve_pull_request_reviews` = `false`.
- [x] **10. Kill switche** — repository variables `AUTONOMY_KILL_SWITCH=true`,
  `SOCIAL_KILL_SWITCH=true`, `HEALTH_CHECK_ENABLED=false`.

Ruční kontrola zbývá:
- [ ] Projít Settings → Collaborators a GitHub Apps, odebrat nepoužívané.

---

## P1 — AI poskytovatelé

### 11. OpenAI účet a limity `[imp:3] [time:20m] [kind:setup]`
- [ ] Založ / vyber OpenAI projekt určený jen pro BoardlessAI.
- [ ] V `Billing → Limits` nastav vlastní hard limit i soft alert nižší, než je
  operační cap ($20/mo).

### 12. Anthropic účet a limity `[imp:3] [time:20m] [kind:setup]`
- [ ] Založ / vyber Anthropic workspace určený jen pro BoardlessAI.
- [ ] Nastav vlastní billing limit a e-mailový alert nižší, než operační cap.

### 13. Vložit klíče jako GitHub secrets `[imp:3] [time:20m] [kind:setup]`
- [x] `ANTHROPIC_API_KEY` — nastaveno jako GitHub secret 2026-07-28.
- [x] `OPENAI_API_KEY` — nastaveno jako GitHub secret 2026-07-28.
- [x] `PUBLIC_SITE_URL` = `https://quorum-site-chi.vercel.app` — nastaveno
  2026-07-28.
- [ ] **KRITICKÉ: Rotovat oba API klíče.** Pastnul jsi je do konverzačního
  transkriptu, což je leak surface. Zneplatni v `console.anthropic.com`
  a `platform.openai.com`, vygeneruj nové a nahraď je v `.env` i GitHub
  secrets.

### 14. Ověřit dostupnost modelů a ceny `[imp:3] [time:1h] [kind:deploy]`
- [ ] Projdi `config/models.json` a `orchestrator/src/llm/prices.ts`.
- [ ] Zkontroluj u obou poskytovatelů, zda uvedené model ID stále existují a
  ceny odpovídají. Poslední interní ověření: 2026-07-23.
- [ ] Pokud se změnilo, otevři samostatný PR jen s cenami/ID (aby šel review).

### 15. Founding workflow napřed s `dry=true` `[imp:3] [time:20m] [kind:setup]`
Otevři: GitHub → Actions → workflow `Founding` (nebo ekvivalent).
- [ ] Spusť `workflow_dispatch` s `dry=true`.
- [ ] Zkontroluj rozpočet, routing a výstupy.
- [ ] Teprve pak povol jeden ohraničený živý běh (`dry=false`).

### 16. Označit `API-CREDENTIALS-001` jako schválené `[imp:3] [time:20m] [kind:setup]`
- [x] Vyřešeno 2026-07-28 — položka je v sekci Resolved v `state/INBOX.md`.

---

## P1 — hosting a doména

### 17. Hosting a doména `[imp:3] [time:30m] [kind:decision]`
- [x] Hosting: **Vercel**. Doména: `quorum-site-chi.vercel.app` (default,
  zadarmo). Custom doména pro hobby zbytečná.

### 18. Založit produkční projekt `[imp:3] [time:20m] [kind:setup]`
- [x] Vercel projekt `quorum-site` (id `prj_lwqV3fjLfFLyEAt60QCKm1w3TGil`)
  už existuje, `main` je production branch, latest deploy READY.

### 19. Nastavit produkční environment variables `[imp:3] [time:20m] [kind:setup]`
Vercel MCP neposkytuje nástroj na env-var management, takže ruční krok
v Vercel dashboardu → Project `quorum-site` → Settings → Environment
Variables:

| Proměnná | Povinná | Účel | Doporučená hodnota |
| --- | --- | --- | --- |
| `PUBLIC_SITE_URL` | ano | Feeds, sitemap, health, IG media | `https://quorum-site-chi.vercel.app` |
| `ADMIN_USER` | jen pro admin | Basic Auth username | `admin` |
| `ADMIN_PASSWORD` | jen pro admin | Basic Auth heslo | `openssl rand -base64 32` |
| `BOARDLESSAI_REPO_ROOT` | zpravidla ne | Vercel má runtime path | ponech prázdné |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | jen pro chráněné preview | Bypass | ponech prázdné |

- [ ] Přidat výše uvedené v Vercel UI (Production environment).

### 20. Ověřit produkční endpointy `[imp:3] [time:1h] [kind:deploy]`
Po deployi projdi ručně nebo curlem:
- [ ] `/` vrací `200`.
- [ ] `/standups` vrací `200`.
- [ ] `/feed.json` vrací `200`.
- [ ] `/robots.txt` vrací `200`.
- [ ] `/admin` bez údajů vrací `401`; se správnými `200`.
- [ ] Bez `ADMIN_USER`/`ADMIN_PASSWORD` vrací `/admin` `503`.
- [ ] Produkce jede na HTTPS.
- [ ] Fixture venture a standup **nejsou** v `sitemap.xml` a `feed.json`.

### 21. Zapnout health check `[imp:3] [time:20m] [kind:setup]`
- [ ] V GitHub repository secrets přidej `PUBLIC_SITE_URL` (stejnou HTTPS URL).
- [ ] V repository variables přepni `HEALTH_CHECK_ENABLED` = `true`.

### 22. Monitoring dostupnosti `[imp:3] [time:1h] [kind:deploy]`
- [ ] Přidej nezávislý uptime monitor (UptimeRobot, BetterStack, Vercel Monitoring
  atd.) s alertem na e-mail / Telegram.
- [ ] GitHub health workflow **není** dostačující observabilita.

### 23. Rollback last-known-good `[imp:3] [time:1h] [kind:deploy]`
- [ ] Ověř, že v hostingu umíš vrátit poslední funkční deployment do 5 minut.
- [ ] Zkus rollback naostro na staging / preview a vrať zpět.

---

## P1 — právní a provozní minimum

### 24. Privacy text `[imp:3] [time:2h] [kind:legal]`
- [ ] Nech privacy policy zkontrolovat právníkem.
- [ ] Doplň skutečné identifikační a kontaktní údaje provozovatele (viz bod 3).

### 25. GDPR základ před sběrem dat `[imp:3] [time:20m] [kind:setup]`
Před připojením analytiky / e-mailů / jakýchkoli osobních údajů:
- [ ] Zpracuj právní základ pro každý účel.
- [ ] Definuj retenční pravidla.
- [ ] Podepiš DPA se všemi zpracovateli (analytika, e-mail provider, hosting).
- [ ] Připrav consent mechanismus, pokud bude potřeba.

### 26. Obchodní podmínky před placenou nabídkou `[imp:3] [time:2h] [kind:legal]`
- [ ] T&C, reklamační / refund proces, fakturace, daňové zacházení.
- [ ] Nech zkontrolovat právníkem.

### 27. Incident-response kontakt `[imp:3] [time:1h] [kind:deploy]`
- [ ] E-mailová adresa (např. `security@…`) s doručením k člověku z bodu 5.
- [ ] Proces pro data subject requests (přístup, výmaz, oprava).

### 28. Povinná AI a komerční sdělení `[imp:3] [time:20m] [kind:setup]`
- [ ] Zkontroluj disclosures pro cílové země (EU AI Act, US FTC, atd.).
- [ ] Doplň relevantní labely na web a do sociálních postů.

---

## P2 — skutečné založení venture (nikoli fixture)

Do vyřešení zůstávají `FIX-*` záznamy jen testovací fixture a nesmí být použity
jako obchodní důkaz.

### 29. Zdroje pro market research `[imp:3] [time:30m] [kind:decision]`
- [ ] Rozhodni, jaké zdroje smíš / chceš použít (Reddit, tržní reporty,
  interview, atd.).
- [ ] Zapiš do `state/OPPORTUNITIES.md`.

### 30. Tři nezávislé důkazní položky `[imp:3] [time:20m] [kind:setup]`
- [ ] Získej alespoň tři nezávislé zdroje potvrzující stejný problém /
  příležitost.
- [ ] Zapiš je do `state/EVIDENCE.jsonl` s uvedením zdroje a data.

### 31. Přímý signál nákupního záměru `[imp:3] [time:20m] [kind:setup]`
- [ ] Alespoň jeden reálný signál: rozhovor, quote, veřejně platící zákazník
  konkurence, atd.
- [ ] Zapiš do `state/EVIDENCE.jsonl`.

### 32. Dosažitelný distribuční kanál `[imp:3] [time:20m] [kind:setup]`
- [ ] Popiš kanál, kterým reálně dosáhneš na cílovou skupinu.
- [ ] Zapiš do `state/BUSINESS.md`.

### 33. První omezený experiment `[imp:3] [time:20m] [kind:setup]`
Zapiš do `state/EXPERIMENTS.md`:
- [ ] Baseline, target, max. cena, max. ztráta, stop condition, časové okno.

### 34. DISCOVERY gate `[imp:3] [time:20m] [kind:setup]`
- [ ] Spusť deterministický DISCOVERY gate (viz `orchestrator/`).
- [ ] Vyžaduj skóre alespoň `35/50` a žádnou dimenzi pod `2`.

---

## P2 — analytika, tržby a platby

### 35. Vybrat privacy-respecting analytiku `[imp:3] [time:2h] [kind:legal]`
Kandidáti: Plausible, Umami self-hosted, Vercel Web Analytics.
- [ ] Přesně definuj metriky: `qualified_visit`, `value_action`, `opt_in`,
  `monetization_intent` a konverzní okna.
- [ ] Zapiš definice do `state/BUSINESS.md`.

### 36. Připojit analytiku po právní kontrole `[imp:3] [time:2h] [kind:legal]`
- [ ] Zvolený nástroj přidej do CSP a network allowlistu v samostatném review.
- [ ] Pokud analytika používá cookies / fingerprinting, zajisti consent.

### 37. Platební / fakturační systém `[imp:3] [time:1h] [kind:deploy]`
- [ ] Vyber až po validaci nabídky (P2.29–34).
- [ ] Kandidáti: Stripe, Fakturoid, Fakturační portál banky, atd.

### 38. Ověřitelný zdroj tržeb `[imp:3] [time:1h] [kind:deploy]`
- [ ] Dokud není přijata platba, drž recognized revenue na měřených `$0`;
  neznámé poplatky a refundy nech jako `unavailable`.
- [ ] Zdroj musí umožnit programové čtení (např. Stripe API).

### 39. Účetní export a měsíční reconciliation `[imp:3] [time:1h] [kind:deploy]`
- [ ] Nastav měsíční sesouhlasení proti `state/finance/ledger.json` a
  `state/treasury/ledger.json`.

### 40. Ruční provádění externích výdajů `[imp:3] [time:20m] [kind:setup]`
- [ ] Zapamatuj si: každý externí výdaj proveď ty, agent nesmí držet platební
  údaje a nesmí sám provést platbu.
- [ ] Výdaj vždy provázen položkou `HUMAN_APPROVAL` nebo `SPEND` v `INBOX.md`.

---

## P2 — Threads a Instagram (jen když je chceš používat)

Přeskoč celou sekci, pokud sociální publikaci neplánuješ.

### 41. Meta účty a 2FA `[imp:3] [time:20m] [kind:setup]`
- [ ] Firemní Meta účet (Facebook + Instagram + Threads).
- [ ] Zapni 2FA, urči jednoho vlastníka.

### 42. Schválené OAuth scopes `[imp:3] [time:2h] [kind:legal]`
- [ ] Nech schválit přesný seznam scopes a aktuální podmínky platforem.

### 43. GitHub variables pro Meta `[imp:3] [time:20m] [kind:setup]`
Otevři: GitHub → Settings → Secrets and variables → Actions → Variables.
- [ ] `META_GRAPH_API_VERSION`.
- [ ] `META_THREADS_USER_ID`.
- [ ] `META_INSTAGRAM_IG_USER_ID`.

### 44. GitHub secrets pro Meta `[imp:3] [time:20m] [kind:setup]`
Otevři: GitHub → Settings → Secrets and variables → Actions → Secrets.
- [ ] `META_THREADS_ACCESS_TOKEN`.
- [ ] `META_INSTAGRAM_ACCESS_TOKEN`.
- [ ] `PUBLIC_SITE_URL` (pokud ještě není z bodu 21).

### 45. Zapsat scopes do `config/channels.json` `[imp:3] [time:30m] [kind:decision]`
- [ ] V samostatném review doplň přesně schválené scopes a `enabledByHumanAt`
  pro každý kanál.

### 46. Napřed `validate_only=true` `[imp:3] [time:20m] [kind:setup]`
- [ ] První běh publikace pusť s `workflow_dispatch` a `validate_only=true`.

### 47. Přepnout kanál na `autopublish` `[imp:3] [time:1h] [kind:deploy]`
- [ ] Až po ověření (bod 46) přepni konkrétní kanál z `draft` na `autopublish`.
- [ ] Nejednoznačné publikační výsledky (`needs_reconciliation`) řeš ručně.

---

## Volitelné integrace

### 48. Product Hunt `[imp:3] [time:1h] [kind:deploy]`
- [ ] `PRODUCTHUNT_TOKEN` nastavuj **jen** při existenci schváleného Product Hunt
  procesu. Runtime jej aktivně nepoužívá.

### 49. Media provider `[imp:3] [time:1h] [kind:content]`
- [ ] `MEDIA_PROVIDER` a `MEDIA_MODEL` nenastavuj bez implementovaného
  a otestovaného provider adapteru.

### 50. Reddit nebo jiný autentizovaný zdroj `[imp:3] [time:2h] [kind:legal]`
- [ ] Aktuální podmínky služby.
- [ ] Schválený účet.
- [ ] Rozšíření network allowlistu.

---

## Finální go-live acceptance

Checklist, který musíš projít **před** prvním živým cyklem a veřejným
spuštěním. Neodškrtávej dopředu.

- [ ] Brand clearance vyřešen (bod 1).
- [ ] `main` chráněný a CI zelené (bod 7).
- [ ] Produkční build z konkrétního commitu (bod 18).
- [ ] Secrets nejsou v git historii (`git log -p | grep -i "api_key\|token"`).
- [ ] Rozpočet a provider billing limity nastavené (body 4, 11, 12).
- [ ] Admin a veřejné security headers ověřené (bod 20).
- [ ] Právní texty odpovídají skutečnému provozu (body 24, 26).
- [ ] Kill switche a rollback prakticky vyzkoušené (body 10, 23).
- [ ] Žádné fixture tvrzení není prezentované jako reálný výsledek
  (`state/CLAIMS.json`, `state/CONTENT_INVENTORY.json`).
- [ ] Vlastník projektu výslovně schválil první živý cyklus (zapsat do
  `state/INBOX.md`).

---

## Dashboards a reporting (nízká priorita)

### 51. Vercel Web Analytics `[imp:2] [time:15m] [kind:setup]`
- [ ] Otevři Vercel → projekt → Analytics → Enable.
- [ ] OwnDashboard pak přes Vercel API načte návštěvníky a zobrazení stránek.

### 52. GitHub Actions cron reporting `[imp:2] [time:10m] [kind:setup]`
Otevři: GitHub → Settings → Secrets and variables → Actions → Secrets.
- [ ] `OWNDASHBOARD_CRON_URL` = URL na `/api/crons/log` v OwnDashboardu.
- [ ] `OWNDASHBOARD_CRON_TOKEN` = stejná hodnota jako `CRON_REGISTRY_TOKEN`
  v OwnDashboardu.
