import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { readAdminBooksofhistory } from "@/lib/admin-booksofhistory";
import { BooksofhistoryFeaturesPanel } from "./booksofhistory-features-panel";

const roots: string[] = [];
const fixtures = path.resolve(process.cwd(), "../contracts/fixtures");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtures, name), "utf8");
}

async function put(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

describe("BOOKSOFHISTORY feature panel", () => {
  it("renders both fixture packages, story evidence, claims, gates and guarded decisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-features-panel-"));
    roots.push(root);
    await Promise.all([
      put(root, "state/ventures/booksofhistory/dossiers/war-with-the-newts/dossier.json", await fixture("bh-dossier.valid.json")),
      put(root, "state/ventures/booksofhistory/recommendations/feature.json", await fixture("venture-recommendation.valid.json"))
    ]);

    const html = renderToStaticMarkup(<BooksofhistoryFeaturesPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("Czech package");
    expect(html).toContain("English package");
    expect(html).toContain("Příběh jedné cesty k vydání");
    expect(html).toContain("A story about the route to publication");
    expect(html).toContain("How serial publication became the book readers recognize.");
    expect(html).toContain("The documented publication path moved from serial release");
    expect(html).toContain("CS passed");
    expect(html).toContain("EN passed");
    expect(html).toContain("Approve both languages");
    expect(html).toContain("Edit both packages");
    expect(html).toContain("Reject with reason");
    expect(html).toContain("They never post, open an account, or touch a social channel.");
    expect(html).toContain("Your rating");
    expect(html).not.toContain("state/ventures");
    expect(html).not.toContain("dossier.json");
    expect(html).not.toContain("coverRef");
    expect(html).not.toContain("<img");
  });

  it("labels an empty queue without inventing a feature", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-features-panel-empty-"));
    roots.push(root);
    const html = renderToStaticMarkup(<BooksofhistoryFeaturesPanel snapshot={await readAdminBooksofhistory(root)} />);
    expect(html).toContain("No feature recommendations are waiting or recorded yet.");
  });

  it("surfaces attached owner-entered lane results beside the feature intent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-features-panel-results-"));
    roots.push(root);
    const recommendation = JSON.parse(await fixture("venture-recommendation.valid.json"));
    recommendation.status = "approved";
    recommendation.designLab = { status: "ready", summaryRefs: { cs: "summary-cs", en: "summary-en" } };
    recommendation.owner.postedUrls.cs = "https://social.example/booksofhistory-cs";
    recommendation.owner.resultRefs.cs = ["ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json"];
    await Promise.all([
      put(root, "state/ventures/booksofhistory/recommendations/feature.json", `${JSON.stringify(recommendation)}\n`),
      put(root, "state/ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json", await fixture("owner-result-entry.valid.json"))
    ]);

    const html = renderToStaticMarkup(<BooksofhistoryFeaturesPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("Manual entry only");
    expect(html).toContain("Record owner-entered result");
    expect(html).toContain("instagram");
    expect(html).toContain("Views");
    expect(html).toContain("1200");
    expect(html).toContain("First owner-entered Czech lane result.");
    expect(html).not.toContain("owner-result-entry/1");
    expect(html).not.toContain("ventures/booksofhistory/results");
  });
});
