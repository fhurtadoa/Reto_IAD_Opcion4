"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  Box,
  Compass,
  Grid,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Loader2,
  Target,
} from "lucide-react";
import {
  ModelDefinition,
  ParetoPoint,
  SolveResponse,
  SolverStatus,
  ThemeMode,
  DecisionProfile,
  SEMANTIC_COLORS,
} from "./types";
import {
  fmtNum,
  computeFeasiblePolygon2D,
  computeFeasibleObjectivesPolygon2D,
  computeDiscreteFeasiblePoints2D,
  computeIsodistanceTraces2D,
} from "./mathUtils";
import { sensitivityCurves, sensitivityLayout, sensitivitySelection } from "./weightSensitivity";
import MethodGuide from "./MethodGuide";
import SectionHeading from "./SectionHeading";

const Plot = dynamic(async () => {
  const [{ default: createPlot }, { default: plotly }] = await Promise.all([
    import("react-plotly.js/factory"),
    import("plotly.js-dist-min"),
  ]);
  return createPlot(plotly);
}, {
  ssr: false,
  loading: () => (
    <div className="h-[380px] w-full flex items-center justify-center bg-slate-100 dark:bg-slate-900/50 text-slate-400 text-xs rounded-sm font-mono">
      Inicializando motor gráfico Plotly...
    </div>
  ),
});

interface VisualCanvasRightProps {
  workspace: "model" | "results" | "method";
  model: ModelDefinition;
  modelKey: number;
  selectedWeight: number | null;
  decisionProfile: DecisionProfile;
  solveResult: SolveResponse | null;
  solverStatus: SolverStatus;
  solverMessage: string;
  theme: ThemeMode;
}

type ChartTab = "objectives2d" | "objectives3d" | "radar" | "decision2d" | "sensitivity";
type PlotTrace = Record<string, unknown>;

function constantAxis(payoff: SolveResponse["payoff"], index: number) {
  if (payoff.normalization_sources?.[index] !== "constant") return {};
  const center = payoff.ideal_point[index];
  const margin = Math.max(1, Math.abs(center)) * 1e-4;
  return { range: [center - margin, center + margin] };
}

