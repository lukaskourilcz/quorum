import Link from "next/link";
import type { ReactNode } from "react";
import { fighterHref } from "@/lib/fightaiq-records";
import { cn } from "@/lib/utils";

export function FighterLink({ fighterRef, children, className }: { fighterRef: string; children: ReactNode; className?: string }) {
  const href = fighterHref(fighterRef);
  return href ? <Link className={cn("underline decoration-[var(--border)] underline-offset-4 transition-colors hover:decoration-[var(--accent)]", className)} href={href}>{children}</Link> : <span className={className}>{children}</span>;
}
