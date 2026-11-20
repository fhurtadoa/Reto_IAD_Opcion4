# Estabilización final de OptiCompromise Cockpit V2

**20 de noviembre de 2026 · NO LISTO PARA ENTREGA**

La revisión local encontró errores de factibilidad, cálculo y presentación que podían producir un resultado incorrecto con etiqueta de óptimo. Se corrigieron en la rama `audit/estabilizacion-final`. Para acreditar la entrega integral todavía hacen falta la ruta E3 disponible para el jurado y el video E6. La matriz indica el alcance de las comprobaciones y los casos sin reproducción individual.

## 1. Estado inicial y procedencia

- La rama activa era `audit/opticompromise-iad`, con `HEAD` y su referencia remota en `e7c317ed1101314f9405ba5749fe274f73f1ef7c`. `origin/main` apuntaba a `7ff1a9ddce8afdc5728fca4a988f9076cd955074`. Se consultaron ambas referencias en GitHub mediante `git ls-remote`.
- El árbol local tenía 16 archivos modificados sin preparar, con 2.025 inserciones y 585 eliminaciones. Se inspeccionaron `git status`, `git diff --stat`, `git diff --check`, el historial, el stash y las referencias locales de validación. Los parches auditados estaban en esos cambios locales. Se usó la copia de trabajo efectiva, incluidas sus pruebas y datos, como punto de partida.
- Se creó un worktree hermano, `Reto_IAD_Opcion4_estabilizacion`, en la rama `audit/estabilizacion-final`. El commit local `39b90e01f7276c2bebba5bc974a76c45e4cf7a12` conserva los 16 cambios de entrada. Su árbol es `a953e53abf7ec7dcfb4e66f44ce5fd8b456d356a`. La primera corrida de Python en esa copia dio **57 aprobadas**.
- Se recuperó el informe original de Antigravity de la sesión local `521912f9-c9ed-4eab-8da3-19e53c663d18`, paso 104 del historial completo. El resumen posterior agrupa el ejemplo 06 y el hallazgo de refinamiento bajo una misma etiqueta. La numeración de esta matriz sigue el informe original, que identifica BUG-06 con el refinamiento de L₂ cuando SLSQP se estanca.
- Había un `next dev` en 3001 y servicios API en 8000 y 8001. La auditoría usó 13119 para desarrollo, 13129 y 13139 para producción aislada y 13118 para API. Las compilaciones de producción usaron salidas aisladas. La aplicación V2 está en [OptiCompromise_Cockpit_V2](OptiCompromise_Cockpit_V2/README.md).

## 2. Matriz de los 26 hallazgos

`Presente` indica que el cambio se encontró en el árbol inicial. `Parcial` indica que se halló código relacionado y se confirmó una carencia o que queda verificación puntual. Los identificadores de pruebas de Python se encuentran con `rg` en `api/tests` y los casos A–O están definidos en la batería de navegador.

