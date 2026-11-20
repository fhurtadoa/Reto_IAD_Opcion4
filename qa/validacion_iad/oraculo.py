"""Oráculo de IAD: CBC para LP/MILP, Clarabel para QP y curva entera por epsilon."""
import heapq
import json
from itertools import count
from pathlib import Path
import sys

import cvxpy as cp
import numpy as np
import pulp as pl

from casos import all_cases, metric_workbook


class Reference:
    def __init__(self, model):
        self.model = model
        self.c = np.array([o["coefficients"] for o in model["objectives"]], dtype=float)
        self.sign = np.array([1 if o["sense"] == "minimize" else -1 for o in model["objectives"]])
        self.f = self.sign[:, None] * self.c
        self.integer = any(v["var_type"] == "integer" for v in model["variables"])
        # Óptimo lexicográfico de los dos criterios originales, con prioridad k.
        self.payoff = []
        for k in range(2):
            candidate = self.linear(self.f[k])
            if not self.integer:
                candidate = self.recover_vertex(candidate)
            optimum = self.f[k] @ candidate
            if self.integer:
                optimum = round(optimum)
            tied = self.linear(self.f[1-k], [(self.f[k], "==", optimum)])
            if tied is None and not self.integer:
                # CBC exporta las variables a ocho cifras significativas. Acotar
                # la primera coordenada en un solo sentido evita imponer su
                # redondeo como una igualdad artificialmente infactible.
                tied = self.linear(self.f[1-k], [(self.f[k], "<=", optimum + 1e-4)])
            if tied is None:
                raise ValueError(f"Desempate infactible en {model['name']}, criterio {k + 1}")
            self.payoff.append(self.c @ tied)
        self.payoff = np.array(self.payoff)
        self.ideal = self.payoff.diagonal() * self.sign
        self.ranges = np.abs((self.payoff[0] - self.payoff[1]))
        assert np.all(self.ranges > 0)

    def recover_vertex(self, x):
        # Recupera las coordenadas del vértice a partir de las filas activas
        # antes de fijar un objetivo que CBC exportó con precisión limitada.
        rows = [(np.asarray(r["coefficients"]), r["rhs"]) for r in self.model["constraints"]]
        rows.extend((row, v["lower_bound"]) for row, v in
                    zip(np.eye(len(x)), self.model["variables"]) if v["lower_bound"] is not None)
        active = [(a, b) for a, b in rows if abs(a @ x - b) <= 1e-7 * max(1, abs(b))]
        matrix, rhs = zip(*active)
        recovered, _, rank, _ = np.linalg.lstsq(matrix, rhs, rcond=None)
        return recovered if rank == len(x) else x

    def linear(self, cost, extra=(), minimax=None):
        problem = pl.LpProblem("IAD",pl.LpMinimize)
        xs = [pl.LpVariable(v["name"],v["lower_bound"],v["upper_bound"],
                            "Integer" if v["var_type"] == "integer" else "Continuous")
              for v in self.model["variables"]]
        def expr(coeffs):
            return pl.lpSum(c * x for c,x in zip(coeffs, xs))
        if self.model["name"] == "IAD Cadena entera":
            # 19x=20y con cantidades enteras obliga a que cada bodega
            # reciba lotes de 20 y despache lotes de 19. Fortalece CBC.
            batches = [pl.LpVariable(f"lote_{j}", 0, cap, "Integer")
                       for j, cap in enumerate((25, 30))]
            for j, batch in enumerate(batches):
                problem += xs[j] + xs[j + 2] == 20 * batch
                problem += pl.lpSum(xs[4 + 3*j:7 + 3*j]) == 19 * batch
            problem += pl.lpSum(batches) >= 48
        for a, sense, b in [
            (r["coefficients"], r["sense"], r["rhs"]) for r in self.model["constraints"]
        ] + list(extra):
            left = expr(a)
            problem += {"<=": lambda: left <= b, ">=": lambda: left >= b, "==": lambda: left == b}[sense]()
        if minimax is None:
            problem += expr(cost)
        else:
            lam = pl.LpVariable("lambda", lowBound=0)
            problem += lam
            for i, w in enumerate(minimax):
                problem += w * (expr(self.f[i]) - self.ideal[i]) / self.ranges[i] <= lam
        result = problem.solve(pl.PULP_CBC_CMD(msg=False))
        if result == pl.LpStatusInfeasible:
            return None
        if result != pl.LpStatusOptimal:
            raise ValueError(f"CBC status {pl.LpStatus[result]}")
        return np.array([x.value() or 0 for x in xs])

    def weighted(self, x, weights):
        return weights * ((self.f @ x - self.ideal) / self.ranges)

    def quadratic(self, weights):
        x = cp.Variable(self.c.shape[1])
        constraints = []
        for i,v in enumerate(self.model["variables"]):
            if v["lower_bound"] is not None:
                constraints.append(x[i] >= v["lower_bound"])
            if v["upper_bound"] is not None:
                constraints.append(x[i] <= v["upper_bound"])
        for r in self.model["constraints"]:
            a = np.array(r["coefficients"])
            scale = max(np.max(np.abs(a)), abs(r["rhs"]), 1.)
            left,b = (a / scale) @ x, r["rhs"] / scale
            constraints.append({"<=":lambda:left <= b, ">=":lambda:left >= b, "==":lambda:left == b}[r["sense"]]())
        p = cp.Problem(cp.Minimize(cp.sum_squares(cp.multiply(
            weights / self.ranges,self.f @ x - self.ideal
        ))), constraints)
        p.solve(solver="CLARABEL",tol_gap_rel=1e-11,tol_gap_abs=1e-11,tol_feas=1e-11)
        if p.status not in ("optimal", "optimal_inaccurate"):
            raise ValueError(f"Clarabel status {p.status}")
        return x.value

    def integer_quadratic(self, weights, seed):
        # Coordenadas f1,f2 enteras en los ejercicios T2 y cadena.
        assert np.all(self.f == self.f.astype(int))
        i = 0
        best_x = seed
        best = float(np.linalg.norm(self.weighted(seed,weights)))
        stack = []
        tickets = count()
        def search(lo,hi):
            nonlocal best,best_x,i
            if lo > hi:
                return
            x = self.linear(self.f[1], [(self.f[0], ">=",lo),(self.f[0], "<=",hi)])
            i += 1
            if x is None:
                return
            a,b = np.rint(self.f @ x).astype(int)
            trial = float(np.linalg.norm(self.weighted(x,weights)))
            if trial < best:
                best,best_x = trial,x
            # Rectángulo de valores posibles: f1 >= lo y f2 >= b.
            lower = np.hypot(*((np.array([lo,b])-self.ideal)*weights/self.ranges))
            if lower >= best - 2e-12:
                return
            # Para f1 >= a, x domina al resto en los dos objetivos.
            if a > lo:
                heapq.heappush(stack,(lower,next(tickets),lo,a-1))
        search(round(self.ideal[0]), round(self.payoff[1,0]*self.sign[0]))
        while stack:
            lower,_,lo,hi = heapq.heappop(stack)
            if lower < best - 2e-12:
                mid = (lo+hi)//2
                search(lo,mid)
                search(mid+1,hi)
        return best_x,i

    def solve(self, weights):
        weights = np.asarray(weights)
        if np.count_nonzero(weights) == 1:
            z = self.payoff[np.argmax(weights)]
            return {metric: (z, 0., 0) for metric in ("L1", "L2", "L_inf")}
        lin = self.linear((weights/self.ranges) @ self.f)
        inf = self.linear(None,minimax=weights)
        checks = 0
        if self.integer:
            quad,checks = self.integer_quadratic(weights,lin)
        else:
            quad = self.quadratic(weights)
        return {
            metric: (self.c @ x, float(function(self.weighted(x,weights))), checks if metric=="L2" else 0)
            for metric,x,function in [("L1",lin,np.sum),("L2",quad,np.linalg.norm),("L_inf",inf,np.max)]
        }


