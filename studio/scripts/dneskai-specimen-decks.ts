import sharp from 'sharp';
import type { DneskaiSlideInput, DneskaiImageInput } from '../src/dneskai-slide.js';

/** Invented Czech copy and synthetic pictures only. These fixtures prove rendering, not news or performance.
 * The accepted ADR's six deck lengths sum to 24 slides, despite its prose saying 26. We render the six
 * specified decks without inventing two additional slides. Text-only opens on a statement; the low-res
 * cover must be visibly refused. Other kits wait for their approved visual design.
 */
export const SPECIMEN_PHOTO_SIZES=[[1600,1200],[1200,1500],[1000,700],[1200,630],[800,800]] as const;
export async function syntheticAbstractPhoto(width:number,height:number,seed:number):Promise<Buffer>{
 let state=seed>>>0;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
 const discs=Array.from({length:14},()=>`<circle cx="${Math.round(random()*width)}" cy="${Math.round(random()*height)}" r="${Math.round((.04+random()*.16)*width)}" fill="hsl(${Math.round(random()*360)},48%,68%)" opacity="0.45"/>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#405d7b"/><stop offset="1" stop-color="#c8b7a3"/></linearGradient></defs><path fill="url(#g)" d="M0 0H${width}V${height}H0Z"/>${discs}</svg>`;
 return sharp(Buffer.from(svg)).blur(12).jpeg({quality:88}).toBuffer();
}
export type SpecimenSlide=Omit<DneskaiSlideInput,'position'|'images'> & {images?:Array<Omit<DneskaiImageInput,'bytes'> & {photo:number}>};
export type SpecimenDeck={id:string;slides:readonly SpecimenSlide[]};
const image=(photo:number,slot='image-1',fit:'cover'|'contain'='cover')=>({slot,photo,crop:{focal:{x:.5,y:.5},fit}});
const source=(photos:number[]):SpecimenSlide=>({type:'sources',sources:['Laboratoř Z: smyšlené oznámení Modelu X (příklad).','Firma Y: smyšlený popis testu (příklad).'],images:photos.map((p,i)=>image(p,`image-${i+1}`,'contain'))});
const longHeadline='Laboratoř Z představila Model X: jeho nové možnosti zatím popisuje pouze vlastní smyšlený test (příklad)';
const note='Tento text je vymyšlený pro kontrolu sazby. Firma Y popisuje možnosti Modelu X a redakce v příkladu čeká na nezávislé ověření. Nejde o skutečnou zprávu ani měření.';
const statement=(variant:'accent'|'ink'='accent'):SpecimenSlide=>({type:'statement',variant,headline:'Model X je jen smyšlený příklad.',body:'Výsledek zatím nikdo nezávisle neověřil (příklad).'});
export const DNESKAI_SPECIMEN_DECKS:readonly SpecimenDeck[]=[
 {id:'photo-rich',slides:[
  {type:'cover-photo',headline:longHeadline,kicker:'Smyšlená zpráva',credit:'Obrázek: syntetický příklad',images:[image(0)]},
  {type:'figure',headline:'Celý obrázek zůstává v rámu.',body:note,credit:'Syntetický příklad',images:[image(2,'image-1','contain')]},
  {type:'split',headline:'Co firma Y tvrdí o novém modelu',body:note,kicker:'Příklad',credit:'Syntetický příklad',images:[image(1)]},
  {type:'figure',headline:'Výřez stejného smyšleného podkladu',body:note,credit:'Syntetický příklad',images:[{...image(4),crop:{focal:{x:.3,y:.6},zoom:1.3,fit:'cover'}}]},
  statement(),{type:'split',headline:'Dva obrázky a jejich vysvětlení',body:note,kicker:'Příklad',credit:'Syntetický příklad',images:[image(2),image(4,'image-2')]},source([0,2,1])]},
 {id:'single-photo',slides:[
  {type:'cover-photo',headline:longHeadline,kicker:'Příklad',credit:'Syntetický příklad',images:[image(1)]},
  {type:'figure',headline:'Stejný obrázek, jiný výřez.',body:note,credit:'Syntetický příklad',images:[{...image(1),crop:{focal:{x:.3,y:.6},fit:'cover'}}]},
  statement('ink'),{type:'split',headline:'Obrázek v rámu vedle textu',body:note,kicker:'Příklad',credit:'Syntetický příklad',images:[image(1,'image-1','contain')]},source([1])]},
 {id:'text-only',slides:[statement(),statement('ink'),{...statement(),headline:'Firma Y popsala nový postup, redakce čeká na ověření jeho přínosu v praxi. Vše v této ukázce je smyšlené a slouží pouze ke kontrole typografie a sazby (příklad).',body:note},statement('ink'),source([])]},
 {id:'low-res',slides:[{type:'cover-photo',headline:'Malý obrázek nemůže vyplnit titulní slide.',credit:'Syntetický příklad',images:[image(3)]},
  {type:'figure',headline:longHeadline,body:note,credit:'Syntetický příklad',images:[image(3,'image-1','contain')]},
  {type:'split',headline:'Menší obrázek vedle vysvětlení',body:note,kicker:'Příklad',credit:'Syntetický příklad',images:[image(3,'image-1','contain')]},statement(),source([3])]},
 {id:'single-photo-post',slides:[{type:'single',variant:'photo',headline:longHeadline,body:'Firma Y jej teprve ověřuje (příklad).',kicker:'Příklad',credit:'Syntetický příklad',images:[{...image(1),crop:{focal:{x:.5,y:.8},fit:'cover'}}]}]},
 {id:'single-type-post',slides:[{type:'single',variant:'type',headline:longHeadline+' právě dnes',body:note,kicker:'Smyšlený příklad',credit:'Zdroj: smyšlená laboratoř Z'}]}
];
/**
 * A cover with its second photograph, for the kits whose cover declares the optional `image-2`
 * (`DNESKAI_OPTIONAL_IMAGE_SLOTS`): the spotlight's ringed inset. Kept out of the six decks above
 * so the other kits' sheets do not change.
 */
export const DNESKAI_SPECIMEN_INSET_DECK:SpecimenDeck={id:'cover-inset',slides:[
 {type:'cover-photo',headline:'Laboratoř Z ukázala Model X před rokem a dnes (příklad).',images:[image(0),image(4,'image-2')]}]};
export function materializeSpecimenDeck(deck:SpecimenDeck,photos:readonly Buffer[]):DneskaiSlideInput[]{
 return deck.slides.map(({images,...slide},index)=>({...slide,position:{index,count:deck.slides.length},...(images?{images:images.map(({photo,...image})=>({...image,bytes:photos[photo]!}))}:{})}));
}
