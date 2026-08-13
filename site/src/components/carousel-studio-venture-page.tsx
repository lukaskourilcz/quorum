import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Layers3, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { readPublicCarouselStudio } from "@/lib/carousel-studio";

function preview(templateId: string, version: string, brand: string, format: string, slide = 1): string {
  return `/api/carousel-studio/preview/${templateId}/${version}/${brand}/${format}/${slide}`;
}

export async function CarouselStudioVenturePage() {
  const snapshot = readPublicCarouselStudio();
  const live = snapshot.templates.filter((entry) => entry.template.status === "live");
  const showcase = live.find((entry) => entry.template.id === "cover-cta") ?? live[0];
  return (
    <PageShell>
      <article>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/ventures"><ArrowLeft aria-hidden="true" className="size-4" />All projects</Link>
          <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8"><div className="flex flex-wrap gap-2"><Badge tone="accent">Project 006</Badge><Badge>{live.length} live templates</Badge></div><h1 className="mt-7 text-[clamp(3.5rem,9vw,8rem)] font-semibold leading-[0.84] tracking-[-0.075em]">Carousel<br />Studio<span className="text-[var(--accent)]">.</span></h1></div>
            <div className="md:col-span-4"><p className="text-lg leading-8 text-[var(--muted-foreground)]">One checked layout engine gives DNESKAi, MMA Files and Titty Tuesdays their own visual voice—without an image model or a second design system.</p></div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]"><div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] md:grid-cols-3">{[
          ["Deterministic", "The same saved template, text and brand tokens produce the same bytes."],
          ["Original", "External links become cited text observations, never copied layouts or stored images."],
          ["No meetings", "Rendering costs $0 in API calls. This is an engine, not a room: nothing here waits for a meeting to decide anything."]
        ].map(([title, body]) => <div className="bg-[var(--card)] p-7 md:p-9" key={title}><CheckCircle2 aria-hidden="true" className="size-5 text-[var(--accent)]" /><h2 className="mt-8 text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--fog)]">{body}</p></div>)}</div></section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28" id="templates"><div className="grid gap-8 md:grid-cols-12"><div className="md:col-span-4"><Badge>Live library</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">{live.length} layouts. {snapshot.brands.length} distinct skins.</h2><p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">Every candidate passed schema, safe-area, contrast, brand-token, overflow and originality checks across Instagram and Threads formats.</p></div><div className="grid gap-5 md:col-span-8 sm:grid-cols-2">{live.map((entry) => <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]" key={`${entry.template.id}@${entry.template.version}`}><div className="grid grid-cols-3 bg-[var(--surface-raised)]">{snapshot.brands.map((brand) => <Image alt={`${entry.template.name} preview in the ${brand.name} brand skin`} className="h-auto w-full" data-carousel-preview height={1080} key={brand.id} loading="lazy" sizes="(max-width: 640px) 30vw, 160px" src={preview(entry.template.id, entry.template.version, brand.id, "instagram-square")} unoptimized width={1080} />)}</div><div className="p-5"><div className="flex flex-wrap gap-2"><Badge tone="success">live</Badge><Badge>{entry.template.slides.length} slide{entry.template.slides.length === 1 ? "" : "s"}</Badge></div><h3 className="mt-4 text-xl font-semibold">{entry.template.name}</h3><p className="mt-2 text-sm leading-6 text-[var(--fog)]">{entry.template.description}</p></div></section>)}</div></div></section>

        {showcase ? <section className="bg-[var(--graphite)] text-[var(--snow)]" id="socials"><div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28"><div className="grid gap-8 md:grid-cols-12 md:items-end"><div className="md:col-span-7"><Badge tone="dark">Socials showcase</Badge><h2 className="mt-5 text-5xl font-semibold tracking-[-0.06em]">One content packet, ready for both channels.</h2></div><p className="md:col-span-5 text-sm leading-7 text-[var(--ash)]">These are fixture previews, not published posts. A live venture selects the template ID, version and text payload; the renderer applies its brand tokens at the last step.</p></div><div className="mt-12 grid gap-6 lg:grid-cols-3">{snapshot.brands.map((brand) => <section className="rounded-[var(--radius-card)] border border-[var(--iron)] bg-[var(--obsidian)] p-4" key={brand.id}><div className="mb-4 flex items-center gap-2"><Layers3 aria-hidden="true" className="size-4 text-[var(--accent)]" /><h3 className="font-semibold">{brand.name}</h3></div><div className="grid grid-cols-2 gap-2">{showcase.template.slides.map((slide, index) => <Image alt={`${brand.name} Instagram showcase slide ${index + 1}`} className="h-auto w-full rounded-sm bg-[var(--surface-raised)]" data-carousel-preview height={1350} key={slide.id} loading="lazy" sizes="(max-width: 1024px) 42vw, 180px" src={preview(showcase.template.id, showcase.template.version, brand.id, "instagram-portrait", index + 1)} unoptimized width={1080} />)}</div><div className="mt-4 rounded-[var(--radius-button)] border border-[var(--iron)] p-4"><p className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--ash)]">Threads companion</p><p className="mt-3 text-sm leading-6 text-[var(--snow)]">A saved caption and the same checked story can render as a square Threads frame without inventing another visual brief.</p></div></section>)}</div></div></section> : null}

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28"><div className="grid gap-6 md:grid-cols-2"><Callout tone="accent"><ShieldCheck aria-hidden="true" className="mb-4 size-5" /><strong>Lifecycle:</strong> proposal → deterministic checks → live. A version can return to draft or be deprecated, but history is never deleted.</Callout><Callout><LockKeyhole aria-hidden="true" className="mb-4 size-5" /><strong>No visitor analytics:</strong> this gallery reads committed templates and fixture previews only. It does not collect reader or engagement data.</Callout></div></section>
      </article>
    </PageShell>
  );
}
