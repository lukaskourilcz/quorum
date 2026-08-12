# O projektu BoardlessAI

BoardlessAI je systém, ve kterém skupina AI rolí připravuje podklady, vede porady a
ukládá výsledky tak, aby šlo zpětně dohledat, proč něco navrhla. Pevná pravidla hlídají
důkazy, náklady, bezpečnost a to, co smí udělat jen majitel.

Aktuální stav: **v provozu, bez příjmů, ve fázi ověřování**. Web běží na Vercel Pro:
<https://boardless-ai.vercel.app>. Systém má osm pracovních projektů: Caught Up (veřejně
DNESKAi), Titty Tuesdays, GoVIRAL, marketingShark, BOOKSOFHISTORY, FightAIQ, Design
Lab a MMA Files.
Magazine Incubator byl uzavřen — nové magazíny se už nevymýšlejí.

**Co už publikuje (k 7. srpnu 2026):** publikují dva projekty — DNESKAi denní vydání a
MMA Files jeden článkový slot denně. Oba posílají hotový článek zároveň do Carousel
Studia jako *summary* (titulek, perex a vybrané pasáže), ze kterého se skládají sociální
karusely. Ostatní projekty zatím nepublikují; na co každý čeká, je v
`docs/NEEDED.md`. marketingShark nepublikuje vůbec: jeho karusely vznikají rovnou
jako koncepty ve frontě ke schválení a rozhoduje o nich majitel. BOOKSOFHISTORY také
jen připravuje koncepty; majitel každou jazykovou verzi schválí, vykreslí v Design
Labu a zveřejní ručně.

## Jak je systém poskládaný

```text
GitHub Actions / příkazová řádka
              │
              ▼
     TypeScript řízení porad
     ├─ rozpis, agendy a výběr rolí
     ├─ limity nákladů a kontrola zdrojů
     ├─ porady všech osmi projektů
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
     └─ chráněná správa projektů (rail podle projektů)
```

V rejstříku je 44 rolí, z toho **35 aktivních**: čtyři hlasující členové rady a 31
odborných rolí. Devět rolí bylo při zeštíhlení soupisky odstaveno a veřejný web počítá
jen ty pracující. Dvacet jedna aktivních rolí používá Anthropic a 14 OpenAI. Dvacet sedm
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
  předanou jiné poradě. Data bere z Apify na Free plánu, jehož měsíční kredit 5 dolarů
  je zároveň limitem — žádná karta není v systému.
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
  záložka `studio` v administraci ukazuje každý doručený článek obou magazínů, vykreslí
  jeho karusel skutečným enginem ve všech čtyřech formátech a nechá majitele přepnout
  rodinu, variantu, úpravu fotky, velikost písma a fázi rytmu — a to všechno je jeden
  zapsaný recept, který si pipeline sama odvodí při doručení. Deset rodin šablon
  (masthead, gutter, bevel, porthole, slab, terrace, figure, pull, tower, dossier)
  nahradilo pět tapet, které byly ve třech případech tentýž rozmazaný gradient. Písma
  jsou od 9. srpna 2026 v repozitáři: třicet statických řezů pod licencí SIL OFL, takže
  stejný deck vykreslí stejné bajty na jakémkoli stroji. Barevné sady drží pro šest
  značek; devShark a geoShark přibyly s marketingSharkem a BOOKSOFHISTORY doplnilo
  typografickou sadu bez obálek. Design Lab nemá vlastní sociální účet.
- **BOOKSOFHISTORY** každý den ve 12:00 naváže na rozepsanou fázi výběru, výzkumu
  nebo tvorby. Z jednoho zdrojovaného dossieru vznikne společný příběhový brief a dva
  samostatně napsané české a anglické sociální koncepty. Nemá veřejný web, stránky
  knih, SEO archiv, databázi, newsletter, obchod, účet ani cestu ke zveřejnění. Obálky
  knih se nikdy nevykreslují; citace mají nejvýše 300 znaků a uvedený zdroj.
- **MMA Files** je veřejný anglicko-český magazín. BoardlessAI do jeho repozitáře posílá jen ověřené články a data z FightAIQ;
  rozepsané texty a interní poznámky zůstávají v chráněné administraci. Když FightAIQ
  nemá žádný nadcházející turnaj, redakce místo náhledu zápasu napíše profil nejlépe
  podloženého bojovníka — oba projekty na sobě nezávisí.

## Denní rozpis a peníze

Společný pražský rozpis má 14 kontrolních časů: 05:00, 06:00, 07:00, 08:00, 09:00, 10:00,
11:00, 12:00, 13:00, 14:00, 17:00, 19:00, 20:00 a 22:00. Sloty 18:00 a 21:00 zmizely se zrušením
večerního článkového slotu. Sedmá hodina zůstala po uzavření inkubátoru prázdná a od
7. srpna 2026 v ní sedí denní porada marketingSharku. Letní a zimní čas má každý
slot vlastní spouštění a program přijme jen tu variantu, která platí pro Prahu dnes.

Kterou poradu spustit, určuje **spouštěč, který se ozval**, ne hodiny v okamžiku startu.
GitHub úlohy podle rozpisu často odloží — 2. srpna o 13 až 54 minut — a dřívější odvození
z nástěnných hodin mělo toleranci jen dvacet minut: sedm ze čtrnácti porad se ten den
nekonalo a jedna se spustila jako sousední porada. Spouštěč poradu pojmenuje sám, takže
zpoždění už nevadí.

V 06:00 rozhodne hlavní rada, které odborné porady jsou opravdu potřeba. Odpoledne a večer
se už jen bez placených modelů zapíše stav. Porady Titty Tuesdays, GoVIRAL, Carousel
Studia, večerní analýzy FightAIQ a redakční kontrola MMA Files se spustí jen s platnou
agendou. BOOKSOFHISTORY má stálé denní okno, ale pokračuje jen v aktuální fázi;
zmeškanou práci nepřeskočí a při nedostatku rozpočtu cyklus protáhne za `$0`.

Když nějaká brána poradu vypne, zapíše se do `state/meetings/skips/` důvod a kalendář slot
označí jako **Skipped** s vysvětlením v popisku. Prázdný den tak řekne, kterou bránu
otevřít, místo aby vypadal jako porucha.

Podepsané rozhodnutí `budget-2026-08e` stanovuje celkový měsíční limit **30 dolarů**,
z toho 25 dolarů pro modely a API a denní tempo 1,00 dolaru. Nahrazuje starší
`budget-2026-08d` (50 / 42 / 2,20). Jeden resolver drží tyto částky pro celý běh; každá
fáze si limit smí jen utáhnout, nikdy povolit. Systém si limit nesmí zvýšit sám a platby
vždy provádí člověk.

BOOKSOFHISTORY má uvnitř těchto společných limitů ještě nižší stropy na výzkum:
nejvýše 0,10 dolaru za volání, 0,50 dolaru za cyklus a 5 dolarů za měsíc. Stejný
výzkum se pro druhý jazyk neopakuje a zámek `(bookId, briefHash)` brání dvojímu
účtování.

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
V produkci se hodnocení, ručně zadané kurzy a opravy sporů zapisují přes
GitHub token omezený jen na tento repozitář. Bez něj zápis bezpečně selže.

Web automaticky nesbírá návštěvnost, čtenost ani výsledky příspěvků. Přepínač
`METRICS_INGESTION_ENABLED` zůstává vypnutý a role SPLIT nepracuje. U
BOOKSOFHISTORY může majitel v chráněné správě ručně zapsat výsledek konkrétní
jazykové verze; systém kvůli tomu neotevře kanál ani nespustí sběr. REACH je také
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
