import { CZECH_EDITORIAL_REGISTER } from "./registers.js";

/**
 * The Czech desk.
 *
 * This module used to run a second model call: STET wrote the article in English and HACEK
 * rebuilt it in Czech. DNESKAi publishes in Czech only now, so there is nothing to rebuild
 * and the call is gone — it was 39% of an edition's cost for a locale nobody was served.
 *
 * What remains is the part that was never about translating: the register the Czech desk
 * writes to, and the repair it makes before the copy gate sees the text. HACEK's role is
 * still what it was — Czech copy — applied to writing rather than to adaptation. Whether the
 * agent keeps a seat in the edition room is an organizational question for PEOPLE, not
 * something a language migration decides.
 */
export const CZECH_DESK_REGISTER = CZECH_EDITORIAL_REGISTER;

const CZECH_EMPTY_ADVERB = "doslova|upřímně|skutečně|jednoduše|potenciálně|opravdu|vskutku|zásadně|nepochybně";

/**
 * Delete empty emphasis words from Czech copy before it reaches the gate.
 *
 * The gate blocks on these rather than repairing them, and a block costs a whole regenerated
 * article. A word that can simply be deleted should not be worth a rewrite.
 *
 * The boundaries are Unicode classes, not \b: \b is an ASCII word boundary and cannot see the
 * end of "upřímně", so an ASCII pattern would never match. Six rules in the copy gate were
 * dead for exactly that reason.
 */
export function removeEmptyCzechAdverbs(value: string): string {
  const before = "(?<![\\p{L}\\p{N}_])";
  const after = "(?![\\p{L}\\p{N}_])";
  return value
    .replace(new RegExp(`${before}(?:${CZECH_EMPTY_ADVERB})${after},\\s*`, "giu"), "")
    .replace(new RegExp(`${before}(?:${CZECH_EMPTY_ADVERB})${after}[ \\t]+`, "giu"), "")
    .replace(new RegExp(`${before}(?:${CZECH_EMPTY_ADVERB})${after}`, "giu"), "")
    // Deleting the first word leaves the next one lowercase mid-sentence.
    .replace(/^([a-záčďéěíňóřšťúůýž])/u, (first) => first.toLocaleUpperCase("cs-CZ"));
}
