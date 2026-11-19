"""
Cálculo de la Matriz de Pagos, Punto Ideal y Anti-Ideal (Nadir aproximado).
"""
import numpy as np
from scipy.optimize import linprog
from typing import Tuple, List, Dict, Optional
from .schemas import ModelDefinition, PayoffMatrixData

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
        
        if c.sense == "<=":
            A_ub_list.append(coeffs)
            b_ub_list.append(float(c.rhs))
        elif c.sense == ">=":
            A_ub_list.append(-coeffs)
            b_ub_list.append(-float(c.rhs))
        elif c.sense == "==":
            A_eq_list.append(coeffs)
            b_eq_list.append(float(c.rhs))
            
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
    
    # 1. Optimización independiente de cada objetivo
    for k, obj in enumerate(model.objectives):
        coeffs = list(obj.coefficients)
        if len(coeffs) < n_vars:
            coeffs += [0.0] * (n_vars - len(coeffs))
        coeffs = np.array(coeffs[:n_vars], dtype=float)
        
        # linprog siempre minimiza: si es maximize, multiplicamos por -1
        c_solver = -coeffs if obj.sense == "maximize" else coeffs
        
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
                status=f"error: {res.message} en objetivo {obj.name}"
            )
            
        x_opt = res.x
        independent_solutions.append({var_names[j]: float(x_opt[j]) for j in range(n_vars)})
        
        # Evaluar todos los objetivos bajo esta solución óptima x^(k)*
        for i, eval_obj in enumerate(model.objectives):
            eval_coeffs = list(eval_obj.coefficients)
            if len(eval_coeffs) < n_vars:
                eval_coeffs += [0.0] * (n_vars - len(eval_coeffs))
            eval_coeffs = np.array(eval_coeffs[:n_vars], dtype=float)
            val = float(np.dot(eval_coeffs, x_opt))
            payoff_matrix[k, i] = val
            
    # 2. Determinar Punto Ideal y Punto Anti-Ideal (Nadir aproximado)
    ideal_point = []
    anti_ideal_point = []
    
    for i, obj in enumerate(model.objectives):
        col_vals = payoff_matrix[:, i]
        if obj.sense == "maximize":
            z_ideal = float(np.max(col_vals))
            z_anti = float(np.min(col_vals))
        else:
            z_ideal = float(np.min(col_vals))
            z_anti = float(np.max(col_vals))
            
        # Prevención de división por cero si ideal == peor
        if np.isclose(z_ideal, z_anti):
            delta = abs(z_ideal) * 0.05 if not np.isclose(z_ideal, 0.0) else 1.0
            if obj.sense == "maximize":
                z_anti = z_ideal - delta
            else:
                z_anti = z_ideal + delta
                
        ideal_point.append(z_ideal)
        anti_ideal_point.append(z_anti)
        
    return PayoffMatrixData(
        headers=headers,
        matrix=payoff_matrix.tolist(),
        ideal_point=ideal_point,
        anti_ideal_point=anti_ideal_point,
        independent_solutions=independent_solutions,
        status="optimal"
    )
