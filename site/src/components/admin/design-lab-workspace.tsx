"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Image as ImageIcon, Layers, Search } from "lucide-react";
import { CopySocialText } from "./copy-social-text";
import { DeckSaveBadge, warningFor, type SaveState } from "./deck-save-badge";
import { DesignLabBilingualSlide } from "./design-lab-bilingual-slide";
import { DesignLabInspector } from "./design-lab-inspector";
import { SlideImage } from "./design-lab-image";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { FORMATS, LAUNCH_FAMILIES, LOOKS, chipClass, saveable, slideUrl, token, type FormatId, type Recipe } from "./design-lab-model";
import { AdminButton as Button, AdminCallout as Callout, AdminEntityBadge, AdminInput, AdminLabel, AdminStateMessage, AdminStatusBadge as Badge } from "./admin-primitives";
import type { LabArticle, LabPreset } from "@/lib/design-lab";

function Workspace({ article, presets }: { article: LabArticle; presets: LabPreset[] }) {
  const writesEnabled = useAdminWritesEnabled();
  const [recipe, setRecipe] = useState<Recipe>(article.recipe);
  const [persistedRecipe, setPersistedRecipe] = useState<Recipe | null>(article.recipePinned ? article.recipe : null);
  const [format, setFormat] = useState<FormatId>("instagram-portrait");
  const [safeArea, setSafeArea] = useState(true);
  const [slide, setSlide] = useState(0);
  const [texts, setTexts] = useState(article.slides.map((entry) => entry.text));
  const [savedTexts, setSavedTexts] = useState(article.slides.map((entry) => entry.text));
  const [revision, setRevision] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "rest", style: article.recipe.family });
  const canvas = FORMATS.find((entry) => entry.id === format)!;
  const dedicatedBilingual = article.venture === "tehdejsi-svet";
  const busy = save.kind === "saving";
  const applied = persistedRecipe !== null && JSON.stringify(saveable(recipe)) === JSON.stringify(saveable(persistedRecipe));
  const current = texts[slide] ?? "";
  const changed = texts.some((text, index) => text !== savedTexts[index]);

  async function post(body: Record<string, unknown>, label: string): Promise<boolean> {
    if (!writesEnabled || busy) return false;
    setSave({ kind: "saving", style: label });
    try {
      const response = await fetch("/admin/api/carousel-studio/recipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture: article.venture, slug: article.slug, date: article.date, ...body })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; cause?: string; commit?: string | null; ok?: boolean };
      if (!response.ok || payload.ok !== true) {
        const cause = payload.cause ?? "unknown";
        setSave({ kind: "warning", style: label, cause, message: warningFor(cause, payload.error) });
        return false;
      }
      setSave({ kind: "saved", style: label, commit: payload.commit ?? null });
      return true;
    } catch {
      setSave({ kind: "warning", style: label, cause: "network", message: warningFor("network", "Server neodpověděl.") });
      return false;
    }
  }

  async function applyRecipe(next: Recipe): Promise<void> {
    if (await post(saveable(next), next.family)) setPersistedRecipe(next);
  }
  function change(next: Partial<Recipe>): void {
    if (busy) return;
    const merged = { ...recipe, ...next };
    setRecipe(merged);
    if (writesEnabled) void applyRecipe(merged);
  }
  async function saveText(): Promise<void> {
    const index = slide;
    const text = current;
    if (await post({ slide: index, text }, `slide ${index + 1}`)) {
      setSavedTexts((values) => values.map((value, position) => position === index ? text : value));
      setRevision((value) => String(Number(value || 0) + 1));
    }
  }

  return <article className="min-w-0 overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]" data-lab-article={`${article.venture}/${article.slug}/${article.date}`}>
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--admin-border)] p-4 md:p-5">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-foreground-muted)]"><Layers aria-hidden="true" className="size-3.5" />{article.ventureLabel} · {article.date}<AdminEntityBadge>{article.slides.length === 1 ? "Příspěvek" : `${article.slides.length} slidů`}</AdminEntityBadge></div>
        <h3 className="max-w-3xl text-lg font-semibold leading-snug text-[var(--admin-foreground)]">{article.headline}</h3>
      </div>
      <div className="flex flex-wrap gap-2"><Badge tone={article.renderable ? "success" : "destructive"}>{article.renderable ? "připraveno" : "neúplné"}</Badge>{!article.hasHero ? <Badge tone="warning">bez obrázku</Badge> : null}</div>
    </header>
    {article.problems.length ? <div className="p-4"><Callout tone="warning">{article.problems.join(" ")}</Callout></div> : null}

    <div className="grid min-w-0 gap-5 p-3 md:p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Formát návrhu">{FORMATS.map((entry) => <button key={entry.id} type="button" className={chipClass(format === entry.id)} aria-pressed={format === entry.id} onClick={() => setFormat(entry.id)}>{entry.label}</button>)}</div>
          {format === "instagram-story" ? <button type="button" className={chipClass(safeArea)} aria-pressed={safeArea} onClick={() => setSafeArea((value) => !value)}>Bezpečná zóna</button> : null}
        </div>
        <div className="grid min-w-0 place-items-center rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-elevated)] px-3 py-6 md:px-6" data-design-stage>
          <div className="relative w-full shadow-xl" style={{ maxWidth: `${Math.min(520, 600 * canvas.ratio)}px` }}>
            <SlideImage alt={`Slide ${slide + 1}: ${savedTexts[slide] ?? ""}`} ratio={canvas.ratio} src={slideUrl(article, recipe, format, slide + 1, false, revision)} />
            {safeArea && format === "instagram-story" ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" data-safe-area>
              <div className="absolute inset-x-0 top-0 flex h-[14%] items-center justify-center border-b border-dashed border-white/70 bg-black/55 text-xs text-white">Profil a ovládání</div>
              <div className="absolute inset-x-0 bottom-0 flex h-[16%] items-center justify-center border-t border-dashed border-white/70 bg-black/55 text-xs text-white">Odpověď a reakce</div>
            </div> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--admin-foreground-muted)]">{canvas.width} × {canvas.height} px</span>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" aria-label="Předchozí slide" disabled={slide === 0} onClick={() => setSlide((value) => value - 1)}><ArrowLeft aria-hidden="true" className="size-4" /></Button>
            <span aria-live="polite" className="text-xs tabular-nums">{slide + 1} / {article.slides.length}</span>
            <Button type="button" variant="secondary" aria-label="Další slide" disabled={slide === article.slides.length - 1} onClick={() => setSlide((value) => value + 1)}><ArrowRight aria-hidden="true" className="size-4" /></Button>
          </div>
        </div>
        <div className="w-full overflow-x-auto pb-2" data-horizontal-scroll>
          <ol className="flex gap-2" aria-label="Slidy karuselu" data-slide-strip>{article.slides.map((entry) => <li key={entry.index} className="w-[72px] shrink-0">
            <button type="button" aria-label={`Otevřít slide ${entry.index + 1}`} aria-pressed={slide === entry.index} className={`admin-focus-ring grid w-full gap-1 rounded-lg border p-1 ${slide === entry.index ? "border-[var(--admin-primary)] bg-[var(--admin-surface-elevated)]" : "border-transparent"}`} onClick={() => setSlide(entry.index)}>
              <SlideImage canvas={false} alt="" ratio={canvas.ratio} src={slideUrl(article, recipe, format, entry.index + 1, false, revision)} />
              <span className="text-[10px] tabular-nums text-[var(--admin-foreground-muted)]">{entry.index + 1}{texts[entry.index] !== savedTexts[entry.index] ? " •" : ""}</span>
            </button>
          </li>)}</ol>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-3">
        {dedicatedBilingual ? <DesignLabBilingualSlide pack={article.dualLanguage} slide={slide} /> : <DesignLabInspector
          article={article} recipe={recipe} format={format} texts={texts} slide={slide} savedText={savedTexts[slide] ?? ""}
          writable={writesEnabled} busy={busy} presets={presets} change={change}
          editText={(text) => setTexts((values) => values.map((value, index) => index === slide ? text : value))}
          saveText={() => { void saveText(); }} savePreset={(name) => { void post({ ...saveable(recipe), presetName: name, presetStatus: "draft" }, name); }}
        />}
        <DeckSaveBadge save={save} />
        <p className="break-words text-xs text-[var(--admin-foreground-muted)]" data-recipe-line>{recipe.family} · {recipe.accentSwap ? "B" : recipe.variant} · {recipe.treatment} · {recipe.typeScale}×{applied ? " · vybráno" : " · náhled"}</p>
      </div>
    </div>

    {!dedicatedBilingual ? <section className="grid min-w-0 gap-3 border-t border-[var(--admin-border)] p-4 md:p-5" data-launch-looks>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-sm font-semibold">Vyberte vzhled</h4><p className="mt-1 text-xs text-[var(--admin-foreground-muted)]">Pět kompozic s vaším obsahem. Kliknutím zobrazíte náhled.</p></div>
        <Button data-apply-look disabled={!writesEnabled || busy || applied} onClick={() => { void applyRecipe(recipe); }} type="button">{applied ? `Použito: ${recipe.family}` : `Použít vzhled ${recipe.family}`}</Button>
      </div>
      <div className="w-full overflow-x-auto" data-horizontal-scroll><ol className="flex gap-3 pb-1">{LAUNCH_FAMILIES.map((family) => <li className="w-36 shrink-0 md:w-40" key={family}>
        <button type="button" data-look={family} disabled={busy} aria-pressed={recipe.family === family} className={`admin-focus-ring grid w-full gap-2 rounded-xl border p-2 text-left transition ${recipe.family === family ? "border-[var(--admin-primary)] bg-[var(--admin-surface-elevated)]" : "border-[var(--admin-border)] hover:border-[var(--admin-section-accent)]"}`} onClick={() => setRecipe((value) => ({ ...value, family }))}>
          <SlideImage alt={`${family}: titulní slide`} canvas={false} ratio={1080 / 1350} src={slideUrl(article, { ...recipe, family }, "instagram-portrait", 1, false, revision)} />
          <span className="text-sm font-semibold">{LOOKS[family]!.name}</span><span className="text-[11px] leading-relaxed text-[var(--admin-foreground-muted)]">{LOOKS[family]!.detail}</span>
        </button>
      </li>)}</ol></div>
    </section> : null}

    <footer className="grid min-w-0 gap-4 border-t border-[var(--admin-border)] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><ImageIcon aria-hidden="true" className="size-4" />Export návrhu</span>
        <div className="flex flex-wrap gap-2">
          <a className={chipClass(false)} download href={slideUrl(article, recipe, format, slide + 1, true, revision)}><Download aria-hidden="true" className="mr-2 size-3.5" />Stáhnout slide</a>
          <a className={chipClass(true)} download href={`/admin/api/carousel-studio/export/${article.venture}/${encodeURIComponent(article.slug)}/${article.date}/${encodeURIComponent(token(recipe))}?format=${format}`}><Download aria-hidden="true" className="mr-2 size-3.5" />Stáhnout celý deck</a>
        </div>
      </div>
      {changed ? <Callout tone="warning">Export obsahuje uložené texty. Před stažením uložte upravené slidy.</Callout> : null}
      <details><summary className="admin-focus-ring cursor-pointer py-2 text-sm text-[var(--admin-foreground-muted)]">Popisek a texty pro sociální sítě</summary>
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs"><span>Popisek</span><CopySocialText text={article.caption} /><span>Threads</span><CopySocialText text={article.copy.copy.threadsText} /><span>Story</span><CopySocialText text={article.copy.copy.storyLine} /></div>
          <p className="whitespace-pre-wrap break-words text-sm" data-caption>{article.caption}</p>
          <p className="break-words text-xs text-[var(--admin-foreground-muted)]">{article.copy.copy.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
          {article.heroCredit ? <p className="text-xs text-[var(--admin-foreground-muted)]">Kredit fotografie je součástí popisku: {article.heroCredit}</p> : null}
        </div>
      </details>
    </footer>
  </article>;
}

