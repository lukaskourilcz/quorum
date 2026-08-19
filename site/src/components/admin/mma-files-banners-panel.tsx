"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminButton,
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { AdminMmaBannerSlot, AdminMmaBanners, AdminMmaBannerSize } from "@/lib/admin-mma-files";

export interface CropWindow { sx: number; sy: number; sw: number; sh: number }
interface BannerNotice { state: "success" | "error"; message: string }

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
  const writesEnabled = useAdminWritesEnabled();
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
  const [notice, setNotice] = useState<BannerNotice | null>(null);
  const target = choices.find((size) => sizeKey(size) === selected) ?? choices[0]!;

  /*
   * The clear runs in a microtask, not in the effect body.
   *
   * Setting state synchronously while an effect is running makes React re-render before it has
   * finished committing, which the lint rule flags as a cascading render — and it made
   * `pnpm -C site lint` fail. Deferring it puts the clear on the same footing as the crop result
   * below, which has always arrived asynchronously, and `live` already guards both against a
   * file that changed while the work was in flight.
   */
  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    if (!file) {
      queueMicrotask(() => {
        if (!live) return;
        setCropped(null);
        setPreview(null);
      });
      return () => { live = false; };
    }
    cropFile(file, target, focusX, focusY).then((blob) => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      setCropped(blob);
      setPreview(objectUrl);
    }).catch(() => { if (live) setNotice({ state: "error", message: "Náhled ořezu se nepodařilo vytvořit." }); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // `target` is derived from `selected` and `choices`; its two dimensions are what the crop
    // actually depends on, so listing them keeps a new object identity from re-cropping on every
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, focusX, focusY, target.height, target.width]);

  async function stage() {
    if (!writesEnabled) return;
    if (!cropped || !file) { setNotice({ state: "error", message: "Nejdřív vyber obrázek a zkontroluj ořez." }); return; }
    setBusy(true); setNotice(null);
    const form = new FormData();
    form.set("slotId", slot.id); form.set("width", String(target.width)); form.set("height", String(target.height));
    form.set("alt", alt); form.set("href", href); form.set("enabled", String(enabled));
    form.set("file", new File([cropped], `${slot.id}-${selected}.webp`, { type: "image/webp" }));
    try {
      const response = await fetch("/admin/api/mma-files/banners", { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Uložení selhalo.");
      setNotice({ state: "success", message: "Ořez je připravený ve stagingu; na webu zatím není." });
      router.refresh();
    } catch (error) { setNotice({ state: "error", message: error instanceof Error ? error.message : "Uložení selhalo." }); }
    finally { setBusy(false); }
  }

  async function toggle() {
    if (!writesEnabled) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/admin/api/mma-files/banners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId: slot.id, enabled: !slot.enabled }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Přepnutí selhalo.");
      setNotice({ state: "success", message: !slot.enabled ? "Slot je připravený jako zapnutý." : "Slot je připravený jako vypnutý." });
      router.refresh();
    } catch (error) { setNotice({ state: "error", message: error instanceof Error ? error.message : "Přepnutí selhalo." }); }
    finally { setBusy(false); }
  }

  const currentSrc = slot.image ? `/admin/api/mma-files/banners/media?src=${encodeURIComponent(slot.image.src)}` : null;
  const fieldId = (name: string) => `${slot.id}-${name}`;
  return (
    <AdminCard>
      <AdminCardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{slot.pages.join(" · ")}</p>
            <h3 className="mt-1 break-all text-[length:var(--admin-type-section)] font-semibold">{slot.id}</h3>
          </div>
          <div className="flex gap-2">
            <AdminStatusBadge tone={slot.enabled ? "success" : "neutral"}>{slot.enabled ? "zapnuto" : "vypnuto"}</AdminStatusBadge>
            {slot.stagedChanged ? <AdminStatusBadge tone="warning">čeká změna</AdminStatusBadge> : null}
          </div>
        </div>
        {currentSrc && slot.image ? (
          <Image alt={slot.alt} className="mt-5 h-auto max-h-64 w-full rounded-[var(--admin-radius)] border border-[var(--admin-border)] object-contain" height={slot.image.height} src={currentSrc} unoptimized width={slot.image.width} />
        ) : (
          <AdminStateMessage className="mt-5" state="initial-empty" title="Žádná kreativa" />
        )}
        <div className="mt-5 grid gap-4">
          <div>
            <AdminLabel htmlFor={fieldId("size")}>Rozměr</AdminLabel>
            <AdminSelect disabled={!writesEnabled} id={fieldId("size")} onChange={(event) => setSelected(event.target.value)} value={selected}>
              {choices.map((size) => <option key={sizeKey(size)} value={sizeKey(size)}>{size.width}×{size.height}</option>)}
            </AdminSelect>
          </div>
          <div>
            <AdminLabel htmlFor={fieldId("image")}>Obrázek</AdminLabel>
            <AdminInput accept="image/jpeg,image/png,image/webp" className="p-2" disabled={!writesEnabled} id={fieldId("image")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
          </div>
          {preview ? <Image alt="Náhled přesného ořezu" className="h-auto w-full rounded-[var(--admin-radius)] border border-[var(--admin-section-accent)] object-contain" height={target.height} src={preview} unoptimized width={target.width} /> : null}
          <div>
            <AdminLabel htmlFor={fieldId("focus-x")}>Vodorovné těžiště ořezu</AdminLabel>
            <input className="admin-focus-ring min-h-[var(--admin-touch-target)] w-full accent-[var(--admin-primary)]" disabled={!writesEnabled} id={fieldId("focus-x")} max="100" min="0" onChange={(event) => setFocusX(Number(event.target.value))} type="range" value={focusX} />
          </div>
          <div>
            <AdminLabel htmlFor={fieldId("focus-y")}>Svislé těžiště ořezu</AdminLabel>
            <input className="admin-focus-ring min-h-[var(--admin-touch-target)] w-full accent-[var(--admin-primary)]" disabled={!writesEnabled} id={fieldId("focus-y")} max="100" min="0" onChange={(event) => setFocusY(Number(event.target.value))} type="range" value={focusY} />
          </div>
          <div>
            <AdminLabel htmlFor={fieldId("alt")}>Alternativní text</AdminLabel>
            <AdminInput disabled={!writesEnabled} id={fieldId("alt")} maxLength={300} onChange={(event) => setAlt(event.target.value)} value={alt} />
          </div>
          <div>
            <AdminLabel htmlFor={fieldId("href")}>Cílový odkaz (HTTPS, nepovinný)</AdminLabel>
            <AdminInput disabled={!writesEnabled} id={fieldId("href")} onChange={(event) => setHref(event.target.value)} type="url" value={href} />
          </div>
          <label className="flex min-h-[var(--admin-touch-target)] items-center gap-2 text-[length:var(--admin-type-control)] font-semibold">
            <input className="admin-focus-ring size-4 accent-[var(--admin-primary)]" checked={enabled} disabled={!writesEnabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
            Po doručení zapnout
          </label>
          <div className="flex flex-wrap gap-3">
            <AdminButton disabled={!writesEnabled || busy || !cropped} onClick={stage} variant="primary">{busy ? "Ukládám…" : "Připravit přesný ořez"}</AdminButton>
            <AdminButton disabled={!writesEnabled || busy || (!slot.image && !slot.enabled)} onClick={toggle} variant="secondary">{slot.enabled ? "Připravit vypnutí" : "Připravit zapnutí"}</AdminButton>
          </div>
          {notice ? <div aria-live="polite" role={notice.state === "error" ? "alert" : "status"}><AdminStateMessage state={notice.state} title={notice.message} /></div> : null}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

export function MmaFilesBannersPanel({ banners }: { banners: AdminMmaBanners }) {
  const writesEnabled = useAdminWritesEnabled();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<BannerNotice | null>(null);
  async function deliver() {
    if (!writesEnabled) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/admin/api/mma-files/banners/deliver", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Doručení se nespustilo.");
      setNotice({ state: "success", message: "Doručení bylo předáno hlídanému workflow." });
    } catch (error) { setNotice({ state: "error", message: error instanceof Error ? error.message : "Doručení se nespustilo." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 grid gap-5">
    <AdminCallout tone={banners.status === "staged" ? "warning" : "neutral"}>Stav kontraktu: {banners.status}. {banners.status === "staged" ? "Změny jsou jen ve stagingu a na magazínu ještě nejsou." : banners.receiptRef ?? "Zatím neexistuje doručenka."}</AdminCallout>
    <div className="flex flex-wrap items-center gap-3"><AdminButton disabled={!writesEnabled || busy || banners.status !== "staged"} onClick={deliver} variant="primary">{busy ? "Spouštím…" : "Doručit"}</AdminButton><p className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Akce spustí pouze ruční delivery-only cestu; nevyrábí nový obsah.</p></div>
    {notice ? <div aria-live="polite" role={notice.state === "error" ? "alert" : "status"}><AdminStateMessage state={notice.state} title={notice.message} /></div> : null}
    {banners.slots.length ? (
      <div className="grid gap-5 lg:grid-cols-2">{banners.slots.map((slot) => <BannerEditor key={slot.id} slot={slot} />)}</div>
    ) : (
      <AdminStateMessage state="initial-empty" title="Nejsou zaznamenané žádné bannerové sloty." />
    )}
  </div>;
}
