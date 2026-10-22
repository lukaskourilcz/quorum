import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPOTLIGHT_KIT } from '../src/dneskai-kits/spotlight.js';
import { DNESKAI_CODE_OWNED_SLOTS, DNESKAI_MAX_THUMBNAILS, DNESKAI_TEMPLATE_ROLES, DNESKAI_TEMPLATE_VARIANTS, DNESKAI_TEXT_LIMITS, dneskaiImageSlots } from '../src/dneskai-kits/contract.js';
import { DneskaiGoldenSchema } from '../src/dneskai-golden.js';
import { renderDneskaiSlide, type DneskaiSlideInput } from '../src/dneskai-slide.js';
import { validateTemplateAsRendered } from '../src/renderer.js';
import { CAROUSEL_BRANDS } from '../src/library.js';
import { syntheticPhoto } from '../src/index.js';
import { SPOTLIGHT_GOLDEN_PATH, spotlightGoldenCases } from '../scripts/dneskai-spotlight-golden.js';

/*
 * The spotlight kit (src/dneskai-kits/spotlight.ts) against the shared DNESKAi contract: the same
 * slots, limits and variants as every kit, the image slots of its own table (the cover's optional
 * second photograph), every template passing the checks as its look draws it, the one-face-per-field
 * tables OwnDashboard reads, the golden renders in golden/dneskai-spotlight.json, and every role
 * rendering at the limits, short and required-only.
 */

const brand = CAROUSEL_BRANDS['caught-up'];

describe('the spotlight kit contract', () => {
  it('implements all fourteen templates under its own prefix', () => {
    expect(SPOTLIGHT_KIT.templates.size).toBe(14);
    for (const id of SPOTLIGHT_KIT.templates.keys()) expect(id).toMatch(/^dneskai-spotlight-/);
    const keys = [...SPOTLIGHT_KIT.roles.entries()].map(([id, role]) => role === 'sources' ? `sources-${id.split('-').at(-1)}` : role);
    expect(new Set(keys)).toEqual(new Set([...DNESKAI_TEMPLATE_ROLES.filter((role) => role !== 'sources'), ...Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, n) => `sources-${n}`)]));
  });

  it('keeps every role slot, limit and variant of the shared tables and the image slots of its own', () => {
    for (const t of SPOTLIGHT_KIT.templates.values()) {
      const role = SPOTLIGHT_KIT.roles.get(t.id)!;
      const text = t.slides[0]!.layers.filter((l) => l.type === 'text');
      // The quotation marks are code-owned and outside the limits table.
      expect(text.filter((l) => l.type === 'text' && l.slot !== 'quote-mark').map((l) => [l.slot, l.maxChars]), t.id).toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot]) => slot !== 'images-label' || !t.id.endsWith('sources-0')));
      expect(text.every((l) => l.type === 'text' && l.keepWithNext === 'cs'), t.id).toBe(true);
      expect(t.slides[0]!.layers.filter((l) => l.type === 'image').map((l) => ({ slot: l.slot, optional: l.optional })), t.id).toEqual(dneskaiImageSlots(role, Number(t.id.match(/sources-(\d)$/)?.[1] ?? 0), 'spotlight'));
      expect(t.slides[0]!.variants.map((v) => v.id), t.id).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
    }
    expect(DNESKAI_CODE_OWNED_SLOTS).toContain('quote-mark');
  });

  it('sets the quotation marks on the quote roles only', () => {
    const marked = [...SPOTLIGHT_KIT.templates.values()].filter((t) => t.slides[0]!.layers.some((l) => l.type === 'text' && l.slot === 'quote-mark')).map((t) => SPOTLIGHT_KIT.roles.get(t.id));
    expect(marked).toEqual(['split', 'split-pair', 'statement']);
  });

  it('passes every template check as the spotlight look draws it', () => {
    for (const t of SPOTLIGHT_KIT.templates.values()) {
      expect(validateTemplateAsRendered(t, brand, 'instagram-portrait', 'spotlight').filter((check) => check.status === 'fail'), t.id).toEqual([]);
    }
  });

  it('keeps the flat rules: colour pictures, an ink shade only over a photograph, square corners, one circle', () => {
    for (const t of SPOTLIGHT_KIT.templates.values()) for (const layer of t.slides[0]!.layers) {
      expect(['mesh', 'linear-gradient'], t.id).not.toContain(layer.type);
      if (layer.type === 'image') {
        expect([layer.treatment, layer.scrim], t.id).toEqual(['none', 'none']);
        if (layer.shade) expect(layer.shade.colorToken, t.id).toBe('background');
        // The ringed disc is the cover's second photograph and nothing else.
        expect(layer.clip === 'circle', t.id).toBe(t.id === 'dneskai-spotlight-cover-photo' && layer.slot === 'image-2');
      }
      if (layer.type === 'shape') expect(layer.radius).toBe(0);
      if (layer.type === 'text') expect(layer.glow).toBe(false);
    }
  });

  it('centres every written field but the sources', () => {
    for (const t of SPOTLIGHT_KIT.templates.values()) for (const layer of t.slides[0]!.layers) {
      if (layer.type !== 'text' || SPOTLIGHT_KIT.roles.get(t.id) === 'sources') continue;
      expect(layer.align, `${t.id} ${layer.slot}`).toBe('middle');
    }
  });

  it('derives one face per field and the fields each slide type places', () => {
    expect(SPOTLIGHT_KIT.fieldFaces).toEqual({
      headline: { family: 'Archivo', weight: 800, uppercase: false }, body: { family: 'Inter', weight: 400, uppercase: false },
      kicker: { family: 'Inter', weight: 700, uppercase: true }, sources: { family: 'Inter', weight: 400, uppercase: false }
    });
    expect(SPOTLIGHT_KIT.placedFields).toEqual({ 'cover-photo': ['headline'], figure: ['headline', 'body'], split: ['headline', 'body', 'kicker'], statement: ['headline', 'body'], sources: ['sources'], single: ['headline'] });
  });
});

