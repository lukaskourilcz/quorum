import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeFinancePage } from "../src/finance/finance-page-cli.js";
import {
  GENERATED_BEGIN,
  GENERATED_END,
  renderFinanceBlock,
  replaceGeneratedBlock,
  summariseBudgetLedger
} from "../src/finance/finance-page.js";

function block(over: Partial<Parameters<typeof renderFinanceBlock>[0]> = {}): string {
  return renderFinanceBlock({
    asOf: "2026-08-29 12:00 UTC",
    budget: [],
    finance: [],
    revenueSourceConnected: false,
    ...over
  });
}

describe("finance page", () => {
  it("sums the budget ledger by venture, largest first", () => {
    const summary = summariseBudgetLedger([
      { usd: 1.5, ventureId: "caught-up" },
      { usd: 2, ventureId: "mma-files" },
      { usd: 0.5, ventureId: "caught-up" },
      // `global` and `company` are the same thing to a reader and add together.
      { usd: 0.25, ventureId: "global" },
      { usd: 0.25, ventureId: "company" }
    ]);
    expect(summary.totalUsd).toBe(4.5);
    expect(summary.byVenture).toEqual([
      { name: "DNESKAi (`caught-up`)", usd: 2 },
      { name: "MMA Files", usd: 2 },
      { name: "Company-wide", usd: 0.5 }
    ]);
  });

  it("keeps a venture the name map has never heard of rather than dropping its spend", () => {
    const summary = summariseBudgetLedger([{ usd: 3, ventureId: "brand-new-venture" }]);
    expect(summary.byVenture).toEqual([{ name: "brand-new-venture", usd: 3 }]);
  });

  it("skips a row whose amount is not a number instead of summing NaN", () => {
    const summary = summariseBudgetLedger([
      { usd: 1, ventureId: "caught-up" },
      { usd: Number.NaN, ventureId: "caught-up" },
      { usd: "0.5" as unknown as number, ventureId: "caught-up" }
    ]);
    expect(summary.totalUsd).toBe(1);
  });

  it("reports revenue, refunds, fees and gross profit as unavailable until a payment source exists", () => {
    // A confident $0.00 revenue beside an unavailable fee is a number nobody can act on, and the
    // page carried exactly that pairing for three weeks.
    const rendered = block({ budget: [{ usd: 13.5474, ventureId: "caught-up" }] });
    expect(rendered).toContain("| Recognized revenue | unavailable |");
    expect(rendered).toContain("| Gross profit | unavailable |");
    expect(rendered).toContain("| Text and image API spend | $13.55 |");
    expect(rendered).toContain("| Total verified operating cost | $13.55 |");
  });

  it("distinguishes a venture that spent a fraction of a cent from one that spent nothing", () => {
    const rendered = block({ budget: [{ usd: 0.004, ventureId: "door-money" }] });
    expect(rendered).toContain("| Door Money | <$0.01 |");
    expect(rendered).not.toContain("| Door Money | $0.00 |");
  });

  it("says so plainly when no call has been recorded", () => {
    expect(block()).toContain("No model call has been recorded yet.");
  });

  it("adds verified treasury and other costs to the total without double-counting API spend", () => {
    const rendered = block({
      budget: [{ usd: 10, ventureId: "caught-up" }],
      finance: [
        {
          id: "a", ts: "2026-08-20T00:00:00.000Z", type: "treasury_cost", amountUsd: 5,
          verified: true, sourceRef: "receipt", reconciliationKey: "k1"
        },
        // An unverified row is not a fact and must not reach the table.
        {
          id: "b", ts: "2026-08-21T00:00:00.000Z", type: "other_cost", amountUsd: 99,
          verified: false, sourceRef: "receipt", reconciliationKey: "k2"
        },
        // The finance ledger's own api_cost rows would double-count the budget ledger.
        {
          id: "c", ts: "2026-08-22T00:00:00.000Z", type: "api_cost", amountUsd: 100,
          verified: true, sourceRef: "receipt", reconciliationKey: "k3"
        }
      ]
    });
    expect(rendered).toContain("| Treasury spend | $5.00 |");
    expect(rendered).toContain("| Other verified operating cost | $0.00 |");
    expect(rendered).toContain("| Total verified operating cost | $15.00 |");
  });

  it("replaces only the generated block and leaves the countersigned prose alone", () => {
    const page = `# Finance\n\nCap: $50.00 under \`budget-2026-08f\`\n\n${GENERATED_BEGIN}\nold\n${GENERATED_END}\n\nOnly the owner executes payments.\n`;
    const next = replaceGeneratedBlock(page, `${GENERATED_BEGIN}\nnew\n${GENERATED_END}`);
    expect(next).toContain("Cap: $50.00 under `budget-2026-08f`");
    expect(next).toContain("Only the owner executes payments.");
    expect(next).toContain("new");
    expect(next).not.toContain("old");
  });

  it("refuses to guess where the table goes when a marker is gone", () => {
    expect(() => replaceGeneratedBlock("# Finance\n\nno markers here\n", "block"))
      .toThrow(/missing its generated block markers/u);
  });

  it("rewrites the page in place from the two ledgers on disk", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "finance-page-"));
    await mkdir(path.join(root, "state", "budget"), { recursive: true });
    await mkdir(path.join(root, "state", "finance"), { recursive: true });
    await writeFile(path.join(root, "state", "FINANCE.md"),
      `# Finance\n\nkeep me\n\n${GENERATED_BEGIN}\nstale\n${GENERATED_END}\n`);
    await writeFile(path.join(root, "state", "budget", "ledger.json"),
      JSON.stringify({ schemaVersion: 1, entries: [{ usd: 2.5, ventureId: "kvorum", kind: "text" }] }));
    await writeFile(path.join(root, "state", "finance", "ledger.json"),
      JSON.stringify({ schemaVersion: 1, currency: "USD", entries: [] }));

    await writeFinancePage(root, new Date("2026-08-29T12:00:00.000Z"));

    const page = await readFile(path.join(root, "state", "FINANCE.md"), "utf8");
    expect(page).toContain("keep me");
    expect(page).toContain("As of 2026-08-29 12:00 UTC.");
    expect(page).toContain("| Kvórum | $2.50 |");
    expect(page).not.toContain("stale");
  });

  it("fails rather than writing a page it cannot source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "finance-page-"));
    await mkdir(path.join(root, "state", "budget"), { recursive: true });
    await mkdir(path.join(root, "state", "finance"), { recursive: true });
    await writeFile(path.join(root, "state", "FINANCE.md"), `${GENERATED_BEGIN}\n${GENERATED_END}\n`);
    await writeFile(path.join(root, "state", "budget", "ledger.json"), JSON.stringify({ schemaVersion: 1 }));
    await writeFile(path.join(root, "state", "finance", "ledger.json"),
      JSON.stringify({ schemaVersion: 1, currency: "USD", entries: [] }));

    await expect(writeFinancePage(root)).rejects.toThrow(/no entries array/u);
  });
});