export default function VisualCanvasRight({
  workspace,
  model,
  modelKey,
  selectedWeight,
  decisionProfile,
  solveResult,
  solverStatus,
  solverMessage,
  theme,
}: VisualCanvasRightProps) {
  const [chartTab, setChartTab] = useState<ChartTab>("objectives2d");
  const [showIsodistance, setShowIsodistance] = useState<boolean>(false);
  const [showPareto, setShowPareto] = useState<boolean>(true);
  const [showFeasibleObj, setShowFeasibleObj] = useState<boolean>(true);
  const [paretoExplorerOpen, setParetoExplorerOpen] = useState<boolean>(false);
  const [paretoMetricFilter, setParetoMetricFilter] = useState<"ALL" | "L1" | "L2" | "L_inf">("ALL");
  const [axisX, setAxisX] = useState<number>(0);
  const [axisY, setAxisY] = useState<number>(1);
  const [axis3DX, setAxis3DX] = useState<number>(0);
  const [axis3DY, setAxis3DY] = useState<number>(1);
  const [axis3DZ, setAxis3DZ] = useState<number>(2);
  const [showAllVars, setShowAllVars] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState(false);
  const [exportingPlot, setExportingPlot] = useState(false);
  const plotContainerRef = useRef<HTMLDivElement | null>(null);

  const isDark = theme === "dark";
  const paperBg = isDark ? "#111524" : "#FFFFFF";
  const plotBg = isDark ? "#1E293B" : "#F8FAFC";
  const gridColor = isDark ? "#334155" : "#E2E8F0";
  const textColor = isDark ? "#E2E8F0" : "#0F172A";
  const l2Color = isDark ? "#CBD5E1" : SEMANTIC_COLORS.L2;

  const headers = solveResult?.payoff?.headers || model.objectives.map((o) => o.name);
  const nObjs = headers.length;
  const nVars = model.variables.length;

  // Reiniciar selección de ejes solo cuando cambia el número de objetivos o se carga un modelo/preset nuevo
  useEffect(() => {
    setAxisX(0);
    setAxisY(Math.min(1, Math.max(0, nObjs - 1)));
    setAxis3DX(0);
    setAxis3DY(Math.min(1, Math.max(0, nObjs - 1)));
    setAxis3DZ(Math.min(2, Math.max(0, nObjs - 1)));
    setShowAllVars(false);
    setParetoMetricFilter("ALL");
  }, [nObjs, modelKey]);

  const safeAxisX = axisX < nObjs ? axisX : 0;
  const safeAxisY = axisY < nObjs && axisY !== safeAxisX ? axisY : safeAxisX === 0 ? Math.min(1, nObjs - 1) : 0;

  // Garantizar 3 ejes distintos para el visualizador 3D
  const safe3DX = axis3DX < nObjs ? axis3DX : 0;
  const safe3DY =
    axis3DY < nObjs && axis3DY !== safe3DX
      ? axis3DY
      : [0, 1, 2].find((i) => i < nObjs && i !== safe3DX) ?? 0;
  const safe3DZ =
    axis3DZ < nObjs && axis3DZ !== safe3DX && axis3DZ !== safe3DY
      ? axis3DZ
      : [0, 1, 2, 3].find((i) => i < nObjs && i !== safe3DX && i !== safe3DY) ?? Math.min(2, nObjs - 1);

  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1150px)");
    const update = () => setStacked(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const sweep = solveResult?.weight_sensitivity;
  const sensitivityBase = useMemo(
    () => sweep ? sensitivityCurves(sweep, isDark) : [],
    [sweep, isDark],
  );

  const effectiveTab: ChartTab =
    (chartTab === "objectives3d" || chartTab === "radar") && nObjs < 3
      ? "objectives2d"
      : (chartTab === "sensitivity" && nObjs !== 2) || (chartTab === "decision2d" && nVars !== 2)
      ? "objectives2d"
      : chartTab;

  const chartGuide: Record<ChartTab, [string, string]> = {
    objectives2d: ["Espacio de objetivos", "Ubica el ideal, la frontera aproximada y las soluciones compromiso en dos criterios."],
    objectives3d: ["Explorar tres criterios", "Gira la figura para comparar los compromisos entre los tres ejes."],
    radar: ["Perfil de logro", "Compara el porcentaje de logro por criterio. Cada eje representa un objetivo."],
    decision2d: ["Región de decisiones", "Ubica las cantidades elegidas y contrástalas con la región factible."],
    sensitivity: ["Efecto de los pesos", "Compara cuánto se aleja cada objetivo del ideal al variar la ponderación."],
  };

  const canExportPlot = solverStatus === "optimal" || solverStatus === "partial";

  const handleDownloadPNG = async () => {
    if (!canExportPlot) return;
    const container = plotContainerRef.current;
    if (!container) return;
    const plotEl = container.querySelector(".js-plotly-plot") as HTMLElement | null;
    if (!plotEl) {
      setDownloadError(true);
      return;
    }
    setDownloadError(false);
    setExportingPlot(true);
    try {
      const Plotly = (await import("plotly.js-dist-min")).default;
      const dataUrl = await Plotly.toImage(plotEl, {
        format: "png",
        width: 1200,
        height: effectiveTab === "sensitivity" && stacked ? 1000 : 750,
        scale: 2,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opticompromise_${effectiveTab}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setExportingPlot(false);
    }
  };

  // --- Construcción de datos 2D ---
  const { data2D, layout2D } = useMemo(() => {
    if (!solveResult) return { data2D: [], layout2D: {} };
    const { payoff, solutions, pareto_points = [] } = solveResult;
    const ideal = payoff.ideal_point;
    const nadir = payoff.anti_ideal_point;
    const isPure2D = nObjs === 2;
    const isMixedInt = model.variables.some((v) => v.var_type !== "continuous");

    const senseY2D = model.objectives[safeAxisY]?.sense ?? "maximize";
    const sortedPareto = [...pareto_points].sort((a, b) => {
      const dx = a.objectives[safeAxisX] - b.objectives[safeAxisX];
      if (Math.abs(dx) > 1e-9) return dx;
      return senseY2D === "maximize"
        ? b.objectives[safeAxisY] - a.objectives[safeAxisY]
        : a.objectives[safeAxisY] - b.objectives[safeAxisY];
    });

    const traces: PlotTrace[] = [];

    // 1. Zona Factible proyectada al Espacio de Objetivos (cuando nVars === 2)
    if (showFeasibleObj && nVars === 2) {
      const objPoly = computeFeasibleObjectivesPolygon2D(model, safeAxisX, safeAxisY, payoff);
      if (objPoly) {
        traces.push({
          x: objPoly.x,
          y: objPoly.y,
          mode: "lines",
          type: "scatter",
          fill: "toself",
          fillcolor: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.20)",
          line: {
            color: isDark ? "#64748B" : "#94A3B8",
            width: 1.4,
            dash: isMixedInt ? "dot" : "solid",
          },
          name: isMixedInt ? "Relajación continua" : "Zona factible visible",
          hoverinfo: "name",
        });
      }
    }

    // 2. Caja de referencia Ideal–Nadir (líneas guía)
    const ix = ideal[safeAxisX];
    const iy = ideal[safeAxisY];
    const nx = nadir[safeAxisX];
    const ny = nadir[safeAxisY];
    if (
      Number.isFinite(ix) &&
      Number.isFinite(iy) &&
      Number.isFinite(nx) &&
      Number.isFinite(ny)
    ) {
      traces.push({
        x: [ix, nx, nx, ix, ix],
        y: [iy, iy, ny, ny, iy],
        mode: "lines",
        type: "scatter",
        name: "Caja de referencias de pagos",
        showlegend: false,
        line: { color: isDark ? "#475569" : "#CBD5E1", width: 1.2, dash: "dot" },
        hoverinfo: "name",
      });
    }

    // 3. Frontera Eficiente de Pareto (curva destacada + puntos clasificados por pesos y métricas)
    if (showPareto && sortedPareto.length > 0) {
      const senseX = model.objectives[safeAxisX]?.sense ?? "maximize";
      const senseY = model.objectives[safeAxisY]?.sense ?? "maximize";
      const spanX = payoff.normalization_ranges?.[safeAxisX] || Math.abs(ix - nx) || 1;
      const spanY = payoff.normalization_ranges?.[safeAxisY] || Math.abs(iy - ny) || 1;
      const better = (a: number, b: number, sense: string) =>
        sense === "maximize" ? a >= b - 1e-6 : a <= b + 1e-6;
      const strictlyBetter = (a: number, b: number, sense: string) =>
        sense === "maximize" ? a > b + 1e-6 : a < b - 1e-6;

      // En 3D+ se filtra también por dominancia entre las muestras proyectadas.
      const curveSource = isPure2D
        ? sortedPareto
        : sortedPareto.filter((p) => {
            const px = p.objectives[safeAxisX];
            const py = p.objectives[safeAxisY];
            return !sortedPareto.some((o) => {
              const ox = o.objectives[safeAxisX];
              const oy = o.objectives[safeAxisY];
              return (
                better(ox / spanX, px / spanX, senseX) &&
                better(oy / spanY, py / spanY, senseY) &&
                (strictlyBetter(ox / spanX, px / spanX, senseX) || strictlyBetter(oy / spanY, py / spanY, senseY))
              );
            });
          });

      const curvePts: ParetoPoint[] = [];
      curveSource.forEach((p) => {
        const last = curvePts[curvePts.length - 1];
        if (
          !last ||
          Math.abs(p.objectives[safeAxisX] - last.objectives[safeAxisX]) > 1e-4 * spanX ||
          Math.abs(p.objectives[safeAxisY] - last.objectives[safeAxisY]) > 1e-4 * spanY
        ) {
          curvePts.push(p);
        }
      });

      if (curvePts.length >= 2 && !isMixedInt) {
        traces.push({
          x: curvePts.map((p) => p.objectives[safeAxisX]),
          y: curvePts.map((p) => p.objectives[safeAxisY]),
          mode: "lines",
          type: "scatter",
          name: isPure2D ? "Unión de muestras Pareto" : "Unión de muestras proyectadas",
          line: {
            color: "#E11D48",
            width: isPure2D ? 3.5 : 2.2,
            dash: isPure2D ? "solid" : "dash",
          },
          hoverinfo: "name",
        });
      }

      const paretoMetricGroups = [
        { key: "L1", name: "Pareto L₁", color: SEMANTIC_COLORS.L1, symbol: "triangle-up" },
        { key: "L2", name: "Pareto L₂", color: isDark ? "#94A3B8" : "#64748B", symbol: "circle" },
        { key: "L_inf", name: "Pareto L∞", color: "#E11D48", symbol: "diamond" },
      ];

      paretoMetricGroups.forEach((grp) => {
        const pts = sortedPareto.filter((p) => p.metric === grp.key);
        if (pts.length === 0) return;
        traces.push({
          x: pts.map((p) => p.objectives[safeAxisX]),
          y: pts.map((p) => p.objectives[safeAxisY]),
          mode: "markers",
          type: "scatter",
          name: isMixedInt && isPure2D ? `${grp.name} (Discreto)` : grp.name,
          marker: {
            size: isMixedInt ? 7.5 : 6,
            symbol: grp.symbol,
            color: grp.color,
            line: { width: 1, color: "#FFFFFF" },
            opacity: isMixedInt ? 0.88 : 0.65,
          },
          hoverinfo: "text",
          hovertext: pts.map((p) => {
            const wStr = p.weights.map((w, idx) => `w${idx + 1}=${(w * 100).toFixed(2)}%`).join(", ");
            return `<b>Muestra Pareto (${grp.key === "L_inf" ? "L∞" : grp.key})</b><br>Pesos: ${wStr}<br>${headers[safeAxisX]}: ${fmtNum(p.objectives[safeAxisX])}<br>${headers[safeAxisY]}: ${fmtNum(p.objectives[safeAxisY])}`;
          }),
        });
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
        safeAxisY,
        isDark
      );
      isoTraces.forEach((iso) => {
        traces.push({
          x: iso.x,
          y: iso.y,
          mode: "lines",
          type: "scatter",
          name: nObjs === 2 ? iso.name : `${iso.name} · dos ejes`,
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
      cliponaxis: false,
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
      name: "Nadir aproximado",
      text: ["✕ Nadir aprox."],
      textposition: "bottom center",
      cliponaxis: false,
      textfont: { color: SEMANTIC_COLORS.nadir, size: 11 },
      marker: { symbol: "x", size: 12, color: SEMANTIC_COLORS.nadir, line: { width: 2.5 } },
    });

    // L1, L2, L_inf (agrupar etiquetas si coinciden en el mismo punto para evitar solapamientos)
    const metricDefs = [
      { key: "L1", label: "L₁", name: "L₁ (Compensatoria)", color: SEMANTIC_COLORS.L1, symbol: "square", pos: "top right", size: 13 },
      { key: "L2", label: "L₂", name: "L₂ (Euclidiana)", color: l2Color, symbol: "circle", pos: "bottom right", size: 12 },
      { key: "L_inf", label: "L∞", name: "L∞ (Minimax)", color: SEMANTIC_COLORS.L_inf, symbol: "diamond", pos: "top left", size: 13 },
    ];
    const coordSpanX = payoff.normalization_ranges?.[safeAxisX] || Math.abs((ideal[safeAxisX] ?? 0) - (nadir[safeAxisX] ?? 0)) || 1;
    const coordSpanY = payoff.normalization_ranges?.[safeAxisY] || Math.abs((ideal[safeAxisY] ?? 0) - (nadir[safeAxisY] ?? 0)) || 1;

    metricDefs.forEach((m, idxM) => {
      const sol = solutions[m.key];
      if (!sol || sol.objectives.length <= Math.max(safeAxisX, safeAxisY)) return;
      const sx = sol.objectives[safeAxisX];
      const sy = sol.objectives[safeAxisY];
      const dupEarlier = metricDefs.slice(0, idxM).some((prev) => {
        const ps = solutions[prev.key];
        return (
          ps &&
          Math.abs(ps.objectives[safeAxisX] - sx) < 1e-3 * coordSpanX &&
          Math.abs(ps.objectives[safeAxisY] - sy) < 1e-3 * coordSpanY
        );
      });
      const coLocated = metricDefs
        .filter((other) => {
          const os = solutions[other.key];
          return (
            os &&
            Math.abs(os.objectives[safeAxisX] - sx) < 1e-3 * coordSpanX &&
            Math.abs(os.objectives[safeAxisY] - sy) < 1e-3 * coordSpanY
          );
        })
        .map((o) => o.label);

      traces.push({
        x: [sx],
        y: [sy],
        mode: dupEarlier ? "markers" : "markers+text",
        type: "scatter",
        name: m.name,
        text: dupEarlier ? undefined : [coLocated.join(" = ")],
        textposition: m.pos,
        cliponaxis: false,
        textfont: { color: m.color, size: 12 },
        marker: {
          symbol: m.symbol,
          size: m.size,
          color: m.color,
          line: { color: "#FFFFFF", width: 1.5 },
        },
        hoverinfo: "text",
        hovertext: `<b>${m.name}</b><br>${headers[safeAxisX]}: ${fmtNum(sx)}<br>${headers[safeAxisY]}: ${fmtNum(sy)}<br>D_p: ${sol.aggregate_distance.toFixed(4)}`,
      });
    });

    return {
      data2D: traces,
      layout2D: {
        autosize: true,
        uirevision: modelKey,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: textColor, size: 11 },
        xaxis: { ...constantAxis(payoff, safeAxisX), title: { text: headers[safeAxisX] }, gridcolor: gridColor, zerolinecolor: gridColor, automargin: true },
        yaxis: { ...constantAxis(payoff, safeAxisY), title: { text: headers[safeAxisY] }, gridcolor: gridColor, zerolinecolor: gridColor, automargin: true },
        legend: { orientation: "h", y: -0.25, font: { size: 10 } },
        margin: { l: 64, r: 48, t: 22, b: 84 },
      },
    };
  }, [solveResult, model, safeAxisX, safeAxisY, showIsodistance, showPareto, showFeasibleObj, nVars, isDark, headers, nObjs, paperBg, plotBg, gridColor, textColor, l2Color, modelKey]);

  // --- Construcción de datos 3D ---
  const { data3D, layout3D } = useMemo(() => {
    if (!solveResult || nObjs < 3) return { data3D: [], layout3D: {} };
    const { payoff, solutions, pareto_points = [] } = solveResult;
    const ideal = payoff.ideal_point;
    const nadir = payoff.anti_ideal_point;

    const traces: PlotTrace[] = [];
    if (showPareto && pareto_points.length > 0) {
      const paretoMetricGroups3D = [
        { key: "L1", name: "Pareto L₁", color: SEMANTIC_COLORS.L1, symbol: "diamond" },
        { key: "L2", name: "Pareto L₂", color: isDark ? "#94A3B8" : "#64748B", symbol: "circle" },
        { key: "L_inf", name: "Pareto L∞", color: "#E11D48", symbol: "cross" },
      ];
      paretoMetricGroups3D.forEach((grp) => {
        const pts = pareto_points.filter((p) => p.metric === grp.key);
        if (pts.length === 0) return;
        traces.push({
          x: pts.map((p) => p.objectives[safe3DX]),
          y: pts.map((p) => p.objectives[safe3DY]),
          z: pts.map((p) => p.objectives[safe3DZ]),
          mode: "markers",
          type: "scatter3d",
          name: grp.name,
          marker: { size: 3.5, symbol: grp.symbol, color: grp.color, opacity: 0.35 },
          hoverinfo: "text",
          hovertext: pts.map((p) => {
            const wStr = p.weights.map((w, idx) => `w${idx + 1}=${(w * 100).toFixed(2)}%`).join(", ");
            return `<b>Pareto (${grp.key === "L_inf" ? "L∞" : grp.key})</b><br>Pesos: ${wStr}<br>${headers[safe3DX]}: ${fmtNum(p.objectives[safe3DX])}<br>${headers[safe3DY]}: ${fmtNum(p.objectives[safe3DY])}<br>${headers[safe3DZ]}: ${fmtNum(p.objectives[safe3DZ])}`;
          }),
        });
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
      name: "Nadir aproximado",
      text: ["✕ Nadir aprox."],
      marker: { symbol: "cross", size: 7, color: SEMANTIC_COLORS.nadir },
    });

    [
      { key: "L1", label: "L₁", color: SEMANTIC_COLORS.L1 },
      { key: "L2", label: "L₂", color: l2Color },
      { key: "L_inf", label: "L∞", color: SEMANTIC_COLORS.L_inf },
    ].forEach((m) => {
      const sol = solutions[m.key];
      if (!sol?.objectives.length) return;
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
        uirevision: modelKey,
        paper_bgcolor: paperBg,
        font: { color: textColor, size: 11 },
        scene: {
          bgcolor: plotBg,
          xaxis: { ...constantAxis(payoff, safe3DX), title: { text: headers[safe3DX] }, gridcolor: gridColor },
          yaxis: { ...constantAxis(payoff, safe3DY), title: { text: headers[safe3DY] }, gridcolor: gridColor },
          zaxis: { ...constantAxis(payoff, safe3DZ), title: { text: headers[safe3DZ] }, gridcolor: gridColor },
          camera: { eye: { x: 1.85, y: 1.85, z: 1.45 } },
          domain: { y: [0.08, 1] },
        },
        legend: { orientation: "h", y: -0.05, font: { size: 10 } },
        margin: { l: 0, r: 0, t: 10, b: 10 },
      },
    };
  }, [solveResult, nObjs, safe3DX, safe3DY, safe3DZ, showPareto, headers, isDark, paperBg, plotBg, gridColor, textColor, l2Color, modelKey]);

  // --- Construcción Radar (% Logro) cuando nObjs >= 3 ---
  const { dataRadar, layoutRadar } = useMemo(() => {
    if (!solveResult || nObjs < 3) return { dataRadar: [], layoutRadar: {} };
    const { solutions } = solveResult;
    const closedTheta = [...headers, headers[0]];

    const makeTrace = (key: string, name: string, color: string, fill: string) => {
      const sol = solutions[key];
      if (!sol || !sol.achievement_pct?.length) return null;
      const vals = sol.achievement_pct;
      return {
        type: "scatterpolar",
        r: [...vals, vals[0]],
        theta: closedTheta,
        fill: "toself",
        fillcolor: fill,
        name,
        line: { color, width: 2.2 },
        marker: { size: 6, color },
      };
    };

    const traces = [
      {
        type: "scatterpolar",
        r: Array(closedTheta.length).fill(100),
        theta: closedTheta,
        name: "Ideal (100%)",
        line: { color: SEMANTIC_COLORS.ideal, width: 1.5, dash: "dash" },
        marker: { size: 4, color: SEMANTIC_COLORS.ideal },
      },
      makeTrace("L1", "L₁ (Manhattan)", SEMANTIC_COLORS.L1, "rgba(37, 99, 235, 0.12)"),
      makeTrace("L2", "L₂ (Euclidiana)", l2Color, isDark ? "rgba(203, 213, 225, 0.14)" : "rgba(51, 65, 85, 0.12)"),
      makeTrace("L_inf", "L∞ (Minimax)", SEMANTIC_COLORS.L_inf, "rgba(225, 29, 72, 0.14)"),
    ].filter(Boolean);

    return {
      dataRadar: traces,
      layoutRadar: {
        autosize: true,
        uirevision: modelKey,
        paper_bgcolor: paperBg,
        font: { color: textColor, size: 11 },
        polar: {
          bgcolor: plotBg,
          radialaxis: {
            visible: true,
            range: [Math.min(0, ...Object.values(solutions).flatMap((s) => s.achievement_pct)), 105],
            ticksuffix: "%",
            gridcolor: gridColor,
            linecolor: gridColor,
          },
          angularaxis: { gridcolor: gridColor, linecolor: gridColor },
        },
        legend: { orientation: "h", y: -0.15, font: { size: 10 } },
        margin: { l: 60, r: 60, t: 42, b: 56 },
      },
    };
  }, [solveResult, nObjs, headers, isDark, paperBg, plotBg, gridColor, textColor, l2Color, modelKey]);

  // --- Construcción Espacio de Decisiones 2D ---
  const { dataDec, layoutDec } = useMemo(() => {
    if (!solveResult || nVars !== 2) return { dataDec: [], layoutDec: {} };
    const v0 = model.variables[0].name;
    const v1 = model.variables[1].name;
    const poly = computeFeasiblePolygon2D(model, solveResult.payoff);
    const discretePts = computeDiscreteFeasiblePoints2D(model, solveResult.payoff);
    const isMixedInt = model.variables.some((v) => v.var_type !== "continuous");
    const traces: PlotTrace[] = [];

    if (poly) {
      traces.push({
        x: poly.x,
        y: poly.y,
        fill: "toself",
        fillcolor: isDark ? "rgba(15, 118, 110, 0.14)" : "rgba(15, 118, 110, 0.10)",
        line: { color: SEMANTIC_COLORS.pareto, width: isMixedInt ? 1.5 : 2, dash: isMixedInt ? "dot" : "solid" },
        mode: "lines+markers",
        marker: { size: 3, color: SEMANTIC_COLORS.pareto },
        type: "scatter",
        name: isMixedInt ? "Relajación continua" : "Región factible visible",
      });
    }

    if (discretePts) {
      traces.push({
        x: discretePts.x,
        y: discretePts.y,
        mode: "markers",
        type: "scatter",
        name: "Muestra de puntos enteros factibles",
        marker: { size: 5.5, color: isDark ? "#38BDF8" : "#111524", opacity: 0.8 },
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

    const decSpanX = poly && poly.x.length ? Math.max(1e-6, Math.max(...poly.x) - Math.min(...poly.x)) : 1;
    const decSpanY = poly && poly.y.length ? Math.max(1e-6, Math.max(...poly.y) - Math.min(...poly.y)) : 1;
    const decMetricDefs = [
      { key: "L1", label: "L₁", color: SEMANTIC_COLORS.L1, symbol: "square", pos: "top right" },
      { key: "L2", label: "L₂", color: l2Color, symbol: "circle", pos: "bottom right" },
      { key: "L_inf", label: "L∞", color: SEMANTIC_COLORS.L_inf, symbol: "diamond", pos: "top left" },
    ];
    decMetricDefs.forEach((m, idxM) => {
      const sol = solveResult.solutions[m.key];
      if (!sol) return;
      const sx = sol.variables[v0];
      const sy = sol.variables[v1];
      const dupEarlier = decMetricDefs.slice(0, idxM).some((prev) => {
        const ps = solveResult.solutions[prev.key];
        return (
          ps &&
          Math.abs(ps.variables[v0] - sx) < 1e-3 * decSpanX &&
          Math.abs(ps.variables[v1] - sy) < 1e-3 * decSpanY
        );
      });
      const coLocated = decMetricDefs
        .filter((other) => {
          const os = solveResult.solutions[other.key];
          return (
            os &&
            Math.abs(os.variables[v0] - sx) < 1e-3 * decSpanX &&
            Math.abs(os.variables[v1] - sy) < 1e-3 * decSpanY
          );
        })
        .map((o) => o.label);

      traces.push({
        x: [sx],
        y: [sy],
        mode: dupEarlier ? "markers" : "markers+text",
        type: "scatter",
        name: `Solución ${m.label}`,
        text: dupEarlier ? undefined : [`${coLocated.join(" = ")} (${fmtNum(sx, 1)}, ${fmtNum(sy, 1)})`],
        textposition: m.pos,
        cliponaxis: false,
        textfont: { color: m.color, size: 11 },
        marker: { symbol: m.symbol, size: 13, color: m.color, line: { color: "#FFFFFF", width: 1.5 } },
      });
    });

    return {
      dataDec: traces,
      layoutDec: {
        autosize: true,
        uirevision: modelKey,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: textColor, size: 11 },
        xaxis: { title: { text: v0 }, gridcolor: gridColor, zerolinecolor: gridColor },
        yaxis: { title: { text: v1 }, gridcolor: gridColor, zerolinecolor: gridColor },
        legend: { orientation: "h", y: -0.22, font: { size: 10 } },
        margin: { l: 58, r: 48, t: 22, b: 68 },
      },
    };
  }, [solveResult, model, nVars, isDark, paperBg, plotBg, gridColor, textColor, l2Color, modelKey]);

  // Estado vacío o error inicial (si ya existe solveResult previo, mantenemos el contexto con banner arriba)
  const hasActiveError =
    solverStatus === "infeasible" || solverStatus === "unbounded" || solverStatus === "error";

  if (hasActiveError && !solveResult) {
    return (
      <main className="workspace-output min-w-0 flex items-start justify-center py-6">
        <div className="max-w-lg w-full rounded-sm border border-[#E11D48] bg-white dark:bg-slate-900 p-6 space-y-3 shadow-sm">
          <div className="flex items-center gap-3 text-[#E11D48]">
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
                Revisa el detalle del motor y ajusta el modelo.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-sm bg-rose-500/10 border border-rose-500/20 font-mono text-xs text-[#E11D48] dark:text-rose-300 break-words">
            {solverMessage}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Revisa las restricciones, sentidos (≤, ≥, =) o cotas de variables en Formular.
          </p>
        </div>
      </main>
    );
  }

  if (!solveResult) {
    return (
      <main className="workspace-output min-w-0 flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-[#E11D48]" />
          <span className="text-xs font-mono">Conectando con motor FastAPI (HiGHS / SLSQP)...</span>
        </div>
      </main>
    );
  }

  const solL1 = solveResult.solutions.L1;
  const solL2 = solveResult.solutions.L2;
  const solLinf = solveResult.solutions.L_inf;
  const degenerateObjs = solveResult.payoff.degenerate_objectives || [];

  return (
    <main className="workspace-output min-w-0 space-y-4">
      <p className="results-status text-xs text-slate-600 dark:text-slate-300" role="status">
        {solverStatus === "calculating"
          ? "Calculando · Se muestra el último resultado"
          : solverStatus === "partial" ? solverMessage : ""}
      </p>
      {hasActiveError && (
        <div className="rounded-sm border-2 border-[#E11D48] bg-rose-50 dark:bg-rose-950/50 px-4 py-3 flex items-start gap-3 text-xs text-rose-900 dark:text-rose-100">
          <AlertOctagon className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="font-bold">
              {solverStatus === "infeasible"
                ? "Edición actual infactible — mostrando último resultado válido debajo"
                : solverStatus === "unbounded"
                ? "Edición actual no acotada — mostrando último resultado válido debajo"
                : "Error pendiente en la edición actual — mostrando último resultado válido debajo"}
            </div>
            <div className="font-mono text-[11px] break-words text-[#E11D48] dark:text-rose-300">
              {solverMessage}
            </div>
          </div>
        </div>
      )}

      {degenerateObjs.length > 0 && (
        <div className="rounded-sm border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-[11px] text-amber-900 dark:text-amber-200">
          <b>Objetivos con rango observado nulo:</b>{" "}
          {degenerateObjs.map((idx) => headers[idx] || `Z${idx + 1}`).join(", ")}. Los valores observados se conservan. Consulta el tratamiento de cada criterio en Ver método.
        </div>
      )}

      <div hidden={workspace !== "results"} className="space-y-4">
      {/* 1. GRÁFICO PRINCIPAL INTERACTIVO */}
      <section className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden" id="grafico-resultados" aria-labelledby="grafico-titulo">
        <div className="chart-intro px-4 py-3">
          <SectionHeading id="grafico-titulo" title={chartGuide[effectiveTab][0]} cue={chartGuide[effectiveTab][1]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          {/* Pestañas de vista gráfica */}
          <div className="chart-tabs flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setChartTab("objectives2d")}
              aria-pressed={effectiveTab === "objectives2d"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Objetivos 2D</span>
            </button>

            {nObjs === 2 && (
              <button type="button" aria-pressed={effectiveTab === "sensitivity"}
                onClick={() => setChartTab("sensitivity")}
                className="px-2.5 py-1 rounded-sm text-xs font-semibold">
                Sensibilidad de pesos
              </button>
            )}
            {nObjs >= 3 && (
              <>
                <button
                  type="button"
                  onClick={() => setChartTab("objectives3d")}
                  aria-pressed={effectiveTab === "objectives3d"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Espacio 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab("radar")}
                  aria-pressed={effectiveTab === "radar"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Radar (% Logro)</span>
                </button>
              </>
            )}

            {nVars === 2 && (
              <button
                type="button"
                onClick={() => setChartTab("decision2d")}
                aria-pressed={effectiveTab === "decision2d"}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Región Factible ({model.variables[0].name} vs {model.variables[1].name})</span>
              </button>
            )}
          </div>

          {/* Controles del gráfico */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
            {(effectiveTab === "objectives2d" || effectiveTab === "objectives3d") && (
              <>
                {effectiveTab === "objectives2d" && nVars === 2 && (
                  <label htmlFor="toggle-feasible-obj" className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                    <input
                      id="toggle-feasible-obj"
                      name="toggle-feasible-obj"
                      type="checkbox"
                      checked={showFeasibleObj}
                      onChange={(e) => setShowFeasibleObj(e.target.checked)}
                      className="accent-[#E11D48] rounded-sm"
                    />
                    <span>Zona Factible</span>
                  </label>
                )}
                {effectiveTab === "objectives2d" && (
                  <label htmlFor="toggle-isodistance" className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                    <input
                      id="toggle-isodistance"
                      name="toggle-isodistance"
                      type="checkbox"
                      checked={showIsodistance}
                      onChange={(e) => setShowIsodistance(e.target.checked)}
                      className="accent-[#E11D48] rounded-sm"
                    />
                    <span>Curvas Isodistancia</span>
                  </label>
                )}
                <label htmlFor="toggle-pareto" className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                  <input
                    id="toggle-pareto"
                    name="toggle-pareto"
                    type="checkbox"
                    checked={showPareto}
                    onChange={(e) => setShowPareto(e.target.checked)}
                    className="accent-[#E11D48] rounded-sm"
                  />
                  <span>Frontera Pareto</span>
                </label>
              </>
            )}

            {effectiveTab === "objectives2d" && nObjs > 2 && (
              <div className="grid min-w-0 w-full gap-1 sm:flex sm:flex-wrap">
                <select
                  id="axis-x-select"
                  name="axis-x"
                  value={safeAxisX}
                  aria-label="Objetivo del eje X"
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next === safeAxisY) setAxisY(safeAxisX);
                    setAxisX(next);
                  }}
                  className="min-w-0 max-w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>X: {h}</option>
                  ))}
                </select>
                <select
                  id="axis-y-select"
                  name="axis-y"
                  value={safeAxisY}
                  aria-label="Objetivo del eje Y"
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next === safeAxisX) setAxisX(safeAxisY);
                    setAxisY(next);
                  }}
                  className="min-w-0 max-w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>Y: {h}</option>
                  ))}
                </select>
              </div>
            )}

            {effectiveTab === "objectives3d" && nObjs > 3 && (
              <div className="grid min-w-0 w-full gap-1 sm:flex sm:flex-wrap">
                <select
                  id="axis-3dx-select"
                  name="axis-3dx"
                  value={safe3DX}
                  aria-label="Objetivo del eje X 3D"
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next === safe3DY) setAxis3DY(safe3DX);
                    else if (next === safe3DZ) setAxis3DZ(safe3DX);
                    setAxis3DX(next);
                  }}
                  className="min-w-0 max-w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>X: {h}</option>)}
                </select>
                <select
                  id="axis-3dy-select"
                  name="axis-3dy"
                  value={safe3DY}
                  aria-label="Objetivo del eje Y 3D"
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next === safe3DX) setAxis3DX(safe3DY);
                    else if (next === safe3DZ) setAxis3DZ(safe3DY);
                    setAxis3DY(next);
                  }}
                  className="min-w-0 max-w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>Y: {h}</option>)}
                </select>
                <select
                  id="axis-3dz-select"
                  name="axis-3dz"
                  value={safe3DZ}
                  aria-label="Objetivo del eje Z 3D"
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (next === safe3DX) setAxis3DX(safe3DZ);
                    else if (next === safe3DY) setAxis3DY(safe3DZ);
                    setAxis3DZ(next);
                  }}
                  className="min-w-0 max-w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px]"
                >
                  {headers.map((h, i) => <option key={i} value={i}>Z: {h}</option>)}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadPNG}
              disabled={!canExportPlot || exportingPlot || (effectiveTab === "sensitivity" && !sweep)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors font-semibold"
              title="Descargar gráfico actual en alta resolución PNG"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{exportingPlot ? "Generando PNG…" : "PNG"}</span>
            </button>
          </div>
        </div>

        {(effectiveTab === "decision2d" || (effectiveTab === "objectives2d" && showFeasibleObj)) &&
          solveResult.payoff.decision_ranges_2d?.some(([lo, hi]) => lo === null || hi === null) && (
          <p className="px-4 pt-2 text-xs text-slate-600 dark:text-slate-300">La región se muestra recortada en los ejes sin cota finita confirmada.</p>
        )}
        {downloadError && <p role="alert" className="px-4 py-2 text-xs text-rose-700 dark:text-rose-300">No se pudo exportar el gráfico. Vuelve a intentarlo cuando termine de dibujarse.</p>}
        {workspace === "results" && <div ref={plotContainerRef} className="plot-frame p-2">
          <p className="sr-only">Consulta los valores accesibles en la tabla de comparación de soluciones.</p>
          {effectiveTab === "sensitivity" && (sweep ? (() => {
            const selection = sensitivitySelection(solveResult, selectedWeight, isDark);
            const partial = [...sweep.l1, ...sweep.l2, ...sweep.l_inf].some(point => point.status !== "optimal");
            return (
              <div className="min-w-0">
                <p className="px-3 py-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  Peso de {sweep.objective_name}. La línea punteada indica w₁ seleccionado. Los marcadores grandes muestran el último cálculo resuelto.
                  Los tramos conectan muestras. En L₁ puede haber saltos y óptimos alternativos.
                  {partial && " El barrido incluye resultados factibles sin certificado o muestras sin solución."}
                </p>
                <Plot data={[...sensitivityBase, ...selection.traces]}
                  layout={{ ...sensitivityLayout(stacked, isDark), shapes: selection.shapes, uirevision: `${modelKey}-${stacked}` }}
                  config={{ displayModeBar: false, responsive: true }} useResizeHandler
                  style={{ width: "100%" }} />
              </div>
            );
          })() : <p role="status" className="p-5 text-sm">El barrido de sensibilidad no está disponible para este cálculo.</p>)}
          {effectiveTab === "objectives2d" && (
            <Plot
              data={data2D}
              layout={layout2D}
              config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ["sendDataToCloud", "toImage", "select2d", "lasso2d"] }}
              useResizeHandler
              style={{ width: "100%", height: "clamp(320px, 46vw, 470px)" }}
            />
          )}
          {effectiveTab === "objectives3d" && (
            <Plot
              data={data3D}
              layout={layout3D}
              config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ["sendDataToCloud", "toImage", "select2d", "lasso2d"] }}
              useResizeHandler
              style={{ width: "100%", height: "clamp(340px, 46vw, 470px)" }}
            />
          )}
          {effectiveTab === "radar" && (
            <Plot
              data={dataRadar}
              layout={layoutRadar}
              config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ["sendDataToCloud", "toImage", "select2d", "lasso2d"] }}
              useResizeHandler
              style={{ width: "100%", height: "clamp(340px, 46vw, 470px)" }}
            />
          )}
          {effectiveTab === "decision2d" && (
            <Plot
              data={dataDec}
              layout={layoutDec}
              config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ["sendDataToCloud", "toImage", "select2d", "lasso2d"] }}
              useResizeHandler
              style={{ width: "100%", height: "clamp(320px, 46vw, 470px)" }}
            />
          )}
        </div>}

        {/* Explorador de Puntos de la Frontera Eficiente (Pesos × Métricas) */}
        {effectiveTab !== "sensitivity" && (() => {
          const allPareto = solveResult.pareto_points || [];
          const countL1 = allPareto.filter((p) => p.metric === "L1").length;
          const countL2 = allPareto.filter((p) => p.metric === "L2").length;
          const countLinf = allPareto.filter((p) => p.metric === "L_inf").length;
          const filteredPts =
            paretoMetricFilter === "ALL"
              ? allPareto
              : allPareto.filter((p) => p.metric === paretoMetricFilter);

          return (
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setParetoExplorerOpen((prev) => !prev)}
                className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Aproximación de Pareto ({allPareto.length} puntos)
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-[#2563EB]/10 text-[#2563EB] dark:text-blue-400 font-mono font-semibold">
                    L₁: {countL1}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold">
                    L₂: {countL2}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-[#E11D48]/10 text-[#E11D48] font-mono font-semibold">
                    L∞: {countLinf}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                  <span>{paretoExplorerOpen ? "Ocultar detalle" : "Ver pesos y métricas"}</span>
                  {paretoExplorerOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>

              {paretoExplorerOpen && (
                <div className="px-4 pb-3 pt-1 space-y-2 border-t border-slate-200/70 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <p className="text-slate-500 dark:text-slate-400">
                      Puntos no dominados entre las soluciones del barrido de pesos. La línea conecta muestras como guía visual. El estado del solver corresponde a la métrica de cada punto.
                    </p>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: "ALL", label: `Todos (${allPareto.length})` },
                          { id: "L1", label: `L₁ (${countL1})` },
                          { id: "L2", label: `L₂ (${countL2})` },
                          { id: "L_inf", label: `L∞ (${countLinf})` },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setParetoMetricFilter(tab.id)}
                          className={`px-2 py-0.5 rounded-sm font-mono font-semibold border transition-colors ${
                            paretoMetricFilter === tab.id
                              ? "bg-[#E11D48] text-white border-[#E11D48]"
                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-[#E11D48]"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-sm bg-white dark:bg-slate-900">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 text-right">
                        <tr>
                          <th className="py-1.5 px-2 text-left w-10">#</th>
                          <th className="py-1.5 px-2 text-left">Métrica</th>
                          <th className="py-1.5 px-2 text-left">Pesos (wᵢ)</th>
                          <th className="py-1.5 px-2 text-left">Estado</th>
                          {headers.map((h, i) => (
                            <th key={i} className="py-1.5 px-2 max-w-[120px] truncate" title={h}>
                              Z{i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {filteredPts.map((pt, idx) => {
                          const badgeClass =
                            pt.metric === "L1"
                              ? "bg-[#2563EB]/10 text-[#2563EB] dark:text-blue-400"
                              : pt.metric === "L_inf"
                              ? "bg-[#E11D48]/10 text-[#E11D48]"
                              : "bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
                          return (
                            <tr
                              key={`${pt.metric}-${idx}`}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            >
                              <td className="py-1 px-2 text-left text-slate-400">{idx + 1}</td>
                              <td className="py-1 px-2 text-left">
                                <span className={`inline-block px-1.5 py-0.5 rounded-sm font-bold ${badgeClass}`}>
                                  {pt.metric === "L_inf" ? "L∞" : pt.metric}
                                </span>
                              </td>
                              <td className="py-1 px-2 text-left text-slate-600 dark:text-slate-300">
                                [{pt.weights.map((w) => `${(w * 100).toFixed(2)}%`).join(", ")}]
                              </td>
                              <td className="py-1 px-2 text-left">{pt.status === "feasible_suboptimal" ? "Factible sin certificado" : pt.status === "optimal" ? "Óptimo de la métrica" : "—"}</td>
                              {pt.objectives.map((val, k) => (
                                <td key={k} className="py-1 px-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                                  {fmtNum(val)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Recomendación Analítica según el Perfil del Decisor */}
      <div className="rounded-sm border border-slate-200 dark:border-slate-800 border-l-4 border-l-[#E11D48] bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
        <Target className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="font-bold text-slate-900 dark:text-white mr-1.5">
            Cómo leer el compromiso
          </span>
          {decisionProfile === "equitativo" && (
            <>Con pesos iguales, <b>L∞</b> reduce la mayor brecha al ideal. Las brechas ponderadas de los criterios con restricciones minimax activas coinciden.</>
          )}
          {decisionProfile === "compensatorio" && (
            <><b>L₁</b> minimiza la suma de brechas ponderadas. Con 70% para el primer objetivo, mejorar ese criterio tiene mayor influencia.</>
          )}
          {decisionProfile === "moderado" && (
            <><b>L₂</b> eleva al cuadrado las brechas después de multiplicarlas por sus pesos.</>
          )}
          {decisionProfile === "personalizado" && (
            <>Usa el porcentaje de logro por objetivo para identificar qué mejora y qué cede en cada solución. Cada distancia responde a la fórmula de su propia columna.</>
          )}
        </p>
      </div>

      {solverStatus === "partial" && (
        <div className="rounded-sm border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-[11px] text-amber-900 dark:text-amber-200">
          <b>{solverMessage}</b>
          <ul className="mt-1">
            {Object.values(solveResult.solutions).filter((s) => s.status !== "optimal").map((s) => (
              <li key={s.metric}>{s.metric.replace("L_inf", "L∞")}: {s.status === "feasible_suboptimal" ? "Solución factible sin certificado de optimalidad." : "No hay una solución disponible."}</li>
            ))}
          </ul>
        </div>
      )}
      {/* 2. TABLA UNIFICADA: SOLUCIONES COMPROMISO (VALORES, % LOGRO Y DISTANCIA D_p) */}
      <section className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <SectionHeading title="Comparación de soluciones"
          cue="Compara el valor y el logro de cada objetivo en las tres soluciones." />
        <div className="overflow-x-auto cockpit-scroll" role="region" aria-label="Datos de las soluciones" tabIndex={0}>
          <table className="data-table w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <th className="text-left py-2 pr-3 font-semibold">Criterio / Métrica</th>
                <th className="text-center py-2 px-2 font-semibold">Peso (wᵢ)</th>
                <th className="text-right py-2 px-3 font-bold text-[#2563EB] dark:text-blue-400">L₁ (Manhattan)</th>
                <th className="text-right py-2 px-3 font-bold text-slate-800 dark:text-slate-200">L₂ (Euclidiana)</th>
                <th className="text-right py-2 pl-3 font-bold text-[#E11D48]">L∞ (Minimax)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              <tr className="bg-slate-50 dark:bg-slate-800/40">
                <td className="py-2 pr-3 font-sans font-bold text-slate-800 dark:text-slate-100">
                  Distancia Agregada Dₚ al Ideal
                </td>
                <td className="py-2 px-2 text-center text-[11px] text-slate-500">
                  Σw = {(solveResult.weights.reduce((a, b) => a + b, 0)).toFixed(2)}
                </td>
                <td className="py-2 px-3 text-right text-[#2563EB] dark:text-blue-400 font-bold text-sm">
                  {solL1.objectives.length ? solL1.aggregate_distance.toFixed(4) : "—"}
                </td>
                <td className="py-2 px-3 text-right text-slate-900 dark:text-slate-100 font-bold text-sm">
                  {solL2.objectives.length ? solL2.aggregate_distance.toFixed(4) : "—"}
                </td>
                <td className="py-2 pl-3 text-right text-[#E11D48] font-bold text-sm">
                  {solLinf.objectives.length ? solLinf.aggregate_distance.toFixed(4) : "—"}
                </td>
              </tr>

              {headers.map((h, i) => {
                const wPct = ((solveResult.weights[i] ?? 0) * 100).toFixed(0);
                const cols = [
                  { sol: solL1, bar: "bg-[#2563EB]", text: "text-[#2563EB] dark:text-blue-400" },
                  { sol: solL2, bar: "bg-[#334155] dark:bg-slate-400", text: "text-slate-800 dark:text-slate-200" },
                  { sol: solLinf, bar: "bg-[#E11D48]", text: "text-[#E11D48]" },
                ];
                return (
                  <tr key={`obj-${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 pr-3 font-sans">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        Z{i + 1}: {h}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {model.objectives[i]?.sense === "maximize" ? "▲ Maximizar" : "▼ Minimizar"}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-1.5 py-0.5 rounded-sm bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold">
                        {wPct}%
                      </span>
                    </td>
                    {cols.map((col, cIdx) => {
                      const pct = col.sol.achievement_pct[i];
                      return (
                        <td key={cIdx} className={`py-2.5 ${cIdx === 2 ? "pl-3" : "px-3"} text-right align-top`}>
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {fmtNum(col.sol?.objectives[i], 2)}
                          </div>
                          {pct !== undefined && <div className="mt-1 flex items-center justify-end gap-2">
                            <div className="w-16 sm:w-20 h-1.5 bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div className={`h-full ${col.bar} transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                            </div>
                            <span className={`text-[10px] font-bold tabular-nums w-11 text-right ${col.text}`}>
                              {fmtNum(pct, 1)}%
                            </span>
                          </div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. SECCIÓN EXPLÍCITA: DECISIONES ÓPTIMAS POR VARIABLE (VECTOR x*) */}
      <section className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading title="Valores de las variables"
            cue="Consulta las cantidades que tendrías que aplicar en cada solución." />
          {model.variables.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllVars((s) => !s)}
              className="text-[11px] font-bold text-[#E11D48] hover:underline cursor-pointer"
            >
              {showAllVars ? "Mostrar resumen (6)" : `Ver todas las ${model.variables.length} variables`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto cockpit-scroll" role="region" aria-label="Variables por métrica" tabIndex={0}>
          <table className="data-table w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <th className="text-left py-2 pr-3 font-semibold">Variable</th>
                <th className="text-center py-2 px-2 font-semibold">Tipo / Dominio</th>
                <th className="text-right py-2 px-3 font-bold text-[#2563EB] dark:text-blue-400">L₁ (x*)</th>
                <th className="text-right py-2 px-3 font-bold text-slate-800 dark:text-slate-200">L₂ (x*)</th>
                <th className="text-right py-2 pl-3 font-bold text-[#E11D48]">L∞ (x*)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {(showAllVars ? model.variables : model.variables.slice(0, 6)).map((v) => {
                const typeLabel =
                  v.var_type === "binary" ? "Binaria {0,1}" : v.var_type === "integer" ? "Entera ℤ" : "Continua ℝ";
                const boundsLabel =
                  v.var_type === "binary"
                    ? "[0, 1]"
                    : `[${v.lower_bound ?? "-∞"}, ${v.upper_bound ?? "+∞"}]`;
                return (
                  <tr key={`var-sec-${v.name}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-1.5 pr-3 font-semibold text-slate-800 dark:text-slate-100">
                      {v.name}
                    </td>
                    <td className="py-1.5 px-2 text-center font-sans text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium mr-1">
                        {typeLabel}
                      </span>
                      <span className="font-mono">{boundsLabel}</span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-[#2563EB] dark:text-blue-400">
                      {fmtNum(solL1?.variables[v.name], 3)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {fmtNum(solL2?.variables[v.name], 3)}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-bold text-[#E11D48]">
                      {fmtNum(solLinf?.variables[v.name], 3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      </div>
      {workspace === "method" && <MethodGuide model={model} result={solveResult} />}
    </main>
  );
}
