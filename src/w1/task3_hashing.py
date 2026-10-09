"""
Workshop 1 - Task 3: hashing universal.

Reparte los driver_id entre K procesos de despacho con la familia universal
h(x) = ((a*x + b) mod p) mod K y mide las colisiones contra la cota C(n,2)/K.
Como referencia se evalua tambien un hash de suma de caracteres.

Referencia: Clase 4 (Hashing Theory), Proposicion 1; Clase 5, caso de uso 3.

Entrada: data/rides.csv
Salida:  results/w1/task3.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w1")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import hashlib
import json
import random

SEED = int(os.environ.get("RIDES_SEED") or 42)
PRIME_P = 2 ** 61 - 1                       # primo de Mersenne, p > cualquier clave
K_VALUES = [16, 32, 64, 128, 256, 512, 1024]
TRIALS = 30                                 # sorteos de (a, b) por cada K
K_DETAIL = 128                              # K usado para enrutar todas las solicitudes


def key_to_int(driver_id):
    """Convierte el driver_id en un entero en [0, p). Es una conversion fija:
    blake2b da el mismo valor en cada corrida, a diferencia de hash()."""
    digest = hashlib.blake2b(driver_id.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % PRIME_P


def universal_bucket(x, a, b, K):
    """h_{a,b}(x) = ((a*x + b) mod p) mod K, con a en [1, p-1] y b en [0, p-1]."""
    return ((a * x + b) % PRIME_P) % K


def naive_bucket(driver_id, K):
    """Hash de referencia: suma de los codigos de los caracteres, mod K."""
    return sum(ord(c) for c in driver_id) % K


def colliding_pairs(loads):
    """Pares de claves en el mismo bucket: suma de C(c, 2) sobre los buckets."""
    return sum(c * (c - 1) // 2 for c in loads)


def load_driver_requests(csv_path):
    """Devuelve {driver_id: numero de solicitudes} en una pasada por el CSV."""
    requests = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            driver = row["driver_id"]
            requests[driver] = requests.get(driver, 0) + 1
    return requests


def evaluate_universal(keys, K, rng):
    """Promedios sobre TRIALS funciones de la familia, para un K."""
    n = len(keys)
    mean_load = n / K
    collisions, imbalance, max_loads, empty = [], [], [], []
    for _ in range(TRIALS):
        a = rng.randint(1, PRIME_P - 1)
        b = rng.randint(0, PRIME_P - 1)
        loads = [0] * K
        for x in keys:
            loads[universal_bucket(x, a, b, K)] += 1
        collisions.append(colliding_pairs(loads))
        imbalance.append(max(loads) / mean_load)
        max_loads.append(max(loads))
        empty.append(loads.count(0))
    return {
        "K": K,
        "alpha": round(mean_load, 4),
        "avg_desbalance": round(sum(imbalance) / TRIALS, 4),
        "avg_collisions_empirical": round(sum(collisions) / TRIALS, 2),
        "theoretical_expected_collisions": round(n * (n - 1) / 2 / K, 2),
        "avg_max_load": round(sum(max_loads) / TRIALS, 2),
        "avg_empty_buckets": round(sum(empty) / TRIALS, 2),
    }


def evaluate_naive(drivers, K):
    """El hash de referencia es determinista: una sola medicion por K."""
    mean_load = len(drivers) / K
    loads = [0] * K
    for d in drivers:
        loads[naive_bucket(d, K)] += 1
    return {
        "K": K,
        "desbalance": round(max(loads) / mean_load, 4),
        "collisions_empirical": colliding_pairs(loads),
        "max_load": max(loads),
        "empty_buckets": loads.count(0),
    }


def route_requests(requests, K, rng):
    """Carga por proceso cuando se enrutan todas las solicitudes con una
    funcion de la familia. Las solicitudes de un conductor van al mismo proceso."""
    a = rng.randint(1, PRIME_P - 1)
    b = rng.randint(0, PRIME_P - 1)
    loads = [0] * K
    for driver, count in requests.items():
        loads[universal_bucket(key_to_int(driver), a, b, K)] += count
    return {
        "K": K,
        "a": a,
        "b": b,
        "requests_routed": sum(loads),
        "max_worker_load": max(loads),
        "min_worker_load": min(loads),
        "empty_workers": loads.count(0),
        "loads": loads,
    }


if __name__ == "__main__":
    if not os.path.exists(RIDES_CSV):
        raise SystemExit("Falta data/rides.csv: corre primero src/w1/dataset.py")

    requests = load_driver_requests(RIDES_CSV)
    drivers = sorted(requests)
    keys = [key_to_int(d) for d in drivers]
    rng = random.Random(SEED ^ 0x3A)

    universal = [evaluate_universal(keys, K, rng) for K in K_VALUES]
    naive = [evaluate_naive(drivers, K) for K in K_VALUES]
    detail = route_requests(requests, K_DETAIL, rng)

    resultado = {
        "n_drivers": len(drivers),
        "n_requests": sum(requests.values()),
        "prime_p": PRIME_P,
        "trials_per_K": TRIALS,
        "universal": universal,
        "naive": naive,
        "detail": detail,
    }
    with open(os.path.join(RESULTS_DIR, "task3.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Conductores: {len(drivers)} | solicitudes: {resultado['n_requests']} | "
          f"{TRIALS} funciones por K")
    print(f"{'K':>6}{'desb univ':>11}{'desb ref':>10}{'colis univ':>12}"
          f"{'cota':>10}{'colis ref':>11}")
    for u, v in zip(universal, naive):
        print(f"{u['K']:>6}{u['avg_desbalance']:>11.3f}{v['desbalance']:>10.3f}"
              f"{u['avg_collisions_empirical']:>12.1f}"
              f"{u['theoretical_expected_collisions']:>10.1f}"
              f"{v['collisions_empirical']:>11}")
    print(f"Enrutamiento con K={K_DETAIL}: carga maxima {detail['max_worker_load']}, "
          f"minima {detail['min_worker_load']}, procesos vacios {detail['empty_workers']}")
    print("Resultados en results/w1/task3.json")
