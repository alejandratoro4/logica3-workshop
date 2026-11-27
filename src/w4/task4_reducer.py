"""
Workshop 4 - Task 4: Tamano de reducer y tasa de replicacion.

La idea en palabras sencillas:
  Dos numeros del curso (Clase 20, MMDS cap. 2) describen el costo de un job:
    r  (tasa de replicacion) = cuantos pares emite el map por cada registro
       de entrada: map_output_pairs / input_records.
    q  (tamano de reducer)   = cuantos valores recibe la clave mas cargada.
       Una clave entera va a un solo reducer, asi que ningun reducer puede
       tener menos trabajo que q.

  r dice cuanto viaja por el shuffle; q, cuanta memoria y tiempo necesita el
  reducer mas cargado. Los jobs se corren SIN combiner: el combiner cambia lo
  que llega a los reducers (en 1b, q bajaria al numero de map tasks) y
  esconderia el q natural del algoritmo.

  Los jobs (los mismos de la Task 1):
    1a        map: (driver_id, (stream_seq, zona)) por viaje -> r = 1.
              reduce: ordena los viajes del conductor y emite un
              ((zona_i, zona_siguiente), 1) por reubicacion.
              La clave caliente es el conductor con mas viajes: q = sus viajes.
    1b        map identidad sobre las reubicaciones -> r = 1.
              q = el reloc_count del par de zonas mas frecuente.
    2         una arista (a, b, n) emite dos pares, uno para a (sale) y otro
              para b (llega) -> r = 2. Cada zona recibe 10 aristas que salen y
              10 que llegan: q = 20 y las 10 zonas empatan.
    pagerank  una ronda del producto matriz-vector de la Task 2: una entrada
              de la matriz emite un aporte a su columna -> r = 1, q = 10.
              Sin teletransporte: no cambia lo que emite el map ni lo que
              recibe cada clave, asi que no cambia r ni q.

  Despues se corre la ronda 1a con R = 1, 2, 4 y 8 reduce tasks. Con R
  reducers la carga maxima no puede bajar de N / R (reparto perfecto) ni de q
  (la clave caliente no se parte). Aqui q = 482 es mucho menor que N / 8, asi
  que lo que limita es el reparto del hash, no la clave caliente.

Entrada: data/w4/part-*.csv
Salida:  results/w4/task4.json (claves del contrato, contratos/w4.md, Task 4)
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w4")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapreduce import Cluster, fragmentos, dividir, leer

import json
from collections import Counter

WORKERS = 4
REDUCERS = 4                 # reduce tasks de las filas de `jobs` (q no depende de R)
SWEEP = [1, 2, 4, 8]         # R del barrido de la ronda 1a


# ---------------------------------------------------------------------------
# Job 1 (las funciones van arriba del archivo: cada proceso las busca por nombre)
# ---------------------------------------------------------------------------
def map_viajes(fila):
    """1a: cada viaje va a su conductor. Un par por registro: r = 1."""
    yield fila["driver_id"], (int(fila["stream_seq"]), fila["pickup_zone"])


def reduce_conductor(conductor, viajes):
    """1a: ordena los viajes del conductor y emite un 1 por reubicacion."""
    viajes.sort()
    for (_, zona_a), (_, zona_b) in zip(viajes, viajes[1:]):
        yield (zona_a, zona_b), 1


def map_identidad(par):
    """1b: la salida de 1a ya es (clave, valor)."""
    yield par


def reduce_contar(par_zonas, unos):
    """1b: reloc_count del par de zonas."""
    yield par_zonas, sum(unos)


# ---------------------------------------------------------------------------
# Job 2: resumen por zona
# ---------------------------------------------------------------------------
def map_aristas(arista):
    """Una arista aporta a dos zonas: r = 2."""
    (a, b), n = arista
    yield a, (n, 0)          # salen de a
    yield b, (0, n)          # llegan a b


def reduce_zona(zona, valores):
    salen = sum(v[0] for v in valores)
    llegan = sum(v[1] for v in valores)
    yield zona, (salen, llegan, llegan - salen)


# ---------------------------------------------------------------------------
# Una ronda de PageRank (S10)
# ---------------------------------------------------------------------------
def map_pagerank(entrada):
    """Una entrada (i, j, p_ij, v_i) aporta p_ij * v_i a la zona j."""
    i, j, p, v_i = entrada
    yield j, p * v_i


def reduce_pagerank(zona, aportes):
    yield zona, sum(aportes)


# ---------------------------------------------------------------------------
# Ayudas
# ---------------------------------------------------------------------------
def fila_job(stats):
    """La fila de `jobs`: r y q salen de las cifras que mide el runner."""
    entrada = stats["input_records"]
    return {
        "job": stats["job"],
        "input_records": entrada,
        "map_output_pairs": stats["map_output_pairs"],
        "replication_rate": round(stats["map_output_pairs"] / entrada, 6) if entrada else 0.0,
        "reducer_size_q": stats["max_key_values"],
        "hot_key": stats["hot_key"],
        "hot_key_ties": stats["hot_key_ties"],
    }


def matriz_pagerank(aristas):
    """Las entradas (i, j, p_ij, v_i) de la primera ronda: p_ij = n(i->j) /
    lo que sale de i, y v uniforme."""
    sale = Counter()
    for (a, _), n in aristas:
        sale[a] += n
    zonas = sorted({z for (a, b), _ in aristas for z in (a, b)})
    v0 = 1.0 / len(zonas)
    return [(a, b, n / sale[a], v0) for (a, b), n in aristas if sale[a]]


if __name__ == "__main__":
    print(f"Task 4 (W4): {WORKERS} workers, jobs sin combiner con R = {REDUCERS}, barrido R = {SWEEP}")
    splits = fragmentos()

    with Cluster(workers=WORKERS) as c:
        # 1. r y q de cada job, sin combiner.
        r1a = c.ejecutar("1a", splits, map_viajes, reduce_conductor, reducers=REDUCERS)
        r1b = c.ejecutar("1b", r1a.por_reducer, map_identidad, reduce_contar, reducers=REDUCERS)
        r2 = c.ejecutar("2", dividir(r1b.salida, REDUCERS), map_aristas, reduce_zona, reducers=REDUCERS)
        rpr = c.ejecutar("pagerank", dividir(matriz_pagerank(r1b.salida), REDUCERS),
                         map_pagerank, reduce_pagerank, reducers=REDUCERS)
        jobs = [fila_job(r.stats) for r in (r1a, r1b, r2, rpr)]

        # 2. La ronda 1a con R = 1, 2, 4, 8.
        barrido = []
        for R in SWEEP:
            s = c.ejecutar("1a", splits, map_viajes, reduce_conductor, reducers=R).stats
            cargas = s["reducer_loads"]
            barrido.append({
                "reduce_tasks": R,
                "reducer_loads": cargas,
                "max_reducer_load": max(cargas),
                "mean_reducer_load": round(sum(cargas) / R, 3),
                "total_s": s["total_s"],
            })

    # La clave caliente de 1a es el conductor con mas viajes. Se comprueba
    # contando los viajes directamente, sin MapReduce.
    viajes = Counter(fila["driver_id"] for split in splits for fila in leer(split))
    q1a = max(viajes.values())
    hot = min(d for d, n in viajes.items() if n == q1a)
    if (hot, q1a) != (r1a.stats["hot_key"], r1a.stats["max_key_values"]):
        raise SystemExit(f"La clave caliente de 1a no coincide con el conteo directo: {hot} {q1a}")

    # 1b sin combiner: q es el mayor reloc_count.
    if r1b.stats["max_key_values"] != max(n for _, n in r1b.salida):
        raise SystemExit("q de 1b no es el mayor reloc_count")

    # Cotas del barrido: todos los pares llegan a algun reducer, y ninguno
    # puede tener menos que N/R ni menos que q.
    N = r1a.stats["shuffle_pairs"]
    for b in barrido:
        if sum(b["reducer_loads"]) != N:
            raise SystemExit(f"R = {b['reduce_tasks']}: las cargas no suman {N}")
        if b["max_reducer_load"] < max(-(-N // b["reduce_tasks"]), q1a):
            raise SystemExit(f"R = {b['reduce_tasks']}: carga maxima por debajo de la cota")

    resultado = {
        "hot_driver": {"driver_id": hot, "rides": q1a},
        "workers": WORKERS,
        "reducers": REDUCERS,
        "jobs": jobs,
        "reducer_sweep": barrido,
    }
    with open(os.path.join(RESULTS_DIR, "task4.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"  Conductor con mas viajes: {hot} ({q1a} viajes)")
    for j in jobs:
        empate = f" (empate entre {j['hot_key_ties']})" if j["hot_key_ties"] > 1 else ""
        print(f"  job {j['job']:<8} entran {j['input_records']:>8,}  emite {j['map_output_pairs']:>8,}  "
              f"r = {j['replication_rate']:.3f}  q = {j['reducer_size_q']:>6,}  clave {j['hot_key']}{empate}")
    for b in barrido:
        print(f"  1a con R = {b['reduce_tasks']}: max {b['max_reducer_load']:>7,}  media "
              f"{b['mean_reducer_load']:>11,.1f}  max/media {b['max_reducer_load'] / b['mean_reducer_load']:.3f}  "
              f"{b['total_s']:.2f} s")
    print("Resultados guardados en results/w4/task4.json")
