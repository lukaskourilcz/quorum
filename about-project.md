# O projektu BoardlessAI

BoardlessAI je systém, ve kterém skupina AI rolí připravuje podklady, vede porady a
ukládá výsledky tak, aby šlo zpětně dohledat, proč něco navrhla. Pevná pravidla hlídají
důkazy, náklady, bezpečnost a to, co smí udělat jen majitel.

Aktuální stav: **v provozu, bez příjmů, ve fázi ověřování**. Web běží na Vercel Pro:
<https://boardless-ai.vercel.app>. Rejstřík má čtrnáct položek: jedenáct veřejných projektů
(Caught Up — veřejně DNESKAi, Titty Tuesdays, GoVIRAL, marketingShark, BOOKSOFHISTORY,
FightAIQ, Design Lab, MMA Files, Door Money, Tehdejší svět a Kvórum), dvě soukromé
(Personal Growth a WebDev Signal) a průzkum Contest Radar.
Magazine Incubator byl uzavřen — nové magazíny se už nevymýšlejí.

**Od 25. září 2026 (`operations-2026-09b`) běží jen DNESKAi, marketingShark (devShark),
GoVIRAL, Design Lab a WebDev Signal.** BoardlessAI píše články a sociální obsah pro DNESKAi a
sociální obsah pro devShark. MMA Files, FightAIQ, Titty Tuesdays, BOOKSOFHISTORY, Door Money,
Tehdejší svět, Kvórum a Personal Growth jsou pozastavené: kód a stav zůstávají, na hodinách
nemají žádný slot, v navigaci adminu chybí a vypisuje je jen Nastavení v tabulce „Paused
ventures“. Popis níže platí pro ně jen do obnovení.

**Co publikuje (k 26. září 2026):** jen DNESKAi, jedno denní vydání. Hotový článek posílá
zároveň do Design Labu jako *summary* (titulek, perex a vybrané pasáže), ze kterého se
skládají sociální karusely. MMA Files publikovalo do konce srpna a od 15. září je
pozastavené. marketingShark zatím nepublikuje: jeho příspěvky pro devShark čekají jako
koncepty ve frontě a rozhoduje o nich majitel. Na co který projekt čeká, je v
`docs/NEEDED.md`.

## Tech stack

- **TypeScript, Node.js 22 a pnpm** — jeden workspace se třemi balíčky: `orchestrator`, `site`
  a `studio`
- **orchestrator (tsx, zod)** — řízení porad, rozpis, limity nákladů a kontrola zdrojů; spouští
  ho GitHub Actions nebo příkazová řádka
- **Next.js 16, React 19 a Tailwind CSS 4** — veřejný web a chráněná správa v `site/`
- **@boardlessai/carousel-studio** — deterministické vykreslování karuselů v `studio/` přes resvg
  a sharp, s písmy uloženými v repozitáři
- **`state/` v Gitu** — záznamy porad, rozhodnutí, fronty a účtenky; databázi projekt nemá
- **GitHub Actions** — porady podle rozpisu (`cycle.yml`), tři záložní běhy a CI
- **Vitest, Playwright a axe-core** — jednotkové, prohlížečové a přístupnostní testy

## Third-party libraries

- **Anthropic a OpenAI** — jazykové modely rolí; kterou roli obsluhuje který model, určuje
  `config/models.json`
- **Vercel** — hosting webu (Pro) a spouštěč slotů v `site/vercel.json`; nasazuje se jen ručně
  přes `pnpm deploy:production`
- **GitHub** — repozitář se stavem a GitHub App, která doručuje vydání DNESKAi do
  `lukaskourilcz/aifirst`
- **Apify** — zdroje trendů pro GoVIRAL, hlídané kvótou
- **Firecrawl a Jina Reader** — převod zdrojových stránek na text; bez klíče Firecrawl je čte
  Jina Reader
