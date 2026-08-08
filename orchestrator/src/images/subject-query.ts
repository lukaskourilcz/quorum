/**
 * Turn an edition's source tags into something a photo archive is actually indexed on.
 *
 * Caught Up searched with three concatenated news headlines truncated to 100 characters —
 * "AI agents cheat to win platforms fight back OpenAI Hugging Face cyberattacks rise" — and
 * every archive returned nothing, so the edition shipped a fallback that printed its own
 * headline as a picture. An archive is indexed on concrete nouns. Querying "artificial
 * intelligence" alone returns hundreds of Openverse results for the same day's material.
 *
 * The mapping is deliberate and small. Editorial and provenance tags say how a story was
 * sourced, not what it looks like, so they never become a search; a tag with no visual
 * meaning contributes nothing rather than guessing.
 */
export const VISUAL_SUBJECT: Record<string, string> = {
  ai: "artificial intelligence",
  ml: "machine learning",
  robotics: "robotics",
  chips: "semiconductor",
  hardware: "computer hardware",
  cloud: "data centre",
  infrastructure: "data centre",
  cybersecurity: "cybersecurity",
  security: "cybersecurity",
  privacy: "surveillance camera",
  platforms: "smartphone apps",
  "social-media": "social media",
  social: "social media",
  media: "newsroom",
  content: "newsroom",
  advertising: "advertising billboard",
  monetization: "advertising billboard",
  "creator-economy": "video studio",
  research: "research laboratory",
  science: "research laboratory",
  policy: "government building",
  regulation: "government building",
  law: "courtroom",
  legal: "courtroom",
  energy: "power station",
  climate: "wind turbines",
  health: "hospital",
  finance: "stock exchange",
  tech: "computer circuit board",
  oss: "open source code",
  code: "source code",
  releases: "software release",

  // The tags the desks actually emit, added on 2026-08-06 after a week of live editions. Most of
  // the table above was written before any article existed and matched almost nothing the writer
  // produced: on 2026-08-05 four of six tags mapped to nothing at all.
  agents: "data centre",
  models: "data centre",
  llm: "data centre",
  compute: "data centre",
  startups: "technology company office",
  funding: "technology company office",
  business: "technology company office",
  enterprise: "technology company office",
  openai: "technology company office",
  anthropic: "technology company office",
  google: "technology company office",
  microsoft: "technology company office",
  meta: "technology company office",
  nvidia: "semiconductor",
  amd: "semiconductor",
  apple: "technology company office",
  space: "rocket launch",
  spacex: "rocket launch",
  satellites: "rocket launch",
  telecoms: "mobile phone mast",
  robots: "robotics",
  autonomy: "self-driving car",
  transport: "self-driving car",
  education: "classroom",
  labour: "office workers",
  jobs: "office workers",
  copyright: "courtroom",
  elections: "polling station",
  defence: "military exercise",
  military: "military exercise",

  // Czech slugs. WRITE_SYSTEM requires Czech ASCII tags, so the English keys above only ever
  // match the pre-2026-08-06 archive; these are what a live edition emits.
"umela-inteligence": "artificial intelligence",
  "ai-agenti": "data centre",
  "ai-modely": "data centre",
  "ai-bezpecnost": "cybersecurity",
  bezpecnost: "cybersecurity",
  "kyberneticka-bezpecnost": "cybersecurity",
  kyberbezpecnost: "cybersecurity",
  soukromi: "surveillance camera",
  regulace: "government building",
  politika: "government building",
  pravo: "courtroom",
  soudy: "courtroom",
  vyzkum: "research laboratory",
  veda: "research laboratory",
  cipy: "semiconductor",
  polovodice: "semiconductor",
datacentra: "data centre",
  energie: "power station",
  klima: "wind turbines",
  zdravotnictvi: "hospital",
investice: "stock exchange",
  firmy: "technology company office",
  startupy: "technology company office",
  vesmir: "rocket launch",
  telekomunikace: "mobile phone mast",
  robotika: "robotics",
  doprava: "self-driving car",
  skolstvi: "classroom",
  prace: "office workers",
redakce: "newsroom",
  "socialni-site": "social media",
  reklama: "advertising billboard"
};

/**
 * The subject phrase for a set of tags, most frequent first, at most two concepts.
 *
 * Two is the ceiling because an archive treats extra words as extra constraints: "artificial
 * intelligence cybersecurity" narrows usefully, a third term usually empties the result set.
 */
export function imageSubjectQuery(tagLists: readonly (readonly string[])[]): string {
  const frequency = new Map<string, number>();
  for (const tags of tagLists) {
    for (const tag of tags) {
      const subject = VISUAL_SUBJECT[tag.toLowerCase().trim()];
      if (subject) frequency.set(subject, (frequency.get(subject) ?? 0) + 1);
    }
  }
  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([subject]) => subject)
    .join(" ");
}

/**
 * The subject phrase for the story the editor picked, not for the day's whole crowd.
 *
 * The query used to be built from the top twelve digest items, and a digest is eighty items of
 * everything that moved that morning. So the phrase described the day rather than the article:
 * on 5 August the edition was about a chip export ruling and the twelve most frequent tags
 * resolved to "data centre technology company office", which is what the archives were asked
 * for and what ran above the piece. The tags of the three-to-eight items the editor actually
 * commissioned describe the story it commissioned them for.
 *
 * The digest stays as the fallback, and it is reached more often than it looks: a pick list whose
 * tags are all editorial — primary-source, analysis — maps to nothing, and a phrase built from
 * nothing empties every archive's result set. A wider basis is a worse query than a narrow one
 * and a better query than none.
 */
export function pickedSubjectQuery(input: {
  picked: readonly (readonly string[])[];
  digest: readonly (readonly string[])[];
}): string {
  return imageSubjectQuery(input.picked) || imageSubjectQuery(input.digest);
}
