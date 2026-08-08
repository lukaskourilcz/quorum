import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import {
  IMAGE_GATE_ARTICLE_CAP_USD,
  IMAGE_GENERATION_DAY_LIMIT,
  IMAGE_PROGRAM_DAY_CAP_USD,
  readImageProgramSpendToday
} from "./budget.js";
import { illustrationEnabled } from "./illustration.js";

/**
 * What the image programme can do today, in a shape a run report can print.
 *
 * The point is an owner reading one file and knowing why a picture is what it is: which archives
 * were reachable, whether anything had already spent the day's allowance, and whether the
 * generated rung was awake. Before this, a keyless provider and a spent cap looked identical
 * from the outside — both produced a drawn plate and said nothing.
 *
 * A key is reported as present or absent and never as a value, here or anywhere else.
 */
export interface ImageProgramReadiness {
  /** Which licensed-photo providers this run could reach. Presence only. */
  providers: Record<"openverse" | "wikimedia" | "pexels" | "pixabay", "keyless" | "present" | "absent">;
  gateModelConfigured: boolean;
  caps: {
    perArticleUsd: number;
    perDayUsd: number;
    generatedImagesPerDay: number;
  };
  spentToday: { usd: number; generatedImages: number };
  illustrationRung: "armed" | "dark";
}

export async function imageProgramReadiness(input: {
  stateRoot: string;
  now: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<ImageProgramReadiness> {
  const env = input.env ?? process.env;
  const models = await readFile(path.join(configRoot, "models.json"), "utf8")
    .then((raw) => JSON.parse(raw) as { roles?: Record<string, { model?: string }> })
    .catch(() => ({ roles: {} } as { roles?: Record<string, { model?: string }> }));
  return {
    providers: {
      // Openverse and Wikimedia need no credential, which is why the ladder can never be
      // completely keyless: those two are the floor under every article.
      openverse: "keyless",
      wikimedia: "keyless",
      pexels: env.PEXELS_API_KEY ? "present" : "absent",
      pixabay: env.PIXABAY_API_KEY ? "present" : "absent"
    },
    gateModelConfigured: Boolean(models.roles?.IMAGE_GATE?.model),
    caps: {
      perArticleUsd: IMAGE_GATE_ARTICLE_CAP_USD,
      perDayUsd: IMAGE_PROGRAM_DAY_CAP_USD,
      generatedImagesPerDay: IMAGE_GENERATION_DAY_LIMIT
    },
    spentToday: await readImageProgramSpendToday(input.stateRoot, input.now),
    illustrationRung: illustrationEnabled(env) ? "armed" : "dark"
  };
}
