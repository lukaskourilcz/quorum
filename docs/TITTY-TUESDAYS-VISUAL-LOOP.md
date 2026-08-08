# Titty Tuesdays visual proposals: the design

Design for the capability in `docs/WORKFLOWS-FABLE-BRIEF.md` Part 14.3. The room
invents a garment concept, code rewrites it into an image prompt, the OpenAI image
API returns raster variants, a deterministic checker takes what it can, and the
owner rates the rest in `/admin`. The rating half already exists and sits idle;
this document designs everything upstream of it, prices it, and ends with the
approval list the owner signs before any of it runs.

The shape in one line: **the model invents the garment, code writes the prompt,
the owner is the gate.** That is the hook-brain honesty pattern ported to images:
judgment where judgment is needed, determinism everywhere else, and no step where
a model asked politely stands in for a check.

## Where it sits in the day

The step runs inside the existing 11:00 room, on **Tuesdays only**, STUNT's day on
the weekday wheel. One batch a week: the owner is comparing designs, and a weekly
sitting of six images beats a daily trickle of one both for comparison and for
cost. On Tuesdays the room's existing model call gains one structured output
section, `garmentConcepts`, carrying **two concepts** in typed fields (title,
garment type, motif, palette references, print placement, a short rationale). No
second model call happens; the concepts ride the call the room already pays for,
inside its existing $0.08 envelope.

After the room stores its plan, a new module
`orchestrator/src/titty-tuesdays/visuals.ts` takes over, and everything it does is
code:

1. `buildGarmentPrompt(concept, axis)` rewrites each concept into an image prompt
   from a versioned deterministic template. Three prompt variants per concept,
   along three fixed axes: **flat lay** (garment laid flat, straight down),
   **silhouette** (garment on an invisible form, three-quarter view), and
   **detail** (print and label close-up). Deliberate prompt variation beats
   sampling the same prompt three times: each variant is a labelled, reproducible
   difference, so a rating teaches PALATE which framing works rather than which
   dice roll landed.
2. The template hardcodes the doctrine clauses in every prompt: product
   photography of a garment only; no person, no mannequin body, no body part; the
   printed wordmark reading exactly `TITTY TUESDAYS`; flat backgrounds; the
   season's palette tokens. Concept fields slot into fixed positions after
   sanitisation (length caps, newline stripping, a banned-token list), so room
   output can steer the garment and cannot steer the instructions.
3. Six calls to the image API (2 concepts × 3 variants, n=1 each), through the
   OpenAI provider the engine already holds credentials for. No new secret, no
   new allowlist host, no new provider adapter.
4. The checker runs (below), the bytes and the record are written, and the batch
   waits in `/admin`.

## The contract: `design-proposal/1`

A new schema in `contracts/design-proposal.schema.json`, sibling to
`marketing-plan/1`. One document per weekly batch:

```
schemaVersion    "design-proposal/1"
id               dp-<date>-<slug>
ventureId        "titty-tuesdays"
seasonId         from the newest season file
planRef          the day's marketing-plan id
promptTemplateVersion  e.g. "tt-garment-prompt/1"
concepts[]       { conceptId, title, garmentType, motif, palette[], placement, rationale }
variants[]       { variantId, conceptId, axis,
                   prompt,            // the exact string sent
                   revisedPrompt,     // what the API reports it ran, when it does
                   provider, model, quality, size,
                   image { path, contentHash, bytes, width, height, format },
                   usd, createdAt }
generation       { planned, generated, stoppedReason? }
checker          { passed[], warnings[], humanChecklist[] }
status           "proposed" | "reviewed"
```

Provenance is the point of the shape: provider, model, the exact prompt, the
concept it came from, a content hash and a timestamp on every variant, the same
discipline the licensed-photo path keeps. An image with no recorded prompt cannot
be reproduced or defended, so the record is written before the batch is shown to
anyone. The record names its provider per variant, so a second provider later is
a new value in two fields, not a new shape.

## Storage

Follow the social-assets precedent exactly, because it is the committed pattern
for rendered binaries:

- Bytes: `site/public/ventures/titty-tuesdays/proposals/<date>/<conceptId>-<axis>.webp`
- Record: `state/ventures/titty-tuesdays/design-proposals/<date>-<slug>.json`,
  written with `atomicWriteJson`, carrying an `inputsHash` and the per-file
  content hashes, the way `state/social/assets/2026-08-06.json` does.

