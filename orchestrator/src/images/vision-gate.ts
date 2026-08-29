import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { configRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";
import { sanitizeExternalContent, wrapUntrustedData } from "../security/content.js";
import { guardedVisionCall, type VisionCallInput, type VisionCallResult } from "../llm/vision.js";
import type { VisionImageBlock } from "../llm/anthropic.js";
import type { ImageProgramBudget } from "./budget.js";
import { IMAGE_GATE_PHASE } from "./budget.js";
import { THUMBNAIL_HOSTS, thumbnailHosted, type LicensedPhotoCandidate } from "./licensed.js";

/**
 * The law this module exists to enforce: no image ships that nothing has looked at.
 *
 * Every incident in this directory's comment history is a textual-matching failure. A caption
 * containing every word of a fighter's name belonged to an Argentinian government official; a
 * caption naming Valentina Shevchenko was taken at a firearms range; Commons files named
 * "MMA-NYC" are the Metropolitan Museum of Art's. Reading harder does not fix any of them,
 * because the caption is not the thing being asked about. One look at the picture catches all
 * three.
 *
 * So a candidate reaches the hero slot only after a model has seen its actual pixels beside the
 * article's actual headline and said the two belong together. What the gate can never do is the
 * opposite: it does not improve a picture, invent alt text, or promote something the ladder had
 * already refused. It answers one question — may this be published above this article — and its
 * only two answers are "this one" and "descend".
 *
 * Descending is a normal outcome and always available. Below the last rung is the FRAME plate,
 * which needs no model, no network and no money. That is why every failure in here (a timeout, a
 * malformed verdict, a spent cap, an unreachable thumbnail) is spelled the same way as a veto,
 * and why nothing in this file throws at its caller.
 */

export const GATE_VETOES = [
  "wrong-subject",
  "recognisable-face",
  "logo-or-watermark",
  "embedded-text",
  "ai-generated-look",
  "dated-aesthetic",
  "low-quality",
  "unsafe-content",
  "off-brief"
] as const;

export type GateVeto = (typeof GATE_VETOES)[number];

/**
 * What the gate is being asked to judge, which changes what counts as fatal.
 *
 * `search` — an archive answered a phrase and nobody has seen the result.
 * `curated` — a hand-reviewed file, re-checked because Commons files get relicensed and replaced.
 * `generated` — an illustration this system rendered. It looks generated because it is one, and
 *   it says so in its own alt text, so `ai-generated-look` cannot be held against it. What kills
 *   one is text in the frame, a face, or drifting off the brief.
 * `identity-advisory` — a photograph the subject's own Wikidata item names. The verdict is
 *   written down and changes nothing. An entity-linked photograph is used or the ladder
 *   descends; swapping it for something that scored better is how a picture of the wrong person
 *   gets published, which is the failure the identity rung was built to end.
 */
export type GateMode = "search" | "curated" | "generated" | "identity-advisory";

/** The threshold a candidate must clear. Below it, the plate is the more honest answer. */
export const GATE_FIT_THRESHOLD = 7;

const CandidateVerdictSchema = z.object({
  candidate: z.number().int().nonnegative(),
  fit: z.number().min(0).max(10),
  vetoes: z.array(z.enum(GATE_VETOES)).default([]),
  reason: z.string().trim().min(1).max(400),
  /** A Czech line describing what is in the frame, for the curation flywheel. Optional. */
  scene_cs: z.string().trim().max(200).optional()
});

const VerdictSchema = z.object({
  verdicts: z.array(CandidateVerdictSchema).min(1)
});

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate: { type: "integer", minimum: 0 },
          fit: { type: "integer", minimum: 0, maximum: 10 },
          vetoes: { type: "array", items: { type: "string", enum: [...GATE_VETOES] } },
          reason: { type: "string" },
          scene_cs: { type: "string" }
        },
        required: ["candidate", "fit", "vetoes", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["verdicts"],
  additionalProperties: false
} as const;

/** One candidate's judgement, in the shape the run report embeds verbatim. */
export interface GateCandidateVerdict {
  candidateId: string;
  provider: string;
  fit: number;
  vetoes: GateVeto[];
  reason: string;
  /** The gate's Czech description of the frame, when it wrote one. Feeds the T8 flywheel. */
  sceneCs?: string;
}

/**
 * The whole record of one gate run: what was considered, what won, and why nothing did.
 *
 * Plain JSON on purpose. It is stored beside the delivered package the same way the Design Lab
 * summary is, and for the same reason: a recorded decision beats a re-derived one, because it is
 * what actually happened. A re-run that asked again could answer differently.
 */
