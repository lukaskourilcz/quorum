import { AdminCallout } from "./admin-primitives";
import type { TehdejsiDesignLabPack } from "@/lib/tehdejsi-design-lab";

/** Read-only paired copy for the dedicated bilingual family; generic recipes have one text slot. */
export function DesignLabBilingualSlide({ pack, slide }: { pack: TehdejsiDesignLabPack | null; slide: number }) {
  if (!pack) {
    return <AdminCallout tone="warning">Schválený dvojjazyčný balíček chybí nebo nemá úplné licenční údaje. Náhled ani export se nevytvoří.</AdminCallout>;
  }
  const content = pack.slides[slide];
  if (!content) return <AdminCallout tone="warning">Tento slide v balíčku chybí.</AdminCallout>;
  return (
    <div className="grid min-w-0 gap-3" data-bilingual-family>
      <AdminCallout tone="information">
        Pevná dvojjazyčná rodina drží češtinu a ukrajinštinu pohromadě. Text se mění a znovu schvaluje na redakčním stole; jednojazyčné recepty a presety tu neplatí.
      </AdminCallout>
      <section className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3">
        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">CS · slide {slide + 1}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--admin-foreground)]">{content.cs}</p>
      </section>
      <section className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" lang="uk">
        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">UA · слайд {slide + 1}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--admin-foreground)]">{content.ua}</p>
      </section>
    </div>
  );
}
