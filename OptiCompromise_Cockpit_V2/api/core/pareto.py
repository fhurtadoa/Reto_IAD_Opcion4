"""
Generación y aproximación de la Frontera Eficiente de Pareto.
"""
import numpy as np
from typing import List, Dict
from .schemas import ModelDefinition, PayoffMatrixData, ParetoPoint
from .compromise import compute_distance_coefficients, solve_l1, solve_l2, solve_linf

def is_dominated(point: List[float], other: List[float], senses: List[str]) -> bool:
    """
    Verifica si 'point' es dominado por 'other'.
    'other' domina a 'point' si es al menos tan bueno en todos los objetivos y estrictamente mejor en al menos uno.
    """
    better_or_equal = True
    strictly_better = False
    
    for val_p, val_o, sense in zip(point, other, senses):
        if sense == "maximize":
            if val_o < val_p - 1e-6:
                better_or_equal = False
                break
            if val_o > val_p + 1e-6:
                strictly_better = True
        else:  # minimize
            if val_o > val_p + 1e-6:
                better_or_equal = False
                break
            if val_o < val_p - 1e-6:
                strictly_better = True
                
    return better_or_equal and strictly_better

def compute_pareto_frontier(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    num_samples: int = 21
) -> List[ParetoPoint]:
    """
    Aproxima la frontera de Pareto barriendo sistemáticamente diferentes vectores de pesos
    y combinando múltiples métricas de compromiso (L1, L2 y L_inf).
    """
    n_objs = len(model.objectives)
    alpha, beta = compute_distance_coefficients(model, payoff)
    senses = [obj.sense for obj in model.objectives]
    var_names = [v.name for v in model.variables]

    weight_vectors = []

    if n_objs == 2:
        for w1 in np.linspace(0.0, 1.0, num_samples):
            weight_vectors.append(np.array([w1, 1.0 - w1]))
    elif n_objs == 3:
        steps = 10  # genera 66 combinaciones en el simplex 3D
        for i in range(steps + 1):
            w1 = i / steps
            for j in range(steps + 1 - i):
                w2 = j / steps
                w3 = max(0.0, 1.0 - w1 - w2)
                weight_vectors.append(np.array([w1, w2, w3]))
    else:
        # Para > 3 objetivos: vértices puros + centro equitativo + muestreo Dirichlet reproducible
        rng = np.random.default_rng(42)
        weight_vectors.append(np.ones(n_objs) / n_objs)
        for k in range(n_objs):
            e_k = np.zeros(n_objs)
            e_k[k] = 1.0
            weight_vectors.append(e_k)
        for _ in range(max(num_samples, 36)):
            weight_vectors.append(rng.dirichlet(np.ones(n_objs)))

    raw_points: List[ParetoPoint] = []
    has_integer = any(v.var_type in ("integer", "binary") for v in model.variables)

    # Sembrar extremos individuales de la Matriz de Pagos para garantizar que los bordes A y B existan
    if payoff.matrix and payoff.independent_solutions:
        for k, (obj_vals, var_dict) in enumerate(zip(payoff.matrix, payoff.independent_solutions)):
            e_k = np.zeros(n_objs)
            e_k[k] = 1.0
            raw_points.append(
                ParetoPoint(
                    weights=e_k.tolist(),
                    objectives=list(obj_vals),
                    variables=dict(var_dict),
                    metric="L1"
                )
            )

    # Barrer pesos combinando métricas L1 (vértices), L2 (compromiso suave) y L_inf (barrido uniforme minimax)
    for idx_w, w in enumerate(weight_vectors):
        sol_l1 = solve_l1(model, payoff, alpha, beta, w)
        x0_seed = None
        if sol_l1.status == "optimal":
            x0_seed = np.array([sol_l1.variables[vn] for vn in var_names], dtype=float)
            raw_points.append(
                ParetoPoint(
                    weights=w.tolist(),
                    objectives=sol_l1.objectives,
                    variables=sol_l1.variables,
                    metric="L1"
                )
            )

        # Para L_inf usamos pesos estrictamente positivos para evitar soluciones débilmente dominadas cuando w_i = 0
        w_pos = np.maximum(w, 1e-3)
        w_pos = w_pos / np.sum(w_pos)
        sol_inf = solve_linf(model, payoff, alpha, beta, w_pos)
        if sol_inf.status == "optimal":
            raw_points.append(
                ParetoPoint(
                    weights=[round(float(val), 4) for val in w_pos],
                    objectives=sol_inf.objectives,
                    variables=sol_inf.variables,
                    metric="L_inf"
                )
            )

        if has_integer:
            sol_l2 = solve_l2(
                model,
                payoff,
                alpha,
                beta,
                w,
                x0=x0_seed,
                max_nodes=80,
                max_seconds=0.05,
            )
        else:
            sol_l2 = solve_l2(model, payoff, alpha, beta, w, x0=x0_seed)
        if sol_l2.status in ("optimal", "feasible_suboptimal"):
            raw_points.append(
                ParetoPoint(
                    weights=w.tolist(),
                    objectives=sol_l2.objectives,
                    variables=sol_l2.variables,
                    metric="L2"
                )
            )

    # Filtrar soluciones dominadas y deduplicar manteniendo diversidad entre métricas L1 / L2 / L_inf
    non_dominated: List[ParetoPoint] = []
    seen_coords: List[List[float]] = []

    # Primero quedarnos con todos los puntos no dominados
    efficient_candidates: List[ParetoPoint] = []
    for p in raw_points:
        if not any(is_dominated(p.objectives, other.objectives, senses) for other in raw_points):
            efficient_candidates.append(p)

    # Priorizar que queden representadas todas las métricas (L1 en extremos, L2 y L_inf en interiores)
    for p in efficient_candidates:
        obj_vals = p.objectives
        if any(np.allclose(obj_vals, s, atol=1e-3, rtol=5e-3) for s in seen_coords):
            continue
        non_dominated.append(p)
        seen_coords.append(obj_vals)

    # Ordenar en 2D por el primer objetivo para trazar la curva continua sin zigzags
    if n_objs == 2:
        non_dominated.sort(key=lambda p: p.objectives[0])

    return non_dominated
