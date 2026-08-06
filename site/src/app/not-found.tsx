import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell>
      <section className="mx-auto grid min-h-[65svh] max-w-[var(--container)] content-center px-5 py-20 md:px-8">
        <Badge>Page not found</Badge>
        <h1 className="mt-6 text-[clamp(4rem,12vw,10rem)] font-semibold leading-[0.82] tracking-[-0.08em]">
          Nothing here
          <span className="text-[var(--accent)]">.</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
          The route is unknown or intentionally unavailable. No replacement fact
          was invented.
        </p>
        <Link
          className={`${buttonVariants({ variant: "secondary" })} mt-8 w-fit`}
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return home
        </Link>
      </section>
    </PageShell>
  );
}
