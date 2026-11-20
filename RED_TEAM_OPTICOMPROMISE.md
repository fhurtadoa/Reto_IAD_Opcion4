# Red team matemático y funcional de OptiCompromise Cockpit V2

**20 de noviembre de 2026.** Se probaron modelos inéditos en Google Chrome 157 con Playwright 1.65.1 y SciPy 1.17.1. Se escribieron las ecuaciones en **Modo Algebraico**, se cambiaron tipos en **Modo Tabla** y se usaron los controles de preferencias, gráficos, descarga e importación. Las peticiones de cálculo se originaron en la interfaz. El oráculo separado usa fórmulas cerradas y enumeración racional. [Interacciones reproducibles](qa/red_team/browser.cjs) · [Oráculo](qa/red_team/oracle.py) · [Entradas y resultados observados](qa/red_team/evidencia/observaciones.json).

## 1. Inventario y cobertura

Para reproducir un caso, selecciona **Nuevo Modelo en Blanco**, titúlalo `RT <id>`, escribe el modelo en **Modo Algebraico** y pulsa **Aplicar Ecuaciones y Resolver**. La plantilla trae x₁, x₂ ∈ [0,100]. Una variable nueva en el editor es continua y no negativa con cota superior declarada libre. En G y H se configuró el dominio en **Modo Tabla**. El registro conserva las ecuaciones literales y el modelo enviado al solver, incluyendo los dominios.

| Caso | Modelo de ingreso manual | Pesos |
|---|---|---|
| A | Max x₁, min x₁, x₁ ≤ 10, x₂ = 0. Modelo base, sensibilidad y exportación. | 0,80 / 0,20, extremos puros y cambios rápidos |
| B | Max t, min t, t ≤ 10¹⁰, x₁ = x₂ = 0. La cota de t viene de la restricción. Equivale a A con t = 10⁹x₁. | 0,80 / 0,20 |
| C | A con beneficio 10⁻¹²x₁. | 0,80 / 0,20 |
| D | Max x₁, max x₂, x₁ + x₂ ≤ 10. Cara óptima completa para L₁. | Iguales |
| E | D con 10⁻⁹x₁ + 10⁻⁹x₂ ≤ 10⁻⁸. | Iguales |
| F | Max x₁, min x₁, max x₂, x₁ ≤ 10, x₂ = 4. Tercer criterio constante. | Iguales |
| G | A con x₁ entero y x₁ ≤ 5. | 0,65 / 0,35 |
| H | x₁ entero, x₂ continuo, b binario. Max 3x₁ + 2x₂ + b, min x₁ + 2x₂ + 4b, max x₂ − b. Restricciones x₁ + x₂ ≤ 9, x₁ ≤ 4b y x₂ ≥ 1. | 0,50 / 0,30 / 0,20 |
| I | A con x₁ ≤ 2 y x₁ ≥ 3. | Iguales |
| J | Max t y min t para t ≥ 0 sin cota superior y x₁ = x₂ = 0. | Iguales |
| K | Primer objetivo `x1*x2`. Producto que excede el alcance lineal. | Iguales |
| L | Primer objetivo `*x1`. Asterisco sin operando izquierdo. | Iguales |
| M | Primer objetivo `1e309*x1 - 1e309*x1`. Coeficientes fuera del rango representable. | Iguales |
| N | A con beneficio 10⁻⁶x₁. Comprueba cifras pequeñas en pantalla y CSV. | 0,80 / 0,20 |
| O | Caso adicional de la ronda final. Max x₁ + x₂ y max y + z, con x₁ + x₂ + y + z ≤ 12, 2x₁ − x₂ = 0 y y − z = 0. | Iguales |

## 2. Comparación matemática independiente

En A, B, C y N, sea u = x₁/10 o t/10¹⁰ según corresponda. Las desviaciones son (1−u, u). Para los pesos 0,8/0,2, L₁ elige u = 1. La derivada de [0,8(1−u)]² + [0,2u]² se anula en u = 16/17. L∞ alcanza su mínimo en la intersección de los términos, u = 0,8. Las distancias son 0,2, 0,194028500 y 0,16. En D/E y O, cualquier reparto en el segmento de suma 10 o 12 es óptimo para L₁. L₂ y L∞, con pesos iguales, eligen el punto medio. En F el tercer criterio tiene brecha cero y minimax produce logros (50 %, 50 %, 100 %). G se verificó enumerando los seis enteros. Los minimizadores de L₁, L₂ y L∞ son 5, 4 y 3.

