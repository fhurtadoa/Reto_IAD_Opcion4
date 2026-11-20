"""Regresiones numéricas y del contrato HTTP de OptiCompromise."""
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from scipy.optimize import linprog

from core.compromise import compute_distance_coefficients, solve_all_metrics, solve_l2
from core.pareto import compute_pareto_frontier
from core.payoff import compute_payoff_matrix
from core.schemas import ModelDefinition
from index import app


EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


def example(filename):
    return ModelDefinition.model_validate_json((EXAMPLES / filename).read_text())


class TestAuditRegressions(unittest.TestCase):
    def test_class15_weight_is_squared_in_lp_tradeoff_and_sensitivity(self):
        # d1=1-x, d2=x. The analytic minimizer is w1²/(w1²+w2²).
        model = ModelDefinition.model_validate({
            "variables": [{"name": "x", "upper_bound": 1}],
            "objectives": [
                {"name": "Max x", "sense": "maximize", "coefficients": [1]},
                {"name": "Min x", "sense": "minimize", "coefficients": [1]},
            ],
            "weights": [0.8, 0.2],
        })
        result = TestClient(app).post("/api/solve", json=model.model_dump())
        self.assertEqual(result.status_code, 200)
        body = result.json()
        l2 = body["solutions"]["L2"]
        optimum = 16 / 17
        self.assertAlmostEqual(l2["variables"]["x"], optimum, places=7)
        self.assertAlmostEqual(l2["aggregate_distance"], 0.8 / np.sqrt(17), places=7)
        self.assertAlmostEqual(body["solutions"]["L_inf"]["variables"]["x"], 0.8)
        sweep = body["weight_sensitivity"]["l2"]
        np.testing.assert_allclose(sweep[16]["deviations_pct"], [100 / 17, 1600 / 17])
        self.assertEqual(sweep[0]["deviations_pct"], [100, 0])
        self.assertEqual(sweep[-1]["deviations_pct"], [0, 100])

    def test_paper_asymmetric_weights_match_class_notebook(self):
        model = example("06_produccion_papel.json")
        model.constraints[3].rhs = 83
        model.weights = [0.56, 0.44]
        payoff = compute_payoff_matrix(model)
        solutions, _ = solve_all_metrics(model, payoff, model.weights)
        # Valores publicados con redondeo en el entregable del Taller 3, celda 12.
        self.assertEqual(solutions["L2"].status, "optimal")
        np.testing.assert_allclose(solutions["L2"].objectives, [33727.49, 22062.27], rtol=0, atol=0.02)
        self.assertAlmostEqual(solutions["L2"].aggregate_distance, 0.33333, places=5)

    def test_l2_integer_matches_enumeration_and_reports_cutoff(self):
        model = ModelDefinition.model_validate({
            "variables": [{"name": "x", "var_type": "integer", "upper_bound": 5}],
            "objectives": [
                {"name": "Max x", "sense": "maximize", "coefficients": [1]},
                {"name": "Min x", "sense": "minimize", "coefficients": [1]},
            ],
        })
        payoff = compute_payoff_matrix(model)
        weights = np.array([0.65, 0.35])
        expected = min(range(6), key=lambda x: (0.65 * (1 - x/5))**2 + (0.35 * x/5)**2)
        solutions, _ = solve_all_metrics(model, payoff, weights.tolist())
        self.assertEqual(solutions["L2"].status, "optimal")
        self.assertEqual(solutions["L2"].variables["x"], expected)
        alpha, beta = compute_distance_coefficients(model, payoff)
        partial = solve_l2(model, payoff, alpha, beta, weights, max_nodes=0)
        self.assertEqual(partial.status, "feasible_suboptimal")
        self.assertIn(partial.variables["x"], range(6))

    def test_zero_payoff_span_distinguishes_constant_and_variable_criteria(self):
        model = ModelDefinition.model_validate({
            "variables": [{"name": "x", "upper_bound": 5}, {"name": "y"}],
            "objectives": [
                {"name": "Max x", "sense": "maximize", "coefficients": [1, 0]},
                {"name": "Min y", "sense": "minimize", "coefficients": [0, 1]},
                {"name": "Constante", "sense": "maximize", "coefficients": [0, 0]},
            ],
        })
        payoff = compute_payoff_matrix(model)
        self.assertEqual(payoff.ideal_point, [5, 0, 0])
        self.assertEqual(payoff.anti_ideal_point, [5, 0, 0])
        self.assertEqual(payoff.normalization_sources, ["feasible_range", "unit", "constant"])
        self.assertEqual(payoff.normalization_ranges, [5, 1, 1])
        alpha, beta = compute_distance_coefficients(model, payoff)
        np.testing.assert_allclose(alpha @ [0, 3] + beta, [1, 3, 0])

    def test_payoff_nadir_is_not_a_bound_on_efficient_achievement(self):
        model = ModelDefinition.model_validate({
            "variables": [{"name": f"a{i}"} for i in range(4)],
            "constraints": [{"coefficients": [1, 1, 1, 1], "sense": "==", "rhs": 1}],
            "objectives": [
                {"name": "Z1", "coefficients": [10, 0, 5, 6]},
                {"name": "Z2", "coefficients": [0, 10, 5, 6]},
                {"name": "Z3", "coefficients": [5, 5, 10, 0]},
            ],
        })
        payoff = compute_payoff_matrix(model)
        self.assertEqual(payoff.anti_ideal_point, [0, 0, 5])
        solutions, _ = solve_all_metrics(model, payoff, [0.5, 0.5, 0])
        # D maximiza de forma única Z1+Z2. Su tercer objetivo queda bajo la referencia.
        l1 = solutions["L1"]
        self.assertEqual(l1.objectives, [6, 6, 0])
        self.assertEqual(l1.normalized_distances[2], 2)
        self.assertEqual(l1.achievement_pct[2], -100)

    def test_pareto_sample_preserves_partial_solver_status(self):
        model = ModelDefinition.model_validate({
            "variables": [{"name": "x", "upper_bound": 1}],
            "objectives": [
                {"name": "Max x", "sense": "maximize", "coefficients": [1]},
                {"name": "Min x", "sense": "minimize", "coefficients": [1]},
            ],
        })
        payoff = compute_payoff_matrix(model)
        def partial(*args, **kwargs):
            solution = solve_l2(*args, **kwargs)
            return solution.model_copy(update={"status": "feasible_suboptimal"})

        with patch("core.pareto.solve_l2", side_effect=partial):
            points = compute_pareto_frontier(model, payoff, num_samples=5)
        l2_points = [p for p in points if p.metric == "L2"]
        self.assertTrue(l2_points)
        self.assertTrue(all(p.status == "feasible_suboptimal" for p in l2_points))

    def test_minimax_with_large_variable_bounds(self):
        model = ModelDefinition.model_validate({
            "name": "Escala de minimax",
            "variables": [{"name": "x", "upper_bound": 1e9}],
            "objectives": [
                {"name": "Min x", "sense": "minimize", "coefficients": [1]},
                {"name": "Max x", "sense": "maximize", "coefficients": [1]},
            ],
            "weights": [0.5, 0.5],
        })
        solutions, _ = solve_all_metrics(model, compute_payoff_matrix(model), model.weights)
        self.assertEqual(solutions["L_inf"].status, "optimal")
        self.assertAlmostEqual(solutions["L_inf"].variables["x"] / 1e9, 0.5)
        self.assertAlmostEqual(solutions["L_inf"].aggregate_distance, 0.25)

    def test_equivalent_constraint_row_scales(self):
        for scale in (1e-12, 1e-10, 1.0, 1e12):
            with self.subTest(scale=scale):
                response = TestClient(app).post("/api/solve", json={
                    "name": "Escala de restricción",
                    "variables": [{"name": "x", "upper_bound": 2}],
                    "objectives": [
                        {"name": "Min x", "sense": "minimize", "coefficients": [1]},
                        {"name": "Max x", "sense": "maximize", "coefficients": [1]},
                    ],
                    "constraints": [{"sense": ">=", "coefficients": [scale], "rhs": scale}],
                    "weights": [0.5, 0.5],
                })
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["payoff"]["ideal_point"], [1.0, 2.0])
                self.assertEqual(data["solutions"]["L_inf"]["status"], "optimal")
                self.assertAlmostEqual(data["solutions"]["L_inf"]["variables"]["x"], 1.5)
                self.assertTrue(all(sol["variables"]["x"] >= 1 for sol in data["solutions"].values()))

    def test_pareto_preserves_tradeoff_under_rescaling(self):
        response = TestClient(app).post("/api/solve", json={
            "name": "Canje",
            "variables": [{"name": "x", "upper_bound": 1}, {"name": "y", "upper_bound": 1}],
            "objectives": [
                {"name": "Min x", "sense": "minimize", "coefficients": [5e-7, 0]},
                {"name": "Min y", "sense": "minimize", "coefficients": [0, 1]},
            ],
            "constraints": [{"sense": ">=", "coefficients": [1, 1], "rhs": 1}],
        })
        self.assertEqual(response.status_code, 200)
        points = response.json()["pareto_points"]
        self.assertGreater(len(points), 2)
        self.assertAlmostEqual(min(p["objectives"][1] for p in points), 0)
        self.assertAlmostEqual(max(p["objectives"][1] for p in points), 1)

    def test_celdas_l2_matches_analytic_solution(self):
        model = example("01_celdas_fotovoltaicas.json")
        solutions, _ = solve_all_metrics(model, compute_payoff_matrix(model), model.weights)
        solution = solutions["L2"]

        # En la arista x1=0, el óptimo satisface d(D1²+D2²)/dx2=0.
        x2 = (0.006 * 1.6 + 0.005 * 0.5) / (0.006**2 + 0.005**2)
        x = list(solution.variables.values())
        np.testing.assert_allclose(x, [0, x2], atol=1e-5)
        np.testing.assert_allclose(solution.objectives, [3000 * x2, 2 * x2], atol=0.02)
        self.assertEqual(solution.status, "optimal")

    def test_transport_l2_has_supporting_hyperplane(self):
        model = example("02_problema_transporte.json")
        solutions, _ = solve_all_metrics(model, compute_payoff_matrix(model), model.weights)
        expected = np.array([17400, 3600])
        np.testing.assert_allclose(solutions["L2"].objectives, expected, atol=0.1)
        np.testing.assert_allclose(solutions["L_inf"].objectives, [17382.3288, 3661.8790], atol=0.1)

        # Verificación independiente: la tangente del objetivo cuadrático en el
        # resultado publicado debe soportar el conjunto factible de transporte.
        c = np.array([o.coefficients for o in model.objectives])
        z_ideal = np.array([16800, 2600])
        ranges = np.array([1700, 3100])
        tangent_weights = (expected - z_ideal) / ranges**2
        signs = np.array([1 if row.sense == "<=" else -1 for row in model.constraints])
        rows = np.array([row.coefficients for row in model.constraints])
        rhs = np.array([row.rhs for row in model.constraints])
        support = linprog(tangent_weights @ c, A_ub=rows * signs[:, None], b_ub=rhs * signs)
        self.assertTrue(support.success)
        self.assertAlmostEqual(support.fun, tangent_weights @ expected, places=7)

    def test_new_model_minimax_does_not_force_equal_achievement(self):
        model = ModelDefinition.model_validate({
            "variables": [
                {"name": "x", "upper_bound": 1}, {"name": "y", "upper_bound": 1},
            ],
            "objectives": [
                {"name": "Beneficio", "coefficients": [1, 0]},
                {"name": "Costo", "sense": "minimize", "coefficients": [1, 0]},
                {"name": "Cuota", "coefficients": [0, 1]},
            ],
            "constraints": [{"coefficients": [0, 1], "sense": "==", "rhs": 1}],
            "weights": [1 / 3] * 3,
        })
        # Agregar igualdades redundantes no debe impedir que SLSQP halle el punto interior.
        equality = model.constraints[0]
        model.constraints += [equality, equality]
        payoff = compute_payoff_matrix(model)
        self.assertEqual(payoff.ideal_point, [1, 0, 1])
        self.assertEqual(payoff.anti_ideal_point, [0, 1, 1])
        self.assertEqual(payoff.degenerate_objectives, [2])
        solutions, _ = solve_all_metrics(model, payoff, model.weights)
        self.assertAlmostEqual(solutions["L2"].variables["x"], 0.5)
        self.assertEqual(solutions["L2"].status, "optimal")
        self.assertAlmostEqual(solutions["L_inf"].variables["x"], 0.5)
        np.testing.assert_allclose(solutions["L_inf"].achievement_pct, [50, 50, 100])
        self.assertAlmostEqual(solutions["L_inf"].aggregate_distance, 1 / 6)

    def test_decision_plot_bounds_follow_constraints_without_explicit_limits(self):
        model = ModelDefinition.model_validate({
            "variables": [
                {"name": "x", "lower_bound": None}, {"name": "y", "lower_bound": None},
            ],
            "objectives": [
                {"name": "Actividad", "coefficients": [1, 0]},
                {"name": "Costo", "sense": "minimize", "coefficients": [1, 0]},
            ],
            "constraints": [
                {"coefficients": [1, 0], "sense": ">=", "rhs": -3000},
                {"coefficients": [1, 0], "sense": "<=", "rhs": -2000},
                {"coefficients": [0, 1], "sense": "==", "rhs": -5000},
            ],
        })
        payoff = compute_payoff_matrix(model)
        self.assertEqual(payoff.status, "optimal")
        self.assertEqual(payoff.decision_ranges_2d, [(-3000, -2000), (-5000, -5000)])

    def test_api_rejects_wrong_weights_without_silently_correcting(self):
        payload = json.loads((EXAMPLES / "01_celdas_fotovoltaicas.json").read_text())
        with TestClient(app) as client:
            for weights in ([0.4, 0.4], [-0.2, 1.2], [1]):
                response = client.post("/api/solve", json={**payload, "weights": weights})
                self.assertEqual(response.status_code, 400)
                self.assertIn("pesos deben sumar 1", response.json()["detail"])

    def test_stalled_qp_is_reported_as_feasible_not_optimal(self):
        model = example("01_celdas_fotovoltaicas.json")
        # Simula una parada de SLSQP sin progreso, conservando el punto factible.
        def stalled(_fun, x0, **_options):
            return SimpleNamespace(x=x0, success=False)

        with patch("core.compromise.minimize", side_effect=stalled):
            response = TestClient(app).post("/api/solve", json=model.model_dump())
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["solutions"]["L2"]["status"], "feasible_suboptimal")
        self.assertEqual(result["solutions"]["L1"]["status"], "optimal")


if __name__ == "__main__":
    unittest.main()
