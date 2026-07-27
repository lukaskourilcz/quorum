import type { ReactNode } from "react";
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
    <section className="editorial-grid border-b border-[var(--border)]">
      <div className="relative mx-auto grid max-w-[var(--container)] gap-10 px-5 py-18 md:grid-cols-12 md:px-10 md:py-24">
        <div className="md:col-span-8">
          <p className="mono-label text-[var(--accent)]">{eyebrow}</p>
          <h1 className="mt-6 text-[clamp(3rem,7.4vw,7rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
            {title}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--ash)] md:text-[1.1875rem]">
            {description}
          </p>
        </div>
        {aside ? (
          <aside className="self-end md:col-span-4">{aside}</aside>
        ) : null}
      </div>
    </section>
  );
}
