import { NextResponse } from "next/server";
import { getTittyTuesdaysSnapshot } from "../../../../../lib/titty-tuesdays-records";

export const dynamic = "force-static";

export async function GET() {
  const snapshot = await getTittyTuesdaysSnapshot();
  const products = snapshot.season.products.map((product) => ({
    ventureId: "titty-tuesdays" as const,
    seasonId: "season-001",
    conceptSlug: product.slug,
    name: product.name,
    designNote: product.designDirection,
    publicStatus: "concept" as const,
    artifactVersion: "season-001",
    updatedAt: "2026-08-01T00:00:00.000Z"
  }));
  return NextResponse.json(
    { products },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } }
  );
}
