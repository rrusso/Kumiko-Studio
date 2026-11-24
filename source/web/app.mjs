import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {DEFAULTS,PATTERNS,normalizeConfig} from './engine.mjs';
import {assemblySVG,plateSVG,exportFiles,zipFiles} from './export.mjs';
// Safari 15.0 compatibility for the viewer's optional Array.at calls.
if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(index){const i=Math.trunc(Number(index)||0),n=i<0?this.length+i:i;return n<0||n>=this.length?undefined:this[n];},configurable:true,writable:true});
const $=id=>document.getElementById(id);
const title=p=>({empty:'Empty',tsumi:'Tsumi · midpoint spokes',asanoha:'Asanoha · hemp leaf',shippo:'Shippo · curved triangle',sakura:'Sakura · petals',ryuso:'Ryuso · dense weave',kagome:'Kagome · inner triangle'}[p]||p);
const labels={three:'Drag to orbit · scroll to zoom · right-drag to pan',map:'Click a cell to change its pattern or filament',image:'Image is cropped or fitted to the interior of your panel',plates:'Print each plate once · match its IDs to the cell map'};
let config={...DEFAULTS,overrides:{}},source=null,imageName='Demo — mountain sunrise',imageData='',design=null,view='three',worker=null,sequence=0,timer=0,busy=false,selectedCell=null,mapImage=null,drawTransform=null;
let renderer,scene,camera,controls,group;
let nativeID=0;const pending=new Map();
const native=Boolean(window.webkit?.messageHandlers?.kumiko);
function nativeCall(type,args={}){
  return new Promise((resolve,reject)=>{const id=++nativeID;pending.set(id,{resolve,reject});window.webkit.messageHandlers.kumiko.postMessage({id,type,args});});
}
window.nativeReply=({id,ok,value})=>{const p=pending.get(id);if(!p)return;pending.delete(id);ok?p.resolve(value):p.reject(new Error(String(value)));};
window.nativeAction=action=>{const ids={openImage:'drop',openProject:'openProject',saveProject:'saveProject',export:'export',help:'help'};$(ids[action])?.click();};
window.nativeFile=async({kind,file,error})=>{try{if(error)throw new Error(error);if(kind==='project')await loadProject(file.data);else await loadImage(file.data,file.name);}catch(e){showError(e);}};
function status(message){$('status').textContent=message;}
function showError(error){$('error').hidden=false;$('error').textContent=error.message||String(error);$('progress').hidden=true;$('export').disabled=true;busy=false;status('Update the settings or image to continue.');}
function clearError(){$('error').hidden=true;$('error').textContent='';}
function setControls(){
  for(const [key,value] of Object.entries(config)){
    const element=$(key);if(!element)continue;
    if(element.type==='checkbox')element.checked=value;else element.value=value;
  }
  document.querySelector(`input[name="mode"][value="${config.mode}"]`).checked=true;
  $('colorsOut').value=config.colors;$('brightnessOut').value=config.brightness.toFixed(2);
  $('colorControl').hidden=config.mode==='fused';$('fixedControl').hidden=config.strategy!=='fixed';
  $('toneControls').hidden=config.strategy!=='tone';$('brightnessControl').hidden=config.strategy!=='tone';$('backingControl').hidden=!config.backing;
  const preset=`${config.bedWidth},${config.bedHeight}`;$('bedPreset').value=Array.from($('bedPreset').options).some(o=>o.value===preset)?preset:'custom';
  $('sizeTag').textContent=`${config.width} × ${config.height} mm`;
}
function readControls(){
  const result={...config};
  for(const key of Object.keys(DEFAULTS)){
    const el=$(key);if(!el)continue;
    result[key]=el.type==='checkbox'?el.checked:typeof DEFAULTS[key]==='number'?Number(el.value):el.value;
  }
  result.mode=document.querySelector('input[name="mode"]:checked').value;
  return normalizeConfig(result);
}
function schedule(){
  clearTimeout(timer);$('export').disabled=true;
  if(worker){worker.terminate();worker=null;}busy=false;
  status('Settings changed · preparing the updated print set…');
  timer=setTimeout(generate,450);
}
function processImage(c){
  const iw=c.width-2*c.border,ih=c.height-2*c.border,scale=Math.min(1024/iw,1024/ih);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(iw*scale));canvas.height=Math.max(1,Math.round(ih*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const ratio=c.fit==='cover'?Math.max(canvas.width/source.width,canvas.height/source.height):Math.min(canvas.width/source.width,canvas.height/source.height);
  const w=source.width*ratio,h=source.height*ratio;ctx.drawImage(source,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  return {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};
}
async function loadImage(url,name){
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Cannot decode this image. Try PNG or JPEG.'));img.src=url;});
  if(img.width<1||img.height<1)throw new Error('The image is empty.');
  // Store a normalized PNG at at most 2048 px, preserving alpha and aspect.
  const canvas=document.createElement('canvas'),s=Math.min(1,2048/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*s));canvas.height=Math.max(1,Math.round(img.height*s));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  source=canvas;imageData=canvas.toDataURL('image/png');imageName=name||'Image';config.overrides={};
  $('thumbnail').src=imageData;$('imageName').textContent=imageName;clearError();schedule();
}
async function chooseImage(){
  try{if(native){const file=await nativeCall('openImage');if(!file.cancelled)await loadImage(file.data,file.name);}else{$('fileInput').value='';$('fileInput').click();}}catch(e){showError(e);}
}
async function fileImage(file){if(!file)return;if(file.size>80000000)throw new Error('Choose an image smaller than 80 MB.');const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});await loadImage(url,file.name);}
function demoImage(){
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=900;const ctx=canvas.getContext('2d');
  const sky=ctx.createLinearGradient(0,0,0,900);sky.addColorStop(0,'#1f4856');sky.addColorStop(.42,'#bb795b');sky.addColorStop(.69,'#e1ad74');sky.addColorStop(1,'#eee0b5');ctx.fillStyle=sky;ctx.fillRect(0,0,900,900);
  ctx.fillStyle='#f2dca0';ctx.beginPath();ctx.arc(596,337,115,0,Math.PI*2);ctx.fill();
  const hill=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,900);points.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(900,900);ctx.closePath();ctx.fill();};
  hill([[0,580],[180,360],[425,550],[600,390],[900,610]],'#73918a');
  hill([[0,790],[175,570],[270,490],[408,705],[640,520],[900,700]],'#345d63');
  hill([[0,850],[210,780],[430,735],[600,880],[900,775]],'#1d414a');
  const tree=(x,y,height)=>{ctx.fillStyle='#112e38';ctx.fillRect(x-height*.025,y-height*.1,height*.05,height*.1);for(let i=0;i<4;i++){const top=y-height+i*height*.18,bottom=top+height*.46,half=height*(.11+i*.04);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x-half,bottom);ctx.lineTo(x+half,bottom);ctx.closePath();ctx.fill();}};
  tree(150,850,415);tree(300,885,310);tree(770,875,340);tree(843,880,245);
  return canvas.toDataURL('image/png');
}
function makeWorker(){
  const url=URL.createObjectURL(new Blob([__WORKER_SOURCE__],{type:'application/javascript'}));
  try{return new Worker(url);}finally{URL.revokeObjectURL(url);}
}
async function generate(){
  clearTimeout(timer);if(!source)return;
  try{
    const old=config;config=readControls();
    if(['width','height','cellSize','orientation','border'].some(k=>config[k]!==old[k]))config.overrides={};
    setControls();clearError();$('export').disabled=true;$('progress').hidden=false;$('progress').value=0;$('cellEditor').hidden=true;selectedCell=null;busy=true;
    if(worker)worker.terminate();worker=makeWorker();const id=++sequence;
    worker.onmessage=event=>{
      const m=event.data;if(m.id!==sequence)return;
      if(m.type==='progress'){status(m.message);$('progress').value=m.progress;}
      if(m.type==='error'){showError(new Error(m.message));worker.terminate();worker=null;}
      if(m.type==='result'){
        design=m.design;window.kumikoDesign=design;busy=false;$('progress').hidden=true;$('export').disabled=false;
        status(`${design.stats.files} STL files ready · ${design.stats.inserts} patterned inserts · ${(design.stats.triangles/1000).toFixed(1)}k triangles`);
        $('cellCount').textContent=design.stats.cells;$('tileCount').textContent=design.stats.tiles;$('plateCount').textContent=design.stats.plates;$('massCount').textContent=Math.round(design.stats.plaGrams);
        $('warnings').hidden=!design.warnings.length;$('warnings').textContent=design.warnings.join(' ');
        const palette=$('palette');palette.replaceChildren();for(const [i,color] of design.palette.entries()){const el=document.createElement('div');el.className='swatch';el.style.background=color;el.title=`Filament ${i+1}: ${color}`;palette.append(el);}
        $('plateSelect').replaceChildren();for(const [i,p] of design.plates.entries()){const option=document.createElement('option');option.value=i;option.textContent=`Plate ${i+1} · color ${p.color+1} · ${p.items.length} inserts`;$('plateSelect').append(option);}
        updateThree();updateMap();updatePlate();draw2d();
        worker.terminate();worker=null;
      }
    };
    worker.onerror=e=>showError(new Error(`Could not start the local geometry engine: ${e.message||'worker error'}`));
    worker.postMessage({id,config,image:processImage(config)});
  }catch(error){showError(error);}
}
function setupThree(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('view3d'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xe6e9e1,0);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,12000);camera.up.set(0,1,0);
    controls=new OrbitControls(camera,$('view3d'));controls.enableDamping=true;controls.dampingFactor=.08;
    scene.add(new THREE.HemisphereLight(0xffffff,0x627561,2));
    const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-120,190,250);scene.add(key);
    const fill=new THREE.DirectionalLight(0xfce8ca,1.2);fill.position.set(220,-100,90);scene.add(fill);
    group=new THREE.Group();scene.add(group);fitThree();
    function animate(){requestAnimationFrame(animate);if(view!=='three')return;resizeThree();controls.update();renderer.render(scene,camera);}animate();
  }catch(e){console.warn(e);renderer=null;document.querySelector('[data-view="three"]').disabled=true;setView('map');}
}
function resizeThree(){if(!renderer)return;const w=$('viewport').clientWidth,h=$('viewport').clientHeight;if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
function fitThree(){if(!camera)return;resizeThree();const aspect=camera.aspect||1,span=Math.max(config.height,config.width/aspect),distance=span/2/Math.tan(camera.fov*Math.PI/360)*1.3;camera.position.set(distance*.14,-distance*.11,distance);controls.target.set(0,0,config.depth/2);controls.update();}
function updateThree(){
  if(!renderer||!design)return;
  for(const child of [...group.children]){child.geometry.dispose();child.material.dispose();group.remove(child);}
  for(const part of design.preview){
    const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(part.mesh.positions,3));geom.setIndex(new THREE.BufferAttribute(part.mesh.indices,1));
    // Non-indexed flat normals keep the ninety-degree strip edges sharp.
    const flat=geom.toNonIndexed();geom.dispose();flat.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:part.color,roughness:.8,metalness:0});const mesh=new THREE.Mesh(flat,material);
    mesh.position.set(part.offset[0]-config.width/2,part.offset[1]-config.height/2,part.offset[2]);group.add(mesh);
  }
  fitThree();
}
function updateMap(){if(!design)return;const img=new Image();img.onload=()=>{mapImage=img;draw2d();};img.src='data:image/svg+xml;base64,'+text64(assemblySVG(design,$('showLabels').checked));}
function updatePlate(){if(!design||!design.plates.length){$('plateView').removeAttribute('src');return;}const i=Number($('plateSelect').value)||0;$('plateView').src='data:image/svg+xml;base64,'+text64(plateSVG(design,design.plates[i]));}
function draw2d(){
  if(view!=='map'&&view!=='image')return;
  const canvas=$('view2d'),w=$('viewport').clientWidth,h=$('viewport').clientHeight,dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const scale=Math.min((w-95)/config.width,(h-100)/config.height),pw=config.width*scale,ph=config.height*scale,x=(w-pw)/2,y=(h-ph)/2;
  drawTransform={x,y,scale};ctx.shadowColor='#203a2830';ctx.shadowBlur=24;ctx.shadowOffsetY=9;ctx.fillStyle='#f5f1e8';ctx.fillRect(x,y,pw,ph);ctx.shadowColor='transparent';
  if(view==='map'&&mapImage)ctx.drawImage(mapImage,x,y,pw,ph);
  if(view==='image'&&source){const c=processImage(config),temp=document.createElement('canvas');temp.width=c.width;temp.height=c.height;temp.getContext('2d').putImageData(new ImageData(c.data,c.width,c.height),0,0);ctx.drawImage(temp,x+config.border*scale,y+config.border*scale,(config.width-2*config.border)*scale,(config.height-2*config.border)*scale);ctx.strokeStyle=config.frameColor;ctx.lineWidth=config.border*scale;ctx.strokeRect(x+config.border*scale/2,y+config.border*scale/2,pw-config.border*scale,ph-config.border*scale);}
}
function setView(next){
  view=next;document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===next;el.classList.toggle('active',active);el.setAttribute('aria-selected',active);});
  $('view3d').hidden=next!=='three';$('view2d').hidden=next!=='map'&&next!=='image';$('plateView').hidden=next!=='plates';$('plateSelect').hidden=next!=='plates';$('labelsControl').hidden=next!=='map';$('hint').textContent=labels[next];$('cellEditor').hidden=true;draw2d();updatePlate();
  if(next==='plates'&&design&&!design.plates.length)$('hint').textContent='Fused mode uses panel tiles; there are no separate insert plates.';
}
function insidePoint(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function selectCell(event){
  if(view!=='map'||!design||busy||!drawTransform)return;
  const r=$('view2d').getBoundingClientRect(),t=drawTransform,p=[(event.clientX-r.left-t.x)/t.scale,config.height-(event.clientY-r.top-t.y)/t.scale];
  const cell=design.cells.find(c=>insidePoint(p,c.outline));if(!cell){$('cellEditor').hidden=true;return;}
  selectedCell=cell.id;$('cellTitle').textContent=cell.id;$('editPattern').value=cell.pattern;$('editColor').replaceChildren();
  design.palette.forEach((color,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`Color ${i+1} · ${color}`;$('editColor').append(option);});$('editColor').value=cell.color;$('cellEditor').hidden=false;
}
function bytes64(data){let s='';for(let i=0;i<data.length;i+=32768)s+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(s);}
function text64(s){return bytes64(new TextEncoder().encode(s));}
async function saveBytes(name,bytes,format){
  if(native)return nativeCall('saveFile',{name,base64:bytes64(bytes),format});
  const url=URL.createObjectURL(new Blob([bytes],{type:format==='zip'?'application/zip':'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);return name;
}
async function exportSet(){
  if(!design||busy||$('export').disabled)return;
  try{$('export').disabled=true;status('Preparing STL files and assembly maps…');await new Promise(r=>setTimeout(r,30));
    const bytes=zipFiles(exportFiles(design));if(bytes.length>250000000)throw new Error('The export exceeds 250 MB. Increase cell size or reduce the panel.');
    const result=await saveBytes(`Kumiko_${config.width}x${config.height}_print_set.zip`,bytes,'zip');status(result?.cancelled?'Export cancelled.':`Saved the complete print set · ${(bytes.length/1048576).toFixed(1)} MB`);$('export').disabled=false;
  }catch(e){showError(e);if(design)$('export').disabled=false;}
}
function project(){return {format:'kumiko-studio-project',version:1,name:imageName,image:imageData,config};}
async function saveProject(){try{const result=await saveBytes('Kumiko_project.json',new TextEncoder().encode(JSON.stringify(project())),'json');if(!result?.cancelled)status('Project saved with the image, settings and cell edits.');}catch(e){showError(e);}}
async function loadProject(text){
  const p=JSON.parse(text);if(p.format!=='kumiko-studio-project'||p.version!==1||typeof p.image!=='string'||!p.image.startsWith('data:image/'))throw new Error('This is not a Kumiko Studio project.');
  const c=normalizeConfig(p.config);await loadImage(p.image,String(p.name||'Project image'));config=c;setControls();schedule();
}
async function openProject(){try{if(native){const p=await nativeCall('openProject');if(!p.cancelled)await loadProject(p.data);}else{const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{if(input.files[0])await loadProject(await input.files[0].text());}catch(e){showError(e);}};input.click();}}catch(e){showError(e);}}
function bind(){
  for(const id of ['fixedPattern','editPattern'])for(const p of PATTERNS){const o=document.createElement('option');o.value=p;o.textContent=title(p);$(id).append(o);}
  for(const key of Object.keys(DEFAULTS)){
    const el=$(key);if(!el)continue;el.addEventListener('input',()=>{if(key==='colors')$('colorsOut').value=el.value;if(key==='brightness')$('brightnessOut').value=Number(el.value).toFixed(2);});
    el.addEventListener('change',()=>{try{const next=readControls();if(['width','height','cellSize','orientation','border'].some(k=>config[k]!==next[k]))next.overrides={};config=next;setControls();schedule();}catch(e){showError(e);}});
  }
  document.querySelectorAll('input[name="mode"]').forEach(el=>el.addEventListener('change',()=>{config.mode=el.value;setControls();schedule();}));
  $('bedPreset').addEventListener('change',()=>{if($('bedPreset').value==='custom')return;[config.bedWidth,config.bedHeight]=$('bedPreset').value.split(',').map(Number);setControls();schedule();});
  $('drop').addEventListener('click',chooseImage);$('drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseImage();}});
  $('fileInput').addEventListener('change',async()=>{try{await fileImage($('fileInput').files[0]);}catch(e){showError(e);}});
  for(const type of ['dragover','dragenter'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('drag');});
  $('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
  $('drop').addEventListener('drop',async e=>{e.preventDefault();$('drop').classList.remove('drag');try{await fileImage(e.dataTransfer.files[0]);}catch(error){showError(error);}});
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
  $('demo').onclick=()=>loadImage(demoImage(),'Demo — mountain sunrise');$('generate').onclick=generate;$('export').onclick=exportSet;$('saveProject').onclick=saveProject;$('openProject').onclick=openProject;
  $('reset').onclick=()=>{config={...DEFAULTS,overrides:{}};setControls();schedule();};$('clearEdits').onclick=()=>{config.overrides={};schedule();};
  document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));$('fitView').onclick=()=>{fitThree();draw2d();};
  $('showLabels').onchange=updateMap;$('plateSelect').onchange=updatePlate;$('view2d').onclick=selectCell;
  $('closeEditor').onclick=()=>$('cellEditor').hidden=true;$('applyEdit').onclick=()=>{if(!selectedCell)return;config.overrides={...config.overrides,[selectedCell]:{pattern:$('editPattern').value,color:Number($('editColor').value)}};$('cellEditor').hidden=true;schedule();};
  $('help').onclick=()=>{const g=$('guide');if(g.showModal)g.showModal();else{g.setAttribute('open','');Object.assign(g.style,{position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',zIndex:20,display:'block'});}};
  $('closeGuide').onclick=()=>{const g=$('guide');if(g.close)g.close();else{g.removeAttribute('open');g.style.display='none';}};
  new ResizeObserver(draw2d).observe($('viewport'));
  document.addEventListener('keydown',e=>{if(!native&&(e.metaKey||e.ctrlKey)&&['o','s','e'].includes(e.key)){e.preventDefault();if(e.key==='o')chooseImage();if(e.key==='s')saveProject();if(e.key==='e')exportSet();}});
}
async function init(){bind();setControls();setupThree();await loadImage(demoImage(),'Demo — mountain sunrise');if(native)await nativeCall('ready');}
init().catch(showError);
