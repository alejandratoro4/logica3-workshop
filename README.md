# Ride-Sharing Dispatch & Surge Pricing

Proyecto de **Lógica y Representación III**, en tres workshops sobre el mismo
escenario: el sistema de despacho de una app de ride-sharing.

| Workshop | Tema | Carpeta |
|---|---|---|
| 1 | Big Data, algoritmos aleatorizados, hashing universal, tablas hash, cotas de concentración | `src/w1/` |
| 2 | Streams: filtro de Bloom, muestreo, Flajolet-Martin, momentos de frecuencia | `src/w2/` |
| 3 | Cadenas de Markov: DTMC, distribución estacionaria, PageRank, caminatas aleatorias, 2-SAT | `src/w3/` |

---

## Entregar una task

Cada task es **un solo archivo de Python**, y lo que debe escribir está en el
contrato de su workshop:

- [`contratos/w1.md`](contratos/w1.md)
- [`contratos/w2.md`](contratos/w2.md)
- [`contratos/w3.md`](contratos/w3.md)

Cada contrato se puede pegar completo en una IA, sin mostrarle el resto del
repo. Trae las reglas, el bloque con el que empieza el script, las columnas
del dataset y, por task, el JSON de ejemplo con las claves que lee el
dashboard.

En corto:

1. El script va en `src/wN/taskK_tema.py`, por ejemplo `src/w2/task2_bloom.py`.
   No hay que registrarlo en ninguna lista: se encuentra por el nombre.
2. Escribe `results/wN/taskK.json` con las claves del ejemplo de su contrato.
3. Se revisa con:

   ```bash
   python dashboard/contrato.py w2 2
   ```

   Ese comando dice `OK` o qué clave falta. Si dice `OK`, el JSON tiene el formato que lee el panel (no revisa que los números estén bien).
4. *(Opcional)* La página de la task, con su explicación, va en
   `web/lib/docs/wN/taskK.ts`. El contrato trae la plantilla.

Una task que todavía no está no rompe nada: su panel sale como **pendiente**,
diciendo qué archivo falta.

---

## Cómo correrlo

Hace falta **Python 3.10+** y **Node 18+**. No hay que instalar ninguna
librería de Python: todo es biblioteca estándar. **Nunca se corre
`pip install`.**

```bash
# 1. generar los datos y correr las tasks que existan
python run_all.py            # Workshop 1
python run_all.py w2         # Workshop 2
python run_all.py w3         # Workshop 3
python run_all.py todo       # los tres

# 2. levantar el dashboard
cd web
npm install
npm run dev                  # http://localhost:3000
```

> En Windows, `python3` suele resolver al stub de la Microsoft Store y falla.
> Usa `python` o `py`. En macOS y Linux, `python3` funciona.

Al final, `run_all.py` imprime el estado de cada panel: OK, pendiente o "no
cumple el contrato", con el motivo.

El paso 1 es opcional para *ver* el dashboard: la app trae una corrida
precomputada y además puede correr el pipeline entero dentro del navegador. El
paso 1 sirve para desarrollar una task, porque CPython es varias veces más
rápido que Pyodide.

### Correr una sola task

```bash
python run_all.py w2               # una vez, para tener data/stream.csv
python src/w2/task2_bloom.py       # la task
python dashboard/contrato.py w2 2  # revisa su JSON contra el contrato
```

---

## Los datos

Cada workshop tiene su `src/wN/dataset.py`, y cada uno parte del anterior sin
modificarlo:

| Script | Escribe | Qué es |
|---|---|---|
| `src/w1/dataset.py` | `data/rides.csv` | ~495.000 solicitudes de viaje, 10 zonas, 14 días |
| `src/w2/dataset.py` | `data/stream.csv` | las mismas filas en orden de llegada, más `stream_seq` y `wait_for_driver_sec` |
| `src/w3/dataset.py` | `data/edges.csv` | el grafo de reubicaciones: para cada conductor, una arista de la zona de un viaje a la de su siguiente viaje. Escribe también `data/edges_despacho.csv`, un escenario alterno con despacho espacial que solo usa el Panel D |

Los tres son **deterministas**: los mismos parámetros dan los mismos bytes, así
que los CSV no se versionan (pesan ~80 MB).

`rides.csv` se genera con un **proceso de Poisson no homogéneo**: cada zona
tiene su propio perfil de intensidad por hora del día, replicado sobre 14 días
con ruido independiente. Eso produce picos realistas y 14 observaciones
independientes por zona y hora, de las que viven las Tasks 4 y 5 del W1.

| Campo | Tipo | Descripción |
|---|---|---|
| `ride_id` | string | identificador único del viaje |
| `timestamp` | ISO 8601 | momento de la solicitud |
| `rider_id` | string | identificador del pasajero |
| `driver_id` | string | identificador del conductor asignado |
| `pickup_zone` | string | código de zona de la ciudad |
| `distance_km` | float | distancia del trayecto |
| `fare` | float | tarifa calculada |

### Cambiar la ciudad sin tocar el código

