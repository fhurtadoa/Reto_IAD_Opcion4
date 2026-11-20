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

**OptiCompromise Cockpit V2** es una aplicación web interactiva, educativa y de código abierto diseñada para formular, analizar y resolver problemas de optimización multiobjetivo lineales (continuos y enteros mixtos), encontrando las soluciones compromiso más cercanas al **Punto Ideal ($Z^*$)** bajo tres métricas de distancia normalizada respecto al rango Ideal–Anti-Ideal:

1. **Métrica $L_1$ (Manhattan):** Programación Lineal (LP/MILP con **HiGHS**). Modela un decisor utilitarista/compensatorio que minimiza $\sum w_i D_i(x)$.
2. **Métrica $L_2$ (Euclidiana):** Programación Cuadrática Convexa (QP con `SLSQP` y jacobiano analítico; y Branch-and-Bound Best-First para modelos MIP). Minimiza $\sqrt{\sum w_i D_i(x)^2}$, penalizando más las brechas individuales grandes.
3. **Métrica $L_\infty$ (Tchebysheff / Minimax):** Programación Lineal minimax mediante variable auxiliar $\lambda$ ($\min \lambda$ s.a. $w_i D_i(x) \le \lambda$), con **Modo Rayos X** que muestra las restricciones linealizadas en LaTeX. Reduce la mayor brecha ponderada. Los logros pueden coincidir cuando varias restricciones minimax quedan activas.
4. **Frontera Eficiente de Pareto:** Aproximación combinando barridos sistemáticos de pesos sobre $L_1$, $L_2$ y $L_\infty$, con visualización 2D (curvas de isodistancia y proyección factible), 3D interactiva, Radar de % de logro y Espacio de Decisiones (para 2 variables, incluyendo malla discreta en MIP).
5. **Módulos de Bonificación Implementados (sujetos a evaluación del jurado):**
   * **≥ 3 Objetivos e Interactividad 3D:** Soporte completo para 3 o más criterios en editor, matriz de pagos, gráfico 3D rotatorio en Plotly y diagrama Radar.
   * **Programación Entera y Binaria (MIP):** Variables `continuous`, `integer` y `binary` resueltas con HiGHS ($L_1, L_\infty$) y Branch-and-Bound con límite de búsqueda y estado de optimalidad ($L_2$), con frontera discreta diferenciada en 2D.

*(Nota de alcance: El motor resuelve modelos lineales y enteros mixtos; el soporte para funciones objetivo o restricciones no lineales arbitrarias no está incluido en esta versión).*

---

## 📐 Casos de Validación del Curso y Pruebas Automatizadas

La suite en `api/tests/` (22 pruebas automatizadas) reproduce y verifica los ejercicios oficiales del curso, casos de bonificación y casos borde:

| Caso de Estudio | Variables | Objetivos | Ideal ($Z^*$) | Anti-Ideal ($Z_{\text{peor}}$) | Solución $L_1$ | Solución $L_2$ | Solución $L_\infty$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Celdas Fotovoltaicas (Clase 15)** ($w=[0.5, 0.5]$) | 2 cont. | 2 (Max Utilidad, Min Contam.) | $(800.000,\; 200)$ | $(300.000,\; 600)$ | $x=[0, 200] \Rightarrow Z=(600k, 400)$ ($60.0\% / 50.0\%$) | $x=[0, 198.36] \Rightarrow Z=(595.1k, 396.7)$ ($59.0\% / 50.8\%$) | $x=[0, 190.91] \Rightarrow Z=(572.7k, 381.8)$ ($54.55\% = 54.55\%$) |
| **Transporte (Taller 3)** ($w=[0.5, 0.5]$) | 12 cont. | 2 (Min Costo, Min Riesgo) | $(16.800,\; 2.600)$ | $(18.500,\; 5.700)$ | $Z=(17.400,\; 3.600)$ ($64.71\% / 67.74\%$) | $Z=(17.400,\; 3.600)$ ($64.71\% / 67.74\%$) | $Z=(17\,382.33,\; 3\,661.88)$ ($65.75\% = 65.75\%$) |

Los ejemplos de Sostenibilidad, Producción Mixta y Flota tienen pruebas de soporte triobjetivo, integralidad y cuatro criterios. Consulta la [matriz de trazabilidad y validación](docs/auditoria-iad.md) y la [guía de la interfaz actual](docs/guia-de-uso.md).

---

## 🚀 Guía de Ejecución y Despliegue

