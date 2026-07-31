import YAML from "yaml";
import { z } from "zod";
import { sanitizeExternalContent } from "../security/content.js";
import { VentureIdSchema } from "../contracts/common.js";

export const TASTE_TOKEN_LIMIT = 1_500;

const RatingIdSchema = z.string().regex(/^r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/);
const TasteFrontmatterSchema = z.object({
  venture: VentureIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
  watermark: RatingIdSchema.nullable()
}).strict();

export interface TasteRule {
  instruction: string;
  ratingIds: string[];
}

export interface TasteDocument {
  venture: string;
  updatedAt: string;
  watermark: string | null;
  pursue: TasteRule[];
  avoid: TasteRule[];
  open: TasteRule[];
}

export class TasteValidationError extends Error {
  constructor(readonly findings: string[]) {
    super(findings.join("; "));
    this.name = "TasteValidationError";
  }
}

export function estimateTasteTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

function parseRule(line: string, lineNumber: number): TasteRule {
  const match = /^- (.+) \(r:(r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}(?:,r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12})*)\)$/.exec(line);
  if (!match) {
    throw new TasteValidationError([
      `Taste line ${lineNumber} must be a bullet ending with rating references`
    ]);
  }
  const instruction = match[1]!.trim();
  const ratingIds = match[2]!.split(",");
  const signals = sanitizeExternalContent(instruction, 240).promptInjectionSignals;
  const findings = [
    ...(instruction.length === 0 || instruction.length > 240
      ? [`Taste line ${lineNumber} must contain 1-240 characters`]
      : []),
    ...(new Set(ratingIds).size !== ratingIds.length
      ? [`Taste line ${lineNumber} repeats a rating reference`]
      : []),
    ...(signals.length
      ? [`Taste line ${lineNumber} contains prompt-like language`]
      : [])
  ];
  if (findings.length) throw new TasteValidationError(findings);
  return { instruction, ratingIds };
}

export function parseTasteDocument(raw: string): TasteDocument {
  const findings: string[] = [];
  if (estimateTasteTokens(raw) > TASTE_TOKEN_LIMIT) {
    findings.push(`Taste memory exceeds ${TASTE_TOKEN_LIMIT} estimated tokens`);
  }
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replaceAll("\r\n", "\n"));
  if (!frontmatterMatch) {
    throw new TasteValidationError([...findings, "Taste memory requires YAML frontmatter"]);
  }
  let frontmatter: z.infer<typeof TasteFrontmatterSchema>;
  try {
    frontmatter = TasteFrontmatterSchema.parse(YAML.parse(frontmatterMatch[1]!));
  } catch {
    throw new TasteValidationError([...findings, "Taste frontmatter is invalid"]);
  }

  const sections: Record<"pursue" | "avoid" | "open", TasteRule[]> = {
    pursue: [],
    avoid: [],
    open: []
  };
  const seen = new Set<string>();
  let current: keyof typeof sections | null = null;
  for (const [index, line] of frontmatterMatch[2]!.split("\n").entries()) {
    const lineNumber = frontmatterMatch[1]!.split("\n").length + index + 4;
    if (!line.trim()) continue;
    const heading = /^## (Pursue|Avoid|Open)$/.exec(line);
    if (heading) {
      current = heading[1]!.toLowerCase() as keyof typeof sections;
      if (seen.has(current)) findings.push(`Taste section ${heading[1]} appears more than once`);
      seen.add(current);
      continue;
    }
    if (!current) {
      findings.push(`Taste line ${lineNumber} appears before a supported section`);
      continue;
    }
    try {
      sections[current].push(parseRule(line, lineNumber));
    } catch (error) {
      if (error instanceof TasteValidationError) findings.push(...error.findings);
      else throw error;
    }
  }
  for (const required of ["pursue", "avoid"] as const) {
    if (!seen.has(required)) findings.push(`Taste memory requires a ${required} section`);
  }
  const allInstructions = Object.values(sections).flat().map((rule) => rule.instruction.toLowerCase());
  if (new Set(allInstructions).size !== allInstructions.length) {
    findings.push("Taste instructions must be unique across sections");
  }
  if (findings.length) throw new TasteValidationError(findings);
  return { ...frontmatter, ...sections };
}

function renderRules(rules: readonly TasteRule[]): string {
  return rules.map((rule) => `- ${rule.instruction} (r:${rule.ratingIds.join(",")})`).join("\n");
}

export function serializeTasteDocument(document: TasteDocument): string {
  const frontmatter = TasteFrontmatterSchema.parse({
    venture: document.venture,
    updatedAt: document.updatedAt,
    watermark: document.watermark
  });
  const chunks = [
    "---",
    `venture: ${frontmatter.venture}`,
    `updatedAt: ${frontmatter.updatedAt}`,
    `watermark: ${frontmatter.watermark ?? "null"}`,
    "---",
    "## Pursue",
    renderRules(document.pursue),
    "",
    "## Avoid",
    renderRules(document.avoid)
  ];
  if (document.open.length) chunks.push("", "## Open", renderRules(document.open));
  const raw = `${chunks.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
  parseTasteDocument(raw);
  return raw;
}

export function emptyTasteDocument(venture: string, now: Date): TasteDocument {
  return {
    venture: VentureIdSchema.parse(venture),
    updatedAt: now.toISOString(),
    watermark: null,
    pursue: [],
    avoid: [],
    open: []
  };
}
