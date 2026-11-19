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
  AlertCircle
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
    setWeights(normalized);
    executeSolve(currentModel, normalized);
  };

  // Sliders reactivos en vivo
  const handleWeightChange = (index: number, val: number) => {
    setDecisionProfile("personalizado");
    const newWeights = [...weights];
    newWeights[index] = val;
    if (weights.length === 2) {
      newWeights[1 - index] = Math.max(0, parseFloat((1 - val).toFixed(3)));
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

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex flex-col font-sans">
      {/* Encabezado Superior Fijo */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
              <Compass className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-zinc-900">OptiCompromise</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  IAD UNAL
                </span>
                {loading && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 animate-pulse font-mono font-medium">
                    SciPy Resolviendo...
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">Flujo Guiado Paso a Paso para Toma de Decisiones Multiobjetivo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Cargar un modelo previo en formato .json"
            >
              <Upload className="w-3.5 h-3.5" />
              Cargar
            </button>
            <button
              onClick={handleExportExcel}
              className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5" />
              Excel (.xlsx)
            </button>
            <button
              onClick={handleExportJSON}
              className="text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              JSON
            </button>
            <a
              href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Descargar Manual de Usuario e Informe Técnico en PDF"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              Manual PDF
            </a>
            <button
              onClick={() => setShowTheoryModal(true)}
              className="text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-zinc-600" />
              Glosario
            </button>
          </div>
        </div>

        {/* Índice Rápido de Navegación Tipo Colab */}
        <div className="max-w-6xl mx-auto px-4 border-t border-zinc-100 overflow-x-auto py-1.5 flex gap-2 text-xs font-medium">
          {[
            { id: "paso-1", label: "1. Modelo" },
            { id: "paso-2", label: "2. Variables" },
            { id: "paso-3", label: "3. Objetivos" },
            { id: "paso-4", label: "4. Restricciones" },
            { id: "paso-5", label: "5. Matriz Pagos" },
            { id: "paso-6", label: "6. Normalización y Pesos" },
            { id: "paso-7", label: "7. Soluciones L1/L2/L∞" },
            { id: "paso-8", label: "8. Gráfico Pareto" },
            { id: "paso-9", label: "9. Exportar" }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className="px-2.5 py-1 rounded text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 whitespace-nowrap transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Contenido en Flujo Continuo Tipo Cuaderno / Colab */}
      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-10">

        {/* ========================================================================= */}
        {/* PASO 1: MODELO & SELECCIÓN */}
        {/* ========================================================================= */}
        <section id="paso-1" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
              01
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Iniciar Problema Multiobjetivo</h2>
              <p className="text-xs text-zinc-500">
                Selecciona uno de los casos de validación del curso o crea un problema nuevo desde cero.
              </p>
            </div>
          </div>

          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">Problema Cargado:</span>
              <span className="text-sm font-bold text-zinc-900">{currentModel.name}</span>
              <p className="text-xs text-zinc-500 mt-0.5">{currentModel.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => handleLoadPreset("carros_flota")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "carros_flota" ? "bg-zinc-900 text-white shadow-2xs" : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                Flota Completa (6 Autos)
              </button>
              <button
                onClick={() => handleLoadPreset("carros_triobjetivo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "carros_triobjetivo" ? "bg-purple-900 text-white shadow-2xs" : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100"
                }`}
              >
                🧊 Flota 3D (3 Criterios)
              </button>
              <button
                onClick={() => handleLoadPreset("carros_biobjetivo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "carros_biobjetivo" ? "bg-zinc-900 text-white shadow-2xs" : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                Biobjetivo 2D (BYD vs Tesla)
              </button>
              <button
                onClick={() => handleLoadPreset("taller_produccion")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "taller_produccion" ? "bg-zinc-900 text-white shadow-2xs" : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                Vehículos Ligeros (Caso 2D)
              </button>
              <button
                onClick={() => handleLoadPreset("mip_produccion")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "mip_produccion" ? "bg-zinc-900 text-white shadow-2xs" : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                MIP Entero/Binario (Bonus)
              </button>
              <button
                onClick={() => handleLoadPreset("personalizado")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPreset === "personalizado" ? "bg-zinc-900 text-white shadow-2xs" : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                + En Blanco (Nuevo)
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 2: VARIABLES DE DECISIÓN */}
        {/* ========================================================================= */}
        <section id="paso-2" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                02
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Variables de Decisión (x_j)</h2>
                <p className="text-xs text-zinc-500">
                  Son las cantidades que el decisor puede controlar directamente (ej. unidades a producir o despachar).
                </p>
              </div>
            </div>

            <button
              onClick={handleAddVariable}
              className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Variable
            </button>
          </div>

          <div className="overflow-x-auto border border-zinc-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                <tr>
                  <th className="p-3 w-48">Variable (Nombre)</th>
                  <th className="p-3 w-36">Tipo</th>
                  <th className="p-3 w-32">Cota Inferior (lb)</th>
                  <th className="p-3 w-32">Cota Superior (ub)</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 font-mono text-[11px]">
                {currentModel.variables.map((v, i) => (
                  <tr key={i} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-2.5 font-sans">
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => handleUpdateVariableName(i, e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded px-2.5 py-1 text-xs font-bold text-zinc-900 focus:outline-emerald-500 shadow-2xs"
                        placeholder={`x${i + 1}`}
                      />
                    </td>
                    <td className="p-2.5 font-sans">
                      <select
                        value={v.var_type}
                        onChange={(e) => handleUpdateVariableType(i, e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded px-2 py-1 text-xs font-medium text-zinc-800 focus:outline-emerald-500 shadow-2xs"
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
                        className={`w-full bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-right font-mono font-bold focus:outline-emerald-500 shadow-2xs ${
                          v.var_type === "binary" ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" : "text-zinc-800"
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
                        className={`w-full bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-right font-mono font-bold focus:outline-emerald-500 shadow-2xs ${
                          v.var_type === "binary" ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" : "text-zinc-800"
                        }`}
                        placeholder="∞ (Sin cota)"
                      />
                    </td>
                    <td className="p-2.5 text-right font-sans">
                      {currentModel.variables.length > 2 && (
                        <button
                          onClick={() => handleDeleteVariable(i)}
                          className="text-zinc-400 hover:text-rose-600 transition-colors p-1"
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
        <section id="paso-3" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                03
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Funciones Objetivo (Z_i)</h2>
                <p className="text-xs text-zinc-500">
                  Criterios en conflicto. Puedes renombrar cada objetivo, alternar entre Maximizar/Minimizar y ajustar los coeficientes (c_j).
                </p>
              </div>
            </div>

            <button
              onClick={handleAddObjective}
              className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Objetivo
            </button>
          </div>

          <div className="space-y-3">
            {currentModel.objectives.map((obj, objIdx) => (
              <div key={objIdx} className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={() => handleToggleObjectiveSense(objIdx)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-md transition-colors shrink-0 shadow-2xs ${
                        obj.sense === "maximize"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                      }`}
                      title="Haz clic para alternar entre Maximizar y Minimizar"
                    >
                      {obj.sense === "maximize" ? "▲ MAXIMIZAR" : "▼ MINIMIZAR"}
                    </button>
                    <input
                      type="text"
                      value={obj.name}
                      onChange={(e) => handleUpdateObjectiveName(objIdx, e.target.value)}
                      className="bg-white border border-zinc-300 rounded-md px-2.5 py-1 text-xs font-bold text-zinc-900 w-full max-w-sm focus:outline-emerald-500 shadow-2xs"
                      placeholder="Nombre del objetivo"
                    />
                  </div>

                  {currentModel.objectives.length > 2 && (
                    <button
                      onClick={() => handleDeleteObjective(objIdx)}
                      className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                      title="Eliminar objetivo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500 font-semibold text-[11px]">Coeficientes (c_j):</span>
                  {obj.coefficients.map((coeff, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-zinc-300 shadow-2xs">
                      <span className="text-[10px] text-zinc-500 font-mono font-medium max-w-[120px] truncate" title={currentModel.variables[vIdx]?.name}>
                        {currentModel.variables[vIdx]?.name || `x${vIdx + 1}`}:
                      </span>
                      <input
                        type="number"
                        value={coeff}
                        onChange={(e) => handleUpdateObjectiveCoeff(objIdx, vIdx, parseFloat(e.target.value) || 0)}
                        className="w-16 text-right font-mono font-bold text-xs focus:outline-emerald-500"
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
        <section id="paso-4" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                04
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Restricciones del Sistema</h2>
                <p className="text-xs text-zinc-500">
                  Límites de recursos, capacidad o demanda. Puedes renombrarlas, cambiar el sentido (&le;, &ge;, =) o editar coeficientes en vivo.
                </p>
              </div>
            </div>

            <button
              onClick={handleAddConstraint}
              className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Restricción
            </button>
          </div>

          <div className="space-y-2.5">
            {currentModel.constraints.map((c, cIdx) => (
              <div key={cIdx} className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => handleUpdateConstraintName(cIdx, e.target.value)}
                    className="bg-white border border-zinc-300 rounded px-2.5 py-1 text-xs font-bold text-zinc-900 w-full max-w-xs focus:outline-emerald-500 shadow-2xs"
                    placeholder="Nombre de la restricción"
                  />

                  <button
                    onClick={() => handleDeleteConstraint(cIdx)}
                    className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                    title="Eliminar restricción"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-zinc-500 font-semibold text-[11px]">Ecuación:</span>
                  {c.coefficients.map((coeff, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-zinc-300 shadow-2xs">
                      <span className="text-[10px] text-zinc-500 font-mono font-medium max-w-[120px] truncate" title={currentModel.variables[vIdx]?.name}>
                        {currentModel.variables[vIdx]?.name || `x${vIdx + 1}`}:
                      </span>
                      <input
                        type="number"
                        value={coeff}
                        onChange={(e) => handleUpdateConstraintCoeff(cIdx, vIdx, parseFloat(e.target.value) || 0)}
                        className="w-14 text-right font-mono text-xs focus:outline-emerald-500"
                      />
                    </div>
                  ))}

                  <select
                    value={c.sense}
                    onChange={(e) => handleUpdateConstraintSense(cIdx, e.target.value)}
                    className="bg-white border border-zinc-300 rounded px-2 py-1 font-bold text-xs focus:outline-emerald-500 shadow-2xs"
                  >
                    <option value="<=">&le; (Menor o igual)</option>
                    <option value=">=">&ge; (Mayor o igual)</option>
                    <option value="==">= (Igualdad)</option>
                  </select>

                  <input
                    type="number"
                    value={c.rhs}
                    onChange={(e) => handleUpdateConstraintRHS(cIdx, parseFloat(e.target.value) || 0)}
                    className="w-24 bg-white border border-zinc-300 rounded px-2 py-1 text-right font-bold text-xs focus:outline-emerald-500 shadow-2xs"
                    title="Lado derecho (b)"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 5: MATRIZ DE PAGOS & PUNTOS DE REFERENCIA */}
        {/* ========================================================================= */}
        <section id="paso-5" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              05
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Diagnóstico: Matriz de Pagos & Punto Ideal</h2>
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
            <div className="overflow-x-auto border border-zinc-200 rounded-xl">
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
                            idx === i ? "font-bold text-emerald-700 bg-emerald-50/50" : "text-zinc-600"
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
            <p className="text-xs text-zinc-400">Calculando matriz de pagos...</p>
          )}

          <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
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
        <section id="paso-6" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                06
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Normalización por Rango Ideal–Anti-Ideal & Asignación de Pesos (w_i)</h2>
                <p className="text-xs text-zinc-500">
                  Transformación matemática de criterios heterogéneos a escala común [0, 1] e integración de las preferencias del decisor.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleSelectProfile("equitativo")}
              className="text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restablecer a Equitativo
            </button>
          </div>

          {/* Bloque Pedagógico: Fundamentos de la Normalización por Rango */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-blue-900">
                <Target className="w-4 h-4 text-blue-700 shrink-0" />
                <span>1. ¿Por qué es obligatoria?</span>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Los objetivos tienen unidades y magnitudes heterogéneas (ej. $2.3M en costo vs 8.5 en seguridad). Sin normalizar, el objetivo de millones de pesos absorbería el 99% de la función de distancia, forzando al algoritmo a ignorar por completo las demás metas.
              </p>
            </div>

            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <Maximize2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>2. Rango Factible (R_i)</span>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Para cada objetivo se calcula el rango factible: <span className="font-mono font-semibold text-emerald-950">R_i = |Z_i* - Z_i_peor|</span> usando los valores extremos extraídos de la Matriz de Pagos. Representa el ancho total de variación posible del criterio.
              </p>
            </div>

            <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-purple-900">
                <CheckCircle2 className="w-4 h-4 text-purple-700 shrink-0" />
                <span>3. Distancia Normalizada D_i(x)</span>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Mide la desviación relativa respecto a la perfección en escala adimensional [0, 1]: <span className="font-mono font-semibold text-purple-950">D_i(x) = |Z_i* - Z_i(x)| / R_i</span>. Donde <span className="font-bold">0</span> es perfección absoluta (Ideal) y <span className="font-bold">1</span> es degradación tolerable máxima (Nadir).
              </p>
            </div>
          </div>

          {/* Tabla Interactiva de Normalización con Datos Numéricos Reales */}
          {solveResult?.payoff && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                  Cálculo Explícito de Distancias Normalizadas y Ponderación por Criterio:
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  D_i(x) &isin; [0, 1] | &Sigma; w_i = 1.00
                </span>
              </div>

              <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
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
                  <tbody className="divide-y divide-zinc-200 font-mono text-[11px]">
                    {currentModel.objectives.map((obj, i) => {
                      const idealVal = solveResult.payoff.ideal_point[i] ?? 0;
                      const antiVal = solveResult.payoff.anti_ideal_point[i] ?? 0;
                      const range = Math.abs(idealVal - antiVal);
                      const w = weights[i] ?? (1 / currentModel.objectives.length);
                      const isMin = obj.sense.toLowerCase() === "min";

                      return (
                        <tr key={i} className="hover:bg-zinc-50">
                          <td className="p-2.5 font-sans font-bold text-zinc-900">
                            {obj.name}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isMin
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
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
                          <td className="p-2.5 text-right font-bold text-zinc-800">
                            {range.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td className="p-2.5 font-sans text-zinc-700">
                            {range > 0 ? (
                              <span className="font-mono text-[10px] bg-zinc-100 px-2 py-1 rounded border border-zinc-200 inline-block">
                                {isMin
                                  ? `(Z_${i + 1} - ${idealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}) / ${range.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                                  : `(${idealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })} - Z_${i + 1}) / ${range.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                              </span>
                            ) : (
                              <span className="text-zinc-400">Rango nulo</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {w.toFixed(2)} ({(w * 100).toFixed(0)}%)
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-zinc-800">
                            {w.toFixed(2)} &times; D_{i + 1}(x)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tarjetas de Selección de Perfil del Decisor */}
          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">
              Selecciona tu Filosofía / Actitud de Decisión:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Perfil Equitativo */}
              <button
                onClick={() => handleSelectProfile("equitativo")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                  decisionProfile === "equitativo"
                    ? "bg-purple-50/70 border-purple-400 ring-2 ring-purple-200 shadow-xs"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-900">⚖️ Equitativo / Minimax</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                      L_inf
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                    No tolera desbalances. Exige que ningún objetivo se quede rezagado y busca equidad estricta en el logro.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-purple-700">Pesos iguales (1/q)</span>
              </button>

              {/* Perfil Compensatorio */}
              <button
                onClick={() => handleSelectProfile("compensatorio")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                  decisionProfile === "compensatorio"
                    ? "bg-blue-50/70 border-blue-400 ring-2 ring-blue-200 shadow-xs"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-900">💼 Compensatorio / Utilitarista</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      L1
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                    Acepta que un desempeño sobresaliente en el criterio principal compense deficiencias en los demás.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-blue-700">Prioridad 70% al principal</span>
              </button>

              {/* Perfil Moderado */}
              <button
                onClick={() => handleSelectProfile("moderado")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                  decisionProfile === "moderado"
                    ? "bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-200 shadow-xs"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-900">🌿 Compromiso Suave</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      L2
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                    Busca la mínima distancia euclidiana en el espacio global, evitando saltos bruscos a vértices extremos.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-emerald-700">Ponderación balanceada</span>
              </button>
            </div>
          </div>

          {/* Deslizadores Manuales de Pesos */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                Ajuste Fino de Deslizadores (Suma = 1,0):
              </label>
              {decisionProfile === "personalizado" && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Modo Personalizado Activo
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentModel.objectives.map((obj, i) => (
                <div key={i} className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-zinc-800">{obj.name}</span>
                    <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      w_{i + 1} = {(weights[i] ?? 0.5).toFixed(2)} ({((weights[i] ?? 0.5) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights[i] ?? 0.5}
                    onChange={(e) => handleWeightChange(i, parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PASO 7: SOLUCIONES COMPROMISO (L1, L2, L_inf) */}
        {/* ========================================================================= */}
        <section id="paso-7" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              07
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Soluciones Compromiso & Grado de Logro (%)</h2>
              <p className="text-xs text-zinc-500">
                Comparativa entre las tres métricas de proximidad al punto ideal según el perfil y pesos elegidos.
              </p>
            </div>
          </div>

          {/* Tarjeta de Recomendación según el Perfil */}
          <div className="p-4 rounded-xl border bg-gradient-to-r from-zinc-50 to-emerald-50/40 border-zinc-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-700 space-y-1">
              <span className="font-bold text-zinc-900 block">
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
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <span className="font-bold">Aviso de Factibilidad:</span> {solveResult.message || "El problema no tiene solución factible con las restricciones actuales."}
              </div>
            </div>
          )}

          {solveResult && solveResult.payoff?.matrix?.length > 0 ? (
            <div className="overflow-x-auto border border-zinc-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
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
                <tbody className="divide-y divide-zinc-200 font-mono text-[11px]">
                  {/* L1 */}
                  <tr className="hover:bg-zinc-50">
                    <td className="p-3 font-sans font-bold text-blue-700 bg-blue-50/50">L1 (Manhattan)</td>
                    <td className="p-3 font-sans text-zinc-500 text-[10px]">Efecto compensatorio</td>
                    <td className="p-3 text-zinc-700">
                      {Object.entries(solveResult.solutions.L1?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L1?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-zinc-900">
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
                  <tr className="hover:bg-zinc-50">
                    <td className="p-3 font-sans font-bold text-emerald-700 bg-emerald-50/50">L2 (Euclidiana)</td>
                    <td className="p-3 font-sans text-zinc-500 text-[10px]">Compromiso suave</td>
                    <td className="p-3 text-zinc-700">
                      {Object.entries(solveResult.solutions.L2?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L2?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-zinc-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                    {solveResult.solutions.L2?.achievement_pct.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-bold text-emerald-800 bg-emerald-50/30">
                        {val.toFixed(2)}%
                      </td>
                    ))}
                    <td className="p-3 text-right font-bold">{solveResult.solutions.L2?.aggregate_distance.toFixed(4)}</td>
                  </tr>

                  {/* L_inf */}
                  <tr className="hover:bg-zinc-50 bg-purple-50/20">
                    <td className="p-3 font-sans font-bold text-purple-700 bg-purple-50/50">L_inf (Minimax)</td>
                    <td className="p-3 font-sans text-zinc-500 text-[10px]">Equilibrio estricto</td>
                    <td className="p-3 text-zinc-700">
                      {Object.entries(solveResult.solutions.L_inf?.variables || {})
                        .filter(([_, v]: any) => Math.abs(v) > 0.05)
                        .map(([k, v]: any) => `${k}: ${v.toFixed(1)}`)
                        .join(", ") || "Todas en 0"}
                    </td>
                    {solveResult.solutions.L_inf?.objectives.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-semibold text-zinc-900">
                        {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    ))}
                    {solveResult.solutions.L_inf?.achievement_pct.map((val: number, i: number) => (
                      <td key={i} className="p-3 text-right font-bold text-purple-800 bg-purple-50/30">
                        {val.toFixed(2)}%
                      </td>
                    ))}
                    <td className="p-3 text-right font-bold">{solveResult.solutions.L_inf?.aggregate_distance.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">Calculando soluciones...</p>
          )}
        </section>

        {/* ========================================================================= */}
        {/* PASO 8: VISUALIZACIÓN GRÁFICA EN PLOTLY */}
        {/* ========================================================================= */}
        <section id="paso-8" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              08
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Visualización en el Espacio de Objetivos (Plotly)</h2>
              <p className="text-xs text-zinc-500">
                La Frontera de Pareto muestra el límite eficiente de lo alcanzable. Observa la cercanía al punto Ideal.
              </p>
            </div>
          </div>

          {solveResult && <InteractiveCharts solveResult={solveResult} currentModel={currentModel} />}
        </section>

        {/* ========================================================================= */}
        {/* PASO 9: EXPORTACIÓN & REPORTE FINAL */}
        {/* ========================================================================= */}
        <section id="paso-9" className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xs scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
              09
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Cierre y Exportación de Resultados</h2>
              <p className="text-xs text-zinc-500">
                Descarga el informe completo o guarda el archivo del modelo para futuras sesiones.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={handleExportExcel}
              className="p-4 bg-zinc-50 hover:bg-emerald-50/40 rounded-xl border border-zinc-200 hover:border-emerald-400 flex flex-col items-start gap-2 transition-all text-left"
            >
              <FileDown className="w-6 h-6 text-emerald-600" />
              <div>
                <span className="font-bold text-xs text-zinc-900 block">Descargar Excel (.xlsx)</span>
                <span className="text-[11px] text-zinc-500">Tablas formateadas con Matriz de Pagos y Métricas</span>
              </div>
            </button>

            <button
              onClick={handleExportJSON}
              className="p-4 bg-zinc-50 hover:bg-blue-50/40 rounded-xl border border-zinc-200 hover:border-blue-400 flex flex-col items-start gap-2 transition-all text-left"
            >
              <FileDown className="w-6 h-6 text-blue-600" />
              <div>
                <span className="font-bold text-xs text-zinc-900 block">Guardar Modelo (.json)</span>
                <span className="text-[11px] text-zinc-500">Archivo propio para reabrir el problema cuando desees</span>
              </div>
            </button>

            <a
              href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 bg-zinc-50 hover:bg-emerald-50/40 rounded-xl border border-zinc-200 hover:border-emerald-400 flex flex-col items-start gap-2 transition-all text-left"
            >
              <FileDown className="w-6 h-6 text-emerald-600" />
              <div>
                <span className="font-bold text-xs text-zinc-900 block">Manual de Usuario (PDF)</span>
                <span className="text-[11px] text-zinc-500">Informe técnico detallado con capturas de pantalla y fundamentos</span>
              </div>
            </a>

            <button
              onClick={() => window.print()}
              className="p-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl border border-zinc-200 hover:border-zinc-400 flex flex-col items-start gap-2 transition-all text-left"
            >
              <FileDown className="w-6 h-6 text-zinc-700" />
              <div>
                <span className="font-bold text-xs text-zinc-900 block">Imprimir / Guardar PDF</span>
                <span className="text-[11px] text-zinc-500">Reporte ejecutivo listo para presentación</span>
              </div>
            </button>
          </div>
        </section>

      </main>

      {/* Modal Guía Teórica y Glosario */}
      {showTheoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-zinc-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-zinc-900 text-base">Guía Teórica de Programación de Compromiso</h3>
              </div>
              <button
                onClick={() => setShowTheoryModal(false)}
                className="text-zinc-400 hover:text-zinc-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-zinc-700 leading-relaxed">
              <div>
                <h4 className="font-bold text-zinc-900 text-sm mb-1">1. Distancia Normalizada D_i(x)</h4>
                <p>
                  Para evitar distorsiones por escalas o unidades de medida dispares, la distancia al ideal se normaliza respecto al rango ideal–anti-ideal:
                </p>
                <div className="bg-zinc-100 p-2 rounded my-1 font-mono text-[11px]">
                  D_i(x) = (Z_i* - Z_i(x)) / (Z_i* - Z_i_peor)
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm mb-1">2. Grado de Logro Porcentual Z&#39;_i(x)</h4>
                <p>
                  Mide el porcentaje de satisfacción alcanzado respecto al ideal:
                </p>
                <div className="bg-zinc-100 p-2 rounded my-1 font-mono text-[11px]">
                  Z&#39;_i(x) = 100 · (1 - D_i(x)) [%]
                </div>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm mb-1">3. Propiedades Clave de las Métricas</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <span className="font-bold text-blue-700">Métrica L1:</span> Efecto compensatorio. Grandes ganancias en
                    un objetivo compensan deficiencias graves en otro. Tiende a atraparse en vértices extremos.
                  </li>
                  <li>
                    <span className="font-bold text-emerald-700">Métrica L2:</span> Compromiso suave euclidiano. Permite
                    seleccionar soluciones intermedias sobre la frontera según los pesos.
                  </li>
                  <li>
                    <span className="font-bold text-purple-700">Métrica L_inf (Minimax):</span> Equilibrio y equidad estricta.
                    Castiga severamente los desbalances. Si los pesos son iguales, todos los objetivos alcanzan exactamente el
                    mismo grado de logro porcentual.
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-200 flex justify-end">
              <button
                onClick={() => setShowTheoryModal(false)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pie de Página */}
      <footer className="bg-white border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
        <p>OptiCompromise — Herramienta de Software Libre para Introducción al Análisis de Decisiones (IAD)</p>
        <p className="text-[10px] text-zinc-400 mt-1">
          Facultad de Minas – Universidad Nacional de Colombia (Sede Medellín) • Licencia MIT
        </p>
      </footer>
    </div>
  );
}
