"use client";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import {
  Table2,
  Code2,
  Plus,
  Trash2,
  Scale,
  Play,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  ModelDefinition,
  VarType,
  ObjectiveSense,
  ConstraintSense,
  DecisionProfile,
} from "./types";
import {
  modelToAlgebraicText,
  parseAlgebraicModel,
  modelToLatex,
} from "./mathUtils";
import SectionHeading from "./SectionHeading";
import TooltipBadge from "./TooltipBadge";
import KatexBlock from "./KatexBlock";

interface NumericInputProps {
  id?: string;
  name?: string;
  ariaLabel?: string;
  value: number | null | undefined;
  onCommit: (val: number | null) => void;
  allowNull?: boolean;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  min?: number;
  max?: number;
}

/**
 * Input numérico con buffer de texto local mientras tiene foco:
 * permite borrar dígitos o empezar a escribir "-" sin forzar 0 en cada tecla.
 */
function NumericInput({
  id,
  name,
  ariaLabel,
  value,
  onCommit,
  allowNull = false,
  disabled = false,
  placeholder,
  title,
  className = "",
  min,
  max,
}: NumericInputProps) {
  const formatProp = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? "" : String(v);

  const [draft, setDraft] = useState<string>(() => formatProp(value));
  const [focused, setFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatProp(value));
    }
  }, [value, focused]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (allowNull) onCommit(null);
      return;
    }
    if (trimmed === "-" || trimmed === "." || trimmed === "-." || /[eE][+-]?$/.test(trimmed)) {
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (Number.isFinite(parsed)) {
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onCommit(clamped);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-." || /[eE][+-]?$/.test(trimmed)) {
      setDraft(formatProp(value));
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (Number.isFinite(parsed)) {
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      setDraft(formatProp(clamped));
    } else {
      setDraft(formatProp(value));
    }
  };

  return (
    <input
      id={id}
      name={name}
      aria-label={ariaLabel || title}
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChange={(e) => handleChange(e.target.value)}
      className={className}
    />
  );
}

interface ControlPanelLeftProps {
  model: ModelDefinition;
  modelKey: number;
  weights: number[];
  autoBalance: boolean;
  onToggleAutoBalance: (enabled: boolean) => void;
  decisionProfile: DecisionProfile;
  onSelectProfile: (profile: DecisionProfile) => void;
  validationError: string | null;
  onModelChange: (updated: ModelDefinition, newWeights?: number[]) => void;
  onWeightChange: (index: number, value: number) => void;
  onNormalizeWeights: () => void;
  onAlgebraicDraftChange: (dirty: boolean) => void;
  onManualSolve: (updated?: ModelDefinition, weights?: number[]) => void;
  isCalculating: boolean;
}

