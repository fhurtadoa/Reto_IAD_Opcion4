# Pruebas en navegador con ejercicios publicados

Se ensayaron dos modelos de la biblioteca pública de GAMS en OptiCompromise local. Los pesos iguales son una decisión de prueba. GAMS publica referencias de Pareto, y las distancias de compromiso se calcularon aparte con la convención de IAD.

| Prueba | Ingreso en Chrome | Referencia y resultado |
|---|---|---|
| Planificación eléctrica EPSCM | Formulario en blanco, editor algebraico, nueve flujos continuos y tres objetivos | Los tres vectores de pagos coinciden con los puntos s1, s18 y s12 de la fuente, respectivamente. Distancias L₁, L₂ y L∞ de la app 0,258547009, 0,200025890 y 0,139784946. Diferencia máxima frente a Clarabel inferior a 9×10⁻¹¹. |
| Punto s13 de EPSCM | Se volvió a abrir el editor y se agregaron CO₂ ≤ 53 820 y producción endógena ≥ 39 000 | La fuente publica el costo mínimo 3 315 000 para esos niveles. CBC confirmó que el vector factible de objetivos es único, (3 315 000, 53 820, 39 000). Tras la corrección, las tres métricas dan cero y aparecen como óptimas. |
| Mochila EPSCMMIP | Selector **Importar**, JSON con los 50 binarios y las dos capacidades originales | CBC reproduce los pagos (2103, 1529) y (1547, 2020). L₁ y L₂ eligen (1893, 1902), con distancias 0,309011854 y 0,223837096. L∞ elige (1931, 1857) con 0,165987780. Los tres coinciden con el oráculo. La referencia L₂ se certificó con 15 subproblemas MILP por intervalos de beneficio. |

Fuentes de datos y referencias. [EPSCM, planificación eléctrica y puntos de referencia](https://www.gams.com/latest/gamslib_ml/libhtml/gamslib_epscm.html) · [EPSCMMIP, mochila biobjetivo de 50 variables](https://www.gams.com/latest/gamslib_ml/libhtml/gamslib_epscmmip.html)

## Fallo reproducido y corrección

En s13 la matriz de pagos coincide matemáticamente en las tres filas. El redondeo dejó rangos aparentes de 1,46×10⁻¹¹ y 7,28×10⁻¹². Dividir por ellos produjo distancias falsas de 0,3333 y un error de modelo en L∞. El motor ahora distingue redondeo de variación real usando una tolerancia proporcional a la magnitud de cada producto escalar. Si los pagos coinciden dentro de esa tolerancia, calcula el peor extremo factible para distinguir un objetivo constante de uno variable. Además, las gráficas 2D y 3D usan un margen de visualización en ejes constantes para evitar que el autozoom dibuje como separación un error de redondeo. Se resincronizó Colab y se agregó una regresión con el caso s13. Los casos previos de objetivos genuinamente pequeños siguen cubiertos por la suite.

[Antes, captura](evidencia/energia_s13_antes.png) · [Antes, CSV](evidencia/energia_s13_antes.csv) · [Después, captura](evidencia/energia_s13.png) · [Después, CSV](evidencia/energia_s13.csv)

## Respuestas guardadas

- Planificación eléctrica. [Ecuaciones](energia.txt) · [CSV exportado](evidencia/energia.csv) · [Captura](evidencia/energia.png)
- Mochila. [Modelo listo para importar](mochila.json) · [CSV exportado](evidencia/mochila.csv) · [Captura](evidencia/mochila.png)
- [Comparación matemática de los tres ensayos](evidencia/contraste.json) · [Automatización de interacciones de usuario](navegador.cjs) · [Oráculo](contraste.py)

La prueba de navegador usa la interfaz para formular, resolver y descargar. La captura de red documenta el cálculo que inició la interfaz. El oráculo verifica factibilidad y recalcula objetivos y distancias sin importar el motor de OptiCompromise. Los CSV se generaron desde el botón de la página. La suite de la aplicación pasó 45 pruebas.

Una repetición de la mochila devolvió una respuesta de error del servidor local sin JSON. La ejecución completa posterior resolvió los tres casos. La causa de ese error intermitente queda sin confirmar.
