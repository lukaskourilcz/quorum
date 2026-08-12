import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminFileBrowser, ownerFacingFileContent } from "./admin-file-browser";

describe("AdminFileBrowser owner-facing copy", () => {
  it("keeps an internal metrics switch in the source while translating the rendered view", () => {
    const source = "D9 remains closed with `METRICS_INGESTION_ENABLED=false`.";

    expect(source).toContain("METRICS_INGESTION_ENABLED=false");
    expect(ownerFacingFileContent(source)).toBe(
      "D9 remains closed with `automated metric collection stays turned off`."
    );

    const html = renderToStaticMarkup(
      <AdminFileBrowser files={[{ name: "Things only you can approve", size: "1 KB", content: source }]} />
    );
    expect(html).not.toContain("METRICS_INGESTION_ENABLED");
    expect(html).toContain("automated metric collection stays turned off");
  });
});
