import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignLabBrandPanel } from "@/components/admin/design-lab-brand";

const committedKits = path.resolve(__dirname, "..", "..", "..", "studio", "brand-kits");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** A repository root with the committed kits and a registry in which `statuses` hold. */
async function repository(statuses: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "design-lab-brand-"));
  roots.push(root);
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
    ventures: Object.entries(statuses).map(([id, status]) => ({ id, name: id, status }))
  }));
  await cp(committedKits, path.join(root, "studio", "brand-kits"), { recursive: true });
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.resetModules();
  const snapshot = await import("@/lib/admin-design-lab-brand");
  return { root, ...snapshot };
}

describe("the Design Lab brand kit snapshot", () => {
  it("shows the DNESKAi and devShark kits verified, in registry order", async () => {
    const { readBrandKitSnapshot } = await repository({ "caught-up": "operating", marketingshark: "operating" });
    const { kits } = await readBrandKitSnapshot();
    expect(kits.map((kit) => [kit.venture, kit.name, kit.status])).toEqual([
      ["caught-up", "DNESKAi", "ready"],
      ["marketingshark", "devShark", "ready"]
    ]);
    const dneskai = kits[0]!;
    expect(dneskai.drawnByStudio).toBe(true);
    expect(dneskai.source?.summary).toContain("lukaskourilcz/aifirst @ 978cf71");
    expect(dneskai.logotype).toMatchObject({ aspectRatio: 5.96, clearSpacePercent: 27, minimumHeightPx: 16 });
    expect(dneskai.carouselPalette.map((entry) => entry.value)).toContain("#2f5ae6");
    expect(dneskai.assets.find((asset) => asset.role === "logo-on-dark")).toMatchObject({
      previewGround: "#14161a",
      downloadHref: "/admin/api/brand-kits/caught-up/DNESKAi-logo-dark.svg?download=1"
    });
    const devshark = kits[1]!;
    expect(devshark.drawnByStudio).toBe(false);
    expect(devshark.source?.pinned).toBe(false);
    expect(devshark.socialRules).toContain("The full logo appears only on the last slide.");
  });

  it("lists only operating ventures", async () => {
    const { readBrandKitSnapshot } = await repository({ "caught-up": "operating", marketingshark: "paused" });
    expect((await readBrandKitSnapshot()).kits.map((kit) => kit.venture)).toEqual(["caught-up"]);
  });

  it("shows a directory without a manifest as pending and a damaged kit as unavailable", async () => {
    const { root, readBrandKitSnapshot, readBrandKitAsset } = await repository({ "caught-up": "operating", marketingshark: "operating" });
    const kits = path.join(root, "studio", "brand-kits");
    await rm(path.join(kits, "marketingshark", "manifest.json"));
    const logo = path.join(kits, "caught-up", "DNESKAi-logo.svg");
    await writeFile(logo, (await readFile(logo, "utf8")).replace("#2F5AE6", "#FF00FF"));
    const snapshot = await readBrandKitSnapshot();
    expect(snapshot.kits.map((kit) => [kit.venture, kit.status])).toEqual([["caught-up", "unavailable"], ["marketingshark", "pending"]]);
    expect(snapshot.kits[0]!.problems).toEqual(["DNESKAi-logo.svg does not match its recorded sha256"]);
    expect(snapshot.kits[0]!.assets).toEqual([]);
    expect(snapshot.kits[1]!.name).toBe("devShark");
    // A damaged kit serves nothing, not even its intact files.
    expect(await readBrandKitAsset("caught-up", "DNESKAi-square.svg")).toBeNull();

    const html = renderToStaticMarkup(createElement(DesignLabBrandPanel, { snapshot }));
    expect(html).toContain("Brand kit unavailable");
    expect(html).toContain("Brand kit pending");
    expect(html).not.toContain("<img");
  });

  it("serves only files the manifest lists", async () => {
    const { readBrandKitAsset } = await repository({ "caught-up": "operating" });
    expect(await readBrandKitAsset("caught-up", "manifest.json")).toBeNull();
    expect(await readBrandKitAsset("caught-up", "../caught-up/DNESKAi-logo.svg")).toBeNull();
    expect(await readBrandKitAsset("../studio", "DNESKAi-logo.svg")).toBeNull();
    expect(await readBrandKitAsset("marketingshark", "devshark-fin-clean-green.svg")).toBeNull();
    const asset = await readBrandKitAsset("caught-up", "DNESKAi-logo.svg");
    expect(asset?.mediaType).toBe("image/svg+xml");
    expect(asset?.bytes.length).toBe(9934);
  });

  it("renders every logo on its named ground with a download link", async () => {
    const { readBrandKitSnapshot } = await repository({ "caught-up": "operating", marketingshark: "operating" });
    const html = renderToStaticMarkup(createElement(DesignLabBrandPanel, { snapshot: await readBrandKitSnapshot() }));
    expect(html).toContain('data-brand-kit="caught-up"');
    expect(html).toContain("background-color:#14161a");
    expect(html).toContain('src="/admin/api/brand-kits/caught-up/DNESKAi-logo.svg"');
    expect(html).toContain('href="/admin/api/brand-kits/marketingshark/devshark-logo-horizontal-green.svg?download=1"');
    expect(html).toContain("Carousels draw this logo");
    expect(html).toContain("Reference only in carousels");
    expect(html).toContain("Do not recolour the logotype.");
  });
});
