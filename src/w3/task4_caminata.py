"""
Workshop 3 - Task 4: caminata aleatoria sobre el grafo simetrizado.

Lee data/edges.csv y simetriza el grafo como multigrafo: cada reubicacion es
una arista no dirigida entre sus dos zonas, asi que |E| es el total de
reubicaciones y el grado d_i cuenta las aristas que tocan la zona i (un lazo
i -> i suma 2). La caminata elige en cada paso, con igual probabilidad, uno
de los d_i extremos de arista de la zona actual. Se comparan las visitas con
pi_i = d_i / (2|E|).

Referencia: Clase 16 (Random Walk), ecuaciones 1 y 2.

Entrada: data/edges.csv
Salida:  results/w3/task4.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import bisect
import csv
import json
import random

SEED = int(os.environ.get("RIDES_SEED") or 42)
STEPS = 100000
CHECK_EVERY = 1000      # cada cuantos pasos se mide la distancia a la teoria


def read_edges(csv_path):
    """{(from_zone, to_zone): reloc_count}."""
    edges = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (row["from_zone"], row["to_zone"])
            edges[key] = edges.get(key, 0) + int(row["reloc_count"])
    return edges


def symmetrize(zones, edges):
    """Pesos del multigrafo no dirigido: W[i][j] = extremos de arista en i que
    llevan a j. Para i != j son las reubicaciones en los dos sentidos; un lazo
    aporta sus dos extremos a W[i][i]. La fila i suma el grado d_i."""
    index = {z: k for k, z in enumerate(zones)}
    n = len(zones)
    W = [[0] * n for _ in range(n)]
    for (a, b), count in edges.items():
        i, j = index[a], index[b]
        if i == j:
            W[i][i] += 2 * count
        else:
            W[i][j] += count
            W[j][i] += count
    return W


def random_walk(W, steps, rng, pi_theory=None, check_every=0):
    """Caminata de `steps` pasos. En la zona i pasa a j con probabilidad
    W[i][j] / d_i. Devuelve (visitas por zona, convergencia)."""
    n = len(W)
    cumulative = []
    for row in W:
        acc, total = [], 0
        for w in row:
            total += w
            acc.append(total)
        cumulative.append(acc)

    current = rng.randrange(n)
    visits = [0] * n
    convergence = []
    for step in range(1, steps + 1):
        acc = cumulative[current]
        current = bisect.bisect_right(acc, rng.random() * acc[-1])
        visits[current] += 1
        if check_every and pi_theory and step % check_every == 0:
            tv = 0.5 * sum(abs(visits[i] / step - pi_theory[i]) for i in range(n))
            convergence.append({"step": step, "tv_distance": round(tv, 6)})
    return visits, convergence


def stationarity_residual(W, pi):
    """Mayor |(pi M)_j - pi_j| con M[i][j] = W[i][j] / d_i. Si pi es la
    distribucion estacionaria, da 0 salvo redondeo."""
    n = len(W)
    degree = [sum(row) for row in W]
    return max(abs(sum(pi[i] * W[i][j] / degree[i] for i in range(n)) - pi[j]) for j in range(n))


def is_connected(W):
    """Recorrido desde la zona 0 por aristas de peso positivo."""
    n = len(W)
    seen, stack = {0}, [0]
    while stack:
        i = stack.pop()
        for j in range(n):
            if W[i][j] > 0 and j not in seen:
                seen.add(j)
                stack.append(j)
    return len(seen) == n


if __name__ == "__main__":
    if not os.path.exists(EDGES_CSV):
        raise SystemExit("Falta data/edges.csv: corre primero python run_all.py w3")

    edges = read_edges(EDGES_CSV)
    zones = sorted({z for pair in edges for z in pair})
    W = symmetrize(zones, edges)
    n_edges = sum(edges.values())
    degree = [sum(row) for row in W]
    assert sum(degree) == 2 * n_edges
    pi_theory = [d / (2 * n_edges) for d in degree]

    visits, convergence = random_walk(W, STEPS, random.Random(SEED), pi_theory, CHECK_EVERY)
    pi_empirical = [v / STEPS for v in visits]
    tv_final = 0.5 * sum(abs(pi_empirical[i] - pi_theory[i]) for i in range(len(zones)))
    max_diff = max(abs(pi_empirical[i] - pi_theory[i]) for i in range(len(zones)))

    resultado = {
        "steps": STEPS,
        "n_edges": n_edges,
        "zones": [
            {
                "zone": z,
                "degree": degree[i],
                "pi_theory": round(pi_theory[i], 6),
                "pi_empirical": round(pi_empirical[i], 6),
                "visits": visits[i],
                "self_loops": edges.get((z, z), 0),
            }
            for i, z in enumerate(zones)
        ],
        "convergence": convergence,
        "graph": "multigrafo: una arista no dirigida por reubicacion; un lazo suma 2 al grado",
        "tv_distance_final": round(tv_final, 6),
        "max_abs_difference": round(max_diff, 6),
        "stationarity_residual": stationarity_residual(W, pi_theory),
        "connected": is_connected(W),
        "has_self_loops": any(W[i][i] > 0 for i in range(len(zones))),
    }
    with open(os.path.join(RESULTS_DIR, "task4.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Zonas: {len(zones)} | |E| = {n_edges} | suma de grados = {sum(degree)} = 2|E| | pasos: {STEPS}")
    print(f"{'zona':<12}{'grado':>9}{'d/2|E|':>9}{'visitas':>9}{'empirica':>10}{'diferencia':>12}")
    for i, z in enumerate(zones):
        print(f"{z:<12}{degree[i]:>9}{pi_theory[i]:>9.4f}{visits[i]:>9}{pi_empirical[i]:>10.4f}"
              f"{pi_empirical[i] - pi_theory[i]:>+12.4f}")
    print(f"Distancia de variacion total: {tv_final:.4f} | mayor diferencia: {max_diff:.4f}")
    print(f"Residuo de pi = pi M con la pi teorica: {resultado['stationarity_residual']:.1e}")
    print(f"Grafo conexo: {resultado['connected']} | con lazos (aperiodico): {resultado['has_self_loops']}")
    print("Resultados en results/w3/task4.json")
