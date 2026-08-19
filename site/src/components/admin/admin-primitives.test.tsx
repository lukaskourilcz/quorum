import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminLabel,
  AdminMetric,
  AdminPageHeader,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion,
} from "./admin-primitives";
import { Panel, Tile } from "./panel";

describe("Admin design primitives", () => {
  it("renders headings, cards and controls against semantic Admin tokens", () => {
    const html = renderToStaticMarkup(
      <>
        <AdminPageHeader description="Current operating state" eyebrow="Portfolio" title="Admin" />
        <AdminCard>
          <AdminLabel htmlFor="venture">Venture</AdminLabel>
          <AdminInput id="venture" placeholder="Choose a venture" />
          <AdminButton variant="primary">Review</AdminButton>
        </AdminCard>
      </>,
    );

    expect(html).toContain("<h1");
    expect(html).toContain('for="venture"');
    expect(html).toContain('id="venture"');
    expect(html).toContain('type="button"');
    expect(html).toContain("var(--admin-primary)");
    expect(html).toContain("admin-focus-ring");
  });

  it("clamps metrics and communicates state without colour alone", () => {
    const html = renderToStaticMarkup(
      <>
        <AdminMetric label="Completion" progress={140} value="14/10" />
        <AdminStatusBadge tone="warning">Owner review</AdminStatusBadge>
      </>,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("Owner review");
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("lucide-circle");
  });

  it("gives horizontally scrollable tables a named keyboard region", () => {
    const html = renderToStaticMarkup(
      <AdminTableRegion label="Venture evidence">
        <AdminTable>
          <thead><tr><AdminTableHead>Venture</AdminTableHead></tr></thead>
          <tbody><tr><AdminTableCell>Quorum</AdminTableCell></tr></tbody>
        </AdminTable>
      </AdminTableRegion>,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Venture evidence"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("<th");
  });

  it("names operational states independently of colour", () => {
    const html = renderToStaticMarkup(
      <>
        <AdminStateMessage state="write-disabled" title="Saving is unavailable" />
        <AdminStateMessage state="malformed" title="One record could not be read" />
        <AdminStateMessage state="filtered-empty" title="No records match this view" />
      </>,
    );

    expect(html).toContain('data-admin-state="write-disabled"');
    expect(html).toContain('data-admin-state="malformed"');
    expect(html).toContain('data-admin-state="filtered-empty"');
    expect(html).toContain("Read only");
    expect(html).toContain("Unreadable record");
    expect(html).toContain("No matches");
  });

  it("keeps empty states and legacy wrappers on the shared foundation", () => {
    const html = renderToStaticMarkup(
      <>
        <AdminEmptyState description="No evidence has been captured." title="No evidence" />
        <Panel note="Read only" title="Operating state">Body</Panel>
        <Tile brand="var(--admin-information)" foot="Evidence held" label="Coverage" percent={50} value="1/2" />
      </>,
    );

    expect(html).toContain("No evidence has been captured.");
    expect(html).toContain("Operating state");
    expect(html).toContain("--admin-section-accent:var(--admin-information)");
    expect(html).toContain("var(--admin-surface)");
  });

  it("rejects raw colour literals in the production Admin foundation", async () => {
    const files = ["admin-primitives.tsx", "admin-overlays.tsx", "panel.tsx"];

    for (const file of files) {
      const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/(?:\[#|["']#)[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(source, file).not.toMatch(/(?:bg|border|text)-(?:black|white|slate|gray|zinc|red|green|amber|blue)-/);
    }
  });
});

describe("shared overlay extension points", () => {
  it("preserves public defaults while Admin wrappers remain opt-in", async () => {
    const dialog = await readFile(new URL("../ui/dialog.tsx", import.meta.url), "utf8");
    const tooltip = await readFile(new URL("../ui/tooltip.tsx", import.meta.url), "utf8");

    expect(dialog).toContain("bg-[rgba(6,6,8,.78)]");
    expect(dialog).toContain("classNames?.surface");
    expect(tooltip).toContain("bg-[#101013]");
    expect(tooltip).toContain("bubbleClassName");
  });
});
