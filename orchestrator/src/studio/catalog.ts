import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CarouselTemplateSchema,
  liveTemplateByReference,
  type CarouselTemplate
} from "@boardlessai/carousel-studio";
import { stateRoot } from "../paths.js";

export function resolveLiveCarouselTemplate(
  templateId: string,
  version: string,
  root = stateRoot
): CarouselTemplate {
  try {
    return liveTemplateByReference(templateId, version);
  } catch (seedError) {
    const candidatePath = path.join(
      root,
      "ventures",
      "carousel-studio",
      "templates",
      templateId,
      `${version}.json`
    );
    try {
      const template = CarouselTemplateSchema.parse(
        JSON.parse(readFileSync(candidatePath, "utf8")) as unknown
      );
      if (template.status !== "live") {
        throw new Error(`Carousel template ${templateId}@${version} is ${template.status}, not live`);
      }
      return template;
    } catch (stateError) {
      if (stateError instanceof Error && !/ENOENT/.test(stateError.message)) throw stateError;
      throw seedError;
    }
  }
}
