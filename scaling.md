# Financování, nákladový stack a škálování

Tento dokument popisuje finanční model, rozpočtové guardraily, možné zdroje
financování a okamžiky, kdy bude potřeba škálovat technickou infrastrukturu.
Nejde o investiční, účetní, daňové ani právní poradenství.

## Aktuální finanční stav

| Položka | Stav |
| --- | ---: |
| Fáze | `DISCOVERY` |
| Ověřený venture | ne |
| Aktivní experiment | žádný |
| Připojený zdroj tržeb | ne |
| Recognized revenue | `n/a` |
| Ověřený API spend v projektových ledgerech | `$0.00` |
| Treasury spend | `$0.00` |
| Recurring commitments | žádné |
| Hard all-in operating cap | `$20.00 / měsíc` |
| Rezerva před ziskovostí | `$4.00` (20 %) |
| Dostupné bez dalších závazků | `$16.00` |

Portréty agentů byly vytvořené přes session image tool, nikoliv projektový API
klíč. Manifest proto správně eviduje skutečný project API spend jako `null` a
pouze API-ekvivalentní odhad `$3.616155`; tato částka není zaúčtovaným nákladem
projektu.

## Současné hard limity

Výchozí limity jsou fail-closed v `orchestrator/src/budget.ts` a `.env.example`.

| Limit | Hodnota |
| --- | ---: |
| Jeden textový AI call | `$0.10` |
| Jeden council cyklus | `$0.20` |
| Jeden DISCOVERY cyklus | `$0.12` |
| Jeden VALIDATION cyklus | `$0.18` |
| AUDIENCE/MONETIZATION/OPTIMIZATION cyklus | `$0.20` |
| Denní API spend | `$0.40` |
| Měsíční API spend | `$12.00` |
| Celkový měsíční operating spend | `$20.00` |
| Jeden běžný media asset | `$0.10` |
| Denní media spend | `$0.10` |
| Měsíční media spend | `$2.00` |
| Jeden avatar | `$0.30` |
| Celá sada avatarů | `$5.00` |

Dry founding call graph má při aktuální konfiguraci worst-case odhad
`$0.039316`. Dry režim však žádné provider API nevolá a nic neúčtuje.

Hard all-in cap zahrnuje současně:

- textová a obrazová AI API;
- hosting, domény a storage;
- nástroje a datové zdroje;
- media a reklamu;
- payment fees a refundy;
- ostatní ověřené provozní náklady;
- existující závazky a známé forecast náklady.

Jednu nákladovou položku nelze vykázat ve více ledgerech jako dva různé
náklady. Reconciliation používá stabilní klíče a duplicity blokuje.

## Jak funguje schválení výdajů

```text
Potřeba výdaje
      │
      ▼
Costed proposal + účel + maximum + owner
      │
      ▼
Budget, stage a treasury gate
      │
      ▼
HUMAN_APPROVAL / SPEND položka
      │
      ▼
Člověk schválí a provede platbu
      │
      ▼
Commitment/payment ledger + reconciliation
```

Pravidla:

- Agent nesmí držet kartu, bankovní credential nebo sám provést platbu.
- Každý externí výdaj vyžaduje explicitní approval reference.
- Zero-based rozpočet nesmí překročit celkový cap.
- Commitment nesmí překročit cap své budget line.
- Duplicitní reconciliation key je chyba.
- Dokud projekt není ziskový, treasury drží výchozí 20% rezervu.
- Neznámá cena modelu blokuje call; systém cenu nehádá.
- Rezervace probíhá před API requestem podle worst-case tokenů a nástrojů.
- Chybějící revenue zůstává `n/a`, aby nevznikal falešný profit.

## Účetní model

Finance ledger rozlišuje alespoň:

- `revenue`;
- `refund`;
- `payment_fee`;
- `api_cost`;
- `treasury_cost`;
- `other_cost`.

Gross profit se počítá pouze při připojeném a ověřitelném zdroji tržeb:

```text
recognized revenue
- refunds
- payment fees
- API costs
- treasury costs
- other verified costs
= gross profit
```

Dokud není revenue source připojený, recognized revenue, refundy, payment fees
a gross profit jsou `n/a`. Nula by nesprávně tvrdila, že měření proběhlo.

## Co dnes projekt financuje

Současný `$20` cap je bootstrap experimentální rozpočet, ne plný provozní
rozpočet firmy. Má financovat jen:

1. malé ohraničené AI cykly;
2. minimální hosting po schválení;
3. nezbytné provozní nástroje;
4. rezervu na incident nebo opravu.

Nemá financovat reklamu, rozsáhlý scraping, velké media série, drahé právní
služby ani vývoj bez validovaného problému. Tyto položky potřebují samostatný
zdroj peněz a explicitní rozhodnutí vlastníka.

