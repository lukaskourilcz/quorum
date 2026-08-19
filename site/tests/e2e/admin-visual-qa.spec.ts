import { expect, test } from "@playwright/test";

test("Admin QA uses a protected, noindex production boundary without mutations", async ({
  browser,
  page
}, testInfo) => {
  const mutationAttempts: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    mutationAttempts.push(`${request.method()} ${request.url()}`);
    await route.abort("blockedbyclient");
  });

  const response = await page.goto("/admin", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  expect(response?.headers()["content-security-policy"]).not.toContain(
    "'unsafe-eval'"
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/u
  );
  expect(mutationAttempts).toEqual([]);

  const baseURL = String(testInfo.project.use.baseURL);
  const guest = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] }
  });
  const guestPage = await guest.newPage();
  const guestResponse = await guestPage.goto("/admin", {
    waitUntil: "domcontentloaded"
  });
  await expect(guestPage).toHaveURL(/\/admin\/login\?error=expired/u);
  expect(guestResponse?.headers()["x-robots-tag"]).toBe(
    "noindex, nofollow, noarchive"
  );
  await guest.close();
});
