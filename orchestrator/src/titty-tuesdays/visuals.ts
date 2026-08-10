import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { estimateImageCall, type BudgetLedgerEntry } from "../budget.js";
import {
  DesignProposalSchema,
  designProposalMediaPath,
  designProposalPath,
  type DesignProposal
} from "../contracts/design-proposal.js";
import { webpVariant } from "../images/licensed.js";
import { configRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";
import { atomicWriteJson, readJson } from "../state.js";
import {
  TT_PROMPT_TEMPLATE_VERSION,
  buildGarmentPrompt,
  garmentAltText,
  type GarmentConcept
} from "./prompt.js";

/**
 * Two crop-top renders a day, one per provider, recorded and rated by the owner.
 *
 * The doc this implements designed a weekly Tuesday batch of six through one provider; the owner
 * amended it to daily, two images, one OpenAI and one fal, so a day's output is a comparison
 * between two renderers of the same concept rather than three framings from one.
 *
 * Everything below the concept is code. The room writes concept fields; `buildGarmentPrompt`
 * assembles the prompt from a fixed frame; the doctrine clauses are constants a concept cannot
 * reach. The deterministic checker cannot assert that no body appears in a raster, that the
 * wordmark rendered, or that the garment is a crop top — so the owner is the gate, and the panel
 * says so rather than pretending otherwise.
 *
 * Off unless every one of these holds: `TT_VISUALS_ENABLED`, both keys, and the countersigned
 * approvals. Off is silent.
 */

export const TT_VISUALS_PHASE = "tt_visuals";

/** Two images a day, one per provider. Enforced here, not requested of anything. */
export const TT_VISUALS_DAY_LIMIT = 2;

/** The month's ceiling, read back from the ledger before every call. */
export const TT_VISUALS_MONTH_CAP_USD = 2;

/** fal's fixed per-image price, as the illustration rung records it. */
export const FAL_USD_PER_IMAGE = 0.004;

const FAL_API_HOST = "fal.run";
/** Fixed here, never taken from the response: a hostile answer must not redirect the downloader. */
const FAL_OUTPUT_HOSTS = ["fal.media", "v3.fal.media", "v3b.fal.media"];

/** The six approvals from the design doc's §8, all-or-nothing. */
export const TT_VISUAL_APPROVALS = [
  "TT-VISUALS-SPEND-001",
  "TT-VISUALS-ROLE-002",
  "TT-VISUALS-STORAGE-003",
  "TT-VISUALS-DOCTRINE-004",
  "TT-VISUALS-BATCH-005",
  "TT-VISUALS-CONTRACT-006"
] as const;

export type TtVisualProvider = "openai" | "fal";

export interface RenderedVariant {
  bytes: Uint8Array;
  model: string;
  usd: number;
}

export type VariantRenderer = (input: {
  provider: TtVisualProvider;
  prompt: string;
  model: string;
  apiKey: string;
}) => Promise<RenderedVariant>;

/**
 * Both keys and the flag, and then the signatures.
 *
 * A key with no flag is an account somebody set up and has not decided about; a flag with no key
 * cannot render anything; and neither is the owner's yes. All three, or nothing runs.
 */
export function ttVisualsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TT_VISUALS_ENABLED === "true"
    && Boolean(env.OPENAI_API_KEY)
    && Boolean(env.FAL_KEY);
}

/**
 * Every one of the six approvals, countersigned.
 *
 * All-or-nothing on purpose: they describe one capability, and signing the spend without signing
 * the doctrine wording would authorise money for a rule nobody agreed.
 */