| ID | Parche al inicio | Prueba y resultado observado | Regresión o límite | Estado final |
|---|---|---|---|---|
| BUG-01 | Presente. Cotas enteras preparadas antes de SLSQP y del árbol. | `test_mip_perturbed_integer_bound_avoids_slsqp_crash` y `test_integer_bounds_do_not_expand_across_a_lattice_point`. El primer caso resuelve. Los dominios sin puntos de la retícula devuelven 400. | El margen ±10⁻¹² ampliaba dominios válidos como números reales. | Corregido y verificado. |
| BUG-02 | Presente. Desempate de L₂ con objetivos de peso cero. | `test_l2_zero_weight_tie_break_avoids_dominated_solution` y enumeración con pesos nulos. Se conservaron el óptimo primario y, en el caso original, la mejor coordenada secundaria disponible. | Si el candidato de desempate no cumple la factibilidad y el objetivo primario, se conserva el incumbente. | Verificado en los casos ensayados. |
| BUG-03 | Presente. Validación posterior en el modelo original. | `test_integer_fractional_bound_consistent_feasibility_across_metrics`, filas equivalentes y contradicciones constantes exactas. | HiGHS toleraba `0 = 10⁻²⁰`. Se valida el signo de cada restricción constante antes de optimizar. | Corregido y verificado. |
| BUG-04 | Presente. Tratamiento de gradiente casi nulo. | `test_unbounded_null_ray_l2_certifies_optimal`. Con $0\le x_1-2x_2\le10$, L₂ alcanza $x_1-2x_2=490/58$. | La magnitud por sí sola no acota el error sobre una región extensa. Se usa el gradiente de la cuadrática y un LP tangente cuando el gradiente calculado es distinto de cero. | Corregido y verificado en el rayo original. |
| BUG-05 | Presente. Desempate secundario secuencial. | `test_lexicographic_payoff_sequential_fallback_on_cancelling_objectives`, casos con óptimos múltiples y diagonales verificadas por enumeración. | En el intervalo $[0,10^{-10}]$ la limpieza anterior colapsaba ambos extremos. Se conservan valores interiores y se comprueba la cara óptima en su propia escala. | Corregido y verificado. |
| BUG-06 | Parcial. La guarda `slsqp_progressed` impedía búsqueda tangencial si SLSQP se estancaba. | Se simuló SLSQP sin progreso. Celdas se recupera por búsqueda lineal exacta. Transporte a 25/75 conserva `feasible_suboptimal` mientras falte certificado. | El estado parcial sigue siendo observable y tiene una regresión explícita. | Corregido y verificado. |
| BUG-07 | Presente. Presupuestos por muestra y caché de estructura. | Transporte y cadena entera con caché fría y caliente, 21 muestras por métrica, prueba concurrente de deduplicación y reintento. | El presupuesto acota partes de la búsqueda, no el tiempo total de un barrido. La latencia fría de la cadena fue 19,58 s en la medición local. | Verificado con riesgo de latencia registrado. |
| BUG-08 | Presente. Papel en el catálogo y en Colab. | Catálogo de seis ejemplos, coherencia del motor embebido y resolución local de los seis cuadernos precargados. La descripción de Flota identifica la adaptación continua. | La interfaz y los permisos de Google Colab alojado quedan fuera de la prueba local. | Verificado localmente. |
| BUG-09 | Presente. Escalado continuo y comprobación del minimax. | Casos B/C y regresiones con rango continuo $10^{-10}$ y cota entera $10^{10}$. El minimax entero de referencia baja de 0,8 a 0,16. | HiGHS puede eliminar coeficientes estructurales pequeños. Se reescala la variable epígrafe y se verifica la distancia devuelta. | Corregido y verificado. |
| BUG-10 | Parcial. El botón Resolver y el cambio a Tabla aplicaban el borrador. | Se ingresaron ecuaciones manualmente, se probó un borrador inválido, se pasó a Tabla con uno válido y se resolvió con el botón superior. | Navegación y exportaciones todavía podían usar el modelo anterior con un borrador pendiente. Se bloquean hasta aplicar o descartar y la cabecera indica el estado del borrador. | Corregido. |
| BUG-11 | Presente. Normalización visible desde Formular. | Pesos libres que suman 1,18 y pruebas API con pesos inválidos. La app informa el error y suspende las exportaciones del resultado. | Se verificó la ruta de recuperación por los controles de preferencias. | Verificado. |
| BUG-12 | Presente. Entrada de peso con búfer. | Extremos 0/1, cambios rápidos y campos de texto decimales ejercitados en Chrome. | Se eliminó el segundo envío al salir de un campo con un valor válido. Un valor incompleto conserva el valor aplicado. | Corregido y verificado. |
| BUG-13 | Presente. Limpieza de logros y formato compacto. | Casos de extremos y objetivo $10^{-12}x_1$, contraste con valores exportados. | La limpieza genérica borraba magnitudes de entrada reales y el API podía enviar `-0`. Se limita la limpieza de residuos a logros y se normaliza el cero en la salida del motor. | Corregido. |
| BUG-14 | Presente. Variables derivadas de las ecuaciones y detección de términos inválidos. | Se eliminó x₂, se rechazó `2 x1 3 x2` y se aceptó `2 x1`. Casos K–M cubren producto de variables, asterisco sin factor y desbordamiento. | El primer parche rechazaba también la multiplicación implícita válida con espacio. | Corregido. |
| BUG-15 | Parcial. Validación de encabezados y cotas binarias. | Modelo de ida y vuelta con variables Seccion y Nombre, dos objetivos homónimos, igualdad y binaria fija en 1. | La importación anterior cambiaba la binaria fija a libre. Los encabezados reservados se exportan con prefijo y se conservan las cotas finitas explícitas. | Corregido. |
| BUG-16 | Presente. Envolvente escalada por coordenadas. | En Chrome se compararon los tres vértices de una envolvente con rango $1,8868\times10^{-10}$ en cada eje. Los casos D/E coinciden en el espacio de decisiones. | La prueba cubre el caso bidimensional pequeño y la invariancia de escala de filas. | Verificado. |
| BUG-17 | Presente. Atributos de formulario y etiquetas accesibles. | Se usaron selectores semánticos para catálogo, ecuaciones, pesos, importación y ejes. Se revisó la ausencia de errores de KaTeX en «Ver método». | La revisión no cubre un lector de pantalla ni todos los avisos de DevTools. | Verificado en el recorrido, cobertura parcial. |
| BUG-18 | Presente. El perfil se actualiza con pesos y número de objetivos. | En Chrome se eligió «Priorizar Z₁», se añadió un objetivo y se contrastaron pesos de un tercio con el perfil «Iguales» activo. | También se verificó la persistencia del peso final en cambios rápidos. | Verificado. |
| BUG-19 | Presente. Control de semilla y manejo de error de catálogo. | Chrome exportó la semilla 123 al editarla y simuló HTTP 503 en un ejemplo. Se conservó el modelo en pantalla y quedaron suspendidas las exportaciones de resultados. | Se comprobó también que cambiar de ejercicio invalida una petición anterior. | Verificado. |
| BUG-20 | Presente. Escape de símbolos y formateo de LaTeX. | «Ver método» renderiza sus fórmulas y vista previa. Un modelo con variable `x_1_` y RHS 0,018868 conservó el número literal y renderizó sin errores de KaTeX. | El RHS 0,018868 todavía se mostraba como 0,0189. La vista de formulación conserva ahora el valor de entrada y representa una binaria fijada. | Corregido, cobertura visual parcial. |
| BUG-21 | Presente. Color claro de L₂ en los gráficos oscuros. | Capturas de «Ver método», Objetivos 2D, región mixta y Espacio 3D. | La muestra de color junto al control de pesos seguía oscura. Se ajustó al color claro del tema. | Corregido en las vistas documentadas. |
| BUG-22 | Presente. Isodistancias según pesos y objetivos constantes. | Se trazaron perfiles con pesos extremos y se inspeccionó el manejo de objetivos constantes en `computeIsodistanceTraces2D`. | La geometría de todas las proyecciones de cuatro objetivos queda fuera de la comparación automatizada. | Presente, cobertura parcial. |
| BUG-23 | Presente. Márgenes y agrupación de etiquetas. | Se revisaron figuras de pesos extremos y la región mixta. Las métricas coincidentes se agrupan en decisiones. | Queda una comprobación sistemática de todos los tamaños y estados del radar. | Presente, cobertura parcial. |
| BUG-24 | Presente. Intervalos por fibra entera. | Caso con $y=x/2$, $x\in\{0,1,2,3,4\}$; se contrastan cinco coordenadas de Plotly con la retícula. | Se omitió el recorrido discreto cuando sus extremos exceden la retícula entera representable de JavaScript. La leyenda distingue las muestras mixtas. | Corregido. |
| BUG-25 | Presente. Intercambio entre ejes ya ocupados. | Se intercambiaron X con Y en 2D con Sostenibilidad, y X con Z en 3D con Flota. Sostenibilidad ofrece una vista 3D con ejes fijos. | Se verificaron valores de selectores y trazas 3D. | Verificado. |
| BUG-26 | Parcial. Orden por X y desempate por Y. | Inspección del comparador de orden y recorrido de gráficos 2D con objetivos de distinta escala. | La tolerancia absoluta en X podía reordenar todo un frente de escala diminuta y rompía la transitividad. Se desempata en Y para empates reales en X. | Corregido, cobertura gráfica parcial. |

