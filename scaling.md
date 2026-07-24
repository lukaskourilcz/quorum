# BoardlessAI — financování a škálování

Autonomní venture-builder. Stack je v `about-project.md`; podrobné účetnictví žije v `state/finance/` a `state/treasury/`.

## Peníze teď

- Ověřený spend: **$0.00**. Hard cap: **$20 / měsíc** (20 % rezerva → k dispozici ~$16).
- Každý externí výdaj schvaluje člověk (položka `HUMAN_APPROVAL` / `SPEND`); agent nedrží platební údaje.

## Odkud brát peníze

- Founder-funded bootstrap (výchozí), cloud/API kredity a granty, customer-funded revenue po validaci nabídky, případně externí kapitál.

## Kdy škálovat (a finanční dopad)

- **Databáze** — až při reálné zátěži, ne podle počtu uživatelů.
- **Fronta / workers** — až při souběžném zpracování nad rámec jednoho writeru.
- **Assets / traffic** — až při potvrzeném objemu.

## Kontrola nákladů

Týdně sledovat ledger; před větším výdajem nebo fundraisingem projít kontrolní body a hard cap.