En H se enumeran los seis pares factibles (x₁,b). Para cada par, x₂ recorre [1,9−x₁]. El oráculo compara los extremos para L₁, los extremos y el punto estacionario de la función cuadrática para L₂, y los extremos e intersecciones de términos afines para L∞. Los óptimos tienen valores agregados 44/105, √(1752361/19412800) y 27/143. Se cotejan indicadores de factibilidad, objetivos, desviaciones, logro y distancia desde las decisiones calculadas, sin exigir que un empate de L₁ devuelva un punto específico.

Se usó tolerancia de 2×10⁻⁶ en unidades comparables. Cada fila se verifica con residuo dividido por el máximo módulo de sus coeficientes y término independiente. La diferencia de objetivos se compara respecto a su rango, que puede ser del orden de 10⁻¹¹ en C. Se inspeccionaron además 104 muestras de Pareto de H contra los intervalos factibles completos. Se admitió 2×10⁻⁸ de holgura normalizada en «al menos tan bueno» y se exigió mejora estricta superior a 2×10⁻⁶. No se detectó dominancia con ese criterio.

| Propiedad | Hipótesis y resultado |
|---|---|
| Reparametrización de variable | Se transforman objetivos y restricciones junto con la variable continua. A/B dieron distancias distintas antes y coinciden después. La escala de una variable entera requiere conservar su retícula. |
| Escala de objetivo | Con factor positivo y rango no nulo, también se escalan ideal y referencia. A/C/N coinciden tras recuperar la matriz correcta de C. |
| Escala de restricción | Multiplicar una fila por un factor positivo conserva el semiplano. D/E coinciden tanto en el cálculo como en las coordenadas graficadas tras la corrección. |
| Pesos y degeneración | Ambos pesos puros de A dieron distancia cero en las tres métricas. También se comprobaron las 21 posiciones de sensibilidad de L₂ frente a la fórmula analítica. F conserva el criterio constante y no fuerza igual logro en los tres criterios. |

Se usó la formulación de Clase 15, pp. 9 y 19, con pesos dentro de la potencia. La celda ejecutable del Taller 3 usa esa misma convención. El tratamiento auxiliar de rangos de pagos nulos en criterios variables se conservó según la auditoría anterior.

## 3. Fallos reproducidos, correcciones y regresiones

Cada fila incluye el caso, la comprobación que exhibe el fallo y el comportamiento que comprueba la regresión. Las peticiones exactas, los resultados de ambas rondas y los estados están en el [registro](qa/red_team/evidencia/observaciones.json).

