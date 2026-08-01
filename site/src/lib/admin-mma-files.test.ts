import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminMmaFiles } from "./admin-mma-files";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

function article() {
  const content = {
    schemaVersion: "article/1",
    slug: "fixture-preview",
    localizations: {
      en: { title: "Fixture preview", dek: "A sourced dry article.", bodyMDX: "[Alex Example](/fighters/ufc/alex-example) has a source." },
      cs: { title: "Zkušební pozvánka", dek: "Ozdrojovaný suchý článek.", bodyMDX: "[Alex Example](/fighters/ufc/alex-example) má zdroj." }
    },
    format: "fight-week-preview",
    sources: [{ kind: "internal", ref: "FIXTURE:ARTICLE" }],
    image: {
      hero_path: "public/images/articles/fixture-preview/hero.svg",
      thumb_path: "public/images/articles/fixture-preview/thumb.svg",
      width: 1600,
      height: 900,
      alt_en: "Fixture cover",
      alt_cs: "Zkušební obálka",
      license: {
        name: "BoardlessAI deterministic",
        author: "BoardlessAI FRAME",
        source_url: "https://boardless-ai.vercel.app/",
        attribution_html: "Artwork by BoardlessAI FRAME"
      },
      origin: "svg",
      hero_bytes_base64: "PHN2Zy8+",
      thumb_bytes_base64: "PHN2Zy8+"
    },
    heroSpec: { template: "type-led", bindings: { headline: "Fixture" } },
    fighterRefs: ["ufc:alex-example"],
    eventRef: "ufc:event:fixture",
    publishAt: "2026-08-01T08:00:00.000Z",
    slot: "am",
    status: "published"
  };
  return { ...content, packageHash: createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex") };
}

describe("MMA Files admin projection", () => {
  it("renders hash-checked bilingual articles, platform captions and calendar state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-files-admin-"));
    roots.push(root);
    const directories = [
      "state/ventures/mma-files/articles", "state/ventures/mma-files/social/packs",
      "state/ventures/mma-files/slates", "state/ratings/mma-files"
    ];
    await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    const packageValue = article();
    await writeFile(path.join(root, "state/ventures/mma-files/articles/2026-08-01-am-fixture-preview.json"), JSON.stringify(packageValue));
    await writeFile(path.join(root, "state/ventures/mma-files/social/packs/article-2026-08-01-am-fixture-preview.json"), JSON.stringify({
      schemaVersion: "social-variant/1",
      articleRef: "article:2026-08-01:am:fixture-preview",
      variants: [
        { id: "A", captions: { en: { instagram: "English A", threads: "English A short" }, cs: { instagram: "Česky A", threads: "Česky A krátce" } }, designAxes: { templateFamily: "stat-led", colorScheme: "orange-dark", headlineFraming: "fact-first", captionTone: "plain" } },
        { id: "B", captions: { en: { instagram: "English B", threads: "English B short" }, cs: { instagram: "Česky B", threads: "Česky B krátce" } }, designAxes: { templateFamily: "question-led", colorScheme: "paper-dark", headlineFraming: "question", captionTone: "curious" } }
      ],
      assignmentProtocolRef: "state/ventures/mma-files/social/ASSIGNMENT.md",
      status: "draft"
    }));
    await writeFile(path.join(root, "state/ventures/mma-files/slates/2026-08-01.json"), JSON.stringify({
      schemaVersion: "editorial-slate/1", date: "2026-08-01",
      slots: [
        { slot: "am", format: "fight-week-preview", rationale: "The event is close.", status: "assigned" },
        { slot: "pm", format: "fighter-profile", rationale: "No sourced profile cleared the bar.", status: "killed", killedReason: "No complete file." }
      ]
    }));
    const rating = { schemaVersion: "rating/1", id: "r-2026-08-01-abcd", ventureId: "mma-files", objectKind: "article", objectRef: { id: "article:2026-08-01:am:fixture-preview", contentHash: `sha256:${packageValue.packageHash.slice(0, 12)}` }, rating: "good", ratedAt: "2026-08-01T12:00:00.000Z" };
    await writeFile(path.join(root, "state/ratings/mma-files/ledger.jsonl"), `${JSON.stringify(rating)}\n`);
    const snapshot = await readAdminMmaFiles(root);
    expect(snapshot.unreadable).toEqual([]);
    expect(snapshot.articles[0]).toMatchObject({ id: "article:2026-08-01:am:fixture-preview", localizations: { en: { title: "Fixture preview" }, cs: { title: "Zkušební pozvánka" } }, ratings: [{ rating: "good" }] });
    expect(snapshot.socialPacks[0]?.variants.map((variant) => variant.id)).toEqual(["A", "B"]);
    expect(snapshot.calendar[0]?.slots.map((slot) => slot.articleStatus)).toEqual(["published", null]);
    expect(snapshot.socialPacks[0]?.variants[0].captions.en).toEqual({ instagram: "English A", threads: "English A short" });
  });
});
