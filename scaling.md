# BoardlessAI — financování a růst

Operating (pre-revenue) režim platí od 2026-08-01 (viz `state/BUSINESS.md`).
Technický přehled je v `about-project.md`; účetnictví je v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Ověřené náklady: **$0.00**. Dokud majitel nepodepíše `budget-2026-08d`, platí bezpečný celkový limit **$20 / měsíc**, z toho $15 pro modely a $0.70 denně.
- Podepsané rozhodnutí `budget-2026-08d` zvýší jeden společný limit na **$50 / měsíc**, z toho $42 pro modely a $2.20 denně. Při 80 % systém varuje; při 100 % nebo po třech vyčerpaných dnech další náklady zastaví.
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

Týdně kontrolovat historii nákladů; před větším výdajem nebo hledáním investora projít schválení a společný limit.
