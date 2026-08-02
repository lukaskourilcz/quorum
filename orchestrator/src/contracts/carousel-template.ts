import {
  CarouselTemplateSchema,
  TemplateReferenceSchema,
  type TemplateReference
} from "@boardlessai/carousel-studio";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";

export { CarouselTemplateSchema };

export const LiveTemplateReferenceSchema = TemplateReferenceSchema.superRefine((reference, context) => {
  try {
    resolveLiveCarouselTemplate(reference.template_id, reference.version);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Social visual must reference a live template",
      path: ["template_id"]
    });
  }
});

export type LiveTemplateReference = TemplateReference;
