import {binarySTL} from './engine.mjs';
const enc=new TextEncoder();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const f=x=>Number(x.toFixed(3));
function path(polys,height,offset=[0,0]){
  return polys.map(p=>p.map((v,i)=>`${i?'L':'M'}${f(v[0]+offset[0])},${f(height-v[1]-offset[1])}`).join(' ')+'Z').join(' ');
}
export function assemblySVG(d,labels=true){
  const {config:c,cells,palette,tiles}=d;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}mm" height="${c.height}mm" viewBox="0 0 ${c.width} ${c.height}"><title>Kumiko assembly map</title><defs><clipPath id="interior"><rect x="${c.border}" y="${c.border}" width="${c.width-2*c.border}" height="${c.height-2*c.border}"/></clipPath></defs><rect width="${c.width}" height="${c.height}" fill="#f5f1e8"/><rect x="${c.border/2}" y="${c.border/2}" width="${c.width-c.border}" height="${c.height-c.border}" fill="none" stroke="${c.frameColor}" stroke-width="${c.border}"/>`;
  for(const cell of cells){
    svg+=`<path d="${path([cell.outline],c.height)}" fill="none" stroke="${c.frameColor}" stroke-width="${c.gridWidth}" stroke-linejoin="round"/>`;
    if(cell.insertContours)svg+=`<path d="${path(cell.insertContours,c.height)}" fill="${palette[cell.color]}" fill-rule="nonzero"/>`;
    if(cell.displaySegments)svg+=`<path d="${cell.displaySegments.map(([a,b])=>`M${f(a[0])},${f(c.height-a[1])}L${f(b[0])},${f(c.height-b[1])}`).join(' ')}" fill="none" stroke="${c.frameColor}" stroke-width="${c.stripWidth}" stroke-linecap="square" clip-path="url(#interior)"/>`;
    if(labels)svg+=`<text x="${f(cell.centroid[0])}" y="${f(c.height-cell.centroid[1])}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.max(1.2,Math.min(2,c.cellSize/11))}" fill="#131b25" stroke="#fff" stroke-width="0.45" paint-order="stroke">${cell.id.slice(1)}</text>`;
  }
  if(tiles.length>1)for(const t of tiles){
    if(c.mode==='fused'){const rail=Math.max(c.gridWidth,c.stripWidth);svg+=`<rect x="${f(t.x+rail/2)}" y="${f(c.height-t.y-t.height+rail/2)}" width="${f(t.width-rail)}" height="${f(t.height-rail)}" fill="none" stroke="${c.frameColor}" stroke-width="${rail}"/>`;}
    svg+=`<rect x="${f(t.x)}" y="${f(c.height-t.y-t.height)}" width="${f(t.width)}" height="${f(t.height)}" fill="none" stroke="#16796e" stroke-width="0.35" stroke-dasharray="2 1"/><text x="${f(t.x+3)}" y="${f(c.height-t.y-t.height+3)}" font-family="sans-serif" font-size="2.2" fill="#16796e">${t.id}</text>`;
  }
  return svg+'</svg>';
}
export function plateSVG(d,plate){
  const height=plate.height+6,width=plate.width+6;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><title>${escape(plate.filename)}</title><rect width="${width}" height="${height}" fill="#fff"/>`;
  for(const item of plate.items){
    const cell=d.cells.find(c=>c.id===item.id);
    svg+=`<path d="${path(cell.insertContours,height,[item.offset[0]+3,item.offset[1]+3])}" fill="${d.palette[plate.color]}" fill-rule="nonzero"/>`;
    svg+=`<text x="${f(item.x+3+item.width/2)}" y="${f(height-item.y-3-item.height/2)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="1.8" fill="#101a22" stroke="#fff" stroke-width="0.5" paint-order="stroke">${item.id.slice(1)}</text>`;
  }
  return svg+'</svg>';
}
export function printGuide(d){
  const c=d.config;
  const fit=d.parts.some(p=>p.filename==='fit_test.stl');
  return `KUMIKO STUDIO — PRINT & ASSEMBLY\n\nPanel: ${c.width} × ${c.height} × ${c.depth} mm\nMode: ${c.mode}\nCell edge: ${c.cellSize} mm · Grid: ${c.gridWidth} mm · Motif: ${c.stripWidth} mm\nPrinter bed: ${c.bedWidth} × ${c.bedHeight} mm · Reserved margin: ${c.margin} mm each side\nSTL coordinates and dimensions are in MILLIMETRES. Import at 100% scale.\n\n${c.mode==='modular'?`${fit?'1. PRINT fit_test.stl FIRST. It contains a triangle frame and a separate ring.':'1. Test one frame tile and one insert first. The full-size coupon does not fit this bed.'}\n   Insert the test piece from the top: it should rest on the ledge and sit flush.\n   Clearance is ${c.clearance} mm PER SIDE. Adjust clearance in the app if needed.\n2. Print every frame/*.stl once in your frame filament. The ledge side is\n   already on the bed (Z=0). Print flat, with supports off.\n3. Print every inserts/plate_*.stl ONCE in the corresponding filament color.\n   Each file already contains the required quantity of separate inserts.\n   Keep the layout and rotation to use the matching maps/plate_*.svg. If your\n   slicer rearranges objects, preserve the identities yourself.\n4. Lay out frame tiles according to assembly.svg. R01 is the TOP row, C01\n   the LEFT column. Frame files use local bottom-left coordinates, without\n   mirroring. Glue butt seams on a flat, protected surface and let them cure.\n5. Use assembly.svg and maps/plate_*.svg to put each numbered insert into its\n   matching opening. Insert from the front, onto the built-in ledge. A small\n   amount of adhesive on the ledge secures loose inserts. This is a glue-fit\n   decorative assembly, not a snap-lock or traditional wooden strip kit.\n   The displayed numbers are map labels; they are not embossed into the STLs.\n`:`1. Print every panels/*.stl ONCE. All lattice and motif intersections have\n   been unioned into each tile. Print flat, supports off.\n2. Arrange tiles using assembly.svg: R01 is the TOP row and C01 the LEFT.\n   Glue any butt seams on a flat surface. There are no loose inserts in this mode.\n`}${c.backing?`\nBACKING\nPrint every backing/*.stl once. These are separate ${c.backingThickness} mm plates,\nnot fused into the lattice. Glue behind the matching tiles if desired.\n`:'\nNo solid backing was requested. The lattice remains open.\n'}\nSUGGESTED STARTING POINT\n0.2 mm layers, at least three perimeters, 100% infill for narrow members.\nUse normal PLA or PETG and a clean bed. A brim may help small inserts; ensure\nseparate objects remain separable. Printer calibration determines the fit.\n\nFILAMENT PALETTE (suggested colors, not embedded STL materials)\nFrame: ${c.frameColor}\n${d.palette.map((p,i)=>`Color ${i+1}: ${p}`).join('\n')}\nSTL does not carry color. Assign the filament in your slicer.\nApproximate fully dense PLA: ${d.stats.plaGrams.toFixed(1)} g (excludes fit coupon).\n\nEXPORT CONTENTS\nassembly.svg: numbered cell and tile placement map; open in a browser and zoom.\nmaps/plate_*.svg: exact print layout and cell IDs.\nmanifest.json: parameters, part dimensions/volumes, palette and placements.\nNozzle clearance and extrusion tolerance must be checked with a test print.\n\nNOTES\n${d.warnings.length?d.warnings.map(w=>'- '+w).join('\n'):'No design warnings.'}\n\nAll conversion was performed locally.\n`;
}
export function exportFiles(d){
  const files=d.parts.map(p=>({name:p.filename,data:binarySTL(p.mesh,`Kumiko Studio ${p.filename}`)}));
  const manifest={format:'kumiko-studio-print-set',version:1,units:'mm',axes:'X right, Y up, Z front; origin bottom-left',config:d.config,palette:d.palette,stats:d.stats,warnings:d.warnings,tiles:d.tiles,
    cells:d.cells.map(({insertContours,feature,...c})=>c),
    parts:d.parts.map(({mesh,...p})=>({...p,triangles:mesh.triangles,volumeMm3:mesh.volume,bounds:mesh.bounds})),plates:d.plates};
  files.push({name:'manifest.json',data:enc.encode(JSON.stringify(manifest,null,2))},{name:'assembly.svg',data:enc.encode(assemblySVG(d))},{name:'PRINT_AND_ASSEMBLY.txt',data:enc.encode(printGuide(d))});
  for(let i=0;i<d.plates.length;i++)files.push({name:`maps/plate_${String(i+1).padStart(3,'0')}.svg`,data:enc.encode(plateSVG(d,d.plates[i]))});
  return files;
}
// ZIP "store" method: no platform tools required, UTF-8 names and CRC-32.
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;crcTable[i]=n>>>0;}
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zipFiles(files){
  const chunks=[],central=[];let offset=0;
  for(const file of files){
    if(file.name.includes('..')||file.name.startsWith('/'))throw new Error('Invalid ZIP filename.');
    const name=enc.encode(file.name),data=file.data,crc=crc32(data);
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,0x21,true);
    l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
    const cd=new Uint8Array(46+name.length),v=new DataView(cd.buffer);
    v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);
    v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);cd.set(name,46);
    chunks.push(local,data);central.push(cd);offset+=local.length+data.length;
  }
  const cdLength=central.reduce((s,p)=>s+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cdLength,true);e.setUint32(16,offset,true);
  const output=new Uint8Array(offset+cdLength+22);let i=0;for(const p of [...chunks,...central,end]){output.set(p,i);i+=p.length;}
  return output;
}
