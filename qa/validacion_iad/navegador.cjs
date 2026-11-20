const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const input = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const filters = process.argv.slice(4);
const regions = {
  clase11: [[0,0],[0,10],[2.5,7.5],[5,0]],
  celdas: [[0,100],[0,200],[200,200],[300,100],[300,0]],
};

async function run() {
  const agenda = JSON.parse(await fs.readFile(path.join(input, 'agenda.json')));
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({
    executablePath:process.env.RED_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true,
  });
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const entries = {};
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const button = name => page.getByRole('button',{name,exact:true});

  async function verifyView(run) {
    const { solutions, payoff } = run.response;
    const expected = {
      'Ideal (Z*)':payoff.ideal_point, 'Nadir aproximado':payoff.anti_ideal_point,
      'L₁ (Compensatoria)':solutions.L1.objectives, 'L₂ (Euclidiana)':solutions.L2.objectives,
      'L∞ (Minimax)':solutions.L_inf.objectives,
    };
    const metrics = ['L1','L2','L_inf'].map(key=>solutions[key]);
    const format = (v, decimals) => {
      if (Math.abs(v) >= 10000) decimals = Math.min(decimals, 1);
      if (v !== 0 && Number(v.toFixed(decimals)) === 0) {
        return v.toLocaleString('es-CO', {notation:'scientific',maximumSignificantDigits:4});
      }
      return v.toLocaleString('es-CO', {maximumFractionDigits:decimals});
    };
    const table = [metrics.map(s=>s.aggregate_distance.toFixed(4)), ...payoff.headers.map((_,i)=>
      metrics.map(s=>`${format(s.objectives[i],2)}\n${format(s.achievement_pct[i],1)}%`))];
    const pareto = run.response.pareto_points.map(p=>p.objectives);
    await page.waitForFunction(({expected,table,pareto})=>{
      const g = document.querySelector('.js-plotly-plot');
      const rows = Array.from(document.querySelectorAll('[aria-label="Datos de las soluciones"] tbody tr'));
      return Object.entries(expected).every(([name,point])=>g?.data?.some(t=>t.name===name &&
        Math.abs(t.x[0]-point[0]) <= 1e-10 && Math.abs(t.y[0]-point[1]) <= 1e-10)) &&
        g.data.filter(t=>/^(Pareto|Unión de muestras)/.test(t.name)).every(t=>Array.from(t.x).every((x,i)=>
          pareto.some(p=>Math.abs(x-p[0]) <= 1e-10 && Math.abs(t.y[i]-p[1]) <= 1e-10))) &&
        rows.length===table.length && rows.every((row,i)=>Array.from(row.cells).slice(2).every((cell,j)=>
          cell.innerText.trim().replace(/\n+/g,'\n')===table[i][j]));
    },{expected,table,pareto},{timeout:10000});
    return page.evaluate(()=>{
      const gd = document.querySelector('.js-plotly-plot');
      const markers = gd.data.filter(t=>t.x?.length===1).map(t=>({name:t.name,x:t.x[0],y:t.y[0]}));
      const table = document.querySelector('[aria-label="Datos de las soluciones"] table').innerText;
      const plottedSamples = gd.data.filter(t=>/^(Pareto|Unión de muestras)/.test(t.name))
        .map(t=>({name:t.name,count:t.x.length}));
      return {markers,table,plottedSamples};
    });
  }

  async function solve(action, name, weights, authored=false) {
    const onResponse = page.waitForResponse(response => {
      const req = response.request();
      if (!response.url().endsWith('/api/solve') || req.method() !== 'POST') return false;
      const p = req.postDataJSON();
      return p.name === name && p.weights.every((w,i)=>Math.abs(w-weights[i]) < 1e-9)
        && (!authored || p.objectives[0].name === 'Z1');
    }, {timeout:120000});
    const [response] = await Promise.all([onResponse, action()]);
    const data = {payload:response.request().postDataJSON(), response:await response.json(), status:response.status()};
    await page.waitForFunction(()=>!document.querySelector('header [role=status]')?.innerText.includes('Calculando'), {timeout:5000});
    return data;
  }

  try {
    await page.goto(process.env.RED_URL || 'http://127.0.0.1:13104/',{timeout:90000});
    await page.locator('#preset-selector option[value=blank]').waitFor({state:'attached'});
    for (const [id, {weights}] of Object.entries(agenda)) {
      if (filters.length && !filters.includes(id)) continue;
      const filename = path.join(input,`${id}.json`);
      const definition = JSON.parse(await fs.readFile(filename));
      const first = await solve(async () => {
        if(id === 'clase11') {
          await page.locator('#preset-selector').selectOption('blank');
          await page.getByRole('textbox',{name:'Nombre del problema'}).fill(definition.name);
          for (const [i, name] of ['x1','x2'].entries()) {
            await page.getByPlaceholder('x1 (Nombre)').nth(i).fill(name);
            await page.getByPlaceholder('+∞').nth(i).fill('');
          }
          await button('Modo Algebraico').click();
          await page.getByLabel('Ecuaciones del modelo').fill(
            'Max Z1 = 4*x1 + 8*x2\nMax Z2 = 5*x1 + 3*x2\nx1 + x2 <= 10\n3*x1 + x2 <= 15');
          await button('Aplicar Ecuaciones y Resolver').click();
        } else {
          const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('Importar').click()]);
          await chooser.setFiles(filename);
        }
      }, definition.name, weights[0], id === 'clase11');
      const entry = { runs:[first] };
      entries[id] = entry;
      if (first.status === 200) {
        await button('Explorar resultados').click();
        await page.locator('.js-plotly-plot').first().waitFor({state:'visible'});
        first.view = await verifyView(first);
        if(['clase11','celdas','transporte','t2_6','t3_6','cadena_entera','metrica_discreta'].includes(id)) {
          await page.screenshot({path:path.join(output,`${id}-resultado.png`)});
        }
        if (id === 'clase11') {
          const [download] = await Promise.all([page.waitForEvent('download'), button('CSV').click()]);
          const csv = path.join(output, 'clase11-exportado.csv');
          await download.saveAs(csv);
          const contents = await fs.readFile(csv, 'utf8');
          for (const [metric,s] of Object.entries(first.response.solutions)) {
            const cells = [metric,s.status,s.aggregate_distance,...Object.values(s.variables),...s.objectives,
                           ...s.achievement_pct.map(p=>`${p}%`)];
            if (!contents.includes(cells.map(c=>`"${c}"`).join(','))) throw Error(`CSV de ${id}: ${metric}`);
          }
        }
        await button('Ver método').click();
        entry.method = await page.locator('article.method-guide').innerText();
        const formulas = await page.locator('article.method-guide annotation[encoding="application/x-tex"]').allTextContents();
        for (const formula of ['D_1=\\sum_i w_i D_i','D_2=\\sqrt{\\sum_i (w_i D_i)^2}','D_\\infty=\\max_i(w_iD_i)']) {
          if (!formulas.includes(formula)) throw Error(`Fórmula de ${id}: ${formula}`);
        }
        entry.formulas = formulas;
        if(['celdas','t3_6'].includes(id)) {
          await page.screenshot({path:path.join(output,`${id}-metodo.png`)});
        }
        if (weights.length > 1 || regions[id]) await button('Explorar resultados').click();
        for (const w of weights.slice(1)) {
          const firstWeight = page.locator('input[aria-label^="Valor numérico peso"]').first();
          const run = await solve(()=>firstWeight.fill(String(w[0])), definition.name, w);
          entry.runs.push(run);
          run.view = await verifyView(run);
          if (id === 'transporte' && w[0] === 0.25) {
            await page.screenshot({path:path.join(output,'transporte-peso-025.png')});
          }
        }
        if (regions[id]) {
          await button('Región Factible (x1 vs x2)').click();
          const close = ([x,y],[a,b])=>Math.abs(x-a) <= 1e-7 && Math.abs(y-b) <= 1e-7;
          await page.waitForFunction(()=>document.querySelector('.js-plotly-plot')?.data.some(t=>
            t.name==='Región factible visible'));
          entry.region = await page.evaluate(()=>{
            const trace = document.querySelector('.js-plotly-plot').data.find(t=>t.name==='Región factible visible');
            return Array.from(trace.x,(x,i)=>[x,trace.y[i]]);
          });
          if (!entry.region.every(point=>regions[id].some(v=>close(point,v))) ||
              !regions[id].every(v=>entry.region.some(point=>close(point,v)))) throw Error(`Región de ${id}`);
          await page.screenshot({path:path.join(output,`${id}-region.png`)});
          await button('Objetivos 2D').click();
        }
      }
      console.log(id,entry.runs.map(r=>[r.payload.weights,r.status,r.response.status]));
      await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(entries));
    }
  } finally {
    await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(entries));
    await fs.writeFile(path.join(output,'errors.json'), JSON.stringify(errors));
    await browser.close();
  }
}
run().catch(e=>{console.error(e);process.exitCode=1});
