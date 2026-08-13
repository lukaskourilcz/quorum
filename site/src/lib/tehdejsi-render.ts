import {
  CAROUSEL_BRANDS,
  CarouselPayloadSchema,
  tehdejsiCsSlot,
  tehdejsiDeckTemplate,
  tehdejsiPhotoIssues,
  tehdejsiUaSlot,
  TEHDEJSI_ATTRIBUTION_SLOT,
  TEHDEJSI_CHIP_SLOT,
  TEHDEJSI_EYEBROW_SLOT,
  TEHDEJSI_PHOTO_SLOT,
  type CarouselFormat
} from "@boardlessai/carousel-studio";
import type { TehdejsiDesignLabPack } from "./tehdejsi-design-lab";

/** Expected policy refusal: the package cannot render without its recorded licensed-media facts. */
export class TehdejsiRenderRefusal extends Error {}

/** The approved TS pack turned into the dedicated family input used by preview and export. */
export function tehdejsiRenderInput(
  pack: TehdejsiDesignLabPack,
  format: CarouselFormat,
  photoPng: Buffer | null
) {
  const strings: Record<string, string> = {
    [TEHDEJSI_EYEBROW_SLOT]: "Rodinná paměť · Родинна памʼять",
    [TEHDEJSI_CHIP_SLOT]: `${pack.date.slice(0, 4)} · Tehdejší svět`,
    [TEHDEJSI_ATTRIBUTION_SLOT]: pack.photo?.attribution ?? ""
  };
  pack.slides.forEach((slide, index) => {
    strings[tehdejsiCsSlot(index)] = slide.cs;
    strings[tehdejsiUaSlot(index)] = slide.ua;
  });
  const issues = tehdejsiPhotoIssues({
    strings,
    hasPhoto: photoPng !== null,
    licence: pack.photo?.licence ?? null
  });
  if (photoPng && !pack.photo) throw new TehdejsiRenderRefusal("A TS photo has no recorded media reference.");
  if (issues.length > 0) throw new TehdejsiRenderRefusal(issues.map(({ detail }) => detail).join(" "));
  return {
    template: tehdejsiDeckTemplate(pack.slides.length),
    payload: CarouselPayloadSchema.parse({ locale: "cs", strings }),
    brand: CAROUSEL_BRANDS["tehdejsi-svet"],
    format,
    ...(photoPng ? { images: { [TEHDEJSI_PHOTO_SLOT]: photoPng } } : {})
  };
}
