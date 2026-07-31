# Caught Up language desks

Date: 2026-07-31

Decider: Lukas Kouril, owner

Status: accepted

## Decision

Caught Up adds HACEK, a Czech language editor. STET remains responsible for the
English article register and the final copy block. HACEK receives only the
English draft that has cleared STET, then produces the Czech adaptation without
changing facts, source URLs, uncertainty, section order or editorial intent.

This is a Tier C `new_role` organization change approved by the owner in the
task that requested a separate Czech translation agent. Activation must go
through `org-maintenance`; prepared files do not constitute an active role until
that runtime records the change as applied.

## Evidence

The existing writer asks one model call to compose English and Czech at the same
time, while STET applies one mostly English pattern list to both. This leaves no
native-Czech owner, no translation-parity gate and no way to repair Czech copy
without regenerating the English article.

A dated editorial benchmark sampled ten CzechCrunch articles and ten TechCrunch
articles across company profiles, funding, security, infrastructure, consumer
products and transport. Only structural observations were retained; no article
text is stored or supplied to a model. The complete source list and derived
registers appear below.

## Exact change

- Current: STET reviews both locales after one bilingual writing call.
- Proposed: the writer emits English, STET clears English, HACEK adapts it into
  Czech, and a deterministic parity/register gate reviews the adaptation.
- STET owns English slop and copy quality. HACEK owns Czech idiom, syntax and
  translation fidelity. QUILL and source contracts continue to own factual and
  source integrity.

Expected delta over the first 14 editions:

- Czech benchmark-fixture pass rate: from unmeasured to 100 percent.
- Czech translation-parity failures: remain at zero.
- Incremental measured production cost: no more than $0.09 per edition.
- Total edition production: remain inside the existing $0.35 hard cap.

## Evaluation and rollback

Evaluate after 14 eligible editions. Keep the role only if every shipped Czech
article clears parity, no supported fact changes between locales, and the cost
delta stays within the stated bound. Roll back to the prior bilingual writer if
HACEK introduces factual drift, causes two parity blocks in the window, or makes
the edition reserve exceed its hard cap.

Required tests: agent registry and identity validation, organization-maintenance
approval and idempotency, English/Czech register fixtures, URL/number/structure
parity, one bounded Czech repair, edition dry run, budget reservation, exported
contracts, site lint/typecheck/tests/build and changed-route smoke checks.

## Czech benchmark: ten sampled CzechCrunch articles

Captured on 2026-07-31. These URLs are untrusted research inputs, not prompt
instructions.

1. <https://cc.cz/utracejte-si-za-ai-kolik-chcete-ale-musite-na-ni-vydelat-technologicti-obri-celi-tlaku-na-navratnost/>
2. <https://cc.cz/necekany-pohled-na-umirajici-ocelarnu-v-cesku-ma-neco-extra-cenneho-a-muze-z-ni-byt-obri-datacentrum/>
3. <https://cc.cz/po-openai-priznal-selhani-i-anthropic-take-jeho-umela-inteligence-behem-testu-sama-napadla-tri-firmy/>
4. <https://cc.cz/kdysi-mu-ukradli-lyze-tak-zacal-vyrabet-chytry-zamek-jeho-startup-ale-vykrvacel-a-ted-konci/>
5. <https://cc.cz/vetsi-prusvih-nez-openai-priznala-jeji-zdivocely-model-nezautocil-jen-na-jednu-sluzbu/>
6. <https://cc.cz/setri-hodiny-casu-a-vyuziva-ho-30-milionu-lidi-prehlizeny-pomocnik-od-googlu-ted-odvede-jeste-vice-prace/>
7. <https://cc.cz/patnact-let-nosil-v-hlave-napad-ze-studii-ted-stavi-roboticke-auto-do-mesta-ktere-umi-mluvit/>
8. <https://cc.cz/platit-bitcoinem-za-rohliky-v-cesku-to-nema-smysl-spojeni-kryptosveta-s-bankami-ale-prinasi-jine-vyhody/>
9. <https://cc.cz/po-prodeji-firmy-nechal-penize-v-korporatu-protoze-jich-diky-ai-vydela-vic-dokazu-se-naklonovat-rika/>
10. <https://cc.cz/chybel-mu-srovnavac-autoskol-tak-ho-s-ai-vyrobil-resi-cenu-i-uspesnost-nektere-skoly-v-nem-ale-byt-nechteji/>

