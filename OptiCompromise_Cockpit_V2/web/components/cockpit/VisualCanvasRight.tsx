"use client";

import React, { useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  Box,
  Compass,
  Grid,
  BarChart3,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
  Microscope,
  Layers,
  AlertOctagon,
  Loader2,
} from "lucide-react";
import {
  ModelDefinition,
  SolveResponse,
  SolverStatus,
  ThemeMode,
  SEMANTIC_COLORS,
} from "./types";
import {
  fmtNum,
  computeFeasiblePolygon2D,
  computeIsodistanceTraces2D,
  buildLinfXRayLatex,
} from "./mathUtils";
import TooltipBadge from "./TooltipBadge";
import KatexBlock from "./KatexBlock";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="h-[340px] w-full flex items-center justify-center bg-slate-900/50 text-slate-400 text-xs rounded-lg font-mono">
      Inicializando motor gráfico Plotly...
    </div>
  ),
});

interface VisualCanvasRightProps {
  model: ModelDefinition;
  weights: number[];
  solveResult: SolveResponse | null;
  solverStatus: SolverStatus;
  solverMessage: string;
  theme: ThemeMode;
}

type ChartTab = "objectives2d" | "objectives3d" | "decision2d";

export default function VisualCanvasRight({
  model,
  weights,
  solveResult,
  solverStatus,
  solverMessage,
  theme,
}: VisualCanvasRightProps) {
  const [chartTab, setChartTab] = useState<ChartTab>("objectives2d");
  const [showIsodistance, setShowIsodistance] = useState<boolean>(true);
  const [showPareto, setShowPareto] = useState<boolean>(true);
  const [axisX, setAxisX] = useState<number>(0);
  const [axisY, setAxisY] = useState<number>(1);
  const [axis3DX, setAxis3DX] = useState<number>(0);
  const [axis3DY, setAxis3DY] = useState<number>(1);
  const [axis3DZ, setAxis3DZ] = useState<number>(2);
  const [xrayOpen, setXrayOpen] = useState<boolean>(false);
  const plotContainerRef = useRef<HTMLDivElement | null>(null);

  const isDark = theme === "dark";
  const paperBg = isDark ? "#0F172A" : "#FFFFFF";
  const plotBg = isDark ? "#1E293B" : "#F8FAFC";
  const gridColor = isDark ? "#334155" : "#E2E8F0";
  const textColor = isDark ? "#E2E8F0" : "#0F172A";

  const headers = solveResult?.payoff?.headers || model.objectives.map((o) => o.name);
  const nObjs = headers.length;
  const nVars = model.variables.length;

  const safeAxisX = axisX < nObjs ? axisX : 0;
  const safeAxisY = axisY < nObjs && axisY !== safeAxisX ? axisY : safeAxisX === 0 ? 1 : 0;
  const safe3DX = axis3DX < nObjs ? axis3DX : 0;
  const safe3DY = axis3DY < nObjs ? axis3DY : 1;
  const safe3DZ = axis3DZ < nObjs ? axis3DZ : Math.min(2, nObjs - 1);

  const effectiveTab: ChartTab =
    chartTab === "objectives3d" && nObjs < 3
      ? "objectives2d"
      : chartTab === "decision2d" && nVars !== 2
      ? "objectives2d"
      : chartTab;

  const handleDownloadPNG = async () => {
    const container = plotContainerRef.current;
    if (!container) return;
    const plotEl = container.querySelector(".js-plotly-plot") as HTMLElement | null;
    if (!plotEl) return;
    try {
      const Plotly = (await import("plotly.js-dist-min")).default;
      const dataUrl = await Plotly.toImage(plotEl, {
        format: "png",
        width: 1200,
        height: 750,
        scale: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `opticompromise_${effectiveTab}.png`;
      a.click();
    } catch (err) {
      console.error("Error exportando PNG:", err);
    }
  };

  // --- Construcción de datos 2D ---
  const { data2D, layout2D } = useMemo(() => {
    if (!solveResult) return { data2D: [], layout2D: {} };
    const { payoff, solutions, pareto_points = [] } = solveResult;
    const ideal = payoff.ideal_point;
    const nadir = payoff.anti_ideal_point;
    const isPure2D = nObjs === 2;

    const sortedPareto = isPure2D
      ? [...pareto_points].sort((a, b) => a.objectives[safeAxisX] - b.objectives[safeAxisX])
      : pareto_points;

    const traces: any[] = [];

    if (showPareto && sortedPareto.length > 0) {
      traces.push({
        x: sortedPareto.map((p) => p.objectives[safeAxisX]),
        y: sortedPareto.map((p) => p.objectives[safeAxisY]),
        mode: isPure2D ? "lines+markers" : "markers",
        type: "scatter",
        name: isPure2D ? "Frontera de Pareto" : "Nube Pareto (Proyección)",
        line: isPure2D ? { color: SEMANTIC_COLORS.pareto, width: 2.5 } : undefined,
        marker: { size: isPure2D ? 5 : 5, color: SEMANTIC_COLORS.pareto, opacity: 0.75 },
        hoverinfo: "text",
        hovertext: sortedPareto.map(
          (p) =>
            `<b>Pareto</b><br>${headers[safeAxisX]}: ${fmtNum(p.objectives[safeAxisX])}<br>${headers[safeAxisY]}: ${fmtNum(p.objectives[safeAxisY])}`
        ),
      });
    }

    // Curvas de Isodistancia
    if (showIsodistance) {
      const isoTraces = computeIsodistanceTraces2D(
        model,
        payoff,
        solveResult.weights,
        solutions,
        safeAxisX,
        safeAxisY
      );
      isoTraces.forEach((iso) => {
        traces.push({
          x: iso.x,
          y: iso.y,
          mode: "lines",
          type: "scatter",
          name: iso.name,
          line: { color: iso.color, width: 1.8, dash: iso.dash },
          hoverinfo: "name",
        });
      });
    }

    // Ideal
    traces.push({
      x: [ideal[safeAxisX]],
      y: [ideal[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "Ideal (Z*)",
      text: ["★ Ideal"],
      textposition: "top center",
      textfont: { color: SEMANTIC_COLORS.ideal, size: 11 },
      marker: {
        symbol: "star",
        size: 16,
        color: SEMANTIC_COLORS.ideal,
        line: { color: "#FFFFFF", width: 1 },
      },
    });

    // Nadir
    traces.push({
      x: [nadir[safeAxisX]],
      y: [nadir[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "Nadir",
      text: ["✕ Nadir"],
      textposition: "bottom center",
      textfont: { color: SEMANTIC_COLORS.nadir, size: 11 },
      marker: { symbol: "x", size: 12, color: SEMANTIC_COLORS.nadir, line: { width: 2.5 } },
    });

    // L1, L2, L_inf
    const metricDefs = [
      { key: "L1", label: "L₁", name: "L₁ (Compensatoria)", color: SEMANTIC_COLORS.L1, symbol: "square", pos: "top right" },
      { key: "L2", label: "L₂", name: "L₂ (Euclidiana)", color: SEMANTIC_COLORS.L2, symbol: "circle", pos: "bottom right" },
      { key: "L_inf", label: "L∞", name: "L∞ (Minimax)", color: SEMANTIC_COLORS.L_inf, symbol: "diamond", pos: "top left" },
    ];

    metricDefs.forEach((m) => {
      const sol = solutions[m.key];
      if (!sol || sol.objectives.length <= Math.max(safeAxisX, safeAxisY)) return;
      traces.push({
        x: [sol.objectives[safeAxisX]],
        y: [sol.objectives[safeAxisY]],
        mode: "markers+text",
        type: "scatter",
        name: m.name,
        text: [m.label],
        textposition: m.pos,
        textfont: { color: m.color, size: 12 },
        marker: {
          symbol: m.symbol,
          size: 13,
          color: m.color,
          line: { color: "#FFFFFF", width: 1.5 },
        },
        hoverinfo: "text",
        hovertext: `<b>${m.name}</b><br>${headers[safeAxisX]}: ${fmtNum(sol.objectives[safeAxisX])}<br>${headers[safeAxisY]}: ${fmtNum(sol.objectives[safeAxisY])}<br>D_p: ${sol.aggregate_distance.toFixed(4)}`,
      });
    });

    return {
      data2D: traces,
      layout2D: {
        autosize: true,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: textColor, size: 11 },
        xaxis: { title: headers[safeAxisX], gridcolor: gridColor, zerolinecolor: gridColor, automargin: true },
        yaxis: { title: headers[safeAxisY], gridcolor: gridColor, zerolinecolor: gridColor, automargin: true },
        legend: { orientation: "h", y: -0.22, font: { size: 10 } },
        margin: { l: 60, r: 24, t: 18, b: 64 },
      },
    };
  }, [solveResult, model, safeAxisX, safeAxisY, showIsodistance, showPareto, headers, nObjs, paperBg, plotBg, gridColor, textColor]);

  // --- Construcción de datos 3D ---
  const { data3D, layout3D } = useMemo(() => {
    if (!solveResult || nObjs < 3) return { data3D: [], layout3D: {} };
    const { payoff, solutions, pareto_points = [] } = solveResult;
    const ideal = payoff.ideal_point;
    const nadir = payoff.anti_ideal_point;

    const traces: any[] = [];
    if (showPareto && pareto_points.length > 0) {
      traces.push({
        x: pareto_points.map((p) => p.objectives[safe3DX]),
        y: pareto_points.map((p) => p.objectives[safe3DY]),
        z: pareto_points.map((p) => p.objectives[safe3DZ]),
        mode: "markers",
        type: "scatter3d",
        name: "Frontera Pareto 3D",
        marker: { size: 4, color: SEMANTIC_COLORS.pareto, opacity: 0.65 },
      });
    }

    traces.push({
      x: [ideal[safe3DX]],
      y: [ideal[safe3DY]],
      z: [ideal[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "Ideal (Z*)",
      text: ["★ Ideal"],
      marker: { symbol: "diamond", size: 9, color: SEMANTIC_COLORS.ideal },
    });

    traces.push({
      x: [nadir[safe3DX]],
      y: [nadir[safe3DY]],
      z: [nadir[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "Nadir",
      text: ["✕ Nadir"],
      marker: { symbol: "cross", size: 7, color: SEMANTIC_COLORS.nadir },
    });

    [
      { key: "L1", label: "L₁", color: SEMANTIC_COLORS.L1 },
      { key: "L2", label: "L₂", color: SEMANTIC_COLORS.L2 },
      { key: "L_inf", label: "L∞", color: SEMANTIC_COLORS.L_inf },
    ].forEach((m) => {
      const sol = solutions[m.key];
      if (!sol) return;
      traces.push({
        x: [sol.objectives[safe3DX]],
        y: [sol.objectives[safe3DY]],
        z: [sol.objectives[safe3DZ]],
        mode: "markers+text",
        type: "scatter3d",
        name: m.label,
        text: [m.label],
        marker: { size: 8, color: m.color },
      });
    });

    return {
      data3D: traces,
      layout3D: {
        autosize: true,
        paper_bgcolor: paperBg,
        font: { color: textColor, size: 11 },
        scene: {
          bgcolor: plotBg,
          xaxis: { title: headers[safe3DX], gridcolor: gridColor },
          yaxis: { title: headers[safe3DY], gridcolor: gridColor },
          zaxis: { title: headers[safe3DZ], gridcolor: gridColor },
          camera: { eye: { x: 1.55, y: 1.55, z: 1.25 } },
        },
        legend: { orientation: "h", y: -0.05, font: { size: 10 } },
        margin: { l: 0, r: 0, t: 10, b: 10 },
      },
    };
  }, [solveResult, nObjs, safe3DX, safe3DY, safe3DZ, showPareto, headers, paperBg, plotBg, gridColor, textColor]);

  // --- Construcción Espacio de Decisiones 2D ---
  const { dataDec, layoutDec } = useMemo(() => {
    if (!solveResult || nVars !== 2) return { dataDec: [], layoutDec: {} };
    const v0 = model.variables[0].name;
    const v1 = model.variables[1].name;
    const poly = computeFeasiblePolygon2D(model);
    const traces: any[] = [];

    if (poly) {
      traces.push({
        x: poly.x,
        y: poly.y,
        fill: "toself",
        fillcolor: isDark ? "rgba(56, 189, 248, 0.14)" : "rgba(6, 182, 212, 0.14)",
        line: { color: SEMANTIC_COLORS.pareto, width: 2 },
        mode: "lines",
        type: "scatter",
        name: "Región Factible",
      });
    }

    // Óptimos independientes
    const indSols = solveResult.payoff.independent_solutions || [];
    if (indSols.length > 0) {
      traces.push({
        x: indSols.map((s) => s[v0]),
        y: indSols.map((s) => s[v1]),
        mode: "markers+text",
        type: "scatter",
        name: "Óptimos Individuales",
        text: indSols.map((_, idx) => `x*(Z${idx + 1})`),
        textposition: "bottom left",
        textfont: { color: SEMANTIC_COLORS.ideal, size: 10 },
        marker: { symbol: "star-open", size: 11, color: SEMANTIC_COLORS.ideal, line: { width: 2 } },
      });
    }

    [
      { key: "L1", label: "L₁", color: SEMANTIC_COLORS.L1, symbol: "square", pos: "top right" },
      { key: "L2", label: "L₂", color: SEMANTIC_COLORS.L2, symbol: "circle", pos: "bottom right" },
      { key: "L_inf", label: "L∞", color: SEMANTIC_COLORS.L_inf, symbol: "diamond", pos: "top left" },
    ].forEach((m) => {
      const sol = solveResult.solutions[m.key];
      if (!sol) return;
      traces.push({
        x: [sol.variables[v0]],
        y: [sol.variables[v1]],
        mode: "markers+text",
        type: "scatter",
        name: `Vértice ${m.label}`,
        text: [`${m.label} (${fmtNum(sol.variables[v0], 1)}, ${fmtNum(sol.variables[v1], 1)})`],
        textposition: m.pos,
        textfont: { color: m.color, size: 11 },
        marker: { symbol: m.symbol, size: 13, color: m.color, line: { color: "#FFFFFF", width: 1.5 } },
      });
    });

    return {
      dataDec: traces,
      layoutDec: {
        autosize: true,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: textColor, size: 11 },
        xaxis: { title: v0, gridcolor: gridColor, zerolinecolor: gridColor },
        yaxis: { title: v1, gridcolor: gridColor, zerolinecolor: gridColor },
        legend: { orientation: "h", y: -0.22, font: { size: 10 } },
        margin: { l: 55, r: 24, t: 18, b: 64 },
      },
    };
  }, [solveResult, model, nVars, isDark, paperBg, plotBg, gridColor, textColor]);

  // --- Datos Rayos X (L_inf) ---
  const xrayData = useMemo(() => {
    if (!solveResult) return null;
    return buildLinfXRayLatex(
      model,
      solveResult.payoff,
      solveResult.weights,
      solveResult.solutions.L_inf
    );
  }, [model, solveResult]);

  // Estado vacío o error
  if (solverStatus === "infeasible" || solverStatus === "unbounded" || solverStatus === "error") {
    return (
      <main className="w-full lg:w-[65%] lg:h-[calc(100vh-57px)] lg:overflow-y-auto cockpit-scroll p-6 flex items-center justify-center bg-slate-100/50 dark:bg-[#0F172A]">
        <div className="max-w-lg w-full rounded-2xl border border-rose-500/40 bg-white dark:bg-slate-900 p-6 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 text-rose-500">
            <AlertOctagon className="w-7 h-7 shrink-0" />
            <div>
              <h2 className="text-base font-bold">
                {solverStatus === "infeasible"
                  ? "Modelo Infactible"
                  : solverStatus === "unbounded"
                  ? "Modelo No Acotado"
                  : "Error del Motor de Optimización"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                El backend FastAPI / HiGHS no pudo encontrar una región factible acotada.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 font-mono text-xs text-rose-600 dark:text-rose-300 break-words">
            {solverMessage}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Revisa las restricciones, sentidos (≤, ≥, =) o cotas de variables en el Panel Izquierdo.
          </p>
        </div>
      </main>
    );
  }

  if (!solveResult) {
    return (
      <main className="w-full lg:w-[65%] lg:h-[calc(100vh-57px)] flex items-center justify-center bg-slate-100/50 dark:bg-[#0F172A]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
          <span className="text-xs font-mono">Conectando con motor FastAPI (HiGHS / SLSQP)...</span>
        </div>
      </main>
    );
  }

  const solL1 = solveResult.solutions.L1;
  const solL2 = solveResult.solutions.L2;
  const solLinf = solveResult.solutions.L_inf;

  return (
    <main className="w-full lg:w-[65%] lg:h-[calc(100vh-57px)] lg:overflow-y-auto cockpit-scroll bg-slate-100/50 dark:bg-[#0F172A] p-4 space-y-4">
      {/* 1. GRÁFICO PRINCIPAL INTERACTIVO */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          {/* Pestañas de vista gráfica */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setChartTab("objectives2d")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                effectiveTab === "objectives2d"
                  ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Objetivos 2D</span>
            </button>

            {nObjs >= 3 && (
              <button
                type="button"
                onClick={() => setChartTab("objectives3d")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  effectiveTab === "objectives3d"
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>Espacio 3D</span>
              </button>
            )}

            {nVars === 2 && (
              <button
                type="button"
                onClick={() => setChartTab("decision2d")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  effectiveTab === "decision2d"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Región Factible ({model.variables[0].name} vs {model.variables[1].name})</span>
              </button>
            )}
          </div>

          {/* Controles del gráfico */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
            {effectiveTab === "objectives2d" && (
              <>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showIsodistance}
                    onChange={(e) => setShowIsodistance(e.target.checked)}
                    className="accent-cyan-500 rounded"
                  />
                  <span>Curvas Isodistancia</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showPareto}
                    onChange={(e) => setShowPareto(e.target.checked)}
                    className="accent-cyan-500 rounded"
                  />
                  <span>Pareto</span>
                </label>
              </>
            )}

            {effectiveTab === "objectives2d" && nObjs > 2 && (
              <div className="flex items-center gap-1">
                <select
                  value={safeAxisX}
                  onChange={(e) => setAxisX(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>X: {h}</option>
                  ))}
                </select>
                <select
                  value={safeAxisY}
                  onChange={(e) => setAxisY(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>Y: {h}</option>
                  ))}
                </select>
              </div>
            )}

            {effectiveTab === "objectives3d" && nObjs > 3 && (
              <div className="flex items-center gap-1">
                <select
                  value={safe3DX}
                  onChange={(e) => setAxis3DX(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>X: {h}</option>)}
                </select>
                <select
                  value={safe3DY}
                  onChange={(e) => setAxis3DY(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>Y: {h}</option>)}
                </select>
                <select
                  value={safe3DZ}
                  onChange={(e) => setAxis3DZ(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>Z: {h}</option>)}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadPNG}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-500 transition-colors font-semibold"
              title="Descargar gráfico actual en alta resolución PNG"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>PNG</span>
            </button>
          </div>
        </div>

        <div ref={plotContainerRef} className="p-2">
          {effectiveTab === "objectives2d" && (
            <Plot
              data={data2D}
              layout={layout2D}
              config={{ displayModeBar: true, responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%", height: "350px" }}
            />
          )}
          {effectiveTab === "objectives3d" && (
            <Plot
              data={data3D}
              layout={layout3D}
              config={{ displayModeBar: true, responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%", height: "390px" }}
            />
          )}
          {effectiveTab === "decision2d" && (
            <Plot
              data={dataDec}
              layout={layoutDec}
              config={{ displayModeBar: true, responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%", height: "350px" }}
            />
          )}
        </div>
      </section>

      {/* 2. GRID: TARJETAS COMPARATIVAS (L1, L2, L_inf) + EFECTO EQUILIBRIO */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Tarjetas Comparativas */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Comparativa de Soluciones Compromiso
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Motor: SciPy HiGHS + SLSQP
            </span>
          </div>

          <div className="overflow-x-auto cockpit-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2 pr-2 font-semibold">Indicador</th>
                  <th className="text-right py-2 px-2 font-bold text-[#06B6D4]">L₁ (Manhattan)</th>
                  <th className="text-right py-2 px-2 font-bold text-[#10B981]">L₂ (Euclidiana)</th>
                  <th className="text-right py-2 pl-2 font-bold text-[#8B5CF6]">L∞ (Minimax)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                <tr className="bg-slate-50/60 dark:bg-slate-800/40">
                  <td className="py-1.5 pr-2 font-sans font-semibold text-slate-700 dark:text-slate-200">
                    Distancia Dₚ al Ideal
                  </td>
                  <td className="py-1.5 px-2 text-right text-cyan-600 dark:text-cyan-400 font-bold">
                    {solL1?.aggregate_distance.toFixed(4)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    {solL2?.aggregate_distance.toFixed(4)}
                  </td>
                  <td className="py-1.5 pl-2 text-right text-violet-600 dark:text-violet-400 font-bold">
                    {solLinf?.aggregate_distance.toFixed(4)}
                  </td>
                </tr>

                {/* Valores de Objetivos + % Logro */}
                {headers.map((h, i) => (
                  <tr key={`obj-${i}`}>
                    <td className="py-1.5 pr-2 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[170px]" title={h}>
                      Z{i + 1}: {h}
                    </td>
                    {[solL1, solL2, solLinf].map((sol, mIdx) => (
                      <td key={mIdx} className="py-1.5 px-2 text-right">
                        <div className="text-slate-800 dark:text-slate-100">
                          {fmtNum(sol?.objectives[i], 2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {sol?.achievement_pct[i]?.toFixed(1)}% logro
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Variables x* (mostrar hasta 6 o resumen si hay muchas) */}
                {model.variables.slice(0, 6).map((v) => (
                  <tr key={`var-${v.name}`} className="text-[11px]">
                    <td className="py-1 pr-2 font-mono text-slate-500 dark:text-slate-400">
                      {v.name} {v.var_type !== "continuous" && <span className="text-[9px] uppercase text-amber-500">({v.var_type[0]})</span>}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-700 dark:text-slate-300">
                      {fmtNum(solL1?.variables[v.name], 2)}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-700 dark:text-slate-300">
                      {fmtNum(solL2?.variables[v.name], 2)}
                    </td>
                    <td className="py-1 pl-2 text-right text-slate-700 dark:text-slate-300">
                      {fmtNum(solLinf?.variables[v.name], 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {model.variables.length > 6 && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                Mostrando 6 de {model.variables.length} variables. Exporta a <b>CSV</b> para ver el vector x* completo.
              </p>
            )}
          </div>
        </section>

        {/* Gráfico de "Efecto Equilibrio" */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-violet-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Efecto Equilibrio (% Logro Z&apos;)
              </h2>
              <TooltipBadge
                title="Efecto Equilibrio de L∞"
                content="Compara el porcentaje de logro Z'_i(x) = 100·(1 - D_i) por objetivo. Observa cómo L∞ (violeta) nivela los logros evitando extremos desbalanceados."
                align="right"
              />
            </div>
          </div>

          <div className="space-y-3.5">
            {headers.map((h, i) => {
              const p1 = Math.max(0, Math.min(100, solL1?.achievement_pct[i] ?? 0));
              const p2 = Math.max(0, Math.min(100, solL2?.achievement_pct[i] ?? 0));
              const pInf = Math.max(0, Math.min(100, solLinf?.achievement_pct[i] ?? 0));
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">
                      Z{i + 1}: {h}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      w={((solveResult.weights[i] ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Barra L1 */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-6 text-cyan-500 font-bold">L₁</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#06B6D4] transition-all duration-300"
                        style={{ width: `${p1}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-slate-500 dark:text-slate-400">
                      {p1.toFixed(1)}%
                    </span>
                  </div>

                  {/* Barra L2 */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-6 text-emerald-500 font-bold">L₂</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#10B981] transition-all duration-300"
                        style={{ width: `${p2}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-slate-500 dark:text-slate-400">
                      {p2.toFixed(1)}%
                    </span>
                  </div>

                  {/* Barra L_inf */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-6 text-violet-500 font-bold">L∞</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#8B5CF6] transition-all duration-300"
                        style={{ width: `${pInf}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-semibold text-violet-500">
                      {pInf.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 3. MATRIZ DE PAGOS (IDEAL & NADIR) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TableIcon className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Matriz de Pagos (Payoff Matrix)
            </h2>
            <TooltipBadge
              title="Ideal (★) y Anti-Ideal / Nadir (✕)"
              content="Cada fila optimiza un objetivo de forma independiente. La diagonal dorada forma el Punto Ideal Z* (inalcanzable simultáneamente) y los peores valores por columna forman el Punto Nadir."
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1 text-amber-500">
              <span className="w-2 h-2 rounded-sm bg-amber-500/40 border border-amber-500" />
              Diagonal Ideal (Z*)
            </span>
            <span className="inline-flex items-center gap-1 text-rose-500">
              <span className="w-2 h-2 rounded-sm bg-rose-500/40 border border-rose-500" />
              Nadir (Anti-Ideal)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto cockpit-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <th className="text-left py-2 pr-3 font-semibold">Óptimo Individual de:</th>
                {headers.map((h, i) => (
                  <th key={i} className="text-right py-2 px-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono">
              {solveResult.payoff.matrix.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="py-1.5 pr-3 font-sans font-medium text-slate-700 dark:text-slate-200">
                    x*(Z{rIdx + 1}) · {headers[rIdx]}
                  </td>
                  {row.map((val, cIdx) => {
                    const isIdeal = rIdx === cIdx;
                    const isNadir =
                      !isIdeal &&
                      Math.abs(val - solveResult.payoff.anti_ideal_point[cIdx]) < 1e-4;
                    return (
                      <td
                        key={cIdx}
                        className={`py-1.5 px-2 text-right rounded ${
                          isIdeal
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold"
                            : isNadir
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {fmtNum(val, 2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Fila Resumen Ideal */}
              <tr className="bg-amber-500/10 border-t-2 border-amber-500/30 font-bold">
                <td className="py-2 pr-3 font-sans text-amber-600 dark:text-amber-400">
                  ★ Punto Ideal (Z*)
                </td>
                {solveResult.payoff.ideal_point.map((v, i) => (
                  <td key={i} className="py-2 px-2 text-right text-amber-600 dark:text-amber-300">
                    {fmtNum(v, 2)}
                  </td>
                ))}
              </tr>
              {/* Fila Resumen Nadir */}
              <tr className="bg-rose-500/10 font-bold">
                <td className="py-2 pr-3 font-sans text-rose-600 dark:text-rose-400">
                  ✕ Punto Nadir (Anti-Ideal)
                </td>
                {solveResult.payoff.anti_ideal_point.map((v, i) => (
                  <td key={i} className="py-2 px-2 text-right text-rose-600 dark:text-rose-300">
                    {fmtNum(v, 2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. ACORDEÓN "MODO RAYOS X (L_inf)" PARA SUSTENTACIÓN */}
      <section className="rounded-xl border border-violet-500/30 bg-white dark:bg-slate-900/90 overflow-hidden">
        <button
          type="button"
          onClick={() => setXrayOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left bg-violet-500/5 hover:bg-violet-500/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Microscope className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Modo Rayos X (L∞) — Linealización Minimax para Sustentación
            </span>
          </div>
          <div className="flex items-center gap-2">
            {xrayData?.lambdaVal !== null && xrayData?.lambdaVal !== undefined && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30">
                λ* = {xrayData.lambdaVal.toFixed(4)}
              </span>
            )}
            {xrayOpen ? (
              <ChevronUp className="w-4 h-4 text-violet-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-violet-400" />
            )}
          </div>
        </button>

        {xrayOpen && xrayData && (
          <div className="p-4 border-t border-violet-500/20 space-y-3 text-xs bg-slate-50/70 dark:bg-slate-950/60">
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Para resolver la métrica no lineal{" "}
              <span className="font-mono font-semibold text-violet-500">
                min maxᵢ [ wᵢ · Dᵢ(x) ]
              </span>{" "}
              como un Programa Lineal (o MIP) exacto en HiGHS, se introduce la variable auxiliar{" "}
              <span className="font-mono font-bold">λ ≥ 0</span> que acota superiormente todas las
              desviaciones ponderadas del modelo actual:
            </p>

            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <KatexBlock
                latex={xrayData.headerLatex}
                className="text-slate-900 dark:text-violet-200"
              />
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {xrayData.constraintsLatex.map((cLatex, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-50 dark:bg-slate-950/80 border border-slate-200/70 dark:border-slate-800"
                  >
                    <div className="text-[10px] font-semibold text-slate-400 mb-1">
                      Restricción Minimax #{idx + 1} ({headers[idx]}):
                    </div>
                    <KatexBlock
                      latex={cLatex}
                      className="text-slate-800 dark:text-slate-200 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
