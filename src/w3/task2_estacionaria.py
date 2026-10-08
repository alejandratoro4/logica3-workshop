import os
import csv
import json
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")


def leer_edges():
    """{ (from, to): reloc_count } a partir de edges.csv."""
    aristas = defaultdict(int)
    with open(EDGES_CSV, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            aristas[(fila["from_zone"], fila["to_zone"])] += int(fila["reloc_count"])
    return aristas


def leer_ride_counts():
    """Conteo de viajes por zona desde rides.csv (Unidad 1)."""
    conteos = defaultdict(int)
    with open(RIDES_CSV, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            conteos[fila["pickup_zone"]] += 1
    return conteos


def construir_M(aristas):
    """Estados ordenados y M[i][j] = reloc_count(i -> j) / total que sale de i."""
    estados = sorted({z for (a, b) in aristas for z in (a, b)})
    idx = {z: i for i, z in enumerate(estados)}
    n = len(estados)
    M = [[0.0] * n for _ in range(n)]
    salidas = [0.0] * n
    for (a, b), c in aristas.items():
        salidas[idx[a]] += c
    for (a, b), c in aristas.items():
        if salidas[idx[a]] > 0:          # evita división por cero si hay zona sin salidas
            M[idx[a]][idx[b]] = c / salidas[idx[a]]
    return estados, M


def potencia(M, tol=1e-12, max_iter=10000):
    """Método de potencias: pi = pi M, desde la distribución uniforme."""
    n = len(M)
    pi = [1.0 / n] * n
    iteraciones = 0
    for it in range(1, max_iter + 1):
        pi_nuevo = [sum(pi[i] * M[i][j] for i in range(n)) for j in range(n)]
        delta = max(abs(pi_nuevo[j] - pi[j]) for j in range(n))
        pi = pi_nuevo
        iteraciones = it
        if delta < tol:
            break
    return pi, iteraciones


if __name__ == "__main__":
    aristas = leer_edges()
    estados, M = construir_M(aristas)
    pi, iteraciones = potencia(M)

    ride_counts = leer_ride_counts()
    zonas = [
        {
            "zone": z,
            "pi": round(pi[i], 6),
            "ride_count": ride_counts.get(z, 0),
        }
        for i, z in enumerate(estados)
    ]

    resultado = {
        "method": "potencias",
        "iterations": iteraciones,
        "zones": zonas,
    }

    out = os.path.join(RESULTS_DIR, "task2.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"OK  metodo: potencias, {iteraciones} iteraciones, {len(estados)} zonas")
    for z in zonas:
        print(f"    {z['zone']}:  pi={z['pi']:.6f}  |  rides={z['ride_count']}")
