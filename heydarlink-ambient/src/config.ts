import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const configPath = path.join(repoRoot, "config", "heydarlink-ambient.json");
export const defaultStateDir = path.join(repoRoot, "state", "heydarlink-ambient");

export const ASPECTS = ["4:5", "9:16"] as const;
export type Aspect = (typeof ASPECTS)[number];

/** The four persona keys HeyDarlink's persona_aliases carries. Anything else is refused. */
export const PERSONA_KEYS = ["nina", "fatimah", "teresa", "michaela"] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

/**
 * Every prompt has to say, in its own words, that the frame holds nobody and no lettering.
 * The negative list alone is not enough: FLUX dev ignores negatives, so the positive prompt is
 * the only instruction it actually reads.
 */
const REQUIRED_PHRASES = ["no people", "no faces", "no text", "no logos"];

const ShotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,60}$/u),
    pillar: z.enum(["views", "food", "drinks", "interiors", "flatlay", "city", "sunset", "outfit", "books", "flowers"]),
    prompt: z.string().min(40).max(900),
    aspects: z.array(z.enum(ASPECTS)).min(1),
    stockSeed: z
      .object({
        source: z.enum(["pexels", "pixabay"]),
        query: z.string().min(3).max(80),
        // Low strength keeps the stock pixels; 0.8+ keeps only the geometry, which is the point.
        strength: z.number().min(0.75).max(0.95)
      })
      .optional()
  })
  .refine(
    (shot) => REQUIRED_PHRASES.every((phrase) => shot.prompt.toLowerCase().includes(phrase)),
    { message: `every prompt must contain: ${REQUIRED_PHRASES.join(", ")}` }
  );
export type Shot = z.infer<typeof ShotSchema>;

const GradeSchema = z.object({
  contrast: z.number().min(0.7).max(1.4),
  lift: z.number().min(-30).max(30),
  warmth: z.number().min(-1).max(1),
  saturation: z.number().min(0.6).max(1.4),
  grain: z.number().min(0).max(0.06),
  vignette: z.number().min(0).max(0.12)
});
export type Grade = z.infer<typeof GradeSchema>;

const PersonaSchema = z.object({
  home: z.string(),
  grade: GradeSchema,
  shots: z.array(ShotSchema).min(4)
});

const host = z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/u);

export const AmbientConfigSchema = z.object({
  schemaVersion: z.literal(1),
  caps: z.object({
    dailyUsdDefault: z.number().positive().max(10),
    perFrameUsdMax: z.number().positive().max(1),
    maxAttemptsPerFrame: z.number().int().min(1).max(4),
    maxCountPerPersona: z.number().int().min(1).max(10)
  }),
  sizes: z.object({
    "4:5": z.object({ width: z.literal(1080), height: z.literal(1350) }),
    "9:16": z.object({ width: z.literal(1080), height: z.literal(1920) })
  }),
  negative: z.string(),
  providers: z.object({
    fal: z.object({
      model: z.string(),
      img2imgModel: z.string(),
      usdPerMegapixel: z.number().positive(),
      steps: z.number().int().min(1).max(50),
      host,
      outputHosts: z.array(host).min(1)
    }),
    openai: z.object({ model: z.string(), quality: z.enum(["low", "medium", "high"]), usdPerImage: z.number().positive(), host }),
    gemini: z.object({ model: z.string(), usdPerImage: z.number().positive(), host })
  }),
  gate: z.object({
    visionModel: z.string(),
    visionUsdPerCheck: z.number().positive(),
    moderationModel: z.string(),
    moderationSexualMax: z.number().min(0).max(1),
    nearDuplicateDistance: z.number().int().min(0).max(32),
    maxBytes: z.number().int().positive().max(8_000_000),
    maxCropFraction: z.number().min(0).max(0.25)
  }),
  stock: z.object({
    pexels: z.object({ host, imageHosts: z.array(host).min(1) }),
    pixabay: z.object({ host, imageHosts: z.array(host).min(1) })
  }),
  personas: z.object({
    nina: PersonaSchema,
    fatimah: PersonaSchema,
    teresa: PersonaSchema,
    michaela: PersonaSchema
  })
});
export type AmbientConfig = z.infer<typeof AmbientConfigSchema>;

export function parseConfig(raw: unknown): AmbientConfig {
  const config = AmbientConfigSchema.parse(raw);
  const ids = PERSONA_KEYS.flatMap((key) => config.personas[key].shots.map((shot) => shot.id));
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`shot id ${duplicate} appears twice`);
  return config;
}

export async function loadConfig(file = configPath): Promise<AmbientConfig> {
  return parseConfig(JSON.parse(await readFile(file, "utf8")));
}

/** fal bills per megapixel rounded up, so a 1.46 MP frame is two megapixels on the invoice. */
export function falFrameUsd(config: AmbientConfig, aspect: Aspect): number {
  const { width, height } = config.sizes[aspect];
  return Math.ceil((width * height) / 1_000_000) * config.providers.fal.usdPerMegapixel;
}