- **Stack Exchange API** — jeden z registrovaných zdrojů v `config/sources.json`
- **Wikidata, Wikimedia Commons, Openverse, Pexels a Pixabay** — fotografie osob a licencované
  vyhledávání obrázků k článkům
- **fal.ai** — generovaná ilustrace; běží jen s `FAL_KEY` a `ARTICLE_ILLUSTRATION_ENABLED`
- **Podcast Index** — bezplatný klíč pro podcasty bez použitelného RSS nebo YouTube
- **Resend** — volitelný denní souhrn e-mailem
- **Buffer a Meta Graph API (Instagram, Threads)** — publikování na sociální sítě; cesta je
  připravená a držená, dokud ji majitel neotevře
- **zod, rss-parser, cheerio a yaml** — kontrakty, čtení RSS a HTML zdrojů, konfigurace
- **sharp, @resvg/resvg-js a fflate** — zpracování obrázků, vykreslení SVG a ZIP export karuselů
  z Design Labu
- **lucide-react, clsx, tailwind-merge a class-variance-authority** — ikony a skládání tříd v
  rozhraní

## Jak je systém poskládaný

```text
GitHub Actions / příkazová řádka
              │
              ▼
     TypeScript řízení porad
     ├─ rozpis, agendy a výběr rolí
     ├─ limity nákladů a kontrola zdrojů
     ├─ porady běžících projektů
     └─ jeden denní souhrn
              │
              ▼
          state/ v Gitu
     ├─ úplné interní záznamy
     └─ bezpečné veřejné výstupy
              │
              ▼
           Next.js web
     ├─ úvodní stránka jako procházka kanceláří (7 sekcí)
     ├─ veřejné stránky a kalendář
     └─ chráněná správa projektů a Operations (rail podle projektů)
```

Chráněná stránka Operations ukazuje ověřený zdravotní stav, SLO, kapacitu, incidenty,
hranice mezi projekty a souhrn implementačních plánů. Čte jen omezená provozní metadata:
nepřenáší obsah projektů, soukromá data ani přihlašovací údaje a neumí publikovat, utrácet
nebo nasadit web. Chybějící stav zůstává označený jako nedostupný, nikoli jako nula.

V rejstříku je 49 rolí, z toho **40 aktivních**: čtyři hlasující členové rady a 36
odborných rolí. Šest rolí je pozastavených a tři vyřazené; veřejný web počítá
jen ty pracující. Dvacet pět aktivních rolí používá Anthropic a 15 OpenAI. Dvacet sedm
rolí má na veřejném webu svou schválenou fotografii. Novější role používají neutrální zástupný obrázek se jménem,
dokud pro ně nevznikne schválený portrét. Web používá jména a pracovní popisy bez
seriálového vzhledu a bez označení sezon nebo epizod. Tyto vizuální prvky se neposílají
modelům ani do podkladů porad.

## Projekty

- **Caught Up** připravuje český článek a právě jeden hlavní obrázek z povolené
  licencované knihovny nebo z bezpečné náhradní grafiky. Hotový balíček přes omezenou
  GitHub App zapíše do `lukaskourilcz/aifirst` a po nasazení automaticky ověří článek,
  obrázek, zdroj fotografie a otisk obsahu.
- **Titty Tuesdays** připravuje značku, témata a marketing. Nemá e-shop, sklad,
  platby, reklamy ani automatické zveřejňování.