export function ttVisualApprovalsSigned(inbox: string): boolean {
  return TT_VISUAL_APPROVALS.every((id) =>
    new RegExp(`^- \\[[xX]\\] HUMAN_APPROVAL ${id}\\b`, "mu").test(inbox));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function roleModel(role: string): Promise<{ provider: string; model: string; quality?: string; size?: string } | null> {
  try {
    const parsed = record(JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")));
    const entry = record(record(parsed?.roles)?.[role]);
    const provider = entry && typeof entry.provider === "string" ? entry.provider : null;
    const model = entry && typeof entry.model === "string" ? entry.model : null;
    if (!entry || !provider || !model) return null;
    return {
      provider,
      model,
      quality: typeof entry.quality === "string" ? entry.quality : undefined,
      size: typeof entry.size === "string" ? entry.size : undefined
    };
  } catch {
    return null;
  }
}

/**
 * What this programme has already spent this month, read from the ledger rather than tracked.
 *
 * The `readImageProgramSpendToday` pattern: a counter kept beside the ledger is a second copy of
 * the truth, and the copy is the one that goes wrong. A retry that re-reads the ledger cannot
 * double-spend a ceiling.
 */
export async function readTtVisualMonthSpend(stateRoot: string, now: Date): Promise<number> {
  const month = now.toISOString().slice(0, 7);
  const ledger = await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] });
  return Number(ledger.entries
    .filter((entry) => entry.phase === TT_VISUALS_PHASE && entry.ts.slice(0, 7) === month)
    .reduce((sum, entry) => sum + entry.usd, 0)
    .toFixed(8));
}

