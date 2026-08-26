# O projektu BoardlessAI

BoardlessAI je systém, ve kterém skupina AI rolí připravuje podklady, vede porady a
ukládá výsledky tak, aby šlo zpětně dohledat, proč něco navrhla. Pevná pravidla hlídají
důkazy, náklady, bezpečnost a to, co smí udělat jen majitel.

Aktuální stav: **v provozu, bez příjmů, ve fázi ověřování**. Web běží na Vercel Pro:
<https://boardless-ai.vercel.app>. Systém má jedenáct pracovních projektů: Caught Up
(veřejně DNESKAi), Titty Tuesdays, GoVIRAL, marketingShark, BOOKSOFHISTORY,
FightAIQ, Design Lab, MMA Files, Door Money, Tehdejší svět a Kvórum.
Magazine Incubator byl uzavřen — nové magazíny se už nevymýšlejí.

**Co už publikuje (k 12. srpnu 2026):** publikují dva projekty — DNESKAi denní vydání a
MMA Files jeden článkový slot denně. Oba posílají hotový článek zároveň do Carousel
Studia jako *summary* (titulek, perex a vybrané pasáže), ze kterého se skládají sociální
karusely. Ostatní projekty zatím nepublikují; na co každý čeká, je v
`docs/NEEDED.md`. marketingShark nepublikuje vůbec: jeho karusely vznikají rovnou
jako koncepty ve frontě ke schválení a rozhoduje o nich majitel. BOOKSOFHISTORY také
jen připravuje koncepty; majitel každou jazykovou verzi schválí, vykreslí v Design
Labu a zveřejní ručně. Tehdejší svět také připravuje jen návrhy: česko-ukrajinské
rodinné příběhy vznikají z jednoho ručně spravovaného souboru faktů a majitel je
zveřejňuje ručně. Kvórum má hotovou cestu pro zdrojované české politické návrhy, ale
jeho placený běh čeká na podpis zakládajícího a kapacitního rozhodnutí. Ani jeden z
těchto projektů neumí publikovat sám.

## Jak je systém poskládaný