| Fallo y severidad | Antes y resultado esperado | Causa y corrección | Regresión |
|---|---|---|---|
| **RT1 Alta · B, resultados.** | L∞ dio t=0, distancia 0,8 y estado óptimo. L₂ dio t=10¹⁰, distancia 0,2 y estado parcial. Los óptimos son t=8×10⁹ y t=16×10¹⁰/17, respectivamente. [Captura](qa/red_team/evidencia/antes-B.png) | El escalado de L∞ solo consideraba cotas declaradas. HiGHS descartaba los coeficientes pequeños y la L₂ tenía gradientes diminutos. Se escalan coordenadas continuas grandes usando también los óptimos individuales. Las coordenadas enteras mantienen su retícula y L₂ comprueba factibilidad en unidades originales. | Caso B en Chrome y prueba analítica API. |
| **RT2 Alta · C, matriz de pagos.** | La matriz fue nula y las tres distancias fueron cero. Debía contener la fila (10⁻¹¹, 10) del primer óptimo y la fila (0, 0) del segundo. | Las tolerancias del LP eliminaban costos diminutos del cálculo de pagos y del desempate. Se normalizan los costos por un factor positivo. Los pagos y los rangos conservan las unidades de los criterios. | Caso C en Chrome y prueba API de objetivo pequeño. |
| **RT3 Alta · E, «Región factible».** | La figura sombreaba un cuadrado que incluía (10,10). El límite de x₁+x₂ es 10. [Antes](qa/red_team/evidencia/antes-E.png) · [Después](qa/red_team/evidencia/despues-E.png) | El recorte aplicaba la tolerancia a la fila sin escalar. El polígono y la comprobación de los puntos discretos usan ahora filas normalizadas. | Chrome extrae los vértices de D/E y el oráculo comprueba las restricciones. |
| **RT4 Media · L/M, aplicar ecuaciones.** | `*x1` se aceptó como `x1` y los coeficientes desbordados de M llegaron como cero. Ambos deben dar error de sintaxis en la línea 1. [Captura M](qa/red_team/evidencia/antes-M.png) | La expresión regular admitía un asterisco sin factor. La acumulación admitía infinitos y un NaN terminaba como coeficiente ausente. Se corrigió la gramática y se valida la finitud al acumular y combinar términos. | K, L y M deben mostrar error local sin enviar esos objetivos al motor. |
| **RT5 Media · N, tabla y CSV.** | La API devolvió un beneficio cercano a 10⁻⁵ para L₁. La tabla lo mostraba como cero y el CSV decía `0.0000`. [CSV antes](qa/red_team/evidencia/antes-N.csv) · [CSV después](qa/red_team/evidencia/despues-N.csv) | El formato de decimales fijos borraba magnitudes pequeñas. Se usa notación científica cuando el redondeo de pantalla produciría cero, y el CSV conserva los valores numéricos de los resultados. | La comprobación de Chrome contrasta la tabla y lee la exportación. |
| **RT6 Media · H → I, botón PNG.** | Tras resolver I como infactible, PNG permitió descargar el gráfico previo, que tenía eje «Produccion». [Pantalla](qa/red_team/evidencia/antes-I.png) · [Archivo descargado](qa/red_team/evidencia/antes-I-descarga.png) | El control verificaba la existencia del gráfico y omitía el estado del cálculo actual. Ahora usa el mismo criterio de disponibilidad que CSV y Excel. | PNG deshabilitado para I y descarga válida de A verificada. |
| **RT7 Baja · A, desactivar autobalance y subir w₁ de 0,73 a 0,91.** | La suma 1,18 se rechazó localmente y la cabecera dijo «Error Solver». | Se usaba la misma etiqueta para cualquier error. Ahora dice «Error» y el detalle de validación indica el dato que debe corregirse. | Chrome comprueba el estado y que Excel quede deshabilitado. |
| **RT8 Media · A, exportar CSV y abrir el mismo archivo.** | La igualdad x₂=0 aparecía como `==` en el CSV. El lector la convertía en una celda vacía y la app rechazaba la restricción. JSON y Excel sí la conservaban. [Captura](qa/red_team/evidencia/antes-importar-igualdad.png) | La inferencia automática de tipos del lector CSV interpretaba el operador como fórmula. El lector conserva el texto literal para que el importador del modelo interprete el sentido. | La reimportación compara restricciones, objetivos, pesos, pagos y distancias en los tres formatos. |
| **RT9 Baja · D/E, leyenda de «Región factible».** | El punto L₂ (5,5) aparecía como «Vértice L₂». Es el punto medio entre (0,10) y (10,0), por lo que no es un vértice. [Captura anterior](qa/red_team/evidencia/antes-E.png) | La leyenda usaba una etiqueta fija. Ahora identifica las tres soluciones sin atribuirles una propiedad geométrica. | La prueba de navegador comprueba la etiqueta «Solución L₂» en D/E. |


[Pruebas API de RT1 y RT2](api/tests/test_red_team_scaling.py) · [Regresiones de navegador](qa/red_team/browser.cjs). El cuaderno Colab se sincronizó con el motor y se verificó localmente con cota implícita 10¹⁰ y coeficiente 10⁻¹² en el mismo modelo.

## 4. Simulación del jurado

