import Module from 'manifold-3d';
import {createDesign} from './engine.mjs';
let kernel;
async function initialize(){
  const binary=Uint8Array.from(atob(__WASM_BASE64__),c=>c.charCodeAt(0));
  const mf=await Module({wasmBinary:binary,printErr:console.error});mf.setup();return mf;
}
self.onmessage=async event=>{
  const {id,config,image}=event.data;
  try{
    kernel=kernel||initialize();const mf=await kernel;
    const design=await createDesign(config,image,mf,status=>self.postMessage({id,type:'progress',...status}));
    const buffers=new Set();for(const p of [...design.parts,...design.preview]){buffers.add(p.mesh.positions.buffer);buffers.add(p.mesh.indices.buffer);}
    self.postMessage({id,type:'result',design},Array.from(buffers));
  }catch(error){self.postMessage({id,type:'error',message:error.message||String(error)});}
};