class WorkbookReference:
    def __init__(self, model):
        self.model = model
        self.c = np.array([o["coefficients"] for o in model["objectives"]])
        self.sign = -np.ones(3)
        self.ideal = -self.c.max(axis=1)
        self.ranges = np.ptp(self.c, axis=1)
        self.integer = True

    def solve(self, weights):
        norms = (np.sum, np.linalg.norm, np.max)
        deviations = (self.c.max(axis=1)[:, None] - self.c) / self.ranges[:, None]
        weighted = np.asarray(weights)[:, None] * deviations
        reference = {}
        for metric, norm in zip(("L1", "L2", "L_inf"), norms):
            distances = [norm(column) for column in weighted.T]
            best = min(range(len(distances)), key=distances.__getitem__)
            reference[metric] = (self.c[:, best], distances[best], 0)
        return reference


def feasibility(model, x):
    residuals = [0.0]
    for v, value in zip(model["variables"], x):
        lo, hi = v["lower_bound"], v["upper_bound"]
        if lo is not None:
            residuals.append(lo - value)
        if hi is not None:
            residuals.append(value - hi)
        if v["var_type"] != "continuous":
            residuals.append(abs(round(value) - value))
    for row in model["constraints"]:
        a, b = np.array(row["coefficients"]), row["rhs"]
        gap = float(a @ x - b)
        residuals.append({"<=": gap, ">=": -gap, "==": abs(gap)}[row["sense"]]
                         / max(1., np.max(np.abs(a)), abs(b)))
    return max(residuals)