export function DesignLabWorkspace({ articles, presets }: { articles: LabArticle[]; presets: LabPreset[] }) {
  const [selected, setSelected] = useState<string | null>(articles[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const article = useMemo(() => articles.find((entry) => entry.id === selected) ?? articles[0], [articles, selected]);
  const filtered = useMemo(() => {
    const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");
    const query = normalize(search.trim());
    return articles.filter((entry) => normalize(`${entry.headline} ${entry.ventureLabel} ${entry.date}`).includes(query));
  }, [articles, search]);
  if (!articles.length) return <AdminStateMessage state="initial-empty" title="Zatím tu není žádný článek, ze kterého by šel karusel postavit." />;
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-medium uppercase tracking-widest text-[var(--admin-foreground-muted)]">Design Lab / Studio</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Z článku do vašeho feedu.</h2><p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">Vyberte článek, dolaďte kompozici a stáhněte hotovou grafiku.</p></div>
      <div className="w-full sm:max-w-72"><AdminLabel className="sr-only" htmlFor="lab-search">Hledat článek</AdminLabel><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-[var(--admin-foreground-muted)]" /><AdminInput id="lab-search" type="search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hledat článek…" /></div></div>
    </div>
    <div className="w-full overflow-x-auto" data-horizontal-scroll><ol className="flex gap-2 pb-1" data-article-rail>{filtered.map((entry) => <li className="w-64 shrink-0" key={entry.id}>
      <button type="button" aria-pressed={entry.id === article?.id} className={`admin-focus-ring flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left ${entry.id === article?.id ? "border-[var(--admin-primary)] bg-[var(--admin-surface-elevated)]" : "border-[var(--admin-border)] hover:border-[var(--admin-section-accent)]"}`} onClick={() => setSelected(entry.id)}>
        <span className="text-[11px] text-[var(--admin-foreground-muted)]">{entry.ventureLabel} · {entry.date}</span><span className="line-clamp-2 text-sm font-medium">{entry.headline}</span>
        {!entry.renderable ? <Badge tone="destructive">neúplné</Badge> : null}
      </button>
    </li>)}</ol></div>
    {!filtered.length ? <AdminStateMessage state="filtered-empty" title="Žádný článek neodpovídá hledání." /> : null}
    {article ? <Workspace article={article} key={article.id} presets={presets} /> : null}
    <p className="text-xs leading-relaxed text-[var(--admin-foreground-muted)]">Karusely se odsud nikam neposílají. Publikování řídí samostatné schválení a nastavení sociálních profilů.</p>
  </div>;
}
