import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { readAdminTehdejsiSvet } from "@/lib/admin-tehdejsi-svet";
import { AdminWriteProvider } from "./admin-write-mode";
import { TehdejsiSvetFeaturesPanel } from "./tehdejsi-svet-features-panel";

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

async function fixtureSnapshot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-feature-panel-"));
  roots.push(root);
  const rating = {
    schemaVersion: "rating/1", id: "r-2026-08-14-abcd", ventureId: "tehdejsi-svet", objectKind: "recommendation",
    objectRef: { id: "ts-2026-08-14-vecernicek", contentHash: "sha256:aaaaaaaaaaaa" },
    rating: "good", ratedAt: "2026-08-14T19:00:00.000Z"
  };
  await Promise.all([
    put(root, "state/ventures/tehdejsi-svet/shortlists/2026-08-12.json", await fixture("tehdejsi-shortlist.valid.json")),
    put(root, "state/ventures/tehdejsi-svet/drafts/feature.json", await fixture("venture-recommendation-tehdejsi.valid.json")),
    put(root, "state/ratings/tehdejsi-svet/ledger.jsonl", `${JSON.stringify(rating)}\n`)
  ]);
  return readAdminTehdejsiSvet(root);
}

describe("Tehdejsi svet feature panel", () => {
  it("renders fixture ranking factors, both package lanes, recorded gates, owner records and rating", async () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <TehdejsiSvetFeaturesPanel snapshot={await fixtureSnapshot()} />
      </AdminWriteProvider>
    );

    expect(html).toContain("Rank 1 · cs-1970s-vecernicek");
    expect(html).toContain("Askability");
    expect(html).toContain("Country balance");
    expect(html).toContain("Czech package");
    expect(html).toContain("Ukrainian package");
    expect(html).toContain("Pár minut před spaním");
    expect(html).toContain("Кілька хвилин перед сном");
    expect(html).toContain("Production gates passed");
    expect(html).toContain("Record CS posted URL");
    expect(html).toContain("Record UA posted URL");
    expect(html).toContain("PNG and ZIP export");
    expect(html).toContain("Your rating");
    expect(html).toContain("Good");
    expect(html).not.toContain("state/ventures");
    expect(html).not.toContain("shortlistRef");
    expect(html).not.toContain("summaryPath");
    expect(html).not.toContain("/results");
  });

  it("separates a tier-2 package into the owner queue and keeps read-only decisions disabled", async () => {
    const snapshot = await fixtureSnapshot();
    const base = snapshot.features[0]!;
    const tierTwo = {
      ...base,
      id: "ts-fixture-sensitive-memory",
      status: "draft" as const,
      sensitivityTier: 2 as const,
      humanReviewRequired: true,
      humanReviewedAt: null,
      designLab: { ready: false, readyAt: null },
      owner: { postedUrls: { cs: null, ua: null }, rejectionReason: null },
      payload: { ...base.payload, ctaKind: "none" as const }
    };
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <TehdejsiSvetFeaturesPanel snapshot={{ ...snapshot, features: [tierTwo] }} />
      </AdminWriteProvider>
    );

    expect(html).toContain("What’s waiting on you");
    expect(html).toContain("Tier-2 review");
    expect(html).toContain("Review package");
    expect(html).toContain("Confirm tier-2 review");
    expect(html).toContain("Approve for manual posting");
    expect(html).toContain("Edit and approve");
    expect(html).toContain("Reject");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("names an empty feature store without inventing a package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-feature-empty-"));
    roots.push(root);
    const snapshot = await readAdminTehdejsiSvet(root);
    const html = renderToStaticMarkup(<TehdejsiSvetFeaturesPanel snapshot={snapshot} />);
    expect(html).toContain("No shortlist has been recorded yet.");
    expect(html).toContain("No feature package is waiting or recorded yet.");
  });
});