Los parámetros se inyectan por variables de entorno. Sin ellas, los valores son
los del informe.

| Variable | Default | Qué controla |
|---|---|---|
| `RIDES_SEED` | `42` | Semilla del generador |
| `RIDES_SCALE` | `30` | Escala global de demanda (más viajes) |
| `RIDES_N_DAYS` | `14` | Días simulados |
| `RIDES_ZONES` | *(las 10)* | Subconjunto de zonas, separadas por comas |
| `RIDES_N_DRIVERS` | `1200` | Conductores distintos |
| `RIDES_K_SIGMA` | `2.0` | Umbral de surge, en desviaciones |
| `RIDES_MC_TRIALS` | `50000` | Muestras Monte Carlo de la Task 5 del W1 |
| `RIDES_BENCH_TRIALS` | `8` | Repeticiones del benchmark de la Task 2 del W1 |

```bash
# ciudad pequeña, rápida
RIDES_SCALE=3 RIDES_ZONES=DOWNTOWN,AIRPORT,BELLO python run_all.py
```

En el dashboard, los mismos parámetros están en el panel de la izquierda.

---

## El dashboard

**Hay uno solo: la app de `web/`**, con una pestaña por workshop. Corre *los
mismos scripts de `src/`* dentro del navegador vía
[Pyodide](https://pyodide.org) (CPython compilado a WebAssembly). No hay
reimplementación de los algoritmos: el worker monta el repo en un sistema de
archivos virtual y ejecuta cada script con `runpy`, igual que desde la
terminal.

Cada task tiene su panel, y ese panel lee el JSON de la task tal como lo
escribió, con las claves de su contrato. Los paneles que pide cada enunciado:

- **W1:** Panel A (Task 4), Panel B (Task 2) y Panel C (Task 5).
- **W2:**
  - Panel A: falsos positivos del filtro de Bloom (Task 2).
  - Panel B: distintos estimados contra verdaderos (Task 4).
  - Panel C: medidor de surge en vivo (Task 6), con el resultado de F_k de la Task 5.
- **W3:** Panel D, PageRank contra volumen sobre el medidor de surge (Tasks 3 y 6).

Además:

- **Panel de parámetros:** cambiar cualquiera regenera los datos y vuelve a
  correr las tasks.
- **Visor de código** con los archivos que realmente se ejecutan y el contrato.
- **Vista de dataset** con las primeras filas del CSV recién generado.
- **Una página por task**, que se navega con `←` `→`; la tecla `P` la proyecta.
- **Corrida canónica** precomputada por workshop, que carga los números a
  escala completa al instante.

Para construir el sitio estático: `npm run build` (queda en `web/out/`).

---

## Estructura

```
├── run_all.py                  # datasets + tasks de un workshop, y el estado de cada panel
├── src/
│   ├── w1/  dataset.py, task1_bigdata.py, task2_randomized.py, ...
│   ├── w2/  dataset.py, task6_surge.py, ...
│   └── w3/  dataset.py, task6_surge.py, ...
├── contratos/  w1.md  w2.md  w3.md       # lo que el dashboard lee de cada task
├── dashboard/contrato.py       # valida results/ contra contratos/ (lo usan run_all, el worker y el exportador)
├── data/                       # rides.csv, stream.csv, edges.csv (ignorados por git)
├── results/  w1/  w2/  w3/     # taskK.json de cada task
└── web/                        # el dashboard (Next.js + Pyodide)
    ├── components/panels/wN/TaskK.tsx    # el panel de cada task
    ├── lib/docs/wN/taskK.ts              # la página de cada task
    ├── public/pyodide-worker.js          # corre el pipeline de Python
    └── scripts/sync-python.mjs           # copia src/ y contratos/, y genera tipos y registro
```

No hay listas de tasks que mantener. `sync-python.mjs` encuentra los scripts,
los paneles y las páginas por su nombre. Además, genera los tipos de
TypeScript a partir de los ejemplos de los contratos, así que el panel, la
página y el validador leen el mismo contrato.

---

## Notas de implementación

- **Reproducibilidad.** Todos los scripts usan semillas fijas y el pipeline es
  determinista. `ride_id` se sortea con un RNG *separado*, y la Task 4 del W1
  usa `blake2b` en vez del `hash()` nativo, que Python aleatoriza por proceso.
- **Peor caso de QuickSort.** El benchmark adversarial se limita a n ≤ 8.000:
  el algoritmo determinista es O(n²) en ese escenario.
- **Archivos generados.** `web/public/py/` y `web/lib/generated/` los produce
  `sync-python.mjs` en cada build; no se editan a mano. `web/.next/` y
  `web/out/` son salida de build.

---

## Actualizar las corridas precomputadas

Las corridas canónicas van precomputadas y commiteadas en
`web/public/data/canonical-wN.json`, para poder mostrarlas sin recomputar.
Si cambian los resultados de un workshop, hay que regenerar la suya y
commitearla:

```bash
python run_all.py w2
python web/scripts/export_canonical.py w2
```
