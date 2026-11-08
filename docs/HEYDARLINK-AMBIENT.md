# HeyDarlink ambient photos

> **Moved on 2026-11-08.** The pipeline now runs in OwnDashboard (`lukaskourilcz/own-dashboard`, PR #263,
> `docs/heydarlink-ambient.md`), on demand in batches of ten shots per persona, with Claude as the vision gate.
> The workflow below no longer runs on a schedule; a manual dispatch remains as a fallback until this package is
> removed. Everything below describes the retired Quorum job.

The four HeyDarlink Instagram accounts (Nina, Fatimah, Teresa, Michaela) post two kinds of frame.
Frames with the girl in them come from Foxy. Every frame without her (views, food, drinks,
interiors, flat lays, city details, sunsets, outfits on hangers, books, flowers) comes from this
pipeline. The owner decided this on 2026-11-08: it runs on its own, nobody approves frames by hand
or in Discord, and automatic gates decide what goes out.

HeyDarlink is not a BoardlessAI venture. This repository hosts the job because the generator and
stock keys already live in its Actions secrets. The code sits in its own workspace package,
`heydarlink-ambient/`, and touches nothing in the orchestrator or the site.

## What runs

`.github/workflows/heydarlink-ambient.yml` runs daily at 04:55 UTC and on manual dispatch with
three inputs: `persona` (all or one), `count` (shots per persona, 1 to 4) and `dry_run`.

For each persona it picks `count` shots from `config/heydarlink-ambient.json`. A shot is not picked
again until the persona's whole list has run. Each shot renders once per aspect it lists (4:5 feed,
9:16 story), natively at 1080x1350 or 1080x1920. Then each frame goes through:

1. **Render.** fal `fal-ai/flux/dev` first, OpenAI `gpt-image-1-mini` if fal fails, Gemini
   `gemini-2.5-flash-image` only when a `GEMINI_API_KEY` secret exists. OpenAI renders 2:3, which the
   grading pass centre-crops by 16 to 17%. A crop over 20% is refused. Shots with a `stockSeed`
   pull a Pexels or Pixabay photo, skip any whose description mentions a person, and send it to
   `fal-ai/flux/dev/image-to-image` at strength 0.86. The landmark keeps its geometry and the
   pixels are new. Stock is never posted as it is.
2. **Grade.** One `sharp` pass per persona: tone curve, warmth, saturation, grain, vignette,
   Lanczos3 resize, sRGB JPEG q92 with no metadata. The values follow the Foxy look in the research
   (Nina warm and soft, Fatimah crisp, Teresa cool with lifted blacks, Michaela deep blacks).
3. **Gates**, cheapest first. Any failure rejects the frame, and a gate that cannot answer counts
   as a failure:
   - format: JPEG, exact size, at most 8 MB;
   - duplicate: 64-bit DCT perceptual hash, Hamming distance 8 or less to any frame already
     uploaded (all four accounts, 90 days) rejects;
   - fal's own NSFW flag;
   - OpenAI `omni-moderation-latest` (free): flagged, or a sexual score over 0.2, rejects;
   - a vision check (`gpt-4.1-mini`, high detail, strict JSON) that rejects any person, face, body
     part including hands, text, logo, NSFW content, or a frame that does not match its brief.
   A rejected frame gets one more attempt with a new seed.
4. **Upload** to HeyDarlink's `POST /api/photo-library/ambient` with the persona, aspect, pillar,
   shot id, prompt, provider, model, cost, seed, perceptual hash and sha256. HeyDarlink checks size,
   type, dimensions, sha256 and near-duplicates again and stores the frame as `ready`.

A dry run renders and gates for real (and pays for it), uploads nothing and keeps every frame,
accepted or rejected, in the workflow artifact `heydarlink-ambient-<run id>` for 14 days.
`AMBIENT_MOCK=true` with a dry run swaps every provider for a local gradient for rehearsal on a
laptop; it reaches no network.

## Money

- **Cap:** `AMBIENT_DAILY_USD`, default $1.00 per UTC day across all four personas, dry runs
  included. Values above $5 are refused as a typo. Set it as a repository variable to change it.
- **Per frame:** a renderer whose estimate plus the vision check exceeds $0.12 is skipped.
- **Estimates** (the renderers return no cost, so the ledger records these): fal dev $0.025 per
  megapixel rounded up, so $0.05 for 4:5 and $0.075 for 9:16; OpenAI $0.015; Gemini $0.039; vision
  check $0.002; moderation free.
- **Typical day:** one shot per persona in both aspects is 8 frames, about $0.52 with no
  rejections, about $1 with one retry each. With the default cap a second shot per persona
  usually runs into the cap, and the frames it could not afford are recorded as `skipped-cap`.
- Each charge is written to `state/heydarlink-ambient/ledger.json` before the call it pays for.
  The workflow commits the ledger after every run, failed runs included, so a rerun on the same
  day sees the spend.

This spend is HeyDarlink's, on the owner's fal and OpenAI accounts. It is not drawn from
BoardlessAI's model share and it is not in `state/budget/ledger.json`.

## Secrets

Set under Settings → Secrets and variables → Actions in `lukaskourilcz/quorum`.

| Name | Needed for | Notes |
| --- | --- | --- |
| `FAL_KEY` | rendering | exists |
| `OPENAI_API_KEY` | fallback rendering and all model gates | exists; without it every frame would be rejected, so the run stops first |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | stock img2img seeds | exist; without them seeded shots render from text |
| `GEMINI_API_KEY` | third fallback | optional; absent means the chain is fal then OpenAI |
| `HEYDARLINK_INGEST_URL` | upload | new: `https://heydarlink.com/api/photo-library/ambient` |
| `HEYDARLINK_INGEST_TOKEN` | upload | new: the same value as `AMBIENT_INGEST_TOKEN` on the HeyDarlink VPS |

A real run with either `HEYDARLINK_INGEST_*` secret missing fails in its first step with the
missing names and renders nothing. A dry run needs only the provider keys.

## Changing the shot list

Edit `config/heydarlink-ambient.json`. Every prompt must contain "no people", "no faces", "no text"
and "no logos" in its own words; the schema refuses one that does not, because FLUX dev has no
negative prompt and reads only the positive one. Shot ids must be unique across personas and start
with the persona key. `pnpm --filter @boardlessai/heydarlink-ambient test` checks all of it.
