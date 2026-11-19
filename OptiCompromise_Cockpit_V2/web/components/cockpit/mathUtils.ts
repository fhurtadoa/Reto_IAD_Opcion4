import {
  ModelDefinition,
  ObjectiveModel,
  ConstraintModel,
  ConstraintSense,
  ObjectiveSense,
  PayoffMatrixData,
  MetricSolution,
  SolveResponse,
} from "./types";

/**
 * Formatea un número compacto para visualización en tablas y ecuaciones.
 */
export function fmtNum(val: number | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || Number.isNaN(val)) return "—";
  if (Math.abs(val) >= 10000) {
    return val.toLocaleString("es-CO", { maximumFractionDigits: Math.min(decimals, 1) });
  }
  return val.toLocaleString("es-CO", { maximumFractionDigits: decimals });
}

/**
 * Formatea una combinación lineal en texto plano o LaTeX.
 */
export function formatLinearExpr(
  coeffs: number[],
  varNames: string[],
  asLatex = false
): string {
  const parts: string[] = [];
  for (let i = 0; i < varNames.length; i++) {
    const c = coeffs[i] ?? 0;
    if (Math.abs(c) < 1e-12) continue;
    const absC = Math.abs(c);
    const vRaw = varNames[i];
    const vStr = asLatex ? formatVarLatex(vRaw) : vRaw;
    const coeffStr = Math.abs(absC - 1) < 1e-9 ? "" : `${Number(absC.toFixed(4))}${asLatex ? "\\," : "*"}`;
    if (parts.length === 0) {
      parts.push(c < 0 ? `-${coeffStr}${vStr}` : `${coeffStr}${vStr}`);
    } else {
      parts.push(c < 0 ? ` - ${coeffStr}${vStr}` : ` + ${coeffStr}${vStr}`);
    }
  }
  return parts.length > 0 ? parts.join("") : "0";
}

export function formatVarLatex(name: string): string {
  // Convierte x1 -> x_{1}, x_1_2 -> x_{1,2}
  const clean = name.split(" ")[0].trim();
  const match = clean.match(/^([a-zA-Z]+)_?([0-9_]+)$/);
  if (match) {
    return `${match[1]}_{${match[2].replace(/_/g, ",")}}`;
  }
  return `\\text{${clean.replace(/[_]/g, "\\_")}}`;
}

/**
 * Convierte un ModelDefinition a texto algebraico editable.
 */
export function modelToAlgebraicText(model: ModelDefinition): string {
  const varNames = model.variables.map((v) => v.name.split(" ")[0]);
  const lines: string[] = [];

  model.objectives.forEach((obj, idx) => {
    const sense = obj.sense === "maximize" ? "Max" : "Min";
    const expr = formatLinearExpr(obj.coefficients, varNames, false);
    lines.push(`${sense} Z${idx + 1} (${obj.name}) = ${expr}`);
  });

  lines.push("s.a.");

  model.constraints.forEach((c) => {
    const expr = formatLinearExpr(c.coefficients, varNames, false);
    const sense = c.sense === "==" ? "=" : c.sense;
    lines.push(`${expr} ${sense} ${c.rhs}`);
  });

  return lines.join("\n");
}

export interface AlgebraicParseResult {
  ok: boolean;
  objectives?: ObjectiveModel[];
  constraints?: ConstraintModel[];
  detectedVariables?: string[];
  errors: string[];
}

/**
 * Parsea un bloque de texto algebraico en objetivos y restricciones lineales.
 * Retorna errores detallados en español si hay sintaxis inválida.
 */
