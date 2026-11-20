const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');

async function main() {
  const base = process.env.RED_URL || 'http://127.0.0.1:13119';
  const artifacts = path.resolve(process.argv[2]);
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.RED_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(60000);
  const button = (name) => page.getByRole('button', { name, exact: true });
  const preset = page.getByLabel('Catálogo de ejercicios');
  const editor = page.getByLabel('Ecuaciones del modelo');
  const state = page.locator('header [role="status"]');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const screenshot = (file) => page.screenshot({ path: path.join(artifacts, file), animations: 'disabled' });

  async function submit(action, matches, code = 200) {
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/solve') &&
        r.request().method() === 'POST' && matches(r.request().postDataJSON()), { timeout: 60000 }),
      action(),
    ]);
    const body = await response.json();
    assert.equal(response.status(), code, JSON.stringify(body));
    return { body, request: response.request().postDataJSON() };
  }

  async function download(kind) {
    const [file] = await Promise.all([page.waitForEvent('download'), button(kind).click()]);
    const destination = path.join(artifacts, file.suggestedFilename());
    await file.saveAs(destination);
    assert.ok((await fs.stat(destination)).size > 0);
    return destination;
  }

  const importFile = (file) => page.getByLabel('Importar archivo de modelo').setInputFiles(file);
  const status = (label) => page.waitForFunction(
    text => document.querySelector('header [role="status"]')?.innerText === text, label
  );

  try {
    console.log('Inicio', browser.version());
    await page.goto(base);
    await status('Óptimo');
    assert.equal(await preset.locator('option').count(), 7);
    await preset.selectOption('blank');
    await button('Modo Algebraico').click();
    const equations = 'Max Ingreso = 2 x1\nMin Costo = x1\nx1 <= 7';
    await editor.fill(equations.replace('2 x1', '2 x1 3 x2'));
    await status('Borrador sin aplicar');
    for (const name of ['JSON', 'CSV', 'Excel', 'Ver método', 'Explorar resultados']) {
      assert.equal(await button(name).isEnabled(), false, name);
    }
    await button('Modo Tabla').click();
    await page.getByRole('alert').filter({ hasText: 'falta un operador' }).waitFor();
    assert.equal(await editor.inputValue(), equations.replace('2 x1', '2 x1 3 x2'));
    await editor.fill(equations);
    const applied = await submit(() => button('Modo Tabla').click(), p => p.objectives[0]?.name === 'Ingreso');
    assert.deepEqual(applied.request.variables.map(v => v.name), ['x1 (Alternativa A)']);
    assert.deepEqual(applied.body.payoff.ideal_point, [14, 0]);
    await button('Modo Algebraico').click();
    await editor.fill(equations.replace('<= 7', '<= 9'));
    const resolved = await submit(() => button('Resolver').click(), p => p.constraints[0]?.rhs === 9);
    assert.deepEqual(resolved.body.payoff.ideal_point, [18, 0]);
    await status('Óptimo');

    const weight = page.getByLabel('Valor numérico peso Ingreso');
    const extreme = await submit(() => weight.fill('0'), p => p.weights[0] === 0);
    assert.deepEqual(extreme.body.weights, [0, 1]);
    assert.equal(extreme.body.solutions.L2.aggregate_distance, 0);
    await status('Óptimo');
    await submit(() => weight.fill('0.8'), p => p.weights[0] === 0.8);
    await status('Óptimo');
    await button('Ver método').click();
    assert.ok(await page.locator('article.method-guide .katex').count() >= 3);
    assert.equal(await page.locator('.katex-error').count(), 0);
    await screenshot('metodo-claro.png');
    await page.getByTitle('Cambiar a tema oscuro').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await screenshot('metodo-oscuro-movil.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log('Borrador, sintaxis, cambio de modo, pesos extremos y método verificados');

    const model = {
      name: 'Intercambio de columnas y binaria fija',
      variables: [
        { name: 'Seccion', var_type: 'binary', lower_bound: 1, upper_bound: 1 },
        { name: 'Nombre', var_type: 'continuous', lower_bound: 0, upper_bound: 5 },
      ],
      objectives: [
        { name: 'Iguales', sense: 'maximize', coefficients: [2, 1] },
        { name: 'Iguales', sense: 'minimize', coefficients: [4, 1] },
      ],
      constraints: [{ name: 'Igualdad', coefficients: [0, 1], sense: '==', rhs: 3 }],
      weights: [0.6, 0.4],
    };
    const file = { name: 'modelo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model)) };
    await submit(() => importFile(file), p => p.name === model.name);
    await status('Óptimo');
    for (const kind of ['JSON', 'Excel', 'CSV']) {
      const exported = await download(kind);
      const { body, request } = await submit(() => importFile(exported), p => p.name === model.name);
      assert.deepEqual(request.variables, model.variables, kind);
      assert.deepEqual(request.objectives, model.objectives, kind);
      assert.deepEqual(request.constraints, model.constraints, kind);
      assert.deepEqual(request.weights, model.weights, kind);
      assert.deepEqual(body.payoff.ideal_point, [5, 7], kind);
      await status('Óptimo');
    }
    console.log('Ida y vuelta JSON, CSV y XLSX con nombres reservados, objetivos homónimos y binaria fija');

    const mixed = {
      ...model, name: 'Fibras mixtas',
      variables: [{ name: 'x', var_type: 'integer', lower_bound: 0, upper_bound: 4 },
        { name: 'y', var_type: 'continuous', lower_bound: 0, upper_bound: 2 }],
      constraints: [{ name: 'Fibra', coefficients: [-0.5, 1], sense: '==', rhs: 0 }],
    };
    const mixedFile = { ...file, buffer: Buffer.from(JSON.stringify(mixed)) };
    await submit(() => importFile(mixedFile), p => p.name === mixed.name);
    await status('Óptimo');
    await button('Explorar resultados').click();
    await page.getByRole('button', { name: /Región factible/i }).click();
    await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data?.some(
      trace => trace.name === 'Muestra mixta factible'));
    const points = await page.evaluate(() => {
      const { x, y } = document.querySelector('.js-plotly-plot').data.find(
        trace => trace.name === 'Muestra mixta factible');
      return Array.from(x, (v, i) => [v || 0, y[i] || 0]);
    });
    assert.deepEqual(points, [[0, 0], [1, 0.5], [2, 1], [3, 1.5], [4, 2]]);
    await screenshot('fibras-enteras.png');

    const tinyModel = {
      name: 'Triángulo de objetivos pequeños',
      variables: [{ name: 'x_1_', var_type: 'continuous', lower_bound: 0, upper_bound: 1 },
        { name: 'x2', var_type: 'continuous', lower_bound: 0, upper_bound: 1 }],
      objectives: [
        { name: 'Primero', sense: 'maximize', coefficients: [1e-8, 0] },
        { name: 'Segundo', sense: 'maximize', coefficients: [0, 1e-8] },
      ],
      constraints: [{ name: 'Límite preciso', coefficients: [1, 1], sense: '<=', rhs: 0.018868 }],
      weights: [0.5, 0.5],
    };
    await submit(() => importFile({ ...file, buffer: Buffer.from(JSON.stringify(tinyModel)) }),
      p => p.name === tinyModel.name);
    await status('Óptimo');
    assert.equal(await page.locator('.katex-error').count(), 0);
    assert.ok((await page.locator('.katex').allTextContents()).some(text => text.includes('0.018868')));
    await button('Explorar resultados').click();
    await button('Objetivos 2D').click();
    await page.getByLabel('Zona Factible', { exact: true }).check();
    await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data?.some(
      trace => trace.name === 'Zona factible visible'));
    const hull = await page.evaluate(() => {
      const { x, y } = document.querySelector('.js-plotly-plot').data.find(
        trace => trace.name === 'Zona factible visible');
      return Array.from(x, (v, i) => [v, y[i]]);
    });
    const edge = 0.018868 * 1e-8;
    assert.equal(hull.length, 4);
    for (const vertex of [[0, 0], [edge, 0], [0, edge]]) {
      assert.ok(hull.some(p => p.every((v, i) => Math.abs(v - vertex[i]) < 1e-18)), JSON.stringify(hull));
    }
    await submit(() => page.getByRole('button', { name: /Priorizar Z₁/ }).click(),
      p => p.name === tinyModel.name && p.weights[0] === 0.7);
    await status('Óptimo');
    await button('Formular').click();
    await button('Modo Algebraico').click();
    await editor.fill('Max Primero = 1e-8*x_1_\nMax Segundo = 1e-8*x2\nMin Tercero = x_1_ + x2\nx_1_ + x2 <= 0.018868');
    const changed = await submit(() => button('Aplicar Ecuaciones y Resolver').click(), p => p.objectives.length === 3);
    assert.ok(changed.request.weights.every(w => Math.abs(w - 1 / 3) < 1e-12));
    assert.equal(await page.getByRole('button', { name: /Iguales Mismo peso/ }).getAttribute('aria-pressed'), 'true');
    console.log('Envolvente diminuta, precisión de la vista matemática y perfil al añadir objetivo verificados');


    await submit(() => preset.selectOption('triobjetivo'), p => p.objectives.length === 3);
    await status('Óptimo');
    await button('Objetivos 2D').click();
    await page.getByLabel('Objetivo del eje X', { exact: true }).selectOption('1');
    assert.equal(await page.getByLabel('Objetivo del eje Y', { exact: true }).inputValue(), '0');
    await page.getByText('Curvas Isodistancia', { exact: true }).click();
    await screenshot('objetivos-oscuro.png');
    await button('Espacio 3D').click();
    await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data?.some(t => t.type === 'scatter3d'));
    await submit(() => preset.selectOption('flota'), p => p.objectives.length === 4);
    await status('Óptimo');
    await button('Espacio 3D').click();
    await page.getByLabel('Objetivo del eje X 3D', { exact: true }).selectOption('2');
    assert.equal(await page.getByLabel('Objetivo del eje Z 3D', { exact: true }).inputValue(), '0');
    await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data?.some(t => t.type === 'scatter3d'));
    await screenshot('ejes-3d-oscuro.png');
    console.log('Fibras, contraste oscuro y permutación de ejes 2D/3D verificados');

    const seed = page.getByLabel('Semilla de la frontera');
    await seed.fill('123');
    const seedFile = await download('JSON');
    assert.equal(JSON.parse(await fs.readFile(seedFile, 'utf8')).pareto_seed, 123);
    const previousTitle = await page.locator('#workspace-title').innerText();
    await page.route('**/api/examples/mip', route => route.fulfill({ status: 503 }));
    await preset.selectOption('mip');
    await status('Error');
    assert.equal(await page.locator('#workspace-title').innerText(), previousTitle);
    assert.equal(await button('CSV').isEnabled(), false);
    await page.unroute('**/api/examples/mip');
    console.log('Semilla exportada al editar y modelo conservado ante fallo del catálogo');


    await preset.selectOption('blank');
    await button('Modo Algebraico').click();
    await editor.fill('Max Beneficio = x1\nMin Costos = x1\n0 = 1e-20');
    const infeasible = await submit(() => button('Aplicar Ecuaciones y Resolver').click(),
      p => p.constraints[0]?.rhs === 1e-20, 400);
    assert.match(infeasible.body.detail, /infactible/);
    assert.equal(await button('CSV').isEnabled(), false);
    await status('Infactible');
    assert.deepEqual(errors, []);
    console.log('Infactibilidad y bloqueo de resultados anteriores verificados');
  } finally {
    await fs.writeFile(path.join(artifacts, 'errores.json'), JSON.stringify(errors));
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
