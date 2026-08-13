import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider, useAdminWritesEnabled } from "./admin-write-mode";

function SaveControl() {
  return <button disabled={!useAdminWritesEnabled()} type="button">Save canonical record</button>;
}

describe("admin write mode", () => {
  it("makes save controls inert when a deployment has no canonical writer", () => {
    const html = renderToStaticMarkup(<AdminWriteProvider enabled={false}><SaveControl /></AdminWriteProvider>);

    expect(html).toContain("disabled");
  });

  it("keeps provisioned save controls inert until the client hydrates them", () => {
    const html = renderToStaticMarkup(<AdminWriteProvider enabled><SaveControl /></AdminWriteProvider>);

    expect(html).toContain("disabled");
  });
});
