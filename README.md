# 🧭 OptiCompromise — Cockpit V2
## Herramienta de Optimización Multiobjetivo por Programación de Compromiso
### Asignatura: Introducción al Análisis de Decisiones (IAD) | Facultad de Minas – Universidad Nacional de Colombia (Sede Medellín)
**Docente:** Profesora Patricia Jaramillo Álvarez, PhD  
**Apoyo Académico:** Jaime Andrés Díaz Guerra, MSc  

---

## 👥 Autores del Proyecto

* **Fabián Andrés Hurtado Arango** — C.C. `1036450768` | Correo: `fhurtadoa@unal.edu.co`
* **Oscar David Arango Garcia** — C.C. `1011591946` | Correo: `oarangog@unal.edu.co`

---

## 🎯 Objetivo de la Herramienta (Opción 4 del Concurso IAD)

**OptiCompromise Cockpit V2** es una aplicación web interactiva, educativa y de código abierto diseñada para formular, analizar y resolver problemas de optimización multiobjetivo lineales (continuos y enteros mixtos), encontrando las soluciones compromiso más cercanas al **Punto Ideal ($Z^*$)** bajo tres métricas de distancia normalizada respecto al rango de la matriz de pagos:

1. **Métrica $L_1$ (Manhattan):** Programación Lineal (LP/MILP con **HiGHS**). Modela un decisor utilitarista/compensatorio que minimiza $\sum w_i D_i(x)$.
2. **Métrica $L_2$ (Euclidiana):** Programación Cuadrática Convexa (QP con `SLSQP` y jacobiano analítico; y Branch-and-Bound Best-First para modelos MIP). Minimiza $\sqrt{\sum (w_i D_i(x))^2}$, según las ecuaciones de Clase 15 (pp. 9 y 19).
3. **Métrica $L_\infty$ (Tchebysheff / Minimax):** Programación Lineal minimax mediante variable auxiliar $\lambda$ ($\min \lambda$ s.a. $w_i D_i(x) \le \lambda$), con **Ver restricciones minimax con los datos del modelo**, dentro de **Ver método**. Reduce la mayor brecha ponderada. Los logros pueden coincidir cuando varias restricciones minimax quedan activas.
4. **Frontera Eficiente de Pareto:** Aproximación combinando barridos sistemáticos de pesos sobre $L_1$, $L_2$ y $L_\infty$, con visualización 2D (curvas de isodistancia y proyección factible), 3D interactiva, Radar de % de logro y Espacio de Decisiones (para 2 variables, incluyendo malla discreta en MIP).
5. **Módulos de Bonificación Implementados (sujetos a evaluación del jurado):**
   * **≥ 3 Objetivos e Interactividad 3D:** Soporte completo para 3 o más criterios en editor, matriz de pagos, gráfico 3D rotatorio en Plotly y diagrama Radar.
   * **Programación Entera y Binaria (MIP):** Variables `continuous`, `integer` y `binary` resueltas con HiGHS ($L_1, L_\infty$) y Branch-and-Bound con límite de búsqueda y estado de optimalidad ($L_2$), con frontera discreta diferenciada en 2D.
6. **Exportación e Interoperabilidad Académica:**
   * **Carga docente**. En **Formular**, descarga [la plantilla oficial Excel](web/public/plantilla-ejercicio-iad.xlsx), diligencia la hoja **Modelo** y pulsa **Cargar ejercicio**. La hoja **Ejemplo_Papel** contiene un caso para consultar dentro del mismo libro.
   * **Resultados en Excel y PDF**. Ambos formatos incluyen formulación, ponderaciones, resultados e imágenes de las gráficas Plotly aplicables. El Excel conserva la matriz de pagos, los datos de Pareto cuando existen y la hoja **Modelo** para volver a cargarlo.

*(Nota de alcance: El motor resuelve modelos lineales y enteros mixtos; el soporte para funciones objetivo o restricciones no lineales arbitrarias no está incluido en esta versión).*

---

### Sensibilidad de pesos

