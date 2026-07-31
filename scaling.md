# BoardlessAI — financování a škálování

Operating (pre-revenue) režim platí od 2026-08-01 (viz `state/BUSINESS.md`).
Stack je v `about-project.md`; účetnictví žije v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Ověřený spend: **$0.00**. Hard cap: **$20 / měsíc**. API cap je $15 a media cap $2.
- Každý externí výdaj schvaluje člověk (položka `HUMAN_APPROVAL` / `SPEND`); agent nedrží platební údaje.
- Deterministická media a e-mail mají plánovaný náklad $0. Projekty používají
  existující Vercel Pro subscription, proto je inkrementální hostingový náklad
  $0. Odchod z Pro nebo změna alokace faktury znovu otevře kontrolu capu.

## Odkud brát peníze

- Founder-funded bootstrap (výchozí), cloud/API kredity a granty, customer-funded revenue po validaci nabídky, případně externí kapitál.

## Kdy škálovat (a finanční dopad)

- **Databáze** — až při reálné zátěži, ne podle počtu uživatelů.
- **Fronta / workers** — až při souběžném zpracování nad rámec jednoho writeru.
- **Assets / traffic** — až při potvrzeném objemu.

## Kontrola nákladů

Týdně sledovat ledger; před větším výdajem nebo fundraisingem projít kontrolní body a hard cap.
