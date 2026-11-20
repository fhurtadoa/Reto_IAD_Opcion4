# Incorporar ejercicios de IAD en OptiCompromise

Puedes usar el formulario de OptiCompromise o diligenciar una hoja de cálculo. En ambos casos, guarda una copia con el botón **JSON**. Ese archivo es el que utiliza el catálogo.

- [Plantilla vacía CSV](web/public/plantilla-ejercicio-iad.csv)
- [Plantilla diligenciada CSV: producción de papel](web/public/plantilla-produccion-papel.csv)
- [Modelo de producción de papel listo para el catálogo](examples/06_produccion_papel.json)

## 1. Preparar el ejercicio

Desde la aplicación, usa **Descargar plantilla CSV** o **Ver ejemplo diligenciado**. Abre el CSV en una hoja de cálculo y conserva los encabezados. También puedes usar el editor **Formular** y registrar el contexto y la fuente académica directamente.

| Fila en Seccion | Nombre | Tipo_o_Sentido | Min_o_RHS | Max_o_Peso | Columnas de variables |
|---|---|---|---|---|---|
| Meta | Título del ejercicio | Enunciado, contexto, unidades e instrucciones | Vacío. Opcionalmente, semilla para Pareto con cuatro o más objetivos. | Fuente académica | Vacías |
| Variable | Identificador, por ejemplo `x1` | `continuous`, `integer` o `binary` | Cota inferior. Vacío equivale a 0. | Cota superior. Vacío equivale a sin cota, o 1 para binaria. | Vacías |
| Objetivo | Nombre y unidad | `minimize` o `maximize` | Vacío | Peso de 0 a 1. Deja todos vacíos para usar pesos iguales. | Coeficiente de cada variable. Una celda vacía equivale a 0. |
| Restriccion | Por ejemplo, capacidad de la máquina 1 | `<=`, `>=` o `=` | Valor numérico del lado derecho | Vacío | Coeficiente de cada variable. Una celda vacía equivale a 0. |

Crea una fila **Variable** y una columna con exactamente el mismo nombre por cada variable. Puedes cambiar `x1` y `x2`, agregar otras columnas o eliminar las que sobren. Usa `-inf` o `+inf` para cotas sin límite. Completa al menos dos filas **Objetivo** y agrega las restricciones necesarias. Elimina la fila de restricción de la plantilla vacía si no aplica.

Escribe los coeficientes numéricos que correspondan a las unidades del modelo. Por ejemplo, si una máquina produce 53 toneladas por hora, su coeficiente en la restricción de horas es 1/53, escrito como el número calculado. Anota los parámetros originales y la fuente en el contexto. Para un ejercicio con un parámetro por estudiante, crea una copia y sustituye los valores numéricos del caso correspondiente. El archivo se interpreta como datos.

## 2. Abrir y revisar una copia

1. Guarda la hoja como CSV UTF-8 o XLSX, con el modelo en la primera hoja o en una hoja llamada **Modelo**. Usa **Importar** para abrirla en OptiCompromise.
2. Si aparece un error, corrige el campo indicado en la hoja e importa de nuevo. En **Formular**, revisa sentidos, cotas, coeficientes y la vista matemática.
3. Pulsa **Resolver**. En **Ver método**, comprueba que la matriz de pagos tenga un óptimo individual por criterio. En **Explorar resultados**, revisa los valores de las variables frente a demandas y capacidades. Un estado infactible indica que no se pueden cumplir todas las condiciones a la vez. Un estado no acotado indica que un objetivo puede mejorar indefinidamente.
4. Pulsa **JSON** para guardar el ejercicio. Puedes reabrir ese archivo desde **Importar**. La importación afecta a la sesión y conserva el catálogo compartido.

## 3. Incorporarlo al catálogo compartido

1. Guarda el JSON con un nombre único en minúsculas, sin tildes o espacios. Por ejemplo, `produccion-papel-grupo-a.json`.
2. En el repositorio de GitHub, abre la carpeta [examples](examples/) de Cockpit V2. Usa **Add file → Upload files** para proponer el archivo en una rama de revisión. Si no tienes permiso de escritura, comparte el JSON con quien administra el repositorio.
3. En una instancia local de revisión que use esa rama, recarga la página y busca el título en **Ejemplos**. Abre el ejercicio y resuélvelo. El catálogo lee el nombre y las dimensiones del JSON automáticamente. Los errores de un archivo se indican por separado y los demás ejercicios válidos permanecen disponibles.
4. La versión compartida mostrará el ejercicio cuando el equipo publique una versión que incluya el archivo.

## 4. Qué ejercicios admite

Admite modelos deterministas con dos o más objetivos lineales y restricciones lineales. Las variables pueden ser continuas, enteras o binarias. **Sensibilidad de pesos** está disponible con exactamente dos objetivos. La región de decisiones se dibuja para dos variables. Para modelos enteros, L₂ puede indicar un resultado parcial si no confirma optimalidad.

Los ejercicios con productos de variables, potencias, simulación, árboles de decisión, redes neuronales o comparaciones pareadas de AHP requieren otros métodos. Una matriz de alternativas discretas tampoco se importa como modelo de compromiso continuo.

## Caso diligenciado. Producción de papel

El Taller 1 pide decidir cuántas toneladas producir para cada combinación de tres máquinas y cuatro papeles. El CSV y el JSON conservan los costos, indicadores de calidad, tasas, capacidades de **5, 3 y 3 h**, y demandas de **77, 81, 99 y 105 t** para Prensa, Folio, Imprenta y Reciclado. La suma de toneladas divididas por sus tasas expresa las horas de cada máquina. Los pesos iniciales son iguales como punto de partida editable. El caso incluye el enunciado y los datos, sin registrar una solución esperada.

Para la variante del Taller 3, cambia Prensa a `77 + n` y ajusta los pesos a `0,5 + 0,01n` y `0,5 − 0,01n`, con el valor de `n` indicado por el taller. Usa únicamente el dígito, sin guardar números de documento. Las vistas comparan las tres métricas de compromiso. La comparación adicional con factores ponderantes se realiza siguiendo el taller.

### Datos originales del Taller 1

El enunciado pide determinar las cantidades de cada tipo de papel que se deben producir en cada máquina para minimizar costos y maximizar calidad, cumpliendo las demandas mínimas y las horas disponibles.

| Máquina | Papel | Tasa (ton/h) | Costo (millones de pesos/ton) | Indicador de calidad |
|---|---|---:|---:|---:|
| 1 | Prensa | 53 | 76 | 45 |
| 1 | Folio | 51 | 82 | 76 |
| 1 | Imprenta | 52 | 96 | 39 |
| 1 | Reciclado | 42 | 72 | 45 |
| 2 | Prensa | 52 | 75 | 42 |
| 2 | Folio | 49 | 70 | 64 |
| 2 | Imprenta | 45 | 95 | 41 |
| 2 | Reciclado | 44 | 71 | 42 |
| 3 | Prensa | 49 | 73 | 38 |
| 3 | Folio | 44 | 78 | 70 |
| 3 | Imprenta | 47 | 92 | 36 |
| 3 | Reciclado | 40 | 70 | 38 |

Fuente: Taller de formulación de problemas de optimización multiobjetivo, Introducción al Análisis de Decisiones, Facultad de Minas, Universidad Nacional de Colombia. Consulta el [inventario de materiales](docs/inventario-ejercicios-iad.md) para ver qué otros ejercicios son compatibles.
