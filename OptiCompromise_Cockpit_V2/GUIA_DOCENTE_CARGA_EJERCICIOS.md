# Guía Docente — Carga, Personalización y Revisión de Ejercicios en OptiCompromise Cockpit V2

**Curso:** Introducción al Análisis de Decisiones (IAD) · Facultad de Minas — Universidad Nacional de Colombia (Sede Medellín)  
**Versión de plataforma:** OptiCompromise Cockpit V2 (Next.js 15 + FastAPI + SciPy HiGHS/SLSQP + openpyxl + SheetJS CE)

Esta guía práctica está pensada para **docentes y monitores** que desean preparar talleres, exámenes, variantes por estudiante o casos de clase y evaluarlos en **OptiCompromise Cockpit V2** sin necesidad de programar.

---

## Alcance del motor (qué ejercicios admite y cuáles no)

- **Admitidos:** Modelos deterministas lineales y enteros mixtos (MIP) con **2 o más funciones objetivo lineales** (`maximize` o `minimize`), restricciones lineales (`<=`, `>=`, `==`) y variables continuas (`continuous`, ℝ), enteras (`integer`, ℤ) o binarias (`binary`, {0, 1}).
- **Visualizaciones disponibles según dimensión:**
  - Exactamente **2 objetivos**: habilita **Sensibilidad de pesos** (barrido de 21 puntos entre 0 y 1 y exportación PNG).
  - Exactamente **2 variables**: habilita **Región Factible** en el espacio de decisiones (incluyendo malla discreta si hay variables enteras/binarias) y proyección de **Zona Factible** en 2D.
  - **3 o más objetivos**: habilita **Espacio 3D** rotatorio y **Radar (% Logro)**.
- **No admitidos en el motor:** Expresiones no lineales con productos de variables (`x1 * x2`), potencias (`x1^2`), raíces, división por variables, simulación estocástica, árboles de decisión, redes neuronales o matrices de comparaciones pareadas AHP / matrices de alternativas finitas discretas.

---

## Ruta 1 (Más rápida para clase): Plantillas Excel (`.xlsx`) y `.csv`

Desde la barra superior de la aplicación (o directamente en `web/public/`) dispones de las plantillas oficiales:

- **Plantilla en blanco:** [`web/public/plantilla-ejercicio-iad.xlsx`](web/public/plantilla-ejercicio-iad.xlsx) (y [`plantilla-ejercicio-iad.csv`](web/public/plantilla-ejercicio-iad.csv))
- **Ejemplo diligenciado completo (Taller 1/3 Producción de Papel):** [`web/public/plantilla-produccion-papel.xlsx`](web/public/plantilla-produccion-papel.xlsx) (y [`plantilla-produccion-papel.csv`](web/public/plantilla-produccion-papel.csv))

### Contenido del libro Excel `.xlsx`

1. **`Modelo`**: Hoja estructurada que lee OptiCompromise al pulsar **Importar**. *(El importador busca la hoja llamada `Modelo` sin distinguir mayúsculas; si no existe, lee la primera hoja).*
2. **`Guia_Docente`**: Hoja de apoyo para profesores y monitores con resumen de columnas y valores permitidos (ignorada durante la importación).

### Estructura exacta de columnas

Las primeras **5 columnas** son fijas, seguidas de **una columna por cada variable de decisión**:

`Seccion` | `Nombre` | `Tipo_o_Sentido` | `Min_o_RHS` | `Max_o_Peso` | `<var_1>` | `<var_2>` | `...`

### Estructura exacta de filas y valores válidos

| Valor en `Seccion` | `Nombre` | `Tipo_o_Sentido` | `Min_o_RHS` | `Max_o_Peso` | Columnas de variables (`<var_i>`) |
|---|---|---|---|---|---|
| **`Meta`** *(1 fila)* | Título del ejercicio | Enunciado, contexto y unidades | Semilla opcional para Pareto con ≥4 objetivos (ej. `42`) | Fuente o referencia académica | Vacías |
| **`Variable`** *(1 fila por variable)* | Identificador único (ej. `x1`, `x1_1 (M1 Prensa)`) | `continuous`, `integer` o `binary` *(acepta `continua`, `entera`, `binaria`)* | Cota inferior. Vacío = `0`. Usa `-inf` (o `-∞`) si no tiene cota inferior | Cota superior. Vacío = sin límite (`+inf` / `+∞`), o `1` para binarias. Para fijar una binaria usa `[1, 1]` o `[0, 0]` | Vacías |
| **`Objetivo`** *(≥ 2 filas)* | Nombre del criterio y unidad | `maximize` o `minimize` *(acepta `max`, `min`, `maximizar`, `minimizar`)* | Vacío | Peso entre `0` y `1`. **O todos completos sumando `1.0` (±0.001) o todos vacíos** (asigna pesos iguales $1/q$) | Coeficiente numérico real de cada variable (vacío = `0`) |
| **`Restriccion`** *(0 o más filas)* | Nombre de la restricción | `<=` (`≤`), `>=` (`≥`), o `==` (`=`) | Valor numérico del lado derecho (RHS) | Vacío | Coeficiente numérico real de cada variable (vacío = `0`) |

