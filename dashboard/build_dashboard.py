"""
build_dashboard.py
--------------------
Reorganiza los results/task{n}_results.json en la forma que consumen los
paneles del dashboard: {panelA, panelB, panelC, kpis}.

NO es un script: no genera ningun HTML ni escribe archivos. Es la capa de
reshaping, y existe para que la forma de los paneles tenga UNA sola fuente de
verdad. Lo importan dos lados, los dos por ruta de archivo:

  - web/public/pyodide-worker.js  -> read_results(), dentro de Pyodide, arma
    cada panel apenas termina la task de la que depende.
  - web/scripts/export_canonical.py -> exporta la corrida precomputada que la
    app sirve como JSON estatico.

Por eso las funciones build_* no se renombran ni cambian de firma sin tocar
esos dos archivos. Tampoco se mueve este archivo de dashboard/: el worker monta
/proj/dashboard en su FS virtual y scripts/sync-python.mjs lo copia desde aca.

Cada build_* recibe el JSON crudo de su(s) task y devuelve solo lo que el panel
necesita. Indexan por ruta de clave exacta, asi que renombrar una clave en la
salida de una task rompe el panel: revisar tambien web/lib/types.ts.
"""

import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(BASE, "results")


def build_panel_b(t2):
    qs = t2["quicksort"]

    def series(input_label, algo):
        rows = sorted(
            [r for r in qs if r["input"] == input_label and r["algorithm"] == algo],
            key=lambda r: r["n"],
        )
        return rows

    rr = series("random_input", "randomized_quicksort")
    rd = series("random_input", "deterministic_quicksort")
    sr = series("sorted_input", "randomized_quicksort")
    sd = series("sorted_input", "deterministic_quicksort")

    # Las comparaciones van junto a los tiempos porque son la magnitud que la
    # teoria predice: el tiempo depende de la maquina, el conteo no.
    return {
        "random_input": {
            "n": [r["n"] for r in rr],
            "randomized_time": [round(r["time_s"], 4) for r in rr],
            "deterministic_time": [round(r["time_s"], 4) for r in rd],
            "randomized_comparisons": [r.get("comparisons", 0) for r in rr],
            "expected_comparisons": [r.get("expected_comparisons", 0) for r in rr],
        },
        "sorted_input_worst_case": {
            "n": [r["n"] for r in sr],
            "randomized_time": [round(r["time_s"], 4) for r in sr],
            "deterministic_time": [round(r["time_s"], 4) for r in sd],
            "randomized_comparisons": [r.get("comparisons", 0) for r in sr],
            "expected_comparisons": [r.get("expected_comparisons", 0) for r in sr],
        },
        # Sin esto la desviacion contra 2n ln n parece un error de implementacion.
        "fare_distribution": t2.get("fare_distribution"),
    }


def build_panel_a(t4):
    busiest = t4["top_windows"][0]
    return {
        "zone": busiest["zone"],
        "window": busiest["minute"],
        "n_requests": busiest["n_requests"],
        "B_buckets": t4["summary"]["B_buckets"],
        "chaining_loads": busiest["chaining"]["loads"],
        "p2c_loads": busiest["power_of_two_choices"]["loads"],
        # Cota del regimen cargado para ESTA ventana; ver balls_in_bins_theory
        # en src/task4_hashtable.py para por que no es la formula de m=n.
        "theory": busiest.get("theory"),
        "summary": t4["summary"],
    }


def build_panel_c(t5):
    return {
        "k_sigma": t5["k_sigma"],
        "zones": [
            {
                "zone": z["zone"], "peak_hour": z["peak_hour"],
                "mu": z["mu"],
                "sigma": z["sigma_model_sqrt_mu"],
                "sigma_hat": z["sigma_hat"],
                "threshold": z["model_based"]["surge_threshold"],
                "chebyshev_bound": z["model_based"]["chebyshev_bound"],
                "chernoff_bound": z["model_based"]["chernoff_bound"],
                "monte_carlo_prob": z["model_based"]["monte_carlo_prob"],
                # Opcional: los conteos diarios reales. Si la task los reporta,
                # el panel los superpone sobre la distribucion teorica; si no,
                # dibuja solo la curva. No se exige para no encarecer la task.
                "daily_counts": z.get("daily_counts_observed") or [],
            }
            for z in t5["zones"]
        ],
    }


