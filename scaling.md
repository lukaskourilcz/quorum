# BoardlessAI — financování a růst

Operating (pre-revenue) režim platí od 2026-08-01 (viz `state/BUSINESS.md`).
Technický přehled je v `about-project.md`; účetnictví je v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Zaznamenané náklady se počítají z uložené historie API volání. Podepsané rozhodnutí `budget-2026-08e` nastavuje společný limit **$30 / měsíc**, z toho $25 pro modely a $1.00 denně. Při 80 % systém varuje; při 100 % nebo po třech vyčerpaných dnech další náklady zastaví.
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

## Kontrola nákladů

- Placená firemní rada se schází jednou v 06:00. Časy 14:00 a 22:00 jsou kontrolní
  zápisy bez modelu. Odborné porady se otevřou jen s konkrétní agendou; FightAIQ také
  při skutečné změně zdrojových dat. Nepotřebný čas stojí $0.
- GitHub Actions běží na **pěti** rozvrzích místo dřívějších desítek překrývajících se
  letních a zimních záznamů: jeden hodinový dispatcher pojmenuje poradu podle spouštěče,
  který se ozval, takže zpoždění nevadí a nepotřebné běhy nevznikají. Zálohování je
  jedno místo osmnácti.
- Přepínače agentů v `/admin` vynechají vypnuté volitelné role ještě před API voláním. Sociální texty vznikají uvnitř stávajícího článkového volání, takže kvůli nim nevzniká další volání modelu.
- Sociální obrázky vykresluje jediný Carousel Studio engine z živé šablony, obsahu a
  barev konkrétní značky; stejný vstup má stejný otisk a nestojí žádné API peníze.
  Náhradní hero obrázky také vznikají v kódu. Licencované fotografie se pouze stáhnou,
  zkontrolují, zmenší a uloží; chybějící Pexels/Pixabay klíč neblokuje náhradní grafiku.
- GoVIRAL čte trendová data přes Apify na **Free plánu**. Jeho měsíční kredit 5 dolarů
  *je* limit: aktory se zastaví, jakmile dojde, žádná karta v systému není a přečerpání
  není možné. Zapsaný recept stojí zhruba $1.03 týdně a $4.60 měsíčně; když měsíc běží
  horko, hlídač ubírá kroky od konce, ne od začátku. Starter za $29/měsíc by sám snědl
  celý třicetidolarový limit, takže nic zde nesmí předpokládat placený plán.
- Doručený článek posílá do Carousel Studia jen *summary*, ne celý text, a skládá se
  aritmeticky bez volání modelu. Karusel proto nestojí nic navíc a stejný článek dá vždy
  stejné slidy.
- Caught Up dál používá Claude Sonnet pro výběr tématu, anglický článek a českou verzi. Tyto tři kroky přímo určují kvalitu vydání, takže je bez srovnávacího testu nepřepínáme na levnější model.
- Anglický writer dostává vybrané zdroje a nejvýše 12 dalších položek pro Watchlist. Dříve dostával dlouhý seznam všech URL, i když z něj nemohl čerpat další obsah.

Kvalitativně důležité modely pro výběr tématu, psaní a českou verzi zůstávají stejné.
Největší bezpečná úspora je méně zbytečných volání, ne levnější model na finální text.

Týdně kontrolujte historii nákladů. Před větším výdajem nebo hledáním investora znovu projděte schválení a společný limit.
