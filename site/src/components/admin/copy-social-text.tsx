"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { AdminButton } from "./admin-primitives";

export function CopySocialText({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "blocked">("idle");

  function copyWithSelection(): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Clipboard write timed out")), 750);
        })
      ]);
    } catch {
      if (!copyWithSelection()) {
        setStatus("blocked");
        window.setTimeout(() => setStatus("idle"), 4_000);
        return;
      }
    }
    setStatus("copied");
    window.setTimeout(() => setStatus("idle"), 4_000);
  }

  return (
    <AdminButton
      aria-live="polite"
      onClick={copy}
      type="button"
      variant="secondary"
    >
      {status === "copied" ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
      {status === "copied" ? "Copied" : status === "blocked" ? "Copy blocked" : "Copy"}
    </AdminButton>
  );
}
