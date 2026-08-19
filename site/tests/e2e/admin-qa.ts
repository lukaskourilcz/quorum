import { expect, type Page } from "@playwright/test";
import {
  ADMIN_RAIL_COOKIE,
  ADMIN_THEME_COOKIE,
  type AdminTheme
} from "../../src/lib/admin-shell-preferences";

export interface AdminViewport {
  height: number;
  width: 360 | 430 | 768 | 1024 | 1440 | 1728;
}

export const ADMIN_VIEWPORTS: readonly AdminViewport[] = [
  { height: 800, width: 360 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 768, width: 1024 },
  { height: 900, width: 1440 },
  { height: 1117, width: 1728 }
];

export const ADMIN_THEMES = ["light", "dark"] as const;

export async function setAdminPreferences(
  page: Page,
  { collapsed = false, theme }: { collapsed?: boolean; theme: AdminTheme }
) {
  await page.context().addCookies([
    {
      domain: "localhost",
      name: ADMIN_THEME_COOKIE,
      path: "/admin",
      sameSite: "Strict",
      secure: false,
      value: theme
    },
    {
      domain: "localhost",
      name: ADMIN_RAIL_COOKIE,
      path: "/admin",
      sameSite: "Strict",
      secure: false,
      value: collapsed ? "collapsed" : "expanded"
    }
  ]);
}

export function captureAdminRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.location().url;
      failures.push(`console: ${message.text()}${source ? ` @ ${source}` : ""}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  return failures;
}

export async function guardAdminWrites(page: Page): Promise<string[]> {
  const attempts: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    attempts.push(`${request.method()} ${request.url()}`);
    await route.abort("blockedbyclient");
  });
  return attempts;
}

export async function expectNoDocumentOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        if (
          element.closest(
            "[data-horizontal-scroll], [data-viewport-decoration]"
          )
        ) {
          return false;
        }
        const bounds = element.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          (bounds.left < -1 ||
            bounds.right > document.documentElement.clientWidth + 1)
        );
      })
      .slice(0, 8)
      .map((element) => ({
        className: element.getAttribute("class"),
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().slice(0, 80)
      })),
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(
    result.scrollWidth - result.clientWidth,
    `${label} widens the document`
  ).toBeLessThanOrEqual(1);
  expect(result.offenders, `${label} has uncontained content`).toEqual([]);
}