> **Tip para igualdad en Excel:** Si escribes `=` solo en una celda, Excel intentará interpretarlo como fórmula. Escribe `==` (recomendado) o antepón un apóstrofe `'=` para conservarlo como texto.

### Cómo personalizar variantes por estudiante (Ejemplo: Taller 3 Producción de Papel con dígito `n`)

El archivo [`plantilla-produccion-papel.xlsx`](web/public/plantilla-produccion-papel.xlsx) contiene los datos base del Taller 1 (3 máquinas × 4 tipos de papel = 12 variables continuas, 2 objetivos y 7 restricciones). Para generar la variante individual de un estudiante con dígito `n` (por ejemplo `n = 6`):

1. Abre una copia de `plantilla-produccion-papel.xlsx` en la hoja `Modelo`.
2. En la fila `Restriccion` llamada `Demanda mínima · Prensa`, cambia `Min_o_RHS` de `77` a `77 + n` (para `n = 6`, escribe **`83`**).
3. En las dos filas `Objetivo`, actualiza `Max_o_Peso`:
   - `Costo (millones de pesos)`: `0.5 + 0.01*n` → **`0.56`**
   - `Calidad (indicador × ton)`: `0.5 - 0.01*n` → **`0.44`**
4. Opcionalmente actualiza el título en `Meta` (ej. `Producción de papel · Variante n=6`). *Por privacidad, registra únicamente el dígito `n` y no el número completo de documento.*
5. Guarda el `.xlsx` (o expórtalo como CSV UTF-8) e impórtalo en OptiCompromise con **Importar**.

### Qué NO hacer en hojas de cálculo (errores frecuentes)

1. **No uses nombres de columnas reservados como nombres de variables sin prefijo:** Evita llamar a una variable `Seccion`, `Sección`, `Nombre`, `Tipo_o_Sentido`, `Min_o_RHS`, `Max_o_Peso`, `Tipo`, `Elemento`, `Name`, `Variable`, `Description`, `Descripcion`, `Pareto_seed`, `Referencia`, `Fuente`, `Var_type`, `Tipo_var`, `Min`, `Max`, `Lower_bound`, `Upper_bound`, `Lb`, `Ub`, `Sense`, `Sentido`, `Peso`, `Weight`, `Operador`, `Rhs` o `Ld`. Si alguna variable debe llamarse así, su columna de coeficientes debe llevar el prefijo **`Coef: `** (ej. `Coef: Max`), tal como hace automáticamente OptiCompromise al exportar.
2. **No escribas expresiones no lineales o texto algebraico en celdas de coeficientes:** No escribas `x1*x2`, `50*x1` ni `1/53` como texto plano en CSV; escribe siempre el coeficiente numérico calculado (ej. `0.0188679245`).
3. **No mezcles pesos vacíos y pesos numéricos:** O diligencias `Max_o_Peso` en todos los objetivos (sumando `1.0`), o dejas la columna vacía en todos.
4. **No dejes filas `Restriccion` incompletas:** Si usas la plantilla en blanco y no necesitas restricciones adicionales, elimina la fila `Restriccion` vacía antes de importar.
5. **No dupliques nombres de variables** ni pongas `Min_o_RHS > Max_o_Peso`.

---

## Ruta 2: Carga rápida por texto en `Modo Algebraico`

Ideal para dictar o copiar rápidamente un enunciado de tablero durante la clase:

1. En la barra superior selecciona **+ Nuevo Modelo en Blanco** y asegúrate de estar en la pestaña **Formular** → **Modo Algebraico**.
2. Pega o escribe el modelo en texto lineal. Ejemplo listo para copiar (Caso Celdas):

```text
# Comentarios opcionales con # o //
Max Z1 (Utilidad Total USD) = 1000*x1 + 3000*x2
Min Z2 (Emision Contaminantes kg) = x1 + 2*x2
s.a.
x1 + x2 <= 400
1000*x1 + 3000*x2 >= 300000
```

3. **Reglas de sintaxis del parser algebraico:**
   - Objetivos: `Max Z1 (Nombre) = ...` o `Min Z2 = ...` (sin términos constantes independientes en objetivos).
   - Separador de restricciones: `s.a.`, `sujeto a:` o `restricciones:`.
   - Restricciones: soporta `<=`, `>=`, `=`, `==`, símbolos Unicode (`≤`, `≥`, `−`), coma decimal (`2,5`) y variables o constantes en ambos lados (ej. `x1 <= 2*x2 + 10`).
4. **Paso obligatorio:** Pulsa **Aplicar Ecuaciones y Resolver**.
   - Mientras existan ediciones en texto sin aplicar, la barra superior muestra la píldora **Borrador sin aplicar** y deshabilita temporalmente **JSON**, **Excel**, **CSV** y las pestañas **Ver método** / **Explorar resultados** para garantizar coherencia entre el texto y el cálculo.
