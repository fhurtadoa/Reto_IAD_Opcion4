"""
API Principal de OptiCompromise en FastAPI.
Compatible con Vercel Serverless Functions y ejecución local con uvicorn.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import json
from typing import Dict, Any

try:
    from .core.schemas import ModelDefinition, PayoffMatrixData, SolveResponse, ParetoPoint
    from .core.payoff import compute_payoff_matrix
    from .core.compromise import solve_all_metrics
    from .core.pareto import compute_pareto_frontier
except (ImportError, ValueError):
    from core.schemas import ModelDefinition, PayoffMatrixData, SolveResponse, ParetoPoint
    from core.payoff import compute_payoff_matrix
    from core.compromise import solve_all_metrics
    from core.pareto import compute_pareto_frontier

app = FastAPI(
    title="OptiCompromise API",
    description="Motor de Optimización Multiobjetivo por Programación de Compromiso (IAD - UNAL)",
    version="1.0.0"
)

# Habilitar CORS para permitir llamadas desde el frontend de Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "OptiCompromise",
        "university": "Universidad Nacional de Colombia - Facultad de Minas",
        "course": "Introducción al Análisis de Decisiones (IAD)",
        "engine": "SciPy 1.17+ HiGHS & SLSQP"
    }

@app.post("/api/payoff", response_model=PayoffMatrixData)
def get_payoff_matrix(model: ModelDefinition):
    payoff = compute_payoff_matrix(model)
    if "error" in payoff.status:
        raise HTTPException(status_code=400, detail=payoff.status)
    return payoff

@app.post("/api/solve", response_model=SolveResponse)
def solve_model(model: ModelDefinition):
    # 1. Matriz de pagos
    payoff = compute_payoff_matrix(model)
    if "error" in payoff.status:
        raise HTTPException(status_code=400, detail=payoff.status)
        
    # 2. Soluciones compromiso
    solutions, normalized_weights = solve_all_metrics(model, payoff, weights=model.weights)
    
    # 3. Muestra de frontera de Pareto (rápida para interactividad)
    pareto_pts = compute_pareto_frontier(model, payoff, num_samples=15)
    
    return SolveResponse(
        status="optimal",
        message="Solución calculada exitosamente",
        payoff=payoff,
        solutions=solutions,
        weights=normalized_weights,
        pareto_points=pareto_pts
    )

@app.post("/api/pareto")
def get_pareto_frontier(model: ModelDefinition):
    payoff = compute_payoff_matrix(model)
    if "error" in payoff.status:
        raise HTTPException(status_code=400, detail=payoff.status)
    pareto_pts = compute_pareto_frontier(model, payoff, num_samples=25)
    return {"pareto_points": [p.dict() for p in pareto_pts]}

@app.get("/api/examples/{example_id}")
def get_example_model(example_id: str) -> Dict[str, Any]:
    examples_map = {
        "celdas": "01_celdas_fotovoltaicas.json",
        "transporte": "02_problema_transporte.json",
        "triobjetivo": "04_triobjetivo_3d.json"
    }
    filename = examples_map.get(example_id)
    if not filename:
        raise HTTPException(status_code=404, detail="Ejemplo no encontrado")
        
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, "examples", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Archivo {filename} no encontrado")
        
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data
