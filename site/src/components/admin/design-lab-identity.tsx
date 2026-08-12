import type { DesignLabVenture } from "@/lib/design-lab-ventures";

/**
 * The identity a venture's carousels are actually drawn with.
 *
 * These are the same tokens the export and deck routes hand the renderer, not a description of
 * them, so what this panel shows is what the next render comes out in. Choosing a design used to
 * mean guessing the palette; the point of putting it above the workspace is that the guess stops.
 *
 * The swatch prints its own hex in the foreground colour the brand pairs with that ground, so the
 * chip demonstrates the pairing rather than asserting it. The type samples are set in the three
 * families themselves for the same reason — a font named in a monospace list tells you nothing
 * about how the headline will sit.
 */

const LABEL = "font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

function Swatch({ token, value, foreground }: { token: string; value: string; foreground: string }) {
  return (
    <li className="flex flex-col gap-1">
      <span
        className="flex h-14 items-end rounded-md border border-[var(--border)] px-2 pb-1.5"
        style={{ backgroundColor: value, color: foreground }}
      >
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">{value}</span>
      </span>
      <span className={LABEL}>{token}</span>
    </li>
  );
}

export function DesignLabIdentity({ venture }: { venture: DesignLabVenture }) {
  const foreground = venture.swatches.find((swatch) => swatch.token === "foreground")?.value ?? "#ffffff";
  const samples = [
    { role: "headline", family: venture.fonts.headline, sample: venture.logoText, className: "text-[length:var(--text-d4)]" },
    { role: "body", family: venture.fonts.body, sample: "Jeden fakt na obrazovku, zdroj nablízku.", className: "text-sm" },
    { role: "mono", family: venture.fonts.mono, sample: "recipe · variant B · 1.1×", className: "text-xs" }
  ];

  return (
    <section className="grid gap-6 rounded-lg border border-[var(--border)] p-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-3">
        <h3 className={LABEL}>Barvy značky</h3>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {venture.swatches.map((swatch) => (
            <Swatch key={swatch.token} token={swatch.token} value={swatch.value} foreground={foreground} />
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className={LABEL}>Písma</h3>
        <dl className="flex flex-col gap-3">
          {samples.map((sample) => (
            <div key={sample.role} className="flex flex-col gap-0.5">
              <dt className={LABEL}>
                {sample.role} · {sample.family}
              </dt>
              <dd
                className={`truncate text-[var(--card-foreground)] ${sample.className}`}
                style={{ fontFamily: `"${sample.family}", system-ui, sans-serif` }}
              >
                {sample.sample}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
