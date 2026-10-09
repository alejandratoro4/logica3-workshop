"""
Workshop 3 - Task 3: PageRank estandar.

Arma la matriz de transicion M desde data/edges.csv con reloc_count como peso
(M[i][j] = P(ir de la zona i a la zona j), cada fila suma 1) y calcula
PageRank con taxation: v = beta * v M + (1 - beta) / n. Compara el ranking
con el de volumen de viajes de data/rides.csv.

Referencia: Clase 15 (PageRank), ecuacion 3 (taxation).

Entrada: data/edges.csv, data/rides.csv
Salida:  results/w3/task3.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import json

BETA = 0.85
TOL = 1e-10
MAX_ITER = 1000
SPREAD_LIMIT = 0.05     # por debajo, las filas de M se consideran iguales


def read_edges(csv_path):
    """{(from_zone, to_zone): reloc_count}."""
    edges = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (row["from_zone"], row["to_zone"])
            edges[key] = edges.get(key, 0) + int(row["reloc_count"])
    return edges


def read_ride_volume(csv_path):
    """{zona: viajes} segun pickup_zone."""
    volume = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            zone = row["pickup_zone"]
            volume[zone] = volume.get(zone, 0) + 1
    return volume


def transition_matrix(zones, edges):
    """M por filas: M[i][j] = reloc_count(i -> j) / total que sale de i.
    Una zona sin salidas queda con la fila en ceros."""
    index = {z: k for k, z in enumerate(zones)}
    n = len(zones)
    M = [[0.0] * n for _ in range(n)]
    out = [0] * n
    for (a, b), count in edges.items():
        out[index[a]] += count
    for (a, b), count in edges.items():
        if out[index[a]] > 0:
            M[index[a]][index[b]] = count / out[index[a]]
    return M


def step(v, M):
    """Un paso de la cadena: devuelve v M. La masa de una fila en ceros
    (zona sin salidas) se reparte por igual entre todas las zonas."""
    n = len(M)
    dead = sum(v[i] for i in range(n) if not any(M[i])) / n
    return [sum(v[i] * M[i][j] for i in range(n)) + dead for j in range(n)]


def pagerank(M, beta, tol=TOL, max_iter=MAX_ITER):
    """Itera v = beta * v M + (1 - beta) / n desde la distribucion uniforme.
    Devuelve (v, iteraciones)."""
    n = len(M)
    v = [1.0 / n] * n
    for it in range(1, max_iter + 1):
        new = [beta * x + (1.0 - beta) / n for x in step(v, M)]
        change = sum(abs(new[j] - v[j]) for j in range(n))
        v = new
        if change < tol:
            return v, it
    return v, max_iter


def ranks(values):
    """{zona: puesto}, 1 = el valor mas alto. Empates por nombre de zona."""
    order = sorted(values, key=lambda z: (-values[z], z))
    return {z: k + 1 for k, z in enumerate(order)}


def row_spread(M):
    """Mayor diferencia entre dos filas de M en una misma columna. Cerca de 0
    significa que la zona del siguiente viaje no depende de la zona actual."""
    n = len(M)
    return max(max(M[i][j] for i in range(n)) - min(M[i][j] for i in range(n))
               for j in range(n))


def explain(zones, M, pr, pi, rank_pr, rank_vol, volume, beta):
    """Texto de la clave `explanation`, armado con los valores de la corrida."""
    n = len(zones)
    index = {z: k for k, z in enumerate(zones)}
    spread = row_spread(M)
    total = sum(volume.values())
    rising = [z for z in zones if rank_pr[z] < rank_vol[z]]

    if not rising and spread < SPREAD_LIMIT:
        gap = max(abs(pi[z] - volume[z] / total) for z in zones)
        return (
            "El ranking por PageRank coincide con el de volumen. Las filas de M "
            f"difieren entre si en a lo sumo {spread:.3f}: la zona del siguiente viaje de un "
            "conductor casi no depende de la zona actual. Con filas iguales, v M es la misma "
            "distribucion pi para cualquier v y PageRank = beta * pi + (1 - beta) / n, con "
            f"beta = {beta:g} y n = {n}. Esa transformacion es creciente en pi, y pi difiere "
            f"de la participacion de cada zona en los viajes en a lo sumo {gap:.4f}, asi que "
            "el orden no cambia."
        )
    if not rising:
        order = sorted(zones, key=lambda z: rank_pr[z])
        margin = min(pr[a] - pr[b] for a, b in zip(order, order[1:]))
        return (
            "Ninguna zona queda mas arriba en PageRank que en volumen. Las filas de M "
            f"difieren entre si hasta {spread:.3f}, pero el salto aleatorio (1 - beta = "
            f"{1 - beta:g}) no invierte ningun par de zonas: la menor diferencia de PageRank "
            f"entre puestos consecutivos es {margin:.5f}."
        )

    zone = max(rising, key=lambda z: (rank_vol[z] - rank_pr[z], pr[z]))
    passed = [z for z in zones if rank_vol[z] < rank_vol[zone] and rank_pr[z] > rank_pr[zone]]
    other = min(passed, key=lambda z: rank_vol[z])

    # PageRank = (1 - beta) * suma_k beta^k * (u M^k), con u uniforme: el termino
    # k = 0 es igual para todas las zonas y el k = 1 es la llegada en un paso
    # desde una zona al azar. La diferencia entre dos zonas se separa en esas partes.
    uniform = [1.0 / n] * n
    one_step = step(uniform, M)
    i, j = index[zone], index[other]
    diff = pr[zone] - pr[other]
    diff_one = (1.0 - beta) * beta * (one_step[i] - one_step[j])
    diff_rest = diff - diff_one

    text = (
        f"{zone} sube del puesto {rank_vol[zone]} por volumen al {rank_pr[zone]} por PageRank "
        f"y supera a {other}, que tiene mas viajes ({volume[other]} contra {volume[zone]}). "
        f"La diferencia de PageRank entre las dos ({diff:+.5f}) se reparte en {diff_one:+.5f} "
        "por llegadas en un paso desde una zona elegida al azar (el reinicio del salto "
        f"aleatorio) y {diff_rest:+.5f} por caminatas mas largas."
    )
    if spread < SPREAD_LIMIT:
        text += (
            f" Las filas de M difieren en a lo sumo {spread:.3f}, asi que el cambio ocurre "
            "entre zonas de volumen casi igual y no refleja una estructura espacial."
        )
    return text


if __name__ == "__main__":
    for path in (EDGES_CSV, RIDES_CSV):
        if not os.path.exists(path):
            raise SystemExit(f"Falta {os.path.basename(path)}: corre primero python run_all.py w3")

    edges = read_edges(EDGES_CSV)
    volume = read_ride_volume(RIDES_CSV)
    zones = sorted({z for pair in edges for z in pair} | set(volume))
    for z in zones:
        volume.setdefault(z, 0)

    M = transition_matrix(zones, edges)
    v, iterations = pagerank(M, BETA)
    pr = dict(zip(zones, v))
    pi_values, _ = pagerank(M, 1.0)          # sin salto: distribucion estacionaria
    pi = dict(zip(zones, pi_values))

    rank_pr = ranks(pr)
    rank_vol = ranks(volume)
    total_rides = sum(volume.values())

    resultado = {
        "beta": BETA,
        "iterations": iterations,
        "zones": [
            {
                "zone": z,
                "pagerank": round(pr[z], 6),
                "pagerank_rank": rank_pr[z],
                "ride_volume": volume[z],
                "volume_rank": rank_vol[z],
                "volume_share": round(volume[z] / total_rides, 6),
                "pi": round(pi[z], 6),
            }
            for z in sorted(zones, key=lambda z: rank_pr[z])
        ],
        "explanation": explain(zones, M, pr, pi, rank_pr, rank_vol, volume, BETA),
        "row_spread_max": round(row_spread(M), 6),
        "total_relocations": sum(edges.values()),
        "n_zones": len(zones),
    }
    with open(os.path.join(RESULTS_DIR, "task3.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Zonas: {len(zones)} | reubicaciones: {resultado['total_relocations']} | "
          f"beta = {BETA} | {iterations} iteraciones")
    print(f"{'zona':<12}{'PageRank':>10}{'puesto':>8}{'viajes':>9}{'puesto':>8}"
          f"{'% viajes':>10}{'pi':>9}")
    for z in resultado["zones"]:
        print(f"{z['zone']:<12}{z['pagerank']:>10.4f}{z['pagerank_rank']:>8}"
              f"{z['ride_volume']:>9}{z['volume_rank']:>8}"
              f"{100 * z['volume_share']:>10.2f}{z['pi']:>9.4f}")
    print(f"Diferencia maxima entre filas de M: {resultado['row_spread_max']:.4f}")
    print(resultado["explanation"])
    print("Resultados en results/w3/task3.json")
