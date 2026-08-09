/**
 * The small inline control, in one place.
 *
 * Three buttons across the office walkthrough and the admin shell were the same idea written
 * three times at three sizes — 7.5px, 7.5px and 10px — and all three rendered at 16px, because an
 * unlayered `font: inherit` reset in globals.css beat every size utility on every button on the
 * site. With that fixed, the three declarations would have become three different small sizes;
 * this is the one they share instead, so the next change to it lands everywhere at once.
 */
export const MICRO_CONTROL =
  "inline-flex items-center gap-1 rounded-sm border border-[#3f3f46] px-1.5 py-0.5"
  + " font-mono text-[10px] uppercase leading-[1.4] tracking-[0.06em] text-[#d4d4d8]"
  + " transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5]";
