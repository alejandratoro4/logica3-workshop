"""
Task 1 - Pipeline MapReduce
---------------------------
Job 1 (dos rondas):
  "1a": map emite (driver_id, (stream_seq, pickup_zone, fare, wait)); el reduce
        ordena los viajes del conductor por stream_seq y emite
        ((zona_i, zona_siguiente), (1, tarifa, espera)).
  "1b": map identidad; el reduce (usado tambien como combiner) suma por par de
        zonas -> ((a, b), (n, suma_tarifa, suma_espera)).
Job 2 ("2"): map emite (zona, (salen, llegan, suma_tarifa, suma_espera)) desde
        cada arista; el reduce arma el resumen por zona de nodes.csv.

Las aristas del Job 1 se validan contra data/edges.csv (Unidad 3).
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w4")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
NODES_CSV = os.path.join(DATA_DIR, "nodes.csv")

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapreduce import Cluster, fragmentos, dividir

import csv
import json
import time

WORKERS = 4
REDUCERS = 4
N_JOB2_SPLITS = 4
TOL = 0.01          # tolerancia de las medias al validar contra la Unidad 3
RESULTS_JSON = os.path.join(RESULTS_DIR, "task1.json")


# ---------------------------------------------------------------------------
# Job 1a: agrupar por conductor
# ---------------------------------------------------------------------------
def map_viajes(fila):
    yield fila["driver_id"], (
        int(fila["stream_seq"]),
        fila["pickup_zone"],
        float(fila["fare"]),
        float(fila["wait_for_driver_sec"]),
    )


def reduce_conductor(driver, viajes):
    viajes.sort()
    for (_, a, _, _), (_, b, tarifa, espera) in zip(viajes, viajes[1:]):
        yield (a, b), (1, tarifa, espera)


# ---------------------------------------------------------------------------
# Job 1b: sumar por par de zonas (el mismo reduce sirve de combiner)
# ---------------------------------------------------------------------------
def map_identidad(par):
    yield par


def reduce_par_zona(par, valores):
    # Se suman (n, suma_tarifa, suma_espera): nunca medias, para que la salida
    # tenga la misma forma que la entrada y pueda usarse como combiner.
    n = 0
    suma_tarifa = 0.0
    suma_espera = 0.0
    for c, t, e in valores:
        n += c
        suma_tarifa += t
        suma_espera += e
    yield par, (n, suma_tarifa, suma_espera)


# ---------------------------------------------------------------------------
# Job 2: resumen por zona desde las aristas
# ---------------------------------------------------------------------------
def map_aristas(arista):
    (a, b), (n, suma_tarifa, suma_espera) = arista
    yield a, (n, 0, 0.0, 0.0)                      # salen de a
    yield b, (0, n, suma_tarifa, suma_espera)      # llegan a b


def reduce_zona(zona, valores):
    salen = 0
    llegan = 0
    suma_tarifa = 0.0
    suma_espera = 0.0
    for out, inc, t, e in valores:
        salen += out
        llegan += inc
        suma_tarifa += t
        suma_espera += e
    yield zona, (
        salen,
        llegan,
        llegan - salen,
        round(suma_tarifa / llegan, 4) if llegan else 0.0,
        round(suma_espera / llegan, 4) if llegan else 0.0,
    )


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def leer_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def validar_aristas(aristas, edges_csv):
    """Compara las aristas del Job 1 con data/edges.csv: mismos pares, mismo
    reloc_count y medias a TOL o menos."""
    esperado = {}
    for r in edges_csv:
        esperado[(r["from_zone"], r["to_zone"])] = {
            "reloc_count": int(r["reloc_count"]),
            "avg_fare": float(r["avg_fare"]),
            "avg_wait": float(r["avg_wait_for_driver_sec"]),
        }

    obtenido = {}
    for (a, b), (n, suma_tarifa, suma_espera) in aristas:
        obtenido[(a, b)] = {
            "reloc_count": n,
            "avg_fare": suma_tarifa / n if n else 0.0,
            "avg_wait": suma_espera / n if n else 0.0,
        }

    max_diff_count = 0
    max_diff_fare = 0.0
    max_diff_wait = 0.0
    match = set(esperado) == set(obtenido)
    for par, ref in esperado.items():
        got = obtenido.get(par)
        if got is None:
            continue
        d_count = abs(got["reloc_count"] - ref["reloc_count"])
        d_fare = abs(got["avg_fare"] - ref["avg_fare"])
        d_wait = abs(got["avg_wait"] - ref["avg_wait"])
        max_diff_count = max(max_diff_count, d_count)
        max_diff_fare = max(max_diff_fare, d_fare)
        max_diff_wait = max(max_diff_wait, d_wait)
        if d_count or d_fare > TOL or d_wait > TOL:
            match = False

    return {
        "edges_compared": len(esperado),
        "edges_match": bool(match),
        "max_diff_reloc_count": max_diff_count,
        "max_diff_avg_fare": round(max_diff_fare, 6),
        "max_diff_avg_wait": round(max_diff_wait, 6),
    }


def comparar_nodos(nodos, nodes_csv):
    esperado = {r["zone_id"]: r for r in nodes_csv}
    if set(esperado) != {z for z, _ in nodos}:
        return False
    for zona, (salen, llegan, flujo, tarifa, espera) in nodos:
        ref = esperado[zona]
        if int(ref["out_reloc_count"]) != salen:
            return False
        if int(ref["in_reloc_count"]) != llegan:
            return False
        if int(ref["net_flow"]) != flujo:
            return False
        if abs(float(ref["avg_fare"]) - tarifa) > TOL:
            return False
        if abs(float(ref["avg_wait_for_driver_sec"]) - espera) > TOL:
            return False
    return True


if __name__ == "__main__":
    t0 = time.perf_counter()

    if not os.path.exists(os.path.join(DATA_DIR, "w4", "part-00.csv")):
        raise SystemExit(
            "Faltan los fragmentos: corre primero src/w4/dataset.py (o run_all.py w4)"
        )

    splits = fragmentos()
    n_fragments = len(splits)

    with Cluster(workers=WORKERS) as c:
        r1a = c.ejecutar("1a", splits, map_viajes, reduce_conductor, reducers=REDUCERS)
        r1b = c.ejecutar(
            "1b", r1a.por_reducer, map_identidad, reduce_par_zona,
            combiner=reduce_par_zona, reducers=REDUCERS,
        )
        r2 = c.ejecutar(
            "2", dividir(r1b.salida, N_JOB2_SPLITS), map_aristas, reduce_zona,
            reducers=REDUCERS,
        )

    aristas = r1b.salida
    validation = validar_aristas(aristas, leer_csv(EDGES_CSV))

    nodos = sorted(r2.salida, key=lambda kv: kv[0])
    nodes = [
        {
            "zone_id": zona,
            "out_reloc_count": salen,
            "in_reloc_count": llegan,
            "net_flow": flujo,
            "avg_fare": tarifa,
            "avg_wait_for_driver_sec": espera,
        }
        for zona, (salen, llegan, flujo, tarifa, espera) in nodos
    ]
    nodes_match = comparar_nodos(nodos, leer_csv(NODES_CSV))

    resultado = {
        "n_fragments": n_fragments,
        "workers": WORKERS,
        "parallel": bool(r1a.stats["parallel"]),
        "jobs": [r1a.stats, r1b.stats, r2.stats],
        "validation": validation,
        "nodes": nodes,
        "nodes_match": nodes_match,
        "elapsed_sec": round(time.perf_counter() - t0, 3),
    }

    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Fragmentos: {n_fragments} | workers: {WORKERS} | "
          f"paralelo: {resultado['parallel']}")
    for s in resultado["jobs"]:
        print(f"  job {s['job']:<3} map={s['map_tasks']} reduce={s['reduce_tasks']} "
              f"entrada={s['input_records']} pares_map={s['map_output_pairs']} "
              f"shuffle={s['shuffle_pairs']} ({s['shuffle_bytes']} B) "
              f"claves={s['distinct_keys']} q={s['max_key_values']} "
              f"t={s['total_s']:.2f}s")
    v = resultado["validation"]
    print(f"Validacion: {v['edges_compared']} aristas, match={v['edges_match']} "
          f"(dif max: count={v['max_diff_reloc_count']}, "
          f"fare={v['max_diff_avg_fare']}, wait={v['max_diff_avg_wait']})")
    print(f"Zonas: {len(nodes)} | nodes_match={nodes_match}")
    print(f"Resultados en {RESULTS_JSON}")
