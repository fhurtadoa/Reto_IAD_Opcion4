"""
Generación y aproximación de la Frontera Eficiente de Pareto.
"""
import numpy as np
from typing import List, Dict
from .schemas import ModelDefinition, PayoffMatrixData, ParetoPoint
from .compromise import compute_distance_coefficients, solve_l1, solve_l2

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
    Aproxima la frontera de Pareto barriendo sistemáticamente el vector de pesos.
    Para 2 objetivos barre en [0, 1]. Para 3 objetivos genera una malla triangular simplex.
    """
    n_objs = len(model.objectives)
    alpha, beta = compute_distance_coefficients(model, payoff)
    senses = [obj.sense for obj in model.objectives]
    
    weight_vectors = []
    
    if n_objs == 2:
        for w1 in np.linspace(0.0, 1.0, num_samples):
            weight_vectors.append(np.array([w1, 1.0 - w1]))
    elif n_objs == 3:
        steps = 11  # genera 66 combinaciones
        for i in range(steps + 1):
            w1 = i / steps
            for j in range(steps + 1 - i):
                w2 = j / steps
                w3 = 1.0 - w1 - w2
                weight_vectors.append(np.array([w1, w2, w3]))
    else:
        # Para > 3 objetivos, generar muestras Dirichlet uniformes
        np.random.seed(42)
        weight_vectors.append(np.ones(n_objs) / n_objs)
        for _ in range(num_samples):
            w = np.random.dirichlet(np.ones(n_objs))
            weight_vectors.append(w)
            
    raw_points = []
    
    # Resolver L2 y L1 para cada peso
    for w in weight_vectors:
        # L2 produce soluciones continuas suaves a lo largo de toda la frontera
        sol_l2 = solve_l2(model, payoff, alpha, beta, w)
        if sol_l2.status == "optimal":
            raw_points.append(
                ParetoPoint(
                    weights=w.tolist(),
                    objectives=sol_l2.objectives,
                    variables=sol_l2.variables,
                    metric="L2"
                )
            )
            
        sol_l1 = solve_l1(model, payoff, alpha, beta, w)
        if sol_l1.status == "optimal":
            raw_points.append(
                ParetoPoint(
                    weights=w.tolist(),
                    objectives=sol_l1.objectives,
                    variables=sol_l1.variables,
                    metric="L1"
                )
            )
            
    # Filtrar soluciones no dominadas y eliminar duplicados cercanos
    non_dominated: List[ParetoPoint] = []
    seen = []
    
    for p in raw_points:
        obj_vals = p.objectives
        # Evitar puntos casi idénticos
        if any(np.allclose(obj_vals, s, atol=1e-3, rtol=1e-3) for s in seen):
            continue
            
        dominated = False
        for other in raw_points:
            if is_dominated(obj_vals, other.objectives, senses):
                dominated = True
                break
                
        if not dominated:
            non_dominated.append(p)
            seen.append(obj_vals)
            
    # Ordenar puntos para trazar curvas limpias (en 2D por el primer objetivo)
    if n_objs == 2:
        non_dominated.sort(key=lambda p: p.objectives[0])
        
    return non_dominated