Las [bases oficiales](../BASES%20DE%20CONCURSO%20IAD.pdf), pp. 6–7 y 9, se usaron para revisar el flujo de la Opción 4.

- **Formular, corregir y resolver.** Se ingresaron modelos en blanco con ≤, ≥ e igualdad, sentidos mixtos, cotas y hasta tres objetivos. Se vieron los estados óptimo, parcial en la primera ronda, infactible y no acotado. Los casos mínimos de las bases, Celdas y Transporte, siguen cubiertos por la suite. O añade un modelo manual de cuatro variables.
- **Interpretar y explorar.** Se consultó «Ver método», se verificaron los marcadores 3D de las tres métricas contra sus objetivos y se verificó la región factible 2D. La sensibilidad mostró las 21 muestras y la solución del peso efectivo. [Vista 3D](qa/red_team/evidencia/despues-H-3D.png) · [Sensibilidad](qa/red_team/evidencia/despues-sensibilidad.png).
- **Cambiar el modelo.** En A se ingresaron 0,12, 0,94, 0,34 y 0,73. El cálculo y los marcadores terminaron en 0,73. Reducir el límite de 10 a 6 actualizó el ideal a 6. Al cambiar de ejercicio durante otro cálculo, los ejes finales correspondieron a Sostenibilidad 3D. El navegador registró la cancelación de la solicitud anterior. [Eventos](qa/red_team/evidencia/eventos-segunda-ronda.json).
- **Exportar y recuperar.** Los valores de CSV y Excel coincidieron con la solución que generó la descarga. Se comprobó el PNG de 2400×1500 y se abrió nuevamente el modelo desde cada formato de datos. En vista móvil de 390 px, el ancho total del documento fue 390 px.

El recorrido comprueba qué puede completar una persona usando los controles disponibles. La claridad del flujo se revisó mediante observación técnica. La prueba con estudiantes externos y los tiempos de aprendizaje siguen fuera de este ejercicio.

## 5. Repetición y evidencia técnica

La ronda final repitió A–N y añadió O. En B, L₂ quedó en 9 411 764 705,88 y L∞ en 8 000 000 000, ambos óptimos. C conservó el ideal 10⁻¹¹ y las tres métricas coincidieron con A en unidades normalizadas. E mostró el triángulo de D. I fue infactible y J no acotado. K–M se rechazaron. N conservó el valor pequeño y O dio (6,6) con L₂ y L∞. H reprodujo las distancias independientes 0,419047619, 0,300446881 y 0,188811189.

Pasaron **38 pruebas de API**. También se ejecutaron el chequeo de TypeScript, ESLint y la compilación de producción. Para repetir la batería, inicia el frontend y la API según el README. La automatización usa Chrome instalado localmente. Se pueden cambiar el ejecutable y la URL con `RED_CHROME` y `RED_URL`.

```sh
PYTHONPATH=api python3 -m unittest discover -s api/tests

npm install --prefix /tmp/opticompromise-qa --no-save playwright-core@1.65.1
RED_URL=http://127.0.0.1:3001 NODE_PATH=/tmp/opticompromise-qa/node_modules \
  node qa/red_team/browser.cjs /tmp/opticompromise-run
python3 qa/red_team/oracle.py /tmp/opticompromise-run/results.json --verify
```

Para aislar un caso, pasa su identificador después del directorio de salida. El modo `--verify` espera la batería completa y sus descargas.

## 6. Riesgos residuales

- Coeficientes de órdenes muy distintos dentro de una misma función, restricciones casi dependientes y rangos casi nulos aún pueden producir problemas de precisión. Las invariancias quedaron verificadas para las transformaciones ejecutadas.
- Las muestras de Pareto son finitas. La comprobación de dominancia global corresponde a H y usa las tolerancias indicadas. En otras instancias, la búsqueda entera L₂ puede agotar su presupuesto.
- La optimización de objetivos y restricciones no lineales sigue siendo una bonificación fuera de esta ruta del motor. El caso K ejercitó el rechazo.
- Se verificó Chrome local. Quedan fuera otros navegadores, el despliegue público, el servicio alojado de Colab y la evaluación con jurados o estudiantes externos.
