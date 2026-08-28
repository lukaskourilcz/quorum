import { AdminCallout } from "./admin-primitives";
import { DesignLabIdentity } from "@/components/admin/design-lab-identity";
import { DesignLabWorkspace } from "@/components/admin/design-lab-workspace";
import type { DesignLabSection, DesignLabVenture } from "@/lib/design-lab-ventures";
import { WebDevSignalDesignLab } from "@/components/admin/webdev-signal-design-lab";

/**
 * One venture's Design Lab: who it is, then what the desk has proposed for it.
 *
 * The identity comes first deliberately. The workspace below it is a set of choices about a
 * design, and every one of those choices resolves against the palette and the three typefaces
 * above — reading them in the other order is what made picking a family feel like a guess.
 */

const CHIP = "font-mono text-[0.65625rem] uppercase tracking-[0.12em]";

export function DesignLabSectionNav({
  sections,
  selected
}: {
  sections: DesignLabSection[];
  selected: string;
}) {
  return (
    <nav aria-label="Design Lab ventures" className="w-full overflow-x-auto" data-horizontal-scroll>
      <ul className="flex gap-2">
        {sections.map((section) => {
          const on = section.id === selected;
          // The chip carries the venture's own accent, so the nav is the first place the identity
          // shows and the sections stay told apart by colour rather than by reading order.
          return (
            <li key={section.id}>
              <a
                aria-current={on ? "page" : undefined}
                className={`admin-focus-ring flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-full border px-3 transition md:min-h-[var(--admin-control-height)] ${CHIP} ${
                  on
                    ? "text-[var(--admin-foreground)]"
                    : "border-[var(--admin-border)] text-[var(--admin-foreground-muted)] hover:text-[var(--admin-foreground)]"
                }`}
                href={`/admin?venture=design-lab&tab=studio&brand=${section.id}`}
                style={on ? { borderColor: section.accent } : undefined}
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: section.accent }} />
                {section.name}
                <span className="text-[var(--admin-foreground-muted)]">
                  {section.publishesArticles ? section.articleCount : section.presetCount}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesignLabVentureSection({ venture }: { venture: DesignLabVenture }) {
  return (
    <div className="grid min-w-0 gap-4">
      <DesignLabIdentity venture={venture} />
      {venture.webDevRenders ? (
        <WebDevSignalDesignLab snapshot={venture.webDevRenders} />
      ) : venture.publishesArticles ? (
        <DesignLabWorkspace articles={venture.articles} presets={venture.presets} />
      ) : (
        // Three ventures do not deliver articles at all, and the workspace's own empty state would
        // read as "nothing has been written yet" — which is a different, fixable thing. Saying
        // which kind of empty this is keeps the section from looking broken.
        <AdminCallout tone="information">
          {venture.name} nevydává články, takže tu zatím nejsou návrhy z redakce. Paleta, písma a{" "}
          {venture.presetCount === 1 ? "jedna nevázaná šablona" : `${venture.presetCount} nevázaných šablon`} výše
          platí pro každý karusel, který se pro tuhle značku vykreslí.
        </AdminCallout>
      )}
    </div>
  );
}
