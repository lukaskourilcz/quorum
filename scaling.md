# BoardlessAI — financování a růst

Provozní režim bez příjmů platí od 2026-08-01 (viz `state/BUSINESS.md`).
Technický přehled je v `about-project.md`; účetnictví je v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Zaznamenané náklady se počítají z uložené historie API volání. Podepsané rozhodnutí `budget-2026-08e` nastavuje společný limit **$30 / měsíc**, z toho $25 pro modely a $1.00 denně. Při 80 % systém varuje; při 100 % nebo po třech vyčerpaných dnech další náklady zastaví. Soubor fixních nákladů nyní uvádí $0, ale předplacený kredit fal.ai ještě není smířený, takže nejde o úplně odsouhlasený all-in účet.
- Každý externí výdaj schvaluje člověk (položka `HUMAN_APPROVAL` / `SPEND`); agent nedrží platební údaje.
- Obrázky vytvářené přímo v kódu mají plánovaný náklad $0. Denní souhrn se nikam
  neposílá e-mailem — čte se na webu v sekci **Results**, takže nevyžaduje žádného
  poskytovatele ani jeho tarif. Projekty používají existující Vercel Pro, proto je jejich dodatečný
  náklad na hosting $0. Změna tarifu nebo rozdělení faktury znovu otevře kontrolu limitu.

## Odkud brát peníze

- Vlastní peníze zakladatele (výchozí), cloud/API kredity a granty, platby zákazníků po ověření nabídky, případně externí kapitál.

## Kdy škálovat (a finanční dopad)

- **Databáze** — až při reálné zátěži, ne podle počtu uživatelů.
- **Fronta / workers** — až při souběžném zpracování nad rámec jednoho writeru.
- **Assets / traffic** — až při potvrzeném objemu.

## Náklady podle projektu

Všechny řádky níže jsou podřízené společnému limitu `$30` měsíčně, modelovému a API
podílu `$25` a tempu `$1.00` denně. Obálka je nejvyšší povolená částka, ne očekávaná
útrata. Pozastavená, prázdná nebo důkazy zablokovaná cesta stojí `$0`.

| Projekt | Aktuální nákladová hranice |
| --- | --- |
| **DNESKAi / Caught Up** | Rejstřík vyhrazuje `$0.08` pro vydání v 05:00 a `$0.08` pro produktovou kontrolu v 17:00. Kvalitativní kroky používají stávající modely a společný ledger. |
| **MMA Files** | Redakce má `$0.05`, jeden denní článek `$0.16` a desk s povinnou agendou `$0.05`. Chybějící důkazy článek ukončí před voláním. |
| **FightAIQ** | Intake i analýza mají po `$0.06`; predikce samotná je deterministický kód. Zdrojová vrstva má `$3` podíl na společném Apify Free kreditu, ale povolené keyless a free-tier zdroje nesmějí vytvořit hotovostní náklad. |
| **Design Lab** | Šablony, písma, SVG, PNG, recepty a exporty běží lokálně za `$0`; není tu modelový, výzkumný ani hostingový příplatek. |
| **marketingShark** | Jedno volání za zapnutou značku má obálku `$0.10`; jedna aktivní značka vychází přibližně na `$1.50` měsíčně. |
| **GoVIRAL** | Pondělní modelová porada má `$0.06`, ostatní dny `$0`. Apify recept je odhadnutý na `$4.60` měsíčně, ale tvrdě jej zastaví sdílený `$5` Free kredit; Door Money a Tehdejší svět používají bezklíčové měření za `$0`. |
| **Titty Tuesdays** | Denní pre-commerce porada má `$0.08`. Volitelná úterní vizuální cesta je vypnutá bez šesti podpisů, obou klíčů a přepínače; po otevření má vlastní strop `$2.00` měsíčně. |
| **BOOKSOFHISTORY** | Desk smí utratit nejvýše `$0.50` za cyklus; výzkum `$0.10` za volání a `$5.00` měsíčně. Celkový modelový plán je `$6–8` měsíčně, ale živá cesta čeká na zakládající podpis a do té doby stojí `$0`. |
| **Door Money** | Jednorázová ingestace má strop `$3.00` celkem. Denní desk má `$0.08`, čtvrteční BOOKER `$0.06`; běžný modelový odhad je přibližně `$2.50` měsíčně. GoVIRAL termíny používají bezklíčový zdroj za `$0`. |
| **Tehdejší svět** | Běh sdílí obálku `$0.25`; výzkum má `$0.30` za brief a `$2.00` měsíčně, modelový cíl nejvýše `$4.00` měsíčně. Zakládající rozhodnutí je nepodepsané, takže live náklad je zatím `$0`. |
| **Kvórum** | Deklarovaná denní obálka je `$0.10`, modelový KPI strop `$3.00` měsíčně a Apify podíl `$2.00` uvnitř stejného `$5` Free kreditu. Zakládající i kapacitní rozhodnutí chybí, takže externí a modelová cesta stojí `$0`. |

