"""
Cálculo de la Matriz de Pagos, Punto Ideal y Nadir aproximado.
"""
import numpy as np
from scipy.optimize import linprog
from typing import Tuple, List, Dict, Optional
from .schemas import ModelDefinition, PayoffMatrixData

def scale_linear_objective(coefficients: np.ndarray) -> np.ndarray:
    """Usa una escala positiva para que el solver no trate todo el costo como cero."""
    scale = float(np.max(np.abs(coefficients), initial=0.0))
    return coefficients / scale if scale else coefficients


def build_linear_constraints(model: ModelDefinition) -> Tuple[
    Optional[np.ndarray], Optional[np.ndarray],
    Optional[np.ndarray], Optional[np.ndarray],
    List[Tuple[Optional[float], Optional[float]]],
    Optional[List[int]]
]:
    """
    Construye las matrices y vectores estándar para scipy.optimize.linprog:
    A_ub @ x <= b_ub
    A_eq @ x == b_eq
    bounds y vector de integrality (para MIP).
    """
    n_vars = len(model.variables)
    
    A_ub_list, b_ub_list = [], []
    A_eq_list, b_eq_list = [], []
    
    for c in model.constraints:
        coeffs = list(c.coefficients)
        if len(coeffs) < n_vars:
            coeffs += [0.0] * (n_vars - len(coeffs))
        coeffs = np.array(coeffs[:n_vars], dtype=float)
        
        rhs = float(c.rhs)
        # Equivalent rows should have the same numerical representation.
        scale = np.max(np.abs(coeffs), initial=0.0)
        if scale and np.isfinite(rhs / scale):
            coeffs = coeffs / scale
            rhs /= scale

        if c.sense == "<=":
            A_ub_list.append(coeffs)
            b_ub_list.append(rhs)
        elif c.sense == ">=":
            A_ub_list.append(-coeffs)
            b_ub_list.append(-rhs)
        elif c.sense == "==":
            A_eq_list.append(coeffs)
            b_eq_list.append(rhs)
            
    A_ub = np.array(A_ub_list) if A_ub_list else None
    b_ub = np.array(b_ub_list) if b_ub_list else None
    A_eq = np.array(A_eq_list) if A_eq_list else None
    b_eq = np.array(b_eq_list) if b_eq_list else None
    
    # Cotas y tipos de variables
    bounds = []
    integrality = []
    has_integer = False
    
    for v in model.variables:
        lb = v.lower_bound
        ub = v.upper_bound
        if v.var_type == "binary":
            lb = 0.0 if lb is None else max(0.0, lb)
            ub = 1.0 if ub is None else min(1.0, ub)
            integrality.append(1)
            has_integer = True
        elif v.var_type == "integer":
            integrality.append(1)
            has_integer = True
        else:
            integrality.append(0)
        bounds.append((lb, ub))
        
    integrality_vector = integrality if has_integer else None
    return A_ub, b_ub, A_eq, b_eq, bounds, integrality_vector