describe('the spotlight kit renders', () => {
  let photos: Buffer[];
  beforeAll(async () => { photos = await Promise.all([syntheticPhoto(1_600, 1_200, 31), syntheticPhoto(1_200, 630, 32), syntheticPhoto(900, 1_200, 33)]); });

  it('matches its golden renders, the acceptance deck and the ringed cover, twice equal', async () => {
    const golden = DneskaiGoldenSchema.parse(JSON.parse(readFileSync(SPOTLIGHT_GOLDEN_PATH, 'utf8')));
    const cases = await spotlightGoldenCases();
    const rendered = [];
    for (const { name, input } of cases) {
      const result = await renderDneskaiSlide(input);
      expect(result.status, name).toBe('rendered');
      expect(result.kit).toBe('spotlight');
      rendered.push({ name, templateId: result.template!.id, version: result.template!.version, pngHash: result.pngHash! });
    }
    expect(rendered.slice(0, 7).map((entry) => entry.templateId)).toEqual(['cover-photo', 'figure', 'figure', 'split-pair', 'statement', 'figure', 'sources-4'].map((role) => `dneskai-spotlight-${role}`));
    expect(rendered.at(-1)!.templateId).toBe('dneskai-spotlight-cover-photo');
    expect(rendered).toEqual(golden.entries);
    expect((await renderDneskaiSlide(cases.at(-1)!.input)).pngHash).toBe(rendered.at(-1)!.pngHash);
  }, 240_000);

  const long = (limit: number) => {
    const words = 'Žluťoučký kůň úpěl ďábelské ódy a redakce čeká na nezávislé ověření smyšleného příkladu';
    let out = '';
    while (out.length < limit) out += (out ? ' ' : '') + words;
    return out.slice(0, limit).trimEnd();
  };
  const image = (n: number, photo = n - 1) => ({ slot: `image-${n}`, bytes: photos[photo % photos.length]! });
  const cases = (length: (limit: number) => string | undefined): Array<[string, DneskaiSlideInput]> => {
    const at = { index: 1, count: 5 };
    const f = (role: keyof typeof DNESKAI_TEXT_LIMITS, slot: string) => length(DNESKAI_TEXT_LIMITS[role][slot]!);
    return [
      ['cover-photo', { type: 'cover-photo', position: { index: 0, count: 5 }, headline: f('cover-photo', 'headline')!, images: [image(1)] }],
      ['cover-photo-inset', { type: 'cover-photo', position: { index: 0, count: 5 }, headline: f('cover-photo', 'headline')!, images: [image(1), image(2, 2)] }],
      ['figure', { type: 'figure', position: at, headline: f('figure', 'headline')!, body: f('figure', 'body'), images: [image(1, 1)] }],
      ['split', { type: 'split', position: at, headline: f('split', 'headline')!, body: f('split', 'body'), kicker: f('split', 'kicker'), images: [image(1, 2)] }],
      ['split-pair', { type: 'split', position: at, headline: f('split-pair', 'headline')!, body: f('split-pair', 'body'), kicker: f('split-pair', 'kicker'), images: [image(1), image(2)] }],
      ['statement', { type: 'statement', position: at, headline: f('statement', 'headline')!, body: f('statement', 'body') }],
      ['statement-ink', { type: 'statement', variant: 'ink', position: at, headline: f('statement', 'headline')!, body: f('statement', 'body') }],
      ...Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, n): [string, DneskaiSlideInput] => [`sources-${n}`, { type: 'sources', position: { index: 4, count: 5 }, sources: length(DNESKAI_TEXT_LIMITS.sources['source-1']!) ? Array.from({ length: 4 }, () => length(DNESKAI_TEXT_LIMITS.sources['source-1']!)!) : ['Zdroj'], images: Array.from({ length: n }, (_, i) => image(i + 1)) }]),
      ['single-photo', { type: 'single', variant: 'photo', position: { index: 0, count: 1 }, headline: f('single-photo', 'headline')!, images: [image(1)] }],
      ['single-type', { type: 'single', variant: 'type', position: { index: 0, count: 1 }, headline: f('single-type', 'headline')! }]
    ];
  };

  it.each([
    ['the longest strings', long],
    ['the shortest strings', () => 'Model X'],
    ['the required strings only', () => undefined]
  ] as const)('sets every role with %s, with nothing cut', async (_name, length) => {
    for (const [name, input] of cases((limit) => length(limit) ?? (undefined as never))) {
      const required = { ...input, headline: input.headline ?? 'Model X' } as DneskaiSlideInput;
      const result = await renderDneskaiSlide({ ...(input.type === 'sources' ? input : required), kit: 'spotlight' });
      expect(result.problems.filter((p) => p.code !== 'image-upscaled'), name).toEqual([]);
      expect(result.status, name).toBe('rendered');
      expect(result.truncatedSlots, name).toEqual([]);
    }
  }, 300_000);
});
