import { Download } from "lucide-react";
import { AdminStateMessage, AdminStatusBadge } from "./admin-primitives";
import { DesignLabSwatchTile } from "./design-lab-identity";
import type { BrandKitAssetView, BrandKitSnapshot, BrandKitView } from "@/lib/admin-design-lab-brand";

/**
 * The Design Lab's Brand tab: each venture's approved logo files and the rules that come with them.
 *
 * Every logo is shown on the ground its spec names, because a logo judged on the wrong ground is
 * judged wrongly. The files are the kit's own, served through the admin route that re-checks their
 * hashes, so what the owner downloads here is byte for byte what the studio draws from.
 */

const LABEL = "font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]";
const CARD = "grid gap-5 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-[var(--admin-card-padding)]";
const CHIP = "inline-flex items-center rounded-full border border-[var(--admin-border)] px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--admin-foreground-muted)]";

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

function AssetTile({ asset }: { asset: BrandKitAssetView }) {
  const wide = asset.kind === "logotype" || asset.kind === "lockup" || asset.kind === "share-card";
  return (
    <li className="flex min-w-0 flex-col gap-2" data-brand-asset={asset.role}>
      <div
        className="flex h-32 items-center justify-center rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-5"
        style={{ backgroundColor: asset.previewGround }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an admin-only, auth-gated SVG; next/image would proxy and re-encode it */}
        <img alt={asset.label} className={wide ? "max-h-12 w-auto max-w-full" : "max-h-24 w-auto max-w-full"} src={asset.href} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-foreground)]">{asset.label}</p>
        <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{asset.use}</p>
        <div className="flex flex-wrap gap-1">
          {asset.grounds.map((ground) => <span key={ground} className={CHIP}>on {ground}</span>)}
          {asset.onPhoto ? <span className={CHIP}>on photo / solid colour</span> : null}
          {asset.minimumSize ? <span className={CHIP}>min {asset.minimumSize}</span> : null}
          {asset.pixels ? <span className={CHIP}>{asset.pixels} px</span> : null}
          {asset.logoSlot ? <span className={CHIP}>drawn in carousels</span> : null}
        </div>
        <p className="m-0 truncate font-mono text-[0.625rem] text-[var(--admin-foreground-muted)]" title={`sha256 ${asset.sha256}`}>
          {asset.file} · {kb(asset.bytes)} · {asset.sha256.slice(0, 12)}
        </p>
        <a
          className="admin-focus-ring inline-flex w-fit items-center gap-1.5 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] hover:underline"
          download={asset.file}
          href={asset.downloadHref}
        >
          <Download aria-hidden className="size-3.5" />
          Download {asset.mediaType === "image/png" ? "PNG" : "SVG"}
        </a>
      </div>
    </li>
  );
}

/** The primary logotype inside its clear space, drawn to the kit's own ratio. */
function ClearSpaceFigure({ kit }: { kit: BrandKitView }) {
  const primary = kit.assets.find((asset) => asset.logoSlot) ?? kit.assets.find((asset) => asset.kind === "logotype" || asset.kind === "lockup");
  if (!primary || !kit.logotype || kit.logotype.clearSpacePercent === null) return null;
  const logoHeight = 40;
  const pad = (logoHeight * kit.logotype.clearSpacePercent) / 100;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="flex w-fit rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-4" style={{ backgroundColor: primary.previewGround }}>
        <div className="border border-dashed border-[var(--admin-foreground-muted)]" style={{ padding: pad }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- same reason as the asset tiles */}
          <img alt="" src={primary.href} style={{ height: logoHeight, width: "auto", display: "block" }} />
        </div>
      </div>
      <figcaption className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
        Dashed line: clear space of {kit.logotype.clearSpacePercent} % of the logo height on every side.
      </figcaption>
    </figure>
  );
}

