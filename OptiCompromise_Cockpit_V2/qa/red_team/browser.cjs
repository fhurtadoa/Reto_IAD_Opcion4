const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.RED_URL || 'http://127.0.0.1:13104';
const dir = path.resolve(process.argv[2] || 'baseline');
const focus = process.argv.slice(3);
const cases = {
  A: 'Max Beneficio = x1\nMin Costo = x1\nx1 <= 10\nx2 = 0',
  B: 'Max Beneficio = t\nMin Costo = t\nt <= 1e10\nx1 = 0\nx2 = 0',
  C: 'Max Beneficio = 1e-12*x1\nMin Costo = x1\nx1 <= 10\nx2 = 0',
  D: 'Max Retorno = x1\nMax Servicio = x2\nx1 + x2 <= 10',
  E: 'Max Retorno = x1\nMax Servicio = x2\n1e-9*x1 + 1e-9*x2 <= 1e-8',
  F: 'Max Cobertura = x1\nMin Costo = x1\nMax Puntaje = x2\nx1 <= 10\nx2 = 4',
  G: 'Max Beneficio = x1\nMin Costo = x1\nx1 <= 5\nx2 = 0',
  H: 'Max Produccion = 3*x1 + 2*x2 + b\nMin Costos = x1 + 2*x2 + 4*b\nMax Servicio = x2 - b\nx1 + x2 <= 9\nx1 <= 4*b\nx2 >= 1',
  I: 'Max Beneficio = x1\nMin Costo = x1\nx1 <= 2\nx1 >= 3\nx2 = 0',
  J: 'Max Beneficio = t\nMin Costo = t\nx1 = 0\nx2 = 0',
  K: 'Max Beneficio = x1*x2\nMin Costo = x1\nx1 <= 10',
  L: 'Max Beneficio = *x1\nMin Costo = x1\nx1 <= 10\nx2 = 0',
  N: 'Max Beneficio = 1e-6*x1\nMin Costo = x1\nx1 <= 10\nx2 = 0',
  M: 'Max Beneficio = 1e309*x1 - 1e309*x1\nMin Costo = x1\nx1 <= 10\nx2 = 0',
  O: 'Max Servicio = x1 + x2\nMax Cobertura = y + z\nx1 + x2 + y + z <= 12\n2*x1 - x2 = 0\ny - z = 0',
};
const expectedWeights={ A:[.8,.2], B:[.8,.2], C:[.8,.2], N:[.8,.2], G:[.65,.35], H:[.5,.3,.2] };
const keywords = new Set(['A','B','C','E','F','G','H','I','L','M','N','FLOW']);
const eq = (array, other) => array.length === other.length && array.every((v, i) => Math.abs(v-other[i])<1e-9);
(async () => {
  await fs.mkdir(dir, {recursive:true});
  const chrome=process.env.RED_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser=await chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.setDefaultTimeout(9000);
  const events=[];
  let tag='initial';
  page.on('pageerror',error=>events.push({tag,error:error.message}));
  page.on('request',request=>{
    if (!request.url().endsWith('/api/solve')) return;
    const p=request.postDataJSON();
    events.push({tag,request:p.name,weights:p.weights,types:p.variables.map(v=>v.var_type),objectives:p.objectives.map(o=>o.name)});
  });
  page.on('requestfailed',request=>{if(request.url().endsWith('/api/solve')) events.push({tag,failed:request.failure(),name:request.postDataJSON().name});});
  const button = (name) => page.getByRole('button',{name,exact:true});
  const waitSolve = (predicate) => page.waitForResponse(r=>{
    if (!r.url().endsWith('/api/solve') || r.request().method() !== 'POST') return false;
    return predicate(r.request().postDataJSON());
  },{timeout:17000});
  async function responseAnd(op, predicate) {
    const [r] = await Promise.all([waitSolve(predicate), op()]);
    return {code:r.status(), request:r.request().postDataJSON(), response:await r.json()};
  }
  async function weights(w) {
    const fields=page.locator('input[aria-label^="Valor numérico peso"]');
    return responseAnd(async () => {
      const check=page.getByLabel('Auto-balancear suma fija en 1.00');
      if(w.length>2) await check.uncheck();
      for(let i=0;i<(w.length===2?1:w.length);i++) await fields.nth(i).fill(String(w[i]));
      if(w.length>2) {
        const values=await fields.evaluateAll(inputs=>inputs.map(input=>Number(input.value)));
        if(!eq(values,w)) throw new Error(`La interfaz registró ${values}, se esperaban ${w}`);
        await check.check();
      }
    }, p=>p.name===`RT ${tag}` && eq(p.weights,w));
  }
  const resultVisible=()=>button('Explorar resultados').click();
  const state=()=>page.locator('header [role=status]').innerText();
  async function visual() {
    await page.locator('.js-plotly-plot').first().waitFor({state:'visible',timeout:13000}).catch(()=>{});
    return page.evaluate(()=>{
      const table=document.querySelector('[aria-label="Datos de las soluciones"] table');
      const gd=[...document.querySelectorAll('.js-plotly-plot')].find(x=>x.getBoundingClientRect().width>0);
      const axis=gd?.layout?.xaxis?.title;
      return {table:table?.innerText, axis:typeof axis==='string'?axis:axis?.text, chart:gd?.data?.map(t=>({name:t.name,axis:t.xaxis,x:Array.from(t.x||[]),y:Array.from(t.y||[]),z:t.z&&Array.from(t.z)}))};
    });
  }
  async function shot(name) {
    await page.screenshot({path:path.join(dir,`${name}.png`),animations:'disabled'}).catch(e=>events.push({tag,screenshot:e.message}));
  }
  const records={};
  try {
    await page.goto(base,{timeout:90000});
    await page.locator('#preset-selector option[value=blank]').waitFor({state:'attached'});
    for (const [id,input] of Object.entries(cases)) {
      if (focus.length && !focus.includes(id) && !(focus.includes('FLOW')&&id==='A')) continue;
      tag=id;
      if((await page.locator('#preset-selector').inputValue())==='blank') {
        await page.locator('#preset-selector').selectOption('celdas');
        await page.waitForFunction(()=>document.querySelector('#workspace-title')?.textContent?.includes('Fotovoltaicas'));
      }
      await page.locator('#preset-selector').selectOption('blank');
      await page.getByRole('textbox',{name:'Nombre del problema'}).fill(`RT ${id}`);
      await button('Modo Algebraico').click();
      await page.getByLabel('Ecuaciones del modelo').fill(input);
      let final;
      if(['K','L','M'].includes(id)) {
        const req=waitSolve(p=>p.name===`RT ${id}` && p.objectives[0].name==='Beneficio').then(async r=>({code:r.status(),request:r.request().postDataJSON(),response:await r.json()})).catch(()=>null);
        await button('Aplicar Ecuaciones y Resolver').click();
        const alert=page.getByRole('alert').filter({hasText:'Errores de sintaxis'}).waitFor({state:'visible',timeout:9500}).then(async()=>({alert:await page.getByRole('alert').filter({hasText:'Errores de sintaxis'}).innerText()})).catch(()=>null);
        final = await Promise.race([req,alert]);
      } else {
        final = await responseAnd(()=>button('Aplicar Ecuaciones y Resolver').click(), p=>p.name===`RT ${id}` && p.objectives[0].name!== 'Objetivo 1');
      }
      let initial=final;
      if (id==='G' || id==='H') {
        await button('Formular').click();
        await button('Modo Tabla').click();
        const typeFields=page.locator('aside select').filter({has:page.locator('option[value=integer]')});
        await typeFields.nth(0).selectOption('integer');
        if(id==='H') await typeFields.nth(2).selectOption('binary');
        await resultVisible();
      }
      if(expectedWeights[id]) final=await weights(expectedWeights[id]);
      await page.waitForFunction(()=>!document.querySelector('header [role=status]')?.innerText.includes('Calculando'),null,{timeout:12000});
      records[id]={input, initialCode:initial?.code, ...final,status:await state()};
      if(final?.code===200) {
        await resultVisible();
        records[id].visual=await visual();
        if(id==='H') {
          await button('Espacio 3D').click();
          await page.waitForFunction(()=>[...document.querySelectorAll('.js-plotly-plot')].some(g=>g.data?.some(t=>t.type==='scatter3d')));
          records[id].space3d=await visual();
          await shot('H-3D');
        }
        if(id==='D'||id==='E') {
          const chart=page.getByRole('button',{name:/Región factible/i});
          await chart.click();
          await page.waitForFunction(()=>[...document.querySelectorAll('.js-plotly-plot')].some(g=>g.data?.some(t=>t.name==='Región factible visible')));
          records[id].decision=await visual();
        }
      }
      if(id==='I'){
        records[id].visual = await visual();
        const control=button('PNG');
        records[id].pngEnabled = await control.count() ? await control.isEnabled() : false;
        if(records[id].pngEnabled){
          try {
            const [download]=await Promise.all([page.waitForEvent('download',{timeout:3500}),control.click()]);
            await download.saveAs(path.join(dir,'I-png-anterior.png'));
            records[id].pngDownloaded=true;
          } catch { records[id].pngDownloaded=false; }

        }
      }
      if(id==='N'){
        const [download]=await Promise.all([page.waitForEvent('download'),button('CSV').click()]);
        await download.saveAs(path.join(dir,'N-precision.csv'));
        records[id].csv=await fs.readFile(path.join(dir,'N-precision.csv'),'utf8');
      }
      if(keywords.has(id)) await shot(id);
      await fs.writeFile(path.join(dir,'results.json'),JSON.stringify(records,null,2));
      console.log(id, final?.code??final?.alert, records[id].status, final?.response?.solutions && Object.values(final.response.solutions).map(s=>[s.metric,s.status,s.objectives,s.aggregate_distance]));
      if(id==='A' && (!focus.length || focus.includes('FLOW'))) {
        tag='FLOW';
        const flow={};
        const fields=page.locator('input[aria-label^="Valor numérico peso"]');
        for (const selected of [0,1]) {
          flow['extreme'+selected]=await responseAnd(()=>fields.nth(0).fill(String(selected)), p=>p.name==='RT A'&&eq(p.weights,[selected,1-selected]));
        }
        const rr=await responseAnd(async()=>{
          for(const value of ['0.12','0.94','0.34','0.73']) await fields.nth(0).fill(value);
        },p=>p.name==='RT A'&&eq(p.weights,[.73,.27]));
        await page.waitForFunction(()=>document.querySelector('header [role=status]')?.innerText==='Óptimo');
        flow.rapid={...rr,visual:await visual()};
        for(const kind of ['JSON','Excel','CSV','PNG']){
          const [download]=await Promise.all([page.waitForEvent('download'),button(kind).click()]);
          const filename=`RT-A-${kind}-${download.suggestedFilename()}`;
          await download.saveAs(path.join(dir,filename));
          flow[kind]={filename,size:(await fs.stat(path.join(dir,filename))).size};
        }
        await button('Sensibilidad de pesos').click();
        await page.waitForFunction(()=>[...document.querySelectorAll('.js-plotly-plot')].some(g=>g.data?.some(t=>t.xaxis==='x2' && t.x?.length===21)));
        flow.sensitivity=await visual();
        await shot('FLOW-sensibilidad');
        const check=page.getByLabel('Auto-balancear suma fija en 1.00');
        await check.uncheck();
        await fields.nth(0).fill('0.91');
        flow.invalidWeights={status:await state(),excelEnabled:await button('Excel').isEnabled()};
        await check.check();
        await fields.nth(0).fill('0.73');
        await page.waitForFunction(()=>document.querySelector('header [role=status]')?.innerText==='Óptimo');
        await button('Ver método').click();
        flow.method=await page.locator('article.method-guide').innerText();
        await shot('FLOW-metodo');
        await button('Formular').click();
        await page.getByLabel('Ecuaciones del modelo').fill(cases.A.replace('<= 10','<= 6'));
        flow.edit=await responseAnd(()=>button('Aplicar Ecuaciones y Resolver').click(),p=>p.constraints[0].rhs===6 && p.name==='RT A');
        // Disparar un cálculo y cambiar de ejercicio inmediatamente después.
        const requested=page.waitForRequest(r=>r.url().endsWith('/api/solve') && r.postDataJSON()?.name==='RT A' && eq(r.postDataJSON().weights,[.23,.77]));
        await fields.nth(0).fill('0.23');
        await requested;
        flow.switch=await responseAnd(()=>page.locator('#preset-selector').selectOption('triobjetivo'),p=>p.objectives.length===3 && p.name!=='RT A');
        await page.waitForFunction(()=>document.querySelector('header [role=status]')?.innerText==='Óptimo');
        flow.final=await visual();
        await page.setViewportSize({width:390,height:844});
        flow.mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        await shot('FLOW-movil');
        await page.setViewportSize({width:1440,height:1000});
        flow.import = {};
        for (const kind of ['JSON','Excel','CSV']) {
          flow.import[kind] = await responseAnd(async () => {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('Importar').click()]);
            await chooser.setFiles(path.join(dir,flow[kind].filename));
          },p=>p.name==='RT A'&&p.constraints[0].rhs===10&&eq(p.weights,[.73,.27]));
        }
        records.FLOW=flow;
        await fs.writeFile(path.join(dir,'results.json'),JSON.stringify(records,null,2));
      }
    }
  } finally {
    await fs.writeFile(path.join(dir,'events.json'),JSON.stringify(events,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
