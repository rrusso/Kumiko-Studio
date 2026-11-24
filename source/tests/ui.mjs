import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'test-results');await mkdir(out,{recursive:true});
const url=pathToFileURL(resolve(root,'dist/index.html')).href;
const report=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  if(process.env.KUMIKO_SKIP_WEBKIT==='1'&&name==='webkit')continue;
  const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox','--enable-unsafe-swiftshader']}:process.env.KUMIKO_WEBKIT_EXECUTABLE?{executablePath:process.env.KUMIKO_WEBKIT_EXECUTABLE}: {})});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}}),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await page.goto(url);await page.waitForFunction(()=>window.kumikoDesign,{timeout:45000});
    assert.equal(await page.locator('#export').isEnabled(),true);assert.equal(requests.length,0,'offline resources do not contact the network');
    await page.screenshot({path:resolve(out,name+'-ui.png')});
    // Changing a bed splits the frame, and stale exports must be disabled.
    await page.locator('#bedWidth').fill('120');await page.locator('#bedWidth').dispatchEvent('change');
    assert.equal(await page.locator('#export').isDisabled(),true);
    await page.waitForFunction(()=>window.kumikoDesign?.config.bedWidth===120&&!document.querySelector('#export').disabled,{timeout:45000});
    assert((await page.evaluate(()=>window.kumikoDesign.stats.tiles))>1);
    // Native bridge contract: exercise file import, project round-trip and ZIP
    // saving against a stub of the AppKit host, without inventing a Mac test.
    const dataURL=await page.locator('#thumbnail').getAttribute('src');
    const nativePage=await browser.newPage({viewport:{width:1000,height:700}});
    nativePage.on('pageerror',e=>errors.push(e.message));
    await nativePage.addInitScript(({image})=>{
      window.savedNative=[];window.mockProject='';
      window.webkit={messageHandlers:{kumiko:{postMessage(request){
        let value;
        if(request.type==='ready')value='Kumiko Studio';
        if(request.type==='openImage')value={data:image,name:'Imported test image.png'};
        if(request.type==='openProject')value={data:window.mockProject,name:'Saved test project.json'};
        if(request.type==='saveFile'){
          window.savedNative.push(request.args);
          if(request.args.format==='json')window.mockProject=new TextDecoder().decode(Uint8Array.from(atob(request.args.base64),c=>c.charCodeAt(0)));
          value='/test/'+request.args.name;
        }
        queueMicrotask(()=>window.nativeReply({id:request.id,ok:true,value}));
      }}}};
    },{image:dataURL});
    await nativePage.goto(url);await nativePage.waitForFunction(()=>window.kumikoDesign,{timeout:45000});
    await nativePage.locator('#drop').click();await nativePage.waitForFunction(()=>document.querySelector('#imageName').textContent==='Imported test image.png'&&!document.querySelector('#export').disabled,{timeout:45000});
    await nativePage.locator('[data-view="map"]').click();await nativePage.waitForTimeout(300);
    const click=await nativePage.evaluate(()=>{
      const d=window.kumikoDesign,el=document.querySelector('#viewport'),r=el.getBoundingClientRect(),s=Math.min((r.width-95)/d.config.width,(r.height-100)/d.config.height),c=d.cells.find(c=>c.id==='C0050');
      return {x:r.x+(r.width-d.config.width*s)/2+c.centroid[0]*s,y:r.y+(r.height-d.config.height*s)/2+(d.config.height-c.centroid[1])*s};
    });
    await nativePage.mouse.click(click.x,click.y);assert.equal(await nativePage.locator('#cellEditor').isVisible(),true);
    await nativePage.locator('#editPattern').selectOption('kagome');await nativePage.locator('#applyEdit').click();
    await nativePage.waitForFunction(()=>window.kumikoDesign.cells.find(c=>c.id==='C0050').pattern==='kagome'&&!document.querySelector('#export').disabled,{timeout:45000});
    await nativePage.locator('#saveProject').click();await nativePage.waitForFunction(()=>window.savedNative.some(s=>s.format==='json'));
    const saved=await nativePage.evaluate(()=>window.mockProject);const project=JSON.parse(saved);assert.equal(project.config.overrides.C0050.pattern,'kagome');
    await nativePage.locator('#openProject').click();await nativePage.waitForFunction(()=>!document.querySelector('#export').disabled&&window.kumikoDesign.cells.find(c=>c.id==='C0050').pattern==='kagome',{timeout:45000});
    await nativePage.locator('#export').click();await nativePage.waitForFunction(()=>window.savedNative.some(s=>s.format==='zip'),{timeout:45000});
    const zip=await nativePage.evaluate(()=>window.savedNative.find(s=>s.format==='zip').base64);await writeFile(resolve(out,name+'-ui-export.zip'),Buffer.from(zip,'base64'));
    await nativePage.locator('#help').click();assert(await nativePage.locator('#guide').isVisible());await nativePage.locator('#closeGuide').click();
    // Validation error is shown and export cannot use stale geometry.
    await nativePage.locator('#cellSize').fill('3');await nativePage.locator('#cellSize').dispatchEvent('change');
    assert(await nativePage.locator('#error').isVisible());assert(await nativePage.locator('#export').isDisabled());
    assert.deepEqual(errors,[],name+' browser has no uncaught errors');
    report.push({browser:name,passed:true,offline:true,workflows:['generation','tiling','native image bridge','cell edit','project save/load','ZIP export','help','input validation']});console.log('PASS UI',name);
  }finally{await browser.close();}
}
await writeFile(resolve(out,'ui-report.json'),JSON.stringify(report,null,2));
