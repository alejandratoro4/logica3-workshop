"""
Workshop 4 - Task 3: Analisis de costo (cuanto viaja por el shuffle).

La idea en palabras sencillas:
  En MapReduce, el "shuffle" es el paso en el que los pares que sacan los map
  viajan por la red hasta los reducers. Es lo que mas cuesta, asi que aqui lo
  medimos: cuantos pares y cuantos bytes viajan.

  El Job 1 tiene dos rondas:
    1a  agrupa los viajes por conductor y saca un par ((zona_i, zona_siguiente), 1)
        por cada reubicacion.
    1b  suma esos unos por par de zonas: asi sale reloc_count.

  Un combiner es un "mini reduce" que corre en cada map antes de mandar los
  datos. En 1b sirve muchisimo: si un map tiene 5.000 veces el par
  (AIRPORT, BELEN) con un 1, el combiner los suma y manda un solo par con 5.000.
  En 1a no sirve: el reducer necesita CADA viaje del conductor, uno por uno,
  para ordenarlos; no hay nada que sumar.

Lo que hace este script:
  1. Corre 1a y 1b con 1x, 2x y 4x datos, la ronda 1b con y sin combiner.
  2. Revisa que el shuffle crezca en linea recta con los datos (ajuste lineal
     y R^2) y estima cuanto seria con 10x datos.
  3. Calcula el costo de PageRank (S10): pares por iteracion x iteraciones,
     corriendo las rondas de PageRank con el mismo runner.

Referencia: Clases 18 a 21 (MapReduce, combiner, costo de comunicacion).

Entrada: data/w4/part-*.csv, data/edges.csv
Salida:  results/w4/task3.json (claves del contrato, contratos/w4.md, Task 3)
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

SCALES = [1, 2, 4]       # 1x, 2x y 4x datos
TARGET_SCALE = 10        # a donde extrapolamos
WORKERS = 2
REDUCERS = 4             # reduce tasks de cada ronda (el valor por defecto del runner)
BETA = 0.85              # PageRank, igual que la Task 2
TOL = 1e-6


# ---------------------------------------------------------------------------
# Job 1 (las funciones van arriba del archivo: cada proceso las busca por nombre)
# ---------------------------------------------------------------------------
def map_viajes(fila):
    """1a: cada viaje va a su conductor, con su posicion en el stream y su zona."""
    yield fila["driver_id"], (int(fila["stream_seq"]), fila["pickup_zone"])


def reduce_conductor(conductor, viajes):
    """1a: ordena los viajes del conductor y saca un 1 por cada par de viajes seguidos."""
    viajes.sort()
    for (_, zona_a), (_, zona_b) in zip(viajes, viajes[1:]):
        yield (zona_a, zona_b), 1


def map_identidad(par):
    """1b: la salida de 1a ya viene como (clave, valor); se pasa tal cual."""
    yield par[0], par[1]


def reduce_contar(par_zonas, unos):
    """1b: suma los unos de un par de zonas. Tambien sirve de combiner,
    porque sumar sumas parciales da lo mismo que sumar todo junto."""
    yield par_zonas, sum(unos)


# ---------------------------------------------------------------------------
# PageRank como producto matriz-vector (S10)
# ---------------------------------------------------------------------------
def map_pagerank(entrada):
    """Una entrada de la matriz (i, j, p_ij, v_i) aporta p_ij * v_i a la zona j."""
    i, j, p, v_i = entrada
    yield j, p * v_i


def reduce_pagerank(zona, aportes):
    """Suma lo que le llega a cada zona."""
    yield zona, sum(aportes)


# ---------------------------------------------------------------------------
# Ayudas
# ---------------------------------------------------------------------------
def ajuste_lineal(xs, ys):
    """Recta y = a + b x por minimos cuadrados. Devuelve (a, b, r2).
    Si todos los y son iguales (serie constante), r2 = 1.0: la recta
    horizontal explica todo, y asi nunca sale NaN."""
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 if ss_tot == 0 else 1 - ss_res / ss_tot
    return a, b, r2


def fila_run(escala, stats, combiner):
    """Lo que guardamos de cada corrida."""
    return {
        "scale": escala,
        "job": stats["job"],
        "combiner": combiner,
        "input_records": stats["input_records"],
        "map_tasks": stats["map_tasks"],
        "map_output_pairs": stats["map_output_pairs"],
        "shuffle_pairs": stats["shuffle_pairs"],
        "shuffle_bytes": stats["shuffle_bytes"],
        "total_s": stats["total_s"],
    }


def leer_matriz(ruta):
    """Las zonas y las entradas (i, j, p_ij) de la matriz por filas:
    p_ij = reloc_count(i -> j) / total que sale de i."""
    aristas = []
    with open(ruta, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            aristas.append((fila["from_zone"], fila["to_zone"], int(fila["reloc_count"])))
    sale = {}
    for a, b, n in aristas:
        sale[a] = sale.get(a, 0) + n
    zonas = sorted(set(a for a, _, _ in aristas) | set(b for _, b, _ in aristas))
    entradas = [(a, b, n / sale[a]) for a, b, n in aristas if sale[a] > 0]
    return zonas, entradas


def pagerank_con_mapreduce(cluster, zonas, entradas):
    """Itera rondas de MapReduce hasta que el cambio sea menor que TOL.
    Devuelve el vector final y los pares que mando el map en cada ronda."""
    n = len(zonas)
    v = {z: 1.0 / n for z in zonas}
    pares_por_ronda = []
    for _ in range(1000):
        registros = [(i, j, p, v[i]) for i, j, p in entradas]
        r = cluster.ejecutar("pagerank", dividir(registros, REDUCERS), map_pagerank, reduce_pagerank,
                             reducers=REDUCERS)
        pares_por_ronda.append(r.stats["map_output_pairs"])
        suma = dict(r.salida)
        nuevo = {z: BETA * suma.get(z, 0.0) + (1 - BETA) / n for z in zonas}
        cambio = sum(abs(nuevo[z] - v[z]) for z in zonas)
        v = nuevo
        if cambio < TOL:
            break
    return v, pares_por_ronda


def explicacion_combiner(runs):
    """El texto de combiner_explanation, con los numeros de esta corrida."""
    def buscar(escala, job, combiner):
        return next(r for r in runs if r["scale"] == escala and r["job"] == job and r["combiner"] == combiner)

    e = SCALES[0]
    sin = buscar(e, "1b", False)
    con = buscar(e, "1b", True)
    ahorro = 100 * (1 - con["shuffle_pairs"] / sin["shuffle_pairs"]) if sin["shuffle_pairs"] else 0.0
    ultima = buscar(SCALES[-1], "1b", True)
    return (
        f"En 1b cada map task recibe miles de copias del mismo par de zonas, cada una con un 1. "
        f"El combiner las suma ahi mismo y manda un solo par por cada par de zonas, asi que a {e}x el "
        f"shuffle de 1b baja de {sin['shuffle_pairs']:,} pares a {con['shuffle_pairs']:,} "
        f"({ahorro:.2f} % menos). Ese numero no crece con los datos (a {SCALES[-1]}x sigue en "
        f"{ultima['shuffle_pairs']:,}): es como maximo map tasks x pares de zonas. "
        "En 1a no hay nada que sumar: la clave es el conductor y el reducer necesita cada viaje por "
        "separado para ordenarlos por stream_seq y ver de que zona a que zona se movio. Un combiner "
        "solo podria juntar los viajes en una lista, y la lista pesa lo mismo. Ademas, los viajes de un "
        "conductor estan repartidos en varios fragmentos: si cada map sacara sus reubicaciones por su "
        "cuenta, se perderian las que cruzan de un fragmento a otro."
    )


if __name__ == "__main__":
    print(f"Task 3 (W4): escalas {SCALES}, {WORKERS} workers, {REDUCERS} reducers")
    runs = []

    with Cluster(workers=WORKERS) as c:
        # 1. El Job 1 a 1x, 2x y 4x, con y sin combiner en 1b.
        for escala in SCALES:
            r1a = c.ejecutar("1a", fragmentos(escala), map_viajes, reduce_conductor, reducers=REDUCERS)
            r1b_sin = c.ejecutar("1b", r1a.por_reducer, map_identidad, reduce_contar, reducers=REDUCERS)
            r1b_con = c.ejecutar("1b", r1a.por_reducer, map_identidad, reduce_contar,
                                 combiner=reduce_contar, reducers=REDUCERS)
            if r1b_sin.salida != r1b_con.salida:
                raise SystemExit("El combiner cambio el resultado: no deberia pasar")

            runs.append(fila_run(escala, r1a.stats, False))
            runs.append(fila_run(escala, r1b_sin.stats, False))
            runs.append(fila_run(escala, r1b_con.stats, True))
            print(f"  {escala}x: 1a {r1a.stats['shuffle_pairs']:>9,} pares | "
                  f"1b sin combiner {r1b_sin.stats['shuffle_pairs']:>9,} | "
                  f"1b con combiner {r1b_con.stats['shuffle_pairs']:>4,}")

        # 3. PageRank (S10): pares por iteracion x iteraciones.
        zonas, entradas = leer_matriz(EDGES_CSV)
        _, pares_por_ronda = pagerank_con_mapreduce(c, zonas, entradas)

    # 2. Linea recta por los puntos medidos y estimacion a 10x.
    extrapolacion = []
    for job, combiner in [("1a", False), ("1b", False), ("1b", True)]:
        filas = [r for r in runs if r["job"] == job and r["combiner"] == combiner]
        xs = [r["scale"] for r in filas]
        a_p, b_p, r2 = ajuste_lineal(xs, [r["shuffle_pairs"] for r in filas])
        a_b, b_b, _ = ajuste_lineal(xs, [r["shuffle_bytes"] for r in filas])
        extrapolacion.append({
            "job": job,
            "combiner": combiner,
            "shuffle_pairs": round(a_p + b_p * TARGET_SCALE),
            "shuffle_bytes": round(a_b + b_b * TARGET_SCALE),
            "linear_r2": round(r2, 6),
            "pairs_per_1x": round(b_p, 1),
        })
        print(f"  10x {job} {'con' if combiner else 'sin'} combiner: "
              f"{round(a_p + b_p * TARGET_SCALE):,} pares (R^2 = {r2:.6f})")

    pagerank = {
        "pairs_per_iteration": pares_por_ronda[0],
        "iterations": len(pares_por_ronda),
        "total_pairs": sum(pares_por_ronda),
    }
    print(f"  PageRank: {pagerank['pairs_per_iteration']} pares x {pagerank['iterations']} "
          f"iteraciones = {pagerank['total_pairs']} pares")

    resultado = {
        "scales": SCALES,
        "workers": WORKERS,
        "reducers": REDUCERS,
        "runs": runs,
        "extrapolation_10x": extrapolacion,
        "pagerank_cost": pagerank,
        "combiner_explanation": explicacion_combiner(runs),
    }
    with open(os.path.join(RESULTS_DIR, "task3.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    print("Resultados guardados en results/w4/task3.json")
