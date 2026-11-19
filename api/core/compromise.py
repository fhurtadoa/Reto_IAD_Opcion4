"""
Solvers para Programación de Compromiso Multiobjetivo:
Métricas L1 (Lineal), L_inf (Minimax Lineal) y L2 (Cuadrática Convexa).
"""
import numpy as np
from scipy.optimize import linprog, minimize
from typing import List, Dict, Tuple, Optional
from .schemas import ModelDefinition, PayoffMatrixData, MetricSolution
from .payoff import build_linear_constraints

def compute_distance_coefficients(
    model: ModelDefinition, payoff: PayoffMatrixData
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Calcula los vectores alfa_i y escalares beta_i tales que:
    D_i(x) = alfa_i^T @ x + beta_i
    donde D_i(x) es la distancia normalizada al ideal (D_i = 0 en el ideal, D_i = 1 en el peor).
    """
    n_vars = len(model.variables)
    n_objs = len(model.objectives)
    
    alpha = np.zeros((n_objs, n_vars), dtype=float)
    beta = np.zeros(n_objs, dtype=float)
    
    for i, obj in enumerate(model.objectives):
        coeffs = list(obj.coefficients)
        if len(coeffs) < n_vars:
            coeffs += [0.0] * (n_vars - len(coeffs))
        c_i = np.array(coeffs[:n_vars], dtype=float)
        
        z_id = payoff.ideal_point[i]
        z_pe = payoff.anti_ideal_point[i]
        range_i = z_id - z_pe if obj.sense == "maximize" else z_pe - z_id
        
        if np.isclose(range_i, 0.0):
            range_i = 1.0
            
        if obj.sense == "maximize":
            # D_i = (z_id - c_i^T x) / (z_id - z_pe)
            alpha[i] = - c_i / range_i
            beta[i] = z_id / range_i
        else:
            # D_i = (c_i^T x - z_id) / (z_pe - z_id)
            alpha[i] = c_i / range_i
            beta[i] = - z_id / range_i
            
    return alpha, beta

def format_solution(
    metric_name: str,
    x_opt: np.ndarray,
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray,
    status: str = "optimal"
) -> MetricSolution:
    """
    Construye el objeto MetricSolution evaluando variables, objetivos, distancias y grado de logro %.
    """
    var_names = [v.name for v in model.variables]
    variables_dict = {var_names[j]: float(x_opt[j]) for j in range(len(var_names))}
    
    objectives_vals = []
    norm_distances = []
    achievement_pcts = []
    
    for i, obj in enumerate(model.objectives):
        coeffs = list(obj.coefficients)
        if len(coeffs) < len(x_opt):
            coeffs += [0.0] * (len(x_opt) - len(coeffs))
        c_i = np.array(coeffs[:len(x_opt)], dtype=float)
        
        z_val = float(np.dot(c_i, x_opt))
        d_val = float(np.dot(alpha[i], x_opt) + beta[i])
        # Asegurar no negatividad de distancias por estabilidad numérica
        d_val = max(0.0, d_val)
        # Grado de logro: 100 * (1 - D_i) [%]
        ach_pct = float(100.0 * (1.0 - d_val))
        
        objectives_vals.append(z_val)
        norm_distances.append(d_val)
        achievement_pcts.append(ach_pct)
        
    d_array = np.array(norm_distances)
    if metric_name == "L1":
        agg_dist = float(np.sum(weights * d_array))
    elif metric_name == "L2":
        agg_dist = float(np.sqrt(np.sum(weights * (d_array ** 2))))
    else:  # L_inf
        agg_dist = float(np.max(weights * d_array))
        
    return MetricSolution(
        metric=metric_name,
        variables=variables_dict,
        objectives=objectives_vals,
        achievement_pct=achievement_pcts,
        normalized_distances=norm_distances,
        aggregate_distance=agg_dist,
        status=status
    )

def solve_l1(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray
) -> MetricSolution:
    """
    Resuelve la métrica L1 (Manhattan) como Programación Lineal:
    Min sum(w_i * D_i(x)) = Min (sum(w_i * alpha_i))^T @ x
    """
    A_ub, b_ub, A_eq, b_eq, bounds, integrality = build_linear_constraints(model)
    
    # Vector de costos para L1
    c_l1 = np.sum(weights[:, np.newaxis] * alpha, axis=0)
    
    res = linprog(
        c_l1,
        A_ub=A_ub,
        b_ub=b_ub,
        A_eq=A_eq,
        b_eq=b_eq,
        bounds=bounds,
        integrality=integrality,
        method="highs"
    )
    
    if not res.success:
        return MetricSolution(
            metric="L1",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status=f"error: {res.message}"
        )
        
    return format_solution("L1", res.x, model, payoff, alpha, beta, weights, status="optimal")

def solve_linf(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray
) -> MetricSolution:
    """
    Resuelve la métrica L_inf (Tchebysheff / Minimax) mediante Programación Lineal con variable auxiliar lambda:
    Min lambda
    s.a. w_i * (alpha_i^T @ x + beta_i) <= lambda  <=>  w_i * alpha_i^T @ x - lambda <= - w_i * beta_i
         restricciones originales sobre x
    """
    n_vars = len(model.variables)
    n_objs = len(model.objectives)
    A_ub_orig, b_ub_orig, A_eq_orig, b_eq_orig, bounds_orig, integrality_orig = build_linear_constraints(model)
    
    # Vector objetivo: [0, 0, ..., 0, 1] (minimizar lambda)
    c_inf = np.zeros(n_vars + 1, dtype=float)
    c_inf[-1] = 1.0
    
    # Restricciones de desigualdad ampliadas
    A_ub_list = []
    b_ub_list = []
    
    if A_ub_orig is not None and len(A_ub_orig) > 0:
        # Añadir columna de ceros para lambda a las restricciones originales
        A_ub_padded = np.hstack([A_ub_orig, np.zeros((len(A_ub_orig), 1))])
        A_ub_list.append(A_ub_padded)
        b_ub_list.append(b_ub_orig)
        
    # Restricciones auxiliares de minimax: w_i * alpha_i^T @ x - lambda <= - w_i * beta_i
    A_minimax = np.hstack([weights[:, np.newaxis] * alpha, -np.ones((n_objs, 1))])
    b_minimax = - weights * beta
    
    A_ub_list.append(A_minimax)
    b_ub_list.append(b_minimax)
    
    A_ub_total = np.vstack(A_ub_list)
    b_ub_total = np.concatenate(b_ub_list)
    
    # Restricciones de igualdad ampliadas
    A_eq_total = None
    b_eq_total = None
    if A_eq_orig is not None and len(A_eq_orig) > 0:
        A_eq_total = np.hstack([A_eq_orig, np.zeros((len(A_eq_orig), 1))])
        b_eq_total = b_eq_orig
        
    # Cotas ampliadas: cotas de x y lambda >= 0
    bounds_total = list(bounds_orig) + [(0.0, None)]
    
    # Integrality ampliada (lambda es continua)
    integrality_total = None
    if integrality_orig is not None:
        integrality_total = list(integrality_orig) + [0]
        
    res = linprog(
        c_inf,
        A_ub=A_ub_total,
        b_ub=b_ub_total,
        A_eq=A_eq_total,
        b_eq=b_eq_total,
        bounds=bounds_total,
        integrality=integrality_total,
        method="highs"
    )
    
    if not res.success:
        return MetricSolution(
            metric="L_inf",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status=f"error: {res.message}"
        )
        
    x_opt = res.x[:n_vars]
    return format_solution("L_inf", x_opt, model, payoff, alpha, beta, weights, status="optimal")

def solve_l2(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray,
    x0: Optional[np.ndarray] = None
) -> MetricSolution:
    """
    Resuelve la métrica L2 (Euclidiana) como Programación Cuadrática Convexa (QP):
    Min sum(w_i * (alpha_i^T @ x + beta_i)^2)
    s.a. restricciones originales
    utilizando scipy.optimize.minimize con SLSQP y gradiente analítico exacto.
    """
    n_vars = len(model.variables)
    A_ub, b_ub, A_eq, b_eq, bounds, _ = build_linear_constraints(model)
    
    # Función objetivo y gradiente analítico
    def objective(x):
        d = alpha @ x + beta
        return float(np.sum(weights * (d ** 2)))
        
    def jacobian(x):
        d = alpha @ x + beta
        # grad = 2 * sum(w_i * d_i * alpha_i) = 2 * (alpha^T @ (weights * d))
        return 2.0 * (alpha.T @ (weights * d))
        
    # Construcción de restricciones en formato SLSQP
    constraints = []
    if A_ub is not None:
        for i in range(len(b_ub)):
            row = A_ub[i]
            rhs = b_ub[i]
            # scipy ineq: fun(x) >= 0  <=>  rhs - row @ x >= 0
            constraints.append({
                'type': 'ineq',
                'fun': lambda x, r=row, b=rhs: b - np.dot(r, x),
                'jac': lambda x, r=row: -r
            })
            
    if A_eq is not None:
        for i in range(len(b_eq)):
            row = A_eq[i]
            rhs = b_eq[i]
            constraints.append({
                'type': 'eq',
                'fun': lambda x, r=row, b=rhs: np.dot(r, x) - b,
                'jac': lambda x, r=row: r
            })
            
    # Punto inicial: promedio de las soluciones independientes del ideal
    if x0 is None:
        if payoff.independent_solutions:
            var_names = [v.name for v in model.variables]
            x0 = np.mean([[sol[name] for name in var_names] for sol in payoff.independent_solutions], axis=0)
        else:
            x0 = np.zeros(n_vars, dtype=float)
            
    res = minimize(
        objective,
        x0,
        jac=jacobian,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 500, 'ftol': 1e-9}
    )
    
    if not res.success:
        # Fallback a Nelder-Mead si SLSQP reporta algún hipo en bordes
        res = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints)
        
    return format_solution("L2", res.x, model, payoff, alpha, beta, weights, status="optimal")

def solve_all_metrics(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    weights: Optional[List[float]] = None
) -> Tuple[Dict[str, MetricSolution], List[float]]:
    """
    Calcula simultáneamente las tres soluciones compromiso (L1, L2, L_inf) para un vector de pesos dado.
    """
    n_objs = len(model.objectives)
    if weights is None or len(weights) != n_objs:
        w_array = np.ones(n_objs, dtype=float) / n_objs
    else:
        w_array = np.array(weights, dtype=float)
        s = np.sum(w_array)
        if s > 0:
            w_array = w_array / s
        else:
            w_array = np.ones(n_objs, dtype=float) / n_objs
            
    alpha, beta = compute_distance_coefficients(model, payoff)
    
    sol_l1 = solve_l1(model, payoff, alpha, beta, w_array)
    sol_linf = solve_linf(model, payoff, alpha, beta, w_array)
    sol_l2 = solve_l2(model, payoff, alpha, beta, w_array, x0=np.array(list(sol_l1.variables.values())))
    
    solutions = {
        "L1": sol_l1,
        "L2": sol_l2,
        "L_inf": sol_linf
    }
    return solutions, w_array.tolist()