## 3. Defectos nuevos y correcciones

| Prioridad | Reproducción en `39b90e0` | Corrección |
|---|---|---|
| P0 | Max x, min x, $x\in[0,10^{-10}]$, $w=(0,8;0,2)$. Matriz repetida en el extremo superior y distancia cero para las tres métricas. | La limpieza solo corrige coordenadas que quedaron apenas fuera de la cota. Las coordenadas continuas con cotas declaradas diminutas se reparametrizan. |
| P0 | Restricción $0=10^{-20}$ o $0\ge10^{-20}$. El motor podía resolver y publicar `optimal`. | Se detectan contradicciones constantes antes de invocar HiGHS. Se informa infactibilidad en API y navegador. |
| P0 | Entera con $1,0000000000005\le x\le1,5$. El motor publicaba $x=1$. | Se aplican techo y piso exactos a las cotas representadas. Si la retícula es vacía, se informa infactibilidad. |
| P0 | Max x, min x con $x\in\mathbb{Z}\cap[0,10^{10}]$, pesos 80/20. L₂ devolvía 0,2 y minimax 0,8, ambos óptimos. | Se reescala la variable epígrafe de minimax y se reparametrizan las coordenadas enteras solo en la relajación de L₂. El árbol y sus soluciones conservan la retícula. L₁ y minimax cotejan el candidato final con el valor de referencia del solver. |
| P1 | Dos solicitudes frías sobre la misma estructura podían repetir la matriz, Pareto y sensibilidad. | Una solicitud calcula la estructura por clave y las concurrentes comparten el resultado. Después de un fallo, una nueva solicitud puede reintentar. |
| P1 | Borrador algebraico pendiente y exportación o navegación a resultados con el modelo anterior. | Los controles usan el estado del borrador y muestran la instrucción para aplicarlo o descartarlo. |
| P1 | CSV/XLSX con nombres de columnas reservados y binaria acotada explícitamente. El modelo se rechazaba o cambiaba de dominio. | Columnas de coeficientes sin colisión, validación de ambigüedad, importación compatible con el formato histórico y conservación de cotas finitas. |
| P2 | Factor implícito `2 x1` rechazado y RHS 0,018868 redondeado en la vista matemática. | Se conserva el formato algebraico admitido antes del parche y se muestran con precisión los coeficientes y cotas de formulación. |
| P2 | Cambio de campo iniciaba una segunda resolución del mismo valor. Los extremos de la malla 2D podían exceder la retícula de JavaScript. | Se elimina el envío duplicado al salir de un campo y se comprueba la representabilidad de los extremos antes de enumerar. |
| P1 | El registro de npm reportó tres paquetes de producción con avisos, incluidos Next.js, PostCSS y SheetJS. | La revisión V2 fija Next.js 15.5.29, PostCSS 8.5.33, incluido el transitivo de Next.js, y SheetJS CE 0.20.3 desde su fuente oficial. La auditoría volvió a dar cero avisos de producción. |
| P2 | El orden de Pareto 2D trataba como iguales las abscisas separadas por menos de $10^{-9}$. | Comparación total por X y desempate por Y, independiente de la escala de X. |

