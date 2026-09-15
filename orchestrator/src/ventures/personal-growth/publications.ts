import {
  PersonalGrowthPublicationsSchema,
  type PersonalGrowthPublication,
  type PersonalGrowthPublications
} from "../../contracts/personal-growth.js";
import { readJson } from "../../state.js";

/**
 * The owner's publications on the desk's Instagram rotation.
 *
 * The desk had no idea the owner had written a book: the state tree held no title, no link, no
 * date, so no plan could mention the launch. The publications file is the owner's own list,
 * copied from the shop page, and this module turns it into one recommendation every Nth day from
 * the anchor, alternating through the list in file order. The recommendation is a frame — the
 * links, the cover, the facts the owner recorded — and the owner writes every word that posts.
 */

export const PUBLICATIONS_PATH = "ventures/personal-growth/publications.json";

/** A malformed or missing file is no publications, never a thrown desk. */
export async function readPersonalGrowthPublications(root: string): Promise<PersonalGrowthPublications | null> {
  const raw = await readJson<unknown>(root, PUBLICATIONS_PATH, null);
  if (raw === null) return null;
  const parsed = PersonalGrowthPublicationsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}

export interface PublicationPromotion {
  publication: PersonalGrowthPublication;
  /** Which promotion day this is, counted from the anchor; it picks the publication. */
  rotationIndex: number;
}

/** Every Nth day from the anchor and never before it, so a rotation can start on a chosen day. */
export function choosePublicationPromotion(input: {
  publications: PersonalGrowthPublications;
  targetPragueDate: string;
}): PublicationPromotion | null {
  const { anchorDate, everyNthDay } = input.publications.promotion;
  const offset = dayNumber(input.targetPragueDate) - dayNumber(anchorDate);
  if (offset < 0 || offset % everyNthDay !== 0) return null;
  const rotationIndex = offset / everyNthDay;
  const list = input.publications.publications;
  return { publication: list[rotationIndex % list.length]!, rotationIndex };
}

const KIND_LABEL: Record<PersonalGrowthPublication["kind"], string> = { book: "the book", audiobook: "the audiobook" };

/** The Instagram recommendation fields a promotion day fills in; the builder adds the rest. */
export function publicationRecommendationInput(promotion: PublicationPromotion, targetPragueDate: string): {
  actionType: "story-sequence";
  pillar: PersonalGrowthPublication["pillar"];
  goal: string;
  dueWindow: string;
  ownerSourceRefs: string[];
  collaborator: string;
  assetChecklist: string[];
  distributionChecklist: string[];
  storiesSupport: string[];
  reason: string;
} {
  const { publication, rotationIndex } = promotion;
  return {
    actionType: "story-sequence",
    pillar: publication.pillar,
    goal: `Promote ${publication.title} (${KIND_LABEL[publication.kind]}) in the owner's own words.`,
    dueWindow: targetPragueDate,
    ownerSourceRefs: [`${PUBLICATIONS_PATH}#${publication.id}`],
    collaborator: publication.publisher,
    assetChecklist: [
      ...(publication.coverImageUrls[0] ? [`Cover image: ${publication.coverImageUrls[0]}`] : []),
      `Shop page: ${publication.url}`,
      ...(publication.sampleUrl ? [`Free sample: ${publication.sampleUrl}`] : []),
      "One line in the owner's words on why this chapter matters today"
    ],
    distributionChecklist: [
      "Link sticker to the shop page",
      "Price only as the shop page shows it",
      "No claim beyond the recorded facts"
    ],
    storiesSupport: publication.facts.slice(0, 8),
    reason: `Promotion day ${rotationIndex} of the owner's publication rotation: ${publication.title}. The desk suggests the frame; the owner writes every word.`
  };
}
