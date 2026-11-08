import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AmbientConfig, Aspect, PersonaKey, Shot } from "./config.js";
import { duplicateGate, formatGate, readFormat, type GateModels } from "./gates.js";
import { CropRefused, gradeFrame } from "./grade.js";
import type { IngestMetadata, IngestResult } from "./ingest.js";
import { sha256Hex } from "./ingest.js";
import { Budget, publishedHashes, round, rotationOf, type FrameRecord, type Ledger } from "./ledger.js";
import { phash } from "./phash.js";
import { frameSeed, type Render, type Renderer, type RenderRequest } from "./providers.js";
import { pickShots } from "./select.js";

export interface RunOptions {
  config: AmbientConfig;
  ledger: Ledger;
  date: string;
  personas: readonly PersonaKey[];
  count: number;
  dryRun: boolean;
  capUsd: number;
  renderers: readonly Renderer[];
  gates: GateModels;
  stockSeed: (shot: Shot, aspect: Aspect) => Promise<RenderRequest["stockSeed"] | null>;
  /** null in a dry run; the run never builds an upload it will not send. */
  upload: ((jpeg: Uint8Array, meta: IngestMetadata) => Promise<IngestResult>) | null;
  /** Where a dry run writes its frames for the workflow artifact. */
  outDir: string | null;
  now?: () => Date;
}

export interface RunReport {
  date: string;
  dryRun: boolean;
  capUsd: number;
  spentTodayUsd: number;
  runSpentUsd: number;
  capReached: boolean;
  frames: FrameRecord[];
  uploadFailures: number;
}

class CapReached extends Error {}

/**
 * One day's run. Each frame is a shot at one aspect, rendered natively at that aspect, graded,
 * gated and either uploaded or dropped with its reasons. A frame that fails its gates gets a
 * second attempt with a new seed; a provider that errors hands the frame to the next one in the
 * chain. Reaching the cap ends the run cleanly — every frame after it is recorded as skipped,
 * so the ledger shows what the money did not stretch to.
 */
export async function runAmbient(options: RunOptions): Promise<RunReport> {
  const now = options.now ?? (() => new Date());
  const budget = new Budget(options.ledger, options.date, options.capUsd);
  const startSpent = budget.spentToday();
  const frames: FrameRecord[] = [];
  const acceptedHashes = [...publishedHashes(options.ledger)];
  let capReached = false;

  for (const persona of options.personas) {
    const personaConfig = options.config.personas[persona];
    const { picked, used } = pickShots({
      shots: personaConfig.shots,
      used: rotationOf(options.ledger, persona),
      count: options.count,
      date: options.date,
      persona
    });
    // A dry run is a rehearsal of today's picks, so it leaves the rotation where it was.
    if (!options.dryRun) options.ledger.rotation[persona] = { used };

    for (const shot of picked) {
      for (const aspect of shot.aspects) {
        const base = {
          date: options.date,
          persona,
          shotId: shot.id,
          pillar: shot.pillar,
          aspect
        };
        if (capReached) {
          frames.push(record(base, now, "skipped-cap", ["cap:daily"], null, 0, null, null));
          continue;
        }
        try {
          const outcome = await produceFrame({ ...options, persona, shot, aspect, budget, acceptedHashes });
          const cost = outcome.costUsd;
          if (!outcome.accepted) {
            frames.push(record(base, now, "rejected", outcome.reasons, outcome.render, cost, outcome.hash, outcome.jpeg));
            if (options.outDir && outcome.jpeg) await writeFrame(options.outDir, persona, shot, aspect, outcome.jpeg, "rejected");
            continue;
          }
          const jpeg = outcome.jpeg!;
          const render = outcome.render!;
          acceptedHashes.push(outcome.hash!);
          if (options.dryRun || !options.upload) {
            if (options.outDir) await writeFrame(options.outDir, persona, shot, aspect, jpeg, "accepted");
            frames.push(record(base, now, "dry-run", [], render, cost, outcome.hash, jpeg));
            continue;
          }
          const result = await options.upload(jpeg, {
            persona_key: persona,
            aspect,
            pillar: shot.pillar,
            shot_id: shot.id,
            prompt: shot.prompt,
            provider: render.provider,
            model: render.model,
            cost_usd: cost,
            seed: render.seed,
            phash: outcome.hash!,
            source_ref: render.sourceRef
          });
          const frame = record(
            base,
            now,
            result.kind === "stored" ? "uploaded" : result.kind === "duplicate" ? "duplicate-on-server" : "upload-failed",
            result.kind === "stored" ? [] : [`ingest:${result.code}`],
            render,
            cost,
            outcome.hash,
            jpeg
          );
          frame.ingestId = result.kind === "stored" ? result.id : null;
          frames.push(frame);
        } catch (error) {
          if (!(error instanceof CapReached)) throw error;
          capReached = true;
          frames.push(record(base, now, "skipped-cap", ["cap:daily"], null, 0, null, null));
        }
      }
    }
  }

  options.ledger.frames.push(...frames);
  const spentTodayUsd = budget.spentToday();
  return {
    date: options.date,
    dryRun: options.dryRun,
    capUsd: options.capUsd,
    spentTodayUsd,
    runSpentUsd: round(spentTodayUsd - startSpent),
    capReached,
    frames,
    uploadFailures: frames.filter((frame) => frame.outcome === "upload-failed").length
  };
}

