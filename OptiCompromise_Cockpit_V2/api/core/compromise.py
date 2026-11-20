"""
Solvers para Programación de Compromiso Multiobjetivo:
Métricas L1 (Lineal), L_inf (Minimax Lineal) y L2 (Cuadrática Convexa / MIQP Branch-and-Bound).
"""
import heapq
import time
import numpy as np
from scipy.linalg import qr
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

def _clean_solution_vector(
    x: np.ndarray,
    bounds: List[Tuple[Optional[float], Optional[float]]],
    integrality: Optional[List[int]] = None,
) -> np.ndarray:
    """Limpia tolerancias numéricas en cotas y variables enteras/binarias."""
    cleaned = np.array(x, dtype=float)
    if integrality is not None:
        for j, flag in enumerate(integrality):
            if flag == 1 and abs(cleaned[j] - round(float(cleaned[j]))) < 1e-5:
                cleaned[j] = float(round(float(cleaned[j])))
    for j, (lb, ub) in enumerate(bounds):
        if lb is not None and abs(cleaned[j] - lb) < 1e-9:
            cleaned[j] = lb
        if ub is not None and abs(cleaned[j] - ub) < 1e-9:
            cleaned[j] = ub
    return cleaned


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
    A_ub, b_ub, A_eq, b_eq, bounds, integrality = build_linear_constraints(model)

    c_l1 = weights @ alpha

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

    x = res.x
    if np.any(weights == 0):
        # Escalar la igualdad protege la prioridad de objetivos con coeficientes pequeños.
        scale = np.max(np.abs(c_l1))
        if scale > 0:
            primary = c_l1 / scale
            A_eq = np.vstack([A_eq, primary]) if A_eq is not None else primary[None, :]
            b_eq = np.append(b_eq, primary @ x) if b_eq is not None else [primary @ x]
        tie = linprog(alpha.sum(axis=0), A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
                      bounds=bounds, integrality=integrality, method="highs")
        if tie.success:
            x = tie.x
    x_clean = _clean_solution_vector(x, bounds, integrality)
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

    # Solve in scaled coordinates for large continuous variables. Integer
    # coordinates stay unchanged to preserve their original lattice.
    column_scale = np.array([
        max(1.0, abs(lo or 0.0), abs(hi or 0.0))
        if integrality_orig is None or not integrality_orig[j] else 1.0
        for j, (lo, hi) in enumerate(bounds_orig)
    ])
    column_scale[column_scale < 1e4] = 1.0
    scaled_bounds = [
        tuple(None if bound is None else bound / scale for bound in bounds)
        for bounds, scale in zip(bounds_orig, column_scale)
    ]

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

    tie = linprog(
        np.append(alpha.sum(axis=0) * column_scale, 0.0),
        A_ub=A_ub_total,
        b_ub=b_ub_total,
        A_eq=A_eq_total,
        b_eq=b_eq_total,
        bounds=scaled_bounds + [(res.x[-1], res.x[-1])],
        integrality=integrality_total,
        method="highs",
    )
    x = tie.x if tie.success else res.x
    x_opt = _clean_solution_vector(x[:n_vars] * column_scale, bounds_orig, integrality_orig)
    if not _is_feasible(x_opt, A_ub_orig, b_ub_orig, A_eq_orig, b_eq_orig, bounds_orig, integrality_orig):
        return MetricSolution(metric="L_inf", variables={}, objectives=[], achievement_pct=[],
                              normalized_distances=[], aggregate_distance=0.0,
                              status="error: la solución minimax no cumple el modelo original")
    distance = np.max(weights * (alpha @ x_opt + beta))
    status = "optimal" if abs(distance - res.x[-1]) <= 1e-7 else "feasible_suboptimal"
    return format_solution("L_inf", x_opt, model, payoff, alpha, beta, weights, status=status)

