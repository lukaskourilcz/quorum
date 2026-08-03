import { independentMmaSourceCount } from "../contracts/mma.js";

/**
 * Whether two readings of the same field are the same fact.
 *
 * Comparing the raw strings filed twenty-six open discrepancies on ninety-two cards, and most of
 * them were not disagreements at all:
 *
 *   - "Robert Whittaker (fighter)" against "Robert Whittaker" — a Wikipedia disambiguator, which
 *     is part of a page title and never part of a person's name.
 *   - "Ailín Pérez" against "Ailin Perez" — the same name, with one source stripping diacritics.
 *   - "Featherweight" against "Lightweight" for Conor McGregor, both from the same page — the old
 *     parse against the new one, which is a code change and not a source conflict.
 *
 * An open discrepancy on a critical field bars a fighter from the model, so a false one is not a
 * harmless extra note. Real differences — "Abus Magomedov" against "Abusupiyan Magomedov", or a
 * women's division against an unqualified one — still open, because those want a human.
 */

/** Wikipedia's parenthetical disambiguator: part of a page title, never part of a name. */
export function stripDisambiguator(value: string): string {
  return value.replace(/\s*\((?:fighter|mixed martial artist|martial artist|born \d{4})\)\s*$/iu, "").trim();
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en");
}

export function namesAgree(left: string, right: string): boolean {
  return fold(stripDisambiguator(left)) === fold(stripDisambiguator(right));
}

/**
 * A division name, in the one spelling.
 *
 * The promotion feed writes "light-heavyweight" and Wikipedia writes "Light Heavyweight". They are
 * the same division. "womens-flyweight" against "Flyweight" is not, and stays a disagreement,
 * because they are two different divisions with two different champions.
 */
export function normalizeDivision(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\bwomen'?s\b/gu, "womens")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** Body measurements survive a round trip through inches, so they agree within a centimetre. */
const MEASUREMENT_TOLERANCE_CM = 1.5;

export function fieldValuesAgree(field: string, left: unknown, right: unknown): boolean {
  const a = String(left).trim();
  const b = String(right).trim();
  if (field === "name") return namesAgree(a, b);
  if (field === "division") return normalizeDivision(a) === normalizeDivision(b);
  if (field === "heightCm" || field === "reachCm") {
    // Wikipedia states 5 ft 10 in, which is 177.8; Wikidata stores a whole 178. Reading those as a
    // conflict left the wrong value in place and the right one locked out.
    const [x, y] = [Number(a), Number(b)];
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) <= MEASUREMENT_TOLERANCE_CM;
  }
  return a.toLocaleLowerCase("en") === b.toLocaleLowerCase("en");
}

/**
 * Whether an incoming reading replaces the stored one instead of contradicting it.
 *
 * True when every source already behind the field is the same provider as the incoming one: the
 * provider has not changed its mind, we have changed how we read it. Re-reading Conor McGregor's
 * infobox after fixing the weight-class parser must supersede "Featherweight", not argue with it.
 */
export function supersedesSameProvider(existingRefs: readonly string[], incomingRef: string): boolean {
  if (existingRefs.length === 0) return false;
  return independentMmaSourceCount([...existingRefs, incomingRef]) === 1;
}

/**
 * The eligibility rule, in one place.
 *
 * `FighterCardSchema` refuses to parse a card whose `modelEligible` disagrees with it, so every
 * writer has to reach the same answer. Three of them were computing it separately.
 */
export function computeModelEligibility(
  criticalFields: readonly string[],
  fields: Record<string, { sourceRefs: readonly string[]; corroborated: boolean; status: string } | undefined>,
  discrepancies: ReadonlyArray<{ field: string; status: string }>
): boolean {
  const open = new Set(discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  return criticalFields.every((name) => {
    const field = fields[name];
    return Boolean(field
      && field.status === "verified"
      && field.corroborated
      && independentMmaSourceCount(field.sourceRefs) >= 2
      && !open.has(name));
  });
}

interface Discrepancy {
  field: string;
  values: ReadonlyArray<{ value: unknown; sourceRef: string }>;
  status: "open" | "resolved";
}

/**
 * Closes open discrepancies whose two sides say the same thing under the rules above.
 *
 * Runs on every rebuild rather than as a one-off migration, because the comparison rules are the
 * thing that changes: cards written before a rule existed keep the flag they were given, and
 * nothing else would ever revisit them.
 */
export function resolveAgreeingDiscrepancies<T extends Discrepancy>(discrepancies: readonly T[]): T[] {
  return discrepancies.map((item) => {
    if (item.status !== "open" || item.values.length < 2) return item;
    const [first, ...rest] = item.values;
    const agrees = rest.every((entry) => fieldValuesAgree(item.field, first!.value, entry.value));
    return agrees ? { ...item, status: "resolved" as const } : item;
  });
}
