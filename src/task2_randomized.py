"""
Task 2 - Algoritmo aleatorizado
--------------------------------
Dos algoritmos aleatorizados aplicados al flujo de viajes:

(a) Randomized QuickSort  -> ordena los viajes por tarifa (fare) para generar
    rankings (top tarifas, tarifas mas bajas, etc). Se compara contra QuickSort
    determinista (pivote = primer elemento) en el PEOR CASO (arreglo ya ordenado)
    y en el caso promedio (arreglo aleatorio), para mostrar que la version
    aleatorizada evita la degradacion a O(n^2).

(b) Reservoir Sampling (algoritmo R) -> estima la tarifa promedio de la ciudad
    usando una muestra de tamano fijo k mientras se recorre el flujo de viajes
    una sola vez, sin conocer n de antemano. Se compara el tiempo y la precision
    contra calcular el promedio EXACTO recorriendo el dataset completo.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import json
import math
import random
import time
import sys

sys.setrecursionlimit(20000)
random.seed(7)


def _env(name, cast, default):
    """Permite bajar el costo del benchmark sin tocar el codigo: el dashboard
    web corre este mismo script dentro de Pyodide (3-5x mas lento que CPython)
    y necesita un perfil rapido para la exploracion interactiva. Sin variables
    de entorno los valores son los originales."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


BENCH_TRIALS = _env("RIDES_BENCH_TRIALS", int, 8)


# ---------------------------------------------------------------------------
# (a) QuickSort aleatorizado vs determinista
# ---------------------------------------------------------------------------
def expected_comparisons(n):
    """E[X] = 2n ln n: numero esperado de comparaciones del quicksort
    aleatorizado.

    Es el resultado que se demuestra en clase sumando, sobre cada par (z_i, z_j),
    la probabilidad 2/(j-i+1) de que lleguen a compararse.

    La demostracion supone que los elementos son DISTINTOS. Las tarifas de este
    dataset no lo son (se redondean a peso entero), y esa es justamente la
    razon por la que la medicion se despega de la curva al crecer n: la
    particion de Lomuto compara con <=, asi que todos los valores iguales al
    pivote caen del mismo lado y desbalancean la particion. Por eso el script
    reporta tambien cuantos valores distintos hay: sin ese dato la desviacion
    parece un error de implementacion."""
    return 2 * n * math.log(n) if n > 1 else 0.0
def randomized_quicksort(arr, lo, hi, counters):
    if lo >= hi:
        return
    counters["calls"] += 1
    pivot_idx = random.randint(lo, hi)          # <-- eleccion aleatoria del pivote
    arr[pivot_idx], arr[hi] = arr[hi], arr[pivot_idx]
    p = _partition(arr, lo, hi, counters)
    randomized_quicksort(arr, lo, p - 1, counters)
    randomized_quicksort(arr, p + 1, hi, counters)


def deterministic_quicksort(arr, lo, hi, counters):
    if lo >= hi:
        return
    counters["calls"] += 1
    # pivote determinista: siempre el primer elemento del sub-arreglo
    arr[lo], arr[hi] = arr[hi], arr[lo]
    p = _partition(arr, lo, hi, counters)
    deterministic_quicksort(arr, lo, p - 1, counters)
    deterministic_quicksort(arr, p + 1, hi, counters)


def _partition(arr, lo, hi, counters):
    pivot = arr[hi]
    i = lo
    for j in range(lo, hi):
        counters["comparisons"] += 1
        if arr[j] <= pivot:
            arr[i], arr[j] = arr[j], arr[i]
            i += 1
    arr[i], arr[hi] = arr[hi], arr[i]
    return i


def bench_quicksort(fares, sizes, adversarial_sizes):
    """Compara randomized vs deterministic quicksort en dos escenarios de entrada:
       - 'random': el orden natural del dataset (aprox. aleatorio)
       - 'adversarial': el arreglo ya ordenado ascendentemente (peor caso clasico
         para quicksort con pivote fijo = primer elemento)
    """
    results = []
    all_sizes = sorted(set(sizes) | set(adversarial_sizes))
    for n in all_sizes:
        base = fares[:n]
        scenarios = []
        if n in sizes:
            scenarios.append(("random_input", base))
        if n in adversarial_sizes:
            scenarios.append(("sorted_input", sorted(base)))

        for label, data in scenarios:
            # Randomized
            arr = data[:]
            counters = {"calls": 0, "comparisons": 0}
            t0 = time.perf_counter()
            randomized_quicksort(arr, 0, len(arr) - 1, counters)
            t1 = time.perf_counter()
            assert arr == sorted(data)
            results.append({
                "n": n, "input": label, "algorithm": "randomized_quicksort",
                "time_s": t1 - t0, "comparisons": counters["comparisons"],
                "expected_comparisons": round(expected_comparisons(n), 0),
            })

            # Deterministic
            arr2 = data[:]
            counters2 = {"calls": 0, "comparisons": 0}
            t0 = time.perf_counter()
            try:
                deterministic_quicksort(arr2, 0, len(arr2) - 1, counters2)
                ok = arr2 == sorted(data)
            except RecursionError:
                ok = False
            t1 = time.perf_counter()
            results.append({
                "n": n, "input": label, "algorithm": "deterministic_quicksort",
                "time_s": t1 - t0, "comparisons": counters2["comparisons"],
                "recursion_overflow": not ok,
            })
    return results


