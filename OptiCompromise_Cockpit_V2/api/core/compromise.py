"""
Solvers para Programación de Compromiso Multiobjetivo:
Métricas L1 (Lineal), L_inf (Minimax Lineal) y L2 (Cuadrática Convexa / MIQP Branch-and-Bound).
"""
import heapq
import time
import numpy as np
from scipy.linalg import qr
from scipy.optimize import Bounds, LinearConstraint, milp, minimize
from typing import List, Dict, Tuple, Optional
from .schemas import ModelDefinition, PayoffMatrixData, MetricSolution
from .payoff import build_linear_constraints, clean_solution_vector, is_feasible, scale_linear_objective, solve_linprog_precise

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
        if payoff.normalization_sources and payoff.normalization_sources[i] == "constant":
            continue
        coeffs = list(obj.coefficients)
        if len(coeffs) < n_vars:
            coeffs += [0.0] * (n_vars - len(coeffs))
        c_i = np.array(coeffs[:n_vars], dtype=float)
        
        z_id = payoff.ideal_point[i]
        z_pe = payoff.anti_ideal_point[i]
        range_i = z_id - z_pe if obj.sense == "maximize" else z_pe - z_id
        
        if payoff.normalization_ranges:
            range_i = payoff.normalization_ranges[i]
        range_i = range_i or 1.0
            
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
        # Asegurar no negatividad de distancias y limpiar ruido numérico cercano a 0 o 1
        d_val = max(0.0, d_val)
        if abs(d_val) < 1e-12:
            d_val = 0.0
        elif abs(d_val - 1.0) < 1e-12:
            d_val = 1.0
        # Grado de logro: 100 * (1 - D_i) [%]
        ach_pct = float(100.0 * (1.0 - d_val))
        if abs(ach_pct) < 1e-11:
            ach_pct = 0.0
        
        objectives_vals.append(z_val)
        norm_distances.append(d_val)
        achievement_pcts.append(ach_pct)
        
    d_array = np.array(norm_distances)
    if metric_name == "L1":
        agg_dist = float(np.sum(weights * d_array))
    elif metric_name == "L2":
        agg_dist = float(np.linalg.norm(weights * d_array))
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

def _continuous_column_scale(model, payoff, bounds, integrality, minimum=1e4):
    # Los óptimos individuales también revelan cotas efectivas impuestas por filas.
    # Las coordenadas enteras conservan su retícula original.
    scales = np.ones(len(bounds))
    for j, (variable, (lo, hi)) in enumerate(zip(model.variables, bounds)):
        if integrality is not None and integrality[j]:
            continue
        witness = max((abs(row[variable.name]) for row in payoff.independent_solutions), default=0.0)
        scale = max(witness, abs(lo or 0.0), abs(hi or 0.0))
        if scale >= minimum:
            scales[j] = scale
    return scales


