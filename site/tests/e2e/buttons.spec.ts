import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/standups",
  "/standups/2026-07-23-founding",
  "/standups/2026-07-23-founding/room",
  "/boardroom",
  "/agents",
  "/ventures",
  "/ventures/caught-up",
  "/ventures/titty-tuesdays",
  "/ventures/fightaiq",
  "/ventures/carousel-studio",
  "/incubator",
  "/admin?venture=global",
  "/admin?venture=incubator&tab=niche-proposals",
  "/admin/ventures/titty-tuesdays/binder",
  "/admin?venture=fightaiq&tab=fighters",
  "/admin?venture=fightaiq&tab=events",
  "/admin?venture=fightaiq&tab=slates",
  "/admin?venture=fightaiq&tab=sources",
  "/admin?venture=mma-files&tab=articles",
  "/admin?venture=mma-files&tab=calendar",
  "/admin?venture=mma-files&tab=social-lab",
  "/admin?venture=carousel-studio&tab=templates",
  "/admin?venture=carousel-studio&tab=inspiration",
  "/meetings/2026-08-01-tt-marketing",
  "/meetings/2026-08-01-incubator-scan",
  "/meetings/2026-08-01-incubator-synthesis",
  "/meetings/2026-07-30-cu-edition",
  "/meetings/2026-07-30-cu-product",
  "/meetings/2026-08-01-mma-intake",
  "/meetings/2026-08-01-mma-analysis",
  "/meetings/2026-08-01-mag-editorial",
  "/meetings/2026-08-01-mag-desk",
  "/meetings/2026-08-01-studio",
  "/ideas",
  "/metrics",
  "/money",
  "/governance",
  "/log"
];

function parseColor(input: string): [number, number, number, number] | null {
  const m = input.match(/rgba?\(([-\d.\s,%\/]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
  const [r, g, b] = parts;
  const a = parts.length === 4 ? parts[3] : 1;
  return [r, g, b, a];
}

function relativeLuminance([r, g, b]: number[]): number {
  const srgb = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(a: number[], b: number[]) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

for (const route of routes) {
  test(`every visible CTA reads at ≥ 4.5:1 contrast — ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });

    const failures = await page.evaluate(() => {
      const results: Array<{
        text: string;
        bg: string;
        fg: string;
        selector: string;
        outerHtml: string;
      }> = [];

      function resolveBackground(el: Element): string {
        let cur: Element | null = el;
        while (cur && cur !== document.body) {
          const cs = getComputedStyle(cur as HTMLElement);
          const bg = cs.backgroundColor;
          const m = bg.match(/rgba?\(([-\d.\s,%\/]+)\)/);
          if (m) {
            const parts = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
            const alpha = parts.length === 4 ? parts[3] : 1;
            if (alpha > 0.01 && !(parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && alpha === 0)) {
              return bg;
            }
          }
          cur = cur.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      }

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('a[href], button')
      );
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const text = (el.textContent ?? "").trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const fg = cs.color;
        const bg = resolveBackground(el);
        const selector = el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(/\s+/).slice(0, 2).join(".") : "");
        results.push({ text: text.slice(0, 80), bg, fg, selector, outerHtml: el.outerHTML.slice(0, 240) });
      }
      return results;
    });

    const violations: string[] = [];
    for (const f of failures) {
      const fg = parseColor(f.fg);
      const bg = parseColor(f.bg);
      if (!fg || !bg) continue;
      const ratio = contrast(fg.slice(0, 3), bg.slice(0, 3));
      if (ratio < 4.5) {
        violations.push(
          `[${ratio.toFixed(2)}:1] "${f.text}" (fg=${f.fg}, bg=${f.bg})\n  ${f.outerHtml}`
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `${violations.length} CTA(s) below 4.5:1 on ${route}:\n\n${violations.join("\n\n")}`
      );
    }
    expect(violations).toEqual([]);
  });
}

test("every app button declares its behavior", async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "networkidle" });
    const implicitButtons = page.locator("main button:not([type])");
    const count = await implicitButtons.count();
    if (count > 0) failures.push(`${route}: ${count} implicit button(s)`);
  }

  expect(failures).toEqual([]);
});
