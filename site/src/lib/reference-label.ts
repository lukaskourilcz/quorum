export interface ReferenceDescription {
  label: string;
  href?: string;
}

const acronyms: Record<string, string> = {
  ai: "AI",
  api: "API",
  bbc: "BBC",
  cito: "CITO",
  cs: "CS",
  hf: "HF",
  hn: "HN",
  lg: "LG",
  llm: "LLM",
  mma: "MMA",
  nyt: "NYT",
  rss: "RSS",
  ufc: "UFC",
  vs: "vs"
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A slug read back as a name: `the-odds-api` becomes "The Odds API".
 *
 * This is the id spelled out, not a name invented for it. A registry name would be better, but
 * the registries live outside the site bundle and half these references name sources the site
 * has no registry for at all.
 */
function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) =>
      acronyms[word] ?? (/^\d+$/.test(word) ? word : word[0]!.toUpperCase() + word.slice(1))
    )
    .join(" ");
}

/** `2026-08-05` as "5 Aug". Anything that is not a date returns null. */
function shortDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : null;
}

/**
 * What an evidence pill says, and where it goes.
 *
 * The references were printed exactly as stored: `source:the-odds-api:2026-08-05`,
 * `meeting:2026-08-05-mma-analysis`, `event:ufc:event:ufc-fight-night-gamrot-vs-salkilld`,
 * `idea-2026-08-05-bbffd7f5`. Every live reference follows one of these shapes, so each gets a
 * sentence-case label and, where the site holds the page, a link to it. A reference in none of
 * these shapes returns null and its pill is dropped rather than shown raw.
 */
export function describeReference(value: string): ReferenceDescription | null {
  const reference = value.trim();
  if (reference.length === 0 || reference.length > 160) return null;

  const source = /^source:([a-z0-9-]+)(?::(\d{4}-\d{2}-\d{2}))?$/i.exec(reference);
  if (source) {
    const on = source[2] ? shortDate(source[2]) : null;
    return { label: `Source: ${nameFromSlug(source[1]!)}${on ? ` (${on})` : ""}` };
  }

  const meeting = /^(?:meeting:|meetings\/)(\d{4}-\d{2}-\d{2})-([a-z-]+)$/i.exec(reference);
  if (meeting) {
    const on = shortDate(meeting[1]!);
    return on
      ? { label: `Meeting notes, ${on}`, href: `/meetings/${meeting[1]}-${meeting[2]}` }
      : null;
  }

  const event = /^event:[a-z0-9-]+:event:([a-z0-9-]+)$/i.exec(reference);
  if (event) return { label: nameFromSlug(event[1]!) };

  const idea = /^idea-(\d{4}-\d{2}-\d{2})-[a-z0-9]+$/i.exec(reference);
  if (idea) {
    const on = shortDate(idea[1]!);
    return on ? { label: `Idea from ${on}` } : null;
  }

  const fighter = /^fighter:([a-z0-9-]+)$/i.exec(reference);
  if (fighter) return { label: `Fighter file: ${nameFromSlug(fighter[1]!)}` };

  const budget = /^budget-(\d{4})-(\d{2})([a-z])$/i.exec(reference);
  if (budget) {
    const month = months[Number(budget[2]) - 1];
    return month ? { label: `Budget decision, ${month} ${budget[1]}` } : null;
  }

  return null;
}
