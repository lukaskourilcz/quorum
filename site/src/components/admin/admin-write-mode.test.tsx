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

  it("leaves save controls available when the server provisioned a writer", () => {
    const html = renderToStaticMarkup(<AdminWriteProvider enabled><SaveControl /></AdminWriteProvider>);

    expect(html).not.toContain("disabled");
  });
});