export interface GateVerdict {
  mode: GateMode;
  considered: number;
  /** The winning candidate's id, or null when the caller must descend. */
  selected: string | null;
  reason: string;
  candidates: GateCandidateVerdict[];
  /** Candidates whose thumbnail could not be fetched or read, and why. */
  skipped: Array<{ candidateId: string; reason: string }>;
  costUsd: number;
}

export interface GateOutcome<T extends GateCandidate = LicensedPhotoCandidate> {
  selected: T | null;
  verdict: GateVerdict;
}

export interface VisionGateway {
  assess: <T>(request: VisionCallInput<T>) => Promise<VisionCallResult<T>>;
}

export const defaultVisionGateway: VisionGateway = { assess: guardedVisionCall };

/**
 * The least a thing has to be for the gate to look at it.
 *
 * A licensed photograph satisfies this and so does a rendered illustration, which has an id and
 * bytes and no archive behind it. The gate's question — may this run above this article — is the
 * same either way, and nothing in here reads a licence or a caption.
 */
export interface GateCandidate {
  id: string;
  provider: string;
  thumbnailUrl: string;
}

export interface AssessCandidatesInput<T extends GateCandidate = LicensedPhotoCandidate> {
  venture: "caught-up" | "mma-files";
  article: { titleCs: string; dekCs: string; negatives: readonly string[] };
  candidates: readonly T[];
  mode: GateMode;
  stateRoot: string;
  cycleId: string;
  budget: ImageProgramBudget;
  /** Injectable so tests read fixture bytes and reach no network. */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  gateway?: VisionGateway;
  model?: string;
  dry?: boolean;
}

/** How large a thumbnail may be when it reaches the model. Bounds the tokens, bounds the cost. */
export const GATE_THUMBNAIL_MAX_EDGE = 512;

/** The most candidates one call will look at. The retrieval rung stops at the same number. */
export const GATE_MAX_CANDIDATES = 12;

/**
 * What one verdict costs to write, and what the whole answer is allowed to run to.
 *
 * Measured off the forty-eight `image_gate` rows in `state/budget/ledger.json`: a single-candidate
 * verdict lands between 105 and 161 output tokens, and a twelve-candidate list between 1,035 and
 * the ceiling. Per candidate that is a little over a hundred tokens, plus a small fixed wrapper.
 *
 * The ceiling was a flat 1,200 for every call, which is two things wrong at once. For twelve
 * candidates it is under the real cost, so the answer was cut off mid-array and the run reported a
 * malformed verdict — three DNESKAi editions, each billed at exactly 1,200. For one candidate it
 * is nine times the real cost, and because the reservation charged the ceiling, the article cap
 * closed before the ladder had finished descending.
 *
 * So both numbers now come from the shortlist: `EXPECTED` is what the reservation charges and
 * `ceiling` is the headroom that stops a runaway. The gap between them is deliberate — a
 * reservation that equals the ceiling is the bug this replaces.
 */
export const GATE_VERDICT_TOKENS_PER_CANDIDATE = 110;
export const GATE_VERDICT_TOKENS_FIXED = 60;
const GATE_CEILING_HEADROOM = 1.4;

export function gateExpectedOutputTokens(candidates: number): number {
  return GATE_VERDICT_TOKENS_FIXED + candidates * GATE_VERDICT_TOKENS_PER_CANDIDATE;
}

export function gateMaxOutputTokens(candidates: number): number {
  return Math.ceil(gateExpectedOutputTokens(candidates) * GATE_CEILING_HEADROOM);
}

const MAGAZINE = {
  "caught-up": "a Czech daily briefing about technology and artificial intelligence",
  "mma-files": "a Czech magazine about mixed martial arts"
} as const;

