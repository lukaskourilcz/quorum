import type { ReactNode } from "react";
export function SectionHeading({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 grid items-end gap-6 md:grid-cols-12">
      <div className="md:col-span-8">
        <p className="mono-label text-[var(--accent)]">{eyebrow}</p>
        <h2 className="mt-5 text-[clamp(2.2rem,4.6vw,3.8rem)] font-semibold leading-none tracking-[-0.055em]">
          {title}
        </h2>
        {description ? (
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--fog)] md:text-[1.03125rem]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex md:col-span-4 md:justify-end">{action}</div>
      ) : null}
    </div>
  );
}
