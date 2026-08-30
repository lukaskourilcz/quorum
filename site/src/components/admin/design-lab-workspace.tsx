"use client";

import { useMemo, useState } from "react";
import { CopySocialText } from "@/components/admin/copy-social-text";
import { DeckSaveBadge, warningFor, type SaveState } from "@/components/admin/deck-save-badge";
import { DesignLabBilingualSlide } from "@/components/admin/design-lab-bilingual-slide";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminCallout as Callout,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminStateMessage,
  AdminStatusBadge as Badge,
  AdminTextarea,
} from "./admin-primitives";
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

/**
 * The families: the launch rotation first, the legacy library after it.
 *
 * Hard-coded rather than imported, because this is a client component and the studio package is
 * the render engine — pulling it across the boundary to read one array would ship the renderer to
 * the browser. A site test holds this row to the engine's registry, launch five leading. The five
 * lead because they are the only families the dealer deals unprompted; everything after them
 * renders stored work and is a deliberate reach back.
 */
const LAUNCH_FAMILIES = ["apex", "rail", "vista", "fault", "halo"] as const;

/**
 * The twenty-three the dealer no longer deals.
 *
 * They still render — a carousel built under one of them a month ago has to redraw exactly as it
 * was sent — and they are still reachable. What they are not is a choice on the front door.
 */
