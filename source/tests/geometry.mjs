import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import Module from 'manifold-3d';
import {createDesign,binarySTL,normalizeConfig,PATTERNS} from '../web/engine.mjs';
import {exportFiles,zipFiles} from '../web/export.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'test-results');await mkdir(output,{recursive:true});
const MF=await Module();MF.setup();
function image(type='gradient'){
  const width=120,height=100,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;let rgb;
    if(type==='white')rgb=[255,255,255];
    else if(type==='solid')rgb=[80,120,190];
    else if(type==='checker')rgb=(Math.floor(x/5)+Math.floor(y/5))%2?[240,195,75]:[12,55,80];
    else rgb=[x/width*255,y/height*200,(1-x/width)*200];
    data.set([...rgb,type==='transparent'?0:255],i);
  }
  return {width,height,data};
}
function validateMesh(mesh,name){
  const {positions:p,indices:t}=mesh,ids=new Map(),remap=[];let next=0;
  for(let i=0;i<p.length;i+=3){const key=[p[i],p[i+1],p[i+2]].join(',');if(!ids.has(key))ids.set(key,next++);remap.push(ids.get(key));}
  const edges=new Map(),orientations=new Map();let volume=0;
  const parents=Array.from({length:next},(_,i)=>i);
  const find=n=>{while(parents[n]!==n){parents[n]=parents[parents[n]];n=parents[n];}return n;};
  for(let i=0;i<t.length;i+=3){
    const tri=[t[i],t[i+1],t[i+2]],a=tri.map(idx=>Array.from(p.subarray(idx*3,idx*3+3)));
    assert(tri.every(j=>Number.isInteger(j)&&j<p.length/3),name+' valid indices');
    const u=a[1].map((v,j)=>v-a[0][j]),v=a[2].map((v,j)=>v-a[0][j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert(Math.hypot(...cross)>0,name+' nondegenerate triangles');
    volume+=(a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1])-a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0])+a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]))/6;
    const ri=tri.map(j=>remap[j]);parents[find(ri[1])]=find(ri[0]);parents[find(ri[2])]=find(ri[0]);
    for(let j=0;j<3;j++){const x=ri[j],y=ri[(j+1)%3],key=x<y?`${x},${y}`:`${y},${x}`;edges.set(key,(edges.get(key)||0)+1);orientations.set(key,(orientations.get(key)||0)+(x<y?1:-1));}
  }
  assert([...edges.values()].every(n=>n===2),name+' closed two-manifold edge incidence');
  assert([...orientations.values()].every(n=>n===0),name+' consistent winding');
  assert(volume>0,name+' positive signed volume');
  assert(Math.abs(volume-mesh.volume)<Math.max(0.02,mesh.volume*1e-5),name+' mesh/kernel volume agreement');
  return {components:new Set(parents.map((_,i)=>find(i))).size,volume,triangles:t.length/3};
}
const results=[];
async function run(name,c,img=image()){
  const started=Date.now(),d=await createDesign(c,img,MF),netW=d.config.bedWidth-2*d.config.margin,netH=d.config.bedHeight-2*d.config.margin;
  const filenames=new Set(),assigned=[];
  for(const p of d.parts){
    assert(!filenames.has(p.filename));filenames.add(p.filename);
    const r=validateMesh(p.mesh,name+'/'+p.filename);
    assert(p.mesh.bounds.min.every(v=>v>=-0.0001),p.filename+' rests at a nonnegative origin');
    assert(p.mesh.bounds.max[0]<=netW+0.001&&p.mesh.bounds.max[1]<=netH+0.001,p.filename+' fits the reserved bed');
    if(p.kind==='frame'||p.kind==='panel')assert.equal(r.components,1,p.filename+' one connected body');
    if(p.kind==='insert_plate'){assert.equal(r.components,p.placements.length,p.filename+' one component per insert');assigned.push(...p.placements.map(x=>x.id));}
    if(p.kind==='fit_test')assert.equal(r.components,2,'fit coupon has separate frame and test insert');
    const bytes=binarySTL(p.mesh,p.filename);assert.equal(bytes.length,84+r.triangles*50);assert.equal(new DataView(bytes.buffer).getUint32(80,true),r.triangles);
  }
  assert.equal(assigned.length,d.stats.inserts);assert.equal(new Set(assigned).size,assigned.length);
  assert.equal(d.cells.filter(c=>c.insertContours).length,d.stats.inserts);
  assert(d.palette.length<=d.config.colors);
  // Re-import the rounded, exported vertex data; detect any physical interference
  // between the assembled lattice and the inserts, not just valid isolated meshes.
  const frames=[],inserts=[];
  try{
    for(const p of d.preview){
      if(p.kind==='backing')continue;
      const base=new MF.Manifold({numProp:3,vertProperties:p.mesh.positions,triVerts:p.mesh.indices});
      assert.equal(base.status(),'NoError');
      const placed=base.translate(p.offset);base.delete();
      (p.kind==='inserts'?inserts:frames).push(placed);
    }
    if(inserts.length){
      const frame=MF.Manifold.union(frames),insert=MF.Manifold.compose(inserts),collision=frame.intersect(insert);
      assert(collision.volume()<0.01,`${name}: assembled frame/insert collision = ${collision.volume()} mm³`);
      const ledge=frame.slice(d.config.ledgeHeight/2),projected=insert.project(),contact=ledge.intersect(projected);
      assert(contact.area()>d.stats.inserts*0.2,name+' inserts have ledge support');
      contact.delete();projected.delete();ledge.delete();collision.delete();insert.delete();frame.delete();
    }
  }finally{frames.forEach(v=>v.delete());inserts.forEach(v=>v.delete());}
  const files=exportFiles(d);await writeFile(resolve(output,name+'.zip'),zipFiles(files));
  results.push({name,ok:true,elapsedMs:Date.now()-started,...d.stats});console.log('PASS',name,d.stats.files,'STLs',Date.now()-started+'ms');
  return d;
}
for(const pattern of PATTERNS)await run('pattern-'+pattern,{width:100,height:110,cellSize:16,stripWidth:1,gridWidth:1.4,strategy:'fixed',fixedPattern:pattern,colors:2},image('solid'));
await run('default-modular',{});
await run('multi-tile-modular',{width:320,height:280,cellSize:21,bedWidth:180,bedHeight:180,colors:6,backing:true},image('checker'));
await run('vertical-grid',{width:175,height:225,orientation:'vertical',bedWidth:180,bedHeight:180});
await run('large-cell-small-bed',{width:280,height:300,cellSize:65,bedWidth:120,bedHeight:120,strategy:'fixed',fixedPattern:'asanoha'});
await run('fused-tonal',{mode:'fused',width:270,height:235,bedWidth:180,bedHeight:180,backing:true});
await run('fused-empty',{mode:'fused'},image('white'));
await run('texture',{strategy:'texture',colors:3},image('checker'));
await run('skip-white',{background:'white'},image('white'));
await run('transparent',{},image('transparent'));
const manual=await run('manual-edit',{overrides:{C0020:{pattern:'sakura',color:0}}});assert.equal(manual.cells.find(c=>c.id==='C0020').pattern,'sakura');
for(const input of [{cellSize:3},{width:NaN},{clearance:1},{strategy:'invalid'},{depth:2,ledgeHeight:1.6}])assert.throws(()=>normalizeConfig(input));
await assert.rejects(()=>createDesign({width:1200,height:1200,cellSize:10,stripWidth:.6,gridWidth:.8},image(),MF),/2,600-cell/);
await writeFile(resolve(output,'geometry-report.json'),JSON.stringify({status:'passed',cases:results},null,2));
console.log(`All ${results.length} geometry/export/assembly cases passed.`);