export default function ControlPanelLeft({
  model,
  modelKey,
  weights,
  autoBalance,
  onToggleAutoBalance,
  decisionProfile,
  onSelectProfile,
  validationError,
  onModelChange,
  onWeightChange,
  onNormalizeWeights,
  onAlgebraicDraftChange,
  onManualSolve,
  isCalculating,
}: ControlPanelLeftProps) {
  const [editorTab, setEditorTab] = useState<"table" | "algebraic">("table");
  const [openSections, setOpenSections] = useState<{ vars: boolean; objs: boolean; cons: boolean }>({
    vars: true,
    objs: true,
    cons: true,
  });
  const [algebraicText, setAlgebraicText] = useState<string>(() =>
    modelToAlgebraicText(model)
  );
  const [algebraicDirty, setDirty] = useState(false);
  const setAlgebraicDirty = useCallback((dirty: boolean) => {
    setDirty(dirty);
    onAlgebraicDraftChange(dirty);
  }, [onAlgebraicDraftChange]);
  const [algebraicErrors, setAlgebraicErrors] = useState<string[]>([]);

  // Al cambiar de caso/importación reiniciamos el borrador algebraico
  useEffect(() => {
    setAlgebraicText(modelToAlgebraicText(model));
    setAlgebraicDirty(false);
    setAlgebraicErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  // Solo sincronizar el texto algebraico desde Tabla si no hay ediciones sin aplicar en el textarea
  useEffect(() => {
    if (!algebraicDirty) {
      setAlgebraicText(modelToAlgebraicText(model));
      setAlgebraicErrors([]);
    }
  }, [model, algebraicDirty]);

  const latexPreview = useMemo(() => modelToLatex(model), [model]);

  const weightSum = weights.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0);
  const isWeightSumValid = Math.abs(weightSum - 1.0) <= 0.001 + 1e-12;

  const handleVarChange = (
    idx: number,
    field: "name" | "var_type",
    value: string
  ) => {
    const nextVars = model.variables.map((v, i) => {
      if (i !== idx) return v;
      if (field === "name") return { ...v, name: value };
      const vt = value as VarType;
      return {
        ...v,
        var_type: vt,
        lower_bound: vt === "binary" ? 0 : v.lower_bound,
        upper_bound: vt === "binary" ? 1 : v.upper_bound,
      };
    });
    onModelChange({ ...model, variables: nextVars });
  };

  const handleVarBound = (idx: number, field: "lower_bound" | "upper_bound", val: number | null) => {
    const nextVars = model.variables.map((v, i) => (i === idx ? { ...v, [field]: val } : v));
    onModelChange({ ...model, variables: nextVars });
  };

  const handleAddVariable = () => {
    const existingNames = new Set(model.variables.map((v) => v.name.trim()));
    let nextIdx = model.variables.length + 1;
    while (existingNames.has(`x${nextIdx}`)) {
      nextIdx += 1;
    }
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

  const handleObjCoeff = (objIdx: number, varIdx: number, val: number) => {
    const nextObjs = model.objectives.map((o, i) => {
      if (i !== objIdx) return o;
      const nextC = [...o.coefficients];
      nextC[varIdx] = Number.isFinite(val) ? val : 0;
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
    const eqW = Array(nextObjs.length).fill(1 / nextObjs.length);
    onModelChange({ ...model, objectives: nextObjs }, eqW);
  };

  const handleRemoveObjective = (idx: number) => {
    if (model.objectives.length <= 2) return;
    const nextObjs = model.objectives.filter((_, i) => i !== idx);
    const nextW = weights.filter((_, i) => i !== idx);
    const s = nextW.reduce((a, b) => a + b, 0);
    const normW =
      s > 0
        ? nextW.map((w) => w / s)
        : Array(nextObjs.length).fill(1 / nextObjs.length);
    onModelChange({ ...model, objectives: nextObjs }, normW);
  };

  const handleConField = (idx: number, field: "name" | "sense" | "rhs", value: string | number) => {
    const nextCons = model.constraints.map((c, i) => {
      if (i !== idx) return c;
      if (field === "rhs") {
        const num = typeof value === "number" ? value : parseFloat(value);
        return { ...c, rhs: Number.isFinite(num) ? num : 0 };
      }
      if (field === "sense") return { ...c, sense: value as ConstraintSense };
      return { ...c, name: String(value) };
    });
    onModelChange({ ...model, constraints: nextCons });
  };

  const handleConCoeff = (conIdx: number, varIdx: number, val: number) => {
    const nextCons = model.constraints.map((c, i) => {
      if (i !== conIdx) return c;
      const nextC = [...c.coefficients];
      nextC[varIdx] = Number.isFinite(val) ? val : 0;
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

  const parseDraftIntoModel = (): { updated: ModelDefinition; nextWeights?: number[] } | null => {
    if (algebraicText === modelToAlgebraicText(model)) {
      setAlgebraicDirty(false);
      setAlgebraicErrors([]);
      return { updated: model };
    }
    const parsed = parseAlgebraicModel(algebraicText, model);
    if (!parsed.ok || !parsed.objectives || !parsed.constraints || !parsed.detectedVariables) {
      setAlgebraicErrors(parsed.errors);
      return null;
    }

    const updatedVars = parsed.detectedVariables.map((vName) => {
      const existing = model.variables.find((v) => v.name === vName);
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
    const nextW = weights.length !== nObjs ? Array(nObjs).fill(1 / nObjs) : undefined;

    setAlgebraicDirty(false);
    setAlgebraicErrors([]);

    return {
      updated: {
        ...model,
        variables: updatedVars,
        objectives: parsed.objectives,
        constraints: parsed.constraints,
      },
      nextWeights: nextW,
    };
  };

  const handleApplyAlgebraic = () => {
    const applied = parseDraftIntoModel();
    if (!applied) return;
    onManualSolve(applied.updated, applied.nextWeights ?? weights);
  };

  const handleSwitchToTable = () => {
    if (editorTab === "algebraic" && algebraicDirty) {
      const applied = parseDraftIntoModel();
      if (!applied) return;
      onModelChange(applied.updated, applied.nextWeights);
    }
    setEditorTab("table");
  };

  return (
    <aside className="workspace-controls min-w-0 space-y-4">
      <div className="model-form space-y-4">
      <SectionHeading title="Formular el ejercicio" cue="Del enunciado al modelo de decisión" />
      {/* Encabezado del Modelo */}
      <div className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2 border-l-4 border-l-[#E11D48]">
        <div className="flex items-center justify-between gap-2">
          <input
            id="model-name-input"
            name="model-name"
            type="text"
            value={model.name}
            onChange={(e) => onModelChange({ ...model, name: e.target.value })}
            aria-label="Nombre del problema"
            placeholder="Nombre del problema"
            className="w-full text-sm font-bold bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#E11D48] rounded-sm px-1 -ml-1"
          />
          <button
            type="button"
            onClick={() => editorTab === "algebraic" && algebraicDirty ? handleApplyAlgebraic() : onManualSolve()}
            disabled={isCalculating || (Boolean(validationError) && !(editorTab === "algebraic" && algebraicDirty))}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold bg-[#E11D48] hover:bg-[#BE123C] text-white disabled:opacity-50 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Resolver</span>
          </button>
        </div>
        <textarea
          id="model-description-input"
          name="model-description"
          rows={2}
          value={model.description || ""}
          onChange={(e) => onModelChange({ ...model, description: e.target.value })}
          aria-label="Descripción del problema"
          placeholder="Descripción opcional del problema de decisión..."
          className="w-full text-[11px] leading-relaxed bg-transparent text-slate-500 dark:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#E11D48] rounded-sm px-1 -ml-1"
        />
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Fuente académica (opcional)
          <input id="model-reference-input" name="model-reference" type="text" value={model.reference ?? ""}
            onChange={e => onModelChange({ ...model, reference: e.target.value })}
            className="mt-1 block w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
            placeholder="Curso, taller o referencia del ejercicio" />
        </label>
      </div>

      {/* Alerta de Validación Inmediata en Cliente */}
      {validationError && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-sm bg-rose-50 dark:bg-rose-950/40 border-2 border-[#E11D48] text-xs text-rose-900 dark:text-rose-200">
          <AlertCircle className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <div>
              <span className="font-bold block">Error de Validación del Modelo:</span>
              <span>{validationError}</span>
            </div>
            {!isWeightSumValid && (
              <button
                type="button"
                onClick={onNormalizeWeights}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-bold bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors"
              >
                <Scale className="w-3 h-3" />
                <span>Normalizar pesos (1.00)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Editor del Modelo con Pestañas (Tabla / Algebraico) — Primero se define el problema */}
      <section
        id="cockpit-model-editor"
        className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSwitchToTable}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors ${
                editorTab === "table"
                  ? "bg-[#E11D48] text-white"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Modo Tabla</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorTab("algebraic")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors ${
                editorTab === "algebraic"
                  ? "bg-[#E11D48] text-white"
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
              {/* 1. Variables de Decisión (Acordeón sin scroll anidado) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-expanded={openSections.vars}
                      onClick={() => setOpenSections((s) => ({ ...s, vars: !s.vars }))}
                      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-[#E11D48] cursor-pointer"
                    >
                      {openSections.vars ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>Variables ({model.variables.length})</span>
                    </button>
                    <TooltipBadge
                      title="Variables (LP y MIP)"
                      content="Soporta variables Continuas (ℝ), Enteras (ℤ) y Binarias ({0,1}) resueltas con HiGHS y ramificación y poda en el motor."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSections((s) => ({ ...s, vars: true }));
                      handleAddVariable();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E11D48] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <p className="section-cue">Define qué cantidades decidir y sus límites posibles.</p>
                {openSections.vars && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1.8fr_1.1fr_0.75fr_0.75fr_24px] gap-1.5 px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Variable (Descripción)</span>
                    <span>Tipo</span>
                    <span className="text-right">Mín</span>
                    <span className="text-right">Máx</span>
                    <span />
                  </div>
                  {model.variables.map((v, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1.8fr_1.1fr_0.75fr_0.75fr_24px] gap-1.5 items-center bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-sm border border-slate-200 dark:border-slate-700/60"
                    >
                      <input
                        id={`var-name-${idx}`}
                        name={`var-name-${idx}`}
                        aria-label={`Nombre de variable ${idx + 1}`}
                        type="text"
                        value={v.name}
                        title={v.name}
                        onChange={(e) => handleVarChange(idx, "name", e.target.value)}
                        className="text-xs font-mono px-1.5 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-[#E11D48] min-w-0"
                        placeholder="x1 (Nombre)"
                      />
                      <select
                        id={`var-type-${idx}`}
                        name={`var-type-${idx}`}
                        aria-label={`Tipo de variable ${v.name || idx + 1}`}
                        value={v.var_type}
                        onChange={(e) => handleVarChange(idx, "var_type", e.target.value)}
                        className="text-[11px] px-1 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-[#E11D48] min-w-0"
                      >
                        <option value="continuous">Continua</option>
                        <option value="integer">Entera</option>
                        <option value="binary">Binaria</option>
                      </select>
                      <NumericInput
                        id={`var-lb-${idx}`}
                        name={`var-lb-${idx}`}
                        ariaLabel={`Cota inferior de ${v.name || `variable ${idx + 1}`}`}
                        value={v.lower_bound}
                        allowNull={true}
                        onCommit={(val) => handleVarBound(idx, "lower_bound", val)}
                        disabled={v.var_type === "binary"}
                        placeholder="-∞"
                        title="Cota inferior (vacío = -∞)"
                        className="text-xs font-mono text-right px-1 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50 focus:outline-[#E11D48] min-w-0"
                      />
                      <NumericInput
                        id={`var-ub-${idx}`}
                        name={`var-ub-${idx}`}
                        ariaLabel={`Cota superior de ${v.name || `variable ${idx + 1}`}`}
                        value={v.upper_bound}
                        allowNull={true}
                        onCommit={(val) => handleVarBound(idx, "upper_bound", val)}
                        disabled={v.var_type === "binary"}
                        placeholder="+∞"
                        title="Cota superior (vacío = +∞)"
                        className="text-xs font-mono text-right px-1 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50 focus:outline-[#E11D48] min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(idx)}
                        disabled={model.variables.length <= 1}
                        className="flex justify-center text-slate-400 hover:text-[#E11D48] disabled:opacity-30 cursor-pointer"
                        title="Eliminar variable"
                        aria-label={`Eliminar variable ${v.name || idx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                )}
              </div>

              {/* 2. Funciones Objetivo */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-expanded={openSections.objs}
                      onClick={() => setOpenSections((s) => ({ ...s, objs: !s.objs }))}
                      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-[#E11D48] cursor-pointer"
                    >
                      {openSections.objs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>Funciones Objetivo ({model.objectives.length})</span>
                    </button>
                    <TooltipBadge
                      title="Funciones Objetivo (Zᵢ)"
                      content="Define al menos 2 criterios en conflicto (Max o Min) con sus coeficientes lineales por variable. Pulsa '+ Añadir' para 3 o más objetivos (gráfico 3D y Radar)."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSections((s) => ({ ...s, objs: true }));
                      handleAddObjective();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E11D48] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <p className="section-cue">Indica qué deseas maximizar o minimizar y cuánto aporta cada variable.</p>
                {openSections.objs && (
                <div className="space-y-2">
                  {model.objectives.map((obj, oIdx) => (
                    <div
                      key={oIdx}
                      className="p-2 rounded-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <select
                          id={`obj-sense-${oIdx}`}
                          name={`obj-sense-${oIdx}`}
                          aria-label={`Sentido del objetivo ${oIdx + 1}`}
                          value={obj.sense}
                          onChange={(e) => handleObjField(oIdx, "sense", e.target.value)}
                          className={`text-[11px] font-bold px-1.5 py-1 rounded-sm border ${
                            obj.sense === "maximize"
                              ? "bg-[#111524] text-white border-[#111524]"
                              : "bg-rose-50 dark:bg-rose-950/50 text-[#E11D48] dark:text-rose-400 border-rose-200 dark:border-rose-800"
                          }`}
                        >
                          <option value="maximize">Max</option>
                          <option value="minimize">Min</option>
                        </select>
                        <input
                          id={`obj-name-${oIdx}`}
                          name={`obj-name-${oIdx}`}
                          aria-label={`Nombre del objetivo ${oIdx + 1}`}
                          type="text"
                          value={obj.name}
                          onChange={(e) => handleObjField(oIdx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveObjective(oIdx)}
                          disabled={model.objectives.length <= 2}
                          className="text-slate-400 hover:text-[#E11D48] disabled:opacity-30 cursor-pointer"
                          title="Eliminar objetivo"
                          aria-label={`Eliminar objetivo ${obj.name || oIdx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {model.variables.map((v, vIdx) => (
                          <label
                            key={vIdx}
                            htmlFor={`obj-${oIdx}-var-${vIdx}`}
                            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-sm px-1.5 py-0.5"
                          >
                            <span className="text-[10px] font-mono text-slate-400">
                              {v.name.split(" ")[0]}:
                            </span>
                            <NumericInput
                              id={`obj-${oIdx}-var-${vIdx}`}
                              name={`obj-${oIdx}-var-${vIdx}`}
                              ariaLabel={`Coeficiente de ${v.name} en objetivo ${obj.name || oIdx + 1}`}
                              value={obj.coefficients[vIdx] ?? 0}
                              onCommit={(val) => handleObjCoeff(oIdx, vIdx, val ?? 0)}
                              className="w-14 text-right font-mono text-[11px] bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>

              {/* 3. Restricciones */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-expanded={openSections.cons}
                      onClick={() => setOpenSections((s) => ({ ...s, cons: !s.cons }))}
                      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-[#E11D48] cursor-pointer"
                    >
                      {openSections.cons ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>Restricciones Lineales ({model.constraints.length})</span>
                    </button>
                    <TooltipBadge
                      title="Restricciones del Sistema"
                      content="Limitan la región factible mediante desigualdades (≤, ≥) o igualdades (=). Asegúrate de que el conjunto factible sea no vacío y acotado."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSections((s) => ({ ...s, cons: true }));
                      handleAddConstraint();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E11D48] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <p className="section-cue">Representa capacidades, demandas y balances mediante ecuaciones o desigualdades.</p>
                {openSections.cons && (
                <div className="space-y-2">
                  {model.constraints.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-2 rounded-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`con-name-${cIdx}`}
                          name={`con-name-${cIdx}`}
                          aria-label={`Nombre de restricción ${cIdx + 1}`}
                          type="text"
                          value={c.name}
                          onChange={(e) => handleConField(cIdx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <select
                          id={`con-sense-${cIdx}`}
                          name={`con-sense-${cIdx}`}
                          aria-label={`Operador de restricción ${c.name || cIdx + 1}`}
                          value={c.sense}
                          onChange={(e) => handleConField(cIdx, "sense", e.target.value)}
                          className="text-xs font-mono font-bold px-1.5 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#E11D48]"
                        >
                          <option value="<=">≤</option>
                          <option value=">=">≥</option>
                          <option value="==">=</option>
                        </select>
                        <NumericInput
                          id={`con-rhs-${cIdx}`}
                          name={`con-rhs-${cIdx}`}
                          ariaLabel={`Lado derecho de restricción ${c.name || cIdx + 1}`}
                          value={c.rhs}
                          onCommit={(val) => handleConField(cIdx, "rhs", val ?? 0)}
                          className="w-20 text-right font-mono text-xs px-1.5 py-1 rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveConstraint(cIdx)}
                          className="text-slate-400 hover:text-[#E11D48]"
                          title="Eliminar restricción"
                          aria-label={`Eliminar restricción ${c.name || cIdx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {model.variables.map((v, vIdx) => (
                          <label
                            key={vIdx}
                            htmlFor={`con-${cIdx}-var-${vIdx}`}
                            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-sm px-1.5 py-0.5"
                          >
                            <span className="text-[10px] font-mono text-slate-400">
                              {v.name.split(" ")[0]}:
                            </span>
                            <NumericInput
                              id={`con-${cIdx}-var-${vIdx}`}
                              name={`con-${cIdx}-var-${vIdx}`}
                              ariaLabel={`Coeficiente de ${v.name} en restricción ${c.name || cIdx + 1}`}
                              value={c.coefficients[vIdx] ?? 0}
                              onCommit={(val) => handleConCoeff(cIdx, vIdx, val ?? 0)}
                              className="w-12 text-right font-mono text-[11px] bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="algebraic-model-textarea" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Ecuaciones del modelo (Max/Min Z = ..., s.a., ≤ / ≥ / =)
                  </label>
                  {algebraicDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setAlgebraicText(modelToAlgebraicText(model));
                        setAlgebraicDirty(false);
                        setAlgebraicErrors([]);
                      }}
                      className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Descartar borrador
                    </button>
                  )}
                </div>
                <p className="section-cue">Escribe las ecuaciones lineales y aplícalas para actualizar el modelo.</p>
                <textarea
                  id="algebraic-model-textarea"
                  name="algebraic-model"
                  rows={8}
                  value={algebraicText}
                  onChange={(e) => {
                    setAlgebraicText(e.target.value);
                    setAlgebraicDirty(true);
                  }}
                  aria-label="Ecuaciones del modelo"
                  spellCheck={false}
                  className="w-full font-mono text-xs p-2.5 rounded-sm border bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#E11D48]"
                />
                {algebraicDirty && (
                  <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Aplica o descarta el borrador antes de consultar o exportar resultados.
                  </p>
                )}
              </div>

              {algebraicErrors.length > 0 && (
                <div role="alert" className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-xs text-[#E11D48] dark:text-rose-300 space-y-1">
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

              <button
                type="button"
                onClick={handleApplyAlgebraic}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-bold bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aplicar Ecuaciones y Resolver</span>
              </button>
            </div>
          )}

          {/* Vista Previa Matemática en LaTeX siempre disponible para Tabla y Algebraico */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="rounded-sm border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Vista Previa Matemática (LaTeX / KaTeX)
              </div>
              <p className="section-cue">Comprueba las ecuaciones y dominios que recibe el motor.</p>
              <KatexBlock
                latex={latexPreview}
                className="text-xs text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>
      </section>

      </div>

      <a href="#grafico-resultados" className="mobile-plot-link inline-block text-xs font-semibold text-rose-800 underline underline-offset-2 dark:text-rose-300 min-[851px]:hidden">
        Ir al gráfico
      </a>
      {/* Ecualizador de Pesos (w_i) + Perfil del Decisor (Al final tras definir el modelo) */}
      <section
        id="cockpit-weights-panel"
        className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3"
      >
        <SectionHeading title="Preferencias" cue="Ajusta los pesos para recalcular las soluciones." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TooltipBadge title="Pesos de preferencia" content="Los pesos expresan la importancia relativa de cada objetivo y suman 1." />
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-sm border ${
                isWeightSumValid
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/15 text-[#E11D48] dark:text-rose-400 border-rose-500/40 animate-pulse"
              }`}
            >
              <span className="whitespace-nowrap">Σw = {weightSum.toFixed(3)}</span>
            </span>
            <button
              type="button"
              onClick={onNormalizeWeights}
              title="Auto-normalizar pesos (w_i / Σw_i)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 hover:text-[#E11D48] border border-slate-200 dark:border-slate-700 hover:border-[#E11D48] transition-colors"
            >
              <Scale className="w-3 h-3" />
              <span>Normalizar</span>
            </button>
          </div>
        </div>

        {/* Selector Rápido de Actitud / Perfil del Decisor */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "equitativo" as DecisionProfile, label: "Iguales", sub: "Mismo peso" },
            { id: "compensatorio" as DecisionProfile, label: "Priorizar Z₁", sub: "70% al primero" },
            { id: "moderado" as DecisionProfile, label: "Explorar L₂", sub: "Pesos iguales" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={decisionProfile === p.id}
              onClick={() => onSelectProfile(p.id)}
              className={`px-2 py-1.5 rounded-sm border text-left transition-colors cursor-pointer ${
                decisionProfile === p.id
                  ? "bg-rose-50 dark:bg-rose-950/40 border-[#E11D48] text-slate-900 dark:text-white"
                  : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400"
              }`}
            >
              <span className="block text-[11px] font-bold leading-tight">{p.label}</span>
              <span className="block text-[9px] font-mono text-[#E11D48] dark:text-rose-400">
                {p.sub}
              </span>
            </button>
          ))}
        </div>

        {/* Switch Auto-Balanceo */}
        <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
          <label htmlFor="weights-auto-balance" className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              id="weights-auto-balance"
              name="weights-auto-balance"
              type="checkbox"
              checked={autoBalance}
              onChange={(e) => onToggleAutoBalance(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#E11D48] rounded-sm"
            />
            <span className="font-medium">Auto-balancear suma fija en 1.00</span>
          </label>
          {decisionProfile === "personalizado" && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Manual
            </span>
          )}
        </div>

        {!isWeightSumValid && (
          <div className="flex items-center gap-2 p-2 rounded-sm bg-rose-50 dark:bg-rose-950/30 border border-[#E11D48] text-[11px] text-rose-800 dark:text-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-[#E11D48] shrink-0" />
            <span>
              Los pesos suman <b>{weightSum.toFixed(3)}</b> (≠ 1.00). Ajusta los deslizadores o pulsa el botón <b>Normalizar</b> para normalizar antes de resolver.
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
                  <label
                    htmlFor={`weight-slider-${idx}`}
                    className="font-medium text-slate-700 dark:text-slate-200 truncate pr-2"
                  >
                    <span className="font-mono font-bold text-[#E11D48] mr-1">
                      w{idx + 1}
                    </span>
                    {obj.name}
                  </label>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      ({pct.toFixed(0)}%)
                    </span>
                    <NumericInput
                      id={`weight-input-${idx}`}
                      name={`weight-input-${idx}`}
                      ariaLabel={`Valor numérico peso ${obj.name}`}
                      min={0}
                      max={1}
                      value={Number(wVal.toFixed(3))}
                      onCommit={(val) => onWeightChange(idx, val ?? 0)}
                      className="w-16 text-right font-mono text-xs px-1.5 py-0.5 rounded-sm border bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-[#E11D48]"
                    />
                  </div>
                </div>
                <input
                  id={`weight-slider-${idx}`}
                  name={`weight-slider-${idx}`}
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
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
            <span className="w-2 h-2 rounded-xs bg-[#2563EB]" />
            <span>L₁</span>
            <TooltipBadge
              title="Métrica L₁ (Compensatoria / Manhattan)"
              content="Minimiza la suma ponderada de desviaciones. Permite compensación total: sacrificar mucho un objetivo si otro mejora más."
            />
          </div>
          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-2 h-2 rounded-xs bg-[#334155] dark:bg-slate-300" />
            <span>L₂</span>
            <TooltipBadge
              title="Métrica L₂ (Euclidiana)"
              content="Eleva al cuadrado cada brecha ya ponderada y minimiza la suma. La distancia mostrada incluye la raíz cuadrada."
              align="center"
            />
          </div>
          <div className="flex items-center gap-1 text-[#E11D48] font-semibold">
            <span className="w-2 h-2 rounded-xs bg-[#E11D48]" />
            <span>L∞</span>
            <TooltipBadge
              title="Métrica L∞ (Equilibrio Minimax / Tchebysheff)"
              content="Minimiza la mayor desviación ponderada (λ). Las restricciones activas comparten ese valor."
              align="right"
            />
          </div>
        </div>
        {model.objectives.length > 3 && (
          <label htmlFor="pareto-seed-input" className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
            Semilla de la frontera
            <NumericInput
              id="pareto-seed-input"
              name="pareto-seed"
              ariaLabel="Semilla de la frontera"
              min={0}
              max={4294967295}
              value={model.pareto_seed ?? 42}
              onCommit={(val) => {
                const nextSeed = val === null ? 42 : Math.round(val);
                if (
                  Number.isInteger(nextSeed) &&
                  nextSeed >= 0 &&
                  nextSeed <= 4294967295 &&
                  nextSeed !== (model.pareto_seed ?? 42)
                ) {
                  onModelChange({ ...model, pareto_seed: nextSeed });
                }
              }}
              className="w-28 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
            />
          </label>
        )}
      </section>
    </aside>
  );
}