# ---------------------------------------------------------------------------
# (b) Reservoir Sampling vs promedio exacto
# ---------------------------------------------------------------------------
def reservoir_sample_mean(stream, k):
    """Algoritmo R de Vitter: mantiene una muestra uniforme de tamano k
       sobre un flujo de tamano desconocido, en una sola pasada."""
    reservoir = []
    for i, x in enumerate(stream):
        if i < k:
            reservoir.append(x)
        else:
            j = random.randint(0, i)  # invariante: P(elemento incluido) = k/(i+1)
            if j < k:
                reservoir[j] = x
    return sum(reservoir) / len(reservoir)


def exact_mean(stream):
    total = 0.0
    n = 0
    for x in stream:
        total += x
        n += 1
    return total / n


def bench_sampling(fares, sizes, k=500, trials=5):
    results = []
    for n in sizes:
        data = fares[:n]
        true_mean = sum(data) / len(data)

        t0 = time.perf_counter()
        exact = exact_mean(data)
        t1 = time.perf_counter()
        results.append({
            "n": n, "method": "exact_mean", "time_s": t1 - t0,
            "estimate": exact, "true_mean": true_mean, "rel_error_pct": 0.0,
        })

        errs = []
        avg_time = 0.0
        for _ in range(trials):
            t0 = time.perf_counter()
            est = reservoir_sample_mean(data, k)
            t1 = time.perf_counter()
            avg_time += (t1 - t0)
            errs.append(abs(est - true_mean) / true_mean * 100)
        results.append({
            "n": n, "method": f"reservoir_sampling_k{k}",
            "time_s": avg_time / trials,
            "estimate": None, "true_mean": true_mean,
            "rel_error_pct": sum(errs) / len(errs),
        })
    return results


def reservoir_sample(stream, k, rnd=random):
    """Algoritmo R: devuelve la MUESTRA (no solo su media)."""
    reservoir = []
    for i, x in enumerate(stream):
        if i < k:
            reservoir.append(x)
        else:
            j = rnd.randint(0, i)
            if j < k:
                reservoir[j] = x
    return reservoir


