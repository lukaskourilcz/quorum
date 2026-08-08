import { ILLUSTRATIVE_SCENES } from "./illustrative-scenes.js";

/**
 * The visual brief: what the desk that wrote the article says its picture should show.
 *
 * The searches that produced this project's worst covers ran on one or two words from a hardcoded
 * tag table — "artificial intelligence", "data centre" — chosen before anyone knew what the
 * article said. The desk knows. It has just written eight hundred words about a specific thing and
 * can name what a photograph of that thing would contain, which is all an archive is indexed on.
 *
 * Three fields, and the shape of each one is a guard.
 *
 * `phrases` are English because the archives are: Openverse, Pexels and Pixabay index almost
 * nothing in Czech, and Commons search on a Czech phrase returns Czech-language file pages rather
 * than pictures of the thing. They are short because an archive treats extra words as extra
 * constraints and a seven-word phrase returns nothing.
 *
 * `concept` is one key from a closed list, so the curated rung can be tried first. A key the list
 * does not hold is not a typo to be guessed at; it is a concept nobody has reviewed photographs
 * for, and the honest answer is to fall through to the search.
 *
 * `negatives` are what the desk does not want in the frame. DNESKAi's design contract bans the
 * glowing circuit-board brain, and one shipped anyway, because nothing downstream had been told.
 */
export interface VisualBrief {
  phrases: string[];
  concept: string | null;
  negatives: string[];
}

/**
 * The MMA desk's one curated concept.
 *
 * DNESKAi's curated sets are keyed by subject because its articles are about different things
 * every day. MMA Files writes about one sport, so its whole reviewed set is a single rotation of
 * cages, halls and crowds. It still needs a name here, because the vocabulary is closed and a
 * desk has to be able to point at it.
 */
export const MMA_SCENE_CONCEPT = "mixed martial arts arena";

/**
 * Every concept a desk may name, in one list, so both writers are asked for the same vocabulary.
 *
 * Derived from the curated sets rather than written out beside them. A curated set added without
 * its key appearing here would be a set no desk could ever ask for, and the two drifting apart is
 * exactly the failure the single list exists to prevent.
 */
export const VISUAL_CONCEPTS: readonly string[] = [
  ...Object.keys(ILLUSTRATIVE_SCENES).sort(),
  MMA_SCENE_CONCEPT
];

/** Lowercase, diacritics folded away. The one comparison every check below runs on. */
export function foldToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();
}

/**
 * The words a phrase may not contain: everything the article is about by name.
 *
 * Built from the subject refs and any names the caller holds. Short tokens are dropped because
 * they collide with ordinary English — "de", "vs", "ufc" would refuse half the useful phrases —
 * and the risk they carry is nil: nobody is identified by a three-letter fragment.
 */
export function forbiddenNameTokens(sources: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const source of sources) {
    for (const word of foldToken(source).split(/[^a-z0-9]+/u)) {
      if (word.length >= 4) tokens.add(word);
    }
  }
  return [...tokens];
}

export interface VisualBriefInput {
  phrases: readonly string[] | undefined;
  concept: string | undefined;
  negatives: readonly string[] | undefined;
  /** Subject refs, fighter names, anything the article is about by name. */
  nameSources: readonly string[];
}

export interface VisualBriefCheck {
  brief: VisualBrief | null;
  problems: string[];
}

const MAXIMUM_PHRASE_WORDS = 6;
const MINIMUM_PHRASE_WORDS = 2;

/**
 * Check the brief the desk wrote, and drop the whole thing if any part of it fails.
 *
 * Validation rather than trust, and all-or-nothing rather than repair. A writer that smuggled a
 * fighter's name into one phrase has misunderstood the instruction, and the other two phrases it
 * wrote under that misunderstanding are not evidence of anything. There is no retry either: a
 * second call costs money to ask the same question, and the fallback — the tag-derived subject
 * query — is a working path that produced covers for a week.
 *
 * The name rule is the one that matters. A phrase carrying a person's name turns the licensed
 * search back into the name search that put an Argentinian government official above an article
 * about a bantamweight, and the whole certainty ladder is built on people being resolved through
 * their Wikidata item or not at all.
 */
export function checkVisualBrief(input: VisualBriefInput): VisualBriefCheck {
  const problems: string[] = [];
  const phrases = (input.phrases ?? []).map((phrase) => phrase.trim()).filter(Boolean);
  if (phrases.length < 2 || phrases.length > 3) {
    problems.push(`phrase-count:${phrases.length}`);
  }
  const forbidden = forbiddenNameTokens(input.nameSources);
  for (const phrase of phrases) {
    // Printable ASCII only. A Czech phrase reaches Openverse as a string no photograph is
    // indexed under, and a diacritic is the cheapest signal that the desk wrote one.
    if (!/^[\x20-\x7e]+$/u.test(phrase)) {
      problems.push(`phrase-not-ascii:${phrase.slice(0, 40)}`);
      continue;
    }
    const words = phrase.split(/\s+/u).filter(Boolean);
    if (words.length < MINIMUM_PHRASE_WORDS || words.length > MAXIMUM_PHRASE_WORDS) {
      problems.push(`phrase-length:${words.length}`);
    }
    const folded = foldToken(phrase);
    const foldedWords = new Set(folded.split(/[^a-z0-9]+/u));
    for (const token of forbidden) {
      // Word match catches the ordinary case; containment catches the phrase that runs a name
      // together to slip past it. Both fail the same way, because both are the same mistake.
      if (foldedWords.has(token) || folded.includes(token)) {
        problems.push(`phrase-names-subject:${token}`);
        break;
      }
    }
  }
  const negatives = (input.negatives ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, 5);
  const concept = input.concept?.trim() ?? "";
  // A concept outside the vocabulary is dropped on its own. It is a hint about which curated set
  // to try first, and a wrong hint costs a rung rather than a guarantee, so it does not take the
  // phrases down with it.
  const resolvedConcept = VISUAL_CONCEPTS.includes(concept) ? concept : null;
  if (concept && !resolvedConcept) problems.push(`concept-unknown:${concept.slice(0, 40)}`);

  const fatal = problems.filter((problem) => !problem.startsWith("concept-unknown:"));
  if (fatal.length > 0) return { brief: null, problems };
  return { brief: { phrases, concept: resolvedConcept, negatives }, problems };
}
