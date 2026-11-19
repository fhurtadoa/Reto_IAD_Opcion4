"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import TopBar from "../components/cockpit/TopBar";
import ControlPanelLeft from "../components/cockpit/ControlPanelLeft";
import VisualCanvasRight from "../components/cockpit/VisualCanvasRight";
import {
  ModelDefinition,
  SolveResponse,
  SolverStatus,
  ThemeMode,
  BLANK_MODEL,
  FALLBACK_CELDAS_MODEL,
} from "../components/cockpit/types";
import { exportModelJSON, exportResultsCSV } from "../components/cockpit/mathUtils";

export default function OptiCompromiseCockpitPage() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [selectedPreset, setSelectedPreset] = useState<string>("celdas");
  const [model, setModel] = useState<ModelDefinition>(FALLBACK_CELDAS_MODEL);
  const [weights, setWeights] = useState<number[]>(FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5]);
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [solverStatus, setSolverStatus] = useState<SolverStatus>("idle");
  const [solverMessage, setSolverMessage] = useState<string>("");
  const [activeStage, setActiveStage] = useState<1 | 2 | 3 | 4>(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sincronizar clase 'dark' en <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Llamada real al backend FastAPI (/api/solve)
  const executeSolve = useCallback(async (modelToSolve: ModelDefinition, weightsToUse: number[]) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setSolverStatus("calculating");
    setActiveStage(3);

    try {
      const payload: ModelDefinition = {
        name: modelToSolve.name,
        description: modelToSolve.description || "",
        variables: modelToSolve.variables,
        objectives: modelToSolve.objectives,
        constraints: modelToSolve.constraints,
        weights: weightsToUse,
      };

      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        const detail = String(errData.detail || "Error en la resolución del modelo.");
        const lower = detail.toLowerCase();
        if (lower.includes("infeasible") || lower.includes("infactible")) {
          setSolverStatus("infeasible");
        } else if (lower.includes("unbounded") || lower.includes("no acotado")) {
          setSolverStatus("unbounded");
        } else {
          setSolverStatus("error");
        }
        setSolverMessage(detail);
        return;
      }

      const data: SolveResponse = await res.json();
      setSolveResult(data);
      setSolverStatus("optimal");
      setSolverMessage(data.message || "Solución óptima calculada");
      setActiveStage(4);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setSolverStatus("error");
      setSolverMessage(
        "No se pudo conectar con el backend FastAPI. Verifica que uvicorn esté corriendo en el puerto 8001."
      );
    }
  }, []);

  // Debounce ~200ms para no saturar FastAPI al arrastrar sliders o editar campos
  const scheduleSolve = useCallback(
    (nextModel: ModelDefinition, nextWeights: number[], delayMs = 200) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        executeSolve(nextModel, nextWeights);
      }, delayMs);
    },
    [executeSolve]
  );

  // Cargar caso precargado directamente desde /api/examples/{id}
  const handleSelectPreset = useCallback(
    async (presetId: string) => {
      setSelectedPreset(presetId);
      setActiveStage(1);

      if (presetId === "blank") {
        const w = BLANK_MODEL.weights || [0.5, 0.5];
        setModel(BLANK_MODEL);
        setWeights(w);
        executeSolve(BLANK_MODEL, w);
        return;
      }

      setSolverStatus("calculating");
      try {
        const res = await fetch(`/api/examples/${presetId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ModelDefinition = await res.json();
        const defaultW =
          data.weights && data.weights.length === data.objectives.length
            ? data.weights
            : Array(data.objectives.length).fill(
                parseFloat((1 / data.objectives.length).toFixed(3))
              );
        setModel(data);
        setWeights(defaultW);
        executeSolve(data, defaultW);
      } catch {
        // Si el backend no responde todavía, usar fallback local para celdas
        setModel(FALLBACK_CELDAS_MODEL);
        const w = FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5];
        setWeights(w);
        executeSolve(FALLBACK_CELDAS_MODEL, w);
      }
    },
    [executeSolve]
  );

  // Carga inicial
  useEffect(() => {
    handleSelectPreset("celdas");
  }, [handleSelectPreset]);

  // Cambios desde el Panel Izquierdo
  const handleModelChange = (updated: ModelDefinition, newWeights?: number[]) => {
    setActiveStage(1);
    setModel(updated);
    const w = newWeights ?? weights;
    if (newWeights) setWeights(newWeights);
    scheduleSolve(updated, w, 300);
  };

  const handleWeightChange = (index: number, value: number) => {
    setActiveStage(2);
    const nextW = [...weights];
    nextW[index] = Math.max(0, Number.isFinite(value) ? value : 0);
    setWeights(nextW);
    scheduleSolve(model, nextW, 200);
  };

  const handleNormalizeWeights = () => {
    setActiveStage(2);
    const sum = weights.reduce((a, b) => a + b, 0);
    const n = weights.length;
    let normalized: number[];
    if (sum <= 1e-6) {
      normalized = Array(n).fill(parseFloat((1 / n).toFixed(3)));
    } else {
      normalized = weights.map((w) => parseFloat((w / sum).toFixed(3)));
    }
    const diff = parseFloat((1 - normalized.reduce((a, b) => a + b, 0)).toFixed(3));
    if (normalized.length > 0 && Math.abs(diff) > 0) {
      normalized[0] = parseFloat((normalized[0] + diff).toFixed(3));
    }
    setWeights(normalized);
    executeSolve(model, normalized);
  };

  // Importar JSON
  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || "{}")) as ModelDefinition;
        if (!parsed.variables || !parsed.objectives) {
          setSolverStatus("error");
          setSolverMessage("El archivo JSON no contiene 'variables' ni 'objectives' válidos.");
          return;
        }
        const nextW =
          parsed.weights && parsed.weights.length === parsed.objectives.length
            ? parsed.weights
            : Array(parsed.objectives.length).fill(
                parseFloat((1 / parsed.objectives.length).toFixed(3))
              );
        setSelectedPreset("blank");
        setModel(parsed);
        setWeights(nextW);
        executeSolve(parsed, nextW);
      } catch {
        setSolverStatus("error");
        setSolverMessage("Error al leer el archivo JSON. Verifica que el formato sea válido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 transition-colors">
      <TopBar
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
        solverStatus={solverStatus}
        solverMessage={solverMessage}
        activeStage={activeStage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onImportJSON={handleImportJSON}
        onExportJSON={() => exportModelJSON(model, weights)}
        onExportCSV={() => {
          if (solveResult) exportResultsCSV(model, solveResult);
        }}
        canExportResults={Boolean(solveResult && solverStatus === "optimal")}
      />

      <div className="flex-1 flex flex-col lg:flex-row">
        <ControlPanelLeft
          model={model}
          weights={weights}
          onModelChange={handleModelChange}
          onWeightChange={handleWeightChange}
          onNormalizeWeights={handleNormalizeWeights}
          onManualSolve={() => executeSolve(model, weights)}
          isCalculating={solverStatus === "calculating"}
        />

        <VisualCanvasRight
          model={model}
          weights={weights}
          solveResult={solveResult}
          solverStatus={solverStatus}
          solverMessage={solverMessage}
          theme={theme}
        />
      </div>
    </div>
  );
}
