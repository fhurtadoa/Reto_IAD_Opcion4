"""
Pruebas de exportación/plantillas Excel (.xlsx) y endpoint POST /api/export/excel.
Verifica:
- Generación y estructura de plantilla-ejercicio-iad.xlsx y plantilla-produccion-papel.xlsx.
- Ausencia de la palabra suelta 'Seccion' en las filas de título/subtítulo de 'Modelo'.
- Endpoint POST /api/export/excel con modelos estándar (01_celdas_fotovoltaicas, 06_produccion_papel)
  y el modelo adversarial con variables llamadas 'Seccion' (binary [1, 1]) y 'Nombre' ([0, 5]),
  dos objetivos homónimos 'Iguales', restricción '==' y pesos [0.6, 0.4].
"""
from __future__ import annotations

import json
import unittest
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from core.schemas import ConstraintModel, ModelDefinition, ObjectiveModel, VariableModel
from excel_export import build_upload_template_workbook
from index import app

ROOT_DIR = Path(__file__).resolve().parents[2]
EXAMPLES_DIR = ROOT_DIR / "examples"
PUBLIC_DIR = ROOT_DIR / "web" / "public"


def _find_model_header_row(ws) -> tuple[int, list[str]]:
    for r_idx in range(1, ws.max_row + 1):
        row_vals = [ws.cell(row=r_idx, column=c_idx).value for c_idx in range(1, ws.max_column + 1)]
        if any(str(v or "").strip().lower() in {"seccion", "sección"} for v in row_vals):
            return r_idx, [str(v or "").strip() for v in row_vals]
    raise AssertionError("No se encontró fila de encabezado con 'Seccion' en la hoja Modelo.")


class TestExcelExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_upload_templates_structure_and_header_detection(self) -> None:
        for variant, filename, expected_vars in (
            ("blank", "plantilla-ejercicio-iad.xlsx", 2),
            ("papel", "plantilla-produccion-papel.xlsx", 12),
        ):
            raw = build_upload_template_workbook(variant)
            wb = load_workbook(BytesIO(raw), data_only=False)
            self.assertEqual(wb.sheetnames[0], "Modelo")
            self.assertIn("Guia_Docente", wb.sheetnames)

            ws = wb["Modelo"]
            self.assertEqual(ws.freeze_panes, "A4")
            header_idx, header = _find_model_header_row(ws)
            self.assertEqual(header_idx, 3, f"{filename}: el encabezado debe estar exactamente en la fila 3")
            self.assertEqual(header[:5], ["Seccion", "Nombre", "Tipo_o_Sentido", "Min_o_RHS", "Max_o_Peso"])
            self.assertEqual(len([h for h in header[5:] if h]), expected_vars)
            self.assertGreaterEqual(len(ws.data_validations.dataValidation), 2)

            # Verificar que el archivo generado en web/public exista y tenga la misma estructura
            public_path = PUBLIC_DIR / filename
            self.assertTrue(public_path.is_file(), f"Falta plantilla generada en {public_path}")
            wb_disk = load_workbook(public_path, data_only=False)
            self.assertEqual(wb_disk.sheetnames, ["Modelo", "Guia_Docente"])
            disk_header_idx, _ = _find_model_header_row(wb_disk["Modelo"])
            self.assertEqual(disk_header_idx, 3)

    def test_export_excel_endpoint_standard_models(self) -> None:
        for example_name in ("01_celdas_fotovoltaicas.json", "06_produccion_papel.json"):
            model_dict = json.loads((EXAMPLES_DIR / example_name).read_text(encoding="utf-8"))
            solve_res = self.client.post("/api/solve", json=model_dict)
            self.assertEqual(solve_res.status_code, 200, solve_res.text)
            result_dict = solve_res.json()

            export_res = self.client.post("/api/export/excel", json={"model": model_dict, "result": result_dict})
            self.assertEqual(export_res.status_code, 200, export_res.text)
            self.assertEqual(
                export_res.headers.get("content-type"),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.assertIn("attachment; filename=", export_res.headers.get("content-disposition", ""))

            wb = load_workbook(BytesIO(export_res.content), data_only=False)
            self.assertEqual(
                wb.sheetnames,
                ["Resumen_Ejecutivo", "Matriz_de_Pagos", "Soluciones_Compromiso", "Frontera_Pareto", "Modelo"],
            )

            # Validar formato de % Logro como decimal con formato 0.00%
            ws_sol = wb["Soluciones_Compromiso"]
            sol_headers = [ws_sol.cell(row=4, column=c).value for c in range(1, ws_sol.max_column + 1)]
            pct_cols = [idx + 1 for idx, h in enumerate(sol_headers) if str(h or "").startswith("% Logro:")]
            self.assertEqual(len(pct_cols), len(model_dict["objectives"]))
            for col in pct_cols:
                cell = ws_sol.cell(row=5, column=col)
                self.assertEqual(cell.number_format, "0.00%")
                self.assertIsInstance(cell.value, (int, float))
                self.assertLessEqual(abs(cell.value), 1.5)

            # Validar hoja Modelo re-importable
            ws_mod = wb["Modelo"]
            header_idx, header = _find_model_header_row(ws_mod)
            self.assertEqual(header_idx, 2)
            self.assertEqual(header[:5], ["Seccion", "Nombre", "Tipo_o_Sentido", "Min_o_RHS", "Max_o_Peso"])

    def test_export_excel_endpoint_adversarial_reserved_names_and_bounds(self) -> None:
        adversarial = ModelDefinition(
            name="Modelo Adversarial Codex",
            description="Variables con nombres reservados y objetivos homónimos.",
            reference="Prueba Adversarial Track 1",
            variables=[
                VariableModel(name="Seccion", var_type="binary", lower_bound=1.0, upper_bound=1.0),
                VariableModel(name="Nombre", var_type="continuous", lower_bound=0.0, upper_bound=5.0),
            ],
            objectives=[
                ObjectiveModel(name="Iguales", sense="maximize", coefficients=[10.0, 2.0]),
                ObjectiveModel(name="Iguales", sense="minimize", coefficients=[1.0, 3.0]),
            ],
            constraints=[
                ConstraintModel(name="Igualdad Exacta", sense="==", rhs=4.0, coefficients=[1.0, 1.0]),
            ],
            weights=[0.6, 0.4],
            pareto_seed=77,
        )

        model_dict = adversarial.model_dump()
        solve_res = self.client.post("/api/solve", json=model_dict)
        self.assertEqual(solve_res.status_code, 200, solve_res.text)
        result_dict = solve_res.json()

        export_res = self.client.post("/api/export/excel", json={"model": model_dict, "result": result_dict})
        self.assertEqual(export_res.status_code, 200, export_res.text)

        wb = load_workbook(BytesIO(export_res.content), data_only=False)
        ws_mod = wb["Modelo"]
        header_idx, header = _find_model_header_row(ws_mod)
        self.assertEqual(header_idx, 2)
        self.assertEqual(
            header,
            ["Seccion", "Nombre", "Tipo_o_Sentido", "Min_o_RHS", "Max_o_Peso", "Coef: Seccion", "Coef: Nombre"],
        )

        rows = []
        for r_idx in range(header_idx + 1, ws_mod.max_row + 1):
            rows.append([ws_mod.cell(row=r_idx, column=c).value for c in range(1, len(header) + 1)])

        # Meta
        meta_row = rows[0]
        self.assertEqual(meta_row[0], "Meta")
        self.assertEqual(meta_row[1], "Modelo Adversarial Codex")
        self.assertEqual(meta_row[3], 77)
        self.assertEqual(meta_row[4], "Prueba Adversarial Track 1")

        # Variables
        var_rows = [r for r in rows if r[0] == "Variable"]
        self.assertEqual(len(var_rows), 2)
        self.assertEqual(var_rows[0][:5], ["Variable", "Seccion", "binary", 1, 1])
        self.assertEqual(var_rows[1][:5], ["Variable", "Nombre", "continuous", 0, 5])

        # Objetivos homónimos y pesos
        obj_rows = [r for r in rows if r[0] == "Objetivo"]
        self.assertEqual(len(obj_rows), 2)
        self.assertEqual(obj_rows[0], ["Objetivo", "Iguales", "maximize", None, 0.6, 10, 2])
        self.assertEqual(obj_rows[1], ["Objetivo", "Iguales", "minimize", None, 0.4, 1, 3])

        # Restricción ==
        con_rows = [r for r in rows if r[0] == "Restriccion"]
        self.assertEqual(len(con_rows), 1)
        self.assertEqual(con_rows[0], ["Restriccion", "Igualdad Exacta", "==", 4, None, 1, 1])


if __name__ == "__main__":
    unittest.main()
