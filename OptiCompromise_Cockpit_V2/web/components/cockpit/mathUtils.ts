import * as XLSX from "xlsx";
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
 * Formatea un número compacto para visualización en tablas (locale es-CO).
 */
export function fmtNum(val: number | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || Number.isNaN(val)) return "—";
  if (Math.abs(val) >= 10000) {
    return val.toLocaleString("es-CO", { maximumFractionDigits: Math.min(decimals, 1) });
  }
  return val.toLocaleString("es-CO", { maximumFractionDigits: decimals });
}

/**
 * Formatea números limpios para KaTeX/LaTeX (punto decimal estándar y separador fino \, para miles,
 * evitando la coma española que genera espacios extra en modo matemático).
 */
export function fmtLatexNum(val: number | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || Number.isNaN(val)) return "0";
  const rounded = Number(val.toFixed(Math.abs(val) >= 10000 ? Math.min(decimals, 1) : decimals));
  const [intPart, decPart] = String(rounded).split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = intPart.replace("-", "");
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\\,");
  return decPart ? `${sign}${withSep}.${decPart}` : `${sign}${withSep}`;
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
    if (asLatex ? Math.abs(c) < 1e-12 : c === 0) continue;
    const absC = Math.abs(c);
    const vRaw = varNames[i];
    const vStr = asLatex ? formatVarLatex(vRaw) : vRaw;
    const coeffStr = (asLatex ? Math.abs(absC - 1) < 1e-9 : absC === 1) ? "" : `${asLatex ? Number(absC.toFixed(4)) : absC}${asLatex ? "\\," : "*"}`;
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
function algebraicVariableTokens(model: ModelDefinition): string[] {
  const names = model.variables.map((v) => v.name.trim().split(/\s+/)[0]);
  const reserved = new Set(names);
  return names.map((name, i) => {
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) && names.indexOf(name) === names.lastIndexOf(name)) return name;
    let token = `var_${i + 1}`;
    while (reserved.has(token)) token += "_";
    return token;
  });
}

