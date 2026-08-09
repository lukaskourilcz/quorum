import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/standups",
  "/standups/2026-07-23-founding",
  "/standups/2026-07-23-founding/room",
  "/boardroom",
  "/agents",
  "/agents/vize",
  "/agents/audit",
  "/agents/ledger",
  "/ventures",
  "/ventures/small-team-incident-brief",
  "/ventures/caught-up",
  "/ventures/titty-tuesdays",
  "/ventures/fightaiq",
  "/ventures/carousel-studio",
  "/admin?venture=global",
  "/admin?venture=titty-tuesdays&tab=plans",
  "/admin/ventures/titty-tuesdays/binder",
  "/admin?venture=fightaiq&tab=fighters",
  "/admin?venture=fightaiq&tab=events",
  "/admin?venture=fightaiq&tab=sources",
  "/admin?venture=mma-files&tab=articles",
  "/admin?venture=mma-files&tab=calendar",
  "/admin?venture=mma-files&tab=social-lab",
  "/admin?venture=carousel-studio&tab=templates",
  "/admin?venture=carousel-studio&tab=inspiration",
  "/meetings/2026-08-01-tt-marketing",
  "/meetings/2026-07-30-cu-edition",
  "/meetings/2026-07-30-cu-product",
  // The incubator is closed, but its records are retained on purpose (they are the only
  // evidence the rooms ever sat) and they still have to render. This is what proves it.
  "/meetings/2026-08-01-incubator-scan",
  "/meetings/2026-08-01-incubator-synthesis",
  "/meetings/2026-08-01-mma-intake",
  "/meetings/2026-08-01-mma-analysis",
  "/meetings/2026-08-01-mag-editorial",
  "/meetings/2026-08-01-mag-desk",
  "/meetings/2026-08-01-studio",
  "/ideas",
  "/metrics",
  "/money",
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
