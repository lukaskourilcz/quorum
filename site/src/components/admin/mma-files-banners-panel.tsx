"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminMmaBannerSlot, AdminMmaBanners, AdminMmaBannerSize } from "@/lib/admin-mma-files";

export interface CropWindow { sx: number; sy: number; sw: number; sh: number }

export function sourceCrop(source: AdminMmaBannerSize, target: AdminMmaBannerSize, focusX: number, focusY: number): CropWindow {
  const sourceAspect = source.width / source.height;
  const targetAspect = target.width / target.height;
  if (sourceAspect > targetAspect) {
    const sw = source.height * targetAspect;
    return { sx: (source.width - sw) * focusX / 100, sy: 0, sw, sh: source.height };
  }
  const sh = source.width / targetAspect;
  return { sx: 0, sy: (source.height - sh) * focusY / 100, sw: source.width, sh };
}

async function cropFile(file: File, target: AdminMmaBannerSize, focusX: number, focusY: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    const crop = sourceCrop({ width: bitmap.width, height: bitmap.height }, target, focusX, focusY);
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Crop failed.")), "image/webp", 0.92));
  } finally { bitmap.close(); }
}

function sizes(slot: AdminMmaBannerSlot): AdminMmaBannerSize[] {
  const values = [slot.desktop, ...slot.variants, ...(slot.mobile ? [slot.mobile] : [])];
  return values.filter((size, index) => values.findIndex((candidate) => candidate.width === size.width && candidate.height === size.height) === index);
}

function sizeKey(size: AdminMmaBannerSize): string { return `${size.width}x${size.height}`; }

