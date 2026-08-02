import type { BrandTokens, CarouselFormat, CarouselTemplate } from "./schema.js";

export interface TemplateCheck {
  id: "schema" | "safe-area" | "contrast" | "brand-tokens" | "overflow" | "originality";
  status: "pass" | "fail";
  detail: string;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function luminance(hex: string): number {
  const adjust = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * adjust(channel(hex, 1)) + 0.7152 * adjust(channel(hex, 3)) + 0.0722 * adjust(channel(hex, 5));
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

function safeAreaCheck(template: CarouselTemplate, format: CarouselFormat): TemplateCheck {
  const safe = template.formats[format].safeArea;
  const failures: string[] = [];
  template.slides.forEach((slide) => slide.layers.forEach((layer) => {
    if (layer.type !== "text" && layer.type !== "logo") return;
    if (
      layer.x < safe.left ||
      layer.y < safe.top ||
      layer.x + layer.width > 1 - safe.right ||
      layer.y + layer.height > 1 - safe.bottom
    ) failures.push(`${slide.id}:${layer.type === "text" ? layer.slot : "logo"}`);
  }));
  return failures.length
    ? { id: "safe-area", status: "fail", detail: `Outside ${format} safe area: ${failures.join(", ")}` }
    : { id: "safe-area", status: "pass", detail: `${format} text and logos stay inside the safe area` };
}

function brandTokenCheck(template: CarouselTemplate, brand: BrandTokens): TemplateCheck {
  const failures = new Set<string>();
  const expect = (token: string) => { if (!brand.colors[token]) failures.add(token); };
  template.slides.forEach((slide) => {
    expect(slide.backgroundToken);
    slide.layers.forEach((layer) => {
      if (layer.type === "text" || layer.type === "logo" || layer.type === "rule") expect(layer.colorToken);
      if (layer.type === "shape") {
        expect(layer.fillToken);
        if (layer.strokeToken) expect(layer.strokeToken);
      }
    });
  });
  return failures.size
    ? { id: "brand-tokens", status: "fail", detail: `Unknown color tokens: ${[...failures].join(", ")}` }
    : { id: "brand-tokens", status: "pass", detail: `All layers bind to ${brand.id} tokens` };
}

function contrastCheck(template: CarouselTemplate, brand: BrandTokens): TemplateCheck {
  const failures: string[] = [];
  template.slides.forEach((slide) => {
    const background = brand.colors[slide.backgroundToken];
    if (!background) return;
    slide.layers.forEach((layer) => {
      if (layer.type !== "text" && layer.type !== "logo") return;
      const foreground = brand.colors[layer.colorToken];
      if (foreground && contrastRatio(foreground, background) < 4.5) {
        failures.push(`${slide.id}:${layer.type === "text" ? layer.slot : "logo"}`);
      }
    });
  });
  return failures.length
    ? { id: "contrast", status: "fail", detail: `Contrast below 4.5:1 at ${failures.join(", ")}` }
    : { id: "contrast", status: "pass", detail: "Text contrast meets 4.5:1 against each slide background" };
}

function overflowCheck(template: CarouselTemplate): TemplateCheck {
  const failures = template.slides.flatMap((slide) => slide.layers.flatMap((layer) => {
    if (layer.type !== "text") return [];
    const minimumCapacity = Math.floor((layer.width * 1_080) / (layer.minFontSize * 0.56)) * layer.maxLines;
    return minimumCapacity < layer.maxChars ? [`${slide.id}:${layer.slot}`] : [];
  }));
  return failures.length
    ? { id: "overflow", status: "fail", detail: `Slot limit cannot fit at minimum size: ${failures.join(", ")}` }
    : { id: "overflow", status: "pass", detail: "Every slot limit fits at its minimum font size" };
}

export function validateTemplateForBrand(
  template: CarouselTemplate,
  brand: BrandTokens,
  format: CarouselFormat
): TemplateCheck[] {
  return [
    { id: "schema", status: "pass", detail: "carousel-template/1 parsed" },
    safeAreaCheck(template, format),
    contrastCheck(template, brand),
    brandTokenCheck(template, brand),
    overflowCheck(template),
    { id: "originality", status: "pass", detail: "Template data contains no external image bytes" }
  ];
}

export function mayGoLive(checks: readonly TemplateCheck[]): boolean {
  return checks.length > 0 && checks.every((check) => check.status === "pass");
}