### Opción A: Ejecución Local (Frontend `3001` + Backend `8001`)
```bash
# 1. Iniciar backend FastAPI desde la carpeta raíz del proyecto (OptiCompromise_Cockpit_V2/)
python3 -m pip install -r api/requirements-dev.txt
uvicorn api.index:app --reload --host 127.0.0.1 --port 8001

# 2. En otra terminal, iniciar frontend Next.js (proxy /api -> 127.0.0.1:8001)
cd web
npm ci
npm run dev
# Abrir http://localhost:3001
```

### Opción B: Despliegue Web en Vercel
1. Conectar el repositorio de GitHub a [Vercel](https://vercel.com) seleccionando como *Root Directory* la carpeta del proyecto (`OptiCompromise_Cockpit_V2` si se mantiene dentro de un monorepo, o la raíz si se promueve como repositorio principal).
2. [`vercel.json`](vercel.json) compila `web/` con Next.js, enruta `/api/(.*)` hacia la función serverless [`api/index.py`](api/index.py) e incluye `examples/**` mediante `includeFiles`.

### Opción C: Ejecución Autónoma en Google Colab
Abrir el cuaderno [`colab/OptiCompromise_Colab.ipynb`](colab/OptiCompromise_Colab.ipynb) en Google Colab y ejecutar todas las celdas en orden (*Entorno de ejecución → Ejecutar todas*). No requiere clonar repositorios externos.

---

## 🧪 Pruebas Automatizadas y Verificación de Calidad

```bash
# Pruebas unitarias y de validación matemática del motor (22 pruebas)
cd api
PYTHONPATH=. python3 -m unittest discover tests/ -v

# Verificación estricta de TypeScript, ESLint y compilación de producción
cd ../web
npx tsc --noEmit && npm run lint && npm run build
```

---

## 📦 Entregables del Concurso (Sección 10)

* **E3 — Herramienta final y código fuente:** Aplicación Next.js + FastAPI, `README.md`, `LICENSE` (MIT), pruebas automatizadas y cuaderno Colab.
* **E4 — Modelos de ejemplo:** 5 archivos JSON en [`examples/`](examples/) accesibles desde el selector **Ejemplos** de la interfaz (`celdas`, `transporte`, `triobjetivo`, `mip`, `flota`) e importación/exportación en `.json`, `.xlsx` y `.csv` re-importable.
* **E5 — Guía de usuario:** [Guía web actual](docs/guia-de-uso.md), con capturas y glosario. Referencia de casos de uso: [`MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf`](MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf) (disponible desde **Manual PDF** en la barra superior, con capturas de la interfaz anterior).
* **E6 — Video demostrativo (5–8 min):** *Agregar enlace de video antes del envío final.*

---

## 🤖 Declaración de Uso de Inteligencia Artificial

En cumplimiento con la Sección 12 de las Bases del Concurso:
* Se utilizó Inteligencia Artificial (asistentes de programación Gemini / Antigravity) como apoyo para la estructuración modular del frontend en React/Next.js, la integración de gráficos Plotly/KaTeX, el diseño de pruebas automatizadas y la refactorización de validaciones.
* Se utilizó OpenAI Codex para auditar la rúbrica, refactorizar el flujo web, ajustar la comprobación de optimalidad y estados del motor, añadir pruebas de regresión y elaborar el [documento técnico](docs/auditoria-iad.md). Los autores deben revisar la versión entregada y explicar y modificar el método durante la sustentación individual.

---

## 📜 Licencia y Créditos

Este software se distribuye bajo la **[Licencia MIT](LICENSE)**, autorizando su uso, modificación y distribución académica en la Universidad Nacional de Colombia.

### Bibliotecas de Código Abierto Utilizadas y Sus Licencias (Sección 12)
* **SciPy** (`scipy.optimize`: HiGHS & SLSQP) — Licencia **BSD-3-Clause**
* **NumPy** — Licencia **BSD-3-Clause**
* **FastAPI** — Licencia **MIT**
* **Pydantic** — Licencia **MIT**
* **Next.js** & **React** — Licencia **MIT**
* **Plotly.js** & **react-plotly.js** — Licencia **MIT**
* **KaTeX** — Licencia **MIT**
* **Tailwind CSS** — Licencia **MIT**
* **Lucide React** — Licencia **ISC**
* **SheetJS (`xlsx`)** — Licencia **Apache-2.0**

### Referencias Bibliográficas
* Romero, C. (1993). *Teoría de la decisión multicriterio: conceptos, técnicas y aplicaciones*. Alianza Editorial.
* Zeleny, M. (1973). *Compromise Programming*. En Cochrane, J. L. & Zeleny, M. (Eds.), *Multiple Criteria Decision Making*. University of South Carolina Press.
* Jaramillo Álvarez, P. (2026). *Material docente, diapositivas (Clase 15) y cuadernos de taller de Introducción al Análisis de Decisiones (IAD)*. Universidad Nacional de Colombia – Sede Medellín.
