export type VarType = "continuous" | "integer" | "binary";
export type ObjectiveSense = "maximize" | "minimize";
export type ConstraintSense = "<=" | ">=" | "==";

export interface VariableModel {
  name: string;
  var_type: VarType;
  lower_bound: number | null;
  upper_bound: number | null;
}

export interface ObjectiveModel {
  name: string;
  sense: ObjectiveSense;
  coefficients: number[];
  expression?: string | null;
}

export interface ConstraintModel {
  name: string;
  coefficients: number[];
  sense: ConstraintSense;
  rhs: number;
  expression?: string | null;
}

export interface ModelDefinition {
  name: string;
  description?: string;
  variables: VariableModel[];
  objectives: ObjectiveModel[];
  constraints: ConstraintModel[];
  weights?: number[];
}

export interface PayoffMatrixData {
  headers: string[];
  matrix: number[][];
  ideal_point: number[];
  anti_ideal_point: number[];
  independent_solutions: Record<string, number>[];
  degenerate_objectives?: number[];
  status: string;
}

export interface MetricSolution {
  metric: string;
  variables: Record<string, number>;
  objectives: number[];
  achievement_pct: number[];
  normalized_distances: number[];
  aggregate_distance: number;
  status: string;
}

export interface ParetoPoint {
  weights: number[];
  objectives: number[];
  variables: Record<string, number>;
  metric: string;
}

export interface SolveResponse {
  status: string;
  message: string;
  payoff: PayoffMatrixData;
  solutions: {
    L1: MetricSolution;
    L2: MetricSolution;
    L_inf: MetricSolution;
    [key: string]: MetricSolution;
  };
  weights: number[];
  pareto_points?: ParetoPoint[];
}

export type SolverStatus = "idle" | "calculating" | "optimal" | "infeasible" | "unbounded" | "error";

export type ThemeMode = "dark" | "light";
export type DecisionProfile = "equitativo" | "compensatorio" | "moderado" | "personalizado";

export interface PresetOption {
  id: string;
  label: string;
  badge: string;
  source: "api" | "blank";
}

export const PRESET_OPTIONS: PresetOption[] = [
  { id: "celdas", label: "1. Celdas 2D (Clase 15 · Curso)", badge: "2V · 2Z", source: "api" },
  { id: "transporte", label: "2. Transporte 2D (Taller 3 · ≥4 Vars)", badge: "12V · 2Z", source: "api" },
  { id: "triobjetivo", label: "3. Sostenibilidad 3D (Triobjetivo)", badge: "3V · 3Z", source: "api" },
  { id: "mip", label: "4. Producción Mixta MIP (Bonus ℤ/{0,1})", badge: "3V · 2Z", source: "api" },
  { id: "flota", label: "5. Flota Vehículos Eléctricos (4Z)", badge: "6V · 4Z", source: "api" },
  { id: "blank", label: "+ Nuevo Modelo en Blanco", badge: "Desde cero", source: "blank" },
];

export const BLANK_MODEL: ModelDefinition = {
  name: "Nuevo Modelo Multiobjetivo",
  description: "Modelo editable desde cero para formular variables, objetivos y restricciones.",
  variables: [
    { name: "x1 (Alternativa A)", var_type: "continuous", lower_bound: 0, upper_bound: 100 },
    { name: "x2 (Alternativa B)", var_type: "continuous", lower_bound: 0, upper_bound: 100 },
  ],
  objectives: [
    { name: "Objetivo 1", sense: "maximize", coefficients: [2, 3] },
    { name: "Objetivo 2", sense: "minimize", coefficients: [1, 1] },
  ],
  constraints: [
    { name: "Restricción 1", coefficients: [1, 1], sense: "<=", rhs: 50 },
    { name: "Restricción 2", coefficients: [2, 1], sense: ">=", rhs: 20 },
  ],
  weights: [0.5, 0.5],
};

export const FALLBACK_CELDAS_MODEL: ModelDefinition = {
  name: "Planificación de Celdas Fotovoltaicas (Clase 15)",
  description: "Problema biobjetivo del curso: maximizar utilidad económica vs minimizar generación de contaminantes.",
  variables: [
    { name: "x1 (Celdas Fotov.)", var_type: "continuous", lower_bound: 0, upper_bound: 300 },
    { name: "x2 (Celdas GP)", var_type: "continuous", lower_bound: 0, upper_bound: 200 },
  ],
  objectives: [
    { name: "Utilidad Total (USD)", sense: "maximize", coefficients: [1000, 3000] },
    { name: "Emisión Contaminantes (kg)", sense: "minimize", coefficients: [1, 2] },
  ],
  constraints: [
    { name: "Capacidad Máxima de Ensamble", coefficients: [1, 1], sense: "<=", rhs: 400 },
    { name: "Demanda Mínima de Ingreso", coefficients: [1000, 3000], sense: ">=", rhs: 300000 },
  ],
  weights: [0.5, 0.5],
};

export const SEMANTIC_COLORS = {
  ideal: "#D97706",    // Dorado / Amber
  nadir: "#BE123C",    // Rojo oscuro / Nadir
  L1: "#2563EB",       // Azul Cobalto
  L2: "#334155",       // Slate / Marino Técnico
  L_inf: "#E11D48",    // Rojo Suizo / Minimax
  pareto: "#0F766E",   // Verde petróleo / Pareto (o azul acero)
};
