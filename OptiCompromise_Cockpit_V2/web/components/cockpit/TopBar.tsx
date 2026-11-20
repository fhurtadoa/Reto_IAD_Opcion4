"use client";

import React, { useRef } from "react";
import {
  Compass,
  Sun,
  Moon,
  Upload,
  Download,
  FileSpreadsheet,
  BookOpen,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { PRESET_OPTIONS, SolverStatus, ThemeMode } from "./types";

interface TopBarProps {
  selectedPreset: string;
  onSelectPreset: (presetId: string) => void;
  solverStatus: SolverStatus;
  solverMessage: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onImportJSON: (file: File) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  canExportResults: boolean;
}

export default function TopBar({
  selectedPreset,
  onSelectPreset,
  solverStatus,
  solverMessage,
  theme,
  onToggleTheme,
  onImportJSON,
  onExportJSON,
  onExportCSV,
  onExportExcel,
  canExportResults,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const renderStatusPill = () => {
    switch (solverStatus) {
      case "optimal":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Óptimo</span>
          </div>
        );
      case "infeasible":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Infactible</span>
          </div>
        );
      case "unbounded":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>No acotado</span>
          </div>
        );
      case "calculating":
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Calculando...</span>
          </div>
        );
      case "error":
        return (
          <div
            title={solverMessage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Error Solver</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <span>Listo</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white dark:bg-[#111524] border-slate-200 dark:border-slate-800 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Izquierda: Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm bg-[#E11D48] flex items-center justify-center">
            <Compass className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                OptiCompromise
              </h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-rose-50 dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                COCKPIT V2
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Programación de Compromiso Multiobjetivo · UNAL
            </p>
          </div>
        </div>

        {/* Centro: Selector de casos + Semáforo del Solver */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="preset-selector"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:inline"
            >
              Ejemplos:
            </label>
            <select
              id="preset-selector"
              value={selectedPreset}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="text-xs font-medium rounded-sm px-2.5 py-1.5 border bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-[#E11D48] max-w-[310px]"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.badge})
                </option>
              ))}
            </select>
          </div>

          {renderStatusPill()}
        </div>

        {/* Derecha: Controles Globales */}
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.xlsx,.xls,.csv,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJSON(f);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Importar modelo desde JSON, Excel (.xlsx) o CSV"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Importar</span>
          </button>

          <button
            type="button"
            onClick={onExportJSON}
            title="Exportar definición del modelo (.json)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={!canExportResults}
            title="Exportar libro Excel (.xlsx) con Matriz de Pagos, Soluciones y Pareto"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] hover:text-[#E11D48] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#E11D48]" />
            <span className="hidden md:inline">Excel</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            disabled={!canExportResults}
            title="Exportar resultados completos (.csv)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] hover:text-[#E11D48] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">CSV</span>
          </button>

          <a
            href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
            target="_blank"
            rel="noopener noreferrer"
            title="Descargar Manual de Usuario PDF"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-semibold bg-[#111524] hover:bg-slate-800 text-white border border-slate-800 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#E11D48]" />
            <span className="hidden lg:inline">Manual PDF</span>
          </a>

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            className="p-1.5 rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>
    </header>
  );
}
