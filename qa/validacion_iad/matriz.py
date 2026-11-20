"""Construye la matriz de aceptación y comprueba las cifras de las fuentes."""
import json
import sys
from pathlib import Path

import numpy as np

from casos import all_cases, metric_workbook


TOL = 5e-7
OBJECTIVE_TOL = 2e-5
METRICS = ("L1", "L2", "L_inf")
SOURCE = {
    "clase11": "Clase 11, p. 8",
    "celdas": "Clases 14, pp. 4–6 y 13–14, y 15, pp. 18–22",
    "transporte": "Taller 1 y cuaderno de apoyo T3, cc. 8–24",
    "papel": "Taller 1, Papel",
    "cadena_continua": "Taller 1, Cadena, y entregable, pp. 7–9",
    "cadena_entera": "Taller 1, Cadena, y entregable, pp. 7–9",
    "metrica_discreta": "Ejercicio para entender la métrica, Hoja1 D11:G45",
}


def source(key):
    if key.startswith("t2_"):
        return "Taller 2, enunciado y cuaderno cc. 9–19" + ("; Guía PuLP pp. 1–3" if key == "t2_5" else "")
    if key.startswith("t3_"):
        return "Taller 3, enunciado de Papel"
    return SOURCE[key]


def check_sources(data):
    celdas = data["celdas"]
    np.testing.assert_allclose(celdas[0]["payment"], [[800000, 600], [300000, 200]], atol=1e-7, rtol=0)
    for run, target in zip(celdas, [(0, 200)] + [(0, 100)] * 3 + [(200, 200)] * 3):
        np.testing.assert_allclose(run["metrics"]["L1"]["x"], target, atol=1e-7, rtol=0)
    for metric, target in [("L2", (595082, 396.7)), ("L_inf", (572727, 381.8))]:
        error = np.abs(np.asarray(celdas[0]["metrics"][metric]["z"]) - target)
        assert (error <= [.5, .05]).all(), (metric, error)

    runs = {run["weights"][0]: run for run in data["transporte"]}
    np.testing.assert_allclose(runs[.5]["payment"], [[16800, 5700], [18500, 2600]], atol=1e-7, rtol=0)
    official_l1 = [(18500, 2600), (18500, 2600), (17400, 3600), (16800, 5700), (16800, 5700)]
    official_inf = [(18500, 2600), (17795.122140, 3204.878060), (17382.320438, 3661.878456),
                    (17145.573780, 4490.491770), (16800, 5700)]
    for (w, z1, zinf) in zip((0, .25, .5, .75, 1), official_l1, official_inf):
        np.testing.assert_allclose(runs[w]["metrics"]["L1"]["z"], z1, atol=1e-7, rtol=0)
        np.testing.assert_allclose(runs[w]["metrics"]["L_inf"]["z"], zinf, atol=.00025, rtol=0)
    assert data["t2_5"][0]["payment"][0][0] == 16815  # Guía PuLP, solo costo
    assert data["t2_6"][0]["payment"] == [[16818, 5700], [18518, 2600]]  # Entregable local
    student_paper = data["t3_6"][0]
    np.testing.assert_allclose(student_paper["payment"], [[28449.34, 16705.60], [43041.43, 30152.63]],
                               atol=.005, rtol=0)
    for metric, target in zip(METRICS, [(28827.84, 17511.06), (33727.49, 22062.27), (34645.16, 22885.83)]):
        np.testing.assert_allclose(student_paper["metrics"][metric]["z"], target, atol=.02, rtol=0)

    workbook = data["metrica_discreta"][0]["metrics"]
    for metric, factor, official in zip(METRICS, [100, 100 * np.sqrt(3), 100], [100 / 3, 100 / 3, 100 / 9]):
        assert abs(workbook[metric]["distance"] * factor - official) <= 1e-10
    assert all(workbook[metric]["x"] == [0, 0, 0, 1] for metric in ("L2", "L_inf"))


def vector(values):
    return "(" + ", ".join(f"{v:.8g}" for v in values) + ")"


def scalars(values):
    return "; ".join(f"{v:.9g}" for v in values)


def main(data):
    agenda = {**all_cases(), "metrica_discreta": metric_workbook()}
    assert data.keys() == agenda.keys()
    check_sources(data)
    print("# Matriz de aceptación por instancia\n")
    print("El orden de las métricas es L₁, L₂ y L∞. La transcripción y las formulaciones por familia están en el "
          "[informe](../../../VALIDACION_FINAL_EJERCICIOS_IAD.md) y en [casos.py](../casos.py). "
          "El [registro numérico](comparacion.json) contiene variables, desviaciones, pagos, objetivos y pesos por perfil.\n")
    print("| Instancia y fuente | Pesos | Método | Óptimos de referencia | OptiCompromise | Distancia absoluta al óptimo o diferencia de pagos normalizada | Estado |")
    print("|---|---|---|---|---|---|---|")
    failures = []
    for key, (_, profiles, scope) in agenda.items():
        assert len(data[key]) == len(profiles)
        for profile, row in zip(profiles, data[key]):
            np.testing.assert_allclose(profile, row["weights"], atol=1e-12, rtol=0)
            checks = [row[k] for k in ("payment_residual", "payment_calc_error", "payment_delta", "range_delta")]
            metrics = [row["metrics"][metric] for metric in METRICS]
            checks.extend(m[k] for m in metrics for k in ("residual", "calc_error"))
            distances = [abs(m.get("distance_error", 0)) for m in metrics]
            checks.extend(distances)
            certified = scope == "payoff" or all(m["status"] == "optimal" for m in metrics)
            # Soluciones alternativas L1, L∞ o con pesos nulos se contrastan por
            # factibilidad y valor escalar. En los modelos continuos con pesos
            # positivos, L₂ tiene una coordenada única por convexidad en z.
            if scope != "payoff" and all(w > 0 for w in profile):
                l2 = metrics[1]
                scales = np.ptp(row["reference_payment"], axis=0) if scope != "workbook" else np.full(3, 100.)
                normalized = np.max(np.abs(np.array(l2["z"]) - l2["reference_z"]) / scales)
                certified &= normalized <= OBJECTIVE_TOL
            passed = certified and max(checks) <= TOL
            if scope == "payoff":
                method = "Óptimos individuales enteros"
                ref = " / ".join(map(vector, row["reference_payment"]))
                app = " / ".join(map(vector, row["payment"]))
                delta = f'{row["payment_delta"]:.3g}'
            else:
                method = "Enumeración binaria adaptada" if scope == "workbook" else "Factores y compromiso"
                ref = " / ".join(vector(m["reference_z"]) for m in metrics)
                app = " / ".join(vector(m["z"]) for m in metrics)
                delta = scalars(distances)
            state = "CORRECTO" if passed else "INCORRECTO"
            print(f"| `{key}` · {source(key)} | {vector(row['weights'])} | {method} | {ref} | {app} | {delta} | {state} |")
            if not passed:
                failures.append((key, profile, max(checks), certified))
    if failures:
        raise SystemExit(f"Fallos: {failures}")


if __name__ == "__main__":
    main(json.loads(Path(sys.argv[1]).read_text()))
