import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-9 grid items-end gap-6 md:grid-cols-12">
      <div className="md:col-span-8">
        <Badge>{eyebrow}</Badge>
        <h2 className="mt-5 text-[clamp(2.4rem,5vw,4.5rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
          {title}
        </h2>
        {description ? (
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
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