const LEGACY_FAMILIES = [
  "masthead", "gutter", "bevel", "porthole", "slab",
  "terrace", "figure", "pull", "tower", "dossier",
  "billboard", "broadsheet", "zurich", "concrete", "terminal",
  "marginalia", "memo", "versus", "tally", "counterweight",
  "throughline", "quiet", "offset"
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

/** The five fields a recipe saves. The phase seed is a render choice and is not one of them. */
function saveable(recipe: Recipe): Record<string, unknown> {
  return {
    family: recipe.family,
    variant: recipe.variant,
    accentSwap: recipe.accentSwap,
    treatment: recipe.treatment,
    typeScale: recipe.typeScale
  };
}

function words(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function chipClass(on: boolean): string {
  // Brand text on a brand tint measures 1.00:1 — the two are the same hue. An active chip uses
  // the primary fill and its paired foreground token so both the selection and its label remain
  // legible in every Admin theme.
  return `admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center rounded-full border px-3 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] transition md:min-h-[var(--admin-control-height)] ${
    on
      ? "border-[var(--admin-primary)] bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)]"
      : "border-[var(--admin-border)] text-[var(--admin-foreground-muted)] hover:border-[var(--admin-section-accent)] hover:text-[var(--admin-foreground)]"
  }`;
}

function slideUrl(article: LabArticle, recipe: Recipe, format: FormatId, slide: number, download = false): string {
  const query = new URLSearchParams({ format, ...(download ? { download: "1" } : {}) });
  return `/admin/api/carousel-studio/deck/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}/${slide}?${query.toString()}`;
}

function SlideImage({ src, alt, ratio, canvas = true }: { src: string; alt: string; ratio: number; canvas?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const url = `${src}${src.includes("?") ? "&" : "?"}attempt=${attempt}`;
  // Derived during render rather than in an effect: a new source is a new render, and until it
  // arrives the previous frame stays on screen dimmed. A blank rectangle for every chip click
  // reads as a broken tool.
  const pending = loaded !== url;

  if (failed === url) {
    return <AdminStateMessage state="error" title="Slide se nevykreslil." action={<Button onClick={() => setAttempt((value) => value + 1)}>Zkusit znovu</Button>} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={`w-full rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] transition-opacity ${pending ? "opacity-40" : "opacity-100"}`}
      // The canvas is the slide being worked on. The five look tiles are the same renderer at
      // thumbnail size, and marking them as canvases too made `[data-slide-canvas]` resolve to
      // six elements — a selector for "the slide" that names every picture on the page.
      {...(canvas ? { "data-slide-canvas": true } : { "data-look-canvas": true })}
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
  const dedicatedBilingual = article.venture === "tehdejsi-svet";

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
    if (writesEnabled) void post(saveable(merged), line(merged));
  }

  /*
   * Looking, without choosing.
   *
   * The five looks are how the owner picks, and picking is two separate acts: press one to see
   * the whole deck in it, press the labelled button to make it this article's. The fine-tune
   * controls below keep saving as they always did — an axis nudged is a decision already taken —
   * but a row of looks is a place to browse, and browsing must not rewrite the record.
   */
  function previewFamily(family: string): void {
    setRecipe((current) => ({ ...current, family }));
  }

  const applied = article.recipePinned && recipe.family === article.recipe.family;

  return (
    <article className="min-w-0" data-lab-article={`${article.venture}/${article.slug}/${article.date}`}>
      <AdminCard>
        <AdminCardContent className="grid min-w-0 gap-5">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
              {article.ventureLabel} · {article.date} · {article.slides.length} slidů
            </p>
            <h3 className="mt-1 truncate text-base font-semibold text-[var(--admin-foreground)]">{article.headline}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {article.hasHero ? null : <Badge tone="warning">bez obrázku</Badge>}
            <Badge tone={article.renderable ? "success" : "destructive"}>{article.renderable ? "připraveno" : "neúplné"}</Badge>
            <AdminEntityBadge>{article.origin === "recorded" ? "zaznamenáno" : "odvozeno"}</AdminEntityBadge>
          </div>
        </header>

      {article.problems.length > 0 ? <Callout tone="warning">{article.problems.join(" ")}</Callout> : null}

      {/*
        ---- the five looks -------------------------------------------------------

        Choosing is looking. Each tile is this article's own cover drawn in one of the five
        families the dealer deals, so the owner compares the real thing rather than a swatch: press
        one to put the whole deck in it, press `Použít` to make it the article's.

        Covers only. Ten renders would double the wait on a tab whose whole purpose is a glance,
        and the deck below is one press away.
      */}
      <section className="grid min-w-0 gap-2" data-launch-looks>
        <p className="m-0 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
          Pět vzhledů — vyber podle obrázku
        </p>
        <div className="w-full overflow-x-auto" data-horizontal-scroll>
          <ol className="flex gap-3">
            {LAUNCH_FAMILIES.map((family) => (
              <li className="w-40 shrink-0" key={family}>
                <button
                  aria-pressed={recipe.family === family}
                  className={`admin-focus-ring grid w-full gap-2 rounded-[var(--admin-radius-lg)] border p-2 text-left transition ${
                    recipe.family === family
                      ? "border-[var(--admin-section-accent)] bg-[var(--admin-surface-elevated)]"
                      : "border-[var(--admin-border)] hover:border-[var(--admin-section-accent)]"
                  }`}
                  data-look={family}
                  onClick={() => previewFamily(family)}
                  type="button"
                >
                  <SlideImage
                    alt={`${family}: titulní slide`}
                    canvas={false}
                    ratio={canvas.ratio}
                    src={slideUrl(article, { ...recipe, family }, format, 1)}
                  />
                  <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground)]">{family}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-apply-look
            disabled={!writesEnabled || applied}
            onClick={() => { void post(saveable(recipe), recipe.family); }}
            type="button"
          >
            {applied ? `Použito: ${recipe.family}` : `Použít vzhled ${recipe.family}`}
          </Button>
          <DeckSaveBadge save={save} />
        </div>
      </section>

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
              <div className="absolute inset-x-0 top-0 h-[14%] bg-[var(--admin-destructive-soft)] opacity-60" />
              <div className="absolute inset-x-0 bottom-0 h-[16%] bg-[var(--admin-destructive-soft)] opacity-60" />
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

          {dedicatedBilingual ? (
            <DesignLabBilingualSlide pack={article.dualLanguage} slide={slide} />
          ) : (
            <div className="grid min-w-0 gap-4">
              <div className="grid min-w-0 gap-2">
                <AdminLabel htmlFor={`slide-${article.id}`}>
                  Text slidu {slide + 1}
                </AdminLabel>
                <AdminTextarea
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
                  <span className={`font-mono text-[0.65625rem] uppercase tracking-[0.12em] ${overLimit ? "text-[var(--admin-destructive)]" : "text-[var(--admin-foreground-muted)]"}`} data-word-count>
                    {words(current)}/{MAX_WORDS} slov
                  </span>
                  <Button
                    data-save-slide
                    disabled={!writesEnabled || overLimit || !changed}
                    onClick={() => { void post({ slide, text: current }, `slide ${slide + 1}`); }}
                    type="button"
                    variant="secondary"
                  >
                    Uložit slide
                  </Button>
                  {overLimit ? (
                    <span className="text-xs text-[var(--admin-destructive)]">
                      Slide {slide + 1} má {words(current)} slov, přes limit {MAX_WORDS} slov.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid min-w-0 gap-2">
                <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]" data-recipe-line>
                  {line(recipe)}{article.recipePinned ? " · vybráno" : " · odvozeno"}
                </p>
                {/*
                  ---- everything else, behind one disclosure ------------------------

                  Twenty-eight families, A/B, three treatments, three type scales and four phase
                  seeds: the whole axis surface used to be the front door, and the owner's words
                  were "I don't want a thousand options." None of it is removed — the engine still
                  honours every axis and a stored deck still needs them to redraw — it simply stops
                  being what a reader meets first.

                  The scroller stays marked for the containment guard, which reads an unmarked
                  overflowing element as a layout bug rather than as a scroller.
                */}
                <details className="rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] p-3" data-fine-tune>
                  <summary className="admin-focus-ring cursor-pointer font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
                    Doladit
                  </summary>
                  <div className="grid min-w-0 gap-2 pt-3">
                    <div className="flex flex-wrap gap-2">
                      {LAUNCH_FAMILIES.map((family) => (
                        <button aria-pressed={recipe.family === family} className={chipClass(recipe.family === family)} data-family={family} key={family} onClick={() => change({ family })} type="button">
                          {family}
                        </button>
                      ))}
                    </div>
                    <p className="m-0 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
                      Starší vzhledy — vykreslují uloženou práci, nové karusely už z nich nevznikají
                    </p>
                    <div className="w-full overflow-x-auto" data-horizontal-scroll>
                      <div className="flex flex-wrap gap-2" data-legacy-families>
                        {LEGACY_FAMILIES.map((family) => (
                          <button aria-pressed={recipe.family === family} className={chipClass(recipe.family === family)} data-family={family} key={family} onClick={() => change({ family })} type="button">
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
                    </div>
                  </div>
                </details>
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
                  <AdminLabel className="sr-only" htmlFor={`preset-${article.id}`}>Název presetu</AdminLabel>
                  <AdminInput
                    className="w-auto min-w-44"
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
                    type="button"
                    variant="secondary"
                  >
                    Uložit preset
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-w-0 gap-3 border-t border-[var(--admin-border)] pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Popisek</span>
          <CopySocialText text={article.caption} />
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Threads</span>
          <CopySocialText text={article.copy.copy.threadsText} />
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Story</span>
          <CopySocialText text={article.copy.copy.storyLine} />
          <a
            className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center rounded-full border border-[var(--admin-border)] px-3 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)] hover:border-[var(--admin-section-accent)] hover:text-[var(--admin-foreground)] md:min-h-[var(--admin-control-height)]"
            download
            href={slideUrl(article, recipe, format, slide + 1, true)}
          >
            Stáhnout slide
          </a>
          <a
            className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center rounded-full border border-[var(--admin-border)] px-3 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)] hover:border-[var(--admin-section-accent)] hover:text-[var(--admin-foreground)] md:min-h-[var(--admin-control-height)]"
            download
            href={`/admin/api/carousel-studio/export/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}?format=${format}`}
          >
            Stáhnout celý deck
          </a>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--admin-foreground)]" data-caption>{article.caption}</p>
        <p className="break-words font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
          {article.copy.copy.hashtags.map((tag) => `#${tag}`).join(" ")}
        </p>
        {article.heroCredit ? (
          // Not removable, and not the model's to forget: the credit is appended by code, and most
          // of these photographs are CC BY.
          <p className="text-xs text-[var(--admin-foreground-muted)]">Kredit fotografie je součástí popisku: {article.heroCredit}</p>
        ) : null}
      </div>
        </AdminCardContent>
      </AdminCard>
    </article>
  );
}

export function DesignLabWorkspace({ articles, presets }: { articles: LabArticle[]; presets: LabPreset[] }) {
  const [selected, setSelected] = useState<string | null>(articles[0]?.id ?? null);
  const article = useMemo(() => articles.find((entry) => entry.id === selected) ?? articles[0], [articles, selected]);

  if (articles.length === 0) {
    return <AdminStateMessage state="initial-empty" title="Zatím tu není žádný článek, ze kterého by šel karusel postavit." />;
  }

  return (
    <div className="grid min-w-0 gap-4">
      <Callout tone="information">
        Karusely se skládají ke každému článku a nikam se neposílají. Publikování je zavřené
        rozhodnutím social-2026-08a, dokud každý magazín nevydá deset článků.
      </Callout>

      <div className="w-full overflow-x-auto" data-horizontal-scroll>
        <ol className="flex gap-2" data-article-rail>
          {articles.map((entry) => (
            <li key={entry.id}>
              <button
                aria-pressed={entry.id === article?.id}
                className={`admin-focus-ring flex min-h-[var(--admin-touch-target)] min-w-56 flex-col gap-1 rounded-[var(--admin-radius-lg)] border px-4 py-3 text-left transition ${
                  entry.id === article?.id
                    ? "border-[var(--admin-section-accent)] bg-[var(--admin-surface-elevated)]"
                    : "border-[var(--admin-border)] hover:border-[var(--admin-section-accent)]"
                }`}
                onClick={() => setSelected(entry.id)}
                type="button"
              >
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
                  {entry.ventureLabel} · {entry.date} · {entry.slides.length} slidů
                </span>
                <span className="line-clamp-2 text-sm text-[var(--admin-foreground)]">{entry.headline}</span>
                <span className="flex gap-1">
                  {entry.hasHero ? null : <Badge tone="warning">bez obrázku</Badge>}
                  {entry.renderable ? null : <Badge tone="destructive">neúplné</Badge>}
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
