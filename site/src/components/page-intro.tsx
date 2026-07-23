import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function PageIntro({
  eyebrow,
  title,
  description,
  aside
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <section className="mx-auto grid max-w-[var(--container)] gap-8 px-5 pb-12 pt-14 md:grid-cols-12 md:px-8 md:pb-18 md:pt-20">
      <div className="md:col-span-8">
        <Badge>{eyebrow}</Badge>
        <h1 className="mt-6 text-[clamp(3rem,7vw,6.8rem)] font-semibold leading-[0.9] tracking-[-0.065em]">
          {title}
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)] md:text-xl">
          {description}
        </p>
      </div>
      {aside ? (
        <aside className="self-end md:col-span-4">{aside}</aside>
      ) : null}
    </section>
  );
}
