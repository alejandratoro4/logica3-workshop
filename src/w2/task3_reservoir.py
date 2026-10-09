"""
Workshop 2 - Task 3: muestreo sobre el stream (reservoir sampling).

Lee data/stream.csv fila por fila, en orden de stream_seq. Por cada zona
mantiene un reservorio de tamano fijo (100, 300 y 500) y estima con el la
tarifa y la espera promedio. El promedio verdadero se lleva aparte con suma y
conteo, solo para medir el error.

Referencia: Clase 9 (Data Streams: Sampling), Algoritmo 1 (Reservoir).

Entrada: data/stream.csv
Salida:  results/w2/task3.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

import csv
import json
import math
import random

SEED = int(os.environ.get("RIDES_SEED") or 42)
SIZES = [100, 300, 500]
REPETITIONS = 10        # corridas independientes del muestreo; la 0 es la reportada
FARE, WAIT = 0, 1


def reservoir_update(sample, m, i, item, j):
    """Paso del algoritmo Reservoir para el i-esimo item (i desde 1), con j
    uniforme en 1..i: los primeros m entran; despues el item reemplaza a
    sample[j-1] si j <= m. Cada item visto queda con probabilidad m/i."""
    if i <= m:
        sample.append(item)
    elif j <= m:
        sample[j - 1] = item


def mean(sample, field):
    return sum(item[field] for item in sample) / len(sample)


def standard_error(sd, m, n):
    """Error estandar de la media de una muestra sin reemplazo de m sobre n."""
    if n <= 1 or m >= n:
        return 0.0
    return sd / math.sqrt(m) * math.sqrt((n - m) / (n - 1))


def process_stream(csv_path):
    """Una pasada por el stream. Devuelve (exact, reservoirs, n_events).

    exact[zona]         = [n, suma fare, suma wait, suma fare^2, suma wait^2]
    reservoirs[r][zona] = {m: muestra}, para cada repeticion r

    En una repeticion los tres tamanos usan el mismo j de cada paso; cada
    reservorio sigue siendo una muestra uniforme de su zona.
    """
    draws = [random.Random(SEED * 1000 + r).random for r in range(REPETITIONS)]
    reservoirs = [{} for _ in range(REPETITIONS)]
    exact = {}
    max_size = max(SIZES)
    n_events = 0
    last_seq = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seq = int(row["stream_seq"])
            if seq <= last_seq:
                raise SystemExit("stream.csv no esta en orden de stream_seq")
            last_seq = seq
            n_events += 1

            zone = row["pickup_zone"]
            fare = float(row["fare"])
            wait = float(row["wait_for_driver_sec"])

            stats = exact.get(zone)
            if stats is None:
                stats = exact[zone] = [0, 0.0, 0.0, 0.0, 0.0]
                for r in range(REPETITIONS):
                    reservoirs[r][zone] = {m: [] for m in SIZES}
            stats[0] += 1
            stats[1] += fare
            stats[2] += wait
            stats[3] += fare * fare
            stats[4] += wait * wait

            i = stats[0]
            item = (fare, wait)
            for r in range(REPETITIONS):
                j = int(draws[r]() * i) + 1          # uniforme en 1..i
                if i > max_size and j > max_size:
                    continue
                for m in SIZES:
                    reservoir_update(reservoirs[r][zone][m], m, i, item, j)

    return exact, reservoirs, n_events


def build_result(exact, reservoirs, n_events):
    zones = []
    acc = {m: {"err_fare": [], "err_wait": [], "rep_fare": [], "rep_wait": [], "ratio": []}
           for m in SIZES}

    for zone in sorted(exact):
        n, s_fare, s_wait, s_fare2, s_wait2 = exact[zone]
        true_fare = s_fare / n
        true_wait = s_wait / n
        sd_fare = math.sqrt(max(s_fare2 / n - true_fare ** 2, 0.0))
        sd_wait = math.sqrt(max(s_wait2 / n - true_wait ** 2, 0.0))

        by_size = []
        for m in SIZES:
            est_fare = [mean(reservoirs[r][zone][m], FARE) for r in range(REPETITIONS)]
            est_wait = [mean(reservoirs[r][zone][m], WAIT) for r in range(REPETITIONS)]
            err_fare = abs(est_fare[0] - true_fare) / true_fare * 100
            err_wait = abs(est_wait[0] - true_wait) / true_wait * 100
            by_size.append({
                "size": m,
                "est_avg_fare": round(est_fare[0], 2),
                "est_avg_wait": round(est_wait[0], 2),
                "rel_error_fare_pct": round(err_fare, 3),
                "rel_error_wait_pct": round(err_wait, 3),
            })

            a = acc[m]
            a["err_fare"].append(err_fare)
            a["err_wait"].append(err_wait)
            a["rep_fare"].append(sum(abs(e - true_fare) for e in est_fare) / REPETITIONS / true_fare * 100)
            a["rep_wait"].append(sum(abs(e - true_wait) for e in est_wait) / REPETITIONS / true_wait * 100)
            for estimates, true_value, sd in ((est_fare, true_fare, sd_fare),
                                              (est_wait, true_wait, sd_wait)):
                se = standard_error(sd, m, n)
                if se > 0:
                    rmse = math.sqrt(sum((e - true_value) ** 2 for e in estimates) / REPETITIONS)
                    a["ratio"].append(rmse / se)

        zones.append({
            "zone": zone,
            "n_requests": n,
            "true_avg_fare": round(true_fare, 2),
            "true_avg_wait": round(true_wait, 2),
            "by_size": by_size,
        })

    summary = []
    for m in SIZES:
        a = acc[m]
        stored = sum(min(m, exact[z][0]) for z in exact)
        summary.append({
            "size": m,
            "avg_rel_error_fare_pct": round(sum(a["err_fare"]) / len(a["err_fare"]), 3),
            "avg_rel_error_wait_pct": round(sum(a["err_wait"]) / len(a["err_wait"]), 3),
            "avg_rel_error_fare_pct_repetitions": round(sum(a["rep_fare"]) / len(a["rep_fare"]), 3),
            "avg_rel_error_wait_pct_repetitions": round(sum(a["rep_wait"]) / len(a["rep_wait"]), 3),
            "rmse_over_standard_error": round(sum(a["ratio"]) / len(a["ratio"]), 3) if a["ratio"] else 0.0,
            "items_in_memory": stored,
            "pct_of_stream_in_memory": round(100 * stored / n_events, 4),
        })

    return {
        "sizes": SIZES,
        "zones": zones,
        "n_events": n_events,
        "repetitions": REPETITIONS,
        "summary": summary,
    }


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero python run_all.py w2")

    exact, reservoirs, n_events = process_stream(STREAM_CSV)
    resultado = build_result(exact, reservoirs, n_events)

    with open(os.path.join(RESULTS_DIR, "task3.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Eventos: {n_events} | zonas: {len(resultado['zones'])} | reservorios: {SIZES}")
    print(f"{'zona':<12}{'n':>8}{'tarifa':>10}" + "".join(f"{'m=' + str(m):>10}" for m in SIZES)
          + f"{'espera':>9}" + "".join(f"{'m=' + str(m):>8}" for m in SIZES))
    for z in resultado["zones"]:
        print(f"{z['zone']:<12}{z['n_requests']:>8}{z['true_avg_fare']:>10.1f}"
              + "".join(f"{b['est_avg_fare']:>10.1f}" for b in z["by_size"])
              + f"{z['true_avg_wait']:>9.1f}"
              + "".join(f"{b['est_avg_wait']:>8.1f}" for b in z["by_size"]))
    print(f"{'m':>5}{'err tarifa %':>14}{'err espera %':>14}{'prom. rep. %':>24}"
          f"{'RMSE/SE':>9}{'% stream':>10}")
    for s in resultado["summary"]:
        reps = f"{s['avg_rel_error_fare_pct_repetitions']:.2f} / {s['avg_rel_error_wait_pct_repetitions']:.2f}"
        print(f"{s['size']:>5}{s['avg_rel_error_fare_pct']:>14.2f}{s['avg_rel_error_wait_pct']:>14.2f}"
              f"{reps:>24}{s['rmse_over_standard_error']:>9.2f}{s['pct_of_stream_in_memory']:>10.3f}")
    print("Resultados en results/w2/task3.json")