function RuleList({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-brand-rules={testId}>
      <h4 className={LABEL}>{title}</h4>
      <ul className="m-0 grid list-disc gap-1 pl-5 text-[length:var(--admin-type-body)] text-[var(--admin-foreground)]">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ReadyKit({ kit }: { kit: BrandKitView }) {
  const logos = kit.assets.filter((asset) => asset.kind === "logotype" || asset.kind === "lockup");
  const others = kit.assets.filter((asset) => !logos.includes(asset));
  return (
    <>
      <div className="flex flex-col gap-3">
        <h4 className={LABEL}>Logo</h4>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {logos.map((asset) => <AssetTile asset={asset} key={asset.role} />)}
        </ul>
      </div>
      {others.length ? (
        <div className="flex flex-col gap-3">
          <h4 className={LABEL}>Marks, icons and share cards</h4>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
            {others.map((asset) => <AssetTile asset={asset} key={asset.role} />)}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <h4 className={LABEL}>Colours</h4>
        <div className="grid gap-4 md:grid-cols-2">
          {kit.palettes.map((palette) => (
            <div className="flex flex-col gap-2" key={palette.id}>
              <p className="m-0 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">
                {palette.label}
                {palette.grounds.length ? <span className="font-normal text-[var(--admin-foreground-muted)]"> · on {palette.grounds.join(", ")}</span> : null}
              </p>
              <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4">
                {palette.colors.map((color) => <DesignLabSwatchTile key={`${color.role}-${color.value}`} token={color.role} value={color.value} />)}
              </ul>
            </div>
          ))}
        </div>
        {kit.carouselPalette.length ? (
          <div className="flex flex-col gap-2" data-brand-carousel-palette>
            <p className="m-0 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">Carousel tokens the studio renders with</p>
            <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4 lg:grid-cols-7">
              {kit.carouselPalette.map((entry) => <DesignLabSwatchTile key={entry.token} token={entry.token} value={entry.value} />)}
            </ul>
            <ul className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
              {kit.carouselPalette.map((entry) => <li key={entry.token}><span className="font-mono">{entry.token}</span>: {entry.source}</li>)}
            </ul>
          </div>
        ) : (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
            The studio does not render with this kit&apos;s colours yet.
          </p>
        )}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h4 className={LABEL}>Size and clear space</h4>
          {kit.logotype ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[length:var(--admin-type-body)]">
              <dt className="text-[var(--admin-foreground-muted)]">Aspect ratio</dt>
              <dd className="m-0 text-[var(--admin-foreground)]">{kit.logotype.aspectRatio} : 1 (viewBox {kit.logotype.viewBox})</dd>
              <dt className="text-[var(--admin-foreground-muted)]">Clear space</dt>
              <dd className="m-0 text-[var(--admin-foreground)]">{kit.logotype.clearSpaceBasis}</dd>
              {kit.logotype.minimumHeightPx !== null ? (
                <>
                  <dt className="text-[var(--admin-foreground-muted)]">Minimum height</dt>
                  <dd className="m-0 text-[var(--admin-foreground)]">{kit.logotype.minimumHeightPx} px</dd>
                </>
              ) : null}
              {kit.logotype.sizes.map((size) => (
                <div className="contents" key={size.place}>
                  <dt className="text-[var(--admin-foreground-muted)]">{size.place}</dt>
                  <dd className="m-0 text-[var(--admin-foreground)]">{size.size}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ClearSpaceFigure kit={kit} />
        </div>
        <div className="flex flex-col gap-4">
          <RuleList items={kit.rules} testId="rules" title="Rules" />
          <RuleList items={kit.doNots} testId="do-nots" title="Do not" />
          <RuleList items={kit.socialRules} testId="social" title="Social posts" />
          <RuleList items={kit.typography} testId="typography" title="Typography" />
        </div>
      </div>
    </>
  );
}

function KitSection({ kit }: { kit: BrandKitView }) {
  return (
    <section aria-labelledby={`brand-kit-${kit.venture}`} className={CARD} data-brand-kit={kit.venture} data-brand-kit-status={kit.status}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]" id={`brand-kit-${kit.venture}`}>{kit.name}</h3>
          {kit.status === "ready" ? <AdminStatusBadge tone="success">Approved {kit.approvedOn}</AdminStatusBadge> : null}
          {kit.status === "ready" ? (
            <AdminStatusBadge tone={kit.drawnByStudio ? "information" : "neutral"}>
              {kit.drawnByStudio ? "Carousels draw this logo" : "Reference only in carousels"}
            </AdminStatusBadge>
          ) : null}
        </div>
        {kit.source ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]" data-brand-provenance>
            Source: {kit.source.summary} · rules from {kit.source.documents.join(", ")}
          </p>
        ) : null}
      </header>
      {kit.status === "ready" ? <ReadyKit kit={kit} /> : null}
      {kit.status === "pending" ? (
        <AdminStateMessage
          description={`No logo or brand system has been dropped into studio/brand-kits/${kit.venture}/ yet. Nothing is invented in the meantime; carousels keep the current wordmark.`}
          state="initial-empty"
          title="Brand kit pending"
        />
      ) : null}
      {kit.status === "unavailable" ? (
        <AdminStateMessage
          description={
            <span className="grid gap-1">
              <span>The kit is not used until this is fixed:</span>
              {kit.problems.map((problem) => <span key={problem}>{problem}</span>)}
            </span>
          }
          state="malformed"
          title="Brand kit unavailable"
        />
      ) : null}
    </section>
  );
}

export function DesignLabBrandPanel({ snapshot }: { snapshot: BrandKitSnapshot }) {
  if (snapshot.kits.length === 0) {
    return (
      <AdminStateMessage
        description="No running venture has a brand kit in studio/brand-kits yet."
        state="initial-empty"
        title="No brand kits"
      />
    );
  }
  return (
    <div className="grid min-w-0 gap-4" data-design-lab-brand>
      {snapshot.kits.map((kit) => <KitSection key={kit.venture} kit={kit} />)}
    </div>
  );
}
