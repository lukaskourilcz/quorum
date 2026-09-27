/**
 * A venture's brand kit manifest, published as a contract.
 *
 * The schema lives in `studio/src/brand-kit.ts`, beside the renderer that draws the logotype, and
 * is re-exported here the way `carousel-layout-review.ts` re-exports the review schema: the studio
 * owns the shape and the orchestrator publishes it.
 */
import { BrandKitManifestSchema } from "@boardlessai/carousel-studio";

export { BrandKitManifestSchema };