export function modelToAlgebraicText(model: ModelDefinition): string {
  const varNames = algebraicVariableTokens(model);
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
 * Soporta constantes aditivas, variables en ambos lados de las restricciones,
 * paréntesis anidados en nombres de objetivos y comas decimales.
 * Retorna errores detallados en español si hay sintaxis inválida.
 */
export function parseAlgebraicModel(
  text: string,
  existingModel: ModelDefinition
): AlgebraicParseResult {
  const errors: string[] = [];
  // Normalizar símbolos Unicode comunes (≤, ≥, −) y comas decimales (2,5 -> 2.5)
  const sanitizedText = text
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[−–—]/g, "-")
    .replace(/(\d),(\d)/g, "$1.$2");

  const rawLines = sanitizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  if (rawLines.length === 0) {
    return { ok: false, errors: ["El editor algebraico está vacío. Ingresa al menos 2 objetivos."] };
  }

  // Preservar mapa token -> nombre completo (ej. "x1" -> "x1 (BYD Seal)")
  const tokenToFullName = new Map<string, string>();
  const varList: string[] = [];
  algebraicVariableTokens(existingModel).forEach((token, i) => {
    tokenToFullName.set(token, existingModel.variables[i].name);
    varList.push(token);
  });

  const ensureVar = (v: string): number => {
    const idx = varList.indexOf(v);
    if (idx >= 0) return idx;
    varList.push(v);
    tokenToFullName.set(v, v);
    return varList.length - 1;
  };

  const parseLinearSide = (
    expr: string,
    lineNo: number
  ): { coeffsMap: Record<string, number>; constant: number } | null => {
    const clean = expr.replace(/\s+/g, "");
    if (!clean) {
      errors.push(`Línea ${lineNo}: expresión vacía.`);
      return null;
    }
    if (/[^a-zA-Z0-9_+\-.*]/.test(clean)) {
      errors.push(`Línea ${lineNo}: contiene caracteres no reconocidos en "${expr}".`);
      return null;
    }

    const coeffsMap: Record<string, number> = Object.create(null);
    let constant = 0;
    const normalized = clean.startsWith("+") || clean.startsWith("-") ? clean : `+${clean}`;
    const termRegex = /([+-])((?:[^+-]|(?<=[0-9][eE])[+-])+)/g;
    let match: RegExpExecArray | null;
    let consumed = 0;

    while ((match = termRegex.exec(normalized)) !== null) {
      consumed += match[0].length;
      const sign = match[1] === "-" ? -1 : 1;
      const body = match[2];

      // Forma 1: constante numérica pura (ej. "+100" o "50")
      if (/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(body)) {
        const cVal = parseFloat(body);
        if (Number.isNaN(cVal)) {
          errors.push(`Línea ${lineNo}: constante numérica inválida "${match[0]}".`);
          return null;
        }
        constant += sign * cVal;
        continue;
      }

      // Forma 2: [numero][*][variable] o [variable]
      const mTerm = body.match(/^(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)?\*?([a-zA-Z][a-zA-Z0-9_]*)$/);
      if (!mTerm) {
        errors.push(`Línea ${lineNo}: término inválido "${match[0]}". Usa formato como "3*x1", "2x1" o "1e3*x1".`);
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

    return { coeffsMap, constant };
  };

  const extractObjectiveName = (headerPart: string): string => {
    const trimmed = headerPart.trim();
    const firstParen = trimmed.indexOf("(");
    const lastParen = trimmed.lastIndexOf(")");
    if (firstParen !== -1 && lastParen > firstParen) {
      return trimmed.slice(firstParen + 1, lastParen).trim();
    }
    return trimmed;
  };

  const parsedObjectives: { name: string; sense: ObjectiveSense; coeffsMap: Record<string, number> }[] = [];
  const parsedConstraints: { name: string; sense: ConstraintSense; rhs: number; coeffsMap: Record<string, number> }[] = [];
  let inConstraints = false;

  rawLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/^(s\.a\.?|sujeto\s+a:?|restricciones:?)$/i.test(line)) {
      inConstraints = true;
      return;
    }

    if (!inConstraints && /^(max|min|maximizar|minimizar)\b/i.test(line)) {
      const mObjNamed = line.match(/^(max|min|maximizar|minimizar)\s+([^=]+?)\s*=\s*(.+)$/i);
      const mObjDirect = !mObjNamed ? line.match(/^(max|min|maximizar|minimizar)\s+(.+)$/i) : null;

      if (!mObjNamed && !mObjDirect) {
        errors.push(`Línea ${lineNo}: formato de objetivo inválido. Ejemplo: "Max Z1 = 1000*x1 + 3000*x2".`);
        return;
      }

      const rawSense = mObjNamed ? mObjNamed[1] : mObjDirect![1];
      const sense: ObjectiveSense = /^max/i.test(rawSense) ? "maximize" : "minimize";
      const name = mObjNamed
        ? extractObjectiveName(mObjNamed[2])
        : existingModel.objectives[parsedObjectives.length]?.name || `Objetivo ${parsedObjectives.length + 1}`;
      const rhsExpr = mObjNamed ? mObjNamed[3] : mObjDirect![2];

      const parsedSide = parseLinearSide(rhsExpr, lineNo);
      if (parsedSide?.constant) {
        errors.push(`Línea ${lineNo}: los objetivos con término independiente requieren retirar esa constante.`);
      } else if (parsedSide) {
        parsedObjectives.push({ name, sense, coeffsMap: parsedSide.coeffsMap });
      }
      return;
    }

    // Restricción (soporta variables y constantes en ambos lados: lhs op rhs)
    inConstraints = true;
    const mCon = line.match(/^(.+?)\s*(<=|>=|==|=)\s*(.+)$/);
    if (!mCon) {
      errors.push(
        `Línea ${lineNo}: formato de restricción inválido ("${line}"). Ejemplo: "x1 + x2 <= 400" o "x1 <= 2*x2".`
      );
      return;
    }
    const lhsParsed = parseLinearSide(mCon[1].trim(), lineNo);
    const rhsParsed = parseLinearSide(mCon[3].trim(), lineNo);
    if (!lhsParsed || !rhsParsed) return;

    const rawSense = mCon[2];
    const sense: ConstraintSense = rawSense === "=" ? "==" : (rawSense as ConstraintSense);
    const netCoeffs: Record<string, number> = { ...lhsParsed.coeffsMap };
    for (const [v, val] of Object.entries(rhsParsed.coeffsMap)) {
      netCoeffs[v] = (netCoeffs[v] || 0) - val;
    }
    const netRhs = rhsParsed.constant - lhsParsed.constant;
    const existingName = existingModel.constraints[parsedConstraints.length]?.name;
    parsedConstraints.push({
      name: existingName || `Restricción ${parsedConstraints.length + 1}`,
      sense,
      rhs: netRhs,
      coeffsMap: netCoeffs,
    });
  });

  if (parsedObjectives.length < 2) {
    errors.push("Un problema multiobjetivo requiere al menos 2 funciones objetivo (Max/Min).");
  }

  const finalVars = varList;
  if (finalVars.length < 1 && errors.length === 0) {
    errors.push("El modelo debe incluir al menos 1 variable de decisión en sus ecuaciones.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    detectedVariables: finalVars.map((tok) => tokenToFullName.get(tok) || tok),
    objectives: parsedObjectives.map((o) => ({
      name: o.name,
      sense: o.sense,
      coefficients: finalVars.map((v) => o.coeffsMap[v] || 0),
    })),
    constraints: parsedConstraints.map((c) => ({
      name: c.name,
      sense: c.sense,
      rhs: c.rhs,
      coefficients: finalVars.map((v) => c.coeffsMap[v] || 0),
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
    return `${expr} &${op} ${fmtLatexNum(c.rhs, 2)}`;
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
    const denom = payoff.normalization_ranges?.[i] || Math.abs(zIdeal - zNadir) || 1;
    const zExpr = formatLinearExpr(obj.coefficients, varNames, true);
    const zIdealStr = zIdeal < 0 ? `(${fmtLatexNum(zIdeal, 2)})` : fmtLatexNum(zIdeal, 2);
    const numLatex =
      obj.sense === "maximize"
        ? `${zIdealStr} - (${zExpr})`
        : `(${zExpr}) - ${zIdealStr}`;
    const dVal = solLinf?.normalized_distances?.[i];
    const wdVal = dVal !== undefined ? w * dVal : null;
    const evalSuffix =
      wdVal !== undefined && wdVal !== null
        ? `\\quad \\Rightarrow \\; ${wdVal.toFixed(4)} \\le ${(solLinf?.aggregate_distance ?? 0).toFixed(4)}`
        : "";
    return `${w.toFixed(3)} \\cdot \\frac{${numLatex}}{${fmtLatexNum(denom, 2)}} \\le \\lambda ${evalSuffix}`;
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
export function computeFeasiblePolygon2D(
  model: ModelDefinition,
  payoff?: PayoffMatrixData,
): { x: number[]; y: number[] } | null {
  if (model.variables.length !== 2) return null;

  const [xBounds, yBounds] = model.variables.map((variable, idx) => {
    const rawLower = variable.var_type === "binary" ? Math.max(0, variable.lower_bound ?? 0) : variable.lower_bound;
    const rawUpper = variable.var_type === "binary" ? Math.min(1, variable.upper_bound ?? 1) : variable.upper_bound;
    const [lower, upper] = payoff?.decision_ranges_2d?.[idx] ?? [rawLower, rawUpper];
    const witnesses = payoff?.independent_solutions.map((point) => point[variable.name]) ?? [0];
    const minWitness = Math.min(...witnesses, lower ?? Infinity, upper ?? Infinity);
    const maxWitness = Math.max(...witnesses, lower ?? -Infinity, upper ?? -Infinity);
    const pad = Math.max(1, maxWitness - minWitness) * 0.5;
    return [lower ?? minWitness - pad, upper ?? maxWitness + pad];
  });
  const [lb0, ub0] = xBounds;
  const [lb1, ub1] = yBounds;

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
      poly = clipHalfPlane(poly, a, b, c.rhs);
      poly = clipHalfPlane(poly, -a, -b, -c.rhs);
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
 * Proyecta el polígono factible 2D del espacio de decisiones al espacio de objetivos (Z_x, Z_y)
 * mediante la envolvente convexa (Andrew's monotone chain) de los vértices transformados.
 */
export function computeFeasibleObjectivesPolygon2D(
  model: ModelDefinition,
  idxX: number,
  idxY: number,
  payoff?: PayoffMatrixData,
): { x: number[]; y: number[] } | null {
  if (model.variables.length !== 2) return null;
  const objX = model.objectives[idxX];
  const objY = model.objectives[idxY];
  if (!objX || !objY) return null;

  const decPoly = computeFeasiblePolygon2D(model, payoff);
  if (!decPoly || decPoly.x.length < 2) return null;

  const evalObj = (coeffs: number[], x0: number, x1: number) =>
    (coeffs[0] ?? 0) * x0 + (coeffs[1] ?? 0) * x1;

  const rawPts: Array<[number, number]> = [];
  for (let i = 0; i < decPoly.x.length; i++) {
    const zx = evalObj(objX.coefficients, decPoly.x[i], decPoly.y[i]);
    const zy = evalObj(objY.coefficients, decPoly.x[i], decPoly.y[i]);
    if (!rawPts.some((p) => Math.hypot(p[0] - zx, p[1] - zy) < 1e-7)) {
      rawPts.push([zx, zy]);
    }
  }

  if (rawPts.length < 2) return null;

  rawPts.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Array<[number, number]> = [];
  for (const p of rawPts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<[number, number]> = [];
  for (let i = rawPts.length - 1; i >= 0; i--) {
    const p = rawPts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  if (hull.length < 2) return null;

  const closed = [...hull, hull[0]];
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

  const rX = payoff.normalization_ranges?.[idxX] || Math.abs(zIdX - zNadX) || 1;
  const rY = payoff.normalization_ranges?.[idxY] || Math.abs(zIdY - zNadY) || 1;
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
        name: "Iso L₁",
        x: pts.map((p) => p[0]),
        y: pts.map((p) => p[1]),
        color: "#2563EB",
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
        name: "Iso L₂",
        x: xs,
        y: ys,
        color: "#334155",
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
        name: "Iso L∞",
        x: [cornerX, cornerX, zIdX],
        y: [zIdY, cornerY, cornerY],
        color: "#E11D48",
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
 * Construye filas tabulares re-importables con la definición completa del modelo
 * (Metadatos, Variables con cotas -inf/+inf, Objetivos con pesos y Restricciones).
 */
function buildTabularModelRows(
  model: ModelDefinition,
  weights?: number[]
): Record<string, string | number>[] {
  const varNames = model.variables.map((v) => v.name);
  const rows: Record<string, string | number>[] = [
    {
      Seccion: "Meta",
      Nombre: model.name,
      Tipo_o_Sentido: model.description || "",
      Min_o_RHS: model.pareto_seed ?? 42,
      Max_o_Peso: model.reference ?? "",
    },
  ];

  model.variables.forEach((v) => {
    rows.push({
      Seccion: "Variable",
      Nombre: v.name,
      Tipo_o_Sentido: v.var_type,
      Min_o_RHS: v.lower_bound === null || v.lower_bound === undefined ? "-inf" : v.lower_bound,
      Max_o_Peso: v.upper_bound === null || v.upper_bound === undefined ? "+inf" : v.upper_bound,
    });
  });

  model.objectives.forEach((o, oIdx) => {
    const row: Record<string, string | number> = {
      Seccion: "Objetivo",
      Nombre: o.name,
      Tipo_o_Sentido: o.sense,
      Min_o_RHS: "",
      Max_o_Peso:
        weights?.[oIdx] ??
        model.weights?.[oIdx] ??
        Number((1 / model.objectives.length).toFixed(4)),
    };
    varNames.forEach((vn, vIdx) => {
      row[vn] = o.coefficients[vIdx] ?? 0;
    });
    rows.push(row);
  });

  model.constraints.forEach((c) => {
    const row: Record<string, string | number> = {
      Seccion: "Restriccion",
      Nombre: c.name,
      Tipo_o_Sentido: c.sense,
      Min_o_RHS: c.rhs,
      Max_o_Peso: "",
    };
    varNames.forEach((vn, vIdx) => {
      row[vn] = c.coefficients[vIdx] ?? 0;
    });
    rows.push(row);
  });

  return rows;
}

/**
 * Exporta los resultados de optimización y la definición re-importable del modelo a CSV.
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
    "Estado",
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
      sol.status,
      sol.objectives.length ? sol.aggregate_distance.toFixed(6) : "",
      ...varNames.map((vn) => sol.variables[vn]?.toFixed(4) ?? ""),
      ...sol.objectives.map((z) => z.toFixed(4)),
      ...sol.achievement_pct.map((p) => `${p.toFixed(2)}%`),
    ]);
  });

  // Bloque tabular del modelo (permite re-importar el mismo CSV en OptiCompromise)
  rows.push([]);
  rows.push(["DEFINICION DEL MODELO (RE-IMPORTABLE)"]);
  const modelHeaders = ["Seccion", "Nombre", "Tipo_o_Sentido", "Min_o_RHS", "Max_o_Peso", ...varNames];
  rows.push(modelHeaders);
  const modelRows = buildTabularModelRows(model, result.weights);
  modelRows.forEach((r) => {
    rows.push(modelHeaders.map((h) => String(r[h] ?? "")));
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

/**
 * Calcula puntos discretos factibles en 2D cuando el modelo tiene variables enteras o binarias.
 * Si ambas variables son enteras/binarias y el rango es manejable, devuelve la malla de puntos factibles.
 */
export function computeDiscreteFeasiblePoints2D(
  model: ModelDefinition,
  payoff?: PayoffMatrixData,
): { x: number[]; y: number[] } | null {
  if (model.variables.length !== 2) return null;
  const v0 = model.variables[0];
  const v1 = model.variables[1];
  const isInt0 = v0.var_type === "integer" || v0.var_type === "binary";
  const isInt1 = v1.var_type === "integer" || v1.var_type === "binary";
  if (!isInt0 && !isInt1) return null;

  const poly = computeFeasiblePolygon2D(model, payoff);
  if (!poly || poly.x.length === 0) return null;

  const minX = Math.ceil(Math.min(...poly.x) - 1e-6);
  const maxX = Math.floor(Math.max(...poly.x) + 1e-6);
  const minY = Math.ceil(Math.min(...poly.y) - 1e-6);
  const maxY = Math.floor(Math.max(...poly.y) + 1e-6);

  const satisfies = (px: number, py: number): boolean => {
    for (const c of model.constraints) {
      const lhs = (c.coefficients[0] ?? 0) * px + (c.coefficients[1] ?? 0) * py;
      if (c.sense === "<=" && lhs > c.rhs + 1e-6) return false;
      if (c.sense === ">=" && lhs < c.rhs - 1e-6) return false;
      if (c.sense === "==" && Math.abs(lhs - c.rhs) > 1e-6) return false;
    }
    if (v0.lower_bound !== null && px < v0.lower_bound - 1e-6) return false;
    if (v0.upper_bound !== null && px > v0.upper_bound + 1e-6) return false;
    if (v1.lower_bound !== null && py < v1.lower_bound - 1e-6) return false;
    if (v1.upper_bound !== null && py > v1.upper_bound + 1e-6) return false;
    return true;
  };

  const xs: number[] = [];
  const ys: number[] = [];

  if (isInt0 && isInt1) {
    const countX = Math.max(0, maxX - minX + 1);
    const countY = Math.max(0, maxY - minY + 1);
    if (countX * countY > 2500) return null;
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        if (satisfies(ix, iy)) {
          xs.push(ix);
          ys.push(iy);
        }
      }
    }
  } else if (isInt0) {
    const countX = Math.max(0, maxX - minX + 1);
    if (countX > 80) return null;
    const minYCont = Math.min(...poly.y);
    const maxYCont = Math.max(...poly.y);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let k = 0; k <= 12; k++) {
        const py = minYCont + ((maxYCont - minYCont) * k) / 12;
        if (satisfies(ix, py)) {
          xs.push(ix);
          ys.push(py);
        }
      }
    }
  } else {
    const countY = Math.max(0, maxY - minY + 1);
    if (countY > 80) return null;
    const minXCont = Math.min(...poly.x);
    const maxXCont = Math.max(...poly.x);
    for (let iy = minY; iy <= maxY; iy++) {
      for (let k = 0; k <= 12; k++) {
        const px = minXCont + ((maxXCont - minXCont) * k) / 12;
        if (satisfies(px, iy)) {
          xs.push(px);
          ys.push(iy);
        }
      }
    }
  }

  return xs.length > 0 ? { x: xs, y: ys } : null;
}

/**
 * Exporta un libro Excel (.xlsx) profesional con múltiples hojas:
 * Matriz_de_Pagos, Soluciones_Compromiso y Frontera_Pareto.
 */
export function exportResultsExcel(model: ModelDefinition, result: SolveResponse) {
  const wb = XLSX.utils.book_new();
  const headers = result.payoff.headers;
  const varNames = model.variables.map((v) => v.name);

  const payoffRows = [
    ["Óptimo Individual", ...headers],
    ...result.payoff.matrix.map((row, i) => [headers[i], ...row]),
    ["Punto Ideal (Z*)", ...result.payoff.ideal_point],
    ["Punto Nadir (Anti-Ideal)", ...result.payoff.anti_ideal_point],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payoffRows), "Matriz_de_Pagos");

  const solRows = [
    ["Métrica", "Estado", "Distancia D_p", ...varNames,
      ...headers.map((name) => `${name} (Real)`), ...headers.map((name) => `${name} (% Logro)`)],
    ...(["L1", "L2", "L_inf"] as const).flatMap((key) => {
      const sol = result.solutions[key];
      if (!sol) return [];
      return [[key, sol.status, sol.objectives.length ? sol.aggregate_distance : null,
        ...varNames.map((name) => sol.variables[name] ?? null),
        ...headers.map((_, i) => sol.objectives[i] ?? null),
        ...headers.map((_, i) => sol.achievement_pct[i] == null ? null : `${sol.achievement_pct[i].toFixed(2)}%`)]];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(solRows), "Soluciones_Compromiso");

  if (result.pareto_points?.length) {
    const paretoRows = [
      ["#", "Métrica", ...headers, ...varNames],
      ...result.pareto_points.map((pt, i) => [
        i + 1, pt.metric, ...pt.objectives, ...varNames.map((name) => pt.variables[name] ?? null),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paretoRows), "Frontera_Pareto");
  }

  // Hoja 4: Definición tabular del Modelo (re-importable en Excel/CSV sin pérdida de cotas ni descripción)
  const modelRows = buildTabularModelRows(model, result.weights);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modelRows), "Modelo");

  const safeName = model.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  XLSX.writeFile(wb, `OptiCompromise_${safeName}.xlsx`);
}

type TabularRow = Record<string, string | number | boolean | null | undefined>;

function tabularNumber(raw: unknown, field: string, fallback?: number): number {
  const value = typeof raw === "string" ? raw.trim().replace(",", ".") : raw;
  if ((value === "" || value == null) && fallback !== undefined) return fallback;
  if ((typeof value === "string" && value !== "") || typeof value === "number") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Ingresa un número válido en ${field}.`);
}

function parseBoundCell(raw: unknown, fallback: number | null, field: string): number | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return fallback;
  if (["-inf", "+inf", "inf", "-∞", "+∞", "∞"].includes(value)) return null;
  return tabularNumber(value, field);
}

function validateImportedModel(parsed: unknown): ModelDefinition {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("El archivo JSON debe contener un objeto de definición de modelo.");
  }
  const obj = parsed as Partial<ModelDefinition>;
  const readNumber = (value: unknown, field: string): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`Ingresa un número finito en ${field}.`);
  };
  const readCoefficients = (values: number[], count: number, field: string) => {
    if (!Array.isArray(values) || values.length > count) {
      throw new Error(`Revisa la cantidad de coeficientes en ${field}.`);
    }
    return Array.from({ length: count }, (_, i) =>
      i < values.length ? readNumber(values[i], `${field}, coeficiente ${i + 1}`) : 0
    );
  };
  if (!Array.isArray(obj.variables) || obj.variables.length < 1) {
    throw new Error("El archivo JSON debe incluir al menos 1 variable válida en 'variables'.");
  }
  if (!Array.isArray(obj.objectives) || obj.objectives.length < 2) {
    throw new Error("El archivo JSON debe incluir al menos 2 objetivos válidos en 'objectives'.");
  }
  const validVars = obj.variables.map((v, idx) => {
    if (!v || typeof v.name !== "string" || !v.name.trim()) {
      throw new Error(`Variable #${idx + 1} inválida en el JSON (falta 'name').`);
    }
    if (v.var_type !== undefined && !["continuous", "integer", "binary"].includes(v.var_type)) {
      throw new Error(`Tipo de variable desconocido en «${v.name}».`);
    }
    const vt: "continuous" | "integer" | "binary" =
      v.var_type === "integer"
        ? "integer"
        : v.var_type === "binary"
        ? "binary"
        : "continuous";
    return {
      name: v.name.trim(),
      var_type: vt,
      lower_bound: v.lower_bound === null ? null : readNumber(v.lower_bound ?? 0, `cota inferior de «${v.name}»`),
      upper_bound: v.upper_bound == null ? null : readNumber(v.upper_bound, `cota superior de «${v.name}»`),
    };
  });
  const validObjs = obj.objectives.map((o, idx) => {
    if (!o || typeof o.name !== "string" || !o.name.trim() || !Array.isArray(o.coefficients)) {
      throw new Error(`Objetivo #${idx + 1} inválido en el JSON (requiere 'name' y 'coefficients').`);
    }
    if (o.sense !== undefined && !["maximize", "minimize"].includes(o.sense)) {
      throw new Error(`Sentido desconocido en el objetivo «${o.name}».`);
    }
    if (o.expression && !o.coefficients.length) {
      throw new Error(`Convierte «${o.name}» a coeficientes lineales antes de importar.`);
    }
    return {
      name: o.name.trim(),
      sense: o.sense === "minimize" ? ("minimize" as const) : ("maximize" as const),
      coefficients: readCoefficients(o.coefficients, validVars.length, `objetivo «${o.name}»`),
    };
  });
  if (obj.constraints !== undefined && !Array.isArray(obj.constraints)) {
    throw new Error("Las restricciones deben estar en una lista.");
  }
  if (obj.weights != null && !Array.isArray(obj.weights)) throw new Error("Los pesos deben estar en una lista.");
  const validCons = Array.isArray(obj.constraints)
    ? obj.constraints.map((c, idx) => {
        if (!c || (c.sense !== undefined && !["<=", ">=", "=="].includes(c.sense))) {
          throw new Error(`Sentido desconocido en la restricción ${idx + 1}.`);
        }
        const name = c.name || `Restricción ${idx + 1}`;
        return {
          name,
          sense: c.sense ?? "<=",
          rhs: readNumber(c.rhs, `lado derecho de «${name}»`),
          coefficients: readCoefficients(c.coefficients ?? [], validVars.length, `restricción «${name}»`),
        };
      })
    : [];

  return {
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Modelo Importado",
    description: typeof obj.description === "string" ? obj.description : "",
    reference: typeof obj.reference === "string" ? obj.reference.trim() : undefined,
    variables: validVars,
    objectives: validObjs,
    constraints: validCons,
    weights: Array.isArray(obj.weights) ? obj.weights : undefined,
    pareto_seed: obj.pareto_seed,
  };
}

/**
 * Importa un modelo desde JSON (.json), Excel (.xlsx/.xls) o CSV (.csv).
 * Soporta libros exportados por OptiCompromise (hoja "Modelo"), archivos CSV de resultados
 * con el bloque "DEFINICION DEL MODELO" y plantillas tabulares con columna Seccion.
 */
export async function importModelFromFile(
  file: File
): Promise<{ model: ModelDefinition; weights?: number[] }> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".json")) {
    const text = await file.text();
    const raw = JSON.parse(text) as unknown;
    const validated = validateImportedModel(raw);
    return {
      model: validated,
      weights: validated.weights,
    };
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    const buf = await file.arrayBuffer();
    const wb = lower.endsWith(".csv")
      ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
      : XLSX.read(buf, { type: "array" });

    const sheetName =
      wb.SheetNames.find((s) => s.toLowerCase() === "modelo") || wb.SheetNames[0];
    if (!sheetName) {
      throw new Error("El archivo no contiene ninguna hoja legible.");
    }

    const sheet = wb.Sheets[sheetName];
    const matrixRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      defval: "",
    });
    if (matrixRows.length === 0) {
      throw new Error("La hoja importada está vacía.");
    }

    // Buscar dinámicamente la fila de encabezado que contiene "Seccion" (permite re-importar CSV de resultados)
    let headerIdx = matrixRows.findIndex((r) =>
      r.some((cell) => {
        const txt = String(cell ?? "").trim().toLowerCase();
        return txt === "seccion" || txt === "sección";
      })
    );
    if (headerIdx < 0) headerIdx = 0;

    const headerRow = matrixRows[headerIdx].map((h) => String(h ?? "").trim());
    const rows: TabularRow[] = matrixRows.slice(headerIdx + 1).map((r) => {
      const rec: TabularRow = {};
      headerRow.forEach((colName, cIdx) => {
        if (colName) rec[colName] = r[cIdx];
      });
      return rec;
    });

    let importedName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
    let importedSeed: number | undefined;
    let importedReference: string | undefined;
    let importedDescription = `Modelo importado desde ${file.name}.`;
    const variables: ModelDefinition["variables"] = [];
    const objRows: TabularRow[] = [];
    const conRows: TabularRow[] = [];

    const getField = (row: TabularRow, candidates: string[]) => {
      for (const k of Object.keys(row)) {
        if (candidates.includes(k.trim().toLowerCase())) return row[k];
      }
      return undefined;
    };

    rows.forEach((row) => {
      const sec = String(getField(row, ["seccion", "sección", "tipo", "elemento"]) ?? "")
        .trim()
        .toLowerCase();
      if (sec === "meta" || sec === "metadata") {
        const metaName = String(getField(row, ["nombre", "name"]) ?? "").trim();
        const metaDesc = String(getField(row, ["tipo_o_sentido", "description", "descripcion"]) ?? "").trim();
        const seed = getField(row, ["min_o_rhs", "pareto_seed"]);
        if (seed !== undefined && seed !== "") importedSeed = Number(seed);
        if (metaName) importedName = metaName;
        if (metaDesc) importedDescription = metaDesc;
        importedReference = String(getField(row, ["referencia", "fuente", "max_o_peso"]) ?? "").trim() || undefined;
      } else if (sec.startsWith("var")) {
        const name = String(getField(row, ["nombre", "name", "variable"]) ?? "").trim();
        if (!name) throw new Error("Escribe el nombre de cada variable.");
        const vtRaw = String(getField(row, ["tipo_o_sentido", "var_type", "tipo_var"]) ?? "continuous")
          .trim()
          .toLowerCase();
        if (!["continuous", "continua", "integer", "entera", "binary", "binaria"].includes(vtRaw)) {
          throw new Error(`Tipo de variable desconocido en «${name}». Usa continuous, integer o binary.`);
        }
        const var_type =
          vtRaw.startsWith("int") || vtRaw.startsWith("ent")
            ? "integer"
            : vtRaw.startsWith("bin")
            ? "binary"
            : "continuous";
        const minRaw = getField(row, ["min_o_rhs", "min", "lower_bound", "lb"]);
        const maxRaw = getField(row, ["max_o_peso", "max", "upper_bound", "ub"]);
        variables.push({
          name,
          var_type,
          lower_bound: parseBoundCell(minRaw, 0, `cota inferior de «${name}»`),
          upper_bound: parseBoundCell(maxRaw, var_type === "binary" ? 1 : null, `cota superior de «${name}»`),
        });
      } else if (sec.startsWith("obj")) {
        objRows.push(row);
      } else if (sec.startsWith("res")) {
        conRows.push(row);
      } else if (sec) {
        throw new Error(`Sección desconocida «${sec}». Usa Meta, Variable, Objetivo o Restriccion.`);
      }
    });

    if (variables.length < 1 || objRows.length < 2) {
      throw new Error(
        "Formato Excel/CSV no reconocido. Usa un archivo exportado por OptiCompromise o columnas Seccion (Variable/Objetivo/Restriccion), Nombre, Tipo_o_Sentido, Min_o_RHS, Max_o_Peso y columnas de variables."
      );
    }

    const varNames = variables.map((v) => v.name);
    const objectives: ModelDefinition["objectives"] = [];
    const importedWeights: Array<number | null> = [];
    for (const name of varNames) {
      if (headerRow.filter(header => header === name).length !== 1) {
        throw new Error(`La variable «${name}» debe tener exactamente una columna con el mismo nombre.`);
      }
      if (["seccion", "nombre", "tipo_o_sentido", "min_o_rhs", "max_o_peso"].includes(name.toLowerCase())) {
        throw new Error(`Usa otro nombre para la variable «${name}». Ese encabezado está reservado.`);
      }
    }

    objRows.forEach((row, idx) => {
      const name = String(getField(row, ["nombre", "name"]) ?? `Objetivo ${idx + 1}`).trim();
      const sRaw = String(getField(row, ["tipo_o_sentido", "sense", "sentido"]) ?? "maximize")
        .trim()
        .toLowerCase();
      if (!name) throw new Error(`Escribe el nombre del objetivo ${idx + 1}.`);
      if (!["minimize", "minimizar", "min", "maximize", "maximizar", "max"].includes(sRaw)) {
        throw new Error(`Indica minimize o maximize en el objetivo «${name}».`);
      }
      const sense = sRaw.startsWith("min") ? "minimize" : "maximize";
      const coeffs = varNames.map(vn => tabularNumber(row[vn], `«${name}», columna «${vn}»`, 0));
      objectives.push({ name, sense, coefficients: coeffs });
      const raw = getField(row, ["max_o_peso", "peso", "weight"]);
      importedWeights.push(String(raw ?? "").trim() ? tabularNumber(raw, `peso de «${name}»`) : null);
    });

    const constraints: ModelDefinition["constraints"] = conRows.map((row, idx) => {
      const name = String(getField(row, ["nombre", "name"]) ?? `Restricción ${idx + 1}`).trim();
      const sRaw = String(getField(row, ["tipo_o_sentido", "sense", "operador"]) ?? "<=").trim();
      if (!name) throw new Error(`Escribe el nombre de la restricción ${idx + 1} o elimina la fila.`);
      if (!["<=", "≤", ">=", "≥", "==", "="].includes(sRaw)) {
        throw new Error(`Usa <=, >= o = en la restricción «${name}».`);
      }
      const sense = sRaw === ">=" || sRaw === "≥" ? ">=" : sRaw === "==" || sRaw === "=" ? "==" : "<=";
      const rhsVal = tabularNumber(getField(row, ["min_o_rhs", "rhs", "ld"]), `lado derecho de «${name}»`);
      const coeffs = varNames.map(vn => tabularNumber(row[vn], `«${name}», columna «${vn}»`, 0));
      return {
        name,
        coefficients: coeffs,
        sense,
        rhs: rhsVal,
      };
    });

    if (importedWeights.some(w => w === null) && importedWeights.some(w => w !== null)) {
      throw new Error("Completa todos los pesos o déjalos todos vacíos para usar pesos iguales.");
    }
    const normWeights = importedWeights.map(w => w ?? 1 / objectives.length);
    if (normWeights.some(w => w < 0 || w > 1) || Math.abs(normWeights.reduce((a, b) => a + b, 0) - 1) > 0.001 + 1e-12) {
      throw new Error("Los pesos deben estar entre 0 y 1 y sumar 1.");
    }

    return {
      model: {
        name: importedName,
        description: importedDescription,
        reference: importedReference,
        variables,
        objectives,
        constraints,
        weights: normWeights,
        pareto_seed: importedSeed,
      },
      weights: normWeights,
    };
  }

  throw new Error("Formato de archivo no soportado. Usa .json, .xlsx, .xls o .csv.");
}
