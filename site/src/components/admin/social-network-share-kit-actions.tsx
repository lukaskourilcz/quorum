"use client";

import { useState } from "react";
import type { SocialShareKitRecord } from "@/lib/social-profiles/network-model";
import { AdminButton } from "./admin-primitives";

export function SocialNetworkShareKitActions({ kit }: { kit: SocialShareKitRecord }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${kit.factualSummary}\n\n${kit.link}\n\n${kit.disclosure}`);
      setMessage("Share-kit text copied.");
    } catch {
      setMessage("Clipboard access is unavailable. Use the download instead.");
    }
  };
  const download = () => {
    const blob = new Blob([`${JSON.stringify(kit, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${kit.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Share kit downloaded. Sending remains manual.");
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-social-network-kit-actions>
      <AdminButton onClick={copy} variant="secondary">Copy kit</AdminButton>
      <AdminButton onClick={download} variant="secondary">Download JSON</AdminButton>
      {message ? <span aria-live="polite" className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]" role="status">{message}</span> : null}
    </div>
  );
}
