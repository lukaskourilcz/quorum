import type { LicensedPhotoCandidate } from "./licensed.js";

/**
 * The alt text a photograph ships with, and the one place the writer can be overruled about it.
 *
 * The writer is shown captions and never a pixel, so an alt it produces is a guess about a picture
 * it has not seen. Two kinds of candidate know better than it does, and for opposite reasons.
 *
 * A candidate carrying `altCs` describes itself: an entity-linked photograph arrives with alt text
 * built from the Commons file's own description, written by somebody who was looking at it. Asked
 * anyway, the writer invents — the 4 August article captioned a man in a suit at a lectern
 * "Gustavo Lopez v zápasovém postoji", in a fighting stance.
 *
 * An illustrative photograph is the stricter case, and the reason this is a function rather than a
 * chain of `??`. It shows a cage or a hall and nobody the article is about, and the writer knows
 * exactly whose article it is writing; an alt it produces for a stock cage photograph is one
 * sentence away from "Valentina Shevchenko in the UFC cage", which is the lie the whole ladder
 * exists to prevent. So for such a candidate the writer's text is not preferred against, it is
 * unreachable — there is no branch here that can return it — and the last resort is a sentence
 * that still claims nothing rather than the caller's subject-derived fallback.
 */
export function heroAltCs(
  candidate: Pick<LicensedPhotoCandidate, "altCs" | "illustrative">,
  writerAlt: string | undefined,
  fallback: string
): string {
  if (candidate.illustrative) return candidate.altCs ?? "Ilustrační fotografie ze zápasů MMA. Nejde o snímek osoby, o níž článek pojednává.";
  return candidate.altCs ?? writerAlt ?? fallback;
}
