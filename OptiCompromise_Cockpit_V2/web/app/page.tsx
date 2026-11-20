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
  DecisionProfile,
  BLANK_MODEL,
  FALLBACK_CELDAS_MODEL,
} from "../components/cockpit/types";
import {
  exportModelJSON,
  exportResultsCSV,
  exportResultsExcel,
  importModelFromFile,
} from "../components/cockpit/mathUtils";

function validateModelClient(m: ModelDefinition, weightsToCheck?: number[]): string | null {
  if (m.variables.length < 1) return "Agrega al menos 1 variable de decisión.";
  if (m.objectives.length < 2) return "Un problema multiobjetivo requiere al menos 2 objetivos.";
  const seen = new Set<string>();
  for (const v of m.variables) {
    const clean = v.name.trim();
    if (!clean) return "Todas las variables deben tener un nombre no vacío.";
    if (seen.has(clean)) return `Variable duplicada: "${clean}". Cambia el nombre para que sea único.`;
    seen.add(clean);
    if (
      v.lower_bound !== null &&
      v.upper_bound !== null &&
      !Number.isNaN(v.lower_bound) &&
      !Number.isNaN(v.upper_bound) &&
      v.lower_bound > v.upper_bound
    ) {
      return `Cotas inválidas en "${clean}": la cota inferior (${v.lower_bound}) supera la superior (${v.upper_bound}).`;
    }
  }
  for (let i = 0; i < m.objectives.length; i++) {
    if (!m.objectives[i].name.trim()) {
      return `El Objetivo #${i + 1} debe tener un nombre no vacío.`;
    }
  }
  if (weightsToCheck && weightsToCheck.length === m.objectives.length) {
    const sumW = weightsToCheck.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0);
    if (Math.abs(sumW - 1.0) > 0.01) {
      return `Los pesos deben sumar 1.00 (actual: ${sumW.toFixed(2)}). Activa "Auto-balancear" o pulsa "1.00" en Perfil & Pesos.`;
    }
  }
  return null;
}

