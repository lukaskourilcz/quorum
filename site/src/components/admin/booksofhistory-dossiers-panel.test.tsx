import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminBooksofhistory } from "@/lib/admin-booksofhistory";
import { BooksofhistoryDossiersPanel } from "./booksofhistory-dossiers-panel";

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

describe("BOOKSOFHISTORY dossier panel", () => {
  it("renders fixture claims, sources, stories, quotes and ledger evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-dossiers-panel-"));
    roots.push(root);
    const ledger = JSON.stringify(JSON.parse(await fixture("bh-research-ledger.valid.json")));
    await Promise.all([
      put(root, "state/ventures/booksofhistory/dossiers/war-with-the-newts/dossier.json", await fixture("bh-dossier.valid.json")),
      put(root, "state/ventures/booksofhistory/research-ledger.jsonl", `${ledger}\n`)
    ]);

    const html = renderToStaticMarkup(<BooksofhistoryDossiersPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("Válka s mloky");
    expect(html).toContain("verified");
    expect(html).toContain("91% confidence");
    expect(html).toContain("Archive catalogue");
    expect(html).toContain("How serial publication became the book readers recognize.");
    expect(html).toContain("unused");
    expect(html).toContain("A short attributed line from the archival record.");
    expect(html).toContain("anthropic-web-search");
    expect(html).toContain("missing-dossier");
    expect(html).toContain("2026-08-12-bh-desk");
    expect(html).toContain("$0.04");
    expect(html).toContain("0%");
    expect(html).not.toContain("state/ventures");
    expect(html).not.toContain("dossier.json");
    expect(html).not.toContain("coverRef");
    expect(html).not.toContain("<img");
  });

  it("does not turn a missing denominator into zero efficiency", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-dossiers-panel-empty-"));
    roots.push(root);

    const html = renderToStaticMarkup(<BooksofhistoryDossiersPanel snapshot={await readAdminBooksofhistory(root)} />);

    expect(html).toContain("efficiency is not measurable");
    expect(html).toContain("No valid dossiers are stored yet.");
    expect(html).toContain("No research spend is recorded.");
    expect(html).not.toContain(">0%<");
  });
});
