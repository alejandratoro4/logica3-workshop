# Ride-Sharing Dispatch & Surge Pricing

Proyecto de **Lógica y Representación III** — Big Data, algoritmos aleatorizados,
hashing universal, tablas hash y cotas de concentración.

Simula el sistema de despacho de una app de ride-sharing: enruta solicitudes de
viaje a procesos de despacho mediante hashing, balancea la carga entre colas, y
detecta picos de demanda por zona para activar tarifa dinámica (surge pricing).

---

## Estado

El repositorio está pensado para trabajarse entre varias personas: **cada quien
agrega su task** y el dashboard la recoge sola. Hoy están implementadas:

| Task | Tema | Script | Estado |
|---|---|---|---|
| 1 | Contexto de Big Data | `src/task1_bigdata.py` | pendiente |
| 2 | Algoritmo aleatorizado | `src/task2_randomized.py` | **listo** |
| 3 | Hashing universal | `src/task3_hashing.py` | pendiente |
| 4 | Tabla hash | `src/task4_hashtable.py` | **listo** |
| 5 | Análisis de probabilidad | `src/task5_probability.py` | pendiente |

Nada se rompe por las que faltan. El generador, el pipeline y el dashboard
saltan lo que no existe y marcan ese panel como **pendiente**, diciendo qué
script falta. Cuando el archivo aparece, el panel se llena solo.

---

## Cómo correrlo

Hace falta **Python 3.10+** y **Node 18+**. No hay que instalar ninguna
librería de Python: el pipeline usa solo biblioteca estándar (`csv`, `json`,
`random`, `math`, `time`, `hashlib`, `collections`, `os`). **Nunca se corre
`pip install`.**

```bash
# 1. generar el dataset y correr las tasks que existan
python run_all.py

# 2. levantar el dashboard
cd web
npm install
npm run dev          # http://localhost:3000
```

> En Windows, `python3` suele resolver al stub de la Microsoft Store y falla.
> Usa `python` o `py`. En macOS y Linux, `python3` funciona.

El paso 1 es opcional para *ver* el dashboard: la app trae una corrida
precomputada y además puede correr el pipeline entero dentro del navegador. El
paso 1 sirve para desarrollar una task, porque CPython es varias veces más
rápido que Pyodide.

### Correr una sola task

Cada script es independiente, siempre que `data/rides.csv` ya exista:

```bash
python src/data_generator.py       # genera data/rides.csv (~495.000 registros)
python src/task2_randomized.py     # QuickSort aleatorizado + reservoir sampling
python src/task4_hashtable.py      # chaining vs. power of two choices
```

Cada task imprime sus resultados por consola y guarda un JSON en `results/`.

---

## El dashboard

**Hay uno solo: la app de `web/`.** Corre *los mismos scripts de `src/`* dentro
del navegador vía [Pyodide](https://pyodide.org) (CPython compilado a
WebAssembly). No hay reimplementación de los algoritmos ni puerto a JavaScript:
el worker monta `/proj/src` en un sistema de archivos virtual y ejecuta cada
script con `runpy` bajo `run_name="__main__"`, igual que desde la terminal.

Trae los tres paneles del enunciado:

- **Panel A** — distribución de carga de buckets, chaining vs. power of two
  choices (Task 4)
- **Panel B** — tiempo del algoritmo aleatorizado vs. el determinista según el
  tamaño de entrada (Task 2)
- **Panel C** — medidor de surge en vivo por zona, contra las cotas de
  Chebyshev y Chernoff (Task 5)

Y además:

- **Panel de parámetros**: zonas, escala, días, conductores, umbral de surge y
  semilla. Cambiar cualquiera regenera el dataset y vuelve a correr las tasks.
- **Visor de código** con los archivos fuente que realmente se ejecutan.
- **Vista de dataset** con las primeras filas del CSV recién generado.
- **Una página por task implementada**, con el enunciado, cómo se midió, las
  cifras de la corrida y el panel en vivo. Se navegan con `←` `→` y la tecla
  `P` las proyecta a pantalla completa: sirven de diapositivas.
- **Corrida canónica** precomputada, que carga los números a escala completa al
  instante en vez de esperar los ~2 min que tarda el pipeline dentro de Pyodide.

Para construir el sitio estático: `npm run build` (queda en `web/out/`).

---

## Agregar una task

Tres pasos, y el dashboard la recoge sin tocar nada más:

1. **Crear `src/taskN_*.py`** con el nombre exacto que espera `run_all.py`.
   Copiar el prólogo `BASE` de cualquier task existente — es lo que hace que el
   script corra desde cualquier directorio y también dentro de Pyodide. Toda la
   lógica va dentro de `if __name__ == "__main__"`, solo funciones puras a nivel
   de módulo.

2. **Escribir `results/taskN_results.json`.** Qué claves debe traer lo define
   `dashboard/build_dashboard.py`, que es quien arma el panel a partir de ese
   JSON: mirar la función `build_*` correspondiente.

3. **Agregar su `TaskDoc` en `web/lib/tasks.ts`** para que tenga página propia.
   Opcional: sin esto la task corre y su panel se llena igual, solo que no
   tiene página de explicación.

Después, `npm run sync-python` (o simplemente `npm run dev`, que lo corre
antes) recoge el archivo nuevo.

### Cambiar la ciudad sin tocar el código

Los parámetros se inyectan por variables de entorno. Sin ellas, los valores son
los del informe.

