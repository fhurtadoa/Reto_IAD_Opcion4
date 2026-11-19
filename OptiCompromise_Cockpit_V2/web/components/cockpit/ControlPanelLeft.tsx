"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Table2,
  Code2,
  Sliders,
  Plus,
  Trash2,
  Scale,
  Play,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  ModelDefinition,
  VarType,
  ObjectiveSense,
  ConstraintSense,
} from "./types";
import {
  modelToAlgebraicText,
  parseAlgebraicModel,
  modelToLatex,
} from "./mathUtils";
import TooltipBadge from "./TooltipBadge";
import KatexBlock from "./KatexBlock";

interface ControlPanelLeftProps {
  model: ModelDefinition;
  weights: number[];
  onModelChange: (updated: ModelDefinition, newWeights?: number[]) => void;
  onWeightChange: (index: number, value: number) => void;
  onNormalizeWeights: () => void;
  onManualSolve: () => void;
  isCalculating: boolean;
}

export default function ControlPanelLeft({
  model,
  weights,
  onModelChange,
  onWeightChange,
  onNormalizeWeights,
  onManualSolve,
  isCalculating,
}: ControlPanelLeftProps) {
  const [editorTab, setEditorTab] = useState<"table" | "algebraic">("table");
  const [algebraicText, setAlgebraicText] = useState<string>(() =>
    modelToAlgebraicText(model)
  );
  const [algebraicErrors, setAlgebraicErrors] = useState<string[]>([]);
  const [algebraicAppliedMsg, setAlgebraicAppliedMsg] = useState<string | null>(null);

  useEffect(() => {
    setAlgebraicText(modelToAlgebraicText(model));
    setAlgebraicErrors([]);
  }, [model]);

  const latexPreview = useMemo(() => modelToLatex(model), [model]);

  const weightSum = weights.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0);
  const isWeightSumValid = Math.abs(weightSum - 1.0) <= 0.005;

  const handleVarChange = (
    idx: number,
    field: "name" | "var_type" | "lower_bound" | "upper_bound",
    value: string
  ) => {
    const nextVars = model.variables.map((v, i) => {
      if (i !== idx) return v;
      if (field === "name") return { ...v, name: value };
      if (field === "var_type") {
        const vt = value as VarType;
        return {
          ...v,
          var_type: vt,
          lower_bound: vt === "binary" ? 0 : v.lower_bound,
          upper_bound: vt === "binary" ? 1 : v.upper_bound,
        };
      }
      if (field === "lower_bound") {
        return { ...v, lower_bound: value === "" ? null : parseFloat(value) };
      }
      return { ...v, upper_bound: value === "" ? null : parseFloat(value) };
    });
    onModelChange({ ...model, variables: nextVars });
  };

  const handleAddVariable = () => {
    const nextIdx = model.variables.length + 1;
    const nextVars = [
      ...model.variables,
      { name: `x${nextIdx}`, var_type: "continuous" as VarType, lower_bound: 0, upper_bound: null },
    ];
    const nextObjs = model.objectives.map((o) => ({
      ...o,
      coefficients: [...o.coefficients, 0],
    }));
    const nextCons = model.constraints.map((c) => ({
      ...c,
      coefficients: [...c.coefficients, 0],
    }));
    onModelChange({ ...model, variables: nextVars, objectives: nextObjs, constraints: nextCons });
  };

  const handleRemoveVariable = (idx: number) => {
    if (model.variables.length <= 1) return;
    const nextVars = model.variables.filter((_, i) => i !== idx);
    const nextObjs = model.objectives.map((o) => ({
      ...o,
      coefficients: o.coefficients.filter((_, i) => i !== idx),
    }));
    const nextCons = model.constraints.map((c) => ({
      ...c,
      coefficients: c.coefficients.filter((_, i) => i !== idx),
    }));
    onModelChange({ ...model, variables: nextVars, objectives: nextObjs, constraints: nextCons });
  };

  const handleObjField = (idx: number, field: "name" | "sense", value: string) => {
    const nextObjs = model.objectives.map((o, i) =>
      i === idx ? { ...o, [field]: field === "sense" ? (value as ObjectiveSense) : value } : o
    );
    onModelChange({ ...model, objectives: nextObjs });
  };

  const handleObjCoeff = (objIdx: number, varIdx: number, value: string) => {
    const parsed = value === "" ? 0 : parseFloat(value);
    const nextObjs = model.objectives.map((o, i) => {
      if (i !== objIdx) return o;
      const nextC = [...o.coefficients];
      nextC[varIdx] = Number.isNaN(parsed) ? 0 : parsed;
      return { ...o, coefficients: nextC };
    });
    onModelChange({ ...model, objectives: nextObjs });
  };

  const handleAddObjective = () => {
    const nextIdx = model.objectives.length + 1;
    const nextObjs = [
      ...model.objectives,
      {
        name: `Objetivo ${nextIdx}`,
        sense: "maximize" as ObjectiveSense,
        coefficients: Array(model.variables.length).fill(1),
      },
    ];
    const eqW = Array(nextObjs.length).fill(parseFloat((1 / nextObjs.length).toFixed(3)));
    const diff = parseFloat((1 - eqW.reduce((a, b) => a + b, 0)).toFixed(3));
    if (eqW.length > 0) eqW[0] = parseFloat((eqW[0] + diff).toFixed(3));
    onModelChange({ ...model, objectives: nextObjs }, eqW);
  };

  const handleRemoveObjective = (idx: number) => {
    if (model.objectives.length <= 2) return;
    const nextObjs = model.objectives.filter((_, i) => i !== idx);
    const nextW = weights.filter((_, i) => i !== idx);
    const s = nextW.reduce((a, b) => a + b, 0);
    const normW =
      s > 0
        ? nextW.map((w) => parseFloat((w / s).toFixed(3)))
        : Array(nextObjs.length).fill(parseFloat((1 / nextObjs.length).toFixed(3)));
    onModelChange({ ...model, objectives: nextObjs }, normW);
  };

  const handleConField = (idx: number, field: "name" | "sense" | "rhs", value: string) => {
    const nextCons = model.constraints.map((c, i) => {
      if (i !== idx) return c;
      if (field === "rhs") {
        const parsed = value === "" ? 0 : parseFloat(value);
        return { ...c, rhs: Number.isNaN(parsed) ? 0 : parsed };
      }
      if (field === "sense") return { ...c, sense: value as ConstraintSense };
      return { ...c, name: value };
    });
    onModelChange({ ...model, constraints: nextCons });
  };

  const handleConCoeff = (conIdx: number, varIdx: number, value: string) => {
    const parsed = value === "" ? 0 : parseFloat(value);
    const nextCons = model.constraints.map((c, i) => {
      if (i !== conIdx) return c;
      const nextC = [...c.coefficients];
      nextC[varIdx] = Number.isNaN(parsed) ? 0 : parsed;
      return { ...c, coefficients: nextC };
    });
    onModelChange({ ...model, constraints: nextCons });
  };

  const handleAddConstraint = () => {
    const nextIdx = model.constraints.length + 1;
    const nextCons = [
      ...model.constraints,
      {
        name: `Restricción ${nextIdx}`,
        coefficients: Array(model.variables.length).fill(1),
        sense: "<=" as ConstraintSense,
        rhs: 100,
      },
    ];
    onModelChange({ ...model, constraints: nextCons });
  };

  const handleRemoveConstraint = (idx: number) => {
    const nextCons = model.constraints.filter((_, i) => i !== idx);
    onModelChange({ ...model, constraints: nextCons });
  };

  const handleApplyAlgebraic = () => {
    const parsed = parseAlgebraicModel(algebraicText, model);
    if (!parsed.ok || !parsed.objectives || !parsed.constraints || !parsed.detectedVariables) {
      setAlgebraicErrors(parsed.errors);
      setAlgebraicAppliedMsg(null);
      return;
    }

    const updatedVars = parsed.detectedVariables.map((vName) => {
      const existing = model.variables.find((v) => v.name.split(" ")[0].trim() === vName);
      return (
        existing || {
          name: vName,
          var_type: "continuous" as VarType,
          lower_bound: 0,
          upper_bound: null,
        }
      );
    });

    const nObjs = parsed.objectives.length;
    let nextW = weights;
    if (weights.length !== nObjs) {
      nextW = Array(nObjs).fill(parseFloat((1 / nObjs).toFixed(3)));
      const diff = parseFloat((1 - nextW.reduce((a, b) => a + b, 0)).toFixed(3));
      nextW[0] = parseFloat((nextW[0] + diff).toFixed(3));
    }

    setAlgebraicErrors([]);
    setAlgebraicAppliedMsg("Ecuaciones aplicadas y enviadas al motor FastAPI.");
    setTimeout(() => setAlgebraicAppliedMsg(null), 3000);

    onModelChange(
      {
        ...model,
        variables: updatedVars,
        objectives: parsed.objectives,
        constraints: parsed.constraints,
      },
      nextW
    );
  };

  return (
    <aside className="w-full lg:w-[35%] lg:min-w-[380px] lg:max-w-[520px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto cockpit-scroll border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B1120] p-4 space-y-4">
      {/* Encabezado del Modelo */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={model.name}
            onChange={(e) => onModelChange({ ...model, name: e.target.value })}
            className="w-full text-sm font-bold bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 -ml-1"
          />
          <button
            type="button"
            onClick={onManualSolve}
            disabled={isCalculating}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-500/20 disabled:opacity-50 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Resolver</span>
          </button>
        </div>
        {model.description && (
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {model.description}
          </p>
        )}
      </div>

      {/* Ecualizador de Pesos (w_i) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-cyan-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Ecualizador de Pesos (wᵢ)
            </h2>
            <TooltipBadge
              title="Pesos de Preferencia (wᵢ)"
              content="Definen la importancia relativa de cada objetivo en las métricas de compromiso L1 (compensatoria), L2 (euclidiana) y L∞ (equilibrio minimax). Idealmente deben sumar 1.00."
            />
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                isWeightSumValid
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
              }`}
            >
              Σw = {weightSum.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={onNormalizeWeights}
              title="Auto-normalizar pesos (w_i / Σw_i)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <Scale className="w-3 h-3" />
              <span>Normalizar</span>
            </button>
          </div>
        </div>

        {!isWeightSumValid && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Los pesos suman <b>{weightSum.toFixed(2)}</b> (≠ 1.00). El motor normalizará automáticamente o haz clic en <b>Normalizar</b>.
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {model.objectives.map((obj, idx) => {
            const wVal = weights[idx] ?? 0;
            const pct = weightSum > 0 ? (wVal / weightSum) * 100 : 0;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate pr-2">
                    <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-1">
                      w{idx + 1}
                    </span>
                    {obj.name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      ({pct.toFixed(0)}%)
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={Number(wVal.toFixed(3))}
                      onChange={(e) => onWeightChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-16 text-right font-mono text-xs px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={Math.min(1, Math.max(0, wVal))}
                  onChange={(e) => onWeightChange(idx, parseFloat(e.target.value))}
                  className="w-full weight-slider bg-slate-200 dark:bg-slate-700"
                />
              </div>
            );
          })}
        </div>

        {/* Leyenda rápida de métricas con tooltips */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
            <span>L₁</span>
            <TooltipBadge
              title="Métrica L₁ (Compensatoria / Manhattan)"
              content="Minimiza la suma ponderada de desviaciones. Permite compensación total: sacrificar mucho un objetivo si otro mejora más."
            />
          </div>
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>L₂</span>
            <TooltipBadge
              title="Métrica L₂ (Euclidiana)"
              content="Minimiza la distancia geométrica cuadrática al punto Ideal. Penaliza desviaciones grandes más que pequeñas."
              align="center"
            />
          </div>
          <div className="flex items-center gap-1 text-violet-600 dark:text-violet-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
            <span>L∞</span>
            <TooltipBadge
              title="Métrica L∞ (Equilibrio Minimax / Tchebysheff)"
              content="Minimiza la máxima desviación ponderada (λ). Busca equidad entre objetivos evitando que alguno quede rezagado."
              align="right"
            />
          </div>
        </div>
      </section>

      {/* Editor del Modelo con Pestañas (Tabla / Algebraico) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditorTab("table")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                editorTab === "table"
                  ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Modo Tabla</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorTab("algebraic")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                editorTab === "algebraic"
                  ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Modo Algebraico</span>
            </button>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {model.variables.length}v · {model.objectives.length}obj · {model.constraints.length}res
          </span>
        </div>

        <div className="p-3.5 space-y-4">
          {editorTab === "table" ? (
            <>
              {/* 1. Variables de Decisión */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Variables de Decisión
                    </h3>
                    <TooltipBadge
                      title="Variables (LP y MIP)"
                      content="Soporta variables Continuas (ℝ), Enteras (ℤ) y Binarias ({0,1}) resueltas con HiGHS en FastAPI."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVariable}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto cockpit-scroll pr-1">
                  {model.variables.map((v, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/60"
                    >
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => handleVarChange(idx, "name", e.target.value)}
                        className="col-span-3 text-xs font-mono px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        placeholder="x1"
                      />
                      <select
                        value={v.var_type}
                        onChange={(e) => handleVarChange(idx, "var_type", e.target.value)}
                        className="col-span-3 text-[11px] px-1 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        <option value="continuous">Continua</option>
                        <option value="integer">Entera</option>
                        <option value="binary">Binaria</option>
                      </select>
                      <input
                        type="number"
                        value={v.lower_bound ?? ""}
                        onChange={(e) => handleVarChange(idx, "lower_bound", e.target.value)}
                        disabled={v.var_type === "binary"}
                        placeholder="Min"
                        title="Cota inferior"
                        className="col-span-2 text-xs font-mono text-right px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                      />
                      <input
                        type="number"
                        value={v.upper_bound ?? ""}
                        onChange={(e) => handleVarChange(idx, "upper_bound", e.target.value)}
                        disabled={v.var_type === "binary"}
                        placeholder="∞"
                        title="Cota superior (vacío = sin límite)"
                        className="col-span-3 text-xs font-mono text-right px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(idx)}
                        disabled={model.variables.length <= 1}
                        className="col-span-1 flex justify-center text-slate-400 hover:text-rose-500 disabled:opacity-30"
                        title="Eliminar variable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Funciones Objetivo */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Funciones Objetivo
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddObjective}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <div className="space-y-2">
                  {model.objectives.map((obj, oIdx) => (
                    <div
                      key={oIdx}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <select
                          value={obj.sense}
                          onChange={(e) => handleObjField(oIdx, "sense", e.target.value)}
                          className={`text-[11px] font-bold px-1.5 py-1 rounded border ${
                            obj.sense === "maximize"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          }`}
                        >
                          <option value="maximize">Max</option>
                          <option value="minimize">Min</option>
                        </select>
                        <input
                          type="text"
                          value={obj.name}
                          onChange={(e) => handleObjField(oIdx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveObjective(oIdx)}
                          disabled={model.objectives.length <= 2}
                          className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                          title="Eliminar objetivo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {model.variables.map((v, vIdx) => (
                          <label
                            key={vIdx}
                            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
                          >
                            <span className="text-[10px] font-mono text-slate-400">
                              {v.name.split(" ")[0]}:
                            </span>
                            <input
                              type="number"
                              step="any"
                              value={obj.coefficients[vIdx] ?? 0}
                              onChange={(e) => handleObjCoeff(oIdx, vIdx, e.target.value)}
                              className="w-14 text-right font-mono text-[11px] bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Restricciones */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Restricciones Lineales
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddConstraint}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto cockpit-scroll pr-1">
                  {model.constraints.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => handleConField(cIdx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <select
                          value={c.sense}
                          onChange={(e) => handleConField(cIdx, "sense", e.target.value)}
                          className="text-xs font-mono font-bold px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400"
                        >
                          <option value="<=">≤</option>
                          <option value=">=">≥</option>
                          <option value="==">=</option>
                        </select>
                        <input
                          type="number"
                          step="any"
                          value={c.rhs}
                          onChange={(e) => handleConField(cIdx, "rhs", e.target.value)}
                          className="w-20 text-right font-mono text-xs px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveConstraint(cIdx)}
                          className="text-slate-400 hover:text-rose-500"
                          title="Eliminar restricción"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {model.variables.map((v, vIdx) => (
                          <label
                            key={vIdx}
                            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
                          >
                            <span className="text-[10px] font-mono text-slate-400">
                              {v.name.split(" ")[0]}:
                            </span>
                            <input
                              type="number"
                              step="any"
                              value={c.coefficients[vIdx] ?? 0}
                              onChange={(e) => handleConCoeff(cIdx, vIdx, e.target.value)}
                              className="w-12 text-right font-mono text-[11px] bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Ecuaciones del modelo (Max/Min Z = ..., s.a., restricciones ≤ / ≥ / =)
                </label>
                <textarea
                  rows={8}
                  value={algebraicText}
                  onChange={(e) => setAlgebraicText(e.target.value)}
                  spellCheck={false}
                  className="w-full font-mono text-xs p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              {algebraicErrors.length > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Errores de sintaxis detectados:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {algebraicErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {algebraicAppliedMsg && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{algebraicAppliedMsg}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleApplyAlgebraic}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aplicar Ecuaciones y Resolver</span>
              </button>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Vista Previa Matemática (LaTeX / KaTeX)
                </div>
                <KatexBlock
                  latex={latexPreview}
                  className="text-xs text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
