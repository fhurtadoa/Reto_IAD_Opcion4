"""
Script generador de plantillas Excel (.xlsx) para OptiCompromise Cockpit V2.
Escribe:
  - web/public/plantilla-ejercicio-iad.xlsx
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API_DIR = ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from excel_export import build_upload_template_workbook  # noqa: E402


def main() -> None:
    public_dir = ROOT / "web" / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    blank_path = public_dir / "plantilla-ejercicio-iad.xlsx"
    blank_path.write_bytes(build_upload_template_workbook("blank"))
    print(f"Generada plantilla: {blank_path}")


if __name__ == "__main__":
    main()