def verify(candidate, reference, scope):
    app = candidate["response"]
    if candidate["status"] != 200:
        return {"error":app}
    model = reference.model
    payload = candidate["payload"]
    for key in ("variables","objectives","constraints"):
        if key == "constraints":
            payload_rows = [{k:r[k] for k in ("coefficients","sense","rhs")} for r in payload[key]]
            academic_rows = [{k:r[k] for k in ("coefficients","sense","rhs")} for r in model[key]]
            assert academic_rows == payload_rows, (model["name"],key)
        else:
            assert payload[key] == model[key], (model["name"],key)
    weights = np.array(app["weights"])
    np.testing.assert_allclose(weights, payload["weights"], atol=1e-12, rtol=0)
    payment = np.array(app["payoff"]["matrix"])
    names = [v["name"] for v in model["variables"]]
    independent = np.array([[row[v] for v in names] for row in app["payoff"]["independent_solutions"]])
    ref_payment = reference.payoff.tolist() if scope != "workbook" else None
    if scope == "workbook":
        delta = float(np.max(np.abs(payment.diagonal() * reference.sign - reference.ideal)/reference.ranges))
    else:
        delta = float(np.max(np.abs(payment - reference.payoff)/reference.ranges))
    result = {"weights":weights.tolist(),"payment":payment.tolist(),
              "reference_payment":ref_payment,"payment_delta":delta,
              "payment_residual":max(feasibility(model, x) for x in independent),
              "payment_calc_error":float(np.max(np.abs(independent @ reference.c.T - payment)/reference.ranges)),
              "range_delta":float(np.max(np.abs(np.asarray(app["payoff"]["normalization_ranges"])
                                                / reference.ranges - 1))),
              "metrics":{}}
    # Taller 2 pide solo los extremos de pagos. El resto se registra como cálculo extra.
    optimum = reference.solve(weights) if scope != "payoff" else None
    for metric,sol in app["solutions"].items():
        if not sol["objectives"]:
            result["metrics"][metric] = {"status":sol["status"]}
            continue
        x = np.array([sol["variables"][name] for name in names])
        z = reference.c @ x
        d = (reference.sign*z-reference.ideal)/reference.ranges
        wd = weights * d
        value = float({"L1":np.sum,"L2":np.linalg.norm,"L_inf":np.max}[metric](wd))
        row = {
            "status":sol["status"],"z":z.tolist(),"x":x.tolist(),"d":d.tolist(),"distance":value,
            "residual":feasibility(model, x),
            "calc_error":float(max(np.max(np.abs(z-sol["objectives"])/reference.ranges),
                               np.max(np.abs(d-sol["normalized_distances"])),
                               np.max(np.abs((1-d) - np.array(sol["achievement_pct"])/100)),
                               abs(value-sol["aggregate_distance"]))),
        }
        if optimum is not None:
            z_ref, d_ref, n = optimum[metric]
            row.update(reference_z=z_ref.tolist(), reference_distance=d_ref, distance_error=value-d_ref,
                       reference_integer_lp_count=n)
        result["metrics"][metric] = row
    return result


def main(browser, output):
    evidence = json.loads(browser.read_text())
    out = {}
    for id,(model,_,scope) in {**all_cases(), "metrica_discreta": metric_workbook()}.items():
        if id not in evidence:
            continue
        ref = WorkbookReference(model) if scope == "workbook" else Reference(model)
        rows = [verify(run,ref,scope) for run in evidence[id]["runs"]]
        out[id] = rows
        print(id, [(r.get("payment_delta"),[(m,s.get("distance_error"),s["status"])
                    for m,s in r.get("metrics",{}).items()]) for r in rows],flush=True)
        output.write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]),Path(sys.argv[2]))
