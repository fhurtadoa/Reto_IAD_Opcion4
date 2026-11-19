"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Info, HelpCircle, Layers, Eye, Compass, BarChart3, Box } from "lucide-react";

// Dynamic import para evitar problemas de SSR con Plotly.js
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full flex items-center justify-center bg-zinc-950 text-zinc-400 text-xs rounded-xl font-mono">
      Cargando visualizador interactivo Plotly...
    </div>
  )
});

interface InteractiveChartsProps {
  solveResult: any;
  currentModel: any;
}

export default function InteractiveCharts({ solveResult, currentModel }: InteractiveChartsProps) {
  if (!solveResult || !solveResult.payoff) return null;

  const headers = solveResult.payoff.headers || [];
  const n_objs = headers.length;
  const n_vars = currentModel.variables.length;

  // Estado para selección dinámica de ejes en la proyección 2D
  const [axisX, setAxisX] = useState<number>(0);
  const [axisY, setAxisY] = useState<number>(1);
  const [showParetoCloud, setShowParetoCloud] = useState<boolean>(true);

  // Estado para selección dinámica de ejes en la proyección 3D (cuando n_objs >= 3)
  const [axis3DX, setAxis3DX] = useState<number>(0);
  const [axis3DY, setAxis3DY] = useState<number>(1);
  const [axis3DZ, setAxis3DZ] = useState<number>(n_objs >= 4 ? 3 : 2); // En la flota toma Seguridad (idx 3) o idx 2

  // Asegurar que los índices 2D sean válidos
  const safeAxisX = axisX < n_objs ? axisX : 0;
  const safeAxisY = (axisY < n_objs && axisY !== safeAxisX) ? axisY : (safeAxisX === 0 ? 1 : 0);

  const hX = headers[safeAxisX] || "Z1";
  const hY = headers[safeAxisY] || "Z2";

  // Asegurar que los índices 3D sean válidos
  const safe3DX = axis3DX < n_objs ? axis3DX : 0;
  const safe3DY = axis3DY < n_objs ? axis3DY : 1;
  const safe3DZ = axis3DZ < n_objs ? axis3DZ : (n_objs >= 3 ? 2 : 0);

  const h3DX = headers[safe3DX] || "Z1";
  const h3DY = headers[safe3DY] || "Z2";
  const h3DZ = headers[safe3DZ] || "Z3";

  // Extraer puntos compromiso
  const solL1 = solveResult.solutions.L1;
  const solL2 = solveResult.solutions.L2;
  const solLinf = solveResult.solutions.L_inf;

  const ideal = solveResult.payoff.ideal_point;
  const antiIdeal = solveResult.payoff.anti_ideal_point;

  // Extraer frontera de Pareto
  const is2D = n_objs === 2;
  const paretoPts = solveResult.pareto_points || [];

  // Para 2 objetivos ordenamos estrictamente por X para trazar una curva suave sin zig-zags.
  // Para 3 o más objetivos NUNCA conectamos con líneas (es una nube de dispersión en proyección).
  const sortedPareto = is2D
    ? [...paretoPts].sort((a: any, b: any) => a.objectives[safeAxisX] - b.objectives[safeAxisX])
    : paretoPts;

  const paretoX = sortedPareto.map((p: any) => p.objectives[safeAxisX]);
  const paretoY = sortedPareto.map((p: any) => p.objectives[safeAxisY]);

  const pareto3DX = sortedPareto.map((p: any) => p.objectives[safe3DX]);
  const pareto3DY = sortedPareto.map((p: any) => p.objectives[safe3DY]);
  const pareto3DZ = sortedPareto.map((p: any) => p.objectives[safe3DZ]);

  // 1. Gráfico 2D en el Espacio de Objetivos
  const data2D: any[] = [
    // Frontera de Pareto
    paretoPts.length > 0 && showParetoCloud && {
      x: paretoX,
      y: paretoY,
      mode: is2D ? "lines+markers" : "markers",
      type: "scatter",
      name: is2D ? "Frontera de Pareto Continua" : "Muestras de la Frontera (Nube de Puntos)",
      line: is2D ? { color: "#10b981", width: 2.5 } : undefined,
      marker: {
        size: is2D ? 6 : 5,
        color: "#10b981",
        opacity: is2D ? 0.9 : 0.5
      },
      hoverinfo: "text",
      hovertext: sortedPareto.map(
        (p: any) =>
          `<b>Punto Eficiente</b><br>${hX}: ${p.objectives[safeAxisX].toLocaleString(undefined, { maximumFractionDigits: 1 })}<br>${hY}: ${p.objectives[safeAxisY].toLocaleString(undefined, { maximumFractionDigits: 1 })}`
      )
    },
    // Punto Ideal
    {
      x: [ideal[safeAxisX]],
      y: [ideal[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "Punto Ideal (Z*)",
      text: ["★ Ideal"],
      textposition: "top center",
      marker: { symbol: "star", size: 18, color: "#f59e0b", line: { color: "#b45309", width: 1.5 } }
    },
    // Punto Anti-Ideal (Nadir)
    {
      x: [antiIdeal[safeAxisX]],
      y: [antiIdeal[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "Anti-Ideal (Nadir)",
      text: ["✕ Nadir"],
      textposition: "bottom center",
      marker: { symbol: "x", size: 13, color: "#ef4444", line: { width: 2.5 } }
    },
    // L1
    solL1 && {
      x: [solL1.objectives[safeAxisX]],
      y: [solL1.objectives[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "L1 (Manhattan)",
      text: ["L1"],
      textposition: "top right",
      marker: { symbol: "square", size: 14, color: "#3b82f6" },
      hoverinfo: "text",
      hovertext: `<b>L1 (Manhattan)</b><br>${hX}: ${solL1.objectives[safeAxisX].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>${hY}: ${solL1.objectives[safeAxisY].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>Distancia Lp: ${solL1.aggregate_distance.toFixed(4)}`
    },
    // L2
    solL2 && {
      x: [solL2.objectives[safeAxisX]],
      y: [solL2.objectives[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "L2 (Euclidiana)",
      text: ["L2"],
      textposition: "bottom right",
      marker: { symbol: "circle", size: 14, color: "#10b981" },
      hoverinfo: "text",
      hovertext: `<b>L2 (Euclidiana)</b><br>${hX}: ${solL2.objectives[safeAxisX].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>${hY}: ${solL2.objectives[safeAxisY].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>Distancia Lp: ${solL2.aggregate_distance.toFixed(4)}`
    },
    // L_inf
    solLinf && {
      x: [solLinf.objectives[safeAxisX]],
      y: [solLinf.objectives[safeAxisY]],
      mode: "markers+text",
      type: "scatter",
      name: "L_inf (Minimax)",
      text: ["L_inf"],
      textposition: "top left",
      marker: { symbol: "diamond", size: 15, color: "#a855f7" },
      hoverinfo: "text",
      hovertext: `<b>L_inf (Minimax Equitativo)</b><br>${hX}: ${solLinf.objectives[safeAxisX].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>${hY}: ${solLinf.objectives[safeAxisY].toLocaleString(undefined, { maximumFractionDigits: 2 })}<br>Distancia Lp: ${solLinf.aggregate_distance.toFixed(4)}`
    }
  ].filter(Boolean);

  const layout2D: any = {
    title: {
      text: is2D
        ? `Espacio de Objetivos (Z1 vs Z2) — Frontera de Pareto y Soluciones Compromiso`
        : `Espacio de Objetivos: Proyección 2D (${hX} vs ${hY})`,
      font: { size: 13, color: "#18181b" }
    },
    xaxis: { title: hX, zeroline: true, gridcolor: "#e4e4e7", automargin: true },
    yaxis: { title: hY, zeroline: true, gridcolor: "#e4e4e7", automargin: true },
    autosize: true,
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#fafafa",
    legend: { orientation: "h", y: -0.22 },
    margin: { l: 70, r: 40, t: 40, b: 70 }
  };

  // 2. Gráfico 3D (cuando hay 3 o más objetivos)
  const data3D: any[] = n_objs >= 3 ? [
    showParetoCloud && paretoPts.length > 0 && {
      x: pareto3DX,
      y: pareto3DY,
      z: pareto3DZ,
      mode: "markers",
      type: "scatter3d",
      name: "Frontera Pareto 3D (Nube)",
      marker: { size: 4.5, color: "#10b981", opacity: 0.65 },
      hoverinfo: "text",
      hovertext: sortedPareto.map(
        (p: any) =>
          `<b>Punto Eficiente</b><br>${h3DX}: ${p.objectives[safe3DX]?.toLocaleString(undefined, { maximumFractionDigits: 1 })}<br>${h3DY}: ${p.objectives[safe3DY]?.toLocaleString(undefined, { maximumFractionDigits: 1 })}<br>${h3DZ}: ${p.objectives[safe3DZ]?.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
      )
    },
    {
      x: [ideal[safe3DX]],
      y: [ideal[safe3DY]],
      z: [ideal[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "Punto Ideal (Z*)",
      text: ["★ Ideal"],
      marker: { symbol: "diamond", size: 10, color: "#f59e0b" },
      hoverinfo: "text",
      hovertext: `<b>Punto Ideal (Z*)</b><br>${h3DX}: ${ideal[safe3DX]?.toLocaleString()}<br>${h3DY}: ${ideal[safe3DY]?.toLocaleString()}<br>${h3DZ}: ${ideal[safe3DZ]?.toLocaleString()}`
    },
    {
      x: [antiIdeal[safe3DX]],
      y: [antiIdeal[safe3DY]],
      z: [antiIdeal[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "Anti-Ideal (Nadir)",
      text: ["✕ Nadir"],
      marker: { symbol: "cross", size: 8, color: "#ef4444" },
      hoverinfo: "text",
      hovertext: `<b>Anti-Ideal (Nadir)</b><br>${h3DX}: ${antiIdeal[safe3DX]?.toLocaleString()}<br>${h3DY}: ${antiIdeal[safe3DY]?.toLocaleString()}<br>${h3DZ}: ${antiIdeal[safe3DZ]?.toLocaleString()}`
    },
    solL1 && {
      x: [solL1.objectives[safe3DX]],
      y: [solL1.objectives[safe3DY]],
      z: [solL1.objectives[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "L1 (Manhattan)",
      text: ["L1"],
      marker: { size: 8, color: "#3b82f6" },
      hoverinfo: "text",
      hovertext: `<b>L1 (Manhattan)</b><br>${h3DX}: ${solL1.objectives[safe3DX]?.toLocaleString()}<br>${h3DY}: ${solL1.objectives[safe3DY]?.toLocaleString()}<br>${h3DZ}: ${solL1.objectives[safe3DZ]?.toLocaleString()}`
    },
    solL2 && {
      x: [solL2.objectives[safe3DX]],
      y: [solL2.objectives[safe3DY]],
      z: [solL2.objectives[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "L2 (Euclidiana)",
      text: ["L2"],
      marker: { size: 8, color: "#10b981" },
      hoverinfo: "text",
      hovertext: `<b>L2 (Euclidiana)</b><br>${h3DX}: ${solL2.objectives[safe3DX]?.toLocaleString()}<br>${h3DY}: ${solL2.objectives[safe3DY]?.toLocaleString()}<br>${h3DZ}: ${solL2.objectives[safe3DZ]?.toLocaleString()}`
    },
    solLinf && {
      x: [solLinf.objectives[safe3DX]],
      y: [solLinf.objectives[safe3DY]],
      z: [solLinf.objectives[safe3DZ]],
      mode: "markers+text",
      type: "scatter3d",
      name: "L_inf (Minimax)",
      text: ["L_inf"],
      marker: { size: 9, color: "#a855f7" },
      hoverinfo: "text",
      hovertext: `<b>L_inf (Minimax)</b><br>${h3DX}: ${solLinf.objectives[safe3DX]?.toLocaleString()}<br>${h3DY}: ${solLinf.objectives[safe3DY]?.toLocaleString()}<br>${h3DZ}: ${solLinf.objectives[safe3DZ]?.toLocaleString()}`
    }
  ].filter(Boolean) : [];

  const layout3D: any = {
    title: {
      text: n_objs === 3
        ? `Espacio de Objetivos 3D Completo (${h3DX} vs ${h3DY} vs ${h3DZ})`
        : `Espacio de Objetivos: Proyección 3D (${h3DX} vs ${h3DY} vs ${h3DZ})`,
      font: { size: 14, color: "#18181b" }
    },
    scene: {
      xaxis: { title: h3DX, gridcolor: "#e4e4e7" },
      yaxis: { title: h3DY, gridcolor: "#e4e4e7" },
      zaxis: { title: h3DZ, gridcolor: "#e4e4e7" },
      camera: {
        eye: { x: 1.6, y: 1.6, z: 1.3 }
      }
    },
    autosize: true,
    paper_bgcolor: "#ffffff",
    legend: { orientation: "h", y: -0.1 },
    margin: { l: 10, r: 10, t: 40, b: 20 }
  };

  // 3. Gráfico del Espacio de Decisiones (cuando n_vars == 2)
  const varNames = currentModel.variables.map((v: any) => v.name);
  const dataDecisionSpace: any[] = n_vars === 2 ? [
    solL1 && {
      x: [solL1.variables[varNames[0]]],
      y: [solL1.variables[varNames[1]]],
      mode: "markers+text",
      type: "scatter",
      name: "Solución L1",
      text: [`L1 (${solL1.variables[varNames[0]]?.toFixed(1)}, ${solL1.variables[varNames[1]]?.toFixed(1)})`],
      textposition: "top center",
      marker: { symbol: "square", size: 13, color: "#3b82f6" }
    },
    solL2 && {
      x: [solL2.variables[varNames[0]]],
      y: [solL2.variables[varNames[1]]],
      mode: "markers+text",
      type: "scatter",
      name: "Solución L2",
      text: [`L2 (${solL2.variables[varNames[0]]?.toFixed(1)}, ${solL2.variables[varNames[1]]?.toFixed(1)})`],
      textposition: "bottom center",
      marker: { symbol: "circle", size: 13, color: "#10b981" }
    },
    solLinf && {
      x: [solLinf.variables[varNames[0]]],
      y: [solLinf.variables[varNames[1]]],
      mode: "markers+text",
      type: "scatter",
      name: "Solución L_inf",
      text: [`L_inf (${solLinf.variables[varNames[0]]?.toFixed(1)}, ${solLinf.variables[varNames[1]]?.toFixed(1)})`],
      textposition: "top right",
      marker: { symbol: "diamond", size: 14, color: "#a855f7" }
    }
  ].filter(Boolean) : [];

  const layoutDecisionSpace: any = {
    title: { text: `Espacio de Decisiones (${varNames[0]} vs ${varNames[1]})`, font: { size: 14, color: "#18181b" } },
    xaxis: { title: varNames[0], gridcolor: "#e4e4e7" },
    yaxis: { title: varNames[1], gridcolor: "#e4e4e7" },
    autosize: true,
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#fafafa",
    legend: { orientation: "h", y: -0.2 }
  };

  // 4. Gráfico Radar / Radial de Grado de Logro (%) (SOLO para >= 3 objetivos)
  const headersClosed = [...headers, headers[0]];
  const idealPctClosed = Array(n_objs + 1).fill(100);

  const dataRadar: any[] = [
    {
      type: "scatterpolar",
      r: idealPctClosed,
      theta: headersClosed,
      name: "Punto Ideal (100%)",
      line: { color: "#f59e0b", dash: "dash", width: 2 },
      marker: { symbol: "star", size: 6, color: "#f59e0b" },
      fill: "none"
    },
    solL1 && {
      type: "scatterpolar",
      r: [...solL1.achievement_pct, solL1.achievement_pct[0]],
      theta: headersClosed,
      fill: "toself",
      fillcolor: "rgba(59, 130, 246, 0.12)",
      name: "L1 (Manhattan)",
      line: { color: "#3b82f6", width: 2 }
    },
    solL2 && {
      type: "scatterpolar",
      r: [...solL2.achievement_pct, solL2.achievement_pct[0]],
      theta: headersClosed,
      fill: "toself",
      fillcolor: "rgba(16, 185, 129, 0.12)",
      name: "L2 (Euclidiana)",
      line: { color: "#10b981", width: 2 }
    },
    solLinf && {
      type: "scatterpolar",
      r: [...solLinf.achievement_pct, solLinf.achievement_pct[0]],
      theta: headersClosed,
      fill: "toself",
      fillcolor: "rgba(168, 85, 247, 0.18)",
      name: "L_inf (Minimax)",
      line: { color: "#a855f7", width: 2.5 }
    }
  ].filter(Boolean);

  const layoutRadar: any = {
    title: { text: "Perfil Comparativo de Satisfacción Multiobjetivo (% Logro por Criterio)", font: { size: 14, color: "#18181b" } },
    polar: {
      radialaxis: {
        visible: true,
        range: [0, 105],
        ticksuffix: "%",
        gridcolor: "#e4e4e7"
      },
      angularaxis: {
        gridcolor: "#e4e4e7"
      }
    },
    autosize: true,
    paper_bgcolor: "#ffffff",
    legend: { orientation: "h", y: -0.15 },
    margin: { l: 40, r: 40, t: 40, b: 50 }
  };

  // 5. Gráfico de Barras de % Logro para 2 Objetivos (evita que el radar colapse en 1 sola línea)
  const dataBar: any[] = n_objs === 2 ? [
    {
      x: headers,
      y: [100, 100],
      name: "Punto Ideal (100%)",
      type: "bar",
      marker: { color: "#f59e0b" }
    },
    solL1 && {
      x: headers,
      y: solL1.achievement_pct,
      name: "L1 (Manhattan)",
      type: "bar",
      marker: { color: "#3b82f6" }
    },
    solL2 && {
      x: headers,
      y: solL2.achievement_pct,
      name: "L2 (Euclidiana)",
      type: "bar",
      marker: { color: "#10b981" }
    },
    solLinf && {
      x: headers,
      y: solLinf.achievement_pct,
      name: "L_inf (Minimax)",
      type: "bar",
      marker: { color: "#a855f7" }
    }
  ].filter(Boolean) : [];

  const layoutBar: any = {
    title: { text: "Comparativa de Grado de Logro (% Z')", font: { size: 14, color: "#18181b" } },
    barmode: "group",
    yaxis: { title: "% de Satisfacción", range: [0, 105], ticksuffix: "%", gridcolor: "#e4e4e7" },
    xaxis: { gridcolor: "#e4e4e7" },
    autosize: true,
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#fafafa",
    legend: { orientation: "h", y: -0.2 },
    margin: { l: 60, r: 40, t: 40, b: 60 }
  };

  return (
    <div className="space-y-6">
      {/* Guía Explicativa del Gráfico (Para que el usuario entienda exactamente qué representa cada elemento) */}
      <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-emerald-900 text-[13px]">
          <Info className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Guía de Interpretación del Gráfico en el Espacio de Objetivos</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed">
          <div>
            <span className="font-bold text-zinc-900">★ Punto Ideal (Dorado):</span> El valor óptimo absoluto alcanzable si cada objetivo se optimizara en solitario (incompatible simultáneamente).
          </div>
          <div>
            <span className="font-bold text-zinc-900">✕ Anti-Ideal / Nadir (Rojo):</span> El peor valor tolerable observado en la matriz de pagos bajo los óptimos de los demás.
          </div>
          <div>
            <span className="font-bold text-zinc-900">🟦 L1, 🟢 L2, 🟣 L_inf:</span> Las tres soluciones compromiso calculadas. Observa cómo se ubican entre el Ideal y el Nadir.
          </div>
          <div>
            <span className="font-bold text-zinc-900">
              {is2D ? "Curva Verde Continua:" : "Puntos Verdes Discretos:"}
            </span>{" "}
            {is2D
              ? "En 2 objetivos, la Frontera de Pareto es una curva continua 1D que conecta los compromisos eficientes."
              : "En 3 o más objetivos (como los 4 de la flota), la frontera es una superficie multidimensional. En esta proyección 2D se visualiza como una nube de puntos eficientes sin líneas conectoras para evitar cruces falsos."}
          </div>
        </div>
      </div>

      {/* Gráfico 2D de Objetivos con Controles de Ejes */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm space-y-3">
        {/* Controles Interactivos para cambiar ejes o activar/desactivar nube */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-zinc-100 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-zinc-700 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-zinc-500" />
              Proyección 2D:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 text-[11px]">Eje X:</span>
              <select
                value={safeAxisX}
                onChange={(e) => setAxisX(parseInt(e.target.value))}
                className="bg-zinc-50 border border-zinc-300 rounded px-2 py-0.5 font-bold text-xs text-zinc-800 focus:outline-emerald-500"
              >
                {headers.map((h: string, idx: number) => (
                  <option key={idx} value={idx}>{h}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 text-[11px]">Eje Y:</span>
              <select
                value={safeAxisY}
                onChange={(e) => setAxisY(parseInt(e.target.value))}
                className="bg-zinc-50 border border-zinc-300 rounded px-2 py-0.5 font-bold text-xs text-zinc-800 focus:outline-emerald-500"
              >
                {headers.map((h: string, idx: number) => (
                  <option key={idx} value={idx}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showParetoCloud}
              onChange={(e) => setShowParetoCloud(e.target.checked)}
              className="accent-emerald-600 rounded"
            />
            <span className="text-[11px]">Ver muestras de la Frontera ({paretoPts.length} pts)</span>
          </label>
        </div>

        <Plot data={data2D} layout={layout2D} useResizeHandler={true} style={{ width: "100%", height: "450px" }} />
      </div>

      {/* Gráfico de Barras de % Logro (SOLO cuando hay 2 objetivos) */}
      {n_objs === 2 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
          <Plot data={dataBar} layout={layoutBar} useResizeHandler={true} style={{ width: "100%", height: "380px" }} />
        </div>
      )}

      {/* Gráfico Radar de % Logro (SOLO cuando hay 3 o más objetivos, para formar un polígono real) */}
      {n_objs >= 3 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
          <Plot data={dataRadar} layout={layoutRadar} useResizeHandler={true} style={{ width: "100%", height: "450px" }} />
        </div>
      )}

      {/* Gráfico 3D si hay 3 o más objetivos (con rotación 360°, zoom y selección de 3 ejes) */}
      {n_objs >= 3 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-zinc-100 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-zinc-800 flex items-center gap-1.5 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                <Box className="w-3.5 h-3.5 text-purple-600" />
                Visualizador 3D Interactivo:
              </span>
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 text-[11px]">Eje X:</span>
                <select
                  value={safe3DX}
                  onChange={(e) => setAxis3DX(parseInt(e.target.value))}
                  className="bg-zinc-50 border border-zinc-300 rounded px-1.5 py-0.5 font-bold text-xs text-zinc-800 focus:outline-emerald-500"
                >
                  {headers.map((h: string, idx: number) => (
                    <option key={idx} value={idx}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 text-[11px]">Eje Y:</span>
                <select
                  value={safe3DY}
                  onChange={(e) => setAxis3DY(parseInt(e.target.value))}
                  className="bg-zinc-50 border border-zinc-300 rounded px-1.5 py-0.5 font-bold text-xs text-zinc-800 focus:outline-emerald-500"
                >
                  {headers.map((h: string, idx: number) => (
                    <option key={idx} value={idx}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-zinc-500 text-[11px]">Eje Z:</span>
                <select
                  value={safe3DZ}
                  onChange={(e) => setAxis3DZ(parseInt(e.target.value))}
                  className="bg-zinc-50 border border-zinc-300 rounded px-1.5 py-0.5 font-bold text-xs text-zinc-800 focus:outline-emerald-500"
                >
                  {headers.map((h: string, idx: number) => (
                    <option key={idx} value={idx}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            <span className="text-[11px] text-zinc-500 bg-zinc-50 px-2 py-1 rounded border border-zinc-200">
              💡 <b>Tip:</b> Arrastra con clic para rotar 360° | Rueda para zoom
            </span>
          </div>

          <Plot data={data3D} layout={layout3D} useResizeHandler={true} style={{ width: "100%", height: "520px" }} />
        </div>
      )}

      {/* Espacio de decisiones si hay 2 variables */}
      {n_vars === 2 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
          <Plot data={dataDecisionSpace} layout={layoutDecisionSpace} useResizeHandler={true} style={{ width: "100%", height: "380px" }} />
        </div>
      )}
    </div>
  );
}