## Kontrola nákladů

- Placená firemní rada se schází jednou v 06:00. Časy 14:00 a 22:00 jsou kontrolní
  zápisy bez modelu. Odborné porady se otevřou jen s konkrétní agendou; FightAIQ také
  při skutečné změně zdrojových dat. marketingShark a návrhový stůl Door Money běží
  denně, GoVIRAL platí model jen v pondělí a růstová porada Door Money jen ve čtvrtek.
  BOOKSOFHISTORY má stálé denní okno a vždy naváže jen na svou rozepsanou fázi.
  Tehdejší svět má denní dvoufázové okno v 18:00; jeho aktuální nedělní učení je
  deterministické a stojí $0. Nepotřebný čas stojí $0.
- GitHub Actions běží na **pěti** rozvrzích místo dřívějších desítek překrývajících se
  letních a zimních záznamů: jeden hodinový dispatcher pojmenuje poradu podle spouštěče,
  který se ozval, takže zpoždění nevadí a nepotřebné běhy nevznikají. Zálohování je
  jedno místo osmnácti.
- Přepínače agentů v `/admin` vynechají vypnuté volitelné role ještě před API voláním. U obou magazínů vznikají sociální texty uvnitř stávajícího článkového volání, takže kvůli nim nevzniká další volání modelu.
- Sociální obrázky vykresluje jediný engine Design Labu z živé šablony, obsahu a
  barev konkrétní značky; stejný vstup má stejný otisk a nestojí žádné API peníze.
  Celá cesta Design Labu stojí $0: rodiny šablon, dvacet tři rodin místo pěti tapet, se
  vykreslují v kódu, písma leží v repozitáři a rasterizér nechodí na síť. Popisky,
  hashtagy, text pro Threads a řádek do story píše stejné volání, které píše článek —
  žádné nové placené volání nevzniklo, jen se dvěma stávajícím zvedl strop výstupu
  (článek MMA Files 1 700 → 2 100, vydání DNESKAi 6 500 → 7 100 tokenů). Recept a
  balíček textů se zapisují při doručení; zápis do repozitáře nestojí nic a
  nepotřebuje zapnutý kanál.
  Náhradní hero obrázky také vznikají v kódu. Licencované fotografie se pouze stáhnou,
  zkontrolují, zmenší a uloží; chybějící Pexels/Pixabay klíč neblokuje náhradní grafiku.
- Každý hero obrázek prochází od 9. srpna 2026 obrazovou kontrolou (rozhodnutí
  `article-image-fit-2026-08-08`). Jedno volání posoudí celý užší výběr na malém modelu,
  který už firma platí: strop je $0.02 na článek a $0.10 na den pro celou obrazovou
  linku, což při plné kadenci vychází pod $1 měsíčně. Generovaná ilustrace stojí zhruba
  $0.004 za kus a smí vzniknout nejvýše dvakrát denně, tedy asi $0.09 měsíčně na stropu;
  běží jen s `FAL_KEY` a `ARTICLE_ILLUSTRATION_ENABLED`, majitel ji zapnul 8. srpna 2026 a
  platí ji z předplaceného kreditu, ne z předplatného. Vyčerpaný strop nikdy nezastaví
  vydání — obrázek klesne o příčku níž, v krajním případě na kreslenou desku za $0.
- GoVIRAL čte trendová data přes Apify na **Free plánu**. Jeho měsíční kredit 5 dolarů
  *je* limit: aktory se zastaví, jakmile dojde, žádná karta v systému není a přečerpání
  není možné. Zapsaný recept stojí zhruba $1.03 týdně a $4.60 měsíčně; když měsíc běží
  horko, hlídač ubírá kroky od konce, ne od začátku. Starter za $29/měsíc by sám snědl
  celý třicetidolarový limit, takže nic zde nesmí předpokládat placený plán.
  Door Money do tohoto receptu nepřidává aktor ani kvótu: jeho čtyři anglické termíny
  rotují po třech přes bezklíčový Google News sběr a brief smí označit jen skutečně
  změřený termín.
