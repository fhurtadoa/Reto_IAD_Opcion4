"""
API Principal de OptiCompromise en FastAPI.
Compatible con Vercel Serverless Functions y ejecución local con uvicorn.
"""
import math
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import hashlib
from collections import OrderedDict
from threading import Lock
from typing import Dict, Any, Tuple, List

try:
    from .core.schemas import ModelDefinition, PayoffMatrixData, SolveResponse, ParetoPoint
    from .core.payoff import compute_payoff_matrix
    from .core.compromise import solve_all_metrics
    from .core.pareto import compute_pareto_frontier
    from .core.sensitivity import compute_weight_sensitivity
    from .core.schemas import WeightSensitivityData
except (ImportError, ValueError):
    from core.schemas import ModelDefinition, PayoffMatrixData, SolveResponse, ParetoPoint
    from core.payoff import compute_payoff_matrix
    from core.compromise import solve_all_metrics
    from core.pareto import compute_pareto_frontier
    from core.sensitivity import compute_weight_sensitivity
    from core.schemas import WeightSensitivityData

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

# Cache LRU en memoria para (payoff, pareto_points) indexado por la estructura del modelo (sin pesos).
# Al arrastrar los sliders de pesos, evita recomputar 100+ puntos Pareto en cada frame.
_STRUCTURE_CACHE: "OrderedDict[str, Tuple[PayoffMatrixData, List[ParetoPoint], WeightSensitivityData | None]]" = OrderedDict()
_MAX_CACHE_SIZE = 32
_CACHE_LOCK = Lock()


def _model_structure_key(model: ModelDefinition) -> str:
    payload = {
        "pareto_seed": model.pareto_seed if len(model.objectives) > 3 else None,
        "variables": [
            (v.name, v.var_type, v.lower_bound, v.upper_bound) for v in model.variables
        ],
        "objectives": [
            (o.name, o.sense, list(o.coefficients)) for o in model.objectives
        ],
        "constraints": [
            (c.sense, float(c.rhs), list(c.coefficients)) for c in model.constraints
        ],
    }
    raw = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _validate_model(model: ModelDefinition) -> None:
    if len(model.variables) < 1:
        raise HTTPException(status_code=400, detail="El modelo debe contener al menos 1 variable de decisión.")
    if len(model.objectives) < 2:
        raise HTTPException(status_code=400, detail="Un problema multiobjetivo requiere al menos 2 funciones objetivo.")

    if model.weights is not None and (
        len(model.weights) != len(model.objectives)
        or any(not math.isfinite(w) or not 0 <= w <= 1 for w in model.weights)
        or abs(sum(model.weights) - 1.0) > 0.001 + 1e-12
    ):
        raise HTTPException(status_code=400, detail="Ingresa un peso entre 0 y 1 por objetivo. Los pesos deben sumar 1.")

    seen_names = set()
    for v in model.variables:
        clean = v.name.strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Todas las variables de decisión deben tener un nombre no vacío.")
        if clean in seen_names:
            raise HTTPException(status_code=400, detail=f"Nombre de variable duplicado: '{clean}'. Cada variable debe ser única.")
        seen_names.add(clean)
        for bval in (v.lower_bound, v.upper_bound):
            if bval is not None and not math.isfinite(bval):
                raise HTTPException(status_code=400, detail=f"Cota no finita inválida en '{clean}'.")
        if v.lower_bound is not None and v.upper_bound is not None and v.lower_bound > v.upper_bound:
            raise HTTPException(
                status_code=400,
                detail=f"Cotas inválidas en '{clean}': la cota inferior ({v.lower_bound}) supera la cota superior ({v.upper_bound}).",
            )

    for idx, o in enumerate(model.objectives):
        if not o.name.strip():
            raise HTTPException(status_code=400, detail=f"El objetivo #{idx + 1} debe tener un nombre no vacío.")
        if len(o.coefficients) > len(model.variables):
            raise HTTPException(status_code=400, detail=f"El objetivo «{o.name}» tiene más coeficientes que variables.")
        if o.expression and not o.coefficients:
            raise HTTPException(status_code=400, detail=f"Convierte «{o.name}» a coeficientes lineales antes de resolver.")
        if any(not math.isfinite(c) for c in o.coefficients):
            raise HTTPException(status_code=400, detail=f"Coeficientes inválidos (NaN/Inf) en objetivo '{o.name}'.")

    for idx, c in enumerate(model.constraints):
        if len(c.coefficients) > len(model.variables) or (c.expression and not c.coefficients):
            raise HTTPException(status_code=400, detail=f"Revisa los coeficientes lineales de la restricción {idx + 1}.")
        if not math.isfinite(c.rhs) or any(not math.isfinite(coef) for coef in c.coefficients):
            raise HTTPException(status_code=400, detail=f"Valores numéricos inválidos (NaN/Inf) en restricción #{idx + 1}.")


