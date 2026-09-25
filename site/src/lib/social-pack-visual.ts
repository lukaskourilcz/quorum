import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The visual payload a DNESKAi social pack committed for one locale and channel.
 *
 * Two routes re-render a pack's frames from it: the Social Profiles review frame (SVG) and the
 * Queue's frame strip (PNG) for a legacy item whose frames were never written to disk. Both read
 * it here, so the two cannot disagree about which strings a frame shows.
 */
export interface SocialPackVisual {
  templateId: string;
  version: string;
  locale: "en" | "cs";
  strings: Record<string, string>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function readSocialPackVisual(
  root: string,
  input: { date: string; locale: string; channel: string }
): Promise<SocialPackVisual | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.date) || !["en", "cs"].includes(input.locale) || !["instagram", "threads"].includes(input.channel)) return null;
  const locale = input.locale as "en" | "cs";
  const pack = record(JSON.parse(await readFile(path.join(root, "state", "social", "packs", `${input.date}.json`), "utf8")) as unknown);
  const localized = record(record(pack?.byLocale)?.[locale]);
  const visual = record(record(localized?.[input.channel])?.visual);
  const templateId = typeof visual?.template_id === "string" ? visual.template_id : null;
  const version = typeof visual?.version === "string" ? visual.version : null;
  const content = record(visual?.content);
  const strings = record(content?.strings);
  if (!templateId || !version || content?.locale !== locale || !strings || !Object.values(strings).every((value) => typeof value === "string")) return null;
  return { templateId, version, locale, strings: strings as Record<string, string> };
}
