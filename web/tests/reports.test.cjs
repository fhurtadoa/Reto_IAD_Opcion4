const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");
const xlsx = require("xlsx");

require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};

const { fmtNum, formatVarLatex, importModelFromFile, parseAlgebraicModel } = require("../components/cockpit/mathUtils.ts");
const { buildNumericReport } = require("../components/cockpit/numericReport.ts");
const {
  decisionPlot, objectivePlot2D, objectivePlot3D, radarPlot, validParetoPoints,
} = require("../components/cockpit/resultFigures.ts");
const { sensitivityCurves, sensitivitySelection } = require("../components/cockpit/weightSensitivity.ts");

const model = {
  name: "A < B & C > D",
  variables: [
    { name: "x (existente)", var_type: "integer", lower_bound: 0, upper_bound: 6 },
    { name: "y", var_type: "continuous", lower_bound: 0, upper_bound: 10 },
  ],
  objectives: ["A < B", "C & D", "E > F"].map(name => ({
    name, sense: "maximize", coefficients: [1, 2],
  })),
  constraints: [],
};

const good = {
  objectives: [0, 2, 3], variables: { "x (existente)": 1, y: 2 },
  normalized_distances: [0, 0.5, 1], achievement_pct: [100, 50, 0], aggregate_distance: 0.5,
};
const result = {
  status: "partial", weights: [0.5, 0.25, 0.25],
  payoff: {
    headers: model.objectives.map(objective => objective.name),
    matrix: [[1, 2, 3], [0, 2, 3], [0, 1, 3]],
    ideal_point: [1, 2, 3], anti_ideal_point: [0, NaN, 1],
    normalization_ranges: [1, 1, 2],
    independent_solutions: [{}, good.variables, { "x (existente)": 1 }],
  },
  solutions: { L1: { objectives: [0, NaN] }, L2: good,
    L_inf: { objectives: [0, 1], variables: {}, achievement_pct: [10, NaN], normalized_distances: [0, Infinity] } },
  pareto_points: [
    { metric: "L1", objectives: [1], weights: [0.5] },
    { metric: "L2", objectives: good.objectives, weights: [0.5, 0.25, 0.25] },
  ],
};

test("el parser conserva los nombres existentes presentes y retira las variables borradas o renombradas", () => {
  const parsed = parseAlgebraicModel("Max Z1 = 3*x + 2*z\nMin Z2 = z\n2*z <= x + 4", model);
  assert.equal(parsed.ok, true, parsed.errors.join(" "));
  assert.deepEqual(parsed.detectedVariables, ["x (existente)", "z"]);
  assert.deepEqual(parsed.objectives.map(o => o.coefficients), [[3, 2], [0, 1]]);
  assert.deepEqual(parsed.constraints[0].coefficients, [-1, 2]);
  assert.deepEqual(parseAlgebraicModel("Max Z1 = y\nMin Z2 = y", model).detectedVariables, ["y"]);
});

test("Excel fija el dominio binario y conserva las cotas continuas y enteras", async () => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["Seccion", "Nombre", "Tipo_o_Sentido", "Min_o_RHS", "Max_o_Peso", "x", "y", "z"],
    ["Variable", "x", "binaria", -8, 9], ["Variable", "y", "continuous", "-inf", 8],
    ["Variable", "z", "entera", -2, 7],
    ["Objetivo", "Ganancia", "maximize", "", 0.5, 1, 2, 0],
    ["Objetivo", "Costo", "minimize", "", 0.5, 2, 1, 1],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, ws, "Modelo");
  const file = new File([xlsx.write(workbook, { type: "buffer", bookType: "xlsx" })], "modelo.xlsx");
  const imported = await importModelFromFile(file);
  assert.deepEqual(imported.model.variables.map(v => [v.var_type, v.lower_bound, v.upper_bound]),
    [["binary", 0, 1], ["continuous", null, 8], ["integer", -2, 7]]);
});

test("el informe del portapapeles mantiene texto literal y escapa una vez al generar HTML", () => {
  const { markdown, html } = buildNumericReport(model, result);
  assert.match(markdown, /^# A < B & C > D/);
  assert.match(markdown, /A < B/);
  assert.doesNotMatch(markdown, /&(lt|gt|amp);/);
  assert.match(html, /<h1>A &lt; B &amp; C &gt; D<\/h1>/);
  assert.doesNotMatch(html, /&amp;lt;|Infinity|NaN/);
  assert.match(markdown, /—/);
  assert.equal(fmtNum(Infinity), "—");
  assert.equal(fmtNum(0.000000123, 6), (0.000000123).toLocaleString("es-CO", {
    notation: "scientific", maximumSignificantDigits: 4,
  }));
  assert.ok(formatVarLatex("a^~").includes("\\textasciicircum{}\\textasciitilde{}"));
});

function assertValidCoordinates(traces) {
  assert.ok(traces.length);
  for (const trace of traces) {
    for (const axis of ["x", "y", "z", "r"]) {
      if (Array.isArray(trace[axis])) {
        assert.ok(trace[axis].every(value => value === null || Number.isFinite(value)), trace.name);
      }
    }
  }
}

test("figuras 2D, 3D, radar y Pareto omiten coordenadas inválidas y conservan métricas válidas", () => {
  const { data2D } = objectivePlot2D(model, result, [0, 1], false, {
    showPareto: true, showFeasibleObj: true, showIsodistance: true,
  });
  assertValidCoordinates(data2D);
  assert.ok(data2D.some(trace => trace.name === "L₂ (Euclidiana)"));
  assert.ok(data2D.some(trace => trace.name === "L∞ (Minimax)" && trace.hovertext.includes("—")));
  assert.ok(data2D.some(trace => trace.hovertext?.includes?.("A &lt; B")));
  const { data3D } = objectivePlot3D(result, [0, 1, 2], false, true);
  assertValidCoordinates(data3D);
  assert.ok(data3D.some(trace => trace.name === "L₂"));
  assert.ok(!data3D.some(trace => trace.name === "L∞"));
  const { dataRadar } = radarPlot(result, false);
  assertValidCoordinates(dataRadar);
  assert.equal(dataRadar.length, 2);
  assert.deepEqual(validParetoPoints(result), [result.pareto_points[1]]);
});

test("decisiones etiqueta óptimos válidos con su índice original y oculta compromisos sin coordenadas", () => {
  const { dataDec } = decisionPlot(model, result, false);
  assertValidCoordinates(dataDec);
  assert.deepEqual(dataDec.find(trace => trace.name === "Óptimos Individuales").text, ["x*(Z2)"]);
  assert.deepEqual(dataDec.filter(trace => trace.name.startsWith("Solución")).map(trace => trace.name), ["Solución L₂"]);
});

test("sensibilidad usa huecos para muestras incompletas y omite marcadores inválidos", () => {
  const sweep = { objective_names: ["A < B", "C & D"], l1: [
    { w1: 0, deviations_pct: [10, NaN] }, { w1: 0.5, deviations_pct: [] }, { w1: Infinity, deviations_pct: [20] },
  ] };
  const curves = sensitivityCurves(sweep, false);
  assertValidCoordinates(curves);
  assert.deepEqual(curves.map(curve => curve.y), [[10, null]]);
  const selection = sensitivitySelection(result, NaN, false);
  assertValidCoordinates(selection.traces);
  assert.equal(selection.shapes.length, 0);
});