export function parseAlgebraicModel(
  text: string,
  existingModel: ModelDefinition
): AlgebraicParseResult {
  const errors: string[] = [];
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  if (rawLines.length === 0) {
    return { ok: false, errors: ["El editor algebraico está vacío. Ingresa al menos 2 objetivos."] };
  }

  const knownVars = existingModel.variables.map((v) => v.name.split(" ")[0].trim());
  const varList = [...knownVars];

  const ensureVar = (v: string): number => {
    const idx = varList.indexOf(v);
    if (idx >= 0) return idx;
    varList.push(v);
    return varList.length - 1;
  };

  const parseLinearSide = (expr: string, lineNo: number): number[] | null => {
    const clean = expr.replace(/\s+/g, "");
    if (!clean) {
      errors.push(`Línea ${lineNo}: expresión vacía.`);
      return null;
    }
    // Validar caracteres permitidos
    if (/[^a-zA-Z0-9_+\-.*]/.test(clean)) {
      errors.push(`Línea ${lineNo}: contiene caracteres no reconocidos en "${expr}".`);
      return null;
    }

    const coeffsMap: Record<string, number> = {};
    // Separar por + o - manteniendo el signo
    const normalized = clean.startsWith("+") || clean.startsWith("-") ? clean : `+${clean}`;
    const termRegex = /([+-])([^+-]+)/g;
    let match: RegExpExecArray | null;
    let consumed = 0;

    while ((match = termRegex.exec(normalized)) !== null) {
      consumed += match[0].length;
      const sign = match[1] === "-" ? -1 : 1;
      const body = match[2];

      // Forma: [numero][*][variable] o [variable]
      const mTerm = body.match(/^(\d+(?:\.\d+)?)?\*?([a-zA-Z][a-zA-Z0-9_]*)$/);
      if (!mTerm) {
        errors.push(`Línea ${lineNo}: término inválido "${match[0]}". Usa formato como "3*x1" o "2x1".`);
        return null;
      }
      const numVal = mTerm[1] !== undefined ? parseFloat(mTerm[1]) : 1.0;
      const varName = mTerm[2];
      if (Number.isNaN(numVal)) {
        errors.push(`Línea ${lineNo}: coeficiente numérico inválido en "${match[0]}".`);
        return null;
      }
      ensureVar(varName);
      coeffsMap[varName] = (coeffsMap[varName] || 0) + sign * numVal;
    }

    if (consumed !== normalized.length) {
      errors.push(`Línea ${lineNo}: no se pudo interpretar completamente "${expr}".`);
      return null;
    }

    return varList.map((v) => coeffsMap[v] || 0);
  };

  const parsedObjectives: { name: string; sense: ObjectiveSense; rawCoeffs: number[] }[] = [];
  const parsedConstraints: { name: string; sense: ConstraintSense; rhs: number; rawCoeffs: number[] }[] = [];
  let inConstraints = false;

  rawLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/^(s\.a\.?|sujeto\s+a:?|restricciones:?)$/i.test(line)) {
      inConstraints = true;
      return;
    }

    if (!inConstraints && /^(max|min|maximizar|minimizar)\b/i.test(line)) {
      const mObj = line.match(/^(max|min|maximizar|minimizar)\s+([^=]+?)\s*=\s*(.+)$/i);
      if (!mObj) {
        errors.push(`Línea ${lineNo}: formato de objetivo inválido. Ejemplo: "Max Z1 = 1000*x1 + 3000*x2".`);
        return;
      }
      const sense: ObjectiveSense = /^max/i.test(mObj[1]) ? "maximize" : "minimize";
      const labelMatch = mObj[2].match(/\(([^)]+)\)/);
      const name = labelMatch ? labelMatch[1].trim() : mObj[2].trim();
      const coeffs = parseLinearSide(mObj[3], lineNo);
      if (coeffs) {
        parsedObjectives.push({ name, sense, rawCoeffs: coeffs });
      }
      return;
    }

    // Restricción
    inConstraints = true;
    const mCon = line.match(/^(.+?)\s*(<=|>=|==|=)\s*([+-]?\d+(?:\.\d+)?)$/);
    if (!mCon) {
      errors.push(
        `Línea ${lineNo}: formato de restricción inválido ("${line}"). Ejemplo: "x1 + x2 <= 400".`
      );
      return;
    }
    const lhs = mCon[1].trim();
    const rawSense = mCon[2];
    const rhs = parseFloat(mCon[3]);
    if (Number.isNaN(rhs)) {
      errors.push(`Línea ${lineNo}: lado derecho numérico inválido.`);
      return;
    }
    const sense: ConstraintSense = rawSense === "=" ? "==" : (rawSense as ConstraintSense);
    const coeffs = parseLinearSide(lhs, lineNo);
    if (coeffs) {
      const existingName = existingModel.constraints[parsedConstraints.length]?.name;
      parsedConstraints.push({
        name: existingName || `Restricción ${parsedConstraints.length + 1}`,
        sense,
        rhs,
        rawCoeffs: coeffs,
      });
    }
  });

  if (parsedObjectives.length < 2) {
    errors.push("Un problema multiobjetivo requiere al menos 2 funciones objetivo (Max/Min).");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const totalVars = varList.length;
  const pad = (arr: number[]) => {
    const out = [...arr];
    while (out.length < totalVars) out.push(0);
    return out;
  };

  return {
    ok: true,
    detectedVariables: varList,
    objectives: parsedObjectives.map((o) => ({
      name: o.name,
      sense: o.sense,
      coefficients: pad(o.rawCoeffs),
    })),
    constraints: parsedConstraints.map((c) => ({
      name: c.name,
      sense: c.sense,
      rhs: c.rhs,
      coefficients: pad(c.rawCoeffs),
    })),
    errors: [],
  };
}

