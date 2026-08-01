# BoardlessAI — financování a růst

Operating (pre-revenue) režim platí od 2026-08-01 (viz `state/BUSINESS.md`).
Technický přehled je v `about-project.md`; účetnictví je v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Zaznamenané náklady se počítají z uložené historie API volání. Podepsané rozhodnutí `budget-2026-08d` nastavuje společný limit **$50 / měsíc**, z toho $42 pro modely a $2.20 denně. Při 80 % systém varuje; při 100 % nebo po třech vyčerpaných dnech další náklady zastaví.
- Každý externí výdaj schvaluje člověk (položka `HUMAN_APPROVAL` / `SPEND`); agent nedrží platební údaje.
- Obrázky vytvářené přímo v kódu a jeden denní e-mailový souhrn mají plánovaný
  náklad $0. Projekty používají existující Vercel Pro, proto je jejich dodatečný
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
- GitHub Actions používá 17 jedinečných UTC spuštění místo 28 překrývajících se
  letních a zimních záznamů. To snižuje počet zbytečných běhů bez vlivu na obsah.
- Přepínače agentů v `/admin` vynechají vypnuté volitelné role ještě před API voláním. Sociální role jsou teď vypnuté pro Caught Up a MMA Files.
- Karusely, sociální obrázky a hero obrázky vznikají deterministicky v kódu a nestojí žádné API peníze. Jejich vypnutí šetří místo v repozitáři a čas, ne modelové poplatky.
- Caught Up dál používá Claude Sonnet pro výběr tématu, anglický článek a českou verzi. Tyto tři kroky přímo určují kvalitu vydání, takže je bez srovnávacího testu nepřepínáme na levnější model.
- Anglický writer dostává vybrané zdroje a nejvýše 12 dalších položek pro Watchlist. Dříve dostával dlouhý seznam všech URL, i když z něj nemohl čerpat další obsah.

Kvalitativně důležité modely pro výběr tématu, psaní a českou verzi zůstávají stejné.
Největší bezpečná úspora je méně zbytečných volání, ne levnější model na finální text.

Týdně kontrolujte historii nákladů. Před větším výdajem nebo hledáním investora znovu projděte schválení a společný limit.
