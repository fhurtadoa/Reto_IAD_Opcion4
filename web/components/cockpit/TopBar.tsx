"use client";

import React from "react";
import {
  Compass,
  Sun,
  Moon,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { PresetOption, SolverStatus, ThemeMode } from "./types";

interface TopBarProps {
  selectedPreset: string;
  catalog: PresetOption[];
  catalogNotice: string;
  onSelectPreset: (presetId: string) => void;
  solverStatus: SolverStatus;
  solverMessage: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  hasDraft: boolean;
}

export default function TopBar({
  selectedPreset,
  catalog,
  catalogNotice,
  onSelectPreset,
  solverStatus,
  solverMessage,
  theme,
  onToggleTheme,
  hasDraft,
}: TopBarProps) {
  const renderStatusPill = () => {
    if (hasDraft) {
      return (
        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
          title="Aplica o descarta las ecuaciones pendientes">
          Borrador sin aplicar
        </span>
      );
    }
    switch (solverStatus) {
      case "optimal":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Óptimo</span>
          </div>
        );
      case "partial":
        return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900" title={solverMessage}>Resultado parcial</span>;
      case "infeasible":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Infactible</span>
          </div>
        );
      case "unbounded":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/40"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>No acotado</span>
          </div>
        );
      case "calculating":
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Calculando...</span>
          </div>
        );
      case "error":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Error</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
            <span>Listo</span>
          </div>
        );
    }
  };

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded bg-[#E11D48] flex items-center justify-center">
            <Compass size={19} className="text-white" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight">OptiCompromise</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">Programación de Compromiso Multiobjetivo · UNAL</p>
          </div>
        </div>
        <div className="top-bar-exercises">
          <label htmlFor="preset-selector" className="sr-only sm:not-sr-only">Ejercicio</label>
          <select id="preset-selector" value={selectedPreset} disabled={hasDraft}
            title={hasDraft ? "Aplica o descarta el borrador primero" : undefined} onChange={(event) => onSelectPreset(event.target.value)}>
            {selectedPreset === "" && <option value="" disabled>Modelo abierto</option>}
            {catalog.map((opt) => <option key={opt.id} value={opt.id}>{opt.label} ({opt.badge})</option>)}
          </select>
        </div>
        <div role="status" className="top-bar-status">{renderStatusPill()}</div>
        <button type="button" onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          className="workspace-button top-bar-theme">
          {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        </button>
        {catalogNotice && <p className="col-span-full text-xs text-amber-800 dark:text-amber-200" role="status">{catalogNotice}</p>}
      </div>
    </header>
  );
}
