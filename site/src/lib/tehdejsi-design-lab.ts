import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseTehdejsiFeatureRecommendation, type TehdejsiFeatureRecommendation } from "./tehdejsi-feature-model";

export interface TehdejsiDesignLabPack {
  recommendationId: string;
  date: string;
  slides: Array<{ ordinal: number; cs: string; ua: string }>;
  captionCs: string;
  captionUa: string;
  photo: TehdejsiFeatureRecommendation["media"][number] | null;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/** Read the one approved package behind a recorded TS summary; malformed state is unavailable. */
export async function readTehdejsiDesignLabPack(
  recommendationId: string,
  date: string
): Promise<TehdejsiDesignLabPack | null> {
  const directory = path.join(repositoryRoot(), "state/ventures/tehdejsi-svet/drafts");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch { return null; }
  const matches: TehdejsiFeatureRecommendation[] = [];
  for (const name of names) {
    try {
      const parsed = parseTehdejsiFeatureRecommendation(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      if (parsed?.id === recommendationId && parsed.date === date && ["approved", "posted", "archived"].includes(parsed.status)) {
        matches.push(parsed);
      }
    } catch {
      // An unreadable package never becomes an export candidate.
    }
  }
  if (matches.length !== 1) return null;
  const recommendation = matches[0]!;
  return {
    recommendationId,
    date,
    slides: recommendation.payload.slides,
    captionCs: recommendation.payload.captionCs,
    captionUa: recommendation.payload.captionUa,
    photo: recommendation.media.find(({ licence }) => licence !== "own-render") ?? null
  };
}

export function tehdejsiPhotoStatePath(recommendationId: string): string {
  return `state/ventures/tehdejsi-svet/media/${recommendationId}.png`;
}