En modelos biobjetivo, **Sensibilidad de pesos** compara $L_1$, $L_2$ y $L_\infty$ en 21 pesos entre 0 y 1. La línea punteada sigue el peso seleccionado y los marcadores grandes muestran el último cálculo del motor. Los tres paneles se incorporan al Excel y al PDF de resultados. El barrido conserva las muestras repetidas y usa los pesos exactos en los extremos. Consulta el [criterio numérico y la evidencia](docs/auditoria-iad.md#sensibilidad-y-segunda-iteración).

## 📐 Casos de Validación del Curso y Pruebas Automatizadas

La suite en `api/tests/` reproduce y verifica los ejercicios oficiales del curso, casos de bonificación y casos borde:

| Caso de Estudio | Variables | Objetivos | Ideal ($Z^*$) | Nadir aproximado ($Z_{\text{peor}}$) | Solución $L_1$ | Solución $L_2$ | Solución $L_\infty$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Celdas Fotovoltaicas (Clase 15)** ($w=[0.5, 0.5]$) | 2 cont. | 2 (Max Utilidad, Min Contam.) | $(800.000,\; 200)$ | $(300.000,\; 600)$ | $x=[0, 200] \Rightarrow Z=(600k, 400)$ ($60.0\% / 50.0\%$) | $x=[0, 198.36] \Rightarrow Z=(595.1k, 396.7)$ ($59.0\% / 50.8\%$) | $x=[0, 190.91] \Rightarrow Z=(572.7k, 381.8)$ ($54.55\% = 54.55\%$) |
| **Transporte (Taller 3)** ($w=[0.5, 0.5]$) | 12 cont. | 2 (Min Costo, Min Riesgo) | $(16.800,\; 2.600)$ | $(18.500,\; 5.700)$ | $Z=(17.400,\; 3.600)$ ($64.71\% / 67.74\%$) | $Z=(17.400,\; 3.600)$ ($64.71\% / 67.74\%$) | $Z=(17\,382.32,\; 3\,661.88)$ ($65.75\% = 65.75\%$) |

Los ejemplos de **Producción de Papel (Taller 1/3)**, **Sostenibilidad 3D**, **Producción Mixta MIP** y **Flota de Vehículos Eléctricos (4Z)** cuentan con pruebas automatizadas de validación, soporte triobjetivo/cuatriobjetivo e integralidad. Consulta la [matriz de trazabilidad y validación](docs/auditoria-iad.md), la [guía de la interfaz actual](docs/guia-de-uso.md) y el [informe de validación de ejercicios](VALIDACION_FINAL_EJERCICIOS_IAD.md).

---

## 🚀 Guía de Ejecución y Despliegue

### Opción A: Ejecución Local (Frontend `3001` + Backend `8001`)
```bash
# 1. Iniciar backend FastAPI desde la raíz del repositorio
python3 -m pip install -r api/requirements-dev.txt
uvicorn api.index:app --reload --host 127.0.0.1 --port 8001

# 2. En otra terminal, iniciar frontend Next.js (proxy /api -> 127.0.0.1:8001)
cd web
npm ci
npm run dev
# Abrir http://localhost:3001
```

### Opción B: Despliegue Web en Vercel
1. Conectar el repositorio de GitHub a [Vercel](https://vercel.com) seleccionando como *Root Directory* la raíz del repositorio.
2. [`vercel.json`](vercel.json) compila `web/` con Next.js 15 (`15.5.29`), enruta `/api/(.*)` hacia la función serverless [`api/index.py`](api/index.py) e incluye el catálogo y las fuentes tipográficas del PDF. La función declara una duración máxima de 60 segundos.

### Opción C: Ejecución Autónoma en Google Colab
Abrir el cuaderno [`colab/OptiCompromise_Colab.ipynb`](colab/OptiCompromise_Colab.ipynb) en Google Colab y ejecutar todas las celdas en orden (*Entorno de ejecución → Ejecutar todas*). Incluye una copia del motor web y no requiere clonar repositorios externos. Para volver a incorporar el motor tras modificarlo, ejecuta `python3 colab/sync_engine.py` desde la raíz del repositorio.

---

## 🧪 Pruebas Automatizadas y Verificación de Calidad

```bash
# Desde la raíz del repositorio, 71 pruebas de API, motor y exportación
PYTHONPATH=api python3 -m unittest discover -s api/tests -v
python3 colab/sync_engine.py

# TypeScript, ESLint y 13 pruebas de frontend (Node.js 22.18 o posterior)
cd web
npx tsc --noEmit && npm run lint && npm run test:weights
```

---

La compilación de producción se ejecuta con el servidor de desarrollo detenido.\n\n## 📦 Entregables del Concurso (Sección 10)

* **E3 — Herramienta final y código fuente:** Aplicación **Next.js 15 (`15.5.29`)** + **FastAPI** + **SciPy** + **openpyxl** + **Pillow** + **ReportLab** + **SheetJS CE (`0.20.3`)**, `README.md`, `LICENSE` (MIT), **71 pruebas de backend** y **13 de frontend** y cuaderno autónomo en Google Colab (`colab/OptiCompromise_Colab.ipynb`).
* **E4 — Ejercicios y plantilla docente.** [Catálogo de ejercicios](examples/), [plantilla oficial](web/public/plantilla-ejercicio-iad.xlsx), [guía docente](GUIA_DOCENTE_CARGA_EJERCICIOS.md) y [manual PDF](MANUAL_DOCENTE_OPTICOMPROMISE.pdf).
* **E5 — Guías y Manuales V2:** [Guía web actual](docs/guia-de-uso.md) con capturas y glosario; [`MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf`](MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf) actualizado a Cockpit V2 (en el pie de página como **Manual de usuario**); y [`MANUAL_DOCENTE_OPTICOMPROMISE.pdf`](MANUAL_DOCENTE_OPTICOMPROMISE.pdf) (en el pie de página como **Guía docente**).
* **E6 — Video demostrativo (5–8 min):** *Pendiente de grabación y publicación — ver checklist inferior.*

---

## ✅ Checklist Pendiente Antes de Entrega Final

- **[Pendiente E3]:** Desplegar versión final en producción (Vercel u otro hosting con la raíz del repositorio) y verificar permisos públicos en Google Colab.
- **[Pendiente E6]:** Grabar el video demostrativo de **5 a 8 minutos** y pegar el enlace definitivo aquí.
- **[Pendiente Git]:** Revisar cambios locales y hacer `git push` cuando estén listos.

---

## 🤖 Declaración de Uso de Inteligencia Artificial

En cumplimiento con la Sección 12 de las Bases del Concurso:
* Se utilizó Inteligencia Artificial (asistentes de programación Gemini / Antigravity y OpenAI Codex) como apoyo para la estructuración modular del frontend en React/Next.js 15, la integración de gráficos Plotly/KaTeX, la generación de plantillas y libros Excel estilizados, el diseño de las pruebas automatizadas, la auditoría frente al material de IAD y la actualización de la documentación técnica y manuales PDF. Los autores han revisado la versión entregada y están en capacidad de explicar y modificar el método durante la sustentación individual.

---

## 📜 Licencia y Créditos

Este software se distribuye bajo la **[Licencia MIT](LICENSE)**, autorizando su uso, modificación y distribución académica en la Universidad Nacional de Colombia.

### Bibliotecas de Código Abierto Utilizadas y Sus Licencias (Sección 12)
* **SciPy** (`scipy.optimize`: HiGHS & SLSQP) — Licencia **BSD-3-Clause**
* **NumPy** — Licencia **BSD-3-Clause**
* **FastAPI** — Licencia **MIT**
* **Pydantic** — Licencia **MIT**
* **Next.js (`15.5.29`)** & **React** — Licencia **MIT**
* **Plotly.js** & **react-plotly.js** — Licencia **MIT**
* **KaTeX** — Licencia **MIT**
* **Tailwind CSS** — Licencia **MIT**
* **Lucide React** — Licencia **ISC**
* **openpyxl** — Licencia **MIT**
* **SheetJS CE (`0.20.3`)** — Licencia **Apache-2.0**
* **ReportLab** (informes y manuales PDF), **Pillow** (validación de imágenes) y **Matplotlib** (generación de manuales).\n* **DejaVu Sans** (tipografía de informes PDF). [Licencia](api/fonts/LICENSE_DEJAVU).

### Referencias Bibliográficas
* Romero, C. (1993). *Teoría de la decisión multicriterio: conceptos, técnicas y aplicaciones*. Alianza Editorial.
* Zeleny, M. (1973). *Compromise Programming*. En Cochrane, J. L. & Zeleny, M. (Eds.), *Multiple Criteria Decision Making*. University of South Carolina Press.
* Jaramillo Álvarez, P. (2026). *Material docente, diapositivas (Clase 15) y cuadernos de taller de Introducción al Análisis de Decisiones (IAD)*. Universidad Nacional de Colombia – Sede Medellín.
