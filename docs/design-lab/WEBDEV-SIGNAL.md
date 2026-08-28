# WebDev Signal visual system

Version `1.0.0` serves the Czech and English Instagram editions of WebDev Signal. It is a social
asset system only: no website, public archive, framework skin, source screenshot or daily image is
part of this identity.

## Identity

The master wordmark is `WEBDEV SIGNAL`. `CZ` and `EN` are small mono metadata markers inside the
same lockup, never separate logos. The visual idea is a change record: a fixed signal line, an
explicit state chip, a project/version line, ordered evidence, and a proof footer. The system uses
editorial hierarchy and modular browser/code-grid proportions without drawing a fake terminal,
fake API or copied framework interface.

The versioned `carousel-brand/1` skin is registered as `webdev-signal`:

| Role | Value | Use |
|---|---:|---|
| background | `#0b1115` | normal change/detail panels |
| surface | `#131c22` | lead and source panels |
| surface-strong | `#1d2931` | dividers and quiet structure |
| foreground | `#f2f7f5` | primary reading text |
| muted | `#b9c8c5` | explanations and metadata |
| stable / insertion | `#82e6c1` | stable state and semantically real additions |
| preview | `#f7c66a` | beta/preview state |
| security / removal | `#ff9a9a` | security and semantically real removals |
| breaking | `#d8b4fe` | breaking and deprecation state |

Figtree is the headline face, Public Sans is the reading face, and IBM Plex Mono sets project,
version, advisory and source metadata. All are committed OFL static files with committed measured
advances. The renderer checks every used text/ground pair against the repository's 4.5:1 social
asset floor.

State is never color-only. Every slide prints one exact localized word: `STABILNÍ`/`STABLE`,
`NÁHLED`/`PREVIEW`, `BEZPEČNOST`/`SECURITY`, `NEKOMPATIBILNÍ`/`BREAKING`, or
`UKONČOVANÉ`/`DEPRECATED`. Preview therefore cannot look stable after desaturation or to a reader
who does not perceive the accent distinction.

## One flexible composition

`webdev-signal-change-{4,5,6}@1.0.0` is one authored composition at three bounded lengths. The
semantic order is always lead, change, impact, action and source. A four-panel edition combines
change and impact before editorial approval; Design Lab never combines or rewrites it. A sixth
panel is an evidence-bound detail. The source proof is always last.

Each slide has the same hierarchy:

1. master wordmark and `CZ`/`EN` marker;
2. textual status chip;
3. exact project and technical identifiers;
4. accepted heading and body;
5. ordered progress and official source attribution.

There is no image slot. The static-only export uses type, rules, restrained status color and empty
space. No animation, reduced-motion branch, image generation, external icon, network request or
second Canvas/HTML screenshot pipeline exists.

## Contracts and deterministic render

`webdev-design-payload/1` selects one already approved `webdev-edition-package/1`. It holds the
locale/package hashes, status, ordered 4–6 semantic panels, claim/source references, technical
identifiers, semantic alt-text input, versions, expiry and correction chain. Its strict schema
rejects unknown fields; source bodies, provider credentials and publishing authority have nowhere
to enter.

The payload crosses only the registered
`webdev-signal -> design-lab : bounded-render-summary : bounded-render-summary/1` edge. Design Lab
then calls `@boardlessai/carousel-studio`; it performs no model, network or image call.

`webdev-render-receipt/1` records payload/package, brand/template/font/renderer versions, 1080×1350
dimensions, per-panel SVG and PNG hashes, fit/contrast/status/source/alt-text/identifier checks,
cache key, correction state, duration and `$0` provider cost. The cache key includes every version
that can change output. A matching successful receipt reuses the same assets. Corrections receive
a new payload hash/path, leaving prior evidence intact.

Measured fitting receives the accepted strings unchanged. It may shrink them within declared
limits. If a string still needs clipping or a technical identifier must be split, the renderer
returns `held` with the exact slot such as `panel-02-body`; it does not ellipsize and ship, delete a
word, translate, summarize or modify the locale package. A failed Czech render does not alter the
English receipt or assets.

Alt text comes from the package's semantic `altTextInput`, not OCR. Source URLs remain immutable
payload references while the final panel prints the bounded official attribution. Render order,
locale markers, identifiers and punctuation all derive directly from the payload.

## Admin evidence

The canonical Design Lab brand registry creates a WebDev Signal section automatically. Its server
snapshot pairs recorded payloads and receipts and shows locale/status, brand/template version,
panel copy, semantics, source refs, every gate, output hashes, cache state and correction sequence.
Malformed pairs are isolated. The declared safe operations are preview, repeat the identical
deterministic render, and hold; the view exposes no claim editor, profile activation or publisher.
The WebDev workspace link remains absent until #445 owns that destination.

## Do / don't

Do use exact version/package/advisory punctuation, restrained change markers, explicit status
words, one clear thought per panel and an official source close to the conclusion. Do use insertion
or removal cues only when the evidence actually describes an insertion or removal.

Do not use decorative fake code, a framework/browser logo as the identity, green/red as the only
meaning, tiny screenshots, generic neon gradients/glows, fake dashboards, engagement ornament or
unlicensed source artwork. The design should look like WebDev Signal recording a change, not like
the project that changed.

## Executable evidence

- `studio/tests/webdev-signal.test.ts` covers the brand, 4/5/6 templates, all semantic states,
  Czech glyphs, contrast, safe areas, fit metadata and deterministic SVG hashes.
- `orchestrator/tests/webdev-signal-design-lab.test.ts` covers strict contracts, the exact capability
  edge, native locale text preservation, deterministic PNG hashes, reuse, overflow holds, locale
  isolation, malformed denial and persisted receipts.
- `site/src/components/admin/webdev-signal-design-lab.test.tsx` covers the canonical Admin projection,
  source proof, gates, hashes, cache state and malformed-pair isolation.

These are fixture/unit/build checks. They make no live provider or image request and do not run a
browser E2E suite.
