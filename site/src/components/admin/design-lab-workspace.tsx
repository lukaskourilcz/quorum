"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopySocialText } from "@/components/admin/copy-social-text";
import { DeckSaveBadge, warningFor, type SaveState } from "@/components/admin/deck-save-badge";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { LabArticle, LabPreset } from "@/lib/design-lab";

/**
 * One workspace where two tabs used to be.
 *
 * `templates` showed CSS mock-ups that never reached the renderer; `decks` showed real renders and
 * offered a five-way style chip and nothing else. Neither could answer the question the owner
 * actually has — *what does this article's carousel look like, and can I change it* — because each
 * held half the answer. The rail, the canvas, the controls and the output are that question in
 * four parts, and the recipe line under the controls is the whole design in one sentence.
 */

const FORMATS = [
  { id: "instagram-portrait", label: "4:5", ratio: 1_080 / 1_350 },
  { id: "instagram-square", label: "1:1", ratio: 1 },
  { id: "instagram-story", label: "9:16", ratio: 1_080 / 1_920 },
  { id: "threads", label: "Threads", ratio: 1 }
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

const FAMILIES = [
  "masthead", "gutter", "bevel", "porthole", "slab",
  "terrace", "figure", "pull", "tower", "dossier",
  "billboard", "broadsheet", "zurich", "concrete", "terminal", "marginalia", "memo"
] as const;

const TREATMENTS = [
  { id: "none", label: "bez úpravy" },
  { id: "mono", label: "černobíle" },
  { id: "duotone", label: "duotón" }
] as const;

const SCALES = [0.9, 1, 1.1] as const;
const MAX_WORDS = 30;

interface Recipe {
  family: string;
  variant: "A" | "B";
  accentSwap: boolean;
  treatment: "none" | "mono" | "duotone";
  typeScale: number;
  phaseSeed: number;
}

function token(recipe: Recipe): string {
  return `${recipe.family}~${recipe.accentSwap ? "b" : recipe.variant.toLowerCase()}~${recipe.treatment}~${Math.round(recipe.typeScale * 10)}~${recipe.phaseSeed}`;
}

function line(recipe: Recipe): string {
  const treatment = TREATMENTS.find((entry) => entry.id === recipe.treatment)?.label ?? recipe.treatment;
  return `${recipe.family} · ${recipe.accentSwap ? "B" : recipe.variant} · ${treatment} · ${recipe.typeScale}× · fáze ${recipe.phaseSeed}`;
}

function words(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function chipClass(on: boolean): string {
  // Brand text on a brand tint measures 1.00:1 — the two are the same hue. An active chip is
  // brand border, brand tint and white text; the border carries the identity, the label carries
  // the word, so it gets the colour that lets it be read.
  return `rounded-full border px-3 py-1 font-mono text-[0.65625rem] uppercase tracking-[0.12em] transition ${
    on
      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]"
      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--card-foreground)]"
  }`;
}

function slideUrl(article: LabArticle, recipe: Recipe, format: FormatId, slide: number, download = false): string {
  const query = new URLSearchParams({ format, ...(download ? { download: "1" } : {}) });
  return `/admin/api/carousel-studio/deck/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}/${slide}?${query.toString()}`;
}

function SlideImage({ src, alt, ratio }: { src: string; alt: string; ratio: number }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const url = `${src}${src.includes("?") ? "&" : "?"}attempt=${attempt}`;
  // Derived during render rather than in an effect: a new source is a new render, and until it
  // arrives the previous frame stays on screen dimmed. A blank rectangle for every chip click
  // reads as a broken tool.
  const pending = loaded !== url;

  if (failed === url) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--warning)] p-6 text-center">
        <p className="text-xs text-[var(--warning)]">Slide se nevykreslil.</p>
        <Button onClick={() => setAttempt((value) => value + 1)} size="small" type="button" variant="secondary">
          Zkusit znovu
        </Button>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={`w-full rounded-[var(--radius-card)] border border-[var(--border)] transition-opacity ${pending ? "opacity-40" : "opacity-100"}`}
      data-slide-canvas
      onError={() => setFailed(url)}
      onLoad={() => setLoaded(url)}
      src={url}
      style={{ aspectRatio: String(ratio) }}
    />
  );
}