Se conservó el presupuesto de las muestras enteras de L₂ en Pareto y sensibilidad, 0,05 s y 0,08 s respectivamente para los pasos temporizados. El cálculo principal de L₂ amplía ese presupuesto de 1 s a 5 s. La cadena docente reprodujo el efecto de un presupuesto agotado. Con 1 s, el candidato tenía distancia 0,3376915859 y estado parcial. Con tiempo para completar los cortes alcanzó 0,3373878575 y certificó el valor del oráculo. Desde esta revisión, el mismo plazo cubre la relajación de raíz, la búsqueda y el pulido de L₂ entero. Se comprueba entre iteraciones de SLSQP. Las llamadas lineales y la preparación del barrido también contribuyen al tiempo total del API.

## 4. Contraste independiente

- **Intervalo continuo y retícula grande.** Para $u=x/U$ se minimizan $0,8(1-u)+0,2u$, $0,64(1-u)^2+0,04u^2$ y $\max(0,8(1-u),0,2u)$. Los minimizadores continuos son $1$, $16/17$ y $0,8$ y las distancias son $0,2$, $0,194028500029$ y $0,16$. Para $U=10^{10}$ entero, se compara el estacionario con sus vecinos en la retícula. Se obtuvo $x_{L_2}=9\,411\,764\,706$ y $x_{L_\infty}=8\,000\,000\,000$.
- **Enumeración racional.** Se generaron 24 problemas con semilla 418, dos variables enteras, una binaria, tres criterios y pesos que pueden ser cero. La enumeración verificó factibilidad, las tres diagonales de pagos y 72 valores óptimos. Para las métricas se utilizaron los rangos publicados por la matriz como parte de la formulación observada. Se comparó el valor óptimo exacto con `Fraction` sin exigir una decisión específica en un empate. [Regresiones nuevas](OptiCompromise_Cockpit_V2/api/tests/test_estabilizacion_final.py)
- **Rayo nulo y objetivos secundarios opuestos.** El rayo mantiene acotadas las imágenes de ambos objetivos y conserva el óptimo $490/58$. El caso con secundarios casi opuestos verifica la primera fila de pagos y la coordenada de desempate. Una prueba con SLSQP simulado verifica explícitamente que factibilidad sin certificado se comunica como parcial.
- **Modelos del curso.** Celdas y Transporte tienen coberturas independientes de las tres métricas. Papel a 56/44 y los perfiles asimétricos de Transporte se contrastaron con sus datos de clase. La suite cubre también la cadena entera, objetivos constantes, una adaptación binaria de la hoja de métricas y dos oráculos externos analíticos o de enumeración.
- **Pareto y sensibilidad.** Se inspeccionaron membresía y estados de los puntos, cambios de escala, extremos de pesos y el cotejo de la desviación por peso con una derivación independiente. El resultado es una muestra de frontera. La deduplicación tiene una tolerancia en el espacio normalizado y la etiqueta de una muestra L₂ conserva el estado parcial cuando corresponde. [Oráculo de navegador](OptiCompromise_Cockpit_V2/qa/red_team/oracle.py)

