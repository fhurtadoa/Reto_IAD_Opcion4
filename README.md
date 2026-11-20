# 🧭 OptiCompromise

La implementación auditada para el concurso está en [OptiCompromise Cockpit V2](OptiCompromise_Cockpit_V2/README.md). Su [documento técnico y matriz de trazabilidad](OptiCompromise_Cockpit_V2/docs/auditoria-iad.md) incluye la declaración de uso de OpenAI Codex y los resultados de validación. Las instrucciones siguientes corresponden a la versión anterior ubicada en la raíz.
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

OptiCompromise es una plataforma interactiva, educativa y de código abierto concebida para sustituir las herramientas comerciales privativas (como Evolver/Optimizer de Lumivero). Permite formular, analizar y resolver problemas de decisión multiobjetivo continuos, encontrando las soluciones compromiso óptimas respecto al **Punto Ideal** bajo distintas métricas de distancia:

1. **Métrica $L_1$ (Manhattan):** Resuelta como Programación Lineal (LP). Modela un decisor con efecto compensatorio entre objetivos.
2. **Métrica $L_2$ (Euclidiana):** Resuelta como Programación Cuadrática Convexa (QP) con `scipy.optimize.minimize(method='SLSQP')`. Genera un compromiso suave sin saltos abruptos.
3. **Métrica $L_\infty$ (Tchebysheff / Minimax):** Linealizada mediante variable auxiliar $\lambda$. Garantiza equidad y equilibrio estricto entre objetivos ($Z'_1 = Z'_2 = \dots = Z'_q$ bajo pesos iguales).
4. **Frontera Eficiente de Pareto:** Aproximación y trazado de las soluciones no dominadas en el espacio de objetivos 2D y 3D.
5. **Módulos de Bonificación (+10 pts):**
   * Soporte de variables enteras y binarias (MIP con HiGHS).
   * Visualización interactiva para 3 objetivos en 3D con Plotly.
   * Optimización bajo restricciones y funciones no lineales (SLSQP).

---

## 📐 Casos de Validación del Curso (Verificados al 100%)

La herramienta incluye pruebas automatizadas en `api/tests/` que reproducen los ejercicios oficiales del curso:

| Caso de Estudio | Variables | Objetivos | Ideal ($Z^*$) | Anti-Ideal ($Z^{peor}$) | Solución $L_1$ ($w=0.5$) | Solución $L_\infty$ ($w=0.5$) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Planificación Celdas (Clase 15)** | 2 | 2 (Utilidad vs Contam) | $(800.000, -200)$ | $(300.000, -600)$ | $x=[0, 200] \implies Z_1=600k, Z_2=-400$ ($Z'_1=60\%, Z'_2=50\%$) | $x=[0, 191] \implies Z_1=572.7k, Z_2=-381.8$ ($Z'_1=Z'_2=54.55\%$) |
| **Transporte (Taller 3)** | 12 | 2 (Costo vs Riesgo) | $(16.800, 2.600)$ | $(18.500, 5.700)$ | $Z_1=17.400, Z_2=3.600$ ($Z'_1=64.7\%, Z'_2=67.7\%$) | $Z_1=17.382, Z_2=3.662$ ($Z'_1=Z'_2=65.75\%$) |
| **Triobjetivo 3D (Bonus)** | 3 | 3 (Económico, Ambiental, Social) | Verificado en 3D | Verificado en 3D | Compromiso ponderado | Equilibrio tripartito |

---

## 🚀 Guía de Ejecución y Despliegue

### Opción A: Despliegue Web en Vercel (Recomendado)
1. Conectar este repositorio de GitHub a tu cuenta de [Vercel](https://vercel.com).
2. Vercel detecta automáticamente el frontend de Next.js (`web/`) y las funciones serverless de Python (`api/`).
3. La entrega requiere una URL estable validada. Consulta las [instrucciones de Cockpit V2](OptiCompromise_Cockpit_V2/README.md) para la versión candidata.

### Opción B: Ejecución en Google Colab
Abrir el cuaderno autónomo [`colab/OptiCompromise_Colab.ipynb`](colab/OptiCompromise_Colab.ipynb) en Google Colab. No requiere clonar repositorios externos ni configurar tokens; se ejecuta directamente en las celdas del notebook.

### Opción C: Ejecución Local
```bash
# 1. Iniciar backend FastAPI (Python 3.10+)
cd api
python3 -m pip install -r requirements.txt
uvicorn index:app --reload --port 8000

# 2. Iniciar frontend Next.js en otra terminal
cd web
npm install
npm run dev
# Abrir http://localhost:3000
```

---

## 🧪 Pruebas Automatizadas del Motor

Para ejecutar la suite de pruebas unitarias y verificar la exactitud de los cálculos:
```bash
cd api
PYTHONPATH=. python3 -m unittest discover tests/ -v
```

---

## 🤖 Declaración de Uso de Inteligencia Artificial

En cumplimiento con la Sección 12 de las Bases del Concurso:
* Se utilizó Inteligencia Artificial (asistente Antigravity / Gemini) como soporte técnico para la estructuración de la arquitectura de software, aceleración de la interfaz gráfica y redacción de pruebas unitarias.
* Toda la formulación matemática, relaciones de equivalencia minimax, funciones de distancia normalizada y lógica de las métricas $L_1, L_2, L_\infty$ fueron rigurosamente validadas por los autores contra los teoremas y cuadernos de clase de la profesora Patricia Jaramillo Álvarez.
* Ambos integrantes dominan la totalidad del código y los fundamentos teóricos para la sustentación individual (E7).

---

## 📜 Licencia y Créditos

Este software está protegido bajo la [Licencia MIT](LICENSE), permitiendo su uso, modificación y distribución con fines académicos en la Universidad Nacional de Colombia.

* **Bibliotecas base:** SciPy (`scipy.optimize`), NumPy, FastAPI, Next.js, React, Plotly.js, KaTeX, Tailwind CSS.
* **Bibliografía:**
  * Romero, C. (1993). *Teoría de la decisión multicriterio: conceptos, técnicas y aplicaciones*. Alianza Editorial.
  * Jaramillo Álvarez, P. (2026). *Material docente y diapositivas de Introducción al Análisis de Decisiones*. Universidad Nacional de Colombia.