- Doručený článek posílá do Carousel Studia jen *summary*, ne celý text, a skládá se
  aritmeticky bez volání modelu. Karusel proto nestojí nic navíc a stejný článek dá vždy
  stejné slidy.
- marketingShark má poradu každý den v 07:00 a v ní jediný placený krok: jedno volání
  modelu na značku a den pro české a anglické texty. Výběr otázky, přiřazení háčku,
  kontroly pravdivosti, vykreslení i zápis do fronty jsou deterministický kód za $0.
  Vychází to zhruba na **$1.50 měsíčně** s jednou zapnutou značkou a **$3.00** se dvěma.
  MAKO má týdenní kontrolu popsanou v `orchestrator/prompts/marketingshark/strategy.md`,
  ale zatím ji nemá kam poslat — žádná porada ji nespouští, takže se nic neúčtuje. Až se
  zapojí, přidá zhruba $0.16 měsíčně. Žádné fixní náklady, žádná hotovost, žádná položka
  v pokladně.
- BOOKSOFHISTORY má denní okno ve 12:00, ale jeden cyklus postupuje přes výběr,
  výzkum a tvorbu a po zmeškaném dni se jen obnoví. Placený výzkum má tvrdý strop
  **$0.10 za volání, $0.50 za cyklus a $5.00 za měsíc** a je idempotentní podle
  `(bookId, briefHash)`. Stejný dossier slouží české i anglické verzi a může se použít
  znovu. Při tlaku na rozpočet se dva kandidáti zmenší na jednoho, pak se cyklus
  protáhne za $0 a nakonec se okno vypustí; strop se nikdy nezvýší. Plánovaný celkový
  modelový náklad je přibližně **$6–8 měsíčně** při počáteční kadenci, ale výzkumná
  část nikdy nesmí překročit $5. Výběr ze seed knihovny, hodnocení, kontrola,
  vykreslení bez obálky a ruční zápis výsledku stojí $0.
- Door Money má jednorázovou, majitelem spouštěnou ingestaci s tvrdým stropem **$3.00**
  celkem, nejvýše $0.80 denně a $0.10 na volání; odhad jejího běžného dokončení je
  $1.10–1.50. Denní GHOST stojí přibližně $1.80–2.10 měsíčně a čtvrteční BOOKER asi
  $0.35 měsíčně, tedy provozní odhad přibližně **$2.50 měsíčně** uvnitř společného
  modelového limitu. Ostatní dny růstová porada zapisuje $0. Soukromé úložiště je
  stávající Git/GitHub cesta, výběr a váhy jsou deterministické, Design Lab vykresluje
  za $0 a nový fixní ani placený datový náklad nevzniká.
- Tehdejší svět má společnou obálku **$0.25 na běh**, výzkumný strop **$0.30 za
  brief** a **$2.00 za měsíc** a modelový cíl nejvýše **$4.00 měsíčně**. Dvoudenní
  cyklus používá placený krok při plánování a při nezávislém českém a ukrajinském
  psaní; faktická a citlivostní kontrola, skórování, aktuální nedělní váhy, vykreslení
  i ruční výsledky jsou kód za $0. Soubor potvrzených faktů spravuje majitel v tomto
  repozitáři. Existující produkt zůstává v samostatném repozitáři bez runtime spojení,
  takže nevzniká nový hosting, databáze, analytika ani placený kanál.
- Kvórum má deklarovanou obálku **$0.10 na den**, modelový KPI strop **$3.00 měsíčně**
  a vlastní **$2.00 měsíční podíl** uvnitř stejného Apify Free kreditu. Odhadovaný
  modelový běh je přibližně $2.20 měsíčně. Zakládající rozhodnutí i oddělený přesun
  nejméně $0.08 denní kapacity jsou nepodepsané, takže monitor zůstává fixture-only,
  nevolá Apify ani model a stojí $0. Kvórum nesmí samo upgradovat tarif ani přesunout
  rozpočet.
- Caught Up dál používá Claude Sonnet pro výběr tématu, anglický článek a českou verzi. Tyto tři kroky přímo určují kvalitu vydání, takže je bez srovnávacího testu nepřepínáme na levnější model.
- Anglický writer dostává vybrané zdroje a nejvýše 12 dalších položek pro Watchlist. Dříve dostával dlouhý seznam všech URL, i když z něj nemohl čerpat další obsah.

Kvalitativně důležité modely pro výběr tématu, psaní a českou verzi zůstávají stejné.
Největší bezpečná úspora je méně zbytečných volání, ne levnější model na finální text.

Týdně kontrolujte historii nákladů. Před větším výdajem nebo hledáním investora znovu projděte schválení a společný limit.
