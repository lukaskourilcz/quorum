# Design Lab: Canva research and implementation

Research date: 2026-09-15. Scope: studio UI, article-driven static graphics and optional motion.

## Recommendation

Use Canva for human art direction, editable examples and template exploration. Keep the
repository's renderer for daily production. This combines hands-on design work with replayable
exports, existing brand tokens and no additional rendering API fee. Treat motion as a separate
output path; it should not become a dependency of a static post.

The existing system already reads article summaries, records recipes, resolves licensed heroes,
fits text using committed fonts and exports PNGs and ZIPs. Replacing it with a remote service
would duplicate substantial working infrastructure. The main improvements needed here were
composition, editor hierarchy and a usable handoff to Canva.

## What the connected tools actually support

The Canva connection returned one brand kit and no brand templates. That does not establish the
account's subscription tier. Its template search searches the user's brand templates; the public
[carousel catalog](https://www.canva.com/instagram-posts/templates/carousel/) is a separate source
of inspiration. The catalog includes photo-feature, typography, microblog and scrapbook categories.
These are useful starting points for direction, not evidence of higher reach or engagement.

The connector can import HTML, inspect designs, edit existing text/media and resize designs.
Our first HTML import embedded whole SVG slides: Canva turned them into images. The second import
kept artwork as a background and emitted separate HTML text elements. Inspection confirmed 42
editable text elements across the seven-page DNESKAi carousel. Background artwork remains grouped;
this is not a freeform, per-shape editor or a tagged Autofill template.

Canva's [Autofill guide](https://www.canva.dev/docs/connect/autofill-guide/) requires Enterprise
membership for production use of Brand Template/Autofill APIs. Development access can be requested
but does not establish production entitlement. A chat connector does not provide a backend token.
A production integration needs its own [OAuth flow](https://www.canva.dev/docs/connect/authentication/),
including secure token management. Asset upload, tagged fields, asynchronous job handling and
[export jobs](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/)
are separate integration steps. No such integration was enabled in this change.

## Visual direction

Mobbin supplied two Canva editor references, which were visually inspected:

- [Template browser and portrait canvas](https://mobbin.com/screens/b3de4e6b-3ca8-4a66-896e-aac7df701d03):
  a narrow template panel beside a large working page, with the remaining pages close at hand.
- [Canvas and bottom slide strip](https://mobbin.com/screens/2dc38e3a-b2b7-4de4-9b74-d980f3949e71):
  page thumbnails help users see the sequence while editing one page.

The studio adopts that hierarchy within the existing Admin design tokens. It now has a large
canvas, visual slide navigation, descriptive format controls, an inspector with Text/Vzhled/Canva
sections, article search and grouped export actions. Story overlays default on when viewing 9:16.
Template browsing previews locally; applying a choice persists it. Text saves update the local
baseline, refresh the server snapshot and invalidate the image URL. Export names unsaved text
instead of implying the unsaved draft is in the downloaded file.

The owner added [@technology](https://www.instagram.com/technology/?hl=cs) as the primary social
reference. Its public profile grid was visually inspected: large photographic subjects, dense
condensed uppercase headlines, black lower panels, white/blue emphasis, tiny branding and swipe
cues. Press adopts the photo-first composition, centered headline and restrained branding using
our own venture colors/fonts and licensed photography. Folio provides a quieter alternative.
The reference's individual carousel pages required login, so internal page pacing was not verified.
No reference photographs, logos or post text were copied.

Two original compositions join the renderer:

| Composition | Intended use | Anatomy |
| --- | --- | --- |
| Folio | News and editorial explainers | Precise masthead, large headline, framed photograph, numbered reading pages |
| Press | MMA profiles and sports coverage | Edge-to-edge photograph fading into a solid lower panel, small branding, centered bold headline and numbered reading pages |

The five featured choices are Folio, Press, Rail, Fault and Halo. Apex and Vista remain in the
legacy selector with their original IDs and compositions. New recipes can choose the new
families; recorded recipes keep their existing choices. Brand palettes and fonts remain the
venture's own. No copied Canva template imagery or downloaded Mobbin references enter the renderer.

## Tools worth considering

| Tool | Best fit here | Decision |
| --- | --- | --- |
| Canva MCP | Explore layouts, edit one-off designs and prepare reusable references | Use now; four editable examples created |
| Existing SVG/resvg renderer | Daily branded carousels, posts and stories with exact Czech text | Keep as the production engine |
| Mobbin | Editor workflows, canvas hierarchy and controls | Already connected and used; no additional connection needed |
| Runway | Short motion backgrounds, image-to-video and occasional story treatments | Connected by the owner during this session; account tools were not exposed in the active tool registry, so credit balance and generation remain unverified |
| Figma | Shared component libraries and detailed design-system handoff | Optional only if a designer will maintain the system there |
| Polotno | A full embedded drag-and-drop design editor | Consider only if users need free placement of every object |
| Placid | Hosted template-based image/video/PDF automation | An alternative to the existing renderer, not a necessary addition |

[Polotno](https://polotno.com/docs/overview) provides a JavaScript design editor SDK.
[Placid](https://placid.app/docs/2.0/introduction) provides template-driven media generation.
Adopting either means comparing licensing, recurring cost, export fidelity and operational
ownership against the renderer already in the repository. There is no demonstrated need to add
another vendor just to make these two new compositions.

Runway's [API pricing](https://docs.dev.runwayml.com/guides/pricing/) lists Gen-4 Turbo at
5 credits/second and credits at $0.01. A five-second API generation therefore costs about $0.25
before tax, retries or other processing. One daily generation for 30 days would cost $7.50.
These are API estimates, not a quote for the connected account or its subscription credits.
They do not fit the existing $2 media allowance without a separate budget decision.

For motion, animate the approved background, then overlay the headline, brand and credits with
code or Canva. Avoid asking a video model to regenerate Czech typography or simulate news events.
Keep a static fallback. A bounded adapter would record source identity, model, job ID, output
hash, cost and review outcome, then return an asset to the existing content workflow. It must
not publish, decide account permissions or create a second scheduler.

## Canva examples

These use existing Admin source articles. Their source claims were not independently fact-checked
in this design task, and the examples were not sent to social networks.

| Design | Source | Open |
| --- | --- | --- |
| DNESKAi Folio, seven-page carousel | 2026-09-13 GPT-6 Astra / RubyGems edition | [Editable carousel](https://www.canva.com/d/-rLaJnZFbRaheVC) |
| MMA Files Press, seven-page carousel | 2026-09-08 Amanda Ribas article | [Editable carousel](https://www.canva.com/d/g5D6aHNTPnFnNYB) |
| MMA Files Press, story | Same article, 1080 × 1920 | [Editable story](https://www.canva.com/d/RyHWjZgvzu_buqz) |
| DNESKAi Folio, square post | Same edition, 1080 × 1080 | [Editable post](https://www.canva.com/d/Bpxa1cu39kMy1M-) |

Initial flattened import proofs remain separate Canva designs. Use the editable versions above.
Text is editable line by line; Canva edits do not sync back into the repository. Compare the
export against the PNG reference after changing copy or type. Photography credits remain in the
source caption and must accompany any published export.

## Quality gates and limitations

- Validate safe areas, contrast, supported fonts, overflow, layer counts and deterministic replay.
- Inspect a short headline, long Czech headline, ordinary body slide and closing slide in all formats.
- Check text truncation separately from visual appeal; a successful render alone is insufficient.
- Use each brand's approved hero and caption credit. A design tool does not verify the article.
- Keep read-only preview available without enabling writes. Preserve the existing API authorization.
- New compositions passed the existing all-brand/all-format family checks. Both article samples
  rendered in portrait, square and story with no truncated slots.
- Canva confirmed page counts/dimensions and editable text. Thumbnail download requests returned
  HTTP errors; an independent visual inspection of Canva's own raster output remains outstanding.
- Local browser verification was blocked: the browser refused localhost, the standalone browser
  daemon failed to start and the Chromium download timed out. Responsive classes are implemented;
  interactive browser acceptance remains a release check.

No increase in spend, OAuth access or social publishing permission is part of this change.

Verification: full workspace suite passed 3,599 tests in 478 files before the final reference refinement; the revised composition is checked again with the family suite. Workspace typecheck and lint passed.

The final reference refinement passed 22 family checks and five targeted editor/handoff checks. All three workspace production builds completed successfully.