/**
 * Genera el código LaTeX completo del modelo para vista previa matemática.
 */
export function modelToLatex(model: ModelDefinition): string {
  const varNames = model.variables.map((v) => v.name);
  const objLines = model.objectives.map((obj, idx) => {
    const sense = obj.sense === "maximize" ? "\\max" : "\\min";
    const expr = formatLinearExpr(obj.coefficients, varNames, true);
    return `${sense}\\; Z_{${idx + 1}} &= ${expr}`;
  });

  const conLines = model.constraints.map((c) => {
    const expr = formatLinearExpr(c.coefficients, varNames, true);
    const op = c.sense === "<=" ? "\\le" : c.sense === ">=" ? "\\ge" : "=";
    return `${expr} &${op} ${fmtNum(c.rhs, 2)}`;
  });

  const domainLines = model.variables.map((v) => {
    const vn = formatVarLatex(v.name);
    if (v.var_type === "binary") return `${vn} \\in \\{0,1\\}`;
    const lb = v.lower_bound !== null && v.lower_bound !== undefined ? v.lower_bound : "-\\infty";
    const ub = v.upper_bound !== null && v.upper_bound !== undefined ? v.upper_bound : "+\\infty";
    const dom = v.var_type === "integer" ? ",\\;\\mathbb{Z}" : "";
    if (ub === "+\\infty") return `${vn} \\ge ${lb}${dom}`;
    return `${lb} \\le ${vn} \\le ${ub}${dom}`;
  });

  const parts = [
    "\\begin{aligned}",
    ...objLines.map((l) => `${l} \\\\`),
    "\\text{s.a.}\\quad & \\\\",
    ...conLines.map((l) => `${l} \\\\`),
    `\\text{Dominio:}\\quad & ${domainLines.slice(0, 6).join(",\\; ")}${domainLines.length > 6 ? ",\\;\\dots" : ""}`,
    "\\end{aligned}",
  ];
  return parts.join("\n");
}

/**
 * Genera las fórmulas LaTeX dinámicas para el Acordeón "Modo Rayos X (L_inf)".
 */
export function buildLinfXRayLatex(
  model: ModelDefinition,
  payoff: PayoffMatrixData,
  weights: number[],
  solLinf?: MetricSolution
): { headerLatex: string; constraintsLatex: string[]; lambdaVal: number | null } {
  const varNames = model.variables.map((v) => v.name);
  const headerLatex = `\\min\\; \\lambda \\quad \\text{sujeto a } \\lambda \\ge 0,\\; w_i \\cdot D_i(x) \\le \\lambda\\; \\forall i`;

  const constraintsLatex = model.objectives.map((obj, i) => {
    const w = weights[i] ?? 1 / model.objectives.length;
    const zIdeal = payoff.ideal_point[i] ?? 0;
    const zNadir = payoff.anti_ideal_point[i] ?? 0;
    const denom = Math.abs(zIdeal - zNadir) > 1e-9 ? Math.abs(zIdeal - zNadir) : 1;
    const zExpr = formatLinearExpr(obj.coefficients, varNames, true);
    const numLatex =
      obj.sense === "maximize"
        ? `${fmtNum(zIdeal, 2)} - (${zExpr})`
        : `(${zExpr}) - ${fmtNum(zIdeal, 2)}`;
    const dVal = solLinf?.normalized_distances?.[i];
    const wdVal = dVal !== undefined ? w * dVal : null;
    const evalSuffix =
      wdVal !== undefined && wdVal !== null
        ? `\\quad \\Rightarrow \\; ${wdVal.toFixed(4)} \\le ${(solLinf?.aggregate_distance ?? 0).toFixed(4)}`
        : "";
    return `${w.toFixed(3)} \\cdot \\frac{${numLatex}}{${fmtNum(denom, 2)}} \\le \\lambda ${evalSuffix}`;
  });

  return {
    headerLatex,
    constraintsLatex,
    lambdaVal: solLinf ? solLinf.aggregate_distance : null,
  };
}

/**
 * Calcula el polígono convexo de la región factible en 2D (cuando n_vars === 2)
 * mediante intersección de semiplanos (Sutherland-Hodgman).
 */
