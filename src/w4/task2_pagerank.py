"""
Task 2 - PageRank como producto matriz-vector (S10)
---------------------------------------------------
Una ronda de MapReduce = una multiplicacion de PageRank sobre el grafo de
reubicaciones.

  map:    (i, j, p_ij, v_i)  ->  (j, p_ij * v_i)
  reduce: suma por j          ->  v'_j = beta * suma + (1 - beta) / n

Se itera hasta ||v(t+1) - v(t)||_1 < 1e-6 y se compara con el mismo PageRank
calculado en memoria (la "Unidad 3", iterado hasta 1e-10).
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
N_SPLITS = 4
BETA = 0.85
TOL = 1e-6              # criterio de parada del MapReduce
TOL_UNIDAD3 = 1e-10     # iteracion del calculo en memoria
TOL_COMPARE = 1e-4      # tolerancia de comparacion
MAX_ITER = 200
RESULTS_JSON = os.path.join(RESULTS_DIR, "task2.json")


# ---------------------------------------------------------------------------
# Map y reduce de una ronda
# ---------------------------------------------------------------------------
def map_entrada(registro):
    # registro = (i, j, p_ij, v_i); el valor de v viaja en el propio registro.
    i, j, p_ij, v_i = registro
    yield j, p_ij * v_i


def reduce_suma(j, valores):
    # El teletransporte se aplica aqui: el reduce conoce n por la constante N.
    yield j, BETA * sum(valores) + (1.0 - BETA) / N


N = 1  # se fija en el main antes de correr (los procesos lo importan)


# ---------------------------------------------------------------------------
# Matriz y vectores
# ---------------------------------------------------------------------------
def leer_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cargar_matriz(edges_csv):
    """M por filas: p(i,j) = reloc_count(i->j) / total que sale de i."""
    filas = {}
    for r in edges_csv:
        i, j = r["from_zone"], r["to_zone"]
        w = float(r["reloc_count"])
        if w <= 0:
            continue
        filas.setdefault(i, []).append((j, w))

    zonas = set(filas)
    for vecinos in filas.values():
        zonas.update(j for j, _ in vecinos)
    zonas = sorted(zonas)

    matriz = {}
    for i, vecinos in filas.items():
        total = sum(w for _, w in vecinos)
        matriz[i] = [(j, w / total) for j, w in vecinos]
    return matriz, zonas


def entradas_ronda(matriz, v):
    """Registros (i, j, p_ij, v_i) de la matriz, uno por arista."""
    return [
        (i, j, p_ij, v.get(i, 0.0))
        for i, vecinos in sorted(matriz.items())
        for j, p_ij in vecinos
    ]


def norm_l1(a, b, zonas):
    return sum(abs(a.get(z, 0.0) - b.get(z, 0.0)) for z in zonas)


def pagerank_memoria(matriz, zonas, beta=BETA, tol=TOL_UNIDAD3, max_iter=1000):
    """La Unidad 3: el mismo PageRank sin MapReduce, iterado hasta 1e-10."""
    n = len(zonas)
    v = {z: 1.0 / n for z in zonas}
    for _ in range(max_iter):
        nuevo = {z: (1.0 - beta) / n for z in zonas}
        for i, vecinos in matriz.items():
            v_i = v[i]
            for j, p_ij in vecinos:
                nuevo[j] += beta * p_ij * v_i
        if norm_l1(nuevo, v, zonas) < tol:
            v = nuevo
            break
        v = nuevo
    return v


if __name__ == "__main__":
    t0 = time.perf_counter()

    if not os.path.exists(EDGES_CSV):
        raise SystemExit("Falta data/edges.csv: corre primero run_all.py w4")

    matriz, zonas = cargar_matriz(leer_csv(EDGES_CSV))
    N = len(zonas)
    v = {z: 1.0 / N for z in zonas}

    rounds = []
    with Cluster(workers=WORKERS) as c:
        for it in range(1, MAX_ITER + 1):
            r = c.ejecutar(
                f"pagerank-{it}",
                dividir(entradas_ronda(matriz, v), N_SPLITS),
                map_entrada,
                reduce_suma,
                reducers=REDUCERS,
            )
            nuevo = {z: 0.0 for z in zonas}
            nuevo.update(dict(r.salida))
            l1 = norm_l1(nuevo, v, zonas)
            rounds.append({
                "iteration": it,
                "l1_change": l1,
                "map_output_pairs": r.stats["map_output_pairs"],
                "shuffle_pairs": r.stats["shuffle_pairs"],
                "time_s": r.stats["total_s"],
            })
            v = nuevo
            if l1 < TOL:
                break

    ref = pagerank_memoria(matriz, zonas)

    filas = []
    max_diff = 0.0
    for z in zonas:
        d = abs(v[z] - ref[z])
        max_diff = max(max_diff, d)
        filas.append({
            "zone": z,
            "pagerank_mr": v[z],
            "pagerank_unit3": ref[z],
            "abs_diff": d,
        })

    resultado = {
        "beta": BETA,
        "tol": TOL,
        "iterations": len(rounds),
        "converged": rounds[-1]["l1_change"] < TOL,
        "rounds": rounds,
        "zones": filas,
        "max_abs_diff": max_diff,
        "agrees_1e4": max_diff < TOL_COMPARE,
        "workers": WORKERS,
        "parallel": bool(rounds),
        "elapsed_sec": round(time.perf_counter() - t0, 3),
    }

    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Zonas: {N} | beta: {BETA} | iteraciones: {len(rounds)} | "
          f"convergido: {resultado['converged']}")
    for r in rounds:
        print(f"  t={r['iteration']:>3}  ||dv||_1={r['l1_change']:.3e}  "
              f"pares={r['shuffle_pairs']}  {r['time_s']:.2f}s")
    print(f"max|dif| vs Unidad 3 = {max_diff:.3e} -> agrees_1e4={resultado['agrees_1e4']}")
    print(f"Resultados en {RESULTS_JSON}")