def build_kpis(t1, t3):
    """Indicadores de la Task 1 y de la Task 3.

    De la Task 3 lo unico que el enunciado pide es "measure collisions", y el
    modulo de hashing teorico tampoco plantea comparar contra ningun hash
    ingenuo: eso fue una decision nuestra. Por eso aqui solo `K_values` y
    `universal` son indispensables, y lo demas se toma si esta.

    Una lista vacia significa "esa parte no vino", y el panel la omite en vez
    de dibujar huecos. Asi una Task 3 fiel al enunciado llena su panel sin
    tener que adivinar claves que nadie le pidio."""
    universal = t3.get("universal") or []
    naive = t3.get("naive") or []

    def col(items, clave):
        """Columna con los valores presentes; vacia si ninguno la trae."""
        vals = [i.get(clave) for i in items]
        return vals if all(v is not None for v in vals) and vals else []

    return {
        "task1": {
            "peak_req_per_sec": t1["peak_requests_per_sec"],
            "peak_req_per_sec_10x": t1["peak_requests_per_sec_10x_growth"],
            "storage_year_gb": t1["storage_per_year_current_GB"],
            "storage_year_10x_gb": t1["storage_per_year_10x_growth_GB"],
            "total_requests": t1["n_total_requests_dataset"],
            "n_days": t1["n_days_simulated"],
        },
        "task3": {
            "K_values": t3["K_values"],
            "universal_load_factor": col(universal, "avg_load_factor"),
            "naive_load_factor": col(naive, "load_factor"),
            # Las colisiones son LO que pide el enunciado, y la cota C(n,2)/K es
            # la que se deriva en clase. Se pasan si la task las reporta.
            "universal_collisions": col(universal, "avg_collisions_empirical"),
            "theoretical_collisions": col(universal, "theoretical_expected_collisions"),
        },
    }


# Cada panel declara de que tasks depende y que script las produce. Es lo que
# permite armar el dashboard con las tasks que YA existan en el repo: el panel
# cuya task todavia no esta se omite, y la UI lo marca como pendiente en vez de
# reventar. El repo se trabaja entre varias personas y cada quien agrega la
# suya, asi que "falta una task" es el estado normal, no un error.
PANELS = [
    ("panelA", ("task4",), build_panel_a, "src/task4_hashtable.py"),
    ("panelB", ("task2",), build_panel_b, "src/task2_randomized.py"),
    ("panelC", ("task5",), build_panel_c, "src/task5_probability.py"),
    ("kpis", ("task1", "task3"), build_kpis, "src/task1_bigdata.py y src/task3_hashing.py"),
]


def available_results(results_dir=RESULTS, errors=None):
    """Los task{n}_results.json que existen ahora mismo, ya parseados.

    Un archivo ilegible se salta y se anota en `errors` en vez de propagar la
    excepcion: cada task la escribe una persona distinta, y un JSON a medio
    escribir no puede dejar sin datos a las demas."""
    out = {}
    for i in range(1, 6):
        clave = f"task{i}"
        ruta = os.path.join(results_dir, f"task{i}_results.json")
        if not os.path.exists(ruta):
            continue
        try:
            with open(ruta, encoding="utf-8") as f:
                out[clave] = json.load(f)
        except Exception as e:  # JSON invalido, archivo a medio escribir, encoding
            if errors is not None:
                errors[clave] = f"{type(e).__name__}: {e}"
    return out


def build_panels(results, errors=None):
    """Arma solo los paneles cuyas tasks esten en `results`.

    Si el JSON de una task existe pero no trae las claves que su build_*
    indexa, ESE panel se omite y el motivo se anota en `errors`; los demas se
    arman igual.

    Es la diferencia entre "a la Task 3 le falta una clave" y "no se ve nada":
    antes la excepcion subia hasta el worker, que la tomaba por un fallo de la
    etapa que acababa de correr bien, la marcaba en rojo y detenia el pipeline.
    Un panel ajeno mal formado tumbaba los paneles propios."""
    panels = {}
    for panel, deps, fn, _script in PANELS:
        if not all(d in results for d in deps):
            continue
        try:
            panels[panel] = fn(*[results[d] for d in deps])
        except Exception as e:
            if errors is not None:
                falta = f" (falta la clave {e})" if isinstance(e, KeyError) else ""
                errors[panel] = (
                    f"{', '.join(deps)} corrio, pero su JSON no tiene la forma "
                    f"que este panel necesita{falta}."
                )
    return panels


if __name__ == "__main__":
    # No hay nada que ejecutar: este archivo es un modulo. Se deja este aviso
    # porque el nombre invita a correrlo, y un script que no hace nada confunde.
    problemas = {}
    disponibles = available_results(errors=problemas)
    panels = build_panels(disponibles, errors=problemas)
    print("build_dashboard.py reorganiza los results/ en datos de panel.")
    print("No genera ningun HTML: el dashboard es la app de web/.")
    print("\nCon los results/ que hay ahora se pueden armar estos paneles:")
    for panel, deps, _fn, script in PANELS:
        if panel in panels:
            print(f"  {panel:<7} OK         ({', '.join(deps)})")
        elif panel in problemas:
            print(f"  {panel:<7} ERROR      {problemas[panel]}")
        else:
            faltan = ", ".join(d for d in deps if d not in disponibles)
            print(f"  {panel:<7} pendiente  falta {faltan} -> corre python {script}")
    print("\nPara verlos:  cd web && npm install && npm run dev")
