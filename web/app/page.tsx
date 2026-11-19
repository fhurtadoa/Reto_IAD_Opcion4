"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Compass,
  Sliders,
  Table as TableIcon,
  BarChart2,
  FileDown,
  BookOpen,
  Award,
  RotateCcw,
  Sparkles,
  Info,
  Plus,
  Trash2,
  CheckCircle2,
  HelpCircle,
  Layers,
  ArrowRight,
  Target,
  Maximize2,
  Upload,
  AlertCircle,
  AlertTriangle,
  LayoutGrid
} from "lucide-react";
import * as XLSX from "xlsx";
import InteractiveCharts from "../components/InteractiveCharts";

interface Variable {
  name: string;
  lower_bound: number;
  upper_bound: number | null;
  var_type: string;
}

interface Objective {
  name: string;
  sense: string;
  coefficients: number[];
}

interface Constraint {
  name: string;
  coefficients: number[];
  sense: string;
  rhs: number;
}

interface Model {
  name: string;
  description: string;
  variables: Variable[];
  objectives: Objective[];
  constraints: Constraint[];
  defaultWeights: number[];
}

const PRESET_MODELS: Record<string, Model> = {
  carros_flota: {
    name: "Adquisición de Flota de Vehículos Eléctricos (Caso Taller IAD)",
    description: "Evaluación multicriterio para adquisición de flota entre 6 alternativas de vehículos 100% eléctricos: BYD Seal, Tesla Model 3, Hyundai Ioniq 5, Kia EV6, Volvo EX30 y Chevrolet Equinox EV.",
    variables: [
      { name: "x1 (BYD Seal)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x2 (Tesla Model 3)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x3 (Hyundai Ioniq 5)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x4 (Kia EV6)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x5 (Volvo EX30)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x6 (Chevrolet Equinox EV)", lower_bound: 0, upper_bound: 50, var_type: "continuous" }
    ],
    objectives: [
      {
        name: "Costo Total Flota (USD)",
        sense: "minimize",
        coefficients: [44000, 46500, 49000, 48000, 42000, 43500]
      },
      {
        name: "Autonomía Total (km)",
        sense: "maximize",
        coefficients: [570, 630, 520, 540, 480, 510]
      },
      {
        name: "Tiempo Promedio Carga (min)",
        sense: "minimize",
        coefficients: [32, 27, 18, 18, 26, 30]
      },
      {
        name: "Índice Seguridad Flota (pts)",
        sense: "maximize",
        coefficients: [9.0, 9.5, 9.6, 9.7, 10.0, 9.3]
      }
    ],
    constraints: [
      {
        name: "Tamaño Requerido de Flota",
        coefficients: [1, 1, 1, 1, 1, 1],
        sense: "==",
        rhs: 50
      },
      {
        name: "Capacidad Mínima Maletero (L)",
        coefficients: [400, 594, 527, 520, 318, 748],
        sense: ">=",
        rhs: 24000
      },
      {
        name: "Presupuesto Máximo Inversión (USD)",
        coefficients: [44000, 46500, 49000, 48000, 42000, 43500],
        sense: "<=",
        rhs: 2350000
      }
    ],
    defaultWeights: [0.30, 0.25, 0.25, 0.20]
  },
  carros_triobjetivo: {
    name: "Flota Tri-objetivo 3D (Costo vs Autonomía vs Seguridad)",
    description: "Espacio de decisión tridimensional puro donde se analizan los 3 objetivos principales de la flota de autos en un cubo 3D con rotación 360°.",
    variables: [
      { name: "x1 (BYD Seal)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x2 (Tesla Model 3)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x3 (Hyundai Ioniq 5)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x4 (Kia EV6)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x5 (Volvo EX30)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x6 (Chevrolet Equinox EV)", lower_bound: 0, upper_bound: 50, var_type: "continuous" }
    ],
    objectives: [
      {
        name: "Costo Total Flota (USD)",
        sense: "minimize",
        coefficients: [44000, 46500, 49000, 48000, 42000, 43500]
      },
      {
        name: "Autonomía Total (km)",
        sense: "maximize",
        coefficients: [570, 630, 520, 540, 480, 510]
      },
      {
        name: "Índice Seguridad Flota (pts)",
        sense: "maximize",
        coefficients: [9.0, 9.5, 9.6, 9.7, 10.0, 9.3]
      }
    ],
    constraints: [
      {
        name: "Tamaño Requerido de Flota",
        coefficients: [1, 1, 1, 1, 1, 1],
        sense: "==",
        rhs: 50
      },
      {
        name: "Capacidad Mínima Maletero (L)",
        coefficients: [400, 594, 527, 520, 318, 748],
        sense: ">=",
        rhs: 24000
      },
      {
        name: "Presupuesto Máximo Inversión (USD)",
        coefficients: [44000, 46500, 49000, 48000, 42000, 43500],
        sense: "<=",
        rhs: 2350000
      }
    ],
    defaultWeights: [0.40, 0.35, 0.25]
  },
  carros_biobjetivo: {
    name: "Elección Biobjetivo: BYD Seal vs Tesla Model 3 (2 Variables)",
    description: "Comparativa directa entre los dos sedanes eléctricos más populares frente a Costo y Autonomía.",
    variables: [
      { name: "x1 (BYD Seal)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x2 (Tesla Model 3)", lower_bound: 0, upper_bound: 50, var_type: "continuous" }
    ],
    objectives: [
      { name: "Costo Inversión (USD)", sense: "minimize", coefficients: [44000, 46500] },
      { name: "Autonomía Flota (km)", sense: "maximize", coefficients: [570, 630] }
    ],
    constraints: [
      { name: "Tamaño Total de Flota", coefficients: [1, 1], sense: "==", rhs: 50 },
      { name: "Presupuesto Máximo", coefficients: [44000, 46500], sense: "<=", rhs: 2300000 }
    ],
    defaultWeights: [0.5, 0.5]
  },
  taller_produccion: {
    name: "Fabricación de Vehículos Ligeros (Caso Taller 2D)",
    description: "Planificación de producción de Patinetas y Bicicletas con conflicto entre Maximizar Ingresos ($) y Minimizar Desperdicio (kg).",
    variables: [
      { name: "x1 (Patinetas)", lower_bound: 0, upper_bound: 60, var_type: "continuous" },
      { name: "x2 (Bicicletas)", lower_bound: 0, upper_bound: 40, var_type: "continuous" }
    ],
    objectives: [
      { name: "Ingresos Totales ($)", sense: "maximize", coefficients: [50, 90] },
      { name: "Desperdicio Material (kg)", sense: "minimize", coefficients: [1, 3] }
    ],
    constraints: [
      { name: "Horas Maquinado", coefficients: [1, 1], sense: "<=", rhs: 60 },
      { name: "Materia Prima", coefficients: [1, 2], sense: "<=", rhs: 80 },
      { name: "Demanda Mínima", coefficients: [1, 1], sense: ">=", rhs: 30 }
    ],
    defaultWeights: [0.5, 0.5]
  },
  mip_produccion: {
    name: "Planificación Entera y Binaria (MIP Bonus)",
    description: "Optimización de rendimiento vs costo con variables continuas, máquinas enteras y decisión binaria de apertura de planta.",
    variables: [
      { name: "x1 (Lotes)", lower_bound: 0, upper_bound: 50, var_type: "continuous" },
      { name: "x2 (Máquinas)", lower_bound: 0, upper_bound: 20, var_type: "integer" },
      { name: "y1 (Planta)", lower_bound: 0, upper_bound: 1, var_type: "binary" }
    ],
    objectives: [
      { name: "Rendimiento ($)", sense: "maximize", coefficients: [40, 70, 150] },
      { name: "Costo Operativo ($)", sense: "minimize", coefficients: [10, 25, 80] }
    ],
    constraints: [
      { name: "Capacidad Planta", coefficients: [1, 2, -30], sense: "<=", rhs: 0 },
      { name: "Presupuesto Global", coefficients: [10, 25, 80], sense: "<=", rhs: 500 },
      { name: "Demanda Mínima", coefficients: [1, 1, 0], sense: ">=", rhs: 15 }
    ],
    defaultWeights: [0.6, 0.4]
  },
  personalizado: {
    name: "Nuevo Modelo en Blanco",
    description: "Modelo editable desde cero para formular tus propias variables, objetivos y restricciones.",
    variables: [
      { name: "x1", lower_bound: 0, upper_bound: 100, var_type: "continuous" },
      { name: "x2", lower_bound: 0, upper_bound: 100, var_type: "continuous" }
    ],
    objectives: [
      { name: "Objetivo 1", sense: "maximize", coefficients: [2, 3] },
      { name: "Objetivo 2", sense: "minimize", coefficients: [1, 1] }
    ],
    constraints: [
      { name: "Restricción 1", coefficients: [1, 1], sense: "<=", rhs: 50 }
    ],
    defaultWeights: [0.5, 0.5]
  }
};

