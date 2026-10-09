"""
Workshop 2 - Task 4: conteo de distintos con Flajolet-Martin.

Lee data/stream.csv fila por fila, en orden de stream_seq, y estima cuantos
rider_id distintos han aparecido. Cada funcion hash guarda solo R, la cola de
ceros mas larga vista en la representacion binaria de h(rider_id); su
estimacion es 2^R. Se usan N_HASHES funciones y se combinan con la mediana.
El conteo verdadero se lleva aparte con un conjunto, solo para comparar.

Referencia: Clase 10 (Data Streams: Counting), Algoritmo 2 (FMA).

Entrada: data/stream.csv
Salida:  results/w2/task4.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

import csv
import hashlib
import json
import math
import random
import statistics

SEED = int(os.environ.get("RIDES_SEED") or 42)
N_HASHES = 16
PRIME_P = 2 ** 61 - 1       # los valores de hash tienen 61 bits: muchos mas que pasajeros


def key_to_int(rider_id):
    """Convierte el rider_id en un entero en [0, p). Conversion fija: blake2b
    da el mismo valor en cada corrida, a diferencia de hash()."""
    digest = hashlib.blake2b(rider_id.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % PRIME_P


def tail_length(h):
    """R(h): numero de ceros al final de la representacion binaria de h.
    El valor 0 no tiene un 1 que delimite la cola y no se cuenta."""
    if h == 0:
        return 0
    return (h & -h).bit_length() - 1


def make_hashes(n, rng):
    """n funciones h(x) = (a*x + b) mod p, con a y b elegidos al azar."""
    return [(rng.randint(1, PRIME_P - 1), rng.randint(0, PRIME_P - 1)) for _ in range(n)]


def combine(max_tails):
    """Estimacion combinada: mediana de los 2^R de todas las funciones."""
    return statistics.median(2 ** r for r in max_tails)


def process_stream(csv_path, hashes):
    """Una pasada por el stream. Devuelve (R por funcion, distintos reales,
    eventos, serie por hora).

    El resumen que se mantiene es la lista max_tails: un entero por funcion.
    El conjunto `seen` es el conteo exacto de referencia."""
    max_tails = [0] * len(hashes)
    seen = set()
    running = []
    n_events = 0
    last_seq = 0
    hour = None
    last_ts = None

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seq = int(row["stream_seq"])
            if seq <= last_seq:
                raise SystemExit("stream.csv no esta en orden de stream_seq")
            last_seq = seq
            ts = row["timestamp"]

            # foto del estado al cerrar cada hora del stream
            if hour is not None and ts[:13] != hour:
                running.append({"timestamp": last_ts, "true_distinct": len(seen),
                                "estimate": combine(max_tails)})
            hour = ts[:13]
            last_ts = ts
            n_events += 1

            rider = row["rider_id"]
            seen.add(rider)
            x = key_to_int(rider)
            for k, (a, b) in enumerate(hashes):
                r = tail_length((a * x + b) % PRIME_P)
                if r > max_tails[k]:
                    max_tails[k] = r

    if n_events:
        running.append({"timestamp": last_ts, "true_distinct": len(seen),
                        "estimate": combine(max_tails)})
    return max_tails, len(seen), n_events, running


def tail_distribution(max_tails, n):
    """Para cada R observado, cuantas funciones lo obtuvieron y la probabilidad
    teorica P(R = r) = e^(-n / 2^(r+1)) - e^(-n / 2^r), que sale de la
    ecuacion de clase P(ninguno con cola >= r) = e^(-n / 2^r)."""
    out = []
    for r in range(min(max_tails), max(max_tails) + 1):
        p = math.exp(-n / 2 ** (r + 1)) - math.exp(-n / 2 ** r)
        out.append({"R": r, "estimate": 2 ** r, "hash_functions": max_tails.count(r),
                    "theoretical_probability": round(p, 4)})
    return out


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero python run_all.py w2")

    hashes = make_hashes(N_HASHES, random.Random(SEED ^ 0xF4))
    max_tails, true_distinct, n_events, running = process_stream(STREAM_CSV, hashes)
    estimate = combine(max_tails)
    per_hash = [2 ** r for r in max_tails]
    error_pct = 100 * (estimate - true_distinct) / true_distinct if true_distinct else 0.0

    resultado = {
        "n_hashes": N_HASHES,
        "true_distinct": true_distinct,
        "estimate": estimate,
        "combine": "mediana",
        "per_hash": per_hash,
        "running": running,
        "n_events": n_events,
        "max_tail_per_hash": max_tails,
        "rel_error_pct": round(error_pct, 2),
        "mean_of_estimates": round(sum(per_hash) / N_HASHES, 1),
        "tail_distribution": tail_distribution(max_tails, true_distinct),
    }
    with open(os.path.join(RESULTS_DIR, "task4.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Eventos: {n_events} | funciones hash: {N_HASHES} | combinacion: mediana")
    print(f"R por funcion:   {max_tails}")
    print(f"2^R por funcion: {per_hash}")
    print(f"Distintos reales: {true_distinct} | estimado: {estimate:.0f} | error: {error_pct:+.1f} %")
    print(f"Promedio de los 2^R: {resultado['mean_of_estimates']:.0f} (sensible a un solo valor extremo; por eso la mediana)")
    print(f"Memoria del resumen: {N_HASHES} enteros, contra {true_distinct} identificadores del conteo exacto")
    print(f"{'R':>4}{'2^R':>9}{'funciones':>11}{'P teorica':>11}")
    for d in resultado["tail_distribution"]:
        print(f"{d['R']:>4}{d['estimate']:>9}{d['hash_functions']:>11}{d['theoretical_probability']:>11.3f}")
    print("Resultados en results/w2/task4.json")