function systemPrompt(mode: GateMode, venture: AssessCandidatesInput<GateCandidate>["venture"]): string {
  const generated = mode === "generated";
  return [
    `You are the picture desk of ${MAGAZINE[venture]}.`,
    "You are shown numbered images and one article. Judge whether each image can honestly run",
    "above that article as its lead picture, and say which one should.",
    "",
    "The rules you are judging against:",
    "- The picture illustrates the topic. It is never presented as a document of the specific",
    "  event, meeting or moment the article describes.",
    mode === "identity-advisory"
      ? "- This image is linked to the person the article is about, so it may depict them."
      : "- The picture must never look like a photograph of the specific person the article names."
        + " A recognisable face is fatal even when the face belongs to somebody else.",
    "- Nothing with a logo, a watermark, a sponsor board, embedded words or a caption burned",
    "  into the frame.",
    generated
      ? "- This image was rendered by a machine and is labelled as an illustration wherever a"
        + " reader meets it, so looking rendered is not a fault. Text in the frame, a"
        + " recognisable human face, or drifting off the brief are the faults."
      : "- Nothing that looks machine-generated, and nothing whose styling dates it: stock"
        + " clip-art, glowing circuit boards, blue holographic brains, lens flares, mid-2000s"
        + " gradients.",
    "- Nothing blurred, badly lit, heavily compressed or unsafe for a general readership.",
    "",
    "Score each image 0-10 for how well it fits this article, list every veto that applies from",
    "the allowed list, and give one sentence of reasoning. When you are in doubt, veto: an",
    "article can always run without a photograph, and has, and that is a better outcome than a",
    "picture that misleads a reader.",
    "",
    "Also write scene_cs: one short Czech noun phrase for what is physically in the frame, with",
    "no names, no events and no places. Write 'prázdná klec ve sportovní hale', never 'zápas UFC",
    "300'."
  ].join("\n");
}

function userPrompt(input: AssessCandidatesInput<GateCandidate>, count: number): string {
  const title = sanitizeExternalContent(input.article.titleCs, 300).text;
  const dek = sanitizeExternalContent(input.article.dekCs, 600).text;
  const negatives = input.article.negatives
    .map((phrase) => sanitizeExternalContent(phrase, 80).text)
    .filter(Boolean)
    .slice(0, 5);
  // Title, dek and negatives only. No source URLs, no writing packet, no candidate captions:
  // a caption is what the old text-matching path trusted, and feeding it here would let the same
  // wrong signal back in through the one step that exists to be independent of it.
  return [
    wrapUntrustedData(
      "article-under-illustration",
      JSON.stringify({ title, dek, avoid: negatives })
    ),
    "",
    `Return one verdict for each of the ${count} images, by their number.`
  ].join("\n");
}

/**
 * The thumbnail, fetched and shrunk to something worth paying to look at.
 *
 * ≤512px on the long edge because the provider prices an image by its area, and nothing about
 * "is this a firearms range or a cage" needs more. WebP because it is the cheapest of the
 * formats the provider reads.
 */
async function thumbnailBlock(
  candidate: GateCandidate,
  fetchBytes: (url: string) => Promise<Uint8Array>,
  index: number
): Promise<VisionImageBlock> {
  const bytes = await fetchBytes(candidate.thumbnailUrl);
  const resized = await sharp(bytes, { failOn: "warning" })
    .rotate()
    .resize(GATE_THUMBNAIL_MAX_EDGE, GATE_THUMBNAIL_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 70, effort: 4 })
    .toBuffer();
  return {
    mediaType: "image/webp",
    base64: resized.toString("base64"),
    label: `Image ${index}:`
  };
}

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const response = await safeFetch(url, {
    allowHosts: THUMBNAIL_HOSTS,
    // The same discipline the other image modules keep. Wikimedia tightened anonymous rate
    // limits in 2026 and a nameless client is the first thing they throttle.
    headers: { "User-Agent": "BoardlessAI-PictureDesk/1.0 (https://boardless-ai.vercel.app; image review bot)" },
    maxBytes: 4_000_000,
    timeoutMs: 8_000
  });
  if (!response.contentType.startsWith("image/")) throw new Error("thumbnail is not an image");
  return response.body;
}

let cachedModel: string | null = null;

/** The gate's model id, from config. Never written into code, a comment or anything a reader sees. */
export async function imageGateModel(): Promise<string> {
  if (cachedModel) return cachedModel;
  const raw = await readFile(path.join(configRoot, "models.json"), "utf8");
  const parsed = JSON.parse(raw) as { roles?: Record<string, { model?: string }> };
  const model = parsed.roles?.IMAGE_GATE?.model;
  if (!model) throw new Error("config/models.json has no IMAGE_GATE route");
  cachedModel = model;
  return model;
}

function descended<T extends GateCandidate>(mode: GateMode, reason: string, costUsd = 0): GateOutcome<T> {
  return {
    selected: null,
    verdict: { mode, considered: 0, selected: null, reason, candidates: [], skipped: [], costUsd }
  };
}

/**
 * Look at the candidates and pick one, or say that none of them may run.
 *
 * One model call for the whole shortlist, so the scores are comparative rather than a series of
 * unrelated yes/no answers, and so twelve candidates cost one call rather than twelve.
 */
