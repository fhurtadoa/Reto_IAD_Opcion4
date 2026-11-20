"""Contraste de las descargas de navegador con CBC y Clarabel."""
import csv
import json
from pathlib import Path
import sys

import cvxpy as cp
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "validacion_iad"))
from oraculo import Reference, feasibility


class EnergyReference(Reference):
    def __init__(self, model):
        self.model = model
        self.c = np.array([o["coefficients"] for o in model["objectives"]])
        self.sign = np.array([1, 1, -1])
        self.f = self.c * self.sign[:, None]
        self.integer = False

    def payments(self):
        rows = []
        for k in range(3):
            fixed = []
            for j in (k, (k+1) % 3, (k+2) % 3):
                x = self.linear(self.f[j], fixed)
                fixed.append((self.f[j], "==", round(self.f[j] @ x, 2)))
            rows.append(self.c @ x)
        return np.array(rows)

    def solve_with_payments(self, weights, pay):
        # La matriz se contrasta aparte. Usar sus valores aquí compara las
        # métricas sobre exactamente las referencias publicadas en la UI.
        signed = pay * self.sign
        self.ideal = signed.diagonal()
        self.ranges = np.ptp(pay, axis=0)
        for i in np.flatnonzero(self.ranges <= 1e-7):
            worst = self.linear(-self.f[i])
            self.ranges[i] = max(0., self.f[i] @ worst - self.ideal[i])
        scales = np.where(self.ranges > 1e-7, self.ranges, 1)
        effective_weights = np.array(weights) * (self.ranges > 1e-7)
        x = cp.Variable(self.f.shape[1], nonneg=True)
        rows = []
        for row in self.model["constraints"]:
            a = np.asarray(row["coefficients"])
            target = row["rhs"]
            left = a @ (10000*x)
            scale = max(abs(target),1)
            rows.append(left / scale <= target / scale if row["sense"] == "<=" else left / scale >= target / scale)
        weighted = cp.multiply(effective_weights/scales,self.f @ (10000*x)-self.ideal)
        answers = {}
        for m, expression in [("L1",cp.sum(weighted)),("L2",cp.norm(weighted,2)),("L_inf",cp.max(weighted))]:
            p = cp.Problem(cp.Minimize(expression),rows)
            p.solve(solver="CLARABEL",tol_gap_abs=1e-10,tol_gap_rel=1e-10,tol_feas=1e-10)
            assert p.status == "optimal", p.status
            answers[m] = float(p.value)
        return answers


def run(id, evidence):
    obs = json.loads((evidence / f"{id}.json").read_text())
    model, app = obs["payload"], obs["result"]
    domain = id == "mochila"
    if domain:
        fixture = json.loads((evidence.parent / "mochila.json").read_text())
        for key in ("variables","objectives","constraints"):
            assert [{k: v for k,v in row.items() if v is not None} for row in model[key]] == fixture[key], key
        assert model["weights"] == fixture["weights"]
        model["variables"] = [dict(v,var_type="integer") for v in model["variables"]]
        ref = Reference(model)
        reference_pay = ref.payoff
        weights = np.asarray(app["weights"])
        lin = ref.linear((weights/ref.ranges) @ ref.f)
        inf = ref.linear(None,minimax=weights)
        quad, num = ref.integer_quadratic(weights, inf)
        expected = {m: float(fn(ref.weighted(x,weights))) for m,x,fn in
                    [("L1",lin,np.sum),("L2",quad,np.linalg.norm),("L_inf",inf,np.max)]}
    else:
        assert set(v["name"] for v in model["variables"]) == set("lb lm om op gb gm gp rb rp".split())
        assert len(model["constraints"]) == (9 if id.endswith("_s13") else 7)
        ref = EnergyReference(model)
        reference_pay = ref.payments()
        published = [[3075000,62460,31000],[3855000,45180,27000],[3225000,55260,41000]]
        if id == "energia":
            np.testing.assert_allclose(reference_pay, published, atol=1e-5, rtol=0)
        else:
            np.testing.assert_allclose(reference_pay[0], [3315000,53820,39000], atol=1e-5, rtol=0)
        expected = ref.solve_with_payments(app["weights"],np.asarray(app["payoff"]["matrix"]))
        num = 0

    pay = np.array(app["payoff"]["matrix"])
    np.testing.assert_allclose(pay,reference_pay,atol=2e-5,rtol=0)
    out = {}
    with (evidence / f"{id}.csv").open(encoding="utf-8-sig") as file:
        csv_rows = {row[0]:row for row in csv.reader(file) if row and row[0] in expected}
    for metric, solution in app["solutions"].items():
        x = [solution["variables"][v["name"]] for v in model["variables"]]
        z = ref.c @ x
        assert feasibility(model,x) < 1e-7
        np.testing.assert_allclose(z,solution["objectives"],atol=2e-5,rtol=0)
        gap = (z - np.asarray(app["payoff"]["ideal_point"])) * ref.sign
        constant = np.array(app["payoff"]["normalization_sources"]) == "constant"
        d = np.where(constant, 0., np.maximum(0.,gap) / np.asarray(app["payoff"]["normalization_ranges"]))
        weighted = d * np.asarray(app["weights"])
        distance = float({"L1":np.sum,"L2":np.linalg.norm,"L_inf":np.max}[metric](weighted))
        assert abs(distance - solution["aggregate_distance"]) < 1e-8
        assert abs(float(csv_rows[metric][2]) - distance) < 1e-8
        assert abs(distance - expected[metric]) < 5e-7
        assert solution["status"] == csv_rows[metric][1] == "optimal"
        index = 3 + len(x)
        np.testing.assert_allclose(np.array(csv_rows[metric][index:index+len(z)],float), z, atol=2e-5, rtol=0)
        out[metric] = dict(estado=solution["status"],objetivos=z.tolist(),distancia=distance,
                           referencia=expected[metric],brecha=distance-expected[metric])
    return dict(pagos=pay.tolist(),pagos_referencia=reference_pay.tolist(),subproblemas_l2=num,metricas=out)


if __name__ == "__main__":
    evidence = Path(__file__).resolve().parent / "evidencia"
    out = {}
    for test in ("energia","energia_s13","mochila"):
        out[test] = run(test,evidence)
        print(test,out[test],flush=True)
        (evidence / "contraste.json").write_text(json.dumps(out,indent=2)+'\n')