Two disciplines the precedent does not need but this path does. The API returns
PNG at roughly 1 to 2 MB per image; the repository has no Git LFS, so the module
re-encodes to WebP at quality 82 through `sharp` (already in the tree for
`release:verify`) before writing, landing near 150 to 300 KB per image and under
2 MB a week. And the count is capped in code: eight images per batch, one batch
per week, enforced by the checker rather than by intent.

One consequence to sign rather than discover: anything under `site/public/` is
world-readable once deployed. Rejected garment concepts become publicly
addressable bytes at guessable paths. If the owner wants proposals private until
chosen, the alternative is bytes under
`state/ventures/titty-tuesdays/proposals/` served through the authed admin file
route; that diverges from the social precedent and costs an API route, which is
why it is an approval item below instead of a silent choice here.

## The call site, the envelope, the ledger

`config/models.json` gains a role beside `AVATAR_IMAGE`:

```
"TT_VISUAL_IMAGE": { "provider": "openai", "model": "gpt-image-2",
                     "quality": "medium", "size": "1024x1024" }
```

and `_comment_IMAGE` is updated to say the system now has exactly two sanctioned
image call sites, avatar repairs and Titty Tuesdays proposals, and that article
pipelines still have none. The brief asks for that comment change in as many
words.

Pricing from `orchestrator/src/llm/prices.ts`, already verified: medium quality
1024×1024 costs $0.053 an image; prompt tokens ride in at $5 per million, under
a tenth of a cent per call. Medium, not low, because the wordmark has to render
as legible type and low-quality output blurs text; high ($0.211) waits until the
owner has seen medium fail at it.

| Line | Figure |
| --- | --- |
| One image, medium | $0.053 |
| One batch (6 images) | $0.32 |
| Session envelope `TT_VISUAL_SESSION_BUDGET_USD` | $0.40 (batch plus one retry) |
| Monthly ceiling (5 Tuesdays × envelope) | $2.00 |
| Projected monthly actual | about $1.40 |

Every call reserves against the envelope through the existing
`estimateTextCall`-style path with an image estimator over `IMAGE_PRICES`, and
lands in `state/budget/ledger.json` as the ledger's first `kind: "image"`
entries, keyed on a `requestHash` so a replay cannot double-bill. The spend is
API usage on the existing key inside the $25 model share, so it belongs in the
budget ledger, not the treasury: the treasury records cash purchases the human
executes, and no cash changes hands here. The brief's phrase "write the treasury
ledger line" reads as the budget ledger to this design; if the owner instead
wants a standing treasury line naming the monthly ceiling, that is one JSON
entry and changes nothing else.

When the envelope runs out mid-batch, generation stops, finished variants keep
their bytes and records, `generation.stoppedReason` says `envelope_exhausted`,
and the room's other outputs are untouched: the plan was stored before the first
image call, so a broke batch cannot cost the venture its day.

## What the deterministic checker can and cannot assert

The brief demands this stated rather than designed around, so, plainly.

**The checker can assert, and blocks on:**

- The response decodes as an image; dimensions and format match the request.
- Re-encoded bytes fall inside the size bounds; the batch count is within cap.
- The content hash in the record matches the bytes on disk.
- Every variant's provenance record is complete: prompt, provider, model,
  quality, size, cost, timestamp.
- The prompt that was sent contains every doctrine clause, contains the exact
  string `TITTY TUESDAYS`, and contains no token from the banned list; concept
  fields respected their length caps.
- The ledger entry exists and matches the estimate within tolerance.
- The image is not degenerate: pixel variance above a floor (catches blank or
  near-uniform returns), and no exact-duplicate hash within the batch or against
  prior batches. An 8×8 average-hash over a `sharp` grayscale resize flags
  near-duplicates deterministically with nothing new in the dependency tree.

**The checker cannot assert:**

- That no human figure or body part appears in the raster.
- That the garment is the garment the concept described, or a crop top at all.
- That the wordmark rendered correctly, legibly, or as those two words.
- That the image is not suggestive in framing or styling.
- That the palette on screen is the season's palette (a dominant-colour
  comparison ships as a warning, never a block, because it is crude).