/** One render per provider, through each one's own posture. */
export const defaultVariantRenderer: VariantRenderer = async (input) => {
  if (input.provider === "fal") {
    const response = await safeFetch(`https://${FAL_API_HOST}/${input.model}`, {
      allowHosts: [FAL_API_HOST],
      method: "POST",
      headers: { Authorization: `Key ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        image_size: { width: 1_024, height: 1_024 },
        num_images: 1,
        enable_safety_checker: true,
        output_format: "jpeg"
      }),
      maxBytes: 200_000,
      timeoutMs: 60_000
    });
    const payload = JSON.parse(new TextDecoder().decode(response.body)) as { images?: Array<{ url?: unknown }> };
    const url = typeof payload.images?.[0]?.url === "string" ? payload.images[0].url : "";
    if (!url) throw new Error("the renderer returned no image");
    const image = await safeFetch(url, { allowHosts: FAL_OUTPUT_HOSTS, maxBytes: 12_000_000, timeoutMs: 30_000 });
    if (!image.contentType.startsWith("image/")) throw new Error("the rendered asset is not an image");
    return { bytes: image.body, model: input.model, usd: FAL_USD_PER_IMAGE };
  }

  const response = await safeFetch("https://api.openai.com/v1/images/generations", {
    allowHosts: ["api.openai.com"],
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium"
    }),
    maxBytes: 20_000_000,
    timeoutMs: 120_000
  });
  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    data?: Array<{ b64_json?: unknown }>;
  };
  const encoded = typeof payload.data?.[0]?.b64_json === "string" ? payload.data[0].b64_json : "";
  if (!encoded) throw new Error("the renderer returned no image");
  return {
    bytes: new Uint8Array(Buffer.from(encoded, "base64")),
    model: input.model,
    // Priced from the same table the reserve used, so the recorded cost and the estimate agree.
    usd: estimateImageCall({
      model: input.model as "gpt-image-2",
      quality: "medium",
      size: "1024x1024",
      promptChars: input.prompt.length
    }).estimatedUsd
  };
};

export interface TtVisualResult {
  /** Relative state paths written. Empty on a silent or refused run. */
  artifacts: string[];
  proposal: DesignProposal | null;
  /** Why nothing was rendered, when nothing was. Null on a run that produced images. */
  skippedReason: string | null;
}

export async function runTittyTuesdaysVisuals(input: {
  stateRoot: string;
  now: Date;
  concept: GarmentConcept;
  env?: NodeJS.ProcessEnv;
  render?: VariantRenderer;
}): Promise<TtVisualResult> {
  const env = input.env ?? process.env;
  const date = input.now.toISOString().slice(0, 10);

  if (!ttVisualsEnabled(env)) return { artifacts: [], proposal: null, skippedReason: null };

  let inbox = "";
  try {
    inbox = await readFile(path.join(input.stateRoot, "INBOX.md"), "utf8");
  } catch {
    inbox = "";
  }
  if (!ttVisualApprovalsSigned(inbox)) {
    return {
      artifacts: [],
      proposal: null,
      skippedReason: "The six visual-programme approvals are not all countersigned."
    };
  }

  // The day cap is a fact about disk, not a counter: a proposal for today already exists or it
  // does not, and a re-run of the same day must not render a second pair.
  const existing = await readJson<unknown>(input.stateRoot, designProposalPath(date), null as unknown);
  if (existing !== null) {
    return { artifacts: [], proposal: null, skippedReason: `Today already has ${TT_VISUALS_DAY_LIMIT} recorded renders.` };
  }

  const spent = await readTtVisualMonthSpend(input.stateRoot, input.now);
  if (spent >= TT_VISUALS_MONTH_CAP_USD) {
    return { artifacts: [], proposal: null, skippedReason: `The $${TT_VISUALS_MONTH_CAP_USD.toFixed(2)} monthly ceiling for this programme is spent.` };
  }

  const [openaiRole, falRole] = await Promise.all([roleModel("TT_VISUAL_IMAGE"), roleModel("TT_VISUAL_IMAGE_FAL")]);
  const render = input.render ?? defaultVariantRenderer;
  const variants: DesignProposal["variants"] = [];
  const failures: DesignProposal["failures"] = [];
  const artifacts: string[] = [];
  let monthSpend = spent;

  for (const [provider, role, apiKey] of [
    ["openai", openaiRole, env.OPENAI_API_KEY],
    ["fal", falRole, env.FAL_KEY]
  ] as const) {
    if (!role) {
      failures.push({ provider, reason: `config/models.json has no route for the ${provider} renderer.` });
      continue;
    }
    // Read back before every call, so a two-provider day cannot cross the ceiling on its second.
    if (monthSpend >= TT_VISUALS_MONTH_CAP_USD) {
      failures.push({ provider, reason: "The monthly ceiling was reached before this render." });
      continue;
    }

    const prompt = buildGarmentPrompt(input.concept, provider);
    try {
      const rendered = await render({ provider, prompt, model: role.model, apiKey: apiKey! });
      // Re-encoded before it is written: the raw returns are 1-2 MB and this repository has no LFS.
      // "attention" rather than "top": the garment is the subject and the renderer puts it
      // wherever it likes inside the square.
      const bytes = await webpVariant(rendered.bytes, 1_024, 1_024, 400_000, "attention");
      const relative = designProposalMediaPath(date, input.concept.conceptId, provider);
      const absolute = path.join(input.stateRoot, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, bytes);
      artifacts.push(relative);

      variants.push({
        variantId: `${input.concept.conceptId}-${provider}`,
        provider,
        model: rendered.model,
        prompt,
        altText: garmentAltText(input.concept),
        imagePath: relative,
        contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        bytes: bytes.byteLength,
        usd: rendered.usd,
        createdAt: input.now.toISOString(),
        status: "proposed",
        rejectedAt: null,
        reason: null
      });
      monthSpend = Number((monthSpend + rendered.usd).toFixed(8));
    } catch (error) {
      // One provider failing costs that provider's image. It never costs the other one, and it
      // never costs the room the step runs inside.
      failures.push({
        provider,
        reason: error instanceof Error ? error.message.slice(0, 400) : "The render failed."
      });
    }
  }

  if (variants.length === 0) {
    return {
      artifacts: [],
      proposal: null,
      skippedReason: failures.map((entry) => `${entry.provider}: ${entry.reason}`).join("; ") || "Nothing rendered."
    };
  }

  const proposal = DesignProposalSchema.parse({
    schemaVersion: "design-proposal/1",
    ventureId: "titty-tuesdays",
    date,
    promptTemplateVersion: TT_PROMPT_TEMPLATE_VERSION,
    concept: input.concept,
    variants,
    failures,
    generatedAt: input.now.toISOString()
  });
  const relative = designProposalPath(date);
  await atomicWriteJson(input.stateRoot, relative, proposal);
  artifacts.push(relative);

  return { artifacts, proposal, skippedReason: null };
}
