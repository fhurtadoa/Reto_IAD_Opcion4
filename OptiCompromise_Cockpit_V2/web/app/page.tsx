"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChartNoAxesCombined, FlaskConical, ListChecks } from "lucide-react";
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
  PRESET_OPTIONS,
  PresetOption,
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
  if (m.pareto_seed !== undefined && (!Number.isInteger(m.pareto_seed) || m.pareto_seed < 0 || m.pareto_seed > 4294967295)) {
    return "La semilla de Pareto debe ser un entero entre 0 y 4294967295.";
  }
  if (weightsToCheck) {
    if (weightsToCheck.length !== m.objectives.length || weightsToCheck.some((w) => !Number.isFinite(w) || w < 0 || w > 1)) {
      return "Ingresa un peso entre 0 y 1 por cada objetivo.";
    }
    const sumW = weightsToCheck.reduce((acc, w) => acc + w, 0);
    if (Math.abs(sumW - 1.0) > 0.001 + 1e-12) {
      return `Los pesos deben sumar 1 (actual: ${sumW.toFixed(3)}). Activa el balance automático o pulsa Normalizar en Preferencias.`;
    }
  }
  return null;
}

export default function OptiCompromiseCockpitPage() {
  const [catalog, setCatalog] = useState<PresetOption[]>(PRESET_OPTIONS);
  const [catalogNotice, setCatalogNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/examples", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data: { exercises: PresetOption[]; errors: string[] } = await response.json();
        setCatalog([...data.exercises, ...PRESET_OPTIONS.filter(option => option.id === "blank")]);
        setCatalogNotice(data.errors.join(" "));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogNotice("No se pudo actualizar el catálogo. Se muestran los ejemplos básicos.");
      });
    return () => controller.abort();
  }, []);

  const [theme, setTheme] = useState<ThemeMode>("light");
  const [selectedPreset, setSelectedPreset] = useState<string>("celdas");
  const [modelKey, setModelKey] = useState<number>(0);
  const [model, setModel] = useState<ModelDefinition>(FALLBACK_CELDAS_MODEL);
  const [weights, setWeights] = useState<number[]>(FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5]);
  const [autoBalance, setAutoBalance] = useState<boolean>(true);
  const [decisionProfile, setDecisionProfile] = useState<DecisionProfile>("equitativo");
  const [completed, setCompleted] = useState<{ model: ModelDefinition; result: SolveResponse } | null>(null);
  const [workspace, setWorkspace] = useState<"model" | "results" | "method">("results");
  const solveResult = completed?.result ?? null;
  const [solverStatus, setSolverStatus] = useState<SolverStatus>("idle");
  const [solverMessage, setSolverMessage] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const presetRequestRef = useRef(0);
  const cancelPending = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => {
    presetRequestRef.current++;
    cancelPending();
  }, [cancelPending]);

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
    cancelPending();
    const clientErr = validateModelClient(modelToSolve, weightsToUse);
    if (clientErr) {
      setValidationError(clientErr);
      setSolverStatus("error");
      setSolverMessage(clientErr);
      return;
    }
    setValidationError(null);

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
        pareto_seed: modelToSolve.pareto_seed,
      };

      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        if (controller.signal.aborted) return;
        const detail = Array.isArray(errData.detail)
          ? errData.detail.map((issue: { loc: string[] }) => `Revisa el campo ${issue.loc.slice(1).join(".")}.`).join(" ")
          : String(errData.detail || "Error en la resolución del modelo.");
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
      if (controller.signal.aborted) return;
      setCompleted(previous => ({
        model: modelToSolve,
        result: previous?.model === modelToSolve && previous.result.weight_sensitivity
          ? { ...data, weight_sensitivity: previous.result.weight_sensitivity }
          : data,
      }));
      setSolverStatus(data.status === "partial" ? "partial" : "optimal");
      setSolverMessage(data.message || "Solución óptima calculada");
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
      setSolverStatus("error");
      setSolverMessage(
        "No se pudo conectar con el motor de optimización FastAPI (/api/solve). Verifica que el servicio backend esté activo."
      );
    }
  }, [cancelPending]);

  // Debounce reactivo para sliders (50ms gracias al caché LRU en backend) o edición (250ms)
  const scheduleSolve = useCallback(
    (nextModel: ModelDefinition, nextWeights: number[], delayMs = 150) => {
      cancelPending();
      setSolverStatus("calculating");
      debounceRef.current = setTimeout(() => {
        executeSolve(nextModel, nextWeights);
      }, delayMs);
    },
    [cancelPending, executeSolve]
  );

  // Cargar caso precargado directamente desde /api/examples/{id}
  const handleSelectPreset = useCallback(
    async (presetId: string) => {
      const request = ++presetRequestRef.current;
      cancelPending();
      setSelectedPreset(presetId);
      setValidationError(null);

      if (presetId === "blank") {
        const w = BLANK_MODEL.weights || [0.5, 0.5];
        setWorkspace("model");
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
        if (request !== presetRequestRef.current) return;
        const defaultW =
          data.weights && data.weights.length === data.objectives.length
            ? data.weights
            : Array(data.objectives.length).fill(1 / data.objectives.length);
        setWorkspace("results");
        setModel(data);
        setModelKey((k) => k + 1);
        setWeights(defaultW);
        const allEqual = defaultW.every((w) => Math.abs(w - defaultW[0]) < 0.02);
        setDecisionProfile(allEqual ? "equitativo" : "personalizado");
        executeSolve(data, defaultW);
      } catch {
        if (request !== presetRequestRef.current) return;
        if (presetId !== "celdas") {
          setSelectedPreset("");
          setSolverStatus("error");
          setSolverMessage("No se pudo cargar el ejemplo. El modelo abierto se conserva.");
          return;
        }
        setModel(FALLBACK_CELDAS_MODEL);
        setModelKey((k) => k + 1);
        const w = FALLBACK_CELDAS_MODEL.weights || [0.5, 0.5];
        setWeights(w);
        setDecisionProfile("equitativo");
        executeSolve(FALLBACK_CELDAS_MODEL, w);
      }
    },
    [cancelPending, executeSolve]
  );

  // Carga inicial
  useEffect(() => {
    handleSelectPreset("celdas");
  }, [handleSelectPreset]);

  // Cambios desde el Panel Izquierdo
  const handleModelChange = (updated: ModelDefinition, newWeights?: number[]) => {
    presetRequestRef.current++;
    setModel(updated);
    const w = newWeights ?? weights;
    if (newWeights) setWeights(newWeights);
    const clientErr = validateModelClient(updated, w);
    setValidationError(clientErr);
    if (!clientErr) {
      scheduleSolve(updated, w, 250);
    } else {
      cancelPending();
      setSolverStatus("error");
      setSolverMessage(clientErr);
    }
  };

  // Selección rápida de Perfil del Decisor
  const handleSelectProfile = (profile: DecisionProfile) => {
    presetRequestRef.current++;
    setDecisionProfile(profile);
    const n = model.objectives.length;
    let newW = [...weights];
    if (profile === "equitativo" || profile === "moderado") {
      newW = Array(n).fill(1 / n);
    } else if (profile === "compensatorio") {
      newW = Array(n).fill(0.3 / (n - 1));
      newW[0] = 0.7;
    }
    const sum = newW.reduce((a, b) => a + b, 0);
    const normalized = newW.map((w) => w / sum);
    setWeights(normalized);
    executeSolve(model, normalized);
  };

  // Ajuste de pesos con Auto-Balance proporcional (suma estricta = 1.00) o modo libre
  const handleWeightChange = (index: number, rawValue: number) => {
    presetRequestRef.current++;
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
      cancelPending();
      setSolverStatus("error");
      setSolverMessage(clientErr);
    }
  };

  const handleNormalizeWeights = () => {
    presetRequestRef.current++;
    const sum = weights.reduce((a, b) => a + b, 0);
    const n = weights.length;
    const normalized = sum <= 1e-6 ? Array(n).fill(1 / n) : weights.map((w) => w / sum);
    setWeights(normalized);
    setValidationError(null);
    executeSolve(model, normalized);
  };

  // Importar JSON / Excel (.xlsx) / CSV
  const handleImportJSON = async (file: File) => {
    const request = ++presetRequestRef.current;
    cancelPending();
    setSolverStatus("calculating");
    setValidationError(null);
    try {
      const { model: parsed, weights: parsedWeights } = await importModelFromFile(file);
      const nextW = parsedWeights ?? Array(parsed.objectives.length).fill(1 / parsed.objectives.length);
      const issue = validateModelClient(parsed, nextW);
      if (issue) throw new Error(issue);
      if (request !== presetRequestRef.current) return;
      setSelectedPreset("");
      setWorkspace("model");
      setModel(parsed);
      setModelKey((k) => k + 1);
      setWeights(nextW);
      setDecisionProfile("personalizado");
      setValidationError(null);
      executeSolve(parsed, nextW);
    } catch (err: unknown) {
      if (request !== presetRequestRef.current) return;
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
        catalog={catalog}
        catalogNotice={catalogNotice}
        onSelectPreset={handleSelectPreset}
        solverStatus={solverStatus}
        solverMessage={solverMessage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onImportJSON={handleImportJSON}
        onExportJSON={() => exportModelJSON(model, weights)}
        onExportCSV={() => {
          if (completed) exportResultsCSV(completed.model, completed.result);
        }}
        onExportExcel={() => {
          if (completed) exportResultsExcel(completed.model, completed.result);
        }}
        canExportResults={Boolean(solveResult && (solverStatus === "optimal" || solverStatus === "partial"))}
      />

      <div className="workspace-shell" data-workspace={workspace}>
        <section className="workspace-intro" aria-labelledby="workspace-title">
          <div>
            <h2 id="workspace-title">{model.name || "Modelo sin título"}</h2>
            {model.description && <p>{model.description}</p>}
            {model.reference && <p className="academic-reference"><strong>Fuente</strong> · {model.reference}</p>}
          </div>
          <dl aria-label="Dimensiones del modelo">
            <div><dt>Variables</dt><dd>{model.variables.length}</dd></div>
            <div><dt>Objetivos</dt><dd>{model.objectives.length}</dd></div>
            <div><dt>Restricciones</dt><dd>{model.constraints.length}</dd></div>
          </dl>
        </section>
        <nav className="workspace-navigation" aria-label="Espacio de trabajo">
          {([
            ["model", "Formular", ListChecks],
            ["method", "Ver método", FlaskConical],
            ["results", "Explorar resultados", ChartNoAxesCombined],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-current={workspace === id ? "page" : undefined}
              onClick={() => setWorkspace(id)}>
              <Icon aria-hidden="true" size={16} />
              {label}
            </button>
          ))}
        </nav>
        {workspace === "model" && !validationError && ["error", "infeasible", "unbounded"].includes(solverStatus) && (
          <p className="workspace-feedback mb-4 text-rose-800 dark:text-rose-300" role="alert">{solverMessage}</p>
        )}
        <div className="workspace-body">
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
            onManualSolve={(updated, nextWeights) => {
              presetRequestRef.current++;
              if (updated) setModel(updated);
              if (nextWeights) setWeights(nextWeights);
              setWorkspace("results");
              executeSolve(updated ?? model, nextWeights ?? weights);
            }}
            isCalculating={solverStatus === "calculating"}
          />

          <VisualCanvasRight
            workspace={workspace}
            selectedWeight={completed?.model === model && !validationError ? weights[0] : (solveResult?.weights[0] ?? null)}
            model={completed?.model ?? model}
            modelKey={modelKey}
            decisionProfile={decisionProfile}
            solveResult={solveResult}
            solverStatus={solverStatus}
            solverMessage={solverMessage}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