```text
GitHub Actions / příkazová řádka
              │
              ▼
     TypeScript řízení porad
     ├─ rozpis, agendy a výběr rolí
     ├─ limity nákladů a kontrola zdrojů
     ├─ porady všech jedenácti projektů
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

- **Caught Up** připravuje anglický a český článek a právě jeden hlavní obrázek z
  povolené licencované knihovny nebo z bezpečné náhradní grafiky. Hotový balíček přes
  omezenou GitHub App zapíše do `lukaskourilcz/aifirst` a po nasazení automaticky
  ověří oba jazyky, obrázek, zdroj fotografie a otisk obsahu.
- **Titty Tuesdays** připravuje značku, témata a marketing. Nemá e-shop, sklad,
  platby, reklamy ani automatické zveřejňování.
- **GoVIRAL** je týdenní trendová porada (pondělí 13:00). Ze zdrojovaných dat udělá
  jeden brief pro majitele, marketingové nápady pro oba magazíny a nejvýše jednu agendu
  předanou jiné poradě. Stávající zdroje bere z Apify na Free plánu, jehož měsíční kredit
  5 dolarů je zároveň limitem — žádná karta není v systému. Anglické termíny Door Money
  měří zvláštní bezklíčovou cestou přes Google News, takže nepřidávají aktor, kvótu ani
  placený zdroj.
- **marketingShark** dělá marketingové podklady pro produkty z portfolia. Jedna porada
  denně v 07:00 vezme jednu otázku z kvízu devSharku a udělá z ní jeden český a jeden
  anglický pětislidový karusel. Vykreslí ho Design Lab a hotový balíček skončí jako
  koncept ve frontě ke schválení; marketingShark nemá sociální účet ani přihlašovací
  údaje, takže zveřejnit nic neumí. devShark je zatím jediná zapnutá značka — jeho banku
  3 633 otázek o webovém vývoji systém jen čte z připnutého otisku a v jeho repozitáři nic
  nemění. geoShark je v konfiguraci od začátku a vypnutý; zapnout ho znamená jeden import
  a jednu změnu `false` na `true`.
- **FightAIQ** spravuje zdrojovaná data o UFC a Oktagonu a počítá analýzy v kódu.
  Analýzy smí spustit jen pro ověřené zápasy a karty: neumí sázet, otevírat sázkové
  účty ani slibovat výhru.
- **Design Lab** je pracovní nástroj na sociální obsah, ne galerie šablon. Jedna
  záložka `studio` v administraci ukazuje každý doručený článek obou magazínů i schválené
  summary podporovaných projektů, vykreslí jejich karusely skutečným enginem ve všech
  čtyřech formátech a nechá majitele přepnout
  rodinu, variantu, úpravu fotky, velikost písma a fázi rytmu — a to všechno je jeden
  zapsaný recept, který si pipeline sama odvodí při doručení. Deset rodin šablon
  (masthead, gutter, bevel, porthole, slab, terrace, figure, pull, tower, dossier)
  založilo knihovnu, kterou dalších třináct rozšířilo na 23 odlišných rodin. Ty nahradily
  pět tapet, které byly ve třech případech tentýž rozmazaný gradient. Písma
  jsou od 9. srpna 2026 v repozitáři: třicet statických řezů pod licencí SIL OFL, takže
  stejný deck vykreslí stejné bajty na jakémkoli stroji. Knihovna drží devět barevných
  sad: DNESKAi, MMA Files, Titty Tuesdays, devShark, geoShark, BOOKSOFHISTORY, Door
  Money, Tehdejší svět a Kvórum. Design Lab nemá vlastní sociální účet.
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
  jediná cesta k obrázku a zveřejnění zůstává ruční. Dokud majitel nepodepíše zakládající
  rozhodnutí a zvláštní přesun denní rozpočtové kapacity, běží jen fixture monitor za
  `$0`; nevznikne externí ani modelové volání.

## Denní rozpis a peníze

Společný pražský rozpis má osmnáct denních oken, jedno každou hodinu od 05:00 do
22:00:

| Praha | Okno | Kdy skutečně pracuje |
| ---: | --- | --- |
| 05:00 | DNESKAi vydání | pevná služba; jen s důkazy a otevřenými live branami |
| 06:00 | ranní rada | rozhodovací porada; nejvýše jedna odborná zakázka |
| 07:00 | marketingShark | jeden koncept pro každou zapnutou značku |
| 08:00 | FightAIQ intake | jen při změně zdrojů nebo platné agendě |
| 09:00 | MMA Files redakce | přidělí nebo zruší jeden denní článkový slot |
| 10:00 | MMA Files článek | jen přidělený slot s úplnými důkazy |
| 11:00 | Titty Tuesdays | stálé pre-commerce marketingové okno |
| 12:00 | BOOKSOFHISTORY | pokračuje v rozepsaném výběru, výzkumu nebo tvorbě |
| 13:00 | GoVIRAL | placený brief jen v pondělí; jinak `$0` |
| 14:00 | odpolední rada | deterministický kontrolní zápis za `$0` |
| 15:00 | Door Money návrhy | denní stůl za soukromou znalostní a rozpočtovou branou |
| 16:00 | Door Money růst | placený balíček jen ve čtvrtek; jinak `$0` |
| 17:00 | DNESKAi produkt | pevná produktová kontrola |
| 18:00 | Tehdejší svět | jedna plánovací nebo dvojjazyčná produkční fáze; live běh je zatím zamčený |
| 19:00 | FightAIQ analýza | jen s agendou a splněnými důkazními branami |
| 20:00 | MMA Files desk | jen s platnou agendou |
| 21:00 | Kvórum | registrovaný fixture-only stůl, dokud chybí dva podpisy |
| 22:00 | noční rada | kontrolní zápis a digest za `$0` |

Vercel drží dvě UTC varianty každého okna kvůli letnímu a zimnímu času; DNESKAi má
navíc dvě retry varianty. Z 38 cron záznamů proto vzniká 18 cest a 19 unikátních UTC
výrazů. Program přijme jen variantu, která odpovídá dnešnímu času v Praze.

Kterou poradu spustit, určuje **spouštěč, který se ozval**, ne hodiny v okamžiku startu.
GitHub úlohy podle rozpisu často odloží — 2. srpna o 13 až 54 minut — a dřívější odvození
z nástěnných hodin mělo toleranci jen dvacet minut: sedm ze čtrnácti porad se ten den
nekonalo a jedna se spustila jako sousední porada. Spouštěč poradu pojmenuje sám, takže
zpoždění už nevadí.

V 06:00 rozhodne hlavní rada, které odborné porady jsou opravdu potřeba. Odpoledne a večer
se už jen bez placených modelů zapíše stav. GoVIRAL platí model jen v pondělí; Door Money
má denní návrhový stůl v 15:00 a růstová porada platí model jen ve čtvrtek. Večerní
analýzy FightAIQ a redakční kontrola MMA Files vyžadují platnou agendu. BOOKSOFHISTORY
má stálé denní okno, ale pokračuje jen v aktuální fázi; zmeškanou práci nepřeskočí a při
nedostatku rozpočtu cyklus protáhne za `$0`. Tehdejší svět v 18:00 střídá plánování a
produkci; nedělní učení je v aktuálním kódu deterministické a stojí `$0`.

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
