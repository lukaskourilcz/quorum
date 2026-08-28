import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { WebDevSignalDesignLab } from "./webdev-signal-design-lab";
import { readWebDevDesignLabSnapshot } from "@/lib/webdev-signal-design-lab";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "webdev-admin-"));
  roots.push(root);
  const payloadRef = "state/ventures/webdev-signal/design-lab/payloads/fixture.json";
  const receiptDir = path.join(root, "state/ventures/webdev-signal/design-lab/receipts");
  await mkdir(path.join(root, path.dirname(payloadRef)), { recursive: true });
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(root, payloadRef), JSON.stringify({
    schemaVersion: "webdev-design-payload/1",
    contentHash: "a".repeat(64),
    packageRef: "state/ventures/webdev-signal/packages/en.json",
    locale: "en",
    edition: "EN",
    status: "preview",
    template: { id: "webdev-signal-change-4", version: "1.0.0" },
    brand: { id: "webdev-signal", version: "1.0.0" },
    correction: { sequence: 1, supersedesPayloadHash: null },
    panels: [
      { id: "panel-01", semantics: ["lead"], heading: "Runtime preview remains non-stable", body: "A bounded lead.", sourceRefs: [] },
      { id: "panel-02", semantics: ["change", "impact"], heading: "Change and impact", body: "A bounded explanation.", sourceRefs: [] },
      { id: "panel-03", semantics: ["action"], heading: "What to check", body: "No additional action is stated.", sourceRefs: [] },
      { id: "panel-04", semantics: ["source"], heading: "Source", body: "Official release", sourceRefs: ["https://example.com/release"] }
    ],
    sources: [{ url: "https://example.com/release", label: "Official release" }]
  }));
  await writeFile(path.join(receiptDir, "fixture.json"), JSON.stringify({
    schemaVersion: "webdev-render-receipt/1",
    payloadRef,
    checks: { schema: "pass", capability: "pass", textFit: "pass", contrast: "pass", statusNonColor: "pass", sourcePlacement: "pass" },
    outputs: Array.from({ length: 4 }, (_, index) => ({ panelId: `panel-0${index + 1}`, pngHash: String(index + 1).repeat(64) })),
    cache: { status: "new" },
    outcome: "success",
    reason: null,
    supersededReceiptRef: null
  }));
  return root;
}

describe("WebDev Signal Design Lab Admin projection", () => {
  it("shows recorded packages, panel/source proof, gates, hashes and cache state", async () => {
    const snapshot = await readWebDevDesignLabSnapshot(await fixtureRoot());
    expect(snapshot).toMatchObject({ unreadable: 0, entries: [{ locale: "en", edition: "EN", status: "preview", outcome: "success", cacheState: "new" }] });
    expect(snapshot.entries[0]?.safeActions).toEqual(["preview", "rerun-same-payload", "hold"]);
    expect(snapshot.entries[0]?.workspaceHref).toBeNull();
    const html = renderToStaticMarkup(<WebDevSignalDesignLab snapshot={snapshot} />);
    expect(html).toContain("Runtime preview remains non-stable");
    expect(html).toContain("https://example.com/release");
    expect(html).toContain("statusNonColor");
    expect(html).toContain("payload aaaaaaaaaa");
    expect(html).not.toMatch(/credential|publish button|edit claim/iu);
  });

  it("isolates a malformed receipt without inventing an entry", async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, "state/ventures/webdev-signal/design-lab/receipts/bad.json"), "{\"wrong\":true}");
    const snapshot = await readWebDevDesignLabSnapshot(root);
    expect(snapshot).toMatchObject({ unreadable: 1 });
    expect(snapshot.entries).toHaveLength(1);
  });
});
