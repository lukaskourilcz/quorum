"use client";

import { useState } from "react";
import { AdminButton, AdminStateMessage } from "./admin-primitives";

export function SlideImage({ src, alt, ratio, canvas = true }: { src: string; alt: string; ratio: number; canvas?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const url = `${src}${src.includes("?") ? "&" : "?"}attempt=${attempt}`;
  if (failed === url) return canvas
    ? <AdminStateMessage state="error" title="Slide se nevykreslil." action={<AdminButton onClick={() => setAttempt((value) => value + 1)}>Zkusit znovu</AdminButton>} />
    : <span className="flex items-center justify-center p-2 text-xs text-[var(--admin-foreground-muted)]" style={{ aspectRatio: String(ratio) }}>Náhled není dostupný</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={`w-full rounded-lg border border-[var(--admin-border)] transition-opacity ${loaded !== url ? "opacity-40" : "opacity-100"}`}
      {...(canvas ? { "data-slide-canvas": true, fetchPriority: "high" as const } : { "data-look-canvas": true, fetchPriority: "low" as const, loading: "lazy" as const })}
      onError={() => setFailed(url)} onLoad={() => setLoaded(url)} src={url}
      style={{ aspectRatio: String(ratio) }}
    />
  );
}
