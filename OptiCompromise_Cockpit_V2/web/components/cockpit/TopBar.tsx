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
  ChevronRight,
} from "lucide-react";
import { PRESET_OPTIONS, SolverStatus, ThemeMode } from "./types";

interface TopBarProps {
  selectedPreset: string;
  onSelectPreset: (presetId: string) => void;
  solverStatus: SolverStatus;
  solverMessage: string;
  activeStage: 1 | 2 | 3 | 4;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onImportJSON: (file: File) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  canExportResults: boolean;
}

const STAGES = [
  { id: 1, label: "1. Definir" },
  { id: 2, label: "2. Configurar" },
  { id: 3, label: "3. Resolver" },
  { id: 4, label: "4. Exportar" },
] as const;

export default function TopBar({
  selectedPreset,
  onSelectPreset,
  solverStatus,
  solverMessage,
  activeStage,
  theme,
  onToggleTheme,
  onImportJSON,
  onExportJSON,
  onExportCSV,
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
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/40">
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
    <header className="sticky top-0 z-40 w-full border-b bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-slate-200 dark:border-slate-800 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Izquierda: Logo + Flujo de 4 etapas */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 via-emerald-500 to-violet-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Compass className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  OptiCompromise
                </h1>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  COCKPIT V2
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Programación de Compromiso Multiobjetivo · UNAL
              </p>
            </div>
          </div>

          {/* Indicador de flujo de 4 etapas */}
          <nav
            aria-label="Etapas del flujo"
            className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800"
          >
            {STAGES.map((stage, idx) => {
              const isCompleted = activeStage > stage.id;
              const isCurrent = activeStage === stage.id;
              return (
                <React.Fragment key={stage.id}>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                      isCurrent
                        ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold"
                        : isCompleted
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {stage.label}
                  </span>
                  {idx < STAGES.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Centro: Selector de casos + Semáforo del Solver */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="preset-selector"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:inline"
            >
              Caso:
            </label>
            <select
              id="preset-selector"
              value={selectedPreset}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="text-xs font-medium rounded-lg px-2.5 py-1.5 border bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 max-w-[260px]"
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
            accept=".json,application/json"
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
            title="Importar modelo (.json)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Importar</span>
          </button>

          <button
            type="button"
            onClick={onExportJSON}
            title="Exportar definición del modelo (.json)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            disabled={!canExportResults}
            title="Exportar resultados completos (.csv)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">CSV</span>
          </button>

          <a
            href="/MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf"
            target="_blank"
            rel="noopener noreferrer"
            title="Descargar Manual de Usuario PDF"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Manual PDF</span>
          </a>

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro (Slate Technical)"}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>
    </header>
  );
}
