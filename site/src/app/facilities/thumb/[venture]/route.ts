import {
  latestMagazinePackage,
  packageThumbnail,
  type MagazineVenture
} from "@/lib/latest-magazine-package";

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
 *
 * Which package that is comes from `latestMagazinePackage`, the same resolver the card itself
 * uses. This route once answered the question its own way — newest file in the archive directory —
 * and on a day the desk published nothing that picked the empty no-edition package and answered
 * the card's picture with a 404.
 */

export const dynamic = "force-static";

const VENTURES: readonly MagazineVenture[] = ["caught-up", "mma-files"];

export function generateStaticParams() {
  return VENTURES.map((venture) => ({ venture }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ venture: string }> }
) {
  const { venture } = await params;
  if (!VENTURES.includes(venture as MagazineVenture)) return new Response(null, { status: 404 });

  const newest = await latestMagazinePackage(venture as MagazineVenture);
  const thumbnail = newest ? packageThumbnail(newest.delivered) : null;
  if (!thumbnail) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(Buffer.from(thumbnail.bytes, "base64")), {
    headers: {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": thumbnail.mediaType,
      "X-Content-Type-Options": "nosniff",
      // The bytes are immutable for a given delivery, and a new delivery rebuilds the site.
      "Cache-Control": "public, max-age=3600, must-revalidate"
    }
  });
}
