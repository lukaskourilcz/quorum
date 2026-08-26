import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  captureAdminRuntimeFailures,
  expectNoDocumentOverflow,
  guardAdminWrites,
  setAdminPreferences
} from "./admin-qa";

interface VentureRegistry {
  ventures: Array<{ adminTabs: string[]; id: string }>;
}

const registry = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../config/ventures.json"), "utf8")
) as VentureRegistry;
const registeredTabs = registry.ventures.flatMap((venture) =>
  venture.adminTabs.map((tab) => ({
    route: `/admin?venture=${venture.id}&tab=${tab}`,
    tab,
    venture: venture.id
  }))
);

async function expectNoHighImpactAxeViolations(
  page: Page,
  label: string,
  includes: string[] = []
) {
  let scan = new AxeBuilder({ page });
  for (const selector of includes) scan = scan.include(selector);
  const result = await scan.analyze();
  const violations = result.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious"
  );
  expect(violations, `${label}: ${JSON.stringify(violations, null, 2)}`)
    .toEqual([]);
}

test("every tab in the venture registry loads from the production artifact without runtime failures", async ({
  page
}) => {
  test.setTimeout(600_000);
  await setAdminPreferences(page, { theme: "light" });
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);

  for (const destination of registeredTabs) {
    const response = await page.goto(destination.route, {
      waitUntil: "domcontentloaded"
    });
    expect(response?.status(), destination.route).toBeLessThan(400);
    await expect(page.locator("[data-admin-content]")).toBeVisible();
    await expect(
      page.locator(`a[href="${destination.route}"][aria-current="page"]`)
    ).toBeVisible();
    await expect(
      page.getByText("The project desk could not load.", { exact: true })
    ).toHaveCount(0);
  }

  expect(failures).toEqual([]);
  expect(mutationAttempts).toEqual([]);
});

test("owner decisions, results and ratings stay reviewable while writes stay held", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "dark" });
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);

  await page.goto("/admin?view=approvals", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Approvals." }))
    .toBeVisible();
  await expect(page.getByText("Everything waiting for your yes.", {
    exact: false
  })).toBeVisible();
  await expect(page.locator('[data-admin-state="write-disabled"]'))
    .toContainText("This deployment cannot save changes");

  await page.goto("/admin?venture=door-money&tab=recommendations", {
    waitUntil: "domcontentloaded"
  });
  await expect(
    page.locator(
      'a[href="/admin?venture=door-money&tab=recommendations"]'
    )
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Owner decision" }).first())
    .toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve for manual posting" }).first()
  ).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Owner results" }).first())
    .toBeVisible();
  await expect(
    page.getByText("Record the manual post URL before adding its result.").first()
  ).toBeVisible();
  await expect(page.locator('[data-admin-state="held"]').first()).toBeVisible();
  await expect(page.getByText("Your rating", { exact: true }).first())
    .toBeVisible();
  for (const label of ["Perfect", "Good", "Bad"]) {
    await expect(page.getByRole("button", { name: label }).first())
      .toBeDisabled();
  }

  expect(failures).toEqual([]);
  expect(mutationAttempts).toEqual([]);
});

test("Design Lab renders a manual export workspace and keeps social publishing closed", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "light" });
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);

  const response = await page.goto(
    "/admin?venture=carousel-studio&tab=studio",
    { waitUntil: "domcontentloaded" }
  );
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Design Lab." }))
    .toBeVisible();
  await expect(page.getByText("Publikování je zavřené", { exact: false }))
    .toBeVisible();
  await expect(page.locator("[data-article-rail]")).toBeVisible();
  const canvas = page.locator("[data-slide-canvas]");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0
  )).toBe(true);
  await expect(page.getByRole("link", { name: "Stáhnout slide" }))
    .toHaveAttribute("download", "");
  await expect(page.getByRole("link", { name: "Stáhnout celý deck" }))
    .toHaveAttribute("download", "");
  await expect(page.locator("[data-save-slide]")).toBeDisabled();
  await expect(page.locator("[data-save-preset]")).toBeDisabled();
  await expect(page.getByRole("button", { name: /publish|post|send/iu }))
    .toHaveCount(0);

  expect(failures).toEqual([]);
  expect(mutationAttempts).toEqual([]);
});