## Možné zdroje financování

Projekt aktuálně neeviduje žádné externí financování. Možné cesty jsou:

### 1. Founder-funded bootstrap

Vhodné pro DISCOVERY a malé validační experimenty.

- nejmenší administrativní režie;
- plná kontrola vlastníka;
- striktní osobní limit ztráty;
- měsíční cap musí odpovídat částce, kterou je vlastník připraven skutečně
  ztratit.

### 2. Cloud/API kredity a granty

Mohou snížit cash burn, ale nesmí maskovat skutečné jednotkové náklady.

- ledger má evidovat spotřebu i skutečně placenou částku odděleně;
- před koncem kreditů je nutné přepočítat provoz za standardní ceny;
- grant nesmí vynutit předčasné škálování nebo změnu produktu bez evidence.

### 3. Customer-funded revenue

Preferovaná cesta po validaci nabídky.

- nejprve musí existovat ověřený zákaznický problém a legální způsob prodeje;
- pre-order nebo placený pilot potřebuje jasný rozsah, refund pravidla a
  schopnost dodat slíbenou hodnotu;
- revenue se uznává jen z ověřitelného zdroje, ne z ústního zájmu.

### 4. Externí kapitál

Equity, convertible instrument nebo dluh dává smysl až po vědomém posouzení:

- proč peníze zrychlí ověřený mechanismus;
- jaký milestone mají koupit;
- kolik měsíců runway vytvoří;
- jaké jsou právní, daňové a governance dopady;
- zda projekt unese závazky i při nulovém růstu.

Dluh není vhodný pro neověřený experiment bez predikovatelného cash flow.
Konkrétní strukturu musí posoudit kvalifikovaný právní a finanční poradce.

## Kdy navýšit rozpočet

Cap se nemá zvyšovat jen proto, že byl vyčerpán. Navýšení dává smysl pouze,
pokud existuje:

- konkrétní schválený milestone;
- evidence, že současný limit brání validovanému učení nebo výnosu;
- itemizovaný zero-based plán;
- zdroj peněz;
- maximální ztráta a stop condition;
- vlastník každé budget line;
- měřitelný výsledek a datum review;
- zachovaná incidentní rezerva.

Příklad rozhodnutí není „zvýšit cap na více“, ale:

> Uvolnit maximálně X USD na experiment Y do data Z; zastavit při podmínce S a
> vyhodnotit metriku M proti baseline B.

Každé navýšení vyžaduje změnu env/config limitů, testy a samostatný review.
Měsíční provider billing limity mají být stejné nebo přísnější než interní
limity, nikoliv jejich náhradou.

## Runway a cash plán

Základní vztah:

```text
runway v měsících = dostupná hotovost / očekávaný all-in měsíční burn
```

Do očekávaného burnu patří i roční služby přepočtené na měsíc, daně, právní
náklady, refund exposure a commitmenty. Kredity se nemají započítávat jako
hotovost.

Minimální měsíční forecast má obsahovat:

| Kategorie | Otázka |
| --- | --- |
| AI API | Kolik cyklů, tokenů, search a image calls je plánováno? |
| Hosting | Jaký je base fee, bandwidth, build a function usage? |
| Storage/data | Kolik stojí DB, object storage, backup a egress? |
| Doména/e-mail | Jaké roční závazky vznikají? |
| Nástroje | Které licence jsou skutečně nutné? |
| Distribuce | Je media nebo ad spend experimentálně ohraničený? |
| Platby | Jaké jsou fees, chargebacks a refundy? |
| Compliance | Jaké právní a účetní náklady přicházejí? |
| Rezerva | Kolik zůstává na incident a neočekávané opravy? |

## Unit economics a metriky pro financování

Před významnějším navýšením spendu je potřeba měřit:

- náklad na jeden validovaný learning;
- náklad na qualified visit a value action;
- conversion do opt-in nebo leadu;
- monetization intent;
- customer acquisition cost, pokud vznikne placená akvizice;
- recognized revenue na zákazníka;
- refunds a payment fees;
- AI/API cost na obslouženou hodnotovou akci;
- contribution margin a gross profit;
- payback period;
- forecast error a budget variance.

Vanity traffic není důvodem k financování. Projekt optimalizuje ověřené učení,
zákaznickou hodnotu a ekonomický výsledek.

## Technické škálování a jeho finanční dopad

### Současná úroveň: jeden writer, nízký provoz

Git-backed JSON/JSONL je levný, auditovatelný a vhodný pro:

- dva plánované council cykly denně;
- malou sociální frontu;
- statický veřejný obsah;
- jednoho administrátora;
- nízký počet experimentů a finančních záznamů.

