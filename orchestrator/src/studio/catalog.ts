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
      // Stored templates are council proposals, which stay v1 (lifecycle.ts). A v2 file here was
      // not written by the council, and its required photographs would fail the render later.
      if (template.schemaVersion !== "carousel-template/1") {
        throw new Error(`Carousel template ${templateId}@${version} is ${template.schemaVersion}; stored templates must be carousel-template/1`);
      }
      return template;
    } catch (stateError) {
      if (stateError instanceof Error && !/ENOENT/.test(stateError.message)) throw stateError;
      throw seedError;
    }
  }
}