def compute_payoff_matrix(model: ModelDefinition) -> PayoffMatrixData:
    """
    Resuelve cada objetivo mono-objetivo de forma independiente y genera la matriz de pagos.
    """
    n_vars = len(model.variables)
    n_objs = len(model.objectives)
    A_ub, b_ub, A_eq, b_eq, bounds, integrality = build_linear_constraints(model)
    
    payoff_matrix = np.zeros((n_objs, n_objs), dtype=float)
    independent_solutions: List[Dict[str, float]] = []
    
    headers = [obj.name for obj in model.objectives]
    var_names = [v.name for v in model.variables]
    
    # 1. Optimización independiente de cada objetivo (con desempate lexicográfico para evitar soluciones dominadas)
    obj_dirs: List[np.ndarray] = []
    for obj in model.objectives:
        coeffs = list(obj.coefficients)
        if len(coeffs) < n_vars:
            coeffs += [0.0] * (n_vars - len(coeffs))
        arr = np.array(coeffs[:n_vars], dtype=float)
        obj_dirs.append(scale_linear_objective(-arr if obj.sense == "maximize" else arr))

    for k, obj in enumerate(model.objectives):
        c_solver = obj_dirs[k]

        res = linprog(
            c_solver,
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
            integrality=integrality,
            method="highs"
        )

        if not res.success:
            return PayoffMatrixData(
                headers=headers,
                matrix=[],
                ideal_point=[],
                anti_ideal_point=[],
                independent_solutions=[],
                degenerate_objectives=[],
                status=f"error: {res.message} en objetivo {obj.name}"
            )

        x_opt = np.array(res.x, dtype=float)

        # Desempate lexicográfico secundario: entre todos los óptimos alternativos de Z_k,
        # elegir el que mejor desempeña en los demás objetivos para no fabricar un Nadir dominado.
        if n_objs >= 2:
            z_k_opt = float(np.dot(c_solver, x_opt))
            secondary = np.zeros(n_vars, dtype=float)
            for j in range(n_objs):
                if j == k:
                    continue
                norm_j = float(np.linalg.norm(obj_dirs[j]))
                if norm_j > 1e-12:
                    secondary += obj_dirs[j] / norm_j

            if np.linalg.norm(secondary) > 1e-12:
                A_eq_lex = (
                    np.vstack([A_eq, c_solver[np.newaxis, :]])
                    if A_eq is not None and len(A_eq) > 0
                    else c_solver[np.newaxis, :]
                )
                b_eq_lex = (
                    np.concatenate([b_eq, [z_k_opt]])
                    if b_eq is not None and len(b_eq) > 0
                    else np.array([z_k_opt], dtype=float)
                )
                res_lex = linprog(
                    secondary,
                    A_ub=A_ub,
                    b_ub=b_ub,
                    A_eq=A_eq_lex,
                    b_eq=b_eq_lex,
                    bounds=bounds,
                    integrality=integrality,
                    method="highs"
                )
                if res_lex.success and res_lex.x is not None:
                    z_k_lex = float(np.dot(c_solver, res_lex.x))
                    if z_k_lex <= z_k_opt + 1e-9 * max(1.0, abs(z_k_opt)):
                        x_opt = np.array(res_lex.x, dtype=float)

        # Limpiar tolerancias de integralidad y ruido de cotas
        if integrality is not None:
            for j, flag in enumerate(integrality):
                if flag == 1 and abs(x_opt[j] - round(float(x_opt[j]))) < 1e-5:
                    x_opt[j] = float(round(float(x_opt[j])))
        for j, (lb, ub) in enumerate(bounds):
            if lb is not None and abs(x_opt[j] - lb) < 1e-9:
                x_opt[j] = lb
            if ub is not None and abs(x_opt[j] - ub) < 1e-9:
                x_opt[j] = ub

        independent_solutions.append({var_names[j]: float(x_opt[j]) for j in range(n_vars)})

        # Evaluar todos los objetivos bajo esta solución óptima x^(k)*
        for i, eval_obj in enumerate(model.objectives):
            eval_coeffs = list(eval_obj.coefficients)
            if len(eval_coeffs) < n_vars:
                eval_coeffs += [0.0] * (n_vars - len(eval_coeffs))
            eval_coeffs = np.array(eval_coeffs[:n_vars], dtype=float)
            val = float(np.dot(eval_coeffs, x_opt))
            payoff_matrix[k, i] = val

    # 2. Determinar punto ideal, referencia de pagos y escalas
    ideal_point = []
    anti_ideal_point = []
    degenerate_objectives: List[int] = []
    normalization_ranges = []
    normalization_sources = []

    payoff_vectors = np.abs(np.array([list(row.values()) for row in independent_solutions]))
    for i, obj in enumerate(model.objectives):
        col_vals = payoff_matrix[:, i]
        if obj.sense == "maximize":
            z_ideal = float(np.max(col_vals))
            z_anti = float(np.min(col_vals))
        else:
            z_ideal = float(np.min(col_vals))
            z_anti = float(np.max(col_vals))

        scale = abs(z_ideal - z_anti)
        source = "payoff"
        # Comparar con el redondeo de la evaluación, en unidades del criterio.
        # Una tolerancia absoluta anularía objetivos pequeños pero válidos.
        coefficients = np.abs(np.asarray(obj.coefficients, dtype=float))
        magnitude = float(np.max(payoff_vectors[:, :len(coefficients)] @ coefficients))
        roundoff = 16 * np.finfo(float).eps * magnitude
        if scale <= roundoff:
            degenerate_objectives.append(i)
            # La referencia de pagos se conserva. Solo se sustituye el denominador.
            worst = linprog(
                -obj_dirs[i], A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
                bounds=bounds, integrality=integrality, method="highs",
            )
            if worst.success:
                original = np.asarray(obj.coefficients, dtype=float)
                z_worst = float(original @ worst.x[:len(original)])
                scale = max(0.0, z_ideal - z_worst if obj.sense == "maximize" else z_worst - z_ideal)
                worst_magnitude = float(np.abs(original) @ np.abs(worst.x[:len(original)]))
                if scale > max(roundoff, 16 * np.finfo(float).eps * worst_magnitude):
                    source = "feasible_range"
                else:
                    scale, source = 1.0, "constant"
            else:
                # Sin peor extremo verificable, una unidad del objetivo sirve de escala explícita.
                scale, source = 1.0, "unit"
        normalization_ranges.append(scale)
        normalization_sources.append(source)

        ideal_point.append(z_ideal)
        anti_ideal_point.append(z_anti)

    decision_ranges = None
    if n_vars == 2:
        decision_ranges = []
        for axis in np.eye(2):
            endpoints = []
            for direction in (1, -1):
                projection = linprog(
                    direction * axis, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq,
                    bounds=bounds, method="highs",
                )
                endpoints.append(float(direction * projection.fun) if projection.success else None)
            decision_ranges.append(tuple(endpoints))

    return PayoffMatrixData(
        headers=headers,
        matrix=payoff_matrix.tolist(),
        ideal_point=ideal_point,
        anti_ideal_point=anti_ideal_point,
        independent_solutions=independent_solutions,
        degenerate_objectives=degenerate_objectives,
        normalization_ranges=normalization_ranges,
        normalization_sources=normalization_sources,
        decision_ranges_2d=decision_ranges,
        status="optimal"
    )