- **GoVIRAL** je týdenní trendová porada (pondělí 13:00). Ze zdrojovaných dat udělá
  jeden brief pro majitele, marketingové nápady pro DNESKAi a devShark a nejvýše jednu
  agendu předanou jiné poradě. Stávající zdroje bere z Apify na placeném plánu; repozitář
  předpokládá Starter za 19 dolarů měsíčně s 19 dolary kreditu (`config/fixed-costs.json`),
  dokud majitel plán nepotvrdí (#528).
- **marketingShark** dělá marketingové podklady pro devShark. Porada v 07:00 každý
  pracovní den připraví jeden anglický pětislidový příspěvek podle dne v týdnu: kvízovou
  otázku v pondělí a ve čtvrtek, jednu obrazovku produktu v úterý, snadnou programovací
  výzvu ve středu a shrnutí týdne v pátek. Dokud devShark neoznačí výzvy obtížností, středa
  připraví kvíz. Vykreslí ho Design Lab a tři koncepty (LinkedIn, Instagram a Threads)
  čekají ve frontě na schválení. Cesta k publikování je registrovaná a držená: otevře ji
  až podpis rozhodnutí, připojené profily a schválení konkrétního příspěvku. devShark je
  jediná značka a od 24. září je jen anglicky; majitel 25. září rozhodl, že bude freemium,
  a cenu příspěvky neuvedou, dokud Premium není v prodeji. Jeho banku 2 447 otázek o
  webovém vývoji systém jen čte z připnutého otisku a v jeho repozitáři nic nemění.
  Vypnutá značka geoShark pro zeměpisnou banku StudyShark skončila spolu se StudyShark
  a z konfigurace zmizela.
- **FightAIQ** spravuje zdrojovaná data o UFC a Oktagonu a počítá analýzy v kódu.
  Analýzy smí spustit jen pro ověřené zápasy a karty: neumí sázet, otevírat sázkové
  účty ani slibovat výhru.
- **Design Lab** je pracovní nástroj na sociální obsah, ne galerie šablon. Jedna
  záložka `studio` v administraci ukazuje každý doručený článek DNESKAi i schválené
  summary běžících projektů, vykreslí jejich karusely skutečným enginem ve všech
  čtyřech formátech a nechá majitele přepnout
  rodinu, variantu, úpravu fotky, velikost písma a fázi rytmu — a to všechno je jeden
  zapsaný recept, který si pipeline sama odvodí při doručení. Deset rodin šablon
  (masthead, gutter, bevel, porthole, slab, terrace, figure, pull, tower, dossier)
  založilo knihovnu, kterou dalších třináct rozšířilo na 23 odlišných rodin. Ty nahradily
  pět tapet, které byly ve třech případech tentýž rozmazaný gradient. Písma
  jsou od 9. srpna 2026 v repozitáři: třicet statických řezů pod licencí SIL OFL, takže
  stejný deck vykreslí stejné bajty na jakémkoli stroji. Knihovna drží devět barevných
  sad: DNESKAi, MMA Files, Titty Tuesdays, devShark, BOOKSOFHISTORY, Door Money, Tehdejší
  svět, Kvórum a WebDev Signal. Design Lab nabízí jen sady běžících projektů. geoShark
  skončil se StudyShark. Design Lab nemá vlastní sociální účet.
- **BOOKSOFHISTORY** každý den ve 12:00 naváže na rozepsanou fázi výběru, výzkumu
  nebo tvorby. Z jednoho zdrojovaného dossieru vznikne společný příběhový brief a dva
  samostatně napsané české a anglické sociální koncepty. Nemá veřejný web, stránky
  knih, SEO archiv, databázi, newsletter, obchod, účet ani cestu ke zveřejnění. Obálky
  knih se nikdy nevykreslují; citace mají nejvýše 300 znaků a uvedený zdroj.
- **MMA Files** je veřejný český magazín. BoardlessAI do jeho repozitáře posílá jen ověřené články a data z FightAIQ;
  rozepsané texty a interní poznámky zůstávají v chráněné administraci. Když FightAIQ
  nemá žádný nadcházející turnaj, redakce místo náhledu zápasu napíše profil nejlépe
  podloženého bojovníka — oba projekty na sobě nezávisí.
- **Door Money** mění soukromý anglický rukopis na návrhy příběhů a čtvrteční balíček
  úkolů pro majitele. Veřejný repozitář drží jen otisky, skóre a omezené výňatky
  (nejvýše 600 znaků; stylové exempláře nejvýše 40 × 280 znaků); celý text, chunky i
  embeddingy zůstávají v soukromém úložišti. Denní návrhy v 15:00 schvaluje nebo zamítá
  majitel, schválení zapíše jen summary pro Design Lab a zveřejnění je ruční. Čtvrteční
  porada v 16:00 připraví citované úkoly a šablony, ale nic neodešle, nezaloží účet,
  nedotkne se kanálu a neutratí peníze.
- **Tehdejší svět** připravuje dvoudenní česko-ukrajinský rodinně-historický balíček.
  Denní stůl v 18:00 nejprve naplánuje jeden příběh a při dalším běhu nechá LETOPIS
  napsat český návrh a VERBA samostatný ukrajinský návrh. Obě verze smějí čerpat jen z
  jednoho ručně potvrzeného a otiskem chráněného souboru faktů; HACEK, QUILL a AUDIT
  hlídají vstup, citlivost, kvalitu a stop bránu. Výstup je jen návrh a výsledky zadává
  majitel ručně. BoardlessAI se k existujícímu produktu nepřipojuje a připravuje pouze
  marketingové podklady.
- **Kvórum** má v 21:00 připravovat jeden nebo dva původní české politické návrhy z
  potvrzeného denního digestu. Jeden TRIBUN call obklopují deterministické kontroly
  zdrojů, typů tvrzení, opakování, veřejných osob a českého rejstříku. Design Lab je
  jediná cesta k obrázku a zveřejnění zůstává ruční. Zakládající rozhodnutí i přesun denní
  rozpočtové kapacity jsou podepsané (29. 8.), ale Kvórum je pozastavené, takže nic nevolá
  a stojí `$0`.

## Denní rozpis a peníze

Od 25. září (`operations-2026-09b`) má pražský rozpis pět slotů:

| Praha | Slot | Kdy skutečně pracuje |
| ---: | --- | --- |
| 05:00 | den DNESKAi (`cu-day`) | krok WebDev Signal za `$0`, vydání a hned po něm produktová kontrola |
| 06:00 | ranní rada | rozhodovací porada, denní kontrolní zápis a souhrn předchozího dne |
| 07:00 | marketingShark | jeden příspěvek devSharku každý pracovní den; o víkendu se neschází |
| 09:00 | opakování vydání DNESKAi | jen když vydání z 05:00 neprošlo |
| 13:00 | GoVIRAL | placený brief jen v pondělí; jinak `$0` |

Vercel drží pro každý slot dvě UTC varianty kvůli letnímu a zimnímu času, celkem deset
záznamů v `site/vercel.json`. Tři záložní běhy GitHubu (03:55, 11:55 a 19:55 UTC) zachytí
zmeškaný slot. Program přijme jen variantu, která odpovídá dnešnímu času v Praze.
Pozastavené projekty na hodinách nemají žádný slot a `cycle.yml` jejich fáze nenabízí.

Kterou poradu spustit, určuje **spouštěč, který se ozval**, ne hodiny v okamžiku startu.
GitHub úlohy podle rozpisu často odloží — 2. srpna o 13 až 54 minut — a dřívější odvození
z nástěnných hodin mělo toleranci jen dvacet minut: sedm ze čtrnácti porad se ten den
nekonalo a jedna se spustila jako sousední porada. Spouštěč poradu pojmenuje sám, takže
zpoždění už nevadí.

V 06:00 rozhodne ranní rada, které odborné porady jsou opravdu potřeba, a zapíše denní
kontrolu bez placeného modelu. GoVIRAL platí model jen v pondělí a marketingShark jen ve
všední dny.

Když nějaká brána poradu vypne, zapíše se do `state/meetings/skips/` důvod a kalendář slot
označí jako **Skipped** s vysvětlením v popisku. Prázdný den tak řekne, kterou bránu
otevřít, místo aby vypadal jako porucha.

Podepsané rozhodnutí `budget-2026-08f` stanovuje celkový měsíční limit **50 dolarů**,
z toho 25 dolarů pro modely a API a denní tempo 1,00 dolaru. Nahrazuje starší
`budget-2026-08d` (50 / 42 / 2,20). Jeden resolver drží tyto částky pro celý běh; každá
fáze si limit smí jen utáhnout, nikdy povolit. Systém si limit nesmí zvýšit sám a platby
vždy provádí člověk.

BOOKSOFHISTORY má uvnitř těchto společných limitů ještě nižší stropy na výzkum:
nejvýše 0,10 dolaru za volání, 0,50 dolaru za cyklus a 5 dolarů za měsíc. Stejný
výzkum se pro druhý jazyk neopakuje a zámek `(bookId, briefHash)` brání dvojímu
účtování.

Tehdejší svět má strop výzkumu 0,30 dolaru za brief a 2 dolary za měsíc. Plánování a
dvě nezávislé jazykové verze mají společnou obálku 0,25 dolaru na běh a modelový cíl
nejvýše 4 dolary měsíčně; kontrola faktů, skórování, nedělní váhy, vykreslení a ruční
zápis výsledků jsou deterministické a stojí `$0`.

### Jak se vybírá obrázek k článku

Obě redakce sdílejí jeden žebřík jistoty a procházejí ho až po napsání článku.
U osoby platí fotografie, kterou uvádí její vlastní položka na Wikidatech, jinak nic;
pak přijdou ručně prohlédnuté snímky, pak licencované vyhledávání podle zadání, které
redakce k článku napsala, pak generovaná ilustrace a nakonec kreslená deska. Před
připojením se na skutečné náhledy podívá model a jeho verdikt — kolik kandidátů viděl,
jak je ohodnotil a co u kterého vetoval — se ukládá vedle balíčku do
`state/ventures/<projekt>/image-selections/` — složka vznikne s prvním článkem, který
tudy projde, takže dokud tam nic není, ještě žádný běh se k ní nedostal. Selhání kontroly, vyčerpaný strop i
nečitelný náhled znamenají totéž: obrázek klesne o příčku níž. Vydání to nikdy
nezastaví. Generovaná ilustrace se v alternativním textu vždy označí za ilustraci, nikdy
za fotografii.

## Data a soukromá správa

Základní stav je ve složce `state/`. Veřejný web z něj čte jen znovu ověřené a
bezpečné části. Chybějící údaj se zobrazí jako nedostupný, ne jako nula. Zkušební data
jsou viditelně označená a nepočítají se jako skutečný výsledek.

`/admin` bez kompletního jména a hesla vrací `503`; bez správného přihlášení `401`.
V produkci se hodnocení, ručně zadané kurzy, opravy sporů a schválení, dokončení či
výsledky Door Money zapisují přes GitHub token omezený jen na tento repozitář. Bez něj
zápis bezpečně selže.

Web automaticky nesbírá návštěvnost, čtenost ani výsledky příspěvků. Majitel může v
chráněné správě ručně zapsat výsledek konkrétní jazykové verze BOOKSOFHISTORY i
výsledek Door Money vedle původního záměru; systém se nepřipojuje k analytice ani sociální
síti. Totéž platí pro výsledky Tehdejšího světa a Kvóra: majitel je váže ke konkrétnímu
uloženému návrhu nebo ručnímu potvrzení zveřejnění a systém nečte produkt, platformu ani
jejich analytiku. Přepínač
`METRICS_INGESTION_ENABLED` zůstává vypnutý a role SPLIT nepracuje. REACH je také
vypnutý, dokud je tvorba sociálního obsahu pro MMA Files zamčená.

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

Zkušební porady zapisují jen do dočasných složek. Všechno, co musí udělat majitel, je
v jediném dokumentu `docs/NEEDED.md`: úkoly v pořadí, které odblokuje nejvíc, referenční
tabulky, postup, jak dohledat prázdný den, a ověřovací kroky pro každou cestu.
Úplný samostatný popis systému je v `docs/ECOSYSTEM.md`.