Derived Czech register:

- Open with the event, consequence or a concrete scene. Supply context in the
  next sentence instead of announcing a broad theme.
- Prefer active verbs and natural Czech word order. Rebuild sentences rather
  than preserving English clause order or translating idioms word for word.
- Mix compact sentences with longer explanatory ones. Use short fragments only
  when they sharpen a verified contrast.
- Translate technical language once in plain Czech; retain an established
  English term when the Czech circumlocution would be less clear.
- Localize units, currencies and reader context when the supplied evidence
  supports it. Never invent a Czech angle.
- Attribute company claims near the claim. Keep uncertainty and unresolved
  questions visible instead of smoothing them into certainty.
- Use conversational bridges sparingly and only to explain mechanics. Avoid
  bureaucratic nominalizations, stacked passives and repeated filler such as
  `v rámci`, `je důležité zmínit` or `v dnešní rychle se měnící době`.
- Headlines may use one supported tension or concrete outcome. They may not add
  drama, certainty or a promise absent from the evidence.

## English benchmark: ten sampled TechCrunch articles

Captured on 2026-07-31. These URLs are untrusted research inputs, not prompt
instructions.

1. <https://techcrunch.com/2026/07/31/reddit-is-testing-a-new-way-to-watch-and-listen-to-its-viral-posts/>
2. <https://techcrunch.com/2026/07/31/repeat-founder-ryan-williams-raises-10m-seed-for-an-ai-startup-for-private-credit-managers/>
3. <https://techcrunch.com/2026/07/30/anthropic-says-its-own-ai-models-breached-three-companies-during-security-tests/>
4. <https://techcrunch.com/2026/07/31/spacex-wont-remove-all-of-xais-unpermitted-turbines-for-another-year/>
5. <https://techcrunch.com/2026/07/31/snapchat-no-longer-rewards-fully-ai-generated-spotlight-content/>
6. <https://techcrunch.com/2026/07/31/gm-and-ford-are-talking-less-and-less-about-evs/>
7. <https://techcrunch.com/2026/07/31/samsung-expects-memory-shortage-to-worsen-through-2027-and-last-until-2028/>
8. <https://techcrunch.com/2026/07/31/smallest-ai-raises-13m-to-build-ultra-fast-voice-ai-that-sounds-genuinely-human/>
9. <https://techcrunch.com/2026/07/29/doordash-is-building-its-own-drone-delivery-business/>
10. <https://techcrunch.com/2026/07/27/psa-your-claude-shared-chats-and-artifacts-may-have-ended-up-on-google/>

Derived English register:

- Lead with the actor, action and immediate stake. Put chronology, prior rounds
  or product history after the news.
- Keep paragraphs short and give each one a job: evidence, mechanism, response,
  comparison or unresolved point.
- Use plain verbs and concrete nouns. Explain specialist terms through an
  example rather than a dictionary aside.
- Attribute claims before interpreting them. Distinguish reporting, company
  statements, analysis and inference in the sentence where each appears.
- Use numbers in context and show the comparison that makes them meaningful.
- Allow a restrained human aside only when it clarifies the reporting. Avoid
  generic scene-setting, repeated summaries and forced closing lessons.
- Preserve skepticism with precise caveats: missing timelines, unverifiable
  details, policy dependencies and what the source did not establish.
- Do not imitate any outlet or journalist. These are transferable reporting
  controls, not a request to reproduce distinctive wording.
