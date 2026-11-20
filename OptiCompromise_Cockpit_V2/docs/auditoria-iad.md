# Auditoría de OptiCompromise para el Concurso IAD

Alcance de la evaluación: Opción 4, aplicación web de `OptiCompromise_Cockpit_V2`. Línea base `7ff1a9d`. La configuración de Vercel que corresponde a esta versión está dentro de Cockpit V2. La raíz del repositorio contiene una implementación anterior.

Fuente normativa: [Bases de Concurso IAD](../../BASES%20DE%20CONCURSO%20IAD.pdf), §§1–5 y 9–13. Los puntos son **por bloque**. Las bases no asignan puntos individuales a las filas. El encabezado de la sección 11 dice «100 puntos + 5 de bonificación» y la tabla indica de 0 a 10 para bonificación, más una sustentación entre −15 y 10. La aplicación de esos límites corresponde al jurado. El umbral de premiación es 70/100.

## Trazabilidad de la Opción 4

| Requisito y bloque de la rúbrica | Línea base e implementación | Evidencia reproducible | Estado actual y acción |
|---|---|---|---|
| Editor con cotas, al menos tres objetivos min/max, ≤/≥/= y vista matemática (§9, funcionalidad 30) | Tabla y editor algebraico con previsualización KaTeX. | Abrir Sostenibilidad 3D. En **Formular**, agregar una restricción de igualdad y revisar la vista matemática. [Caso automatizado de tres objetivos e igualdades redundantes](../api/tests/test_audit_regressions.py). | **Cumplido.** Se mantiene el caso de dos objetivos requerido por las bases. |
| Matriz de pagos, ideal y nadir aproximado (§9, funcionalidad 30) | Una optimización por objetivo, con desempate en la cara óptima. La línea base sustituía ciertos valores observados de nadir por un número auxiliar. | **Ver método** en Celdas y Transporte. Las suites verifican ideales y nadir. El caso nuevo comprueba el nadir observado con rango nulo. | **Cumplido.** El motor informa la escala auxiliar por separado. |
| Normalización por rango y pesos editables (§§5, 9, funcionalidad 30 y usabilidad 30) | Deslizadores y balance proporcional. La API ajustaba silenciosamente pesos incorrectos. | Cambiar un deslizador de Celdas con las flechas. Desactivar balance e ingresar una suma inválida. Ver la prueba HTTP de pesos fuera de rango. | **Cumplido.** API e interfaz aplican la misma tolerancia de 0,001, compatible con modelos históricos que guardan 0,333 por criterio. |
| L₁ lineal, L₂ cuadrática, L∞ minimax con variable auxiliar. Mostrar variables, objetivos, logro y distancia (§9, funcionalidad 30) | HiGHS, SLSQP y ramificación y poda para L₂ entera. En la línea base era posible informar optimalidad con un punto inicial factible. | [Regresiones numéricas](../api/tests/test_audit_regressions.py), tabla **Comparación de soluciones**, tabla de decisiones y derivación de L∞ en **Ver método**. | **Cumplido** en los casos comprobados. Cuando L₂ queda sin certificado dentro de la tolerancia, el estado distingue el punto factible. |
| Frontera aproximada con distintos pesos y métricas (§9, funcionalidad 30) | Barrido L₁/L₂/L∞, filtro por dominancia frente a la muestra y tabla de pesos. | Abrir el explorador de la frontera y alternar sus filtros. Pruebas de Pareto continuo, triobjetivo y MIP. | **Cumplido.** Muestreo finito. La envolvente de una proyección 2D usa solo los criterios de sus ejes. |
| Gráficos 2D y 3D o matriz de dispersión, con ideal, nadir, frontera y las tres soluciones (§9, funcionalidad 30) | Plotly 2D y 3D, con radar adicional. Los ejes desaparecían con la forma antigua de configurar títulos. | Celdas en **Objetivos 2D** y Sostenibilidad en **Espacio 3D**. | **Cumplido.** La vista 3D conserva los tres ejes seleccionables. |
| Región factible con dos variables (§9, funcionalidad 30) | Intersección de semiplanos. La línea base dibujaba una banda falsa alrededor de igualdades. | Celdas en **Región factible** y caso de igualdad. | **Cumplido.** HiGHS calcula las proyecciones de las cotas implícitas. Si un eje carece de cota finita, el gráfico indica que está recortado. La vista MIP distingue la relajación continua de la muestra discreta. |
| Interactividad de pesos (§9, funcionalidad 30 y usabilidad 30) | Recálculo reactivo y caché estructural. Existían ventanas de tiempo con respuestas obsoletas mientras se editaba. | Celdas al pasar de 0,50/0,50 a 0,51/0,49. D₁ pasa de 0,4500 a 0,4490. | **Cumplido.** Se cancelan solicitudes obsoletas y se identifica el último cálculo durante la actualización. |
| Solver libre y estado óptimo/infactible/no acotado (§9, funcionalidad 30) | HiGHS y SciPy. La API marcaba como óptimo todo cálculo con matriz de pagos válida. | Suite de infactibilidad y no acotación. Prueba HTTP que simula SLSQP estancado y comprueba el estado parcial. [Motor](../api/core/compromise.py). | **Cumplido.** El estado parcial aplica a resultados factibles sin certificado o métricas sin solución disponible. |
| Biobjetivo lineal del curso y otro biobjetivo con ≥4 variables (§9, corrección 20) | Celdas, 2 variables, y Transporte, 12 variables. | [Validación](#validación-numérica), ejemplos 01 y 02 y pruebas automatizadas. | **Cumplido.** Falta el caso oficial reservado para el jurado. |
| Objetivos y restricciones no lineales (§9, bonificación 0–10 compartida) | El catálogo V2 admite ecuaciones lineales. La función de distancia L₂ es cuadrática, como exige el caso lineal. | El analizador rechaza productos de variables y potencias no lineales. | **Incumplido** como bonificación. Prioridad baja frente a requisitos obligatorios y entrega. |
| Variables enteras/binarias (§9, bonificación 0–10 compartida) | HiGHS para L₁/L∞ y búsqueda acotada con relajaciones cuadráticas para L₂. | Producción Mixta y pruebas de cotas, restricciones, integralidad y frontera MIP. | **Cumplido** en los ejemplos probados. El presupuesto de L₂ puede producir un resultado parcial. |
| Tres objetivos (§9, bonificación 0–10 compartida) | Sostenibilidad 3D, matriz 3×3 y el caso adicional de Flota con cuatro objetivos. | Ejemplo 04, tests triobjetivo y ejemplo 05 en la vista 3D y radar. | **Cumplido** como capacidad. El mismo soporte aparece entre los requisitos obligatorios y las funciones deseables. |

## Requisitos comunes, entregables y reglas

| Requisito | Bloque | Evidencia y estado | Prioridad |
|---|---|---|---|
| Flujo gráfico en español, validación y ayudas (§5) | Funcionalidad 30 y usabilidad 30 | **Cumplido** para los flujos verificados. Formulación, preferencias, resultados y métodos usan ayudas contextuales y navegación por teclado. | Alta. Medir facilidad y tiempo con dos estudiantes externos. |
| Abrir/guardar, importar datos y exportar CSV/Excel y gráficos PNG (§5) | Funcionalidad 30 | **Cumplido.** Descargas reales de JSON, XLSX, CSV y PNG. Los tres formatos de modelo se reimportaron con las mismas distancias de Transporte. El reporte PDF de resultados es deseable. | Alta. Los formatos tabulares se ajustan a la plantilla de OptiCompromise. |
| Al menos dos modelos, incluido uno del curso (§5, E4) | Funcionalidad 30 y documentación 10 | **Cumplido.** Cinco archivos [JSON](../examples), con ambos casos obligatorios. | Hecho. |
| Semilla configurable si hay azar (§5) | Calidad técnica 10 | **Cumplido.** El muestreo de cuatro o más objetivos aplica la semilla del usuario. Dos y tres objetivos se barren sin azar. Los límites de tiempo de MIP pueden afectar cálculos interrumpidos. | Hecho. |
| Licencia, stack libre y créditos con licencia (§§5, 12, E3) | Calidad técnica 10 | **Cumplido** para el código web auditado. [MIT](../LICENSE), [README](../README.md) y dependencias en los manifiestos de API y web. | Verificar las condiciones del alojamiento elegido al entregar. |
| Repositorio, ejecución estable y validación publicada (§10, E3) | Calidad técnica 10 y documentación 10 | **Parcial.** El repositorio y la ejecución local están disponibles. La entrega exige URL web estable de la versión final o Colab compartido con permisos y ejecución verificada. El Colab embebe otra versión del motor. | Alta. Elegir una vía de entrega y probarla desde una sesión limpia al autorizar el despliegue o el enlace. |
| Manual paso a paso con capturas y glosario (§10, E5) | Documentación 10 | **Cumplido** mediante la [guía web actual](guia-de-uso.md), con capturas y glosario. El [manual PDF anterior](../MANUAL_DE_USUARIO_Y_CASOS_DE_USO_OPTICOMPROMISE.pdf) amplía los casos de uso y conserva capturas de la navegación anterior. | Media. Alinear el PDF enlazado en la barra con la guía web actual. |
| Documento técnico, informe de validación y README (§§11–12) | Documentación 10 | **Cumplido** en la rama. Este informe y el README describen método, evidencia, licencias, referencias y asistencia de IA. | Revisar ambos integrantes antes de entregar. |
| Video de 5 a 8 minutos (§10, E6) | Documentación 10 | **Incumplido** en el repositorio auditado. El README tiene un marcador para el enlace. | Alta. Grabar un recorrido completo con el caso de Celdas y una modificación de pesos. |
| Inscripción, avance, autorización de reutilización y sustentación (§§1–4, 10, E1/E2/E7) | Habilitación y sustentación −15 a 10 | **No verificado.** E1 cerró el 18 de noviembre según las bases. E2 requiere demo en vivo. La licencia MIT está presente y la autorización explícita del equipo se confirma fuera del código. El caso reservado y el dominio individual se evalúan en la sustentación. | Crítica. Confirmar inscripción y autorización explícita. Preparar el caso nuevo con ambos autores. |
| Aportes de todos, originalidad y uso de IA (§12) | Elegibilidad, calidad técnica y sustentación | **Parcial.** Hay entradas de ambos autores en Git y declaración de herramientas en el README. El historial permite comprobar autoría de contribuciones registradas. La revisión de fuentes y el dominio individual son responsabilidad de los autores. | Alta. Los dos integrantes deben poder modificar y explicar el método. |

## Validación numérica

Con pesos 0,50/0,50. Valores en los sentidos naturales de cada problema, conservando costos y emisiones positivos.

| Caso | Ideal | Nadir observado | L₁ | L₂ | L∞ |
|---|---:|---:|---:|---:|---:|
| Celdas, utilidad ↑ y emisiones ↓ | (800 000; 200) | (300 000; 600) | (600 000; 400) | (595 081,97; 396,72) | (572 727,27; 381,82) |
| Transporte, costo ↓ y riesgo ↓ | (16 800; 2 600) | (18 500; 5 700) | (17 400; 3 600) | (17 400; 3 600) | (17 382,33; 3 661,88) |

- **Celdas.** Las diapositivas de Clase 15, pp. 18–21, dan soluciones y logros. En la arista activa con x₁ = 0, el cálculo independiente de L₂ minimiza 0,5(1,6 − 0,006x₂)² + 0,5(−0,5 + 0,005x₂)² y obtiene x₂ = 198,36066. El nuevo test verifica ese punto y sus dos objetivos.
- **Transporte.** Se verificaron coeficientes y esquema de pesos de `Problema_tte_MO_Compromiso.ipynb` del Taller 3. La parte escrita define L₂ como √Σ wᵢDᵢ² y la celda de CVXPY usa √Σ(wᵢDᵢ)². Las dos convenciones dan el mismo minimizador con pesos iguales. OptiCompromise sigue la formulación escrita del taller para pesos desiguales. El test adicional verifica un hiperplano de soporte del óptimo L₂ usando el modelo lineal de Transporte.
- **Caso nuevo.** Maximizar x, minimizar x y maximizar y, con 0 ≤ x, y ≤ 1, y = 1 y pesos iguales. Ideal (1; 0; 1), nadir observado (0; 1; 1), minimax x = 0,5 y logros 50%, 50%, 100%. Tres copias de y = 1 comprueban que las igualdades redundantes no bloquean la QP. El caso muestra que la igualdad de pesos no implica igualdad de todos los logros.
- **Tolerancias y alcance.** Para una cuadrática convexa, minimizar su tangente en un punto factible proporciona una cota inferior. El motor usa esa cota para comprobar la brecha de L₂ y podar nodos enteros. Los resultados parciales conservan el incumbente factible cuando existe. El nadir por pagos es una referencia, de modo que un logro puede caer por debajo de 0% y la distancia normalizada superar 1.

## Auditoría de experiencia

- **Estudiante.** En pantalla estrecha, la versión inicial colocaba el editor entero por delante de gráfico y resultados. La navegación actual abre un caso resuelto y permite saltar a formular o consultar la metodología. Los deslizadores se pueden mover con flechas y las ayudas tienen foco visible.
- **Docente.** La matriz y las fórmulas estaban después de las tablas y eran difíciles de encontrar. **Ver método** reúne la matriz, la normalización y la linealización. Los títulos de ejes identifican criterios y unidades del modelo.
- **Jurado.** Los resultados de una revisión anterior podían combinarse visualmente con los datos editados. La pantalla y las exportaciones usan la misma instantánea del modelo resuelto. La aplicación anuncia errores de validación y señala cuándo la optimalidad no está confirmada.
- Estas verificaciones corresponden a un recorrido técnico de los tres perfiles. La prueba de usabilidad de la sección 11 requiere usuarios externos.

### Evidencia de interacción

- Escritorio de 1440 px y móvil de 390 px sin desbordamiento horizontal global. Se comprobaron los ejes 2D, la región de decisiones, la vista 3D y la navegación hacia la matriz de pagos. [Capturas](guia-de-uso.md#capturas-del-recorrido).
- Se ejecutaron los cinco ejemplos, se cambió un peso con el teclado y se cambió la semilla del caso Flota a 17.
- Se formuló el contraejemplo minimax desde el editor algebraico. El editor rechazó una potencia no lineal y la interfaz presentó el estado infactible para una restricción contradictoria.
- Se descargaron JSON, XLSX, CSV y el PNG de 2400 × 1500 píxeles. Las tres reimportaciones de Transporte dieron D₁ = 0,3378, D₂ = 0,3381 y D∞ = 0,1713.

## Uso de inteligencia artificial

Se utilizó OpenAI Codex para leer y contrastar las bases, inspeccionar el código y la aplicación, implementar mejoras del motor y la interfaz, añadir regresiones y documentar la evidencia. La revisión independiente de los autores y el dominio individual del método se acreditan durante la sustentación. Para explicar la implementación, se recomienda recorrer `compute_payoff_matrix`, `solve_l1`, `solve_linf` y `_solve_continuous_qp` con Celdas y reproducir el caso nuevo desde el editor.