export function computeFeasiblePolygon2D(model: ModelDefinition): { x: number[]; y: number[] } | null {
  if (model.variables.length !== 2) return null;

  const v0 = model.variables[0];
  const v1 = model.variables[1];
  const lb0 = v0.lower_bound ?? -1000;
  const lb1 = v1.lower_bound ?? -1000;

  // Estimar cota superior visual si upper_bound es null
  let maxEst = 100;
  model.constraints.forEach((c) => {
    const a = c.coefficients[0] ?? 0;
    const b = c.coefficients[1] ?? 0;
    if (Math.abs(a) > 1e-9 && c.rhs / a > 0) maxEst = Math.max(maxEst, (c.rhs / a) * 1.2);
    if (Math.abs(b) > 1e-9 && c.rhs / b > 0) maxEst = Math.max(maxEst, (c.rhs / b) * 1.2);
  });
  const ub0 = v0.upper_bound ?? maxEst;
  const ub1 = v1.upper_bound ?? maxEst;

  type Pt = [number, number];
  let poly: Pt[] = [
    [lb0, lb1],
    [ub0, lb1],
    [ub0, ub1],
    [lb0, ub1],
  ];

  // Recorta polígono por a*x + b*y <= rhs
  const clipHalfPlane = (pts: Pt[], a: number, b: number, rhs: number): Pt[] => {
    if (pts.length === 0) return [];
    const inside = (p: Pt) => a * p[0] + b * p[1] <= rhs + 1e-7;
    const intersect = (p1: Pt, p2: Pt): Pt => {
      const f1 = a * p1[0] + b * p1[1] - rhs;
      const f2 = a * p2[0] + b * p2[1] - rhs;
      const t = Math.abs(f1 - f2) > 1e-12 ? f1 / (f1 - f2) : 0.5;
      return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    };

    const output: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);
      if (currIn) {
        if (!prevIn) output.push(intersect(prev, curr));
        output.push(curr);
      } else if (prevIn) {
        output.push(intersect(prev, curr));
      }
    }
    return output;
  };

  for (const c of model.constraints) {
    const a = c.coefficients[0] ?? 0;
    const b = c.coefficients[1] ?? 0;
    if (c.sense === "<=") {
      poly = clipHalfPlane(poly, a, b, c.rhs);
    } else if (c.sense === ">=") {
      poly = clipHalfPlane(poly, -a, -b, -c.rhs);
    } else if (c.sense === "==") {
      // Para igualdad, damos una banda delgada visual o la línea exacta
      const tol = Math.max(Math.abs(ub0 - lb0), Math.abs(ub1 - lb1)) * 0.005;
      poly = clipHalfPlane(poly, a, b, c.rhs + tol);
      poly = clipHalfPlane(poly, -a, -b, -c.rhs + tol);
    }
  }

  if (poly.length < 2) return null;
  const closed = [...poly, poly[0]];
  return {
    x: closed.map((p) => p[0]),
    y: closed.map((p) => p[1]),
  };
}

/**
 * Calcula curvas de isodistancia (L1 rombo, L2 elipse, L_inf rectángulo) en el espacio
 * de objetivos 2D centradas en el Punto Ideal Z* y pasando por cada solución compromiso.
 */