function Workspace({ article, presets }: { article: LabArticle; presets: LabPreset[] }) {
  const writesEnabled = useAdminWritesEnabled();
  const [recipe, setRecipe] = useState<Recipe>(article.recipe);
  const [format, setFormat] = useState<FormatId>("instagram-portrait");
  const [safeArea, setSafeArea] = useState(false);
  const [slide, setSlide] = useState(0);
  const [texts, setTexts] = useState<string[]>(article.slides.map((entry) => entry.text));
  const [save, setSave] = useState<SaveState>({ kind: "rest", style: article.recipe.family });
  const [presetName, setPresetName] = useState("");

  const canvas = FORMATS.find((entry) => entry.id === format)!;
  const current = texts[slide] ?? "";
  const overLimit = words(current) > MAX_WORDS;
  const changed = current.trim() !== (article.slides[slide]?.text ?? "").trim();

  async function post(body: Record<string, unknown>, label: string): Promise<void> {
    if (!writesEnabled) return;
    setSave({ kind: "saving", style: label });
    try {
      const response = await fetch("/admin/api/carousel-studio/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture: article.venture, slug: article.slug, date: article.date, ...body })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; cause?: string; commit?: string | null };
      if (!response.ok) {
        const cause = payload.cause ?? "unknown";
        setSave({ kind: "warning", style: label, cause, message: warningFor(cause, payload.error) });
        return;
      }
      setSave({ kind: "saved", style: label, commit: payload.commit ?? null });
    } catch {
      setSave({ kind: "warning", style: label, cause: "network", message: warningFor("network", "Server neodpověděl.") });
    }
  }

  // Changing a control re-renders the preview immediately and saves alongside it. Viewing is a
  // render and cannot fail; only the badge moves when a save does.
  function change(next: Partial<Recipe>): void {
    const merged = { ...recipe, ...next };
    setRecipe(merged);
    if (writesEnabled) void post(
      {
        family: merged.family,
        variant: merged.variant,
        accentSwap: merged.accentSwap,
        treatment: merged.treatment,
        typeScale: merged.typeScale
      },
      line(merged)
    );
  }

  return (
    <article className="grid min-w-0 gap-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5" data-lab-article={`${article.venture}/${article.slug}/${article.date}`}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            {article.ventureLabel} · {article.date} · {article.slides.length} slidů
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-[var(--card-foreground)]">{article.headline}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {article.hasHero ? null : <Badge tone="warning">bez obrázku</Badge>}
          <Badge tone={article.renderable ? "success" : "danger"}>{article.renderable ? "připraveno" : "neúplné"}</Badge>
          <Badge>{article.origin === "recorded" ? "zaznamenáno" : "odvozeno"}</Badge>
        </div>
      </header>

      {article.problems.length > 0 ? <Callout tone="warning">{article.problems.join(" ")}</Callout> : null}

      <div className="flex flex-wrap gap-2">
        {FORMATS.map((entry) => (
          <button aria-pressed={format === entry.id} className={chipClass(format === entry.id)} key={entry.id} onClick={() => setFormat(entry.id)} type="button">
            {entry.label}
          </button>
        ))}
        {format === "instagram-story" ? (
          <button aria-pressed={safeArea} className={chipClass(safeArea)} onClick={() => setSafeArea((value) => !value)} type="button">
            bezpečná zóna
          </button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="relative">
          <SlideImage
            alt={`Slide ${slide + 1}: ${current}`}
            ratio={canvas.ratio}
            src={slideUrl(article, recipe, format, slide + 1)}
          />
          {safeArea && format === "instagram-story" ? (
            // The platform's own chrome, drawn over the canvas: a profile row along the top and a
            // reply bar along the bottom cover roughly a seventh of the frame at each end.
            <div aria-hidden="true" className="pointer-events-none absolute inset-0" data-safe-area>
              <div className="absolute inset-x-0 top-0 h-[14%] bg-[var(--destructive-soft)] opacity-60" />
              <div className="absolute inset-x-0 bottom-0 h-[16%] bg-[var(--destructive-soft)] opacity-60" />
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="w-full overflow-x-auto" data-horizontal-scroll>
            <ol className="flex gap-2">
              {article.slides.map((entry) => (
                <li key={entry.index}>
                  <button
                    aria-pressed={slide === entry.index}
                    className={chipClass(slide === entry.index)}
                    onClick={() => setSlide(entry.index)}
                    type="button"
                  >
                    {entry.index + 1}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid min-w-0 gap-2">
            <label className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]" htmlFor={`slide-${article.id}`}>
              Text slidu {slide + 1}
            </label>
            <textarea
              className="min-h-24 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)]"
              disabled={!writesEnabled}
              id={`slide-${article.id}`}
              onChange={(event) => {
                const next = [...texts];
                next[slide] = event.target.value;
                setTexts(next);
              }}
              value={current}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className={`font-mono text-[0.65625rem] uppercase tracking-[0.12em] ${overLimit ? "text-[var(--destructive)]" : "text-[var(--fog)]"}`} data-word-count>
                {words(current)}/{MAX_WORDS} slov
              </span>
              <Button
                data-save-slide
                disabled={!writesEnabled || overLimit || !changed}
                onClick={() => { void post({ slide, text: current }, `slide ${slide + 1}`); }}
                size="small"
                type="button"
                variant="secondary"
              >
                Uložit slide
              </Button>
              {overLimit ? (
                <span className="text-xs text-[var(--destructive)]">
                  Slide {slide + 1} má {words(current)} slov, přes limit {MAX_WORDS} slov.
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]" data-recipe-line>
              {line(recipe)}{article.recipePinned ? " · vybráno" : " · odvozeno"}
            </p>
            <div className="w-full overflow-x-auto" data-horizontal-scroll>
              <div className="flex gap-2">
                {FAMILIES.map((family) => (
                  <button aria-pressed={recipe.family === family} className={chipClass(recipe.family === family)} key={family} onClick={() => change({ family })} type="button">
                    {family}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button aria-pressed={!recipe.accentSwap} className={chipClass(!recipe.accentSwap)} onClick={() => change({ accentSwap: false, variant: "A" })} type="button">A</button>
              <button aria-pressed={recipe.accentSwap} className={chipClass(recipe.accentSwap)} onClick={() => change({ accentSwap: true, variant: "B" })} type="button">B</button>
              {TREATMENTS.map((entry) => (
                <button aria-pressed={recipe.treatment === entry.id} className={chipClass(recipe.treatment === entry.id)} key={entry.id} onClick={() => change({ treatment: entry.id })} type="button">
                  {entry.label}
                </button>
              ))}
              {SCALES.map((scale) => (
                <button aria-pressed={recipe.typeScale === scale} className={chipClass(recipe.typeScale === scale)} key={scale} onClick={() => change({ typeScale: scale })} type="button">
                  {scale}×
                </button>
              ))}
              <button className={chipClass(false)} onClick={() => change({ phaseSeed: (recipe.phaseSeed + 1) % 4 })} type="button">
                fáze ▸
              </button>
              <DeckSaveBadge save={save} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2" data-presets>
              {presets.map((preset) => (
                <button
                  className={chipClass(false)}
                  key={preset.id}
                  onClick={() => change({
                    family: preset.family,
                    variant: preset.variant,
                    accentSwap: preset.accentSwap,
                    treatment: preset.treatment,
                    typeScale: preset.typeScale
                  })}
                  type="button"
                >
                  {preset.name}{preset.status === "draft" ? " · koncept" : ""}
                </button>
              ))}
              <label className="sr-only" htmlFor={`preset-${article.id}`}>Název presetu</label>
              <input
                className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs text-[var(--foreground)]"
                disabled={!writesEnabled}
                id={`preset-${article.id}`}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Uložit jako preset"
                value={presetName}
              />
              <Button
                data-save-preset
                disabled={!writesEnabled || presetName.trim().length < 2}
                onClick={() => { void post({ ...recipe, presetName, presetStatus: "draft" }, presetName); }}
                size="small"
                type="button"
                variant="secondary"
              >
                Uložit preset
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 border-t border-[var(--border)] pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Popisek</span>
          <CopySocialText text={article.caption} />
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Threads</span>
          <CopySocialText text={article.copy.copy.threadsText} />
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Story</span>
          <CopySocialText text={article.copy.copy.storyLine} />
          <a
            className="rounded-full border border-[var(--border)] px-3 py-1 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--card-foreground)]"
            download
            href={slideUrl(article, recipe, format, slide + 1, true)}
          >
            Stáhnout slide
          </a>
          <a
            className="rounded-full border border-[var(--border)] px-3 py-1 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--card-foreground)]"
            download
            href={`/admin/api/carousel-studio/export/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}?format=${format}`}
          >
            Stáhnout celý deck
          </a>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]" data-caption>{article.caption}</p>
        <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          {article.copy.copy.hashtags.map((tag) => `#${tag}`).join(" ")}
        </p>
        {article.heroCredit ? (
          // Not removable, and not the model's to forget: the credit is appended by code, and most
          // of these photographs are CC BY.
          <p className="text-xs text-[var(--fog)]">Kredit fotografie je součástí popisku: {article.heroCredit}</p>
        ) : null}
      </div>
    </article>
  );
}

export function DesignLabWorkspace({ articles, presets }: { articles: LabArticle[]; presets: LabPreset[] }) {
  const [selected, setSelected] = useState<string | null>(articles[0]?.id ?? null);
  const article = useMemo(() => articles.find((entry) => entry.id === selected) ?? articles[0], [articles, selected]);

  if (articles.length === 0) {
    return <Callout tone="accent">Zatím tu není žádný článek, ze kterého by šel karusel postavit.</Callout>;
  }

  return (
    <div className="grid min-w-0 gap-4">
      <Callout tone="accent">
        Karusely se skládají ke každému článku a nikam se neposílají. Publikování je zavřené
        rozhodnutím social-2026-08a, dokud každý magazín nevydá deset článků.
      </Callout>

      <div className="w-full overflow-x-auto" data-horizontal-scroll>
        <ol className="flex gap-2" data-article-rail>
          {articles.map((entry) => (
            <li key={entry.id}>
              <button
                aria-pressed={entry.id === article?.id}
                className={`flex min-w-56 flex-col gap-1 rounded-[var(--radius-card)] border px-4 py-3 text-left transition ${
                  entry.id === article?.id
                    ? "border-[var(--accent)] bg-[var(--surface-raised)]"
                    : "border-[var(--border)] hover:border-[var(--accent)]"
                }`}
                onClick={() => setSelected(entry.id)}
                type="button"
              >
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                  {entry.ventureLabel} · {entry.date} · {entry.slides.length} slidů
                </span>
                <span className="line-clamp-2 text-sm text-[var(--card-foreground)]">{entry.headline}</span>
                <span className="flex gap-1">
                  {entry.hasHero ? null : <Badge tone="warning">bez obrázku</Badge>}
                  {entry.renderable ? null : <Badge tone="danger">neúplné</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {article ? <Workspace article={article} key={article.id} presets={presets} /> : null}
    </div>
  );
}
