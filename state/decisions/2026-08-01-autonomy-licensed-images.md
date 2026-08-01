# Licensed article image system

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-licensed-images-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

Every new Caught Up and MMA Files article carries exactly one image. The system prefers
a relevant licensed photo from Openverse, Wikimedia Commons, Pexels or Pixabay. It may
use only CC0, CC BY, CC BY-SA, Pexels License or Pixabay Content License assets with
machine-readable author, license and source metadata.

The runtime must reject non-commercial, no-derivatives and unlicensed assets. It must
download, validate, strip metadata, resize and optimize the chosen photo, then commit
the hero and thumbnail to the consumer repository. The article renders attribution
near the image. It cannot hotlink or scrape a news, agency or publisher photograph.

If no valid photo exists or a keyed provider is unavailable, FRAME supplies the
deterministic SVG fallback. An article cannot ship without the photo or fallback.

## Approval reference

`owner-request:2026-08-01-autonomy-licensed-images`
