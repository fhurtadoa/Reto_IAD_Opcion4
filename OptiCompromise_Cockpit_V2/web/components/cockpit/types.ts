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

export interface PresetOption {
  id: string;
  label: string;
  badge: string;
  source: "api" | "blank";
}

export const PRESET_OPTIONS: PresetOption[] = [
  { id: "celdas", label: "01. Celdas Fotovoltaicas (Clase 15)", badge: "2D · LP", source: "api" },
  { id: "transporte", label: "02. Problema de Transporte (Taller 3)", badge: "12 Vars · 2D", source: "api" },
  { id: "mip", label: "03. Planificación Entera / Binaria", badge: "MIP Bonus", source: "api" },
  { id: "triobjetivo", label: "04. Sostenibilidad Triobjetivo", badge: "3D · Bonus", source: "api" },
  { id: "blank", label: "+ Nuevo Modelo en Blanco", badge: "Personalizado", source: "blank" },
];

export const BLANK_MODEL: ModelDefinition = {
  name: "Nuevo Modelo Multiobjetivo",
  description: "Modelo editable desde cero para formular variables, objetivos y restricciones.",
  variables: [
    { name: "x1", var_type: "continuous", lower_bound: 0, upper_bound: 100 },
    { name: "x2", var_type: "continuous", lower_bound: 0, upper_bound: 100 },
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
    { name: "x1", var_type: "continuous", lower_bound: 0, upper_bound: 300 },
    { name: "x2", var_type: "continuous", lower_bound: 0, upper_bound: 200 },
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
  ideal: "#F59E0B",    // Dorado / Amber
  nadir: "#F43F5E",    // Coral / Rose
  L1: "#06B6D4",       // Cian / Cyan
  L2: "#10B981",       // Esmeralda / Emerald
  L_inf: "#8B5CF6",    // Violeta / Violet
  pareto: "#38BDF8",   // Sky
};
