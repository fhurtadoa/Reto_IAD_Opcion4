const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.RED_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const button = name => page.getByRole('button', {name,exact:true});
  const evidence = path.join(__dirname,'evidencia');
  await fs.mkdir(evidence,{recursive:true});
  try {
    await page.goto(process.env.RED_URL || 'http://127.0.0.1:13104/');
    await page.locator('#preset-selector option[value=blank]').waitFor({state:'attached'});
    await page.locator('#preset-selector').selectOption('blank');
    await page.getByRole('textbox',{name:'Nombre del problema'}).fill('GAMS EPSCM Energia');
    for (const [i,name] of ['lb','lm'].entries()) {
      await page.getByPlaceholder('x1 (Nombre)').nth(i).fill(name);
      await page.getByPlaceholder('+∞').nth(i).fill('');
    }
    await button('Modo Algebraico').click();
    const equations = page.getByLabel('Ecuaciones del modelo');
    const model = (await fs.readFile(path.join(__dirname,'energia.txt'),'utf8')).trim();
    for (const [id, extra] of [['energia',''],['energia_s13','\n1.44*lb + 1.44*lm + 0.72*om + 0.72*op + 0.45*gb + 0.45*gm + 0.45*gp <= 53820\nlb + lm + rb + rp >= 39000']]) {
      if (extra) {
        await button('Formular').click();
        if (!(await equations.isVisible())) await button('Modo Algebraico').click();
      }
      await equations.fill(model+extra);
      const response = page.waitForResponse(async r=>r.url().endsWith('/api/solve') &&
        r.request().method()==='POST' && r.request().postDataJSON().constraints.length===(extra?9:7)
        && r.request().postDataJSON().objectives[2]?.name==='Endogena');
      await button('Aplicar Ecuaciones y Resolver').click();
      await capture(id,await response);
    }

    if (process.argv.includes("--solo-energia")) return;
    const binaryResponse = page.waitForResponse(r=>r.url().endsWith('/api/solve') &&
      r.request().method()==='POST' && r.request().postDataJSON().name==='GAMS EPSCMMIP Mochila',
      {timeout:120000});
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),button('Importar').click()]);
    await chooser.setFiles(path.join(__dirname,'mochila.json'));
    await capture('mochila',await binaryResponse);
  } finally {
    await browser.close();
  }

  async function capture(id,response) {
    const payload = response.request().postDataJSON();
    if (response.status()!==200) throw Error(id+" HTTP "+response.status()+" "+await response.text());
    const result = await response.json();
    await button('Explorar resultados').click();
    const table = page.getByRole('region',{name:'Datos de las soluciones'});
    await table.getByText(payload.objectives[0].name,{exact:false}).first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.js-plotly-plot')?.data?.length);
    if (id === 'energia_s13' && result.status === 'optimal') {
      await page.waitForFunction(() => {
        const chart = document.querySelector('.js-plotly-plot');
        const range = chart?.layout?.yaxis?.range;
        const center = (range?.[0] + range?.[1]) / 2;
        return Math.abs(center - 53820) < 1e-6 && range[1] - range[0] > 1;
      });
    }
    const rendered = await table.innerText();
    await page.screenshot({path:path.join(evidence,id+'.png')});
    const [download] = await Promise.all([page.waitForEvent('download'),button('CSV').click()]);
    await download.saveAs(path.join(evidence,id+'.csv'));
    await fs.writeFile(path.join(evidence,id+'.json'),JSON.stringify({payload,result,rendered},null,2)+'\n');
    console.log(id,result.status,Object.fromEntries(Object.entries(result.solutions).map(([k,v])=>[k,[v.status,v.objectives,v.aggregate_distance]])));
  }
}
main().catch(e=>{console.error(e); process.exitCode=1;});