function BannerEditor({ slot }: { slot: AdminMmaBannerSlot }) {
  const router = useRouter();
  const choices = useMemo(() => sizes(slot), [slot]);
  const initialSize = slot.image ?? choices[0]!;
  const [selected, setSelected] = useState(sizeKey(initialSize));
  const [file, setFile] = useState<File | null>(null);
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [alt, setAlt] = useState(slot.alt);
  const [href, setHref] = useState(slot.href ?? "");
  const [enabled, setEnabled] = useState(slot.enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const target = choices.find((size) => sizeKey(size) === selected) ?? choices[0]!;

  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    if (!file) { setCropped(null); setPreview(null); return; }
    cropFile(file, target, focusX, focusY).then((blob) => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      setCropped(blob);
      setPreview(objectUrl);
    }).catch(() => { if (live) setMessage("Náhled ořezu se nepodařilo vytvořit."); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, focusX, focusY, target.height, target.width]);

  async function stage() {
    if (!cropped || !file) { setMessage("Nejdřív vyber obrázek a zkontroluj ořez."); return; }
    setBusy(true); setMessage(null);
    const form = new FormData();
    form.set("slotId", slot.id); form.set("width", String(target.width)); form.set("height", String(target.height));
    form.set("alt", alt); form.set("href", href); form.set("enabled", String(enabled));
    form.set("file", new File([cropped], `${slot.id}-${selected}.webp`, { type: "image/webp" }));
    try {
      const response = await fetch("/admin/api/mma-files/banners", { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Uložení selhalo.");
      setMessage("Ořez je připravený ve stagingu; na webu zatím není.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Uložení selhalo."); }
    finally { setBusy(false); }
  }

  async function toggle() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/admin/api/mma-files/banners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId: slot.id, enabled: !slot.enabled }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Přepnutí selhalo.");
      setMessage(!slot.enabled ? "Slot je připravený jako zapnutý." : "Slot je připravený jako vypnutý.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Přepnutí selhalo."); }
    finally { setBusy(false); }
  }

  const currentSrc = slot.image ? `/admin/api/mma-files/banners/media?src=${encodeURIComponent(slot.image.src)}` : null;
  return <Card><CardContent>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{slot.pages.join(" · ")}</p><h3 className="mt-2 text-xl font-semibold">{slot.id}</h3></div><div className="flex gap-2"><Badge tone={slot.enabled ? "success" : "neutral"}>{slot.enabled ? "zapnuto" : "vypnuto"}</Badge>{slot.stagedChanged ? <Badge tone="warning">čeká změna</Badge> : null}</div></div>
    {currentSrc && slot.image ? <Image alt={slot.alt} className="mt-5 h-auto max-h-64 w-full rounded-[var(--radius-button)] border border-[var(--border)] object-contain" height={slot.image.height} src={currentSrc} unoptimized width={slot.image.width} /> : <div className="mt-5 grid min-h-32 place-items-center rounded-[var(--radius-button)] border border-dashed border-[var(--border)] text-sm text-[var(--fog)]">Žádná kreativa</div>}
    <div className="mt-5 grid gap-4">
      <label className="grid gap-1 text-sm font-semibold">Rozměr<select className="min-h-11 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" onChange={(event) => setSelected(event.target.value)} value={selected}>{choices.map((size) => <option key={sizeKey(size)} value={sizeKey(size)}>{size.width}×{size.height}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Obrázek<input accept="image/jpeg,image/png,image/webp" className="min-h-11 rounded-[var(--radius-button)] border border-[var(--border)] p-2" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>
      {preview ? <Image alt="Náhled přesného ořezu" className="h-auto w-full rounded-[var(--radius-button)] border border-[var(--accent)] object-contain" height={target.height} src={preview} unoptimized width={target.width} /> : null}
      <label className="grid gap-1 text-sm font-semibold">Vodorovné těžiště ořezu<input aria-label="Vodorovné těžiště ořezu" max="100" min="0" onChange={(event) => setFocusX(Number(event.target.value))} type="range" value={focusX} /></label>
      <label className="grid gap-1 text-sm font-semibold">Svislé těžiště ořezu<input aria-label="Svislé těžiště ořezu" max="100" min="0" onChange={(event) => setFocusY(Number(event.target.value))} type="range" value={focusY} /></label>
      <label className="grid gap-1 text-sm font-semibold">Alternativní text<input className="min-h-11 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" maxLength={300} onChange={(event) => setAlt(event.target.value)} value={alt} /></label>
      <label className="grid gap-1 text-sm font-semibold">Cílový odkaz (HTTPS, nepovinný)<input className="min-h-11 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" onChange={(event) => setHref(event.target.value)} type="url" value={href} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /> Po doručení zapnout</label>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !cropped} onClick={stage}>{busy ? "Ukládám…" : "Připravit přesný ořez"}</Button><Button disabled={busy || (!slot.image && !slot.enabled)} onClick={toggle} variant="secondary">{slot.enabled ? "Připravit vypnutí" : "Připravit zapnutí"}</Button></div>
      {message ? <p aria-live="polite" className="text-sm text-[var(--fog)]">{message}</p> : null}
    </div>
  </CardContent></Card>;
}

export function MmaFilesBannersPanel({ banners }: { banners: AdminMmaBanners }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function deliver() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/admin/api/mma-files/banners/deliver", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Doručení se nespustilo.");
      setMessage("Doručení bylo předáno hlídanému workflow.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Doručení se nespustilo."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 grid gap-5">
    <Callout tone={banners.status === "staged" ? "warning" : "neutral"}>Stav kontraktu: {banners.status}. {banners.status === "staged" ? "Změny jsou jen ve stagingu a na magazínu ještě nejsou." : banners.receiptRef ?? "Zatím neexistuje doručenka."}</Callout>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || banners.status !== "staged"} onClick={deliver}>{busy ? "Spouštím…" : "Doručit"}</Button><p className="text-sm text-[var(--fog)]">Akce spustí pouze ruční delivery-only cestu; nevyrábí nový obsah.</p></div>
    {message ? <p aria-live="polite" className="text-sm text-[var(--fog)]">{message}</p> : null}
    <div className="grid gap-5 lg:grid-cols-2">{banners.slots.map((slot) => <BannerEditor key={slot.id} slot={slot} />)}</div>
  </div>;
}