export default function ColabStyleApp() {
  const [selectedPreset, setSelectedPreset] = useState<string>("carros_flota");
  const [currentModel, setCurrentModel] = useState<Model>(PRESET_MODELS.carros_flota);
  const [weights, setWeights] = useState<number[]>(PRESET_MODELS.carros_flota.defaultWeights);
  const [loading, setLoading] = useState(false);
  const [solveResult, setSolveResult] = useState<any>(null);
  const [showTheoryModal, setShowTheoryModal] = useState(false);
  const [decisionProfile, setDecisionProfile] = useState<"equitativo" | "compensatorio" | "moderado" | "personalizado">("equitativo");
  const [autoBalance, setAutoBalance] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<"all" | "formulacion" | "matriz" | "resultados">("all");

  // Validación estricta de suma de pesos (teoría de programación compromiso: sum(w) = 1.00)
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const isWeightSumValid = Math.abs(sumWeights - 1.0) <= 0.005;

  const handleNormalizeWeights = () => {
    const sum = weights.reduce((a, b) => a + b, 0);
    const n = weights.length;
    if (sum <= 0.00001) {
      const eq = Array(n).fill(parseFloat((1 / n).toFixed(3)));
      const eqSum = eq.reduce((a, b) => a + b, 0);
      const diff = parseFloat((1.0 - eqSum).toFixed(3));
      if (diff !== 0 && eq.length > 0) eq[0] = parseFloat((eq[0] + diff).toFixed(3));
      setWeights(eq);
      executeSolve(currentModel, eq);
      return;
    }
    const norm = weights.map(w => parseFloat((w / sum).toFixed(3)));
    const newSum = norm.reduce((a, b) => a + b, 0);
    const diff = parseFloat((1.0 - newSum).toFixed(3));
    if (diff !== 0 && norm.length > 0) {
      norm[0] = parseFloat((norm[0] + diff).toFixed(3));
    }
    setWeights(norm);
    executeSolve(currentModel, norm);
  };

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Ejecución de la optimización en FastAPI/SciPy
  const executeSolve = useCallback(async (modelToSolve: Model, weightsToUse: number[]) => {
    setLoading(true);
    try {
      const payload = {
        name: modelToSolve.name,
        variables: modelToSolve.variables,
        objectives: modelToSolve.objectives,
        constraints: modelToSolve.constraints,
        weights: weightsToUse
      };

      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSolveResult(data);
      }
    } catch (err) {
      console.error("Error al resolver modelo:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoadPreset = (key: string) => {
    setSelectedPreset(key);
    const m = PRESET_MODELS[key];
    setCurrentModel(m);
    setWeights(m.defaultWeights);
    executeSolve(m, m.defaultWeights);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("preset");
      if (p && PRESET_MODELS[p]) {
        handleLoadPreset(p);
        return;
      }
    }
    executeSolve(currentModel, weights);
  }, []);

  const handleSelectProfile = (profile: "equitativo" | "compensatorio" | "moderado" | "personalizado") => {
    setDecisionProfile(profile);
    const n = currentModel.objectives.length;
    let newW = [...weights];
    if (profile === "equitativo" || profile === "moderado") {
      newW = Array(n).fill(parseFloat((1 / n).toFixed(3)));
    } else if (profile === "compensatorio") {
      newW = Array(n).fill(parseFloat((0.3 / Math.max(1, n - 1)).toFixed(3)));
      newW[0] = 0.7;
    }
    const sum = newW.reduce((a, b) => a + b, 0);
    const normalized = newW.map(w => parseFloat((w / sum).toFixed(3)));
    const finalSum = normalized.reduce((a, b) => a + b, 0);
    const diff = parseFloat((1.0 - finalSum).toFixed(3));
    if (diff !== 0 && normalized.length > 0) {
      normalized[0] = parseFloat((normalized[0] + diff).toFixed(3));
    }
    setWeights(normalized);
    executeSolve(currentModel, normalized);
  };

  // Sliders reactivos en vivo con auto-balance proporcional o modo libre
  const handleWeightChange = (index: number, val: number) => {
    setDecisionProfile("personalizado");
    if (isNaN(val)) val = 0;
    val = Math.max(0, Math.min(1, val));
    val = parseFloat(val.toFixed(3));
    const n = weights.length;
    let newWeights = [...weights];

    if (autoBalance && n > 1) {
      newWeights[index] = val;
      const rem = Math.max(0, 1.0 - val);
      const otherIndices: number[] = [];
      let sumOther = 0;
      for (let j = 0; j < n; j++) {
        if (j !== index) {
          otherIndices.push(j);
          sumOther += (weights[j] ?? 0);
        }
      }

      if (sumOther > 0.0001) {
        otherIndices.forEach(j => {
          newWeights[j] = parseFloat((((weights[j] ?? 0) / sumOther) * rem).toFixed(3));
        });
      } else {
        const share = parseFloat((rem / otherIndices.length).toFixed(3));
        otherIndices.forEach(j => {
          newWeights[j] = share;
        });
      }

      // Ajuste de redondeo exacto para garantizar suma = 1.000
      const currentSum = newWeights.reduce((a, b) => a + b, 0);
      const diff = parseFloat((1.0 - currentSum).toFixed(3));
      if (diff !== 0 && otherIndices.length > 0) {
        let maxOtherIdx = otherIndices[0];
        for (const j of otherIndices) {
          if (newWeights[j] > newWeights[maxOtherIdx]) {
            maxOtherIdx = j;
          }
        }
        newWeights[maxOtherIdx] = parseFloat(Math.max(0, newWeights[maxOtherIdx] + diff).toFixed(3));
      }
    } else {
      newWeights[index] = val;
    }

    setWeights(newWeights);

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(currentModel, newWeights);
    }, 40);
  };

  // --- CRUD RESTRICCIONES ---
  const handleAddConstraint = () => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints.push({
      name: `R${updated.constraints.length + 1}`,
      coefficients: Array(updated.variables.length).fill(1),
      sense: "<=",
      rhs: 100
    });
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleDeleteConstraint = (idx: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints.splice(idx, 1);
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleUpdateConstraintName = (cIdx: number, name: string) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints[cIdx].name = name;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 200);
  };

  const handleUpdateConstraintRHS = (cIdx: number, val: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints[cIdx].rhs = val;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 120);
  };

  const handleUpdateConstraintSense = (cIdx: number, sense: string) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints[cIdx].sense = sense;
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleUpdateConstraintCoeff = (cIdx: number, vIdx: number, val: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.constraints[cIdx].coefficients[vIdx] = val;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 120);
  };

  // --- CRUD OBJETIVOS ---
  const handleAddObjective = () => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.objectives.push({
      name: `Objetivo ${updated.objectives.length + 1}`,
      sense: "maximize",
      coefficients: Array(updated.variables.length).fill(1)
    });
    const newW = [...weights, 0.5];
    const sum = newW.reduce((a, b) => a + b, 0);
    const norm = newW.map(w => parseFloat((w / sum).toFixed(3)));
    setWeights(norm);
    setCurrentModel(updated);
    executeSolve(updated, norm);
  };

  const handleDeleteObjective = (idx: number) => {
    if (currentModel.objectives.length <= 2) return;
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.objectives.splice(idx, 1);
    const newW = [...weights];
    newW.splice(idx, 1);
    const sum = newW.reduce((a, b) => a + b, 0);
    const norm = newW.map(w => parseFloat((w / sum).toFixed(3)));
    setWeights(norm);
    setCurrentModel(updated);
    executeSolve(updated, norm);
  };

  const handleUpdateObjectiveName = (objIdx: number, name: string) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.objectives[objIdx].name = name;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 200);
  };

  const handleToggleObjectiveSense = (objIdx: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.objectives[objIdx].sense = updated.objectives[objIdx].sense === "maximize" ? "minimize" : "maximize";
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleUpdateObjectiveCoeff = (objIdx: number, vIdx: number, val: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.objectives[objIdx].coefficients[vIdx] = val;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 120);
  };

  // --- CRUD VARIABLES ---
  const handleAddVariable = () => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    const nextIdx = updated.variables.length + 1;
    updated.variables.push({
      name: `x${nextIdx}`,
      lower_bound: 0,
      upper_bound: null,
      var_type: "continuous"
    });
    updated.objectives.forEach((obj: any) => obj.coefficients.push(0));
    updated.constraints.forEach((c: any) => c.coefficients.push(0));
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleDeleteVariable = (idx: number) => {
    if (currentModel.variables.length <= 2) return;
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.variables.splice(idx, 1);
    updated.objectives.forEach((obj: any) => obj.coefficients.splice(idx, 1));
    updated.constraints.forEach((c: any) => c.coefficients.splice(idx, 1));
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleUpdateVariableName = (vIdx: number, name: string) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.variables[vIdx].name = name;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 200);
  };

  const handleUpdateVariableType = (vIdx: number, var_type: string) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.variables[vIdx].var_type = var_type;
    if (var_type === "binary") {
      updated.variables[vIdx].lower_bound = 0;
      updated.variables[vIdx].upper_bound = 1;
    }
    setCurrentModel(updated);
    executeSolve(updated, weights);
  };

  const handleUpdateVariableLowerBound = (vIdx: number, val: number) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.variables[vIdx].lower_bound = val;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 150);
  };

  const handleUpdateVariableUpperBound = (vIdx: number, val: number | null) => {
    const updated = JSON.parse(JSON.stringify(currentModel));
    updated.variables[vIdx].upper_bound = val;
    setCurrentModel(updated);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      executeSolve(updated, weights);
    }, 150);
  };

  // Exportar Excel
  const handleExportExcel = () => {
    if (!solveResult) return;
    const wb = XLSX.utils.book_new();

    const payoffData = solveResult.payoff.matrix.map((row: number[], idx: number) => ({
      "Óptimo": solveResult.payoff.headers[idx],
      ...Object.fromEntries(row.map((val, i) => [solveResult.payoff.headers[i], val]))
    }));
    payoffData.push({
      "Óptimo": "Punto Ideal (Z*)",
      ...Object.fromEntries(solveResult.payoff.ideal_point.map((val: number, i: number) => [solveResult.payoff.headers[i], val]))
    });
    payoffData.push({
      "Óptimo": "Punto Anti-Ideal (Nadir)",
      ...Object.fromEntries(solveResult.payoff.anti_ideal_point.map((val: number, i: number) => [solveResult.payoff.headers[i], val]))
    });
    const ws1 = XLSX.utils.json_to_sheet(payoffData);
    XLSX.utils.book_append_sheet(wb, ws1, "Matriz_de_Pagos");

    const solData = Object.entries(solveResult.solutions).map(([key, sol]: any) => ({
      Métrica: key,
      ...sol.variables,
      ...Object.fromEntries(sol.objectives.map((val: number, i: number) => [`${solveResult.payoff.headers[i]} (Valor)`, val])),
      ...Object.fromEntries(sol.achievement_pct.map((val: number, i: number) => [`${solveResult.payoff.headers[i]} (% Logro)`, `${val.toFixed(2)}%`])),
      Distancia: sol.aggregate_distance.toFixed(4)
    }));
    const ws2 = XLSX.utils.json_to_sheet(solData);
    XLSX.utils.book_append_sheet(wb, ws2, "Soluciones_Compromiso");

    XLSX.writeFile(wb, `OptiCompromise_${currentModel.name.replace(/\s+/g, "_")}.xlsx`);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(currentModel, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentModel.name.replace(/\s+/g, "_")}.json`;
    a.click();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedModel = JSON.parse(event.target?.result as string);
        if (loadedModel.variables && loadedModel.objectives && loadedModel.constraints) {
          setCurrentModel(loadedModel);
          const w = loadedModel.defaultWeights || Array(loadedModel.objectives.length).fill(parseFloat((1 / loadedModel.objectives.length).toFixed(3)));
          setWeights(w);
          executeSolve(loadedModel, w);
        } else {
          alert("El archivo no tiene el formato de un modelo válido de OptiCompromise.");
        }
      } catch (err) {
        alert("Error al parsear el archivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const showFormulacion = activeView === "all" || activeView === "formulacion";
  const showMatriz = activeView === "all" || activeView === "matriz";
  const showResultados = activeView === "all" || activeView === "resultados";

  return (
    <div className="min-h-screen bg-[#F3F4F8] text-slate-900 flex font-sans">
      {/* ========================================================================= */}
      {/* SWISS GRID LEFT NAVIGATION RAIL (DARK NAVY + SIGNAL RED BADGE) */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex w-14 bg-[#111524] text-slate-400 flex-col items-center shrink-0 border-r border-slate-800 sticky top-0 h-screen z-40">
        {/* Swiss Signal Red Top Square */}
        <button
          onClick={() => setActiveView("all")}
          title="OptiCompromise — Vista Completa"
          className="w-14 h-14 bg-[#E11D48] hover:bg-[#BE123C] text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          <Compass className="w-6 h-6" />
        </button>

        {/* Rail Navigation Icons */}
        <nav className="flex-1 w-full flex flex-col items-center py-4 gap-2">
          <button
            onClick={() => setActiveView("all")}
            title="Vista Completa (Dashboard Swiss Grid)"
            className={`w-full h-11 flex items-center justify-center transition-colors relative cursor-pointer ${
              activeView === "all"
                ? "text-white bg-white/10 border-l-2 border-[#E11D48]"
                : "hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveView("formulacion")}
            title="1. Formulación (Variables, Objetivos, Restricciones)"
            className={`w-full h-11 flex items-center justify-center transition-colors relative cursor-pointer ${
              activeView === "formulacion"
                ? "text-white bg-white/10 border-l-2 border-[#E11D48]"
                : "hover:text-white hover:bg-white/5"
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveView("matriz")}
            title="2. Matriz de Pagos, Normalización y Pesos"
            className={`w-full h-11 flex items-center justify-center transition-colors relative cursor-pointer ${
              activeView === "matriz"
                ? "text-white bg-white/10 border-l-2 border-[#E11D48]"
                : "hover:text-white hover:bg-white/5"
            }`}
          >
            <TableIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveView("resultados")}
            title="3. Soluciones Compromiso y Frontera de Pareto"
            className={`w-full h-11 flex items-center justify-center transition-colors relative cursor-pointer ${
              activeView === "resultados"
                ? "text-white bg-white/10 border-l-2 border-[#E11D48]"
                : "hover:text-white hover:bg-white/5"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
        </nav>

        {/* Bottom Rail Utility */}
        <div className="w-full flex flex-col items-center py-4 gap-2 border-t border-slate-800/80">
          <a
            href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
            target="_blank"
            rel="noopener noreferrer"
            title="Manual Técnico en PDF"
            className="w-full h-10 flex items-center justify-center hover:text-white transition-colors"
          >
            <BookOpen className="w-4 h-4" />
          </a>
          <button
            onClick={() => setShowTheoryModal(true)}
            title="Glosario Teórico"
            className="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* COLUMNA PRINCIPAL (TOP BAR + HERO KPI BANNER + SWISS GRID CONTENT) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top White Sub-Header (Tabs estilo Swiss Dashboard) */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-[1440px] mx-auto px-5 h-14 flex items-center justify-between gap-4">
            {/* Left: Brand Mobile + View Filter Tabs */}
            <div className="flex items-center gap-6 h-full overflow-x-auto">
              <div className="flex md:hidden items-center gap-2 shrink-0">
                <div className="w-7 h-7 bg-[#E11D48] text-white flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm tracking-tight text-slate-900">OptiCompromise</span>
              </div>

              <div className="flex items-center gap-5 h-full text-xs font-medium">
                {[
                  { id: "all", label: "Flujo Completo" },
                  { id: "formulacion", label: "Formulación (1–4)" },
                  { id: "matriz", label: "Matriz & Pesos (5–6)" },
                  { id: "resultados", label: "Soluciones & Pareto (7–9)" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id as any)}
                    className={`h-full flex items-center border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                      activeView === tab.id
                        ? "border-[#E11D48] text-slate-900 font-bold"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {loading && (
                <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 font-mono font-bold uppercase tracking-wider animate-pulse shrink-0">
                  SciPy Resolviendo...
                </span>
              )}
            </div>

            {/* Right: Utility Action Bar */}
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportJSON}
                accept=".json"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Cargar un modelo previo en formato .json"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Cargar</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5 text-[#E11D48]" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={handleExportJSON}
                className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">JSON</span>
              </button>
              <a
                href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-white bg-[#111524] hover:bg-slate-800 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors"
                title="Descargar Manual de Usuario e Informe Técnico en PDF"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#E11D48]" />
                <span className="hidden md:inline">Manual PDF</span>
              </a>
              <button
                onClick={() => setShowTheoryModal(true)}
                className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden md:inline">Glosario</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="max-w-[1440px] mx-auto p-4 sm:p-6 flex-1 w-full space-y-5">

          {/* ========================================================================= */}
          {/* PASO 1: MODELO & SELECCIÓN */}
          {/* ========================================================================= */}
          <section id="paso-1" className="bg-white border border-slate-200 p-5 scroll-mt-20 space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                  01
                </span>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Casos de Estudio &amp; Selección de Problema
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Cambia entre modelos de prueba del curso o inicia un problema en blanco.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-full border border-slate-200">
                {[
                  { key: "carros_flota", label: "Flota 6 Autos" },
                  { key: "carros_triobjetivo", label: "Flota 3D" },
                  { key: "carros_biobjetivo", label: "Biobjetivo 2D" },
                  { key: "taller_produccion", label: "Vehículos 2D" },
                  { key: "mip_produccion", label: "MIP Bonus" },
                  { key: "personalizado", label: "+ En Blanco" }
                ].map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handleLoadPreset(preset.key)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      selectedPreset === preset.key
                        ? "bg-[#E11D48] text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-[#E11D48] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Modelo Activo:
                  </span>
                  <span className="text-xs font-bold text-slate-900">{currentModel.name}</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{currentModel.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] font-bold">
                <span className="px-2 py-1 bg-white border border-slate-200 text-slate-700">
                  {currentModel.variables.length}V · {currentModel.objectives.length}Z · {currentModel.constraints.length}R
                </span>
                {solveResult?.status === "optimal" && (
                  <span className="px-2 py-1 bg-emerald-50 border border-emerald-300 text-emerald-700">
                    ✓ ÓPTIMO
                  </span>
                )}
              </div>
            </div>
          </section>

          {showFormulacion && (
            <div className="space-y-5">

        {/* ========================================================================= */}
        {/* PASO 2: VARIABLES DE DECISIÓN */}
        {/* ========================================================================= */}
        <section id="paso-2" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                02
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Variables de Decisión (x_j)</h2>
                <p className="text-xs text-slate-500">
                  Son las cantidades que el decisor puede controlar directamente (ej. unidades a producir o despachar).
                </p>
              </div>
            </div>

            <button
              onClick={handleAddVariable}
              className="text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Variable
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3 w-48">Variable (Nombre)</th>
                  <th className="p-3 w-36">Tipo</th>
                  <th className="p-3 w-32">Cota Inferior (lb)</th>
                  <th className="p-3 w-32">Cota Superior (ub)</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {currentModel.variables.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 font-sans">
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => handleUpdateVariableName(i, e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-sm px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-[#E11D48]"
                        placeholder={`x${i + 1}`}
                      />
                    </td>
                    <td className="p-2.5 font-sans">
                      <select
                        value={v.var_type}
                        onChange={(e) => handleUpdateVariableType(i, e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs font-medium text-slate-800 focus:outline-[#E11D48]"
                      >
                        <option value="continuous">Continua (ℝ)</option>
                        <option value="integer">Entera (ℤ)</option>
                        <option value="binary">Binaria &#123;0, 1&#125;</option>
                      </select>
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        value={v.lower_bound ?? 0}
                        disabled={v.var_type === "binary"}
                        onChange={(e) => handleUpdateVariableLowerBound(i, parseFloat(e.target.value) || 0)}
                        className={`w-full bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-right font-mono font-bold focus:outline-[#E11D48] ${
                          v.var_type === "binary" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "text-slate-800"
                        }`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={v.upper_bound === null ? "" : v.upper_bound}
                        disabled={v.var_type === "binary"}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          handleUpdateVariableUpperBound(i, val === "" ? null : parseFloat(val));
                        }}
                        className={`w-full bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-right font-mono font-bold focus:outline-[#E11D48] ${
                          v.var_type === "binary" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "text-slate-800"
                        }`}
                        placeholder="∞ (Sin cota)"
                      />
                    </td>
                    <td className="p-2.5 text-right font-sans">
                      {currentModel.variables.length > 2 && (
                        <button
                          onClick={() => handleDeleteVariable(i)}
                          className="text-slate-400 hover:text-[#E11D48] transition-colors p-1 cursor-pointer"
                          title="Eliminar variable"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 3: FUNCIONES OBJETIVO */}
        {/* ========================================================================= */}
        <section id="paso-3" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                03
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Funciones Objetivo (Z_i)</h2>
                <p className="text-xs text-slate-500">
                  Criterios en conflicto. Puedes renombrar cada objetivo, alternar entre Maximizar/Minimizar y ajustar los coeficientes (c_j).
                </p>
              </div>
            </div>

            <button
              onClick={handleAddObjective}
              className="text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Objetivo
            </button>
          </div>

          <div className="space-y-3">
            {currentModel.objectives.map((obj, objIdx) => (
              <div key={objIdx} className="p-4 bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={() => handleToggleObjectiveSense(objIdx)}
                      className={`text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-sm transition-colors shrink-0 cursor-pointer border ${
                        obj.sense === "maximize"
                          ? "bg-[#111524] text-white border-[#111524] hover:bg-slate-800"
                          : "bg-rose-50 text-[#E11D48] border-rose-200 hover:bg-rose-100"
                      }`}
                      title="Haz clic para alternar entre Maximizar y Minimizar"
                    >
                      {obj.sense === "maximize" ? "▲ MAXIMIZAR" : "▼ MINIMIZAR"}
                    </button>
                    <input
                      type="text"
                      value={obj.name}
                      onChange={(e) => handleUpdateObjectiveName(objIdx, e.target.value)}
                      className="bg-white border border-slate-300 rounded-sm px-2.5 py-1 text-xs font-bold text-slate-900 w-full max-w-sm focus:outline-[#E11D48]"
                      placeholder="Nombre del objetivo"
                    />
                  </div>

                  {currentModel.objectives.length > 2 && (
                    <button
                      onClick={() => handleDeleteObjective(objIdx)}
                      className="text-slate-400 hover:text-[#E11D48] p-1 transition-colors cursor-pointer"
                      title="Eliminar objetivo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">Coeficientes (c_j):</span>
                  {obj.coefficients.map((coeff, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-1 bg-white px-2 py-1 rounded-sm border border-slate-300">
                      <span className="text-[10px] text-slate-500 font-mono font-medium max-w-[120px] truncate" title={currentModel.variables[vIdx]?.name}>
                        {currentModel.variables[vIdx]?.name || `x${vIdx + 1}`}:
                      </span>
                      <input
                        type="number"
                        value={coeff}
                        onChange={(e) => handleUpdateObjectiveCoeff(objIdx, vIdx, parseFloat(e.target.value) || 0)}
                        className="w-16 text-right font-mono font-bold text-xs focus:outline-[#E11D48]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 4: RESTRICCIONES DEL SISTEMA */}
        {/* ========================================================================= */}
        <section id="paso-4" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                04
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Restricciones del Sistema</h2>
                <p className="text-xs text-slate-500">
                  Límites de recursos, capacidad o demanda. Puedes renombrarlas, cambiar el sentido (&le;, &ge;, =) o editar coeficientes en vivo.
                </p>
              </div>
            </div>

            <button
              onClick={handleAddConstraint}
              className="text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Restricción
            </button>
          </div>

          <div className="space-y-2.5">
            {currentModel.constraints.map((c, cIdx) => (
              <div key={cIdx} className="p-3.5 bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => handleUpdateConstraintName(cIdx, e.target.value)}
                    className="bg-white border border-slate-300 rounded-sm px-2.5 py-1 text-xs font-bold text-slate-900 w-full max-w-xs focus:outline-[#E11D48]"
                    placeholder="Nombre de la restricción"
                  />

                  <button
                    onClick={() => handleDeleteConstraint(cIdx)}
                    className="text-slate-400 hover:text-[#E11D48] p-1 transition-colors cursor-pointer"
                    title="Eliminar restricción"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">Ecuación:</span>
                  {c.coefficients.map((coeff, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-1 bg-white px-2 py-1 rounded-sm border border-slate-300">
                      <span className="text-[10px] text-slate-500 font-mono font-medium max-w-[120px] truncate" title={currentModel.variables[vIdx]?.name}>
                        {currentModel.variables[vIdx]?.name || `x${vIdx + 1}`}:
                      </span>
                      <input
                        type="number"
                        value={coeff}
                        onChange={(e) => handleUpdateConstraintCoeff(cIdx, vIdx, parseFloat(e.target.value) || 0)}
                        className="w-14 text-right font-mono text-xs focus:outline-[#E11D48]"
                      />
                    </div>
                  ))}

                  <select
                    value={c.sense}
                    onChange={(e) => handleUpdateConstraintSense(cIdx, e.target.value)}
                    className="bg-white border border-slate-300 rounded-sm px-2 py-1 font-bold text-xs focus:outline-[#E11D48]"
                  >
                    <option value="<=">&le; (Menor o igual)</option>
                    <option value=">=">&ge; (Mayor o igual)</option>
                    <option value="==">= (Igualdad)</option>
                  </select>

                  <input
                    type="number"
                    value={c.rhs}
                    onChange={(e) => handleUpdateConstraintRHS(cIdx, parseFloat(e.target.value) || 0)}
                    className="w-24 bg-white border border-slate-300 rounded-sm px-2 py-1 text-right font-bold text-xs focus:outline-[#E11D48]"
                    title="Lado derecho (b)"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
            </div>
          )}

          {showMatriz && (
            <div className="space-y-5">
        {/* ========================================================================= */}
        {/* PASO 5: MATRIZ DE PAGOS & PUNTOS DE REFERENCIA */}
        {/* ========================================================================= */}
        <section id="paso-5" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              05
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Diagnóstico: Matriz de Pagos & Punto Ideal</h2>
              <p className="text-xs text-zinc-500">
                El solver optimiza cada objetivo de forma independiente para evidenciar el conflicto y extraer el Ideal y Nadir.
              </p>
            </div>
          </div>

          {solveResult?.status && solveResult.status !== "optimal" && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <span className="font-bold">Aviso de Factibilidad:</span> {solveResult.message || "El problema no tiene solución factible con las restricciones actuales."}
              </div>
            </div>
          )}

          {solveResult && solveResult.payoff?.matrix?.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                  <tr>
                    <th className="p-3">Evaluación Bajo Solución</th>
                    {solveResult.payoff.headers.map((h: string, i: number) => (
                      <th key={i} className="p-3 text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 font-mono text-[11px]">
                  {solveResult.payoff.matrix.map((row: number[], idx: number) => (
                    <tr key={idx} className="hover:bg-zinc-50">
                      <td className="p-3 font-sans font-semibold text-zinc-800 bg-zinc-50">
                        Óptimo de {solveResult.payoff.headers[idx]}
                      </td>
                      {row.map((val: number, i: number) => (
                        <td
                          key={i}
                          className={`p-3 text-right ${
                            idx === i ? "font-bold text-[#E11D48] bg-rose-50/50" : "text-slate-600"
                          }`}
                        >
                          {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Ideal */}
                  <tr className="bg-amber-50/80 font-bold border-t-2 border-amber-300">
                    <td className="p-3 font-sans text-amber-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-600" /> Punto Ideal (Z*)
                    </td>
                    {solveResult.payoff.ideal_point.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right text-amber-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                  </tr>
                  {/* Anti-Ideal */}
                  <tr className="bg-rose-50/70 font-semibold border-t border-rose-200">
                    <td className="p-3 font-sans text-rose-900">Punto Anti-Ideal / Nadir (Z_peor)</td>
                    {solveResult.payoff.anti_ideal_point.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right text-rose-800">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Calculando matriz de pagos...</p>
          )}

          <div className="p-4 bg-slate-50 border border-slate-200 border-l-4 border-l-[#E11D48] text-xs text-slate-800 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
            <p>
              <span className="font-bold">Fundamento Teórico:</span> El Punto Ideal reúne lo mejor de cada mundo, pero es
              matemáticamente inalcanzable. El rango entre el Ideal y el Nadir servirá para normalizar las distancias y calcular el
              grado de logro porcentual en los siguientes pasos.
            </p>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 6: NORMALIZACIÓN POR RANGO IDEAL–ANTI-IDEAL & ASIGNACIÓN DE PESOS */}
        {/* ========================================================================= */}
        <section id="paso-6" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                06
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Normalización por Rango Ideal–Anti-Ideal &amp; Asignación de Pesos (w_i)</h2>
                <p className="text-xs text-slate-500">
                  Transformación matemática de criterios heterogéneos a escala común [0, 1] e integración de las preferencias del decisor.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleSelectProfile("equitativo")}
              className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-rose-50 hover:text-[#E11D48] border border-slate-200 px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restablecer a Equitativo
            </button>
          </div>

          {/* Bloque Pedagógico: Fundamentos de la Normalización por Rango */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-3.5 bg-slate-50 border border-slate-200 border-t-2 border-t-[#111524] space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <Target className="w-4 h-4 text-[#E11D48] shrink-0" />
                <span>1. ¿Por qué es obligatoria?</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Los objetivos tienen unidades y magnitudes heterogéneas (ej. $2.3M en costo vs 8.5 en seguridad). Sin normalizar, el objetivo de millones de pesos absorbería el 99% de la función de distancia, forzando al algoritmo a ignorar por completo las demás metas.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 border-t-2 border-t-[#E11D48] space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <Maximize2 className="w-4 h-4 text-[#E11D48] shrink-0" />
                <span>2. Rango Factible (R_i)</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Para cada objetivo se calcula el rango factible: <span className="font-mono font-semibold text-slate-900">R_i = |Z_i* - Z_i_peor|</span> usando los valores extremos extraídos de la Matriz de Pagos. Representa el ancho total de variación posible del criterio.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 border-t-2 border-t-[#111524] space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-[#E11D48] shrink-0" />
                <span>3. Distancia Normalizada D_i(x)</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Mide la desviación relativa respecto a la perfección en escala adimensional [0, 1]: <span className="font-mono font-semibold text-slate-900">D_i(x) = |Z_i* - Z_i(x)| / R_i</span>. Donde <span className="font-bold">0</span> es perfección absoluta (Ideal) y <span className="font-bold">1</span> es degradación tolerable máxima (Nadir).
              </p>
            </div>
          </div>

          {/* Tabla Interactiva de Normalización con Datos Numéricos Reales */}
          {solveResult?.payoff && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Cálculo Explícito de Distancias Normalizadas y Ponderación por Criterio:
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  D_i(x) &isin; [0, 1] | &Sigma; w_i = 1.00
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Objetivo (Z_i)</th>
                      <th className="p-2.5 text-center">Sentido</th>
                      <th className="p-2.5 text-right">Punto Ideal (Z_i*)</th>
                      <th className="p-2.5 text-right">Anti-Ideal (Z_i_peor)</th>
                      <th className="p-2.5 text-right">Rango R_i</th>
                      <th className="p-2.5">Fórmula de Desviación D_i(x)</th>
                      <th className="p-2.5 text-center">Peso (w_i)</th>
                      <th className="p-2.5">Término Ponderado w_i &middot; D_i(x)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {currentModel.objectives.map((obj, i) => {
                      const idealVal = solveResult.payoff.ideal_point[i] ?? 0;
                      const antiVal = solveResult.payoff.anti_ideal_point[i] ?? 0;
                      const range = Math.abs(idealVal - antiVal);
                      const w = weights[i] ?? (1 / currentModel.objectives.length);
                      const isMin = obj.sense.toLowerCase() === "min";

                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2.5 font-sans font-bold text-slate-900">
                            {obj.name}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 font-bold border ${
                                isMin
                                  ? "bg-rose-50 text-[#E11D48] border-rose-200"
                                  : "bg-[#111524] text-white border-[#111524]"
                              }`}
                            >
                              {isMin ? "Minimizar" : "Maximizar"}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold text-amber-900 bg-amber-50/40">
                            {idealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td className="p-2.5 text-right font-semibold text-rose-800 bg-rose-50/30">
                            {antiVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-800">
                            {range.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td className="p-2.5 font-sans text-slate-700">
                            {range > 0 ? (
                              <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 border border-slate-200 inline-block">
                                {isMin
                                  ? `(Z_${i + 1} - ${idealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}) / ${range.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                                  : `(${idealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })} - Z_${i + 1}) / ${range.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                              </span>
                            ) : (
                              <span className="text-slate-400">Rango nulo</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="font-bold text-[#E11D48] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-sm">
                              {w.toFixed(2)} ({(w * 100).toFixed(0)}%)
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-slate-800">
                            {w.toFixed(2)} &times; D_{i + 1}(x)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-mono text-xs border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={6} className="p-2.5 text-right font-bold text-slate-700">
                        Suma Total de Pesos (∑ w_i):
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-sm text-xs inline-flex items-center gap-1 ${
                            isWeightSumValid
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {isWeightSumValid ? "✓ " : "✕ "}
                          {sumWeights.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-2.5 text-[10px] text-slate-500 font-sans">
                        {isWeightSumValid ? "Correcto (100%)" : "¡Inválido! Debe sumar 1.00"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tarjetas de Selección de Perfil del Decisor */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Selecciona tu Filosofía / Actitud de Decisión:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Perfil Equitativo */}
              <button
                onClick={() => handleSelectProfile("equitativo")}
                className={`p-3.5 border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                  decisionProfile === "equitativo"
                    ? "bg-rose-50/60 border-[#E11D48] ring-1 ring-[#E11D48]"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">⚖️ Equitativo / Minimax</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#111524] text-white">
                      L_inf
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    No tolera desbalances. Exige que ningún objetivo se quede rezagado y busca equidad estricta en el logro.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-[#E11D48]">Pesos iguales (1/q)</span>
              </button>

              {/* Perfil Compensatorio */}
              <button
                onClick={() => handleSelectProfile("compensatorio")}
                className={`p-3.5 border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                  decisionProfile === "compensatorio"
                    ? "bg-rose-50/60 border-[#E11D48] ring-1 ring-[#E11D48]"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">💼 Compensatorio / Utilitarista</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#111524] text-white">
                      L1
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Acepta que un desempeño sobresaliente en el criterio principal compense deficiencias en los demás.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-[#E11D48]">Prioridad 70% al principal</span>
              </button>

              {/* Perfil Moderado */}
              <button
                onClick={() => handleSelectProfile("moderado")}
                className={`p-3.5 border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                  decisionProfile === "moderado"
                    ? "bg-rose-50/60 border-[#E11D48] ring-1 ring-[#E11D48]"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">🌿 Compromiso Suave</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#111524] text-white">
                      L2
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Busca la mínima distancia euclidiana en el espacio global, evitando saltos bruscos a vértices extremos.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-[#E11D48]">Ponderación balanceada</span>
              </button>
            </div>
          </div>

          {/* Deslizadores Manuales de Pesos y Validación Estricta */}
          <div className="pt-2 space-y-3">
            {/* Cabecera de Control y Estado de Suma */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Ajuste de Pesos (w_i):
                </label>
                {/* Indicador en vivo de suma */}
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-mono font-bold border transition-colors ${
                    isWeightSumValid
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-rose-50 text-rose-800 border-rose-300 animate-pulse"
                  }`}
                >
                  {isWeightSumValid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Σ w_i = {sumWeights.toFixed(2)} (100% Correcto)</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-[#E11D48]" />
                      <span>Σ w_i = {sumWeights.toFixed(2)} (¡Inválido! ≠ 1.00)</span>
                    </>
                  )}
                </div>

                {decisionProfile === "personalizado" && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200">
                    Modo Manual Personalizado
                  </span>
                )}
              </div>

              {/* Controles de Balanceo y Normalización */}
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoBalance}
                    onChange={(e) => setAutoBalance(e.target.checked)}
                    className="rounded-sm w-3.5 h-3.5 accent-[#E11D48]"
                  />
                  <span className="text-[11px] font-medium">Auto-balancear suma a 1.00</span>
                </label>
                <button
                  onClick={handleNormalizeWeights}
                  type="button"
                  title="Re-escala proporcionalmente todos los pesos para que su suma sea exactamente 1.00"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 hover:text-[#E11D48] hover:border-[#E11D48] border border-slate-200 text-slate-700 font-bold text-[11px] rounded-sm transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Normalizar a 1.00</span>
                </button>
              </div>
            </div>

            {/* BANNER DE ERROR CRÍTICO SI NO SUMA 1.00 */}
            {!isWeightSumValid && (
              <div className="p-4 bg-rose-50 border-2 border-[#E11D48] text-rose-950 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-sm text-rose-950 block">
                      ⚠️ Error en la Ponderación: La suma de los pesos es {sumWeights.toFixed(3)} (debe ser exactamente 1.00)
                    </span>
                    <p className="text-rose-800 leading-relaxed">
                      En la Programación Compromiso multiobjetivo, los pesos ponderados deben sumar exactamente <b>1,00 (100%)</b>. Una suma distinta distorsiona las métricas de distancia (L1, L2 y L_inf) y produce resultados inconsistentes.
                      {sumWeights > 0 && (
                        <span className="block mt-1 text-[11px] text-rose-900">
                          (Para evitar incongruencias, el optimizador escalará internamente los pesos a:{" "}
                          <span className="font-mono font-bold">
                            [{weights.map((w) => (w / sumWeights).toFixed(2)).join(", ")}]
                          </span>
                          ).
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleNormalizeWeights}
                  className="px-3.5 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-xs rounded-sm transition-all shrink-0 flex items-center justify-center gap-1.5 self-start md:self-center cursor-pointer"
                >
                  <span>⚡ Auto-Normalizar a 1.00</span>
                </button>
              </div>
            )}

            {/* Cuadrícula de Deslizadores y Cajas Numéricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentModel.objectives.map((obj, i) => {
                const wVal = weights[i] ?? 0;
                const effectivePct = sumWeights > 0 ? ((wVal / sumWeights) * 100).toFixed(0) : 0;
                return (
                  <div
                    key={i}
                    className={`p-4 border transition-all space-y-2.5 ${
                      !isWeightSumValid
                        ? "bg-rose-50/40 border-rose-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="font-bold text-slate-900 truncate" title={obj.name}>
                          {obj.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          ({obj.sense === "min" || obj.sense === "minimize" ? "Min" : "Max"})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono font-bold text-[#E11D48] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-sm text-[11px]">
                          w_{i + 1} = {wVal.toFixed(2)} ({((wVal) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={wVal}
                        onChange={(e) => handleWeightChange(i, parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#E11D48]"
                      />
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={wVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) handleWeightChange(i, val);
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono font-bold text-right bg-white border border-slate-300 rounded-sm focus:ring-1 focus:ring-[#E11D48] focus:outline-none"
                      />
                    </div>

                    {!isWeightSumValid && sumWeights > 0 && (
                      <div className="text-[10px] text-slate-500 font-mono flex justify-between pt-0.5">
                        <span>Peso relativo efectivo:</span>
                        <span className="font-bold text-slate-800">
                          {(wVal / sumWeights).toFixed(3)} ({effectivePct}%)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
            </div>
          )}

          {showResultados && (
            <div className="space-y-5">
        {/* ========================================================================= */}
        {/* PASO 7: SOLUCIONES COMPROMISO (L1, L2, L_inf) */}
        {/* ========================================================================= */}
        <section id="paso-7" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              07
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Soluciones Compromiso &amp; Grado de Logro (%)</h2>
              <p className="text-xs text-slate-500">
                Comparativa entre las tres métricas de proximidad al punto ideal según el perfil y pesos elegidos.
              </p>
            </div>
          </div>

          {/* Alerta si la suma de pesos no es 1.00 */}
          {!isWeightSumValid && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <b>Aviso de Ponderación:</b> Los pesos ingresados suman <b>{sumWeights.toFixed(3)}</b> (≠ 1.00). El optimizador utilizó automáticamente los pesos normalizados a escala 1.00.
                </span>
              </div>
              <button
                onClick={handleNormalizeWeights}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-sm transition-colors shrink-0 self-end sm:self-auto cursor-pointer"
              >
                ⚡ Normalizar a 1.00
              </button>
            </div>
          )}

          {/* Tarjeta de Recomendación según el Perfil */}
          <div className="p-4 border border-slate-200 border-l-4 border-l-[#E11D48] bg-slate-50 flex items-start gap-3">
            <Target className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <span className="font-bold text-slate-900 block">
                Recomendación para tu Perfil ({decisionProfile.toUpperCase()}):
              </span>
              <p className="leading-relaxed">
                {decisionProfile === "equitativo" && (
                  <span>
                    Como tu perfil busca <b>Equidad Estricta (Minimax)</b>, la solución recomendada es <b>L_infinito</b>. Garantiza que todos los objetivos alcancen exactamente el mismo porcentaje de satisfacción (sin que ningún criterio se sacrifique para inflar otro).
                  </span>
                )}
                {decisionProfile === "compensatorio" && (
                  <span>
                    Como tu perfil es <b>Compensatorio (Utilitarista)</b>, la solución recomendada es <b>L1</b>. Maximiza el beneficio global del criterio prioritario aprovechando el efecto compensatorio.
                  </span>
                )}
                {decisionProfile === "moderado" && (
                  <span>
                    Como tu perfil busca un <b>Compromiso Suave</b>, la solución recomendada es <b>L2 (Euclidiana)</b>. Proporciona la menor distancia geométrica global en el espacio de objetivos sin caer en soluciones extremas.
                  </span>
                )}
                {decisionProfile === "personalizado" && (
                  <span>
                    Has calibrado pesos personalizados. Analiza en la tabla cuál de las tres métricas te ofrece el mejor balance de grado de logro (% Z&#39;) de acuerdo con tus prioridades.
                  </span>
                )}
              </p>
            </div>
          </div>

          {solveResult?.status && solveResult.status !== "optimal" && (
            <div className="p-4 bg-rose-50 border border-[#E11D48] text-rose-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#E11D48]" />
              <div>
                <span className="font-bold">Aviso de Factibilidad:</span> {solveResult.message || "El problema no tiene solución factible con las restricciones actuales."}
              </div>
            </div>
          )}

          {solveResult && solveResult.payoff?.matrix?.length > 0 ? (
            <>
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Métrica</th>
                    <th className="p-3">Filosofía</th>
                    <th className="p-3">Variables (x*)</th>
                    {solveResult.payoff.headers.map((h: string, i: number) => (
                      <th key={i} className="p-3 text-right">{h} (Real)</th>
                    ))}
                    {solveResult.payoff.headers.map((h: string, i: number) => (
                      <th key={i} className="p-3 text-right">{h} (% Logro)</th>
                    ))}
                    <th className="p-3 text-right">Distancia D_p</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {/* L1 */}
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-sans font-bold text-blue-700 bg-blue-50/50">L1 (Manhattan)</td>
                    <td className="p-3 font-sans text-slate-500 text-[10px]">Efecto compensatorio</td>
                    <td className="p-3 text-slate-700">
                      {Object.entries(solveResult.solutions.L1?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L1?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-slate-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                    {solveResult.solutions.L1?.achievement_pct.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-bold text-blue-800 bg-blue-50/30">
                        {val.toFixed(2)}%
                      </td>
                    ))}
                    <td className="p-3 text-right font-bold">{solveResult.solutions.L1?.aggregate_distance.toFixed(4)}</td>
                  </tr>

                  {/* L2 */}
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-sans font-bold text-slate-900 bg-slate-100/80">L2 (Euclidiana)</td>
                    <td className="p-3 font-sans text-slate-500 text-[10px]">Compromiso suave</td>
                    <td className="p-3 text-slate-700">
                      {Object.entries(solveResult.solutions.L2?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L2?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-slate-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                    {solveResult.solutions.L2?.achievement_pct.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-bold text-slate-900 bg-slate-100/40">
                        {val.toFixed(2)}%
                      </td>
                    ))}
                    <td className="p-3 text-right font-bold">{solveResult.solutions.L2?.aggregate_distance.toFixed(4)}</td>
                  </tr>

                  {/* L_inf */}
                  <tr className="hover:bg-slate-50 bg-rose-50/20">
                    <td className="p-3 font-sans font-bold text-[#E11D48] bg-rose-50/60">L_inf (Minimax)</td>
                    <td className="p-3 font-sans text-slate-500 text-[10px]">Equilibrio estricto</td>
                    <td className="p-3 text-slate-700">
                      {Object.entries(solveResult.solutions.L_inf?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L_inf?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-slate-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                    {solveResult.solutions.L_inf?.achievement_pct.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-bold text-[#E11D48] bg-rose-50/30">
                        {val.toFixed(2)}%
                      </td>
                    ))}
                    <td className="p-3 text-right font-bold">{solveResult.solutions.L_inf?.aggregate_distance.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Desglose Visual Swiss Grid (Barras Horizontales de Logro % por Métrica) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {[
                { key: "L1", title: "L1 (Manhattan)", subtitle: "Compensatorio", barColor: "bg-blue-600", badge: "text-blue-700 bg-blue-50 border-blue-200" },
                { key: "L2", title: "L2 (Euclidiana)", subtitle: "Compromiso Suave", barColor: "bg-[#111524]", badge: "text-slate-800 bg-slate-100 border-slate-300" },
                { key: "L_inf", title: "L∞ (Minimax)", subtitle: "Equidad Estricta", barColor: "bg-[#E11D48]", badge: "text-[#E11D48] bg-rose-50 border-rose-200" }
              ].map((m) => {
                const sol = solveResult.solutions?.[m.key];
                if (!sol) return null;
                return (
                  <div key={m.key} className="border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{m.title}</span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{m.subtitle}</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${m.badge}`}>
                        D = {sol.aggregate_distance?.toFixed(4)}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {solveResult.payoff.headers.map((h: string, i: number) => {
                        const pct = Math.max(0, Math.min(100, sol.achievement_pct?.[i] ?? 0));
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-700 font-medium truncate pr-2" title={h}>
                                {h}
                              </span>
                              <span className="font-mono font-bold tabular-nums text-slate-900 shrink-0">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 overflow-hidden">
                              <div
                                className={`h-full ${m.barColor} transition-all duration-300`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Calculando soluciones...</p>
          )}
        </section>

        {/* ========================================================================= */}
        {/* PASO 8: VISUALIZACIÓN GRÁFICA EN PLOTLY */}
        {/* ========================================================================= */}
        <section id="paso-8" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              08
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Visualización en el Espacio de Objetivos (Plotly)</h2>
              <p className="text-xs text-slate-500">
                La Frontera de Pareto muestra el límite eficiente de lo alcanzable. Observa la cercanía al punto Ideal.
              </p>
            </div>
          </div>

          {solveResult && <InteractiveCharts solveResult={solveResult} currentModel={currentModel} />}
        </section>

        {/* ========================================================================= */}
        {/* PASO 9: EXPORTACIÓN & REPORTE FINAL */}
        {/* ========================================================================= */}
        <section id="paso-9" className="bg-white border border-slate-200 p-5 sm:p-6 scroll-mt-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#E11D48] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              09
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Cierre y Exportación de Resultados</h2>
              <p className="text-xs text-slate-500">
                Descarga el informe completo o guarda el archivo del modelo para futuras sesiones.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={handleExportExcel}
              className="p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-[#E11D48] flex flex-col items-start gap-2 transition-all text-left cursor-pointer"
            >
              <FileDown className="w-5 h-5 text-[#E11D48]" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Descargar Excel (.xlsx)</span>
                <span className="text-[11px] text-slate-500">Tablas formateadas con Matriz de Pagos y Métricas</span>
              </div>
            </button>

            <button
              onClick={handleExportJSON}
              className="p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-[#E11D48] flex flex-col items-start gap-2 transition-all text-left cursor-pointer"
            >
              <FileDown className="w-5 h-5 text-[#E11D48]" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Guardar Modelo (.json)</span>
                <span className="text-[11px] text-slate-500">Archivo propio para reabrir el problema cuando desees</span>
              </div>
            </button>

            <a
              href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-[#E11D48] flex flex-col items-start gap-2 transition-all text-left"
            >
              <FileDown className="w-5 h-5 text-[#E11D48]" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Manual de Usuario (PDF)</span>
                <span className="text-[11px] text-slate-500">Informe técnico detallado con capturas de pantalla y fundamentos</span>
              </div>
            </a>

            <button
              onClick={() => window.print()}
              className="p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-[#E11D48] flex flex-col items-start gap-2 transition-all text-left cursor-pointer"
            >
              <FileDown className="w-5 h-5 text-[#111524]" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Imprimir / Guardar PDF</span>
                <span className="text-[11px] text-slate-500">Reporte ejecutivo listo para presentación</span>
              </div>
            </button>
          </div>
        </section>
            </div>
          )}

      </main>

      {/* Pie de Página Swiss Grid */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500">
        <p className="font-medium text-slate-700">
          OptiCompromise — Programación de Compromiso Multiobjetivo (IAD)
        </p>
        <p className="font-mono text-[10px] text-slate-400">
          Facultad de Minas · UNAL Medellín · Licencia MIT
        </p>
      </footer>
      </div>

      {/* Modal Guía Teórica y Glosario */}
      {showTheoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#E11D48]" />
                <h3 className="font-bold text-slate-900 text-base">Guía Teórica de Programación de Compromiso</h3>
              </div>
              <button
                onClick={() => setShowTheoryModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-700 leading-relaxed">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">1. Distancia Normalizada D_i(x)</h4>
                <p>
                  Para evitar distorsiones por escalas o unidades de medida dispares, la distancia al ideal se normaliza respecto al rango ideal–anti-ideal:
                </p>
                <div className="bg-slate-100 p-2 my-1 font-mono text-[11px]">
                  D_i(x) = (Z_i* - Z_i(x)) / (Z_i* - Z_i_peor)
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">2. Grado de Logro Porcentual Z&#39;_i(x)</h4>
                <p>
                  Mide el porcentaje de satisfacción alcanzado respecto al ideal:
                </p>
                <div className="bg-slate-100 p-2 my-1 font-mono text-[11px]">
                  Z&#39;_i(x) = 100 · (1 - D_i(x)) [%]
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">3. Propiedades Clave de las Métricas</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <span className="font-bold text-blue-700">Métrica L1:</span> Efecto compensatorio. Grandes ganancias en
                    un objetivo compensan deficiencias graves en otro. Tiende a atraparse en vértices extremos.
                  </li>
                  <li>
                    <span className="font-bold text-slate-900">Métrica L2:</span> Compromiso suave euclidiano. Permite
                    seleccionar soluciones intermedias sobre la frontera según los pesos.
                  </li>
                  <li>
                    <span className="font-bold text-[#E11D48]">Métrica L_inf (Minimax):</span> Equilibrio y equidad estricta.
                    Castiga severamente los desbalances. Si los pesos son iguales, todos los objetivos alcanzan exactamente el
                    mismo grado de logro porcentual.
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowTheoryModal(false)}
                className="px-4 py-2 bg-[#E11D48] text-white text-xs font-bold hover:bg-[#BE123C] cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