def _require_payoff(model: ModelDefinition) -> PayoffMatrixData:
    payoff = compute_payoff_matrix(model)
    if "error" in payoff.status:
        detail = payoff.status.lower()
        if "infeasible" in detail:
            message = "Modelo infactible. Las cotas y restricciones son incompatibles."
        elif "unbounded" in detail:
            message = "Modelo no acotado. Al menos un objetivo puede mejorar sin límite."
        else:
            message = "HiGHS no pudo resolver la matriz de pagos. Revisa las escalas y las cotas."
        raise HTTPException(status_code=400, detail=message)
    return payoff


@app.post("/api/payoff", response_model=PayoffMatrixData)
def get_payoff_matrix(model: ModelDefinition):
    _validate_model(model)
    return _require_payoff(model)

@app.post("/api/solve", response_model=SolveResponse)
def solve_model(model: ModelDefinition):
    _validate_model(model)

    cache_key = _model_structure_key(model)
    with _CACHE_LOCK:
        cached = _STRUCTURE_CACHE.get(cache_key)
        if cached is not None:
            _STRUCTURE_CACHE.move_to_end(cache_key)
    if cached is not None:
        payoff, pareto_pts, sensitivity = cached
    else:
        # 1. Matriz de pagos
        payoff = _require_payoff(model)

        # 3. Muestra de frontera de Pareto (independiente de los pesos actuales)
        pareto_pts = compute_pareto_frontier(model, payoff, num_samples=21)
        sensitivity = compute_weight_sensitivity(model, payoff)
        with _CACHE_LOCK:
            _STRUCTURE_CACHE[cache_key] = (payoff, pareto_pts, sensitivity)
            if len(_STRUCTURE_CACHE) > _MAX_CACHE_SIZE:
                _STRUCTURE_CACHE.popitem(last=False)

    # 2. Soluciones compromiso para los pesos actuales
    solutions, normalized_weights = solve_all_metrics(model, payoff, weights=model.weights)

    incomplete = [s.metric for s in solutions.values() if s.status != "optimal"]
    return SolveResponse(
        status="partial" if incomplete else "optimal",
        message=(
            f"Optimalidad sin confirmar para {', '.join(incomplete).replace('L_inf', 'L∞')}."
            if incomplete else "Las tres métricas convergieron dentro de la tolerancia del motor."
        ),
        payoff=payoff,
        solutions=solutions,
        weights=normalized_weights,
        pareto_points=pareto_pts,
        weight_sensitivity=sensitivity,
    )

@app.post("/api/pareto")
def get_pareto_frontier(model: ModelDefinition):
    _validate_model(model)
    payoff = _require_payoff(model)
    pareto_pts = compute_pareto_frontier(model, payoff, num_samples=25)
    return {
        "pareto_points": [
            p.model_dump() if hasattr(p, "model_dump") else p.dict()
            for p in pareto_pts
        ]
    }

@app.get("/api/examples/{example_id}")
def get_example_model(example_id: str) -> Dict[str, Any]:
    examples_map = {
        "flota": "05_flota_vehiculos.json",
        "celdas": "01_celdas_fotovoltaicas.json",
        "transporte": "02_problema_transporte.json",
        "mip": "03_mip_produccion.json",
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
