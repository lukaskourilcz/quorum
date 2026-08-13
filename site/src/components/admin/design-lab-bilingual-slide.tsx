import { Callout } from "@/components/ui/callout";
import type { TehdejsiDesignLabPack } from "@/lib/tehdejsi-design-lab";

/** Read-only paired copy for the dedicated bilingual family; generic recipes have one text slot. */
export function DesignLabBilingualSlide({ pack, slide }: { pack: TehdejsiDesignLabPack | null; slide: number }) {
  if (!pack) {
    return <Callout tone="warning">Schválený dvojjazyčný balíček chybí nebo nemá úplné licenční údaje. Náhled ani export se nevytvoří.</Callout>;
  }
  const content = pack.slides[slide];
  if (!content) return <Callout tone="warning">Tento slide v balíčku chybí.</Callout>;
  return (
    <div className="grid min-w-0 gap-3" data-bilingual-family>
      <Callout tone="accent">
        Pevná dvojjazyčná rodina drží češtinu a ukrajinštinu pohromadě. Text se mění a znovu schvaluje na redakčním stole; jednojazyčné recepty a presety tu neplatí.
      </Callout>
      <section className="rounded-[var(--radius-button)] border border-[var(--border)] p-3">
        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">CS · slide {slide + 1}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground)]">{content.cs}</p>
      </section>
      <section className="rounded-[var(--radius-button)] border border-[var(--border)] p-3" lang="uk">
        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">UA · слайд {slide + 1}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground)]">{content.ua}</p>
      </section>
    </div>
  );
}
