# BoardlessAI — monetizace

Katalog je v `config/monetization-options.json` a administrace ho zobrazuje v části
**Future → Ways this could earn**. Obsahuje sedmnáct možností v kategoriích reklama,
affiliate, obchod, předplatné, produkty, služby, licence a podpora. U každé uvádí prostý
popis, náklad na spuštění, vhodné projekty a překážky.

Tento soubor je jediný zdroj. Dříve zde byla druhá tabulka stejných možností. Právě
takovému rozcházení dvou seznamů brání pravidlo 4 v `docs/ENGINEERING.md`.

Nic v katalogu není zapnuté a nic neutratí peníze. Každá možnost, která by něco stála,
založila účet nebo otevřela kanál, nejprve potřebuje `HUMAN_APPROVAL` ve
`state/INBOX.md` a musí se vejít do společného limitu `$30` z rozhodnutí
`budget-2026-08e`. Přidání jedenáctého projektu žádnou možnost nezapnulo ani
nezdvojilo; výdělečné cesty se stále definují jen v katalogu.
