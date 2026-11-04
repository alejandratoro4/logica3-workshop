"""
Workshop 4 - Task 5: eficiencia paralela (S13, escalamiento con claves balanceadas).

Mide el pipeline completo de la Task 1 (los jobs 1a, 1b y 2) con P = 1, 2, 4 y
8 workers, en dos tamanos de datos (1x y 2x), y reporta

    speedup     S_P = T_1 / T_P
    eficiencia  E_P = S_P / P

donde T_P es la suma de total_s de los tres jobs con P workers, sin el
arranque del pool (el runner lo deja aparte en Cluster.arranque_s).

Por que las claves estan balanceadas: en 1a la clave es driver_id y los 1.200
conductores se sortean al azar viaje por viaje, asi que cada uno tiene mas o
menos los mismos viajes (q = 482 contra una media de 413). Ninguna reduce task
queda con una clave gigante: si la eficiencia cae, no es por sesgo de claves
sino por lo que no se reparte entre procesos.

Lo que se mide es exactamente el mismo job para todos los P:
  - el mismo numero de reducers (REDUCERS = 8, el P mas alto), para que a P = 8
    ninguna reduce task quede sin worker. Con el valor por defecto (4), la
    mitad del pool esperaria en cada reduce y en el map de 1b;
  - las mismas funciones map, reduce y combiner de la Task 1, copiadas aqui
    porque las tasks no se importan entre si.

Cada medicion se repite REPETICIONES veces y se reporta la mediana, porque
los tiempos de una sola corrida tienen ruido del sistema operativo.

Donde se espera que caiga la eficiencia:
  1. Fases con pocas tareas. El map de 1a tiene una tarea por fragmento (8 a
     1x, 16 a 2x), pero el map de 1b tiene tantas tareas como reducers tuvo
     1a, y el Job 2 trabaja sobre 100 aristas: ahi casi no hay nada que
     repartir.
  2. El proceso principal es uno solo. Recibe los bytes de todas las map
     tasks y los reenvia a las reduce tasks; esa parte (shuffle_s y el
     reparto) no baja al sumar workers.
  3. Costo fijo por tarea. Mandar la funcion y el split a cada proceso y
     serializar las particiones (pickle) cuesta lo mismo con 1 que con 8
     workers. Con mas datos ese costo pesa menos, por eso la eficiencia tiende
     a mejorar a 2x.
  4. Nucleos de la maquina. Si P es mayor que os.cpu_count(), los procesos
     se turnan los nucleos y el speedup se aplana.

En el navegador no hay procesos (PARALELO = False): todo corre en secuencia,
el resultado es el mismo y el speedup no mide nada. Los numeros que se
exponen salen de la terminal.

Entrada: data/w4/part-*.csv (src/w4/dataset.py)
Salida:  results/w4/task5.json (claves del contrato, contratos/w4.md, Task 5)
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
import statistics
from mapreduce import PARALELO


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


WORKERS = [1, 2, 4, 8]
REDUCERS = 8                                  # el P mas alto: el mismo job para todos los P
SCALES = _env("W4_T5_SCALES", lambda v: [int(x) for x in v.split(",") if x.strip()], [1, 2])
# En el navegador los tiempos no sirven para speedup: una sola repeticion basta.
REPETICIONES = _env("W4_T5_REPS", int, 3 if PARALELO else 1)


# ---------------------------------------------------------------------------
# El pipeline de la Task 1 (map, reduce y combiner de nivel superior: cada
# proceso del pool los importa por nombre)
# ---------------------------------------------------------------------------
def map_viajes(fila):
    """1a: cada viaje va a su conductor, con lo necesario para la arista."""
    yield fila["driver_id"], (int(fila["stream_seq"]), fila["pickup_zone"],
                              float(fila["fare"]), float(fila["wait_for_driver_sec"]))


def reduce_conductor(driver, viajes):
    """1a: ordena los viajes del conductor y emite una reubicacion por par de
    viajes seguidos, con la tarifa y la espera del viaje de llegada."""
    viajes.sort()
    for (_, a, _, _), (_, b, tarifa, espera) in zip(viajes, viajes[1:]):
        yield (a, b), (1, tarifa, espera)


def map_identidad(par):
    """1b: la salida de 1a ya viene como (clave, valor)."""
    yield par[0], par[1]


def reduce_sumar(clave, valores):
    """1b (y su combiner): suma (n, suma_tarifa, suma_espera). Devuelve sumas,
    no medias, para que sirva de combiner."""
    n = st = sw = 0
    for a, b, c in valores:
        n += a
        st += b
        sw += c
    yield clave, (n, st, sw)


def map_arista(arista):
    """2: cada arista cuenta como salida de a y como llegada a b."""
    (a, b), (n, st, sw) = arista
    yield a, (n, 0, 0.0, 0.0)
    yield b, (0, n, st, sw)


def reduce_zona(zona, valores):
    """2: el resumen por zona, con las columnas de nodes.csv."""
    out_n = in_n = 0
    st = sw = 0.0
    for o, i, t, w in valores:
        out_n += o
        in_n += i
        st += t
        sw += w
    yield zona, {
        "zone_id": zona,
        "out_reloc_count": out_n,
        "in_reloc_count": in_n,
        "net_flow": in_n - out_n,
        "avg_fare": round(st / in_n, 2) if in_n else 0.0,
        "avg_wait_for_driver_sec": round(sw / in_n, 2) if in_n else 0.0,
    }


def pipeline(cluster, splits):
    """Corre 1a, 1b y 2 en el mismo pool. Devuelve los stats de los tres jobs
    y la salida del Job 2 (para comprobar que el resultado no cambia con P)."""
    r1a = cluster.ejecutar("1a", splits, map_viajes, reduce_conductor, reducers=REDUCERS)
    r1b = cluster.ejecutar("1b", r1a.por_reducer, map_identidad, reduce_sumar,
                           combiner=reduce_sumar, reducers=REDUCERS)
    r2 = cluster.ejecutar("2", dividir(r1b.salida, REDUCERS), map_arista, reduce_zona,
                          reducers=REDUCERS)
    return [r1a.stats, r1b.stats, r2.stats], r2.salida


def medir(escala, workers):
    """Mediana de REPETICIONES corridas del pipeline con `workers` procesos."""
    splits = fragmentos(escala)
    tiempos, fases, salida, entrada = [], [], None, 0
    with Cluster(workers=workers) as c:
        for _ in range(REPETICIONES):
            stats, salida = pipeline(c, splits)
            entrada = stats[0]["input_records"]
            tiempos.append(sum(s["total_s"] for s in stats))
            fases.append({k: sum(s[k] for s in stats) for k in ("map_s", "shuffle_s", "reduce_s")})
    # La repeticion mediana completa (tiempo y fases de la misma corrida).
    orden = sorted(range(len(tiempos)), key=tiempos.__getitem__)
    m = orden[len(orden) // 2]
    return {
        "input_records": entrada,
        "time_s": statistics.median(tiempos),
        "phases": fases[m],
        "salida": salida,
        "all_times": tiempos,
    }


if __name__ == "__main__":
    print(f"Task 5 (W4): P = {WORKERS}, escalas {SCALES}, reducers = {REDUCERS}, "
          f"{REPETICIONES} repeticiones (mediana) | paralelo: {PARALELO} | nucleos: {os.cpu_count()}")
    if not PARALELO:
        print("Sin procesos en esta maquina: todo corre en secuencia y el speedup no mide nada.")

    runs = []
    mismo_resultado = True
    for escala in SCALES:
        base = None
        referencia = None
        for p in WORKERS:
            m = medir(escala, p)
            if referencia is None:
                referencia = m["salida"]
            elif m["salida"] != referencia:
                mismo_resultado = False
            if base is None:
                base = m["time_s"]
            speedup = base / m["time_s"] if m["time_s"] > 0 else 0.0
            runs.append({
                "scale": escala,
                "input_records": m["input_records"],
                "workers": p,
                "time_s": round(m["time_s"], 4),
                "speedup": round(speedup, 4),
                "efficiency": round(speedup / p, 4),
                "map_s": round(m["phases"]["map_s"], 4),
                "shuffle_s": round(m["phases"]["shuffle_s"], 4),
                "reduce_s": round(m["phases"]["reduce_s"], 4),
                "repetitions_s": [round(t, 4) for t in m["all_times"]],
            })
            r = runs[-1]
            print(f"  {escala}x  P={p}  T={r['time_s']:7.3f} s  S={r['speedup']:5.2f}  E={r['efficiency']:5.2f}"
                  f"   (map {r['map_s']:.3f}  shuffle {r['shuffle_s']:.3f}  reduce {r['reduce_s']:.3f})")

    print(f"El resultado del Job 2 es identico para todos los P: {mismo_resultado}")

    # Sanidad: a 1x el Job 2 debe dar exactamente data/nodes.csv.
    nodes_match = None
    if 1 in SCALES and os.path.exists(NODES_CSV):
        with Cluster(workers=1) as c:
            _, salida = pipeline(c, fragmentos(1))
        mr = {z: v for z, v in salida}
        with open(NODES_CSV, newline="", encoding="utf-8") as f:
            ref = {r["zone_id"]: r for r in csv.DictReader(f)}
        nodes_match = set(mr) == set(ref) and all(
            mr[z]["out_reloc_count"] == int(ref[z]["out_reloc_count"])
            and mr[z]["in_reloc_count"] == int(ref[z]["in_reloc_count"])
            and abs(mr[z]["avg_fare"] - float(ref[z]["avg_fare"])) <= 0.01
            and abs(mr[z]["avg_wait_for_driver_sec"] - float(ref[z]["avg_wait_for_driver_sec"])) <= 0.01
            for z in ref)
        print(f"El Job 2 a 1x coincide con data/nodes.csv: {nodes_match}")

    resultado = {
        "task": "W4 Task 5 - Eficiencia paralela",
        "parallel": PARALELO,
        "cpu_count": os.cpu_count() or 1,
        "runs": runs,
        # Extras: el panel los ignora; sirven para leer el JSON solo.
        "reducers": REDUCERS,
        "repetitions": REPETICIONES,
        "same_output_all_P": mismo_resultado,
        "nodes_match_1x": nodes_match,
    }
    with open(os.path.join(RESULTS_DIR, "task5.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    print(f"Resultados guardados en {os.path.join(RESULTS_DIR, 'task5.json')}")
