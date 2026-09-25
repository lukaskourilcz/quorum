import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Test support: a throwaway repository root holding the committed registries and one devShark
 * LinkedIn draft, the fixture the orchestrator hashed.
 *
 * The capability map is the committed one with marketingShark's Social Distribution edge ensured,
 * at the map version the fixture's capability reference names. That edge is quorum#568's to
 * register; the Queue's tests should not depend on which lane reached main first.
 */
const repository = path.resolve(process.cwd(), "..");
export const DRAFT_FILE = "2026-09-26-devshark-en-linkedin.json";
export const MARKETINGSHARK_EDGE_REFERENCE = "state/decisions/2026-09-26-devshark-social-queue.md";

export async function readQueueFixture(name = "social-queue-item-v2.valid.json"): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(repository, "contracts", "fixtures", name), "utf8")) as Record<string, unknown>;
}

export async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

export async function queueFixtureRoot(options: { capabilityEdge?: boolean; draft?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "admin-queue-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  for (const file of ["social-publisher-registry.json", "channels.json", "ventures.json", "marketingshark.json"]) {
    await copyFile(path.join(repository, "config", file), path.join(root, "config", file));
  }
  const map = JSON.parse(await readFile(path.join(repository, "config", "venture-capabilities.json"), "utf8")) as { mapVersion: string; edges: Array<Record<string, unknown>> };
  const edges = map.edges.filter((edge) => !(edge.source === "marketingshark" && edge.target === "social-distribution"));
  if (options.capabilityEdge !== false) {
    edges.push({
      schemaVersion: "venture-capability-edge/1",
      source: "marketingshark",
      target: "social-distribution",
      capability: "approved-publish-package",
      dataSchemaVersion: "approved-publish-package/1",
      direction: "source-to-target",
      decision: "allowed",
      reason: "Test fixture: marketingShark hands devShark drafts to Social Distribution.",
      governingReference: MARKETINGSHARK_EDGE_REFERENCE,
      runtimeEnforcementPoint: "orchestrator/src/social/publisher-targets.ts",
      testProbeReference: "orchestrator/tests/venture-capability.test.ts"
    });
  }
  await writeJson(root, "config/venture-capabilities.json", { ...map, mapVersion: "1.4.0", edges });
  if (options.draft !== false) await writeJson(root, `state/social/queue/${DRAFT_FILE}`, await readQueueFixture());
  return root;
}

export const PACKAGE_DATE = "2026-09-26";
export const PACKAGE_SLUG = "marketingshark-2026-09-26-devshark";
export const PACKAGE_CHANNELS = ["linkedin", "instagram", "threads"] as const;

/**
 * A root holding the devShark package the orchestrator drafts for 2026-09-26 (quorum#575): the
 * committed handshake fixtures `marketingshark-{package,render,queue-*}.valid.json`, which
 * `orchestrator/tests/marketingshark-rerender.test.ts` regenerates and compares, so the site's
 * tests render the room's own package rather than a hand-made one.
 */
export async function packageFixtureRoot(options: { designLabEdge?: boolean; facts?: boolean; queue?: boolean } = {}): Promise<string> {
  const root = await queueFixtureRoot({ draft: false });
  const directory = `state/ventures/marketingshark/packages/${PACKAGE_DATE}/devshark`;
  await writeJson(root, `${directory}/package.json`, await readQueueFixture("marketingshark-package.valid.json"));
  const render = await readQueueFixture("marketingshark-render.valid.json");
  if (options.facts === false) delete render.facts;
  await writeJson(root, `${directory}/render-en.json`, render);
  if (options.queue !== false) {
    for (const channel of PACKAGE_CHANNELS) {
      await writeJson(root, `state/social/queue/${PACKAGE_DATE}-devshark-en-${channel}.json`, await readQueueFixture(`marketingshark-queue-${channel}.valid.json`));
    }
  }
  if (options.designLabEdge === false) {
    const map = JSON.parse(await readFile(path.join(root, "config", "venture-capabilities.json"), "utf8")) as { edges: Array<Record<string, unknown>> };
    map.edges = map.edges.filter((edge) => !(edge.source === "marketingshark" && edge.target === "design-lab"));
    await writeJson(root, "config/venture-capabilities.json", map);
  }
  return root;
}
