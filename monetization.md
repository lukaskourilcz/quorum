# BoardlessAI — monetizace

Katalog v `config/monetization-options.json` je verzovaný seznam šestnácti možností pro
budoucí orientaci. Administrace ho zobrazuje v části **Future → Ways this could earn**.
U každé položky uvádí popis, náklad, možné projekty a známé překážky.

Jeho závazná poloha je `information-only` a `executionEnabled` je `false`. Katalog nemůže
založit práci, návrh, experiment, agendu, owner-attention položku, nabídku, kontakt,
cenotvorbu, účet, obchod, affiliate umístění, předplatné ani výdaj. Dosažené KPI se mohou
zobrazit jako informace, ale runtime ponechá všechny monetizační metody zamčené a nevytvoří
proposal soubor ani úkol v `docs/NEEDED.md`.

Prodej designových šablon není součástí katalogu a Design Lab, marketingShark ani GoVIRAL
nemají oprávnění šablony prodávat. Jakákoli monetizační implementace vyžaduje nové rozhodnutí
vlastníka, které teprve vymezí konkrétní rozsah, právní podmínky, účty, platby, rozpočet a
runtime brány. Tento soubor je jediný zdroj katalogu; nevytvářejte paralelní seznam.
