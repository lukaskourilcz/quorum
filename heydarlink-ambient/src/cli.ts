import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultStateDir, loadConfig, PERSONA_KEYS, type PersonaKey } from "./config.js";
import { openaiGates } from "./gates.js";
import { uploadFrame } from "./ingest.js";
import { readLedger, writeLedger } from "./ledger.js";
import { mockGates, mockRenderer } from "./mock.js";
import { renderChain } from "./providers.js";
import { runAmbient, type RunReport } from "./run.js";
import { stockSeed } from "./stock.js";

/**
 * `pnpm --filter @boardlessai/heydarlink-ambient ambient`
 *
 * Inputs come from the environment only, the way the workflow passes them:
 *   AMBIENT_PERSONA   all | nina | fatimah | teresa | michaela        (default all)
 *   AMBIENT_COUNT     shots per persona today                         (default 1)
 *   AMBIENT_DRY_RUN   true renders and gates but uploads nothing      (default false)
 *   AMBIENT_DAILY_USD hard cap for the UTC day across all personas    (default from config)
 *   AMBIENT_OUT_DIR   where frames and report.json go                 (default ./ambient-out)
 *   AMBIENT_STATE_DIR ledger directory                                (default state/heydarlink-ambient)
 *   AMBIENT_MOCK      true swaps every provider and model for a local fake; dry runs only
 *
 * Secrets are read by name and never printed: FAL_KEY, OPENAI_API_KEY, GEMINI_API_KEY (optional),
 * PEXELS_API_KEY, PIXABAY_API_KEY, HEYDARLINK_INGEST_URL, HEYDARLINK_INGEST_TOKEN.
 */
export class ConfigurationError extends Error {}

export interface CliInputs {
  personas: PersonaKey[];
  count: number;
  dryRun: boolean;
  capUsd: number;
  mock: boolean;
  outDir: string;
  stateDir: string;
}

export function parseInputs(env: NodeJS.ProcessEnv, defaults: { capUsd: number; maxCount: number }): CliInputs {
  const persona = (env.AMBIENT_PERSONA ?? "all").trim() || "all";
  if (persona !== "all" && !(PERSONA_KEYS as readonly string[]).includes(persona)) {
    throw new ConfigurationError(`AMBIENT_PERSONA must be all or one of ${PERSONA_KEYS.join(", ")}`);
  }
  const count = Number(env.AMBIENT_COUNT?.trim() || "1");
  if (!Number.isInteger(count) || count < 1 || count > defaults.maxCount) {
    throw new ConfigurationError(`AMBIENT_COUNT must be a whole number from 1 to ${defaults.maxCount}`);
  }
  const capRaw = env.AMBIENT_DAILY_USD?.trim();
  const capUsd = capRaw ? Number(capRaw) : defaults.capUsd;
  // An explicit cap above $5 a day is a typo, not a decision; the owner raises config instead.
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new ConfigurationError("AMBIENT_DAILY_USD must be above 0 and at most 5");
  const flag = (value: string | undefined) => {
    const normalized = (value ?? "").trim().toLowerCase();
    if (normalized === "" || normalized === "false") return false;
    if (normalized === "true") return true;
    throw new ConfigurationError(`expected true or false, got "${value}"`);
  };
  const dryRun = flag(env.AMBIENT_DRY_RUN);
  const mock = flag(env.AMBIENT_MOCK);
  if (mock && !dryRun) throw new ConfigurationError("AMBIENT_MOCK is allowed only with AMBIENT_DRY_RUN=true");
  return {
    personas: persona === "all" ? [...PERSONA_KEYS] : [persona as PersonaKey],
    count,
    dryRun,
    capUsd,
    mock,
    outDir: path.resolve(env.AMBIENT_OUT_DIR?.trim() || "ambient-out"),
    stateDir: path.resolve(env.AMBIENT_STATE_DIR?.trim() || defaultStateDir)
  };
}

/**
 * Checks names, never values. A real run without the ingest pair stops here, before any paid
 * call: rendering frames that cannot be delivered would spend the day's cap on nothing.
 */
export function missingSecrets(env: NodeJS.ProcessEnv, inputs: Pick<CliInputs, "dryRun" | "mock">): string[] {
  if (inputs.mock) return [];
  const missing: string[] = [];
  if (!env.FAL_KEY && !env.OPENAI_API_KEY && !env.GEMINI_API_KEY) missing.push("FAL_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)");
  // The gates run on OpenAI. Without it every frame would be rejected, so say so up front.
  if (!env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!inputs.dryRun) {
    if (!env.HEYDARLINK_INGEST_URL) missing.push("HEYDARLINK_INGEST_URL");
    if (!env.HEYDARLINK_INGEST_TOKEN) missing.push("HEYDARLINK_INGEST_TOKEN");
  }
  return missing;
}

export function summarize(report: RunReport): string {
  const lines = [
    `## HeyDarlink ambient ${report.date}${report.dryRun ? " (dry run)" : ""}`,
    "",
    `Spent this run: $${report.runSpentUsd.toFixed(4)} · today: $${report.spentTodayUsd.toFixed(4)} of $${report.capUsd.toFixed(2)}${report.capReached ? " · **cap reached**" : ""}`,
    "",
    "| persona | shot | aspect | outcome | provider | cost | reasons |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.frames.map(
      (frame) =>
        `| ${frame.persona} | ${frame.shotId} | ${frame.aspect} | ${frame.outcome} | ${frame.provider ?? "-"} | $${frame.costUsd.toFixed(4)} | ${frame.reasons.join(", ") || "-"} |`
    )
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const config = await loadConfig();
  const env = process.env;
  const inputs = parseInputs(env, { capUsd: config.caps.dailyUsdDefault, maxCount: config.caps.maxCountPerPersona });
  const missing = missingSecrets(env, inputs);
  if (missing.length) {
    console.error(`::error::HeyDarlink ambient cannot run: missing ${missing.join(", ")}. Nothing was rendered or uploaded.`);
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  const ledger = await readLedger(inputs.stateDir);
  const ingestUrl = env.HEYDARLINK_INGEST_URL ?? "";
  const ingestToken = env.HEYDARLINK_INGEST_TOKEN ?? "";
  const report = await runAmbient({
    config,
    ledger,
    date,
    personas: inputs.personas,
    count: inputs.count,
    dryRun: inputs.dryRun,
    capUsd: inputs.capUsd,
    renderers: inputs.mock ? [mockRenderer(config)] : renderChain(config, env),
    gates: inputs.mock ? mockGates() : openaiGates(config, env.OPENAI_API_KEY),
    stockSeed: inputs.mock ? async () => null : (shot, aspect) => stockSeed({ shot, aspect, date, config, env }),
    upload: inputs.dryRun ? null : (jpeg, meta) => uploadFrame({ url: ingestUrl, token: ingestToken, jpeg, meta }),
    outDir: inputs.dryRun ? inputs.outDir : null
  });
  await writeLedger(inputs.stateDir, ledger, date);
  await mkdir(inputs.outDir, { recursive: true });
  await writeFile(path.join(inputs.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const summary = summarize(report);
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
  if (report.uploadFailures > 0) {
    console.error(`::error::${report.uploadFailures} accepted frame(s) did not reach HeyDarlink; see the reasons column.`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error: unknown) => {
    console.error(`::error::${error instanceof ConfigurationError ? error.message : "HeyDarlink ambient failed"}`);
    if (!(error instanceof ConfigurationError)) console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
