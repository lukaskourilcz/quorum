import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN_THEMES, ADMIN_VIEWPORTS, captureAdminRuntimeFailures, expectNoDocumentOverflow, setAdminPreferences } from "./admin-qa";

test("explicit Social Profiles fixture matrix stays synthetic, contained and accessible", async ({ page }) => {
  test.setTimeout(360_000);
  const failures = captureAdminRuntimeFailures(page);
  for (const theme of ADMIN_THEMES) {
    for (const viewport of ADMIN_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await setAdminPreferences(page, { collapsed: viewport.width >= 1024 && viewport.width < 1440, theme });
      const response = await page.goto("/admin/social-profiles?section=venture-profiles&fixtures=profile-matrix", { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${theme} at ${viewport.width}px`).toBe(200);
      await expect(page.locator("[data-social-profiles-workspace]")).toBeVisible();
      await expect(page.locator("[data-social-profile-simulations=explicit] [data-tone=information]")).toHaveCount(50);
      await expect(page.getByText("Synthetic visual QA · excluded from totals", { exact: true })).toBeVisible();
      await expect(page.getByText("Venture Profiles · 6", { exact: true })).toBeVisible();
      await expectNoDocumentOverflow(page, `${theme} Social Profiles matrix at ${viewport.width}px`);
    }
  }
  for (const sample of [{ width: 360, height: 800 }, { width: 1440, height: 900 }] as const) {
    await page.setViewportSize(sample);
    const scan = await new AxeBuilder({ page }).include("[data-admin-content]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
  }
  expect(failures).toEqual([]);
});

test("Social Profiles sections and detail keep canonical bookmarks and bounded controls", async ({ page }) => {
  await page.goto("/admin/social-profiles?section=amplification-profiles", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Amplification Profiles", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No Amplification Profiles", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profile-simulations]")).toHaveCount(0);

  await page.goto("/admin/social-profiles?section=campaigns", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Campaigns", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No verified-release campaigns", { exact: true })).toBeVisible();
  await expect(page.getByText(/Contest Radar candidates are not converted/iu)).toBeVisible();

  await page.goto("/admin/social-profiles?section=today", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No daily operation receipts", { exact: true })).toBeVisible();
  await expect(page.getByText("No countersigned routine scopes", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=today]")).toContainText("Do not force filler");
  await expect(page.locator("[data-social-profiles-section=today]")).not.toContainText(/access token|private-secret-value|publish now|force post|automatic failover/iu);

  await page.goto("/admin/social-profiles?section=unknown&profile=social-profile-caught-up", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Venture Profiles", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-social-profile-detail="social-profile-caught-up"]')).toBeVisible();
  await expect(page.locator("[data-social-profile-safe-actions]")).toContainText("cannot create an account");
  await expect(page.getByRole("option", { name: /activate|publish|follow|comment|purchase/iu })).toHaveCount(0);
  await expect(page.locator("[data-social-profile-detail]")).not.toContainText(/private-secret-value|nativeAccountId/iu);

  await page.goto("/admin/social-profiles?section=activity-setup", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Activity & setup", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No lifecycle events", { exact: true })).toBeVisible();
  await expect(page.getByText(/Global kill switch:/u)).toBeVisible();

  await page.goto("/admin/social-profiles?section=providers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Providers", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Provider registry · 6", { exact: true })).toBeVisible();
  await expect(page.getByText("No provider delivery evidence", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=providers]")).not.toContainText(/private-secret-value|automatic failover enabled|purchase authorized/iu);

  await page.goto("/admin/social-profiles?section=content-runway&profile=social-profile-caught-up", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Content runway", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Profile constitutions · 6", { exact: true })).toBeVisible();
  await expect(page.locator('[data-social-runway-detail="social-profile-caught-up"]')).toContainText("Design Lab");
  await expect(page.getByText("No inventory candidates", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=content-runway]")).not.toContainText(/publish now|queue now|force post|account activation/iu);

  await page.goto("/admin/social-profiles?section=results", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Results", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No Venture Profile results", { exact: true })).toBeVisible();
  await expect(page.getByText("No Amplification Profile results", { exact: true })).toBeVisible();
  await expect(page.getByText("No Campaign result sets", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=results]")).not.toContainText(/visitor id|private message body|purchase now|boost now/iu);

  await page.goto("/admin/social-profiles?section=learning", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Learning", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No weekly learning checkpoint", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=learning]")).not.toContainText(/apply now|publish now|retire account/iu);

  await page.goto("/admin/social-profiles?section=automation-health", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Automation health", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Operations Recovery handoff", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=automation-health]")).toContainText("cannot create or delete accounts");

  await page.goto("/admin/social-profiles?section=plan-progress", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Plan & progress", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Implementation progress unavailable", { exact: true })).toBeVisible();
  await expect(page.locator("[data-social-profiles-section=plan-progress]")).toContainText("does not run a second issue reader");
});
