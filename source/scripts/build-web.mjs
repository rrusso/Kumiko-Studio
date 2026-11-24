import {build} from 'esbuild';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'dist');await mkdir(out,{recursive:true});
const wasm=await readFile(resolve(root,'node_modules/manifold-3d/manifold.wasm'));
const worker=await build({entryPoints:[resolve(root,'web/worker.mjs')],bundle:true,write:false,format:'iife',platform:'browser',target:'safari15',minify:true,
  define:{__WASM_BASE64__:JSON.stringify(wasm.toString('base64')),'globalThis.process':'undefined','import.meta.url':JSON.stringify('file:///kumiko-studio/embedded/manifold.js')},external:['node:module'],logLevel:'warning'});
await build({entryPoints:[resolve(root,'web/app.mjs')],outfile:resolve(out,'app.bundle.js'),bundle:true,format:'iife',platform:'browser',target:'safari15',minify:true,
  define:{__WORKER_SOURCE__:JSON.stringify(worker.outputFiles[0].text)},logLevel:'warning'});
for(const file of ['index.html','style.css'])await copyFile(resolve(root,'web',file),resolve(out,file));
await writeFile(resolve(out,'BUILD_INFO.json'),JSON.stringify({app:'Kumiko Studio',version:'1.0.0',webTarget:'Safari 15 / macOS 12',manifold:'3.5.4',three:'0.186.1',wasmEmbedded:true,workerEmbedded:true},null,2));
console.log('Offline web resources built:',out);
