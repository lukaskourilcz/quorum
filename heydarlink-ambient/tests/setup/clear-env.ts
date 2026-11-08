import { beforeEach } from "vitest";

/**
 * No test may see a provider or ingest credential, whatever shell started it. The same rule as
 * orchestrator/tests/setup/provider-env.ts and for the same reason: a test that read an ambient
 * key would take a paid path on a machine that has one and a free path in CI.
 */
export const CLEARED = [
  "FAL_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PEXELS_API_KEY",
  "PIXABAY_API_KEY",
  "HEYDARLINK_INGEST_URL",
  "HEYDARLINK_INGEST_TOKEN",
  "AMBIENT_DAILY_USD",
  "AMBIENT_DRY_RUN",
  "AMBIENT_MOCK"
] as const;

beforeEach(() => {
  for (const name of CLEARED) delete process.env[name];
});
