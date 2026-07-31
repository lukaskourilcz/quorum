# BoardlessAI — financování a škálování

Operating (pre-revenue) režim platí od 2026-08-01 (viz `state/BUSINESS.md`).
Stack je v `about-project.md`; účetnictví žije v `state/finance/` a
`state/treasury/`.

## Peníze teď

- Ověřený spend: **$0.00**. Hard cap: **$20 / měsíc**. Nepodepsaná Shape B drží API cap $15 / měsíc a $0.70 / den; media cap je $2.
- Podepsaná Shape A může zvýšit API cap na $18 / měsíc a $1.00 / den. Tím se rezerva pod hard capem zmenší; scheduler proto zachovává headroom degradation a nejdřív vypíná incubator a TT.
- Každý externí výdaj schvaluje člověk (položka `HUMAN_APPROVAL` / `SPEND`); agent nedrží platební údaje.
- Deterministická media a jeden denní e-mail digest mají plánovaný náklad $0. Projekty používají
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