| Variable | Default | Qué controla |
|---|---|---|
| `RIDES_SEED` | `42` | Semilla del generador |
| `RIDES_SCALE` | `30` | Escala global de demanda (más viajes) |
| `RIDES_N_DAYS` | `14` | Días simulados |
| `RIDES_ZONES` | *(las 10)* | Subconjunto de zonas, separadas por comas |
| `RIDES_N_DRIVERS` | `1200` | Conductores distintos (afecta Task 3) |
| `RIDES_K_SIGMA` | `2.0` | Umbral de surge, en desviaciones |
| `RIDES_MC_TRIALS` | `50000` | Muestras Monte Carlo de la Task 5 |
| `RIDES_BENCH_TRIALS` | `8` | Repeticiones del benchmark de la Task 2 |

```bash
# ciudad pequeña, rápida
RIDES_SCALE=3 RIDES_ZONES=DOWNTOWN,AIRPORT,BELLO python run_all.py
```

En el dashboard, los mismos parámetros están en el panel de la izquierda: mover
un deslizador equivale a exportar esa variable antes de correr el script.

---

## El dataset

`data/rides.csv` — **495.505 solicitudes de viaje**, 10 zonas, 14 días, con los
parámetros por defecto (el mínimo requerido eran 10.000 registros). No está
versionado: pesa ~36 MB y se regenera con un comando.

| Campo | Tipo | Descripción |
|---|---|---|
| `ride_id` | string | identificador único del viaje |
| `timestamp` | ISO 8601 | momento de la solicitud |
| `rider_id` | string | identificador del pasajero |
| `driver_id` | string | identificador del conductor asignado |
| `pickup_zone` | string | código de zona de la ciudad |
| `distance_km` | float | distancia del trayecto |
| `fare` | float | tarifa calculada |

Los datos se generan con un **proceso de Poisson no homogéneo**: cada zona
tiene su propio perfil de intensidad por hora del día, replicado sobre 14 días
con ruido independiente. Eso reproduce picos realistas (horas de oficina,
meseta del aeropuerto) y produce 14 observaciones independientes por zona y
hora.

Esa correlación entre zona y hora no es cosmética: sin ella no existiría hora
pico, la Task 5 no tendría picos que detectar y la Task 4 no tendría ráfagas de
concurrencia.

**El generador es determinista.** Los mismos parámetros y la misma semilla
producen el CSV idéntico byte a byte, así que una configuración se comparte
enviando sus parámetros, no el archivo de 36 MB.

---

## Estructura

```
├── run_all.py                  # generador + tasks (salta las que falten)
├── src/
│   ├── data_generator.py       # generador del dataset sintético
│   ├── task2_randomized.py
│   └── task4_hashtable.py
├── data/rides.csv              # dataset generado (ignorado por git)
├── results/taskN_results.json  # salida de cada task
├── dashboard/
│   └── build_dashboard.py      # arma los datos de los paneles (módulo, no script)
└── web/                        # el dashboard (Next.js + Pyodide)
    ├── app/                    # rutas: /, /w/[slug] y /w/[slug]/t/[task]
    ├── components/             # paneles, gráficos SVG, visor de código
    ├── lib/                    # parámetros, tipos, cliente del worker, prosa
    ├── public/pyodide-worker.js  # corre el pipeline de Python
    └── scripts/sync-python.mjs   # sincroniza ../src → public/py/
```

`dashboard/build_dashboard.py` **no genera ningún HTML**: es la capa que
convierte los `results/*.json` en la forma que consumen los paneles, y la
importan tanto el worker como el exportador de la corrida canónica. Está ahí
para que esa forma tenga una sola fuente de verdad.

---

## Notas de implementación

- **Reproducibilidad.** Todos los scripts usan semillas fijas y el pipeline es
  determinista. Dos detalles lo hacen posible: `ride_id` se sortea con un RNG
  *separado* (si saliera del principal desplazaría todos los sorteos
  posteriores, incluidos los conteos de Poisson, y cambiaría el tamaño del
  dataset), y la Task 4 usa `blake2b` en vez del `hash()` nativo, que Python
  aleatoriza por proceso.
- **Peor caso de QuickSort.** El benchmark adversarial se limita a n ≤ 8.000: el
  algoritmo determinista es O(n²) en ese escenario y con el dataset completo no
  terminaría en tiempo razonable.
- **El muestreo pierde en tiempo y gana en memoria.** La comparación de la media
  muestra a reservoir sampling *perdiendo* contra el cálculo exacto, a
  propósito: ambos son de una pasada y memoria O(1). Donde gana es en los
  cuantiles, que exactos requieren las n observaciones en memoria.
- **Archivos generados.** `web/public/py/` y `web/lib/generated/` los produce
  `sync-python.mjs` en cada build; no se editan a mano. `web/.next/` y
  `web/out/` son salida de build y se pueden borrar sin miedo.

---

## Desplegar

El sitio es estático (`output: "export"`): no hay servidor, no hay funciones y
todo el cómputo ocurre en el navegador de quien lo visita.

1. Importar el repositorio en Vercel.
2. **Settings → General → Root Directory**: `web`.
3. Framework: Next.js (se detecta solo). Sin variables de entorno obligatorias.

La corrida canónica va precomputada y commiteada en
`web/public/data/canonical-run.json`, porque el build de Vercel no tiene
Python. Si cambian los resultados, hay que regenerarla y commitearla:

```bash
python run_all.py
python web/scripts/export_canonical.py
```