def quantile(sorted_vals, q):
    """Cuantil por interpolacion lineal sobre una lista YA ordenada."""
    if not sorted_vals:
        return float("nan")
    idx = q * (len(sorted_vals) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def bench_quantiles(fares, sizes, k=2000, trials=8, qs=(0.5, 0.95)):
    """Compara estimar cuantiles (mediana, p95) por reservoir sampling vs
    calcularlos de forma exacta.

    A diferencia de la media -- que se calcula exactamente en UNA pasada con
    memoria O(1), por lo que el muestreo no aporta nada -- un cuantil exacto
    exige ordenar (O(n log n) tiempo) y mantener las n observaciones en
    memoria (O(n)). El reservoir sampling lo estima con memoria O(k) FIJA,
    independiente de n: ese es el caso donde el algoritmo aleatorizado
    realmente gana.
    """
    results = []
    for n in sizes:
        data = fares[:n]

        t0 = time.perf_counter()
        exact_sorted = sorted(data)
        exact_vals = {q: quantile(exact_sorted, q) for q in qs}
        t1 = time.perf_counter()
        results.append({
            "n": n, "method": "exact_quantiles", "time_s": t1 - t0,
            "memory_items": n,
            "errors_pct": {str(q): 0.0 for q in qs},
        })

        times, errs = 0.0, {str(q): [] for q in qs}
        rnd = random.Random(1234)
        for _ in range(trials):
            t0 = time.perf_counter()
            sample = sorted(reservoir_sample(data, k, rnd))
            est = {q: quantile(sample, q) for q in qs}
            t1 = time.perf_counter()
            times += (t1 - t0)
            for q in qs:
                errs[str(q)].append(abs(est[q] - exact_vals[q]) / exact_vals[q] * 100)
        results.append({
            "n": n, "method": f"reservoir_quantiles_k{k}",
            "time_s": times / trials,
            "memory_items": k,
            "errors_pct": {q: round(sum(v) / len(v), 3) for q, v in errs.items()},
        })
    return results


def fare_distribution(fares):
    """Cuantos valores distintos hay entre las tarifas.

    Es el diagnostico que explica la desviacion contra 2n ln n (ver
    expected_comparisons): mientras mas se repitan los valores, peor se comporta
    la particion de Lomuto y mas comparaciones hace de las que predice el
    teorema, que asume elementos distintos."""
    conteo = {}
    for f in fares:
        conteo[f] = conteo.get(f, 0) + 1
    n = len(fares)
    distintos = len(conteo)
    return {
        "n_total": n,
        "n_distinct": distintos,
        "avg_repeats": round(n / distintos, 2) if distintos else 0,
        "max_repeats": max(conteo.values()) if conteo else 0,
    }


def load_fares(csv_path):
    fares = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            fares.append(float(row["fare"]))
    return fares


if __name__ == "__main__":
    fares = load_fares(RIDES_CSV)
    n_total = len(fares)

    # Tamanos para el caso 'random_input' (puede escalar hasta el dataset
    # completo: ambos algoritmos son O(n log n) en promedio en este caso).
    sizes = sorted({s for s in [1000, 5000, 20000, 50000, 100000, 200000, n_total] if s <= n_total})

    # Tamanos para el caso adversarial 'sorted_input': el determinista es
    # O(n^2) aqui, asi que se limita a un rango pequeno para que termine
    # en tiempo razonable, mientras se sigue viendo el crecimiento cuadratico.
    adversarial_sizes = [500, 1000, 2000, 4000, 8000]

    print(f"Dataset: {n_total} tarifas.")
    print(f"Tamanos (random_input): {sizes}")
    print(f"Tamanos (sorted_input, peor caso): {adversarial_sizes}")

    sort_results = bench_quicksort(fares, sizes, adversarial_sizes)
    sample_results = bench_sampling(fares, sizes, k=500, trials=BENCH_TRIALS)
    quantile_results = bench_quantiles(fares, sizes, k=2000, trials=BENCH_TRIALS)

    dist = fare_distribution(fares)

    out = {"quicksort": sort_results, "sampling": sample_results,
           "quantiles": quantile_results, "fare_distribution": dist}
    with open(os.path.join(RESULTS_DIR, "task2_results.json"), "w") as f:
        json.dump(out, f, indent=2)

    print("\n== QuickSort: aleatorizado vs determinista (peor caso = arreglo ordenado) ==")
    for r in sort_results:
        flag = " (DESBORDE DE RECURSION)" if r.get("recursion_overflow") else ""
        print(f"  n={r['n']:>6} input={r['input']:<14} algo={r['algorithm']:<22} "
              f"t={r['time_s']:.4f}s  comparaciones={r['comparisons']:>10}{flag}")

    print("\n== Comparaciones medidas vs E[X] = 2n ln n (entrada desordenada) ==")
    print(f"  Las tarifas NO son distintas: {dist['n_total']} valores, "
          f"{dist['n_distinct']} distintos ({dist['avg_repeats']} repeticiones "
          f"por valor, hasta {dist['max_repeats']}).")
    print("  El teorema supone elementos distintos, asi que se espera desviacion.")
    print(f"  {'n':>8}{'medidas':>14}{'2n ln n':>14}{'razon':>8}")
    for r in sort_results:
        if r["input"] == "random_input" and r["algorithm"] == "randomized_quicksort":
            teo = r["expected_comparisons"]
            razon = r["comparisons"] / teo if teo else 0
            print(f"  {r['n']:>8}{r['comparisons']:>14}{teo:>14.0f}{razon:>8.3f}")

    print("\n== Reservoir Sampling vs promedio exacto ==")
    for r in sample_results:
        print(f"  n={r['n']:>6} metodo={r['method']:<22} t={r['time_s']:.6f}s "
              f"error_rel={r['rel_error_pct']:.3f}%")

    print("\n== Cuantiles: reservoir sampling vs exacto (aqui SI gana el muestreo) ==")
    for r in quantile_results:
        errs = " ".join(f"p{int(float(q)*100)}_err={v}%" for q, v in r["errors_pct"].items())
        print(f"  n={r['n']:>6} metodo={r['method']:<26} t={r['time_s']:.6f}s "
              f"memoria={r['memory_items']:>7} items  {errs}")

    print("\nResultados guardados en results/task2_results.json")