5. Si tu modelo requiere variables enteras (`integer`), binarias (`binary`) o cotas distintas de `[0, +inf)`, cambia a **Modo Tabla** y ajusta **Tipo**, **Mín** y **Máx** en las variables detectadas (además del título y descripción).
6. Pulsa **JSON** en la barra superior para descargar la definición limpia del ejercicio.

---

## Ruta 3: Publicar en el catálogo compartido o reabrir libros ya resueltos

### A. Incorporar un ejercicio fijo al catálogo compartido (`examples/*.json`)

1. Prepara el modelo (por Ruta 1 o Ruta 2), resuélvelo para verificar que no sea infactible ni no acotado y descárgalo con **JSON**.
2. Nombra el archivo en minúsculas, sin espacios ni tildes (solo `a-z`, `0-9`, `-`, `_`; por ejemplo `taller3_cadena_suministro.json`) y ubícalo en la carpeta [`examples/`](examples/).
3. El endpoint `/api/examples` descubre automáticamente cualquier `.json` válido en `examples/` (excepto `blank` y los 5 alias legados `celdas`, `transporte`, `triobjetivo`, `mip`, `flota`), lee el título y dimensiones y lo agrega al selector **Ejemplos** en la barra superior. Si algún archivo nuevo tiene un error de formato, se reporta el aviso sin ocultar el resto del catálogo.
4. *(Opcional — respaldo sin backend y Google Colab)*:
   - Si deseas incluirlo también como respaldo estático en frontend, revisa `PRESET_OPTIONS` en [`web/components/cockpit/types.ts`](web/components/cockpit/types.ts).
   - Para que aparezca en el cuaderno autónomo [`colab/OptiCompromise_Colab.ipynb`](colab/OptiCompromise_Colab.ipynb), añádelo al diccionario `MODELOS_EJEMPLO` dentro del cuaderno (y si modificas `api/core/`, sincroniza con `python3 colab/sync_engine.py`).

### B. Reabrir libros Excel o CSV de resultados entregados por estudiantes

- Tanto el archivo **`.xlsx`** generado por **Excel** (mediante su hoja `Modelo`) como el **`.csv`** generado por **CSV** (mediante su bloque final `DEFINICION DEL MODELO (RE-IMPORTABLE)`) contienen la definición íntegra del modelo.
- Para calificar o revisar en clase la entrega de un estudiante, pulsa **Importar** y selecciona su `.xlsx` o `.csv`: la herramienta cargará sus variables, cotas, objetivos, restricciones y pesos listos para auditar en **Ver método** y **Explorar resultados**.

---

## Ruta 4: Uso e interpretación de la exportación de resultados (Excel, CSV y JSON)

| Formato | Botón | Propósito principal |
|---|---|---|
| **JSON** (`.json`) | **JSON** | Guardar la definición del modelo y los pesos actuales `weights` para compartir enunciados o subir al catálogo `examples/`. |
| **CSV** (`.csv`) | **CSV** | Reporte plano UTF-8 con Matriz de Pagos, Soluciones Compromiso y bloque `DEFINICION DEL MODELO (RE-IMPORTABLE)`. |
| **Excel estilizado** (`.xlsx`) | **Excel** | Reporte académico multi-hoja listo para revisión docente, anexos de informes y re-importación. |

### Cómo leer las 5 hojas del libro Excel de resultados (`.xlsx`)

1. **`Resumen_Ejecutivo`**: Presenta metadatos del ejercicio (título, descripción, fuente académica, número de variables/objetivos/restricciones), el vector de pesos aplicado, el estado de verificación del solver (`optimal` o `partial`), el Punto Ideal ($Z^*$), el Nadir aproximado ($Z_{\text{peor}}$) y la síntesis de métricas.
2. **`Matriz_de_Pagos`**: Matriz cuadrada $q \times q$ donde cada fila muestra los valores de todos los criterios al optimizar un objetivo individual en solitario. Incluye filas de referencia para Ideal ($Z^*$) y Nadir aproximado, además del rango y fuente de normalización de cada objetivo.
3. **`Soluciones_Compromiso`**: Compara lado a lado las tres métricas (**$L_1$**, **$L_2$** y **$L_\infty$**): estado de optimalidad, distancia agregada $D_p$ ($\lambda^*$ en $L_\infty$), vector completo de variables de decisión $x^*$, valores reales de cada objetivo $Z_i(x^*)$ y porcentaje de logro $Z'_i(x^*) = 100 \cdot (1 - D_i(x^*))\%$.
4. **`Frontera_Pareto`** *(incluida cuando existen puntos Pareto muestreados)*: Lista cada punto no dominado encontrado en el barrido de pesos sobre $L_1$, $L_2$ y $L_\infty$, con su métrica, estado del solver, valores de objetivos y variables. Útil para verificar compensaciones (trade-offs) o construir gráficas externas.
5. **`Modelo`**: Tabla estandarizada (`Meta`, `Variable`, `Objetivo`, `Restriccion`) 100% re-importable en OptiCompromise mediante **Importar**.