export function computeIsodistanceTraces2D(
  model: ModelDefinition,
  payoff: PayoffMatrixData,
  weights: number[],
  solutions: SolveResponse["solutions"],
  idxX: number,
  idxY: number
): Array<{ name: string; x: number[]; y: number[]; color: string; dash: string }> {
  const zIdX = payoff.ideal_point[idxX];
  const zIdY = payoff.ideal_point[idxY];
  const zNadX = payoff.anti_ideal_point[idxX];
  const zNadY = payoff.anti_ideal_point[idxY];

  const rX = Math.abs(zIdX - zNadX) || 1;
  const rY = Math.abs(zIdY - zNadY) || 1;
  const sX = model.objectives[idxX]?.sense === "maximize" ? -1 : 1;
  const sY = model.objectives[idxY]?.sense === "maximize" ? -1 : 1;

  const wX = Math.max(weights[idxX] ?? 0.5, 1e-4);
  const wY = Math.max(weights[idxY] ?? 0.5, 1e-4);

  const traces: Array<{ name: string; x: number[]; y: number[]; color: string; dash: string }> = [];

  // L1: wX * dX + wY * dY = R1 (cuadrante dX>=0, dY>=0 + reflejo ligero para mostrar rombo)
  const sol1 = solutions.L1;
  if (sol1 && sol1.normalized_distances.length > Math.max(idxX, idxY)) {
    const R1 = wX * sol1.normalized_distances[idxX] + wY * sol1.normalized_distances[idxY];
    if (R1 > 1e-6) {
      const dxMax = R1 / wX;
      const dyMax = R1 / wY;
      // Cuadrante factible hacia el anti-ideal (segmento diagonal del rombo)
      const pts: [number, number][] = [
        [zIdX + sX * dxMax * rX, zIdY],
        [zIdX, zIdY + sY * dyMax * rY],
      ];
      traces.push({
        name: "Isodistancia L1 (Rombo)",
        x: pts.map((p) => p[0]),
        y: pts.map((p) => p[1]),
        color: "#06B6D4",
        dash: "dot",
      });
    }
  }

  // L2: wX * dX^2 + wY * dY^2 = R2^2 (arco de elipse en el cuadrante factible)
  const sol2 = solutions.L2;
  if (sol2 && sol2.normalized_distances.length > Math.max(idxX, idxY)) {
    const R2sq =
      wX * sol2.normalized_distances[idxX] ** 2 + wY * sol2.normalized_distances[idxY] ** 2;
    if (R2sq > 1e-9) {
      const rx = Math.sqrt(R2sq / wX);
      const ry = Math.sqrt(R2sq / wY);
      const xs: number[] = [];
      const ys: number[] = [];
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const theta = (Math.PI / 2) * (k / steps);
        const dx = rx * Math.cos(theta);
        const dy = ry * Math.sin(theta);
        xs.push(zIdX + sX * dx * rX);
        ys.push(zIdY + sY * dy * rY);
      }
      traces.push({
        name: "Isodistancia L2 (Elipse)",
        x: xs,
        y: ys,
        color: "#10B981",
        dash: "dash",
      });
    }
  }

  // L_inf: max(wX * dX, wY * dY) = lambda (esquina de cuadrado/rectángulo)
  const solInf = solutions.L_inf;
  if (solInf && solInf.normalized_distances.length > Math.max(idxX, idxY)) {
    const lam = Math.max(
      wX * solInf.normalized_distances[idxX],
      wY * solInf.normalized_distances[idxY]
    );
    if (lam > 1e-6) {
      const dx = lam / wX;
      const dy = lam / wY;
      const cornerX = zIdX + sX * dx * rX;
      const cornerY = zIdY + sY * dy * rY;
      traces.push({
        name: "Isodistancia L∞ (Cuadrado)",
        x: [cornerX, cornerX, zIdX],
        y: [zIdY, cornerY, cornerY],
        color: "#8B5CF6",
        dash: "dashdot",
      });
    }
  }

  return traces;
}

/**
 * Exporta el modelo actual a JSON descargable.
 */
export function exportModelJSON(model: ModelDefinition, weights: number[]) {
  const payload = { ...model, weights };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta los resultados de optimización a un archivo CSV estructurado.
 */
export function exportResultsCSV(model: ModelDefinition, result: SolveResponse) {
  const rows: string[][] = [];
  rows.push(["OptiCompromise - Reporte de Resultados Multiobjetivo"]);
  rows.push(["Modelo", model.name]);
  rows.push([]);

  // Matriz de Pagos
  rows.push(["MATRIZ DE PAGOS"]);
  rows.push(["Solución Óptima de:", ...result.payoff.headers]);
  result.payoff.matrix.forEach((row, idx) => {
    rows.push([result.payoff.headers[idx], ...row.map((v) => v.toFixed(4))]);
  });
  rows.push(["Punto Ideal (Z*)", ...result.payoff.ideal_point.map((v) => v.toFixed(4))]);
  rows.push(["Punto Nadir (Anti-Ideal)", ...result.payoff.anti_ideal_point.map((v) => v.toFixed(4))]);
  rows.push([]);

  // Soluciones Compromiso
  rows.push(["SOLUCIONES DE COMPROMISO"]);
  const varNames = model.variables.map((v) => v.name);
  rows.push([
    "Métrica",
    "Distancia D_p",
    ...varNames,
    ...result.payoff.headers.map((h) => `Z: ${h}`),
    ...result.payoff.headers.map((h) => `% Logro: ${h}`),
  ]);

  (["L1", "L2", "L_inf"] as const).forEach((key) => {
    const sol = result.solutions[key];
    if (!sol) return;
    rows.push([
      key,
      sol.aggregate_distance.toFixed(6),
      ...varNames.map((vn) => (sol.variables[vn] ?? 0).toFixed(4)),
      ...sol.objectives.map((z) => z.toFixed(4)),
      ...sol.achievement_pct.map((p) => `${p.toFixed(2)}%`),
    ]);
  });

  const csvContent = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resultados_${model.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