Those five are exactly the doctrine, so the doctrine gate is the owner, and the
admin panel says so instead of pretending otherwise: every variant arrives
marked **unreviewed**, beside a three-line human checklist (no human imagery ·
wordmark correct · on-brand), and nothing in the system treats an unrated
variant as approved. An automated content-moderation pre-screen could run before
the panel, but it is a model asked politely; if added it is labelled a filter,
never counted as the check.

## The admin panel and the two kinds of no

A new `titty-tuesdays-proposals-panel.tsx` in the established admin pattern
(`carousel-studio-panel.tsx` for the gallery, `rating-widget.tsx` for the
control). Variants render side by side per concept, at full size on click, with
the prompt and provenance beside them and the human checklist above the rating.

Rating uses the existing ledger untouched: `rating/1`, `objectKind: "visual"`,
`objectRef.id` of `<proposalId>/<variantId>`, `contentHash` from the record, an
optional note. `perfect` is the owner's pick signal; a picked design is written
back to the proposal record as `status: "reviewed"` with the pick noted, and it
becomes an approved concept for future planning. It does not become a product:
nothing in this path touches the catalog feed, `resolvePurchasability()` in the
storefront stays the only purchase gate, and the storefront keeps failing closed
to concept mode. Pre-commerce survives this feature untouched.

Doctrine rejection is a different button from a bad rating, because they teach
different lessons. **Bad** means the design failed taste; the image stays on
file, because a rejected design is what PALATE learns from. **Doctrine** means
the image should not exist; its bytes are deleted, the record keeps the hash,
the prompt and the reason, and the template's banned-list or clause set gets a
follow-up task. Policy violations do not stay in a public directory; evidence
that they happened does.

## The feedback loop

Nothing new to build. Ratings land in
`state/ratings/titty-tuesdays/ledger.jsonl`; PALATE already distils them into
`state/taste/titty-tuesdays/TASTE.md` with `visualAdjustments`, already cites
rating ids, and already runs as the free pre-step on the next room, which reads
taste before writing concepts. The proposal record's `promptTemplateVersion`
closes the remaining gap: an adjustment can name which template produced the
output it dislikes. Template changes themselves stay human: PALATE cannot edit
pinned prompts, so a new `tt-garment-prompt/2` is a code change through the
normal review path, informed by taste, never written by it.

## Constraints, answered

1. **Generation stays outside Carousel Studio.** `visuals.ts` never imports the
   studio and the studio never renders from these bytes. The studio's checks
   depend on identical output for identical input; an image model cannot promise
   that, so its output enters state as recorded input to a human decision, which
   the system never re-derives.
2. **Provider wiring is reused.** OpenAI is declared, `OPENAI_API_KEY` is
   already a checked secret, `gpt-image-2` is already priced. New work is the
   call site, the envelope, the checker, the schema and the panel.
3. **Spend is priced above** and capped at $2.00 a month against a share
   running near $14. The first `kind: "image"` ledger entries are called out in
   the approval list, not slipped in.
4. **`allowHumanImagery: false` is enforced three times**: hardcoded clauses in
   the template, the banned-token check on the assembled prompt, and the owner's
   labelled checklist on every raster, with the checker's limits stated rather
   than papered over.
5. **Pre-commerce is untouched**, as above.
6. **Provenance on every asset**, in the contract.

## What the owner signs before any of it runs

Six `HUMAN_APPROVAL` items for `state/INBOX.md`, all-or-nothing:

1. The first routine image spend: budget-note amendment adding `kind: "image"`
   entries at a $0.40 session envelope, Tuesdays only, $2.00 monthly ceiling
   inside the existing $25 model share.
2. The `TT_VISUAL_IMAGE` role in `config/models.json` and the rewritten
   `_comment_IMAGE` naming two sanctioned image call sites.
3. Public addressability of proposal bytes under `site/public/`, or the
   admin-only alternative under `state/` with its extra route.
4. The doctrine checklist wording and the two-kinds-of-no rule, including
   deletion of doctrine-rejected bytes with the record retained.
5. The batch shape: two concepts, three axes, eight-image weekly cap, WebP
   re-encode at quality 82.
6. The `design-proposal/1` contract file itself.

Until all six are signed, the room keeps producing plans and nothing generates
an image.
