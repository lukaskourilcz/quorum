# O projektu BoardlessAI

BoardlessAI je systém, ve kterém skupina AI rolí připravuje podklady, vede porady a
ukládá výsledky tak, aby šlo zpětně dohledat, proč něco navrhla. Pevná pravidla hlídají
důkazy, náklady, bezpečnost a to, co smí udělat jen majitel.

Aktuální stav: **v provozu, bez příjmů, ve fázi ověřování**. Web běží na Vercel Pro:
<https://boardless-ai.vercel.app>. Systém má šest pracovních projektů: Caught Up,
Titty Tuesdays, Magazine Incubator, FightAIQ, Carousel Studio a MMA Files.

## Jak je systém poskládaný

```text
GitHub Actions / příkazová řádka
              │
              ▼
     TypeScript řízení porad
     ├─ rozpis, agendy a výběr rolí
     ├─ limity nákladů a kontrola zdrojů
     ├─ porady všech šesti projektů
     └─ jeden denní souhrn
              │
              ▼
          state/ v Gitu
     ├─ úplné interní záznamy
     └─ bezpečné veřejné výstupy
              │
              ▼
           Next.js web
     ├─ veřejné stránky a kalendář
     └─ chráněná správa projektů
```

Systém má 40 rolí: čtyři hlasující členy rady a 36 odborných rolí. Dvacet jedna rolí
používá Anthropic a 19 OpenAI. Každá role má na veřejném webu vlastní ilustraci
vytvořenou přímo v kódu. Vzhled seriálu, sezony a epizody se nikdy neposílají modelům
ani do podkladů porad.

## Projekty

- **Caught Up** připravuje anglický a český článek a právě jeden hlavní obrázek z
  povolené licencované knihovny nebo z bezpečné náhradní grafiky. Hotový balíček přes
  omezenou GitHub App zapíše do `lukaskourilcz/aifirst` a po nasazení automaticky
  ověří oba jazyky, obrázek, zdroj fotografie a otisk obsahu.
- **Titty Tuesdays** připravuje značku, témata a marketing. Nemá e-shop, sklad,
  platby, reklamy ani automatické zveřejňování.
- **Magazine Incubator** hledá podložené nápady na publikace. Pokud návrh splní
  předem podepsanou šablonu bez nového účtu, právního rizika, osobních dat a s limitem
  nejvýše 0,15 dolaru denně, systém může nový obsahový projekt založit sám.
- **FightAIQ** spravuje zdrojovaná data o UFC a Oktagonu a počítá analýzy v kódu.
  Analýzy smí spustit jen pro ověřené zápasy a karty: neumí sázet, otevírat sázkové
  účty ani slibovat výhru.
- **Carousel Studio** spravuje deset znovupoužitelných rozložení a bez modelu z nich
  vykresluje všechny sociální karusely. Nemá vlastní sociální účet, marketing ani
  měření návštěvnosti.
- **MMA Files** je veřejný anglicko-český magazín. BoardlessAI do jeho repozitáře
  posílá jen ověřené články a data z FightAIQ; rozepsané texty a interní poznámky
  zůstávají v chráněné administraci.

## Denní rozpis a peníze

Společný pražský rozpis má 15 kontrolních časů: 05:00, 06:00, 07:00, 08:00, 09:00, 10:00,
11:00, 13:00, 14:00, 17:00, 18:00, 19:00, 20:00, 21:00 a 22:00. Letní a zimní časy mají
vlastní spouštění; stejné časy se neopakují a program přijme jen správnou variantu
pro Prahu. V 06:00 rozhodne hlavní rada, které odborné porady jsou opravdu potřeba.
Odpoledne a večer se už jen bez placených modelů zapíše stav. Porady Titty Tuesdays,
inkubátoru, Carousel Studia, večerní analýzy FightAIQ a redakční kontrola MMA Files se
spustí jen s platnou agendou. Kalendář jinak ukáže „nebylo potřeba“, ne zmeškanou poradu.

Podepsané rozhodnutí `budget-2026-08d` stanovuje celkový měsíční limit 50 dolarů,
z toho nejvýše 42 dolarů pro modely a API a denní tempo 2,20 dolaru. Systém si
limit nesmí zvýšit sám a platby vždy provádí člověk.

## Data a soukromá správa

Základní stav je ve složce `state/`. Veřejný web z něj čte jen znovu ověřené a
bezpečné části. Chybějící údaj se zobrazí jako nedostupný, ne jako nula. Zkušební data
jsou viditelně označená a nepočítají se jako skutečný výsledek.

`/admin` bez kompletního jména a hesla vrací `503`; bez správného přihlášení `401`.
V produkci se hodnocení, ručně zadané kurzy a opravy sporů zapisují přes
GitHub token omezený jen na tento repozitář. Bez něj zápis bezpečně selže.

Web nesbírá návštěvnost, čtenost ani výsledky příspěvků. Přepínač
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

Zkušební porady zapisují jen do dočasných složek. Přehled kroků, které musí udělat
majitel, je v `NEEDED.md`; doporučené pořadí je v `MANUAL STEPS.md`.
Úplný samostatný popis systému je v `docs/ECOSYSTEM.md`.
