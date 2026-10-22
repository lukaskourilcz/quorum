import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { DNESKAI_SPECIMEN_DECKS, DNESKAI_SPECIMEN_INSET_DECK, SPECIMEN_PHOTO_SIZES, materializeSpecimenDeck, syntheticAbstractPhoto } from '../scripts/dneskai-specimen-decks.js';
import { refusalTile, sheetLayout } from '../scripts/dneskai-specimens.js';
import { DNESKAI_KITS, renderDneskaiSlide, validateDneskaiSlide } from '../src/dneskai-slide.js';
let photos:Buffer[];
beforeAll(async()=>{photos=await Promise.all(SPECIMEN_PHOTO_SIZES.map(([w,h],i)=>syntheticAbstractPhoto(w,h,41+i)));});

describe('authentic local DNESKAi specimens',()=>{
 it('covers all six specified decks and their actual 24-slide total',()=>{
  expect(DNESKAI_SPECIMEN_DECKS.map(d=>[d.id,d.slides.length])).toEqual([['photo-rich',7],['single-photo',5],['text-only',5],['low-res',5],['single-photo-post',1],['single-type-post',1]]);
  expect(DNESKAI_SPECIMEN_DECKS.reduce((n,d)=>n+d.slides.length,0)).toBe(24);
 });
 it('validates every implemented kit, except the intentionally undersized cover',async()=>{
  for(const kit of DNESKAI_KITS.keys())for(const deck of DNESKAI_SPECIMEN_DECKS)for(const [index,slide] of materializeSpecimenDeck(deck,photos).entries()){
   // Only a cover that bleeds its photograph is held to the full-bleed resolution rule.
   const bleeds=DNESKAI_KITS.get(kit)!.resolve('cover-photo',undefined,['image-1']).slides[0]!.layers.some(l=>l.type==='image'&&l.x<=0&&l.y<=0&&l.width>=1&&l.height>=1);
   const blocking=(await validateDneskaiSlide({...slide,kit})).filter(p=>p.blocking).map(p=>p.code);
   expect(blocking,`${kit}/${deck.id}/${index}`).toEqual(deck.id==='low-res'&&index===0&&bleeds?['image-low-resolution']:[]);
  }
 },300000);
 it('renders the inset cover only in a kit whose cover takes a second photograph',async()=>{
  const slide=materializeSpecimenDeck(DNESKAI_SPECIMEN_INSET_DECK,photos)[0]!;
  for(const kit of DNESKAI_KITS.keys()){
   const takes=DNESKAI_KITS.get(kit)!.resolve('cover-photo',undefined,['image-1','image-2']).slides[0]!.layers.some(l=>l.type==='image'&&l.slot==='image-2');
   expect((await validateDneskaiSlide({...slide,kit})).filter(p=>p.blocking).map(p=>p.code),kit).toEqual(takes?[]:['image-unexpected']);
  }
  expect([...DNESKAI_KITS.keys()].filter(kit=>DNESKAI_KITS.get(kit)!.resolve('cover-photo',undefined,['image-1']).slides[0]!.layers.some(l=>l.type==='image'&&l.slot==='image-2'))).toEqual(['spotlight']);
 },120000);
 it('puts a dense and short field in each deck without exceeding template limits',()=>{
  const kit=DNESKAI_KITS.get('editorial')!;
  for(const deck of DNESKAI_SPECIMEN_DECKS){
   const lengths=deck.slides.flatMap(slide=>{
    const t=kit.resolve(slide.type,slide.variant,(slide.images??[]).map(i=>i.slot));
    return t.slides[0]!.layers.flatMap(layer=>layer.type==='text'&&layer.slot in slide?[[String(slide[layer.slot as keyof typeof slide]??'').length,layer.maxChars]]:[]);
   });
   expect(lengths.some(([length,max])=>max!-length!>=0&&max!-length!<=10),deck.id).toBe(true);
   // A one-slide post since 22 October 2026 carries its headline alone, so it has no second, short field.
   if(lengths.length>1)expect(lengths.some(([length])=>length!<60),deck.id).toBe(true);
  }
 });
 it('renders a visible refusal PNG and deterministically renders an accepted slide',async()=>{
  const tile=refusalTile('Editorial / low-res',['image-low-resolution']);
  expect(await sharp(tile).metadata()).toMatchObject({width:1080,height:1350,format:'png'});
  expect(tile.equals(refusalTile('Editorial / low-res',['different-code']))).toBe(false);
  const slide=materializeSpecimenDeck(DNESKAI_SPECIMEN_DECKS.at(-1)!,photos)[0]!;
  const first=await renderDneskaiSlide(slide),second=await renderDneskaiSlide(slide);
  expect(first.pngHash).toBe(second.pngHash);expect(first.pngHash).not.toBeNull();
 });
 it('lays 26 tiles in six rows of five and the specified 24 tiles in five rows',()=>{
  const layout=sheetLayout(26);expect(layout.rows).toBe(6);expect(layout.tiles[25]).toEqual({left:24,top:2574});
  expect(sheetLayout(24).rows).toBe(5);expect(sheetLayout(24).width).toBe(1944);
 });
});