export async function assessCandidates<T extends GateCandidate>(
  input: AssessCandidatesInput<T>
): Promise<GateOutcome<T>> {
  const shortlist = input.candidates.slice(0, GATE_MAX_CANDIDATES);
  if (shortlist.length === 0) return descended(input.mode, "no-candidates");

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;
  const images: VisionImageBlock[] = [];
  const looked: T[] = [];
  const skipped: GateVerdict["skipped"] = [];
  for (const candidate of shortlist) {
    if (!input.fetchBytes && !thumbnailHosted(candidate)) {
      skipped.push({ candidateId: candidate.id, reason: "thumbnail-host-not-allowed" });
      continue;
    }
    try {
      images.push(await thumbnailBlock(candidate, fetchBytes, looked.length));
      looked.push(candidate);
    } catch (error) {
      // A thumbnail that will not fetch or will not decode is one fewer candidate, never a
      // failed run. The ladder has behaved this way since the curated rungs were written.
      skipped.push({
        candidateId: candidate.id,
        reason: error instanceof Error ? error.message.slice(0, 120) : "thumbnail-unreadable"
      });
    }
  }
  if (images.length === 0) {
    return {
      selected: null,
      verdict: {
        mode: input.mode,
        considered: 0,
        selected: null,
        reason: "no-thumbnail-could-be-read",
        candidates: [],
        skipped,
        costUsd: 0
      }
    };
  }

  let model: string;
  try {
    model = input.model ?? (await imageGateModel());
  } catch (error) {
    return descended(input.mode, `no-gate-model:${error instanceof Error ? error.message : "unknown"}`);
  }

  const gateway = input.gateway ?? defaultVisionGateway;
  const result = await gateway.assess({
    stateRoot: input.stateRoot,
    cycleId: input.cycleId,
    phase: IMAGE_GATE_PHASE,
    ventureId: input.venture,
    agent: "IMAGE_GATE",
    model,
    system: systemPrompt(input.mode, input.venture),
    input: userPrompt(input, images.length),
    images,
    maxOutputTokens: gateMaxOutputTokens(images.length),
    expectedOutputTokens: gateExpectedOutputTokens(images.length),
    tool: {
      name: "emit_image_verdicts",
      description: "One verdict per image, by its number.",
      inputSchema: TOOL_INPUT_SCHEMA
    },
    parse: (value: unknown) => VerdictSchema.parse(value),
    budget: input.budget,
    ...(input.dry === undefined ? {} : { dry: input.dry })
  });

  if (!result.ok) {
    // A cap, a timeout, a refusal, a verdict that would not parse. Every one of them means the
    // same thing to the caller: nothing here has been looked at, so descend.
    return {
      selected: null,
      verdict: {
        mode: input.mode,
        considered: looked.length,
        selected: null,
        reason: result.reason,
        candidates: [],
        skipped,
        costUsd: result.usd
      }
    };
  }

  const candidates: GateCandidateVerdict[] = [];
  for (const raw of result.value.verdicts) {
    const candidate = looked[raw.candidate];
    if (!candidate) continue;
    // In generated mode the picture is a rendering and is labelled as one everywhere a reader
    // meets it, so "this looks generated" is a description rather than a fault.
    const vetoes = raw.vetoes.filter((veto) =>
      !(input.mode === "generated" && veto === "ai-generated-look"));
    candidates.push({
      candidateId: candidate.id,
      provider: candidate.provider,
      fit: raw.fit,
      vetoes,
      reason: raw.reason,
      ...(raw.scene_cs ? { sceneCs: raw.scene_cs } : {})
    });
  }

  const verdict: GateVerdict = {
    mode: input.mode,
    considered: looked.length,
    selected: null,
    reason: "",
    candidates,
    skipped,
    costUsd: result.usd
  };

  if (input.mode === "identity-advisory") {
    // Written down, and that is all. The identity rung is decided by the subject's own item,
    // not by how a picture scores.
    verdict.reason = "advisory-only";
    return { selected: null, verdict };
  }

  const passing = candidates
    .filter((entry) => entry.vetoes.length === 0 && entry.fit >= GATE_FIT_THRESHOLD)
    .sort((left, right) => right.fit - left.fit);
  const winner = passing[0];
  if (!winner) {
    verdict.reason = candidates.length === 0 ? "no-verdicts-returned" : "all-candidates-rejected";
    return { selected: null, verdict };
  }
  verdict.selected = winner.candidateId;
  verdict.reason = winner.reason;
  return {
    selected: looked.find((candidate) => candidate.id === winner.candidateId) ?? null,
    verdict
  };
}
