"""Regresiones numéricas y del contrato HTTP de OptiCompromise."""
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from scipy.optimize import linprog

from core.compromise import solve_all_metrics
from core.payoff import compute_payoff_matrix
from core.schemas import ModelDefinition
from index import app


EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


def example(filename):
    return ModelDefinition.model_validate_json((EXAMPLES / filename).read_text())


class TestAuditRegressions(unittest.TestCase):
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
