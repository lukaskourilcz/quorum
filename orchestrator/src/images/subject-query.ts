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
const VISUAL_SUBJECT: Record<string, string> = {
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
  releases: "software release"
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
