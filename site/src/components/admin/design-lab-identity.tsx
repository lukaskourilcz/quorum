import type { DesignLabVenture } from "@/lib/design-lab-ventures";

/**
 * The identity a venture's carousels are actually drawn with.
 *
 * These are the same tokens the export and deck routes hand the renderer, not a description of
 * them, so what this panel shows is what the next render comes out in. Choosing a design used to
 * mean guessing the palette; the point of putting it above the workspace is that the guess stops.
 *
 * The swatch prints its own hex in whichever neutral has WCAG AA contrast against that colour.
 * The type samples are set in the three families themselves for the same reason — a font named in
 * a monospace list tells you nothing about how the headline will sit.
 */

const LABEL = "font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]";

function swatchText(value: string): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return "var(--admin-swatch-on-light)";

  const linear = (channel: string) => {
    const srgb = Number.parseInt(channel, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(match[1]!) + 0.7152 * linear(match[2]!) + 0.0722 * linear(match[3]!);
  return luminance > 0.179 ? "var(--admin-swatch-on-light)" : "var(--admin-swatch-on-dark)";
}

function Swatch({ token, value }: { token: string; value: string }) {
  return (
    <li className="flex flex-col gap-1">
      <span
        className="flex h-14 items-end rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-2 pb-1.5"
        style={{ backgroundColor: value, color: swatchText(value) }}
      >
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">{value}</span>
      </span>
      <span className={LABEL}>{token}</span>
    </li>
  );
}

export function DesignLabIdentity({ venture }: { venture: DesignLabVenture }) {
  const samples = [
    { role: "headline", family: venture.fonts.headline, sample: venture.logoText, className: "text-[length:var(--text-d4)]" },
    { role: "body", family: venture.fonts.body, sample: "Jeden fakt na obrazovku, zdroj nablízku.", className: "text-sm" },
    { role: "mono", family: venture.fonts.mono, sample: "recipe · variant B · 1.1×", className: "text-xs" }
  ];

  return (
    <section className="grid gap-5 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-[var(--admin-card-padding)] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-3">
        <h3 className={LABEL}>Barvy značky</h3>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {venture.swatches.map((swatch) => (
            <Swatch key={swatch.token} token={swatch.token} value={swatch.value} />
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
                className={`truncate text-[var(--admin-foreground)] ${sample.className}`}
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
