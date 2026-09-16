/**
 * The Design Lab's layout review record, published as a contract.
 *
 * The schema itself lives in `studio/src/family-review.ts`, beside the registry it validates, and
 * is re-exported here for the same reason `carousel-template.ts` re-exports the template schema:
 * the studio owns the shape, the orchestrator owns the published contract, and writing it twice
 * would be two shapes that disagree the first time one of them changes.
 */
import { FamilyReviewSchema } from "@boardlessai/carousel-studio";

export { FamilyReviewSchema as CarouselLayoutReviewSchema };
