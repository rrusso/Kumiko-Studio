/* Original Kumiko Studio implementation, MIT, Copyright (c) 2026.
 * Units are millimetres. Assembly coordinates: origin bottom left, +Z toward
 * the viewer. Every WASM object is explicitly deleted after mesh extraction.
 */
export const PATTERNS = ['empty','tsumi','asanoha','shippo','sakura','ryuso','kagome'];
export const DEFAULTS = Object.freeze({
  width:180, height:180, cellSize:22, depth:4, border:5,
  gridWidth:1.6, stripWidth:1.2, clearance:0.2, ledgeWidth:1.2,
  ledgeHeight:0.8, bedWidth:220, bedHeight:220, margin:6,
  colors:4, mode:'modular', strategy:'tone', fixedPattern:'asanoha',
  orientation:'horizontal', fit:'cover', contrast:1.1, gamma:1,
  brightness:0, background:'none', backgroundTolerance:30,
  frameColor:'#976641', backing:false, backingThickness:0.8,
  nozzle:0.4, overrides:{}
});
const LIMITS = {
  width:[40,1200],height:[40,1200],cellSize:[8,80],depth:[2,12],border:[2,30],
  gridWidth:[0.8,5],stripWidth:[0.6,4],clearance:[0.05,0.6],
  ledgeWidth:[0.6,3],ledgeHeight:[0.4,2],bedWidth:[80,500],bedHeight:[80,500],
  margin:[2,20],colors:[1,8],contrast:[0.5,2.5],gamma:[0.4,2.5],
  brightness:[-0.4,0.4],backgroundTolerance:[5,120],backingThickness:[0.4,3],nozzle:[0.2,1]
};
const ENUMS={mode:['modular','fused'],strategy:['tone','texture','fixed'],orientation:['horizontal','vertical'],fit:['cover','contain'],background:['none','white','black','transparent']};
export function normalizeConfig(raw={}) {
  const c={...DEFAULTS,...raw};
  for(const [key,[lo,hi]] of Object.entries(LIMITS)){
    const n=Number(c[key]);
    if(!Number.isFinite(n)||n<lo||n>hi) throw new Error(`${key}: enter a value from ${lo} to ${hi}.`);
    c[key]=n;
  }
  c.colors=Math.round(c.colors);
  for(const [key,list] of Object.entries(ENUMS)) if(!list.includes(c[key])) throw new Error(`Invalid ${key}.`);
  if(!PATTERNS.includes(c.fixedPattern)) throw new Error('Invalid fixed pattern.');
  if(!/^#[0-9a-f]{6}$/i.test(c.frameColor)) throw new Error('Invalid frame color.');
  c.backing=Boolean(c.backing);
  c.overrides=c.overrides&&typeof c.overrides==='object'?c.overrides:{};
  if(Math.min(c.width,c.height)<=2*c.border+2*c.cellSize) throw new Error('The border leaves too little room. Reduce the border or cell size.');
  if(c.cellSize<6*c.stripWidth+3*c.gridWidth) throw new Error('The motifs would close up. Increase cell size or reduce strip/grid width.');
  if(c.ledgeHeight>=c.depth-1) throw new Error('Allow at least 1 mm of insert depth above the ledge.');
  if(c.ledgeWidth-c.clearance<0.35) throw new Error('Increase the ledge width to support the inserts.');
  if(c.margin*2>=Math.min(c.bedWidth,c.bedHeight)-20) throw new Error('The bed margin is too large.');
  return c;
}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const center=poly=>poly.reduce((p,v)=>[p[0]+v[0]/poly.length,p[1]+v[1]/poly.length],[0,0]);
const lum=rgb=>(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
const dist=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
const hex=rgb=>'#'+rgb.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const ccw=p=>signedArea(p)<0?p.slice().reverse():p;
const area=p=>Math.abs(signedArea(p));
function rect(x0,y0,x1,y1){return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];}
function clipRect(poly,x0,y0,x1,y1){
  let out=poly;
  for(const [axis,bound,greater] of [[0,x0,true],[0,x1,false],[1,y0,true],[1,y1,false]]){
    const input=out;out=[];
    for(let i=0;i<input.length;i++){
      const a=input[i],b=input[(i+1)%input.length];
      const ina=greater?a[axis]>=bound:a[axis]<=bound, inb=greater?b[axis]>=bound:b[axis]<=bound;
      if(ina) out.push(a);
      if(ina!==inb) out.push(mix(a,b,(bound-a[axis])/(b[axis]-a[axis])));
    }
    if(out.length<3) return [];
  }
  return out;
}
function inside(p,poly){
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])<-1e-5)return false;
  }
  return true;
}
function bounding(poly){
  const x=poly.map(p=>p[0]),y=poly.map(p=>p[1]);
  return {min:[Math.min(...x),Math.min(...y)],max:[Math.max(...x),Math.max(...y)]};
}
export function gridTriangles(c){
  const vertical=c.orientation==='vertical',w=vertical?c.height:c.width,h=vertical?c.width:c.height;
  const s=c.cellSize, dy=s*Math.sqrt(3)/2, cells=[];
  for(let row=-1;row<=Math.ceil(h/dy);row++){
    const shift=((row%2)+2)%2*s/2;
    for(let col=-2;col<=Math.ceil(w/s);col++){
      const a=[col*s+shift,row*dy],b=[a[0]+s,a[1]],d=[a[0]+s/2,a[1]+dy],e=[a[0]+1.5*s,a[1]+dy];
      for(let tri of [[a,b,d],[b,e,d]]){
        if(vertical)tri=tri.map(([x,y])=>[y,x]);tri=ccw(tri);
        const clipped=clipRect(tri,c.border,c.border,c.width-c.border,c.height-c.border);
        if(clipped.length<3||area(clipped)<1)continue;
        cells.push({triangle:tri,outline:clipped,centroid:center(clipped),area:area(clipped)});
      }
    }
  }
  cells.sort((a,b)=>b.centroid[1]-a.centroid[1]||a.centroid[0]-b.centroid[0]);
  return cells.map((cell,i)=>({...cell,id:`C${String(i+1).padStart(4,'0')}`}));
}
function sampleCell(cell,c,img){
  const {width:w,height:h,data}=img, b=bounding(cell.outline);
  const iw=c.width-2*c.border,ih=c.height-2*c.border;
  let x0=clamp(Math.floor((b.min[0]-c.border)/iw*w),0,w-1),x1=clamp(Math.ceil((b.max[0]-c.border)/iw*w),0,w-1);
  let y0=clamp(Math.floor((c.height-c.border-b.max[1])/ih*h),0,h-1),y1=clamp(Math.ceil((c.height-c.border-b.min[1])/ih*h),0,h-1);
  const step=Math.max(1,Math.floor(Math.sqrt((x1-x0+1)*(y1-y0+1)/220)));
  let rgb=[0,0,0],n=0,total=0,sum=0,sum2=0,gradient=0;const histogram=new Array(16).fill(0);
  const pixel=(x,y)=>{const k=(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4;return [data[k],data[k+1],data[k+2]];};
  for(let y=y0;y<=y1;y+=step)for(let x=x0;x<=x1;x+=step){
    const p=[c.border+(x+0.5)/w*iw,c.height-c.border-(y+0.5)/h*ih];if(!inside(p,cell.outline))continue;
    total++;const k=(y*w+x)*4;if(data[k+3]<25)continue;
    const v=pixel(x,y),l=lum(v);n++;rgb=rgb.map((s,i)=>s+v[i]);sum+=l;sum2+=l*l;
    histogram[Math.min(15,Math.floor(l*16))]++;
    gradient+=Math.hypot(lum(pixel(x+1,y))-lum(pixel(x-1,y)),lum(pixel(x,y+1))-lum(pixel(x,y-1)))/2;
  }
  if(!n)return {rgb:[255,255,255],brightness:1,std:0,gradient:0,entropy:0,coverage:0};
  const mean=sum/n;let entropy=0;for(const count of histogram)if(count){const p=count/n;entropy-=p*Math.log2(p);}
  return {rgb:rgb.map(v=>v/n),brightness:mean,std:Math.sqrt(Math.max(0,sum2/n-mean*mean)),gradient:gradient/n,entropy,coverage:n/Math.max(1,total)};
}
function choosePattern(f,c){
  if(c.strategy==='fixed')return c.fixedPattern;
  if(c.strategy==='texture'){
    if(f.std>0.17&&f.gradient>0.055)return 'sakura';
    if(f.entropy>3.2&&f.std>0.12)return 'ryuso';
    if(f.entropy<1.8&&f.gradient<0.02)return 'tsumi';
    if(f.std<0.08&&f.gradient<0.025)return 'asanoha';
    return 'shippo';
  }
  const v=Math.pow(clamp((f.brightness-0.5)*c.contrast+0.5+c.brightness),1/c.gamma);
  const levels=['ryuso','sakura','shippo','asanoha','tsumi','empty'];
  return levels[Math.min(levels.length-1,Math.floor(v*levels.length))];
}
function paletteFor(cells,k){
  const samples=cells.filter(c=>!c.excluded).map(c=>({rgb:c.feature.rgb,weight:c.area}));
  if(!samples.length)return [[220,190,140]];
  const total=samples.reduce((s,p)=>s+p.weight,0);
  const average=[0,1,2].map(i=>samples.reduce((s,p)=>s+p.rgb[i]*p.weight,0)/total);
  let clusters=[samples.reduce((a,b)=>dist(a.rgb,average)<dist(b.rgb,average)?a:b).rgb.slice()];
  for(let i=1;i<k;i++){
    const next=samples.reduce((best,p)=>{const score=Math.min(...clusters.map(v=>dist(p.rgb,v)));return !best||score>best.score?{p,score}:best;},null);
    if(next.score<64)break;clusters.push(next.p.rgb.slice());
  }
  for(let n=0;n<16;n++){
    const sums=clusters.map(()=>({rgb:[0,0,0],weight:0}));
    for(const p of samples){let idx=0;clusters.forEach((q,i)=>{if(dist(p.rgb,q)<dist(p.rgb,clusters[idx]))idx=i;});const s=sums[idx];s.weight+=p.weight;s.rgb=s.rgb.map((v,i)=>v+p.rgb[i]*p.weight);}
    clusters=clusters.map((p,i)=>sums[i].weight?sums[i].rgb.map(v=>v/sums[i].weight):p);
  }
  return clusters.sort((a,b)=>lum(a)-lum(b));
}
function segments(pattern,p){
  const [a,b,d]=p, o=center(p),m=[mix(a,b,0.5),mix(b,d,0.5),mix(d,a,0.5)],s=[];
  const line=(a,b)=>s.push([a,b]);
  const curve=(a,control,b)=>{
    let prev=a;
    for(let i=1;i<=16;i++){const t=i/16,u=1-t,next=[u*u*a[0]+2*u*t*control[0]+t*t*b[0],u*u*a[1]+2*u*t*control[1]+t*t*b[1]];line(prev,next);prev=next;}
  };
  if(pattern==='asanoha')p.forEach(v=>line(v,o));
  if(pattern==='tsumi')m.forEach(v=>line(v,o));
  if(pattern==='ryuso'){m.forEach((v,i)=>line(v,p[(i+2)%3]));m.forEach((v,i)=>line(v,m[(i+1)%3]));}
  if(pattern==='kagome')m.forEach((v,i)=>line(v,m[(i+1)%3]));
  if(pattern==='shippo')p.forEach((v,i)=>curve(v,o,p[(i+1)%3]));
  if(pattern==='sakura')p.forEach(v=>{
    const dx=o[0]-v[0],dy=o[1]-v[1];
    for(const sign of [-1,1])curve(v,[v[0]+0.8*dx-sign*0.4*dy,v[1]+0.8*dy+sign*0.4*dx],o);
  });
  return s;
}
function stroke(seg,width){
  const [a,b]=seg,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<1e-6)return null;
  const nx=-dy/len*width/2,ny=dx/len*width/2,ex=dx/len*width/2,ey=dy/len*width/2;
  return ccw([[a[0]-ex+nx,a[1]-ey+ny],[a[0]-ex-nx,a[1]-ey-ny],[b[0]+ex-nx,b[1]+ey-ny],[b[0]+ex+nx,b[1]+ey+ny]]);
}
class Scope{
  constructor(){this.items=[];} keep(o){this.items.push(o);return o;} close(){for(const o of this.items.reverse())o.delete();this.items=[];}
}
function extract(man,MF){
  const status=man.status();if(status!=='NoError')throw new Error(`The geometry kernel rejected a mesh: ${status}`);
  // STL stores float32 coordinates. Simplify below printer resolution, then
  // re-import that exact precision through Manifold to collapse collinear
  // triangles introduced by rounding. Do not merely drop individual faces.
  const simple=man.simplify(0.005);let rounded;
  try{
    rounded=new MF.Manifold(simple.getMesh());
    if(rounded.status()!=='NoError')throw new Error('The mesh failed its float32 round-trip validation.');
    const m=rounded.getMesh(),positions=new Float32Array(m.vertProperties.length/m.numProp*3);
    for(let i=0;i<positions.length/3;i++)for(let j=0;j<3;j++)positions[i*3+j]=m.vertProperties[i*m.numProp+j];
    const indices=m.triVerts.slice(),volume=rounded.volume();if(!indices.length||volume<=0)throw new Error('An empty mesh was generated. Increase the cell size.');
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i++){min[i%3]=Math.min(min[i%3],positions[i]);max[i%3]=Math.max(max[i%3],positions[i]);}
    return {positions,indices,volume,bounds:{min,max},triangles:indices.length/3};
  }finally{if(rounded)rounded.delete();simple.delete();}
}
const pause=()=>new Promise(r=>setTimeout(r,0));
export async function createDesign(raw,img,MF,report=()=>{}){
  const c=normalizeConfig(raw);
  if(!img||!Number.isInteger(img.width)||!Number.isInteger(img.height)||img.width<1||img.height<1||img.width*img.height>4200000||img.data.length!==img.width*img.height*4)throw new Error('Invalid image pixels.');
  const cells=gridTriangles(c);if(cells.length>2600)throw new Error(`${cells.length} cells exceed the 2,600-cell limit. Increase cell size or reduce panel dimensions.`);
  const warnings=[];if(c.stripWidth+1e-9<3*c.nozzle)warnings.push('The motif strips are less than three nozzle widths. Check thin-wall handling in your slicer.');
  const background=c.background==='black'?[0,0,0]:[255,255,255];
  for(const cell of cells){
    cell.feature=sampleCell(cell,c,img);
    cell.excluded=cell.feature.coverage<0.08||(c.background==='white'||c.background==='black')&&Math.sqrt(dist(cell.feature.rgb,background))<c.backgroundTolerance;
    cell.pattern=cell.excluded?'empty':choosePattern(cell.feature,c);
  }
  const paletteRGB=paletteFor(cells,c.colors),palette=paletteRGB.map(hex);
  for(const cell of cells){
    let idx=0;paletteRGB.forEach((p,i)=>{if(dist(cell.feature.rgb,p)<dist(cell.feature.rgb,paletteRGB[idx]))idx=i;});cell.color=idx;
    const edit=c.overrides[cell.id];if(edit){if(PATTERNS.includes(edit.pattern)){cell.pattern=edit.pattern;cell.excluded=false;}if(Number.isInteger(edit.color)&&edit.color>=0&&edit.color<palette.length)cell.color=edit.color;}
  }
  report({progress:0.08,message:`Sampled ${cells.length} triangular cells`});await pause();
  const scope=new Scope(),keep=x=>scope.keep(x),CS=MF.CrossSection;
  const shape=p=>p.length?keep(new CS(p,'Positive')):keep(CS.square([0,0]));
  const box=(x0,y0,x1,y1)=>shape([rect(x0,y0,x1,y1)]);
  try{
    const boundary=box(0,0,c.width,c.height),interior=box(c.border,c.border,c.width-c.border,c.height-c.border);
    const outerRing=keep(boundary.subtract(interior)), gridPolys=[],seen=new Set();
    for(const cell of cells)for(let i=0;i<3;i++){
      const a=cell.triangle[i],b=cell.triangle[(i+1)%3];
      const key=[a,b].map(p=>p.map(v=>v.toFixed(4)).join(',')).sort().join('|');
      if(seen.has(key))continue;seen.add(key);gridPolys.push(stroke([a,b],c.gridWidth));
    }
    const grid=keep(shape(gridPolys).intersect(interior));
    const lattice=keep(grid.add(outerRing));
    const shelf=keep(keep(lattice.offset(c.ledgeWidth,'Miter',5)).intersect(boundary));
    const fittedInterior=box(c.border+c.clearance,c.border+c.clearance,c.width-c.border-c.clearance,c.height-c.border-c.clearance);
    const inserts=[],fusedPolys=[];
    for(let n=0;n<cells.length;n++){
      const cell=cells[n];if(cell.pattern==='empty')continue;
      if(c.mode==='fused'){
        cell.displaySegments=segments(cell.pattern,cell.triangle);
        for(const s of cell.displaySegments)fusedPolys.push(stroke(s,c.stripWidth));
      }else{
        const full=shape([cell.triangle]);
        const inset=keep(full.offset(-c.gridWidth/2-c.clearance,'Miter',5));
        const aperture=keep(inset.intersect(fittedInterior));
        if(aperture.area()<Math.max(6,c.stripWidth*c.stripWidth*4)){
          cell.pattern='empty';cell.omitted='The clipped cell is too small for a printable insert.';continue;
        }
        const smallTriangle=inset.toPolygons()[0];
        if(!smallTriangle||smallTriangle.length!==3){cell.pattern='empty';cell.omitted='The triangle has no printable opening.';continue;}
        const inner=keep(aperture.offset(-c.stripWidth,'Miter',5));
        const ring=keep(aperture.subtract(inner));
        const strokes=segments(cell.pattern,smallTriangle).map(s=>stroke(s,c.stripWidth)).filter(Boolean);
        const motif=keep(shape(strokes).intersect(aperture));
        const insert=keep(ring.add(motif));
        const simple=keep(insert.simplify(0.005));
        cell.insertContours=simple.toPolygons();
        const b=simple.bounds();const bounds={min:b.min,max:b.max};
        inserts.push({cell,shape:simple,bounds});
      }
      if(n%100===0){report({progress:0.1+n/cells.length*0.32,message:`Building cell ${n+1} of ${cells.length}`});await pause();}
    }
    let fused;
    if(c.mode==='fused')fused=keep(keep(lattice.add(keep(shape(fusedPolys).intersect(interior)))).simplify(0.005));
    const bedW=c.bedWidth-2*c.margin,bedH=c.bedHeight-2*c.margin;
    const nx=Math.ceil(c.width/bedW),ny=Math.ceil(c.height/bedH),tw=c.width/nx,th=c.height/ny;
    const parts=[],preview=[],tiles=[];
    const addPart=(filename,kind,color,man,extra={})=>{
      const mesh=extract(man,MF);const part={filename,kind,color,mesh,...extra};parts.push(part);return part;
    };
    for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
      const x0=col*tw,y0=c.height-(row+1)*th,x1=x0+tw,y1=y0+th;
      const id=`R${String(row+1).padStart(2,'0')}_C${String(col+1).padStart(2,'0')}`,mask=box(x0,y0,x1,y1);
      const tile={id,row:row+1,col:col+1,x:x0,y:y0,width:tw,height:th};tiles.push(tile);
      let sc=keep((c.mode==='fused'?fused:lattice).intersect(mask));
      let seamRail;
      if(nx*ny>1){
        // Cutting an arbitrary motif at a bed boundary can isolate a sliver.
        // Anchor it with a rail: full depth for fused, ledge depth for modular
        // so the insert opening and its clearance are preserved.
        const rail=Math.max(c.gridWidth,c.stripWidth);
        const innerTile=box(x0+rail,y0+rail,x1-rail,y1-rail);
        seamRail=keep(mask.subtract(innerTile));
        if(c.mode==='fused')sc=keep(sc.add(seamRail));
      }
      let solid=keep(sc.extrude(c.depth));
      if(c.mode==='modular'){
        let lowerSection=keep(shelf.intersect(mask));if(seamRail)lowerSection=keep(lowerSection.add(seamRail));
        const lower=keep(lowerSection.extrude(c.ledgeHeight));solid=keep(solid.add(lower));
      }
      const local=keep(solid.translate([-x0,-y0,0]));
      const p=addPart(`${c.mode==='fused'?'panels':'frame'}/${id}.stl`,c.mode==='fused'?'panel':'frame',c.frameColor,local,{tile});
      preview.push({kind:p.kind,color:c.frameColor,mesh:p.mesh,offset:[x0,y0,0]});
      if(c.backing){
        const bsolid=keep(box(0,0,tw,th).extrude(c.backingThickness));
        const bp=addPart(`backing/${id}.stl`,'backing','#e4dac8',bsolid,{tile});
        preview.push({kind:'backing',color:bp.color,mesh:bp.mesh,offset:[x0,y0,-c.backingThickness]});
      }
      report({progress:0.44+tiles.length/(nx*ny)*0.18,message:`Meshing frame tile ${tiles.length} of ${nx*ny}`});await pause();
    }
    const plateGap=Math.max(2,4*c.nozzle),plates=[];
    for(let color=0;color<palette.length;color++){
      const list=inserts.filter(p=>p.cell.color===color).sort((a,b)=>(b.bounds.max[1]-b.bounds.min[1])-(a.bounds.max[1]-a.bounds.min[1])||a.cell.id.localeCompare(b.cell.id));
      let plate=null,x=0,y=0,rowH=0;
      for(const item of list){
        const w=item.bounds.max[0]-item.bounds.min[0],h=item.bounds.max[1]-item.bounds.min[1];
        if(w>bedW||h>bedH)throw new Error('An insert does not fit your printer bed. Reduce the cell size.');
        if(!plate){plate={color,items:[],shapes:[],width:0,height:0};plates.push(plate);x=0;y=0;rowH=0;}
        if(x+w>bedW+1e-6){x=0;y+=rowH+plateGap;rowH=0;}
        if(y+h>bedH+1e-6||plate.items.length>=100){plate={color,items:[],shapes:[],width:0,height:0};plates.push(plate);x=0;y=0;rowH=0;}
        const offset=[x-item.bounds.min[0],y-item.bounds.min[1]];
        plate.shapes.push(keep(item.shape.translate(offset)));
        const placement={id:item.cell.id,x,y,width:w,height:h,offset,pattern:item.cell.pattern};
        plate.items.push(placement);item.cell.plate=plates.length;
        plate.width=Math.max(plate.width,x+w);plate.height=Math.max(plate.height,y+h);
        rowH=Math.max(rowH,h);x+=w+plateGap;
      }
    }
    for(let i=0;i<plates.length;i++){
      const plate=plates[i],sc=keep(CS.union(plate.shapes));
      const solid=keep(sc.extrude(c.depth-c.ledgeHeight));
      const name=`inserts/plate_${String(i+1).padStart(3,'0')}_color_${plate.color+1}_${palette[plate.color].slice(1)}.stl`;
      plate.filename=name;
      addPart(name,'insert_plate',palette[plate.color],solid,{placements:plate.items,plate:i+1});
      report({progress:0.62+(i+1)/Math.max(1,plates.length)*0.2,message:`Packing filament plate ${i+1} of ${plates.length}`});await pause();
    }
    if(c.mode==='modular'){
      for(let i=0;i<palette.length;i++){
        const list=inserts.filter(v=>v.cell.color===i);if(!list.length)continue;
        const united=keep(CS.union(list.map(v=>v.shape)));
        const man=keep(keep(united.extrude(c.depth-c.ledgeHeight)).translate([0,0,c.ledgeHeight]));
        preview.push({kind:'inserts',color:palette[i],mesh:extract(man,MF),offset:[0,0,0]});
      }
      const s=c.cellSize,h=s*Math.sqrt(3)/2,tri=shape([[[0,0],[s,0],[s/2,h]]]);
      const outer=keep(tri.offset(c.gridWidth/2,'Miter',5)),hole=keep(tri.offset(-c.gridWidth/2,'Miter',5));
      const rim=keep(outer.subtract(hole)),smallHole=keep(tri.offset(-c.gridWidth/2-c.ledgeWidth,'Miter',5));
      const lower=keep(outer.subtract(smallHole));
      const upperMan=keep(rim.extrude(c.depth)),lowerMan=keep(lower.extrude(c.ledgeHeight));
      const fixture=keep(upperMan.add(lowerMan)),fb=fixture.boundingBox();
      const fixtureLocal=keep(fixture.translate([-fb.min[0],-fb.min[1],0]));
      const fitOuter=keep(tri.offset(-c.gridWidth/2-c.clearance,'Miter',5)),fitInner=keep(fitOuter.offset(-c.stripWidth,'Miter',5));
      const fitRing=keep(fitOuter.subtract(fitInner)),fitSolid=keep(fitRing.extrude(c.depth-c.ledgeHeight)),ib=fitSolid.boundingBox();
      const other=keep(fitSolid.translate([fb.max[0]-fb.min[0]+5-ib.min[0],-ib.min[1],0]));
      const coupon=keep(MF.Manifold.compose([fixtureLocal,other]));
      const cb=coupon.boundingBox();if(cb.max[0]<=bedW&&cb.max[1]<=bedH)addPart('fit_test.stl','fit_test',c.frameColor,coupon);
      else warnings.push('Your bed is too small for the combined fit coupon. Test a frame tile and one insert instead.');
    }
    if(nx*ny>1)warnings.push(c.mode==='fused'?'The panel is split into butt-jointed tiles with narrow seam rails to keep every tile connected. Align and glue on a flat surface.':'The frame is split into butt-jointed tiles with low seam rails at the ledge layer. Align on a flat surface and glue the seams before inserting the cells.');
    if(!inserts.length&&c.mode==='modular')warnings.push('No patterned inserts remain. Darken the tone mapping or change the background setting.');
    const omitted=cells.filter(v=>v.omitted).length;if(omitted)warnings.push(`${omitted} tiny cells at the panel edge were left empty to avoid fragile inserts.`);
    const allParts=parts.filter(p=>p.kind!=='fit_test'),volume=allParts.reduce((s,p)=>s+p.mesh.volume,0);
    const result={version:1,config:c,palette,cells:cells.map(({feature,...cell})=>({...cell,meanRGB:feature.rgb})),tiles,plates:plates.map(({shapes,...p})=>p),parts,preview,warnings,stats:{cells:cells.length,inserts:inserts.length,tiles:nx*ny,plates:plates.length,files:parts.length,volumeCm3:volume/1000,plaGrams:volume/1000*1.24,triangles:allParts.reduce((s,p)=>s+p.mesh.triangles,0)}};
    report({progress:1,message:`Ready · ${parts.length} STL files`});return result;
  } finally {scope.close();}
}
export function binarySTL(mesh,title='Kumiko Studio'){
  const {positions:p,indices:t}=mesh,bytes=new Uint8Array(84+t.length/3*50),v=new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(title.slice(0,70)));v.setUint32(80,t.length/3,true);
  let offset=84;
  for(let i=0;i<t.length;i+=3){
    const a=[p[t[i]*3],p[t[i]*3+1],p[t[i]*3+2]],b=[p[t[i+1]*3],p[t[i+1]*3+1],p[t[i+1]*3+2]],c=[p[t[i+2]*3],p[t[i+2]*3+1],p[t[i+2]*3+2]];
    const u=b.map((x,j)=>x-a[j]),w=c.map((x,j)=>x-a[j]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n);
    if(l===0)throw new Error('A degenerate triangle was found in the STL.');
    for(const value of [...n.map(x=>x/l),...a,...b,...c]){v.setFloat32(offset,value,true);offset+=4;}v.setUint16(offset,0,true);offset+=2;
  }
  return bytes;
}
