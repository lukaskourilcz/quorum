import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The thumbnail of the newest article a magazine room delivered, served from this origin.
 *
 * The image is already in this repository: a delivered package carries its own thumbnail bytes,
 * which is what the magazine publishes as its preview image. Serving them here rather than
 * pointing at the magazine's copy is what lets the Facilities card show it at all — the site's
 * content-security policy allows images from `'self'`, and widening a security header so a
 * decorative thumbnail can load would be the wrong trade entirely.
 *
 * It also means the card needs no network call to another site, and shows exactly the bytes that
 * were delivered rather than whatever is being served there now.
 */

export const dynamic = "force-static";

const VENTURES = ["caught-up", "mma-files"] as const;
type Venture = (typeof VENTURES)[number];
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  svg: "image/svg+xml; charset=utf-8",
  webp: "image/webp"
};

export function generateStaticParams() {
  return VENTURES.map((venture) => ({ venture }));
}

function stateRoot(): string {
  return path.join(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."), "state");
}

async function readJson(...segments: string[]): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path.join(...segments), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The newest package a venture delivered, or `null` when it has delivered nothing. */
async function newestPackage(venture: Venture): Promise<Record<string, unknown> | null> {
  const directory = venture === "caught-up"
    ? path.join(stateRoot(), "edition", "archive")
    : path.join(stateRoot(), "ventures", "mma-files", "articles");
  let names: string[] = [];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
  } catch {
    return null;
  }
  const newest = names[0];
  return newest ? readJson(directory, newest) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ venture: string }> }
) {
  const { venture } = await params;
  if (!VENTURES.includes(venture as Venture)) return new Response(null, { status: 404 });

  const pkg = await newestPackage(venture as Venture);
  const image = pkg?.image as { thumb_bytes_base64?: unknown; thumb_path?: unknown } | undefined;
  const encoded = image?.thumb_bytes_base64;
  const extension = typeof image?.thumb_path === "string"
    ? /\.(png|svg|webp)$/u.exec(image.thumb_path)?.[1]
    : undefined;
  if (typeof encoded !== "string" || encoded.length === 0 || !extension) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(Buffer.from(encoded, "base64")), {
    headers: {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": MEDIA_TYPES[extension]!,
      "X-Content-Type-Options": "nosniff",
      // The bytes are immutable for a given delivery, and a new delivery rebuilds the site.
      "Cache-Control": "public, max-age=3600, must-revalidate"
    }
  });
}