export default function OptiCompromiseCockpitPage() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [selectedPreset, setSelectedPreset] = useState<string>("celdas");
  const [modelKey, setModelKey] = useState<number>(0);
  const [model, setModel] = useState<ModelDefinition>(FALLBACK_CELDAS_MODEL);
  const [weights, setWeights] = useState<number[]>(FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5]);
  const [autoBalance, setAutoBalance] = useState<boolean>(true);
  const [decisionProfile, setDecisionProfile] = useState<DecisionProfile>("equitativo");
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [solverStatus, setSolverStatus] = useState<SolverStatus>("idle");
  const [solverMessage, setSolverMessage] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

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
    const clientErr = validateModelClient(modelToSolve, weightsToUse);
    if (clientErr) {
      setValidationError(clientErr);
      setSolverStatus("error");
      setSolverMessage(clientErr);
      return;
    }
    setValidationError(null);

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setSolverStatus("calculating");

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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSolverStatus("error");
      setSolverMessage(
        "No se pudo conectar con el motor de optimización FastAPI (/api/solve). Verifica que el servicio backend esté activo."
      );
    }
  }, []);

  // Debounce reactivo para sliders (50ms gracias al caché LRU en backend) o edición (250ms)
  const scheduleSolve = useCallback(
    (nextModel: ModelDefinition, nextWeights: number[], delayMs = 150) => {
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
      setValidationError(null);

      if (presetId === "blank") {
        const w = BLANK_MODEL.weights || [0.5, 0.5];
        setModel(BLANK_MODEL);
        setModelKey((k) => k + 1);
        setWeights(w);
        setDecisionProfile("equitativo");
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
        setModelKey((k) => k + 1);
        setWeights(defaultW);
        const allEqual = defaultW.every((w) => Math.abs(w - defaultW[0]) < 0.02);
        setDecisionProfile(allEqual ? "equitativo" : "personalizado");
        executeSolve(data, defaultW);
      } catch {
        setModel(FALLBACK_CELDAS_MODEL);
        setModelKey((k) => k + 1);
        const w = FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5];
        setWeights(w);
        setDecisionProfile("equitativo");
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
    setModel(updated);
    const w = newWeights ?? weights;
    if (newWeights) setWeights(newWeights);
    const clientErr = validateModelClient(updated, w);
    setValidationError(clientErr);
    if (!clientErr) {
      scheduleSolve(updated, w, 250);
    }
  };

  // Selección rápida de Perfil del Decisor
  const handleSelectProfile = (profile: DecisionProfile) => {
    setDecisionProfile(profile);
    const n = model.objectives.length;
    let newW = [...weights];
    if (profile === "equitativo" || profile === "moderado") {
      newW = Array(n).fill(parseFloat((1 / n).toFixed(3)));
    } else if (profile === "compensatorio") {
      newW = Array(n).fill(parseFloat((0.3 / Math.max(1, n - 1)).toFixed(3)));
      newW[0] = 0.7;
    }
    const sum = newW.reduce((a, b) => a + b, 0);
    const normalized = newW.map((w) => parseFloat((w / sum).toFixed(3)));
    const diff = parseFloat((1.0 - normalized.reduce((a, b) => a + b, 0)).toFixed(3));
    if (normalized.length > 0 && Math.abs(diff) > 0) {
      normalized[0] = parseFloat((normalized[0] + diff).toFixed(3));
    }
    setWeights(normalized);
    executeSolve(model, normalized);
  };

  // Ajuste de pesos con Auto-Balance proporcional (suma estricta = 1.00) o modo libre
  const handleWeightChange = (index: number, rawValue: number) => {
    setDecisionProfile("personalizado");
    const val = parseFloat(Math.max(0, Math.min(1, Number.isFinite(rawValue) ? rawValue : 0)).toFixed(3));
    const n = weights.length;
    const nextW = [...weights];

    if (autoBalance && n > 1) {
      nextW[index] = val;
      const rem = Math.max(0, 1.0 - val);
      const otherIndices: number[] = [];
      let sumOther = 0;
      for (let j = 0; j < n; j++) {
        if (j !== index) {
          otherIndices.push(j);
          sumOther += weights[j] ?? 0;
        }
      }

      if (sumOther > 1e-4) {
        otherIndices.forEach((j) => {
          nextW[j] = parseFloat((((weights[j] ?? 0) / sumOther) * rem).toFixed(3));
        });
      } else {
        const share = parseFloat((rem / otherIndices.length).toFixed(3));
        otherIndices.forEach((j) => {
          nextW[j] = share;
        });
      }

      const curSum = nextW.reduce((a, b) => a + b, 0);
      const diff = parseFloat((1.0 - curSum).toFixed(3));
      if (diff !== 0 && otherIndices.length > 0) {
        let maxIdx = otherIndices[0];
        for (const j of otherIndices) {
          if (nextW[j] > nextW[maxIdx]) maxIdx = j;
        }
        nextW[maxIdx] = parseFloat(Math.max(0, nextW[maxIdx] + diff).toFixed(3));
      }
    } else {
      nextW[index] = val;
    }

    setWeights(nextW);
    const clientErr = validateModelClient(model, nextW);
    setValidationError(clientErr);
    if (!clientErr) {
      scheduleSolve(model, nextW, 80);
    } else {
      setSolverStatus("error");
      setSolverMessage(clientErr);
    }
  };

  const handleNormalizeWeights = () => {
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
    setValidationError(null);
    executeSolve(model, normalized);
  };

  // Importar JSON / Excel (.xlsx) / CSV
  const handleImportJSON = async (file: File) => {
    try {
      const { model: parsed, weights: parsedWeights } = await importModelFromFile(file);
      const nextW =
        parsedWeights && parsedWeights.length === parsed.objectives.length
          ? parsedWeights
          : Array(parsed.objectives.length).fill(
              parseFloat((1 / parsed.objectives.length).toFixed(3))
            );
      setSelectedPreset("blank");
      setModel(parsed);
      setModelKey((k) => k + 1);
      setWeights(nextW);
      setDecisionProfile("personalizado");
      setValidationError(null);
      executeSolve(parsed, nextW);
    } catch (err: unknown) {
      setSolverStatus("error");
      setSolverMessage(
        err instanceof Error
          ? err.message
          : "Error al importar el archivo. Verifica el formato (.json, .xlsx o .csv)."
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F4F8] dark:bg-[#111524] text-slate-900 dark:text-slate-100 transition-colors">
      <TopBar
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
        solverStatus={solverStatus}
        solverMessage={solverMessage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onImportJSON={handleImportJSON}
        onExportJSON={() => exportModelJSON(model, weights)}
        onExportCSV={() => {
          if (solveResult) exportResultsCSV(model, solveResult);
        }}
        onExportExcel={() => {
          if (solveResult) exportResultsExcel(model, solveResult);
        }}
        canExportResults={Boolean(solveResult && solverStatus === "optimal")}
      />

      <div className="flex-1 flex flex-col lg:flex-row">
        <ControlPanelLeft
          model={model}
          modelKey={modelKey}
          weights={weights}
          autoBalance={autoBalance}
          onToggleAutoBalance={setAutoBalance}
          decisionProfile={decisionProfile}
          onSelectProfile={handleSelectProfile}
          validationError={validationError}
          onModelChange={handleModelChange}
          onWeightChange={handleWeightChange}
          onNormalizeWeights={handleNormalizeWeights}
          onManualSolve={() => executeSolve(model, weights)}
          isCalculating={solverStatus === "calculating"}
        />

        <VisualCanvasRight
          model={model}
          modelKey={modelKey}
          decisionProfile={decisionProfile}
          solveResult={solveResult}
          solverStatus={solverStatus}
          solverMessage={solverMessage}
          theme={theme}
        />
      </div>
    </div>
  );
}
