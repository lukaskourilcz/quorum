import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveRecipe } from "@boardlessai/carousel-studio";
import { applyQueueAction } from "./actions";
import { queueFixtureRoot, readQueueFixture, writeJson } from "./fixture-root";
import { parseQueueItemV2 } from "./item";
import { packageHash } from "@/lib/devshark-package";

vi.mock("@/lib/design-lab", () => ({ readDesignLab: vi.fn() }));
vi.mock("@/lib/admin-deck-hero", () => ({ readArticleHeroPng: vi.fn(async () => null) }));
import { readDesignLab } from "@/lib/design-lab";
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("DNESKAi saved designs return to owner review", () => {
  it("writes hashed JPEG/PNG frames and supersedes the original with an unapproved draft", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", ""); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", "");
    const root = await queueFixtureRoot({ draft: false }); roots.push(root);
    const item = parseQueueItemV2(await readQueueFixture("caught-up-queue-threads.valid.json"))!;
    await writeJson(root, "state/social/queue/article.json", item);
    const recipe = deriveRecipe({ venture: "caught-up", slug: "measured-model-price-cut", date: "2026-08-04", hasHero: false });
    vi.mocked(readDesignLab).mockResolvedValue([{ date: "2026-08-04", slug: recipe.slug, recipe, renderable: true, hasHero: false, heroCredit: null,
      slides: ["Nové ceny API", "Nižší náklady", "Ověřené zdroje", "Co se změnilo", "Celý článek na DNESKAi"].map((text, index) => ({ index, text, words: text.split(" ").length, edited: true }))
    } as Awaited<ReturnType<typeof readDesignLab>>[number]]);
    const result = await applyQueueAction({ action: "rerender", itemId: item.id, expectedContentHash: item.content.contentHash }, { root, now: new Date("2026-08-04T06:00:00Z") });
    expect(result.dispatch).toBeNull();
    const replacement = parseQueueItemV2(JSON.parse(await readFile(path.join(root, `state/social/queue/${result.supersedingItemId}.json`), "utf8")))!;
    expect(replacement.status).toBe("draft");
    expect(replacement.approvalProvenance.approvalRef).toBe("awaiting-owner-approval");
    expect(Object.values(replacement.checks).every(check => check === "pending")).toBe(true);
    const revision = JSON.parse(await readFile(path.join(root, replacement.sourcePackage!.artifactRef), "utf8"));
    expect(packageHash(revision)).toBe(replacement.sourcePackage!.packageHash);
    for (const frame of revision.render.frames) for (const format of ["png", "jpeg"]) {
      const bytes = await readFile(path.join(root, "site/public", frame[format].path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(frame[format].sha256);
    }
    expect(JSON.parse(await readFile(path.join(root, "state/social/queue/article.json"), "utf8")).status).toBe("cancelled");
  });
});