Výhoda je minimální infrastruktura. Limitem je souběh, velikost historie,
latence git operací a potřeba bezpečně připojit runtime ke kanonickému stavu.

### Trigger pro databázi

Přechod na spravovaný PostgreSQL nebo obdobný transakční store je vhodný, když
nastane alespoň jeden z těchto stavů:

- více nezávislých writerů;
- časté lock contention nebo konflikty runtime commitů;
- potřeba více admin uživatelů a detailního audit logu;
- vysoký objem eventů, metrik nebo platebních záznamů;
- relační dotazy a reporting už nejsou bezpečně zvládnutelné soubory;
- požadavek na point-in-time recovery.

Před migrací je nutné ocenit:

- měsíční compute a storage;
- backup/PITR;
- network egress;
- observabilitu;
- migration a rollback práci;
- bezpečnostní a DPA dopad.

Git může zůstat auditním snapshotem a konfigurací, zatímco transakční runtime
stav přejde do databáze.

### Trigger pro frontu a workery

Managed queue je vhodná při větším počtu:

- council úloh;
- asynchronních research fetchů;
- media jobů;
- sociálních publikací;
- retry/reconciliation procesů.

Queue musí zachovat idempotency, cost reservation, dead-letter stav a
`needs_reconciliation`. Vyšší throughput nesmí odstranit lidská schválení.

### Asset a traffic scaling

Při růstu médií a návštěvnosti:

- používat object storage a CDN;
- držet originální provenance mimo veřejný web;
- nastavit image transform limity a egress alerty;
- cachovat pouze veřejné sanitizované projekce;
- oddělit admin origin od veřejného webu;
- měřit náklad na request a na užitečnou konverzi.

Serverless free tier nesmí být považován za trvalou cenu. Forecast má používat
cenu po překročení free tieru.

## Doporučené finanční kontrolní body

### Týdně

- zkontrolovat provider usage proti internímu ledgeru;
- projít failed a `needs_reconciliation` položky;
- ověřit nové commitmenty;
- vyhodnotit experimentální stop conditions;
- ponechat kill switche aktivní, pokud není provoz pod kontrolou.

### Měsíčně

- uzavřít všechny nákladové kategorie;
- potvrdit, že každá položka je započtená právě jednou;
- porovnat forecast se skutečností;
- přepočítat runway;
- zkontrolovat provider ceny a model availability;
- obnovit zero-based budget na další měsíc;
- zrušit nevyužité nástroje a recurring commitmenty;
- rozhodnout `hold`, `reserve`, `propose` nebo `cancel`.

### Před fundraisingem nebo větším spendem

- mít vyřešené vlastnictví IP a licenci;
- mít právně prověřený název;
- doložit skutečné evidence a experimenty;
- mít čistý cap table a účetnictví;
- doložit revenue, refunds a fees z ověřitelného zdroje;
- znát unit economics a citlivost na AI/API ceny;
- mít security, privacy, backup a incident proces;
- popsat přesný use of funds a milestone, který má kapitál koupit.

## Hlavní finanční rizika

| Riziko | Ochrana |
| --- | --- |
| Neočekávaná změna AI ceny | datované ceníky, unknown-price fail-closed, provider billing limit |
| Token nebo media runaway | per-call, cycle, daily a monthly cap |
| Dvojí započtení | reconciliation keys a duplicate checks |
| Falešné revenue/profit | `n/a` bez připojeného zdroje tržeb |
| Předčasné reklamy | human approval a experimentální max loss |
| Nevyužité subscriptions | recurring commitments a měsíční zero-based review |
| Free-tier cliff | forecast standardních cen a usage alerty |
| Platform lock-in | adapter hranice, exportovatelný stav a Git konfigurace |
| Souběžný zápis | lock dnes, DB/queue při triggeru |
| Název/IP spor | public launch blokovaný do brand clearance |
| Ztráta credentials | secret store, minimální scopes, rotace a 2FA |

## Rozhodnutí, která musí udělat vlastník

1. Kolik vlastních peněz je ochoten měsíčně a celkem riskovat?
2. Jaký milestone má každý nový rozpočet koupit?
3. Kdo schvaluje a provádí platby?
4. Jaká minimální rezerva musí zůstat nedotčená?
5. Kdy je vhodnější projekt zastavit než financovat další pokus?
6. Má být růst financovaný zákazníky, kredity, nebo externím kapitálem?
7. Jaké právní a účetní uspořádání odpovídá zvolené cestě?

Dokud tyto odpovědi a skutečný venture neexistují, bezpečný default je zachovat
`$20` hard cap, neaktivovat reklamy ani recurring závazky a pokračovat pouze v
evidence-backed DISCOVERY.