## 5. Auditoría académica

Las bases de la Opción 4, pp. 6–7, exigen editor, vista matemática, matriz de pagos, aproximación al nadir, normalización, pesos interactivos, tres métricas, muestra de frontera, gráficos y estados del solver. Celdas es el caso lineal biobjetivo verificado y Transporte tiene 12 variables. Cockpit admite tres o más criterios y admite dominios entero y binario como extensión. El texto de las bases menciona tres objetivos en el editor obligatorio y de nuevo en bonificación. Se acredita que el editor y los gráficos lo admiten. El alcance probado cubre modelos lineales. [Bases oficiales](BASES%20DE%20CONCURSO%20IAD.pdf)

La formulación continua usa $D_2=\sqrt{\sum_i(w_i d_i)^2}$, confirmada visualmente en la Clase 15, pp. 9 y 19, y en el código del ejercicio de Transporte. La prosa del cuaderno introductorio y la hoja discreta usan también una convención con el peso fuera del cuadrado. Con pesos desiguales son problemas distintos. Se conserva la formulación de las diapositivas para la opción continua y se documenta la diferencia en el contraste discreto. La frase «pesos iguales» de Papel convive con una fórmula por dígito y el enunciado de Cadena admite varias interpretaciones de tiempo. Para reproducir se usaron la fórmula explícita de Papel y la formulación documentada en el entregable de Cadena. [Validación curricular previa y referencias](OptiCompromise_Cockpit_V2/VALIDACION_FINAL_EJERCICIOS_IAD.md)