def _is_feasible(
    x: np.ndarray,
    A_ub: Optional[np.ndarray],
    b_ub: Optional[np.ndarray],
    A_eq: Optional[np.ndarray],
    b_eq: Optional[np.ndarray],
    bounds: List[Tuple[Optional[float], Optional[float]]],
    integrality: Optional[List[int]] = None,
    tol: float = 1e-7,
) -> bool:
    """Verifica estrictamente factibilidad (cotas, desigualdades, igualdades e integralidad)."""
    if x is None or len(x) != len(bounds) or not np.all(np.isfinite(x)):
        return False
    for j, (lb, ub) in enumerate(bounds):
        if lb is not None and x[j] < lb - tol:
            return False
        if ub is not None and x[j] > ub + tol:
            return False
    if A_ub is not None and b_ub is not None and len(b_ub) > 0:
        scale_ub = np.maximum(np.linalg.norm(A_ub, axis=1), np.maximum(np.abs(b_ub), 1.0))
        if np.any((A_ub @ x - b_ub) / scale_ub > tol):
            return False
    if A_eq is not None and b_eq is not None and len(b_eq) > 0:
        scale_eq = np.maximum(np.linalg.norm(A_eq, axis=1), np.maximum(np.abs(b_eq), 1.0))
        if np.any(np.abs(A_eq @ x - b_eq) / scale_eq > tol):
            return False
    if integrality is not None:
        for j, is_int in enumerate(integrality):
            if is_int == 1 and abs(x[j] - round(float(x[j]))) > 1e-7:
                return False
    return True


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
) -> Tuple[Optional[np.ndarray], float, bool]:
    """
    Resuelve la relajación cuadrática continua Min sum(w_i * (alpha_i^T x + beta_i)^2)
    con restricciones escaladas por fila para estabilidad numérica de SLSQP.
    """
    n_vars = len(bounds)

    # Verificar que las cotas no sean vacías (lb > ub)
    for lb, ub in bounds:
        if lb is not None and ub is not None and lb > ub + 1e-9:
            return None, float("inf"), True

    def objective(x: np.ndarray) -> float:
        d = alpha @ x + beta
        return float(np.sum(weights * (d ** 2)))

    def jacobian(x: np.ndarray) -> np.ndarray:
        d = alpha @ x + beta
        return 2.0 * (alpha.T @ (weights * d))

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
        if _is_feasible(x_init, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-7):
            val = objective(x_init)
            if val < best_val:
                best_val = val
                best_x = np.array(x_init, dtype=float)

    for x_init in starts[:2]:
        res = minimize(
            objective,
            x_init,
            jac=jacobian,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": 400, "ftol": 1e-11},
        )
        if res.x is not None and _is_feasible(res.x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-7):
            val = objective(res.x)
            if val < best_val:
                best_val = val
                best_x = np.array(res.x, dtype=float)

    # Si SLSQP no encontró punto factible, intentar encontrar un punto factible con HiGHS y re-optimizar
    if best_x is None:
        feas = linprog(
            np.zeros(n_vars, dtype=float),
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
            method="highs",
        )
        if not feas.success or feas.x is None:
            return None, float("inf"), feas.status == 2
        best_x = np.array(feas.x, dtype=float)
        best_val = objective(best_x)
        res = minimize(
            objective,
            best_x,
            jac=jacobian,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": 400, "ftol": 1e-10},
        )
        if res.x is not None and _is_feasible(res.x, A_ub, b_ub, A_eq, b_eq, bounds, integrality=None, tol=1e-7):
            val = objective(res.x)
            if val < best_val:
                best_val = val
                best_x = np.array(res.x, dtype=float)

    # Para una cuadrática convexa, la tangente es un minorante global.
    # Su mínimo sobre el poliedro certifica una cota inferior para la poda.
    gradient = jacobian(best_x)
    scale = float(np.max(np.abs(gradient)))
    if scale == 0.0:
        return best_x, best_val, True
    certificate = linprog(
        gradient / scale, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
        bounds=bounds, method="highs",
    )
    if not certificate.success:
        return best_x, 0.0, False
    gap = max(0.0, float(gradient @ (best_x - certificate.x)))
    return best_x, max(0.0, best_val - gap), gap <= 1e-7


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
    Min sum(w_i * (alpha_i^T @ x + beta_i)^2)
    s.a. restricciones originales.
    - Para LP continuo: SLSQP con restricciones normalizadas y validación estricta de factibilidad.
    - Para MIP: Branch-and-Bound Best-First con presupuesto de tiempo y nodos.
    """
    n_vars = len(model.variables)
    var_names = [v.name for v in model.variables]
    A_ub, b_ub, A_eq, b_eq, bounds, integrality = build_linear_constraints(model)

    def objective(x: np.ndarray) -> float:
        d = alpha @ x + beta
        return float(np.sum(weights * (d ** 2)))

    # Construir candidatos iniciales factibles
    x0_candidates: List[np.ndarray] = []
    if x0 is not None and len(x0) == n_vars:
        x0_candidates.append(np.array(x0, dtype=float))
    if incumbents:
        for inc in incumbents:
            if inc is not None and len(inc) == n_vars:
                x0_candidates.append(np.array(inc, dtype=float))
    if payoff.independent_solutions:
        ind_vecs = [np.array([sol[name] for name in var_names], dtype=float) for sol in payoff.independent_solutions]
        x0_candidates.append(np.mean(ind_vecs, axis=0))

    # --- CASO 1: CONTINUO PURO ---
    if integrality is None:
        best_x, _, certified = _solve_continuous_qp(alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, bounds, x0_candidates)
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
        best_x = _clean_solution_vector(best_x, bounds, None)
        return format_solution(
            "L2", best_x, model, payoff, alpha, beta, weights,
            status="optimal" if certified else "feasible_suboptimal",
        )

    # --- CASO 2: MIP (ENTERO / BINARIO) — BRANCH AND BOUND EXACTO ---
    int_indices = [j for j, flag in enumerate(integrality) if flag == 1]

    best_int_x: Optional[np.ndarray] = None
    best_int_val = float("inf")

    # Sembrar cota superior (incumbente) con soluciones enteras ya conocidas (L1, L_inf, óptimos independientes)
    seed_pool: List[np.ndarray] = list(x0_candidates)
    if payoff.independent_solutions:
        for sol in payoff.independent_solutions:
            seed_pool.append(np.array([sol[name] for name in var_names], dtype=float))

    for cand in seed_pool:
        snapped = np.array(cand, dtype=float)
        for j in int_indices:
            snapped[j] = round(float(snapped[j]))
        if _is_feasible(snapped, A_ub, b_ub, A_eq, b_eq, bounds, integrality=integrality, tol=1e-7):
            val = objective(snapped)
            if val < best_int_val:
                best_int_val = val
                best_int_x = snapped

    # Resolver relajación raíz
    root_x, root_lb, root_certified = _solve_continuous_qp(alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, bounds, x0_candidates)
    tree_exhausted = root_x is not None or root_certified
    if root_x is not None:
        # Cola de prioridad Best-First: (lower_bound, tie_breaker, node_bounds, node_x)
        heap: List[Tuple[float, int, List[Tuple[Optional[float], Optional[float]]], np.ndarray]] = []
        counter = 0
        heapq.heappush(heap, (root_lb, counter, bounds, root_x))

        t_start = time.monotonic()
        nodes_explored = 0

        while heap and nodes_explored < max_nodes and (time.monotonic() - t_start) < max_seconds:
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
                if _is_feasible(snapped, A_ub, b_ub, A_eq, b_eq, bounds, integrality=integrality, tol=1e-7):
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
                if child_lb is not None and child_ub is not None and child_lb > child_ub + 1e-9:
                    continue
                c_bounds = list(node_bounds)
                c_bounds[branch_j] = (child_lb, child_ub)
                c_x, c_lb, c_certified = _solve_continuous_qp(alpha, beta, weights, A_ub, b_ub, A_eq, b_eq, c_bounds, [node_x])
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

    best_int_x = _clean_solution_vector(best_int_x, bounds, integrality)
    sol_status = "optimal" if tree_exhausted else "feasible_suboptimal"
    return format_solution("L2", best_int_x, model, payoff, alpha, beta, weights, status=sol_status)


def solve_all_metrics(
    model: ModelDefinition,
    payoff: PayoffMatrixData,
    weights: Optional[List[float]] = None
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

    sol_l2 = solve_l2(model, payoff, alpha, beta, w_array, x0=x0_l2, incumbents=incumbents)

    solutions = {
        "L1": sol_l1,
        "L2": sol_l2,
        "L_inf": sol_linf
    }
    return solutions, w_array.tolist()
