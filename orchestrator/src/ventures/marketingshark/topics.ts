/**
 * `{topic}` values, in the register the copy expects.
 *
 * Category slugs are what the bank actually carries, and they are the honest topic: a hook filled
 * from anything else would be claiming something the payload does not say. Only the presentation is
 * mapped, and only for the slugs whose display form is not their capitalisation.
 */
const TOPIC_LABELS: Readonly<Record<string, string>> = {
  javascript: "JavaScript", typescript: "TypeScript", nodejs: "Node.js", css: "CSS", html: "HTML",
  dsa: "DSA", "system-design": "system design", react: "React", git: "Git", databases: "databases",
  testing: "testing", security: "security", internet: "the internet", algorithms: "algorithms"
};

export function topicLabel(category: string): string {
  return TOPIC_LABELS[category] ?? `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

/** The same label where it opens a line or stands alone, as a theme or a recap entry does. */
export function topicHeading(category: string): string {
  const label = topicLabel(category);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}
