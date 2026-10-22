import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { fontFiles } from '../src/fonts.js';
import { renderDneskaiSlide, DNESKAI_KITS, dneskaiKit, type DneskaiKitId } from '../src/dneskai-slide.js';
import { DNESKAI_SPECIMEN_DECKS, SPECIMEN_PHOTO_SIZES, materializeSpecimenDeck, syntheticAbstractPhoto } from './dneskai-specimen-decks.js';

const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const raster=(svg:string)=>new Resvg(svg,{font:{fontFiles:fontFiles(),loadSystemFonts:false}}).render().asPng();
export function refusalTile(label:string,codes:readonly string[]):Buffer{
 return raster(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><pattern id="h" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 24L24 0" stroke="#efefec" stroke-width="8"/></pattern></defs><path fill="#fff" d="M0 0H1080V1350H0Z"/><path fill="url(#h)" d="M0 0H1080V1350H0Z"/><text x="72" y="180" fill="#2f5ae6" font-family="IBM Plex Mono" font-size="28">${escape(label)}</text>${codes.map((code,i)=>`<text x="72" y="${260+i*48}" fill="#14161a" font-family="IBM Plex Mono" font-size="25">${escape(code)}</text>`).join('')}</svg>`);
}
export function sheetLayout(count:number){
 const columns=5,width=360,height=450,label=36,gap=24,rows=Math.ceil(count/columns);
 return {width:columns*width+(columns+1)*gap,height:rows*(height+label)+(rows+1)*gap,rows,tiles:Array.from({length:count},(_,i)=>({left:gap+(i%columns)*(width+gap),top:gap+Math.floor(i/columns)*(height+label+gap)}))};
}
export async function renderSpecimens(options:{kits?:readonly string[];photos?:string;out?:string}={}){
 const ids=options.kits??[...DNESKAI_KITS.keys()];
 // Validate every kit before writing an artifact.
 for(const id of ids)if(!dneskaiKit(id))throw new Error(`Unimplemented specimen kit ${id}`);
 const out=path.resolve(options.out??path.join(import.meta.dirname,'../../docs/design-lab/dneskai-kits'));
 let names:string[],photos:Buffer[];
 if(options.photos){
  const directory=path.resolve(options.photos);names=(await readdir(directory)).filter(n=>/\.jpe?g$/i.test(n)).sort();
  if(!names.length)throw new Error('The photos directory has no JPEG files');
  const selected=SPECIMEN_PHOTO_SIZES.map((_,i)=>names[i%names.length]!);photos=await Promise.all(selected.map(n=>readFile(path.join(directory,n))));names=selected;
 }else{names=SPECIMEN_PHOTO_SIZES.map((_,i)=>`synthetic-${i+1}`);photos=await Promise.all(SPECIMEN_PHOTO_SIZES.map(([w,h],i)=>syntheticAbstractPhoto(w,h,41+i)));}
 await mkdir(out,{recursive:true});
 for(const id of ids){
  const kit=dneskaiKit(id)!,directory=path.join(out,id);await mkdir(directory,{recursive:true});
  const tiles:Buffer[]=[],receipts=[];
  for(const deck of DNESKAI_SPECIMEN_DECKS){
   const slides=materializeSpecimenDeck(deck,photos);
   for(const [index,slide] of slides.entries()){
    const result=await renderDneskaiSlide({...slide,kit:id as DneskaiKitId});
    const codes=result.problems.filter(p=>p.blocking).map(p=>p.code);
    const label=`${deck.id} ${index+1} ${slide.type}`,png=result.png??refusalTile(kit.label+' · '+label,codes);
    const name=`${deck.id}-${String(index+1).padStart(2,'0')}-${slide.type}.png`;await writeFile(path.join(directory,name),png);
    const caption=`${label}${codes.length?' '+codes.join(','):result.truncatedSlots.length?' clipped':''}`;
    const strip=raster(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="36"><rect width="360" height="36" fill="#d9d9d6"/><text x="2" y="23" fill="#14161a" font-family="IBM Plex Mono" font-size="10">${escape(caption)}</text></svg>`);
    tiles.push(await sharp({create:{width:360,height:486,channels:3,background:'#d9d9d6'}}).composite([{input:await sharp(png).resize(360,450,{kernel:'lanczos3'}).toBuffer(),top:0,left:0},{input:strip,top:450,left:0}]).png().toBuffer());
    receipts.push({deck:deck.id,index,type:slide.type,template:result.template,look:kit.look,pngHash:result.pngHash,tileHash:createHash('sha256').update(png).digest('hex'),truncatedSlots:result.truncatedSlots,problems:result.problems.map(({code,field,blocking})=>({code,field,blocking})),photos:deck.slides[index]!.images?.map(image=>({slot:image.slot,file:names[image.photo]}))??[]});
   }
  }
  const layout=sheetLayout(tiles.length);const sheet=await sharp({create:{width:layout.width,height:layout.height,channels:3,background:'#d9d9d6'}}).composite(tiles.map((input,i)=>({input,...layout.tiles[i]!}))).png().toBuffer();
  await writeFile(path.join(out,`${id}.png`),sheet);await writeFile(path.join(out,`${id}.json`),JSON.stringify({fixture:true,kit:id,look:kit.look,tileCount:tiles.length,layout,slides:receipts},null,2)+'\n');
  process.stdout.write(`${id}: ${tiles.length} tiles, ${layout.width} × ${layout.height}, ${out}\n`);
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options:{kits?:string[];photos?:string;out?:string}={};
 while(args.length){const key=args.shift(),value=args.shift();if(!value)throw new Error(`Missing value for ${key}`);if(key==='--kits')options.kits=value.split(',');else if(key==='--photos')options.photos=value;else if(key==='--out')options.out=value;else throw new Error(`Unknown option ${key}`);}
 await renderSpecimens(options);
}