def _scale_bounds(bounds, column_scale):
    return [
        tuple(None if bound is None else bound / scale for bound in pair)
        for pair, scale in zip(bounds, column_scale)
    ]


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
    Con pesos nulos, desempata dentro de la cara óptima sin alterar la métrica.
    """
    A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality = build_linear_constraints(model)
    column_scale = _continuous_column_scale(model, payoff, bounds_orig, integrality)
    bounds = _scale_bounds(bounds_orig, column_scale)
    A_ub = None if A_ub_orig is None else A_ub_orig * column_scale
    A_eq = None if A_eq_orig is None else A_eq_orig * column_scale
    scaled_alpha = alpha * column_scale

    c_l1 = scale_linear_objective(weights @ scaled_alpha)

    res = solve_linprog_precise(
        c_l1,
        A_ub=A_ub,
        b_ub=b_ub,
        A_eq=A_eq,
        b_eq=b_eq,
        bounds=bounds,
        integrality=integrality,
    )

    if not res.success or res.x is None:
        return MetricSolution(
            metric="L1",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status=f"error: {res.message}"
        )

    x = res.x
    if np.any(weights <= 1e-12):
        A_eq_tie, b_eq_tie = A_eq, b_eq
        if np.any(c_l1):
            A_eq_tie = np.vstack([A_eq, c_l1]) if A_eq is not None else c_l1[None, :]
            b_eq_tie = np.append(b_eq, c_l1 @ x) if b_eq is not None else np.array([c_l1 @ x], dtype=float)
        tie = solve_linprog_precise(
            scale_linear_objective(scaled_alpha.sum(axis=0)),
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq_tie,
            b_eq=b_eq_tie,
            bounds=bounds,
            integrality=integrality,
        )
        if tie.success and tie.x is not None and np.all(np.isfinite(tie.x)):
            cand = clean_solution_vector(tie.x * column_scale, bounds_orig, integrality)
            if is_feasible(cand, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality, tol=1e-8):
                x = tie.x

    x_clean = clean_solution_vector(x * column_scale, bounds_orig, integrality)
    if integrality is None and not is_feasible(x_clean, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, None, tol=1e-8):
        x_clean = _project_feasible_l1(x_clean, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig)
    if not is_feasible(x_clean, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality, tol=1e-8):
        return MetricSolution(
            metric="L1",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status="error: la solución L1 no cumple el modelo original",
        )
    return format_solution("L1", x_clean, model, payoff, alpha, beta, weights, status="optimal")

def solve_linf(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray
) -> MetricSolution:
    """
    Resuelve la métrica L_inf (Tchebysheff / Minimax) mediante Programación Lineal con variable auxiliar lambda:
    Min lambda, con desempate en la cara óptima para mejorar la eficiencia.
    s.a. w_i * (alpha_i^T @ x + beta_i) <= lambda  <=>  w_i * alpha_i^T @ x - lambda <= - w_i * beta_i
         restricciones originales sobre x
    """
    n_vars = len(model.variables)
    n_objs = len(model.objectives)
    A_ub_orig, b_ub_orig, A_eq_orig, b_eq_orig, bounds_orig, integrality_orig = build_linear_constraints(model)

    column_scale = _continuous_column_scale(model, payoff, bounds_orig, integrality_orig)
    scaled_bounds = _scale_bounds(bounds_orig, column_scale)

    c_inf = np.zeros(n_vars + 1, dtype=float)
    c_inf[-1] = 1.0

    # Restricciones de desigualdad ampliadas
    A_ub_list = []
    b_ub_list = []

    if A_ub_orig is not None and len(A_ub_orig) > 0:
        A_ub_padded = np.hstack([A_ub_orig * column_scale, np.zeros((len(A_ub_orig), 1))])
        A_ub_list.append(A_ub_padded)
        b_ub_list.append(b_ub_orig)

    # Restricciones auxiliares de minimax: w_i * alpha_i^T @ x - lambda <= - w_i * beta_i
    A_minimax = np.hstack([weights[:, np.newaxis] * alpha * column_scale, -np.ones((n_objs, 1))])
    b_minimax = - weights * beta

    A_ub_list.append(A_minimax)
    b_ub_list.append(b_minimax)

    A_ub_total = np.vstack(A_ub_list)
    b_ub_total = np.concatenate(b_ub_list)

    # Restricciones de igualdad ampliadas
    A_eq_total = None
    b_eq_total = None
    if A_eq_orig is not None and len(A_eq_orig) > 0:
        A_eq_total = np.hstack([A_eq_orig * column_scale, np.zeros((len(A_eq_orig), 1))])
        b_eq_total = b_eq_orig

    # Cotas ampliadas: cotas de x y lambda >= 0
    bounds_total = scaled_bounds + [(0.0, None)]

    # Integrality ampliada (lambda es continua)
    integrality_total = None
    if integrality_orig is not None:
        integrality_total = list(integrality_orig) + [0]

    res = solve_linprog_precise(
        c_inf,
        A_ub=A_ub_total,
        b_ub=b_ub_total,
        A_eq=A_eq_total,
        b_eq=b_eq_total,
        bounds=bounds_total,
        integrality=integrality_total,
    )

    if not res.success or res.x is None:
        return MetricSolution(
            metric="L_inf",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status=f"error: {res.message}"
        )

    tie_c = np.append(scale_linear_objective(alpha.sum(axis=0) * column_scale), 0.0)
    lam_opt = float(res.x[-1])
    tie = solve_linprog_precise(
        tie_c,
        A_ub=A_ub_total,
        b_ub=b_ub_total,
        A_eq=A_eq_total,
        b_eq=b_eq_total,
        bounds=scaled_bounds + [(lam_opt, lam_opt)],
        integrality=integrality_total,
    )
    if not tie.success or tie.x is None:
        lam_slack = lam_opt + 1e-11 * max(1.0, abs(lam_opt))
        tie = solve_linprog_precise(
            tie_c,
            A_ub=A_ub_total,
            b_ub=b_ub_total,
            A_eq=A_eq_total,
            b_eq=b_eq_total,
            bounds=scaled_bounds + [(lam_opt, lam_slack)],
            integrality=integrality_total,
        )

    x_opt = None
    for cand in ([tie.x] if (tie.success and tie.x is not None) else []) + [res.x]:
        cand_clean = clean_solution_vector(cand[:n_vars] * column_scale, bounds_orig, integrality_orig)
        if is_feasible(cand_clean, A_ub_orig, b_ub_orig, A_eq_orig, b_eq_orig, bounds_orig, integrality_orig, tol=1e-8):
            x_opt = cand_clean
            break
    if x_opt is None:
        return MetricSolution(metric="L_inf", variables={}, objectives=[], achievement_pct=[],
                              normalized_distances=[], aggregate_distance=0.0,
                              status="error: la solución minimax no cumple el modelo original")
    distance = np.max(weights * (alpha @ x_opt + beta))
    status = "optimal" if abs(distance - lam_opt) <= 1e-7 else "feasible_suboptimal"
    return format_solution("L_inf", x_opt, model, payoff, alpha, beta, weights, status=status)


def _project_feasible_l1(
    x_cand: np.ndarray,
    A_ub: Optional[np.ndarray],
    b_ub: Optional[np.ndarray],
    A_eq: Optional[np.ndarray],
    b_eq: Optional[np.ndarray],
    bounds: List[Tuple[Optional[float], Optional[float]]],
) -> np.ndarray:
    """Proyecta en norma L1 sobre el poliedro para eliminar derivas de frontera > 1e-9."""
    if is_feasible(x_cand, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-9):
        return x_cand
    n_vars = len(bounds)
    c_proj = np.concatenate([np.zeros(n_vars), np.ones(2 * n_vars)])
    eye = np.eye(n_vars)
    proj_eq = np.hstack([eye, -eye, eye])
    A_eq_proj = (
        np.vstack([np.hstack([A_eq, np.zeros((len(A_eq), 2 * n_vars))]), proj_eq])
        if A_eq is not None and len(A_eq) > 0
        else proj_eq
    )
    b_eq_proj = np.concatenate([b_eq, x_cand]) if b_eq is not None and len(b_eq) > 0 else x_cand
    A_ub_proj = (
        np.hstack([A_ub, np.zeros((len(A_ub), 2 * n_vars))])
        if A_ub is not None and len(A_ub) > 0
        else None
    )
    bounds_proj = list(bounds) + [(0.0, None)] * (2 * n_vars)
    res = solve_linprog_precise(
        c_proj,
        A_ub=A_ub_proj,
        b_ub=b_ub,
        A_eq=A_eq_proj,
        b_eq=b_eq_proj,
        bounds=bounds_proj,
    )
    if res.success and res.x is not None:
        x_proj = clean_solution_vector(res.x[:n_vars], bounds, integrality=None)
        if is_feasible(x_proj, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8):
            return x_proj
    return x_cand


def _solve_continuous_qp(
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray,
    A_ub: Optional[np.ndarray],
    b_ub: Optional[np.ndarray],
    A_eq: Optional[np.ndarray],
    b_eq: Optional[np.ndarray],
    bounds: List[Tuple[Optional[float], Optional[float]]],
    x0_candidates: List[np.ndarray],
    gap_tol: float = 1e-7,
) -> Tuple[Optional[np.ndarray], float, bool]:
    """
    Resuelve la relajación cuadrática continua Min sum((w_i * (alpha_i^T x + beta_i))^2)
    con restricciones escaladas por fila para estabilidad numérica de SLSQP.
    """
    n_vars = len(bounds)

    # Verificar y normalizar cotas para evitar que cotas cruzadas por tolerancia rompan SLSQP
    clean_bounds: List[Tuple[Optional[float], Optional[float]]] = []
    for lb, ub in bounds:
        if lb is not None and ub is not None:
            if lb > ub + 1e-9:
                return None, float("inf"), True
            if lb > ub:
                mid = 0.5 * (lb + ub)
                lb, ub = mid, mid
        clean_bounds.append((lb, ub))
    bounds = clean_bounds

    weighted_alpha = weights[:, None] * alpha
    weighted_beta = weights * beta

    def objective(x: np.ndarray) -> float:
        d = weighted_alpha @ x + weighted_beta
        return float(d @ d)

    def jacobian(x: np.ndarray) -> np.ndarray:
        d = weighted_alpha @ x + weighted_beta
        return 2.0 * (weighted_alpha.T @ d)

    # Normalización de restricciones por norma de fila para evitar mal condicionamiento (ej. 2.35M vs 50)
    constraints = []
    if A_ub is not None and b_ub is not None:
        for i in range(len(b_ub)):
            row = A_ub[i]
            rhs = float(b_ub[i])
            scale = float(max(np.linalg.norm(row), abs(rhs), 1.0))
            r_s = row / scale
            b_s = rhs / scale
            constraints.append({
                "type": "ineq",
                "fun": lambda x, r=r_s, b=b_s: b - float(np.dot(r, x)),
                "jac": lambda x, r=r_s: -r,
            })

    if A_eq is not None and b_eq is not None:
        # SLSQP requiere igualdades independientes. Se conserva el sistema
        # completo para la comprobación de factibilidad y para HiGHS.
        scaled_eq = A_eq / np.maximum(np.linalg.norm(A_eq, axis=1, keepdims=True), 1e-300)
        rank = np.linalg.matrix_rank(scaled_eq)
        _, _, pivots = qr(scaled_eq.T, mode="economic", pivoting=True)
        for i in pivots[:rank]:
            row = A_eq[i]
            rhs = float(b_eq[i])
            scale = float(max(np.linalg.norm(row), abs(rhs), 1.0))
            r_s = row / scale
            b_s = rhs / scale
            constraints.append({
                "type": "eq",
                "fun": lambda x, r=r_s, b=b_s: float(np.dot(r, x)) - b,
                "jac": lambda x, r=r_s: r,
            })

    best_x: Optional[np.ndarray] = None
    best_val = float("inf")

    # Proyectar candidatos iniciales dentro de las cotas del nodo
    starts: List[np.ndarray] = []
    for cand in x0_candidates:
        if cand is not None and len(cand) == n_vars and np.all(np.isfinite(cand)):
            proj = np.array(cand, dtype=float)
            for j, (lb, ub) in enumerate(bounds):
                if lb is not None:
                    proj[j] = max(proj[j], lb)
                if ub is not None:
                    proj[j] = min(proj[j], ub)
            starts.append(proj)
    if not starts:
        starts.append(np.zeros(n_vars, dtype=float))

    # Sembrar best_x con el mejor candidato factible inicial (garantiza que L2 nunca empeore a L1/L_inf)
    for x_init in starts:
        if is_feasible(x_init, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-7):
            val = objective(x_init)
            if val < best_val:
                best_val = val
                best_x = np.array(x_init, dtype=float)

    # Re-escalar el objetivo para que SLSQP no se detenga prematuramente cuando los pesos o gradientes son pequeños
    alpha_norm = float(np.max(np.abs(weighted_alpha), initial=0.0))
    base_scale = 1.0 / max(alpha_norm * alpha_norm, 1e-12) if alpha_norm > 0.0 else 1.0
    base_scale = float(np.clip(base_scale, 1.0, 1e6))
    slsqp_progressed = False

    def _run_slsqp(x_start: np.ndarray, scale_factor: float, maxiter: int = 400, ftol: float = 1e-11) -> bool:
        nonlocal best_x, best_val, slsqp_progressed
        res = minimize(
            lambda x: scale_factor * objective(x),
            x_start,
            jac=lambda x: scale_factor * jacobian(x),
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": maxiter, "ftol": ftol},
        )
        improved = False
        if res.x is not None and is_feasible(res.x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-7):
            cand = _project_feasible_l1(res.x, A_ub, b_ub, A_eq, b_eq, bounds)
            val = objective(cand)
            if np.isfinite(val):
                if val < best_val - 1e-15 * max(1e-12, best_val):
                    improved = True
                if best_x is None or val < best_val or not is_feasible(best_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8):
                    best_val = val
                    best_x = np.array(cand, dtype=float)
        if getattr(res, "success", False) or improved:
            slsqp_progressed = True
            return True
        return False

    for x_init in starts[:2]:
        _run_slsqp(x_init, base_scale)

    # Si SLSQP no encontró punto factible, intentar encontrar un punto factible con HiGHS y re-optimizar
    if best_x is None:
        feas = solve_linprog_precise(
            np.zeros(n_vars, dtype=float),
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
        )
        if not feas.success or feas.x is None:
            return None, float("inf"), feas.status == 2
        best_x = np.array(feas.x, dtype=float)
        best_val = objective(best_x)
        _run_slsqp(best_x, base_scale, ftol=1e-10)

    best_x = _project_feasible_l1(best_x, A_ub, b_ub, A_eq, b_eq, bounds)
    best_val = objective(best_x)

    # Para una cuadrática convexa, la tangente es un minorante global.
    # Su mínimo sobre el poliedro certifica una cota inferior para la poda.
    # Si la brecha tangencial supera la tolerancia, refinamos con búsqueda lineal exacta (Frank-Wolfe) y SLSQP.
    pos_w = weights[weights > 1e-12]
    eff_gap_tol = (
        gap_tol * min(1.0, max(1e-6, float(np.min(pos_w) ** 2) * 100.0))
        if len(pos_w) > 0
        else gap_tol
    )

    def _tangent_gradient(x_pt: np.ndarray) -> Tuple[np.ndarray, float, float]:
        d_pt = weighted_alpha @ x_pt + weighted_beta
        d_cert = np.where((d_pt < 0.0) & (d_pt > -1e-12), 0.0, d_pt)
        grad = 2.0 * (weighted_alpha.T @ d_cert)
        g_scale = float(np.max(np.abs(grad), initial=0.0))
        noise_tol = 2.0 * float(np.max(np.abs(weighted_alpha.T) @ np.abs(d_cert), initial=0.0)) * 64.0 * float(np.finfo(float).eps)
        return grad, g_scale, noise_tol

    best_lb = 0.0
    max_refine = (6 if eff_gap_tol < 1e-7 else 4) if slsqp_progressed else 0
    for _ in range(max_refine):
        gradient, scale, noise_tol = _tangent_gradient(best_x)
        if scale <= noise_tol:
            return best_x, best_val, is_feasible(best_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8)
        certificate = solve_linprog_precise(
            gradient / scale, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
            bounds=bounds,
        )
        if not certificate.success or certificate.x is None:
            return best_x, best_lb, False
        gap = max(0.0, float(gradient @ (best_x - certificate.x)))
        best_lb = max(best_lb, best_val - gap)
        if gap <= min(1e-10, eff_gap_tol):
            return best_x, best_lb, is_feasible(best_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8)

        delta = certificate.x - best_x
        d_vec = weighted_alpha @ best_x + weighted_beta
        v_vec = weighted_alpha @ delta
        vv = float(v_vec @ v_vec)
        cand_x = best_x
        if vv > 1e-24:
            gamma = float(np.clip(-(d_vec @ v_vec) / vv, 0.0, 1.0))
            step_x = _project_feasible_l1(best_x + gamma * delta, A_ub, b_ub, A_eq, b_eq, bounds)
            if is_feasible(step_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8):
                cand_x = step_x
                cand_val = objective(cand_x)
                if cand_val < best_val:
                    best_val = cand_val
                    best_x = cand_x

        ref_scale = float(np.clip(1.0 / max(gap, 1e-15), base_scale, 1e12))
        prev_val = best_val
        _run_slsqp(cand_x, ref_scale, maxiter=500, ftol=1e-12)
        if prev_val - best_val <= 1e-15 * max(1e-12, prev_val):
            break

    gradient, scale, noise_tol = _tangent_gradient(best_x)
    if scale <= noise_tol:
        return best_x, best_val, is_feasible(best_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8)
    certificate = solve_linprog_precise(
        gradient / scale, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
        bounds=bounds,
    )
    if not certificate.success or certificate.x is None:
        return best_x, best_lb, False
    gap = max(0.0, float(gradient @ (best_x - certificate.x)))
    best_lb = max(best_lb, best_val - gap)
    return best_x, best_lb, (
        gap <= eff_gap_tol and is_feasible(best_x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-8)
    )


def _refine_integer_qp(alpha, beta, linear_rows, bounds, integrality, seeds,
                       incumbent, max_rounds, deadline):
    """Acota la suma de cuadrados con tangentes y resuelve los cortes como MILP."""
    A_ub, b_ub, A_eq, b_eq = linear_rows
    n_obj, n_var = alpha.shape
    rows, lower, upper = [], [], []
    if A_ub is not None:
        rows.extend(np.pad(A_ub, ((0, 0), (0, n_obj))))
        lower.extend([-np.inf] * len(b_ub))
        upper.extend(b_ub)
    if A_eq is not None:
        rows.extend(np.pad(A_eq, ((0, 0), (0, n_obj))))
        lower.extend(b_eq)
        upper.extend(b_eq)

    def add_support(x):
        d = alpha @ x + beta
        # t_i >= d_i^2 + 2*d_i*((alpha*x + beta)_i - d_i)
        rows.extend(np.column_stack((2 * d[:, None] * alpha, -np.eye(n_obj))))
        lower.extend([-np.inf] * n_obj)
        upper.extend(d * (d - 2 * beta))

    for seed in seeds:
        add_support(seed)
    lb = [lo if lo is not None else -np.inf for lo, _ in bounds]
    ub = [hi if hi is not None else np.inf for _, hi in bounds]
    extended_bounds = Bounds(lb + [0.] * n_obj, ub + [np.inf] * n_obj)
    extended_integrality = np.r_[integrality, np.zeros(n_obj, dtype=int)]
    cost = np.r_[np.zeros(n_var), np.ones(n_obj)]
    best_x, best_val = incumbent

    for _ in range(max_rounds):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        result = milp(cost, integrality=extended_integrality, bounds=extended_bounds,
                      constraints=LinearConstraint(rows, lower, upper),
                      options={"time_limit": remaining, "mip_rel_gap": 0.0})
        if result.x is None:
            break
        x = clean_solution_vector(result.x[:n_var], bounds, integrality)
        if not is_feasible(x, A_ub, b_ub, A_eq, b_eq, bounds, integrality):
            break
        d = alpha @ x + beta
        value = float(d @ d)
        if value < best_val:
            best_x, best_val = x, value
        bound = getattr(result, "mip_dual_bound", None)
        if bound is not None and np.isfinite(bound) and best_val - bound <= 1e-7:
            return best_x, best_val, True
        add_support(x)

    return best_x, best_val, False


def _tie_break_l2(
    x_cand: np.ndarray,
    scaled_alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray,
    column_scale: np.ndarray,
    A_ub: Optional[np.ndarray],
    b_ub: Optional[np.ndarray],
    A_eq: Optional[np.ndarray],
    b_eq: Optional[np.ndarray],
    bounds: List[Tuple[Optional[float], Optional[float]]],
    A_ub_orig: Optional[np.ndarray],
    A_eq_orig: Optional[np.ndarray],
    bounds_orig: List[Tuple[Optional[float], Optional[float]]],
    integrality: Optional[List[int]] = None,
) -> np.ndarray:
    """Desempata sobre objetivos con peso nulo manteniendo fijas las brechas de los objetivos activos."""
    active = weights > 1e-12
    inactive = ~active
    if not np.any(active) or not np.any(inactive):
        return x_cand

    A_act = scaled_alpha[active]
    b_act = A_act @ x_cand
    A_ub_tie = np.vstack([A_ub, A_act]) if A_ub is not None and len(A_ub) > 0 else A_act
    b_ub_tie = np.concatenate([b_ub, b_act]) if b_ub is not None and len(b_ub) > 0 else b_act

    x_best = x_cand
    d_orig_val = float(np.sum((weights * (scaled_alpha @ x_cand + beta)) ** 2))

    # Primero optimizar la suma de objetivos inactivos y luego secuencialmente si se cancelan
    dirs_to_try: List[np.ndarray] = []
    sum_inact = scaled_alpha[inactive].sum(axis=0)
    if np.linalg.norm(sum_inact) > 1e-12:
        dirs_to_try.append(sum_inact)
    for idx in np.where(inactive)[0]:
        if np.linalg.norm(scaled_alpha[idx]) > 1e-12:
            dirs_to_try.append(scaled_alpha[idx])

    A_eq_tie, b_eq_tie = A_eq, b_eq
    for d_vec in dirs_to_try:
        res_tie = solve_linprog_precise(
            scale_linear_objective(d_vec),
            A_ub=A_ub_tie,
            b_ub=b_ub_tie,
            A_eq=A_eq_tie,
            b_eq=b_eq_tie,
            bounds=bounds,
            integrality=integrality,
        )
        if res_tie.success and res_tie.x is not None and np.all(np.isfinite(res_tie.x)):
            cand_orig = clean_solution_vector(res_tie.x * column_scale, bounds_orig, integrality)
            if is_feasible(cand_orig, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality, tol=1e-8):
                cand_scaled = cand_orig / column_scale
                d_new_val = float(np.sum((weights * (scaled_alpha @ cand_scaled + beta)) ** 2))
                if d_new_val <= d_orig_val + 1e-12:
                    x_best = cand_scaled
                    d_orig_val = min(d_orig_val, d_new_val)
                    if np.linalg.norm(sum_inact) > 1e-12 and d_vec is sum_inact:
                        break
                    val_d = float(d_vec @ x_best)
                    A_eq_tie = np.vstack([A_eq_tie, d_vec[None, :]]) if A_eq_tie is not None else d_vec[None, :]
                    b_eq_tie = np.concatenate([b_eq_tie, [val_d]]) if b_eq_tie is not None else np.array([val_d], dtype=float)
    return x_best


def solve_l2(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    alpha: np.ndarray,
    beta: np.ndarray,
    weights: np.ndarray,
    x0: Optional[np.ndarray] = None,
    incumbents: Optional[List[np.ndarray]] = None,
    max_nodes: int = 800,
    max_seconds: float = 1.0,
) -> MetricSolution:
    """
    Resuelve la métrica L2 (Euclidiana) como Programación Cuadrática Convexa (QP):
    Min sum((w_i * (alpha_i^T @ x + beta_i))^2)
    s.a. restricciones originales.
    - Para LP continuo: SLSQP con restricciones normalizadas y validación estricta de factibilidad.
    - Para MIP: cortes externos y ramificación y poda con presupuesto acotado.
    """
    n_vars = len(model.variables)
    var_names = [v.name for v in model.variables]
    A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality = build_linear_constraints(model)
    # Llevar las variables continuas a una escala manejable evita que
    # SLSQP se detenga prematuramente con gradientes pequeños en unidades físicas.
    column_scale = _continuous_column_scale(model, payoff, bounds_orig, integrality, minimum=1.0)
    bounds = _scale_bounds(bounds_orig, column_scale)
    A_ub = None if A_ub_orig is None else A_ub_orig * column_scale
    A_eq = None if A_eq_orig is None else A_eq_orig * column_scale
    scaled_alpha = alpha * column_scale

    def objective(x: np.ndarray) -> float:
        d = scaled_alpha @ x + beta
        return float(np.sum((weights * d) ** 2))

    def report(x: np.ndarray, certified: bool) -> MetricSolution:
        x = clean_solution_vector(x * column_scale, bounds_orig, integrality)
        if not is_feasible(x, A_ub_orig, b_ub, A_eq_orig, b_eq, bounds_orig, integrality, tol=1e-8):
            return MetricSolution(metric="L2", variables={}, objectives=[], normalized_distances=[],
                                  achievement_pct=[], aggregate_distance=0.0,
                                  status="error: la solución L2 no cumple el modelo original")
        return format_solution("L2", x, model, payoff, alpha, beta, weights,
                               status="optimal" if certified else "feasible_suboptimal")

    # Construir candidatos iniciales factibles
    x0_candidates: List[np.ndarray] = []
    if x0 is not None and len(x0) == n_vars:
        x0_candidates.append(np.array(x0, dtype=float) / column_scale)
    if incumbents:
        for inc in incumbents:
            if inc is not None and len(inc) == n_vars:
                x0_candidates.append(np.array(inc, dtype=float) / column_scale)
    if payoff.independent_solutions:
        ind_vecs = [np.array([sol[name] for name in var_names], dtype=float) for sol in payoff.independent_solutions]
        x0_candidates.append(np.mean(ind_vecs, axis=0) / column_scale)

    # --- CASO 1: CONTINUO PURO ---
    if integrality is None:
        best_x, _, certified = _solve_continuous_qp(scaled_alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, bounds, x0_candidates)
        if best_x is None:
            return MetricSolution(
                metric="L2",
                variables={},
                objectives=[],
                achievement_pct=[],
                normalized_distances=[],
                aggregate_distance=0.0,
                status="error: no se encontró solución factible L2",
            )
        if np.any(weights <= 1e-12):
            best_x = _tie_break_l2(
                best_x, scaled_alpha, beta, weights, column_scale,
                A_ub, b_ub, A_eq, b_eq, bounds,
                A_ub_orig, A_eq_orig, bounds_orig, integrality=None,
            )
        return report(best_x, certified)

    # --- CASO 2: MIP (ENTERO / BINARIO) — RAMIFICACIÓN Y PODA CON PRESUPUESTO ---
    int_indices = [j for j, flag in enumerate(integrality) if flag == 1]

    best_int_x: Optional[np.ndarray] = None
    best_int_val = float("inf")

    # Sembrar cota superior (incumbente) con soluciones enteras ya conocidas (L1, L_inf, óptimos independientes)
    seed_pool: List[np.ndarray] = list(x0_candidates)
    if payoff.independent_solutions:
        for sol in payoff.independent_solutions:
            seed_pool.append(np.array([sol[name] for name in var_names], dtype=float) / column_scale)

    for cand in seed_pool:
        snapped = np.array(cand, dtype=float)
        for j in int_indices:
            snapped[j] = round(float(snapped[j]))
        if is_feasible(snapped, A_ub, b_ub, A_eq, b_eq, bounds, integrality=integrality, tol=1e-8):
            val = objective(snapped)
            if val < best_int_val:
                best_int_val = val
                best_int_x = snapped

    def _polish_continuous_slice(x_int: np.ndarray, val_int: float) -> Tuple[np.ndarray, bool]:
        if len(int_indices) >= n_vars:
            return x_int, is_feasible(x_int, A_ub, b_ub, A_eq, b_eq, bounds, integrality, tol=1e-8)
        slice_bounds = list(bounds)
        for j in int_indices:
            slice_bounds[j] = (float(x_int[j]), float(x_int[j]))
        pol_x, _, pol_certified = _solve_continuous_qp(
            scaled_alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, slice_bounds, [x_int], gap_tol=1e-8
        )
        if pol_x is not None and (
            objective(pol_x) < val_int
            or not is_feasible(x_int, A_ub, b_ub, A_eq, b_eq, bounds, integrality, tol=1e-8)
        ):
            return pol_x, pol_certified
        return x_int, pol_certified and is_feasible(x_int, A_ub, b_ub, A_eq, b_eq, bounds, integrality, tol=1e-8)

    # Resolver relajación raíz
    root_x, root_lb, root_certified = _solve_continuous_qp(scaled_alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, bounds, x0_candidates)
    tree_exhausted = root_x is not None or root_certified
    if root_x is not None:
        start = time.monotonic()
        deadline = start + max_seconds
        if max_nodes > 0 and root_lb < best_int_val - 1e-7:
            # Las tangentes permiten saltar entre flujos enteros usando el
            # solver lineal entero, en vez de explorar todos los desgloses.
            best_int_x, best_int_val, certified = _refine_integer_qp(
                weights[:, None] * scaled_alpha, weights * beta,
                (A_ub, b_ub, A_eq, b_eq), bounds, integrality, [root_x, *seed_pool],
                (best_int_x, best_int_val), min(8, max_nodes), start + max_seconds / 2,
            )
            if certified and best_int_x is not None:
                best_int_x, pol_ok = _polish_continuous_slice(best_int_x, best_int_val)
                if pol_ok and np.any(weights <= 1e-12):
                    best_int_x = _tie_break_l2(
                        best_int_x, scaled_alpha, beta, weights, column_scale,
                        A_ub, b_ub, A_eq, b_eq, bounds,
                        A_ub_orig, A_eq_orig, bounds_orig, integrality=integrality,
                    )
                return report(best_int_x, pol_ok)

        # Cola de prioridad Best-First: (lower_bound, tie_breaker, node_bounds, node_x)
        heap: List[Tuple[float, int, List[Tuple[Optional[float], Optional[float]]], np.ndarray]] = []
        counter = 0
        heapq.heappush(heap, (root_lb, counter, bounds, root_x))

        nodes_explored = 0

        while heap and nodes_explored < max_nodes and time.monotonic() < deadline:
            lb_val, _, node_bounds, node_x = heapq.heappop(heap)
            if lb_val >= best_int_val - 1e-7:
                continue
            nodes_explored += 1

            # Buscar variable entera más fraccionaria
            branch_j = -1
            max_frac = 0.0
            for j in int_indices:
                frac = abs(node_x[j] - round(float(node_x[j])))
                if frac > 1e-7 and frac > max_frac:
                    max_frac = frac
                    branch_j = j

            if branch_j == -1:
                # Solución entera válida en este nodo
                snapped = np.array(node_x, dtype=float)
                for j in int_indices:
                    snapped[j] = round(float(snapped[j]))
                if is_feasible(snapped, A_ub, b_ub, A_eq, b_eq, node_bounds, integrality=integrality, tol=1e-8):
                    val = objective(snapped)
                    if val < best_int_val:
                        best_int_val = val
                        best_int_x = snapped
                if lb_val < best_int_val - 1e-7:
                    tree_exhausted = False
                continue

            # Ramificar x_j <= floor y x_j >= ceil
            fl = float(np.floor(node_x[branch_j]))
            ce = float(np.ceil(node_x[branch_j]))
            orig_lb, orig_ub = node_bounds[branch_j]

            for child_lb, child_ub in [(orig_lb, fl if orig_ub is None else min(orig_ub, fl)), (ce if orig_lb is None else max(orig_lb, ce), orig_ub)]:
                if child_lb is not None and child_ub is not None and child_lb > child_ub + 1e-12:
                    continue
                if child_lb is not None and child_ub is not None and child_lb > child_ub:
                    mid = 0.5 * (child_lb + child_ub)
                    child_lb, child_ub = mid, mid
                c_bounds = list(node_bounds)
                c_bounds[branch_j] = (child_lb, child_ub)
                c_x, c_lb, c_certified = _solve_continuous_qp(scaled_alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, c_bounds, [node_x])
                if c_x is None and not c_certified:
                    tree_exhausted = False
                if c_x is not None and c_lb < best_int_val - 1e-7:
                    counter += 1
                    heapq.heappush(heap, (c_lb, counter, c_bounds, c_x))

        # Verificar si quedaron nodos abiertos con cota inferior menor al incumbente
        while heap:
            rem_lb, _, _, _ = heapq.heappop(heap)
            if rem_lb < best_int_val - 1e-7:
                tree_exhausted = False
                break

    if best_int_x is None:
        return MetricSolution(
            metric="L2",
            variables={},
            objectives=[],
            achievement_pct=[],
            normalized_distances=[],
            aggregate_distance=0.0,
            status="error: no se encontró solución entera factible para L2",
        )

    best_int_x, pol_ok = _polish_continuous_slice(best_int_x, best_int_val)
    if tree_exhausted and pol_ok and np.any(weights <= 1e-12):
        best_int_x = _tie_break_l2(
            best_int_x, scaled_alpha, beta, weights, column_scale,
            A_ub, b_ub, A_eq, b_eq, bounds,
            A_ub_orig, A_eq_orig, bounds_orig, integrality=integrality,
        )
    return report(best_int_x, tree_exhausted and pol_ok)


def solve_all_metrics(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    weights: Optional[List[float]] = None,
    l2_max_nodes: int = 800,
    l2_max_seconds: float = 1.0,
) -> Tuple[Dict[str, MetricSolution], List[float]]:
    """
    Calcula simultáneamente las tres soluciones compromiso (L1, L2, L_inf) para un vector de pesos dado.
    """
    n_objs = len(model.objectives)
    var_names = [v.name for v in model.variables]
    if weights is None or len(weights) != n_objs:
        w_array = np.ones(n_objs, dtype=float) / n_objs
    else:
        w_array = np.array(weights, dtype=float)
        w_array = np.maximum(0.0, w_array)
        s = np.sum(w_array)
        if s > 0:
            w_array = w_array / s
        else:
            w_array = np.ones(n_objs, dtype=float) / n_objs

    alpha, beta = compute_distance_coefficients(model, payoff)

    sol_l1 = solve_l1(model, payoff, alpha, beta, w_array)
    sol_linf = solve_linf(model, payoff, alpha, beta, w_array)

    incumbents: List[np.ndarray] = []
    if sol_l1.status == "optimal" and sol_l1.variables:
        incumbents.append(np.array([sol_l1.variables[n] for n in var_names], dtype=float))
    if sol_linf.status == "optimal" and sol_linf.variables:
        incumbents.append(np.array([sol_linf.variables[n] for n in var_names], dtype=float))

    # Punto inicial: punto medio factible entre L1 y L_inf (si ambos existen) para evitar estancamiento en vértices
    x0_l2: Optional[np.ndarray] = None
    if len(incumbents) == 2:
        x0_l2 = 0.5 * (incumbents[0] + incumbents[1])
    elif len(incumbents) == 1:
        x0_l2 = incumbents[0]

    sol_l2 = solve_l2(
        model, payoff, alpha, beta, w_array,
        x0=x0_l2, incumbents=incumbents,
        max_nodes=l2_max_nodes, max_seconds=l2_max_seconds,
    )

    solutions = {
        "L1": sol_l1,
        "L2": sol_l2,
        "L_inf": sol_linf
    }
    return solutions, w_array.tolist()