| Entregable | Evidencia |
|---|---|
| E1 · Inscripción | Estado del formulario institucional fuera del repositorio. |
| E2 · Avance | El prototipo se ejecutó localmente. El acto de demostración de 10 minutos queda fuera de esta revisión. |
| E3 · Herramienta final | Código, licencia, manual, pruebas, declaración de IA y cuaderno disponibles localmente. Falta acreditar un despliegue estable de la revisión final o el Colab alojado con permisos de comunidad y docentes y el cuaderno descargado desde ese entorno. |
| E4 · Ejemplos | Seis modelos en web y Colab, incluidos Celdas y Transporte. |
| E5 · Manual | PDF y guía web con recorrido de formulación, resolución e interpretación. La UI actual se probó como recorrido independiente del manual existente. |
| E6 · Video | El README registra el enlace como pendiente. Las bases exigen 5 a 8 minutos. |
| E7 · Sustentación, si procede | Se simuló ingreso manual de casos inéditos. La evaluación institucional y la prueba por estudiantes externos quedan pendientes de la instancia del curso. |

## 6. Resultados de ejecución y revisión visual

| Prueba | Resultado |
|---|---|
| Python de Cockpit V2 | **63/63 aprobadas**. La última corrida tomó 16,606 s. Una corrida anterior bajo carga concurrente tomó 120,011 s. |
| Chrome con compilación de producción | La batería A–O y su oráculo pasaron. Se verificaron casos continuos, mixtos, infactibles, no acotados y tres errores de sintaxis. En H se compararon 99 puntos de Pareto con el conjunto mixto exacto y el oráculo detectó cero dominados con su tolerancia. |
| Recorrido específico de estabilización | Se comprobó el borrador, edición y transiciones de modo, pesos extremos, ida y vuelta JSON/CSV/XLSX, modelo ante un 503, semilla inmediata, cinco fibras mixtas, envolvente diminuta, perfil al añadir un objetivo, ejes 2D/3D y bloqueo de exportación tras una infactibilidad. |
| Validación docente en Chrome | 14 perfiles de Clase 11, Celdas, Transporte y Papel. Las 42 soluciones tuvieron estado óptimo y la mayor diferencia absoluta de distancia frente al oráculo fue $2,78\times10^{-8}$. |
| Tipos, lint y producción | TypeScript, ESLint y build aislado pasaron con Next.js 15.5.29. |
| Dependencias de producción | `npm audit --omit=dev` pasó de tres paquetes con avisos a cero. El dato se refiere al árbol de producción de Cockpit V2 en esta fecha. [Guía oficial de Next.js 15](https://nextjs.org/docs/app/guides/upgrading/version-15) · [Distribución oficial de SheetJS CE para Node.js](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) |
| Colab local | La celda 2 coincide exactamente con el generador. Las cuatro celdas de código compilaron y los seis ejemplos dieron `optimal` en las tres métricas. Se ejecutó también el panel con Matplotlib no interactivo. |

En «Ver método», la matriz y las fórmulas se compararon con las respuestas del solver. El título, los subtítulos y la navegación se inspeccionaron en claro y oscuro. A 390 px el documento midió 390 px de ancho. En las gráficas se revisaron leyendas, contraste, coordenadas, márgenes, controles de ejes y exportación PNG de 2400 × 1500 px. La prueba de alternancia de modelo y pesos observó que la respuesta anterior se canceló y comprobó que los ejes finales correspondían al ejercicio elegido. [Método a 390 px](OptiCompromise_Cockpit_V2/qa/estabilizacion/evidencia/metodo-oscuro-movil.png) · [Decisiones mixtas](OptiCompromise_Cockpit_V2/qa/estabilizacion/evidencia/fibras-enteras.png) · [Flota 3D](OptiCompromise_Cockpit_V2/qa/estabilizacion/evidencia/ejes-3d-oscuro.png)

Se repitieron 14 perfiles docentes en el navegador final. La batería de 37 perfiles es evidencia histórica del repositorio. Quedaron fuera el runtime alojado de Colab y sus permisos, el despliegue accesible al jurado, la sustentación y una evaluación formal de accesibilidad. Durante la iteración se detectaron reinicios propios de desarrollo, tiempos insuficientes en algunas corridas y selectores de prueba inadecuados para gráficos 3D con ejes fijos. La batería final usó un backend estable y un frontend de producción.

## 7. Reproducción

Desde `OptiCompromise_Cockpit_V2`, con Python 3.14.0, SciPy 1.17.1 y el navegador Chrome 157.0.8103.79.

```sh
PYTHONPATH=api python3 -m unittest discover -s api/tests -v
python3 colab/sync_engine.py
git diff --check

python3 -m uvicorn api.index:app --host 127.0.0.1 --port 13118
# En otra terminal, desde web, tras npm ci
API_URL=http://127.0.0.1:13118 ./node_modules/.bin/next dev -p 13119 -H 127.0.0.1

# Desde Cockpit V2, con playwright-core 1.62.1 disponible en NODE_PATH
RED_URL=http://127.0.0.1:13119 node qa/estabilizacion_browser.cjs /tmp/opticompromise-browser
RED_URL=http://127.0.0.1:13119 RED_SOLVE_TIMEOUT_MS=90000 \
  node qa/red_team/browser.cjs /tmp/opticompromise-red
python3 qa/red_team/oracle.py /tmp/opticompromise-red/results.json --verify

python3 qa/validacion_iad/casos.py /tmp/opticompromise-modelos
RED_URL=http://127.0.0.1:13119 node qa/validacion_iad/navegador.cjs \
  /tmp/opticompromise-modelos /tmp/opticompromise-academico clase11 celdas transporte papel
python3 qa/validacion_iad/oraculo.py \
  /tmp/opticompromise-academico/browser.json /tmp/opticompromise-academico/comparacion.json
```

En un directorio independiente para el frontend, se ejecutan `npx tsc --noEmit --incremental false`, `npm run lint` y `npm run build`. Con el lockfile de V2 se ejecuta `npm audit --omit=dev`. El oráculo docente usa PuLP/CBC y CVXPY/Clarabel. Para verificar el cuaderno, se compara su celda 2 con `engine_source(Path("api/core"))`, se compilan las cuatro celdas de código y se ejecuta `resolver_opticompromise` para cada entrada de `MODELOS_EJEMPLO`. El panel también se probó con backend de Matplotlib no interactivo.

## 8. Riesgos residuales

- La precisión depende del condicionamiento, la representación binaria de datos y las tolerancias del solver. En problemas con grandes desplazamientos, coeficientes casi dependientes o rangos comparables al redondeo conviene revisar el estado parcial y el residuo en unidades del modelo. Los ensayos finitos no establecen una garantía universal.
- La carga fría varía con el modelo y el hardware. La fibra mixta de la regresión respondió en 4,318 s en frío y 0,086 s con caché en la revisión final. El barrido de una cadena entera tomó 19,58 s y la segunda ponderación 0,57 s con caché en la medición local. Para Transporte fueron 4,05 s y 0,09 s. El cálculo principal y sus muestras conservan presupuestos distintos.
- La cobertura visual no equivale a una evaluación con lectores de pantalla, usuarios externos o todos los navegadores y tamaños. Se conservan los estados de cobertura parcial de la matriz.
- Se auditó el frontend de Cockpit V2, que es la carpeta que debe seleccionarse como raíz de construcción del concurso. El código histórico de la raíz del repositorio está fuera de esta revisión.
- La ejecución del cuaderno en un runtime local verifica los datos y el motor embebido. Los permisos docentes, el runtime alojado y la ruta E3 requieren comprobación independiente con la versión que se entregue.

## 9. Estado final y dictamen

**NO LISTO PARA ENTREGA.** La rama local `audit/estabilizacion-final` contiene el resultado, con el árbol original preservado. Se verificó que el diff binario del directorio de trabajo original coincide con la instantánea `39b90e0` y que el servidor original seguía activo. El concurso todavía requiere acreditar E3 y E6. Las pruebas de servidor y navegador corresponden a ejecución local aislada.

**Uso de IA.** OpenAI Codex apoyó el análisis del historial, la reproducción de defectos, los cambios en el motor y la interfaz, las pruebas automatizadas y la elaboración de este informe. Los parches de partida y su informe histórico procedían de Gemini/Antigravity.