test("money, fixed costs, file details and launch binder remain truthful and contained", async ({
  page
}) => {
  await page.setViewportSize({ height: 932, width: 430 });
  await setAdminPreferences(page, { theme: "dark" });
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);

  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Fixed costs" }))
    .toBeVisible();
  await expect(page.getByText("$50.00", { exact: false }).first())
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Add cost" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save fixed costs" }))
    .toBeDisabled();
  await expect(page.getByRole("link", { name: "Public Money" }))
    .toHaveAttribute("href", "/results#money");
  await expectNoDocumentOverflow(page, "money and fixed costs");

  const fileResponse = await page.goto(
    "/admin/files/ideas/titty-tuesdays/details/idea-2026-08-05-415cf2b0.md",
    { waitUntil: "domcontentloaded" }
  );
  expect(fileResponse?.status()).toBe(200);
  expect(fileResponse?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  await expect(page.getByRole("heading", { level: 1, name: "Detailed notes" }))
    .toBeVisible();
  await expect(page.locator("[data-admin]").first()).toHaveAttribute(
    "data-admin-theme",
    "dark"
  );
  await expectNoDocumentOverflow(page, "protected file details");

  const binderResponse = await page.goto(
    "/admin/ventures/titty-tuesdays/binder",
    { waitUntil: "domcontentloaded" }
  );
  expect(binderResponse?.status()).toBe(200);
  expect(binderResponse?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  await expect(page.getByText("Launch checklist", { exact: true }).first())
    .toBeVisible();
  await expect(page.getByText("2 ready plans", { exact: true }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Back to plans" }))
    .toHaveAttribute("href", "/admin?venture=titty-tuesdays&tab=plans");
  await expectNoDocumentOverflow(page, "protected launch binder");

  expect(failures).toEqual([]);
  expect(mutationAttempts).toEqual([]);
});

test("unavailable and held states remain explicit instead of becoming fake data", async ({
  page
}) => {
  await setAdminPreferences(page, { theme: "light" });
  const failures = captureAdminRuntimeFailures(page);
  const mutationAttempts = await guardAdminWrites(page);

  await page.goto("/admin?venture=booksofhistory&tab=dossiers", {
    waitUntil: "domcontentloaded"
  });
  await expect(page.locator('[data-admin-state="unavailable"]').first())
    .toBeVisible();
  await expect(page.getByText("No paid research is recorded yet", {
    exact: true
  })).toBeVisible();

  await page.goto("/admin?venture=door-money&tab=recommendations", {
    waitUntil: "domcontentloaded"
  });
  await expect(page.locator('[data-admin-state="held"]').first()).toContainText(
    "Record the manual post URL before adding its result."
  );

  expect(failures).toEqual([]);
  expect(mutationAttempts).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} shell, dialogs and complex panels have no serious or critical axe violations`, async ({
    page
  }) => {
    await setAdminPreferences(page, { theme });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expectNoHighImpactAxeViolations(page, `${theme} Admin shell`, [
      "[data-admin-sidebar]",
      "[data-admin-toolbar]"
    ]);

    await page.getByRole("button", { name: "Search Admin" }).click();
    await expectNoHighImpactAxeViolations(page, `${theme} command palette`, [
      "[data-dialog-root]"
    ]);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ height: 932, width: 430 });
    await page.getByRole("navigation", {
      name: "Primary Admin navigation"
    }).getByRole("button", { name: "More" }).click();
    await expectNoHighImpactAxeViolations(page, `${theme} mobile More`, [
      "[data-admin-mobile-nav]",
      "[data-dialog-root]"
    ]);
    await page.keyboard.press("Escape");

    await page.goto("/admin?venture=door-money&tab=recommendations", {
      waitUntil: "domcontentloaded"
    });
    await expectNoHighImpactAxeViolations(
      page,
      `${theme} owner decision, result and rating panels`,
      ["[data-admin-content]"]
    );

    await page.goto("/admin?venture=carousel-studio&tab=hooks", {
      waitUntil: "domcontentloaded"
    });
    await expectNoHighImpactAxeViolations(
      page,
      `${theme} dense Design Lab tables`,
      ["[data-admin-content]"]
    );

    await page.goto("/admin/operations?view=nodes", {
      waitUntil: "domcontentloaded"
    });
    await expectNoHighImpactAxeViolations(
      page,
      `${theme} Operations filters and table`,
      ["[data-admin-content]"]
    );
  });
}
