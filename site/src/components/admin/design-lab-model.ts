import type { LabArticle } from "@/lib/design-lab";

export const FORMATS = [
  { id: "instagram-portrait", label: "Příspěvek 4:5", ratio: 1080 / 1350, width: 1080, height: 1350 },
  { id: "instagram-square", label: "Čtverec 1:1", ratio: 1, width: 1080, height: 1080 },
  { id: "instagram-story", label: "Story 9:16", ratio: 1080 / 1920, width: 1080, height: 1920 },
  { id: "threads", label: "Threads", ratio: 1, width: 1080, height: 1080 },
  { id: "linkedin-square", label: "LinkedIn 1:1", ratio: 1, width: 1080, height: 1080 }
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];

// Kept browser-only; the registry parity test prevents drift without bundling the renderer.
export const LAUNCH_FAMILIES = ["folio", "press", "rail", "fault", "halo"] as const;
export const LEGACY_FAMILIES = [
  "masthead", "gutter", "bevel", "porthole", "slab", "terrace", "figure", "pull", "tower", "dossier",
  "billboard", "broadsheet", "zurich", "concrete", "terminal", "marginalia", "memo", "versus", "tally",
  "counterweight", "throughline", "quiet", "offset", "apex", "vista"
] as const;
export const LOOKS: Record<string, { name: string; detail: string }> = {
  folio: { name: "Folio", detail: "Časopis · fotografie v rámu" },
  press: { name: "Press", detail: "Velká fotografie · výrazný zpravodajský titulek" },
  rail: { name: "Rail", detail: "Průvodce · číslované kroky" },
  fault: { name: "Fault", detail: "Kontrast · ostrá geometrie" },
  halo: { name: "Halo", detail: "Portrét · kruhový výřez" }
};
export const TREATMENTS = [
  { id: "none", label: "Původní" }, { id: "mono", label: "Černobílá" }, { id: "duotone", label: "Duotón" }
] as const;
export const SCALES = [0.9, 1, 1.1] as const;
export const MAX_WORDS = 30;
export interface Recipe {
  family: string;
  variant: "A" | "B";
  accentSwap: boolean;
  treatment: "none" | "mono" | "duotone";
  typeScale: number;
  phaseSeed: number;
}
export function token(recipe: Recipe): string {
  return `${recipe.family}~${recipe.accentSwap ? "b" : recipe.variant.toLowerCase()}~${recipe.treatment}~${Math.round(recipe.typeScale * 10)}~${recipe.phaseSeed}`;
}
export function saveable(recipe: Recipe): Record<string, unknown> {
  return { family: recipe.family, variant: recipe.variant, accentSwap: recipe.accentSwap, treatment: recipe.treatment, typeScale: recipe.typeScale };
}
export function words(value: string): number { return value.trim().split(/\s+/u).filter(Boolean).length; }
export function chipClass(on: boolean): string {
  return `admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center justify-center rounded-lg border px-3 text-xs font-medium transition md:min-h-[var(--admin-control-height)] ${on
    ? "border-[var(--admin-primary)] bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)]"
    : "border-[var(--admin-border)] text-[var(--admin-foreground-muted)] hover:border-[var(--admin-section-accent)] hover:text-[var(--admin-foreground)]"}`;
}
export function slideUrl(article: LabArticle, recipe: Recipe, format: FormatId, slide: number, download = false, revision = ""): string {
  const query = new URLSearchParams({ format, ...(download ? { download: "1" } : {}), ...(revision ? { revision } : {}) });
  return `/admin/api/carousel-studio/deck/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}/${slide}?${query}`;
}
export function canvaBrief(article: LabArticle, recipe: Recipe, format: FormatId, texts: readonly string[]): string {
  const canvas = FORMATS.find((entry) => entry.id === format)!;
  return [
    `DESIGN BRIEF · ${article.ventureLabel}`,
    `Article: ${article.headline}\nDate: ${article.date}\nSource: ${article.venture}/${article.slug}/${article.date}`,
    `Format: ${canvas.width} × ${canvas.height} px. ${texts.length} pages. Language: ${article.locale}.`,
    `Direction: ${LOOKS[recipe.family]?.detail ?? recipe.family}. Preserve this venture's brand identity.`,
    "Visual reference: https://www.instagram.com/technology/ — photo-led covers, dense bold headlines, restrained branding and strong contrast. Use the composition as inspiration with our own assets, fonts and palette.",
    ...(article.designTokens ? [
      `Brand palette: ${Object.entries(article.designTokens.colors).map(([name, value]) => `${name}: ${value}`).join(", ")}`,
      `Typefaces: headline ${article.designTokens.fonts.headline}; body ${article.designTokens.fonts.body}; labels ${article.designTokens.fonts.mono}.`
    ] : []),
    "Use a strong typographic hierarchy, deliberate spacing and one idea per page. Keep Czech accents. Do not add claims, statistics, quotes or decorative AI imagery.",
    format === "instagram-story" ? "Keep essential text clear of the top 14% and bottom 16% story overlays." : "Keep essential text inside generous page margins.",
    ...texts.map((text, index) => `PAGE ${index + 1}\n${text}`),
    `CAPTION\n${article.caption}`,
    `PHOTO CREDIT\n${article.heroCredit ?? "No photo credit recorded. Use only approved assets with their licence."}`,
    "This is a design draft using existing article copy, not a new fact check. Keep any qualifications in the source wording. Review the design before exporting."
  ].join("\n\n");
}
