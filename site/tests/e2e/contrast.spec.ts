import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/standups",
  "/standups/2026-07-23",
  "/standups/2026-07-23/room",
  "/boardroom",
  "/agents",
  "/agents/vize",
  "/agents/audit",
  "/agents/ledger",
  "/ventures",
  "/ventures/small-team-incident-brief",
  "/metrics",
  "/governance",
  "/log",
  "/company",
  "/about",
  "/disclosure",
  "/privacy"
];

for (const route of routes) {
  test(`color contrast — ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aa", "wcag21aa"])
      .options({ runOnly: ["color-contrast"] })
      .analyze();

    if (results.violations.length > 0) {
      const details = results.violations.flatMap((v) =>
        v.nodes.map(
          (n) =>
            `  - ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").join(" ")}\n    html: ${n.html.slice(0, 220)}`
        )
      );
      throw new Error(
        `Color-contrast violations on ${route}:\n${details.join("\n\n")}`
      );
    }
    expect(results.violations).toEqual([]);
  });
}
