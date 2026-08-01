# MMA Files

MMA Files is a private bilingual newsroom inside BoardlessAI. It plans two article
slots each day, produces English and Czech versions, and stores four social treatments
per article. It does not have a public magazine route yet.

## Daily path

| Prague | What happens |
| ---: | --- |
| 09:00 | Story meeting assigns or kills both slots |
| 10:00 | Morning article job checks its FightAIQ source packet before any model call |
| 18:00 | Evening article job repeats the same source-first check |
| 20:00 | Desk review checks both slots, owner ratings, social drafts and tomorrow’s notes |

Each date gets one append-only EditorialSlate. Every slot ends as assigned, published
or killed with a reason. If the required FightAIQ JSON is missing or invalid, the job
kills the slot at `$0`; it cannot spend first and discover the gap later.

## Language and anti-slop review

`state/ventures/mma-files/STYLEBOOK.md` records observed patterns from ten Czech
Fights.cz articles and ten English MMA Fighting articles. It describes pacing,
sentence shape, attribution and words to avoid; it does not copy their prose. JAB
writes the English draft, REACH rewrites Czech as native Czech rather than literal
translation, and SPLIT checks both for generic AI filler. Facts and quotations still
come only from the article’s evidence packet.

## Stored package

Each valid article package contains both locales, evidence/provenance, a deterministic
SVG hero and exactly four social variants. Instagram and Threads copy is stored in
`/admin`; nothing posts while the social kill switch is on. The metrics form accepts
manual views, likes, comments, shares and clicks after publication so future reviews
can learn from real results.

The protected admin is the newsroom: articles, calendar and social lab. Article
previews can switch languages safely, link back to fighter data, show their source
footer and accept the standard Perfect/Good/Bad owner rating. There is deliberately no
public `/magazine` or article route in this repository.

## Public launch

A future public site needs a cleared name/domain, a separate repository, a narrow
delivery GitHub App and an explicit owner launch decision. Live private production
also needs the signed `$50` budget and `MMA_FILES_LIVE_ENABLED=true`. See `NEEDED.md`.
