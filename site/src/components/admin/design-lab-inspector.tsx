"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CopySocialText } from "./copy-social-text";
import { AdminButton as Button, AdminInput, AdminLabel, AdminTextarea } from "./admin-primitives";
import { canvaBrief, chipClass, LEGACY_FAMILIES, MAX_WORDS, SCALES, TREATMENTS, words, type FormatId, type Recipe } from "./design-lab-model";
import type { LabArticle, LabPreset } from "@/lib/design-lab";

export function DesignLabInspector({ article, recipe, format, texts, slide, savedText, writable, busy, presets, change, editText, saveText, savePreset }: {
  article: LabArticle; recipe: Recipe; format: FormatId; texts: string[]; slide: number; savedText: string;
  writable: boolean; busy: boolean; presets: LabPreset[];
  change: (next: Partial<Recipe>) => void; editText: (text: string) => void;
  saveText: () => void; savePreset: (name: string) => void;
}) {
  const [tab, setTab] = useState<"text" | "design" | "canva">("text");
  const [presetName, setPresetName] = useState("");
  const current = texts[slide] ?? "";
  const count = words(current);
  const changed = current.trim() !== savedText.trim();
  return <aside aria-label="Úpravy návrhu" className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
    <div className="mb-5 grid grid-cols-3 gap-1" aria-label="Nástroje návrhu">
      {([['text', 'Text'], ['design', 'Vzhled'], ['canva', 'Canva']] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={tab === id} className={chipClass(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === "text" ? <div className="grid gap-3">
      <AdminLabel htmlFor={`slide-${article.id}`}>Text slidu {slide + 1}</AdminLabel>
      <AdminTextarea id={`slide-${article.id}`} className="min-h-44 text-base leading-relaxed" value={current} disabled={!writable || busy}
        aria-invalid={count > MAX_WORDS} aria-describedby={`count-${article.id}`} onChange={(event) => editText(event.target.value)} />
      <div className="flex items-center justify-between gap-2">
        <span id={`count-${article.id}`} className={`text-xs ${count > MAX_WORDS ? "text-[var(--admin-destructive)]" : "text-[var(--admin-foreground-muted)]"}`} data-word-count>{count}/{MAX_WORDS} slov</span>
        <Button data-save-slide disabled={!writable || busy || count > MAX_WORDS || !current.trim() || !changed} onClick={saveText} type="button">Uložit slide</Button>
      </div>
      {count > MAX_WORDS ? <p className="text-xs text-[var(--admin-destructive)]">Zkraťte text na {MAX_WORDS} slov.</p> : null}
      <p className="text-xs leading-relaxed text-[var(--admin-foreground-muted)]">Jedna myšlenka na slide. Náhled a export se aktualizují po uložení textu.</p>
      {changed ? <p role="status" className="text-xs text-[var(--admin-warning)]">Text má neuložené změny.</p> : null}
    </div> : null}
    {tab === "design" ? <div className="grid gap-5" data-fine-tune>
      <fieldset disabled={busy} className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Doladit</legend>
        <div className="grid gap-2"><p className="text-xs text-[var(--admin-foreground-muted)]">Barevná varianta</p><div className="flex gap-2">
          <button type="button" className={chipClass(!recipe.accentSwap && recipe.variant === "A")} aria-pressed={!recipe.accentSwap && recipe.variant === "A"} onClick={() => change({ variant: "A", accentSwap: false })}>A</button>
          <button type="button" className={chipClass(recipe.accentSwap || recipe.variant === "B")} aria-pressed={recipe.accentSwap || recipe.variant === "B"} onClick={() => change({ variant: "B", accentSwap: true })}>B</button>
        </div></div>
        <div className="grid gap-2"><p className="text-xs text-[var(--admin-foreground-muted)]">Fotografie</p><div className="flex flex-wrap gap-2">
          {TREATMENTS.map((entry) => <button key={entry.id} type="button" className={chipClass(recipe.treatment === entry.id)} aria-pressed={recipe.treatment === entry.id} onClick={() => change({ treatment: entry.id })}>{entry.label}</button>)}
        </div></div>
        <div className="grid gap-2"><p className="text-xs text-[var(--admin-foreground-muted)]">Velikost písma</p><div className="flex gap-2">
          {SCALES.map((scale) => <button key={scale} type="button" className={chipClass(recipe.typeScale === scale)} aria-pressed={recipe.typeScale === scale} onClick={() => change({ typeScale: scale })}>{Math.round(scale * 100)} %</button>)}
        </div></div>
      </fieldset>
      <details className="text-xs"><summary className="admin-focus-ring cursor-pointer py-2 text-[var(--admin-foreground-muted)]">Starší vzhledy</summary>
        <div className="mt-2 flex flex-wrap gap-2" data-legacy-families>{LEGACY_FAMILIES.map((family) => <button key={family} type="button" disabled={busy} data-family={family} className={chipClass(recipe.family === family)} aria-pressed={recipe.family === family} onClick={() => change({ family })}>{family}</button>)}</div>
      </details>
      <div className="grid gap-2 border-t border-[var(--admin-border)] pt-4" data-presets>
        {presets.map((preset) => <button key={preset.id} type="button" disabled={busy} className={chipClass(false)} onClick={() => change({ family: preset.family, variant: preset.variant, accentSwap: preset.accentSwap, treatment: preset.treatment, typeScale: preset.typeScale })}>{preset.name}{preset.status === "draft" ? " · koncept" : ""}</button>)}
        <AdminLabel htmlFor={`preset-${article.id}`}>Uložit vlastní preset</AdminLabel>
        <AdminInput id={`preset-${article.id}`} disabled={!writable || busy} value={presetName} placeholder="Např. Týdenní přehled" onChange={(event) => setPresetName(event.target.value)} />
        <Button type="button" data-save-preset disabled={!writable || busy || presetName.trim().length < 2} onClick={() => savePreset(presetName)} variant="secondary">Uložit preset</Button>
      </div>
    </div> : null}
    {tab === "canva" ? <div className="grid gap-4" data-canva-handoff>
      <div><h4 className="font-semibold">Pokračovat v Canvě</h4><p className="mt-2 text-sm leading-relaxed text-[var(--admin-foreground-muted)]">Zkopírujte zadání s texty všech slidů, rozměry a kreditem fotografie. Vložte ho do chatu s připojenou Canvou.</p></div>
      <CopySocialText text={canvaBrief(article, recipe, format, texts)} />
      <a className="admin-focus-ring flex min-h-11 items-center gap-2 text-sm underline underline-offset-4" href="https://www.canva.com/instagram-posts/templates/carousel/" target="_blank" rel="noopener noreferrer">Inspirace pro karusely <ExternalLink aria-hidden="true" className="size-3.5" /></a>
      <p className="text-xs leading-relaxed text-[var(--admin-foreground-muted)]">Zadání obsahuje aktuální texty včetně neuložených úprav. Změny v Canvě se sem automaticky nepřenášejí.</p>
    </div> : null}
  </aside>;
}