interface FrameOutcome {
  accepted: boolean;
  reasons: string[];
  render: Render | null;
  jpeg: Uint8Array | null;
  hash: string | null;
  costUsd: number;
}

async function produceFrame(
  input: RunOptions & { persona: PersonaKey; shot: Shot; aspect: Aspect; budget: Budget; acceptedHashes: string[] }
): Promise<FrameOutcome> {
  const { config, persona, shot, aspect, budget } = input;
  const reasons: string[] = [];
  let costUsd = 0;
  let last: Omit<FrameOutcome, "accepted" | "reasons" | "costUsd"> = { render: null, jpeg: null, hash: null };
  let seed: RenderRequest["stockSeed"] | null | undefined;
  const spend = (kind: "render" | "gate", provider: string, model: string, usd: number) => {
    if (!budget.reserve({ persona, shotId: shot.id, aspect, kind, provider, model, usd, dryRun: input.dryRun })) throw new CapReached();
    costUsd = round(costUsd + usd);
  };

  for (let attempt = 0; attempt < config.caps.maxAttemptsPerFrame; attempt++) {
    const tag = `a${attempt + 1}`;
    let render: Render | null = null;
    for (const renderer of input.renderers) {
      const estimate = renderer.estimateUsd(aspect);
      if (estimate + config.gate.visionUsdPerCheck > config.caps.perFrameUsdMax) {
        reasons.push(`${tag}:${renderer.name}:over-frame-cap`);
        continue;
      }
      if (renderer.name === "fal" && seed === undefined) seed = await input.stockSeed(shot, aspect).catch(() => null);
      spend("render", renderer.name, renderer.model, estimate);
      try {
        render = await renderer.render({
          prompt: shot.prompt,
          negative: config.negative,
          aspect,
          seed: frameSeed(input.date, persona, shot.id, aspect, attempt),
          ...(renderer.name === "fal" && seed ? { stockSeed: seed } : {})
        });
        break;
      } catch {
        reasons.push(`${tag}:${renderer.name}:render-failed`);
      }
    }
    if (!render) {
      reasons.push(`${tag}:no-renderer`);
      break;
    }

    let jpeg: Buffer;
    try {
      jpeg = await gradeFrame({ source: render.bytes, aspect, grade: config.personas[persona].grade, config, noiseSeed: frameSeed(shot.id, aspect) });
    } catch (error) {
      reasons.push(`${tag}:grade:${error instanceof CropRefused ? "crop-refused" : "undecodable"}`);
      continue;
    }
    const hash = await phash(jpeg);
    last = { render, jpeg, hash };
    const found = formatGate(jpeg, await readFormat(jpeg), aspect, config);
    const duplicate = duplicateGate(hash, input.acceptedHashes, config.gate.nearDuplicateDistance);
    if (duplicate) found.push(duplicate);
    if (render.flaggedNsfw) found.push("renderer:nsfw");
    if (found.length === 0) found.push(...(await input.gates.moderate(jpeg)));
    if (found.length === 0) {
      spend("gate", "openai", config.gate.visionModel, config.gate.visionUsdPerCheck);
      found.push(...(await input.gates.inspect(jpeg, shot.prompt)));
    }
    if (found.length === 0) return { accepted: true, reasons, costUsd, ...last };
    reasons.push(...found.map((reason) => `${tag}:${reason}`));
  }
  return { accepted: false, reasons, costUsd, ...last };
}

function record(
  base: Pick<FrameRecord, "date" | "persona" | "shotId" | "pillar" | "aspect">,
  now: () => Date,
  outcome: FrameRecord["outcome"],
  reasons: string[],
  render: Render | null,
  costUsd: number,
  hash: string | null,
  jpeg: Uint8Array | null
): FrameRecord {
  return {
    ...base,
    at: now().toISOString(),
    outcome,
    reasons,
    provider: render?.provider ?? null,
    model: render?.model ?? null,
    costUsd,
    phash: hash,
    sha256: jpeg ? sha256Hex(jpeg) : null,
    seed: render?.seed ?? null,
    ingestId: null
  };
}

async function writeFrame(outDir: string, persona: string, shot: Shot, aspect: Aspect, jpeg: Uint8Array, verdict: string) {
  const directory = path.join(outDir, persona);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${verdict}-${shot.id}-${aspect.replace(":", "x")}.jpg`), jpeg);
}
