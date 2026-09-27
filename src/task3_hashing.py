"""
Task 3 - Universal Hashing
---------------------------
Hash driver_id to route ride requests to dispatch workers; measure collisions.

Cada driver_id se manda a uno de K "workers" de despacho usando una funcion
hash de la familia universal:

    h_{a,b}(x) = ((a*x + b) mod p) mod K

con a, b elegidos al azar y p un primo grande (2^61 - 1, primo de Mersenne).

¿Por que esta familia?
    La clase (Clase 4, pp. 4-8) demuestra que si p es primo y (a,b) se eligen
    uniformemente, entonces para cualquier par de claves distintas x_i != x_j:

        P{ h(x_i) = h(x_j) } <= 1/K

    Es decir, la familia es UNIVERSAL: garantiza que, en promedio sobre muchos
    sorteos de (a,b), el reparto queda parejo. Eso es lo que permite acotar el
    numero esperado de colisiones con la formula de Balls & Bins:

        E[pares colisionando] = C(n,2) / K

    que es exactamente la prediccion que este script verifica empiricamente.

Que se mide:
    - Colisiones empiricas vs teoricas (universal)
    - Desbalance = carga_max / carga_promedio (ideal ~ 1.0)
    - Workers vacios (desperdicio de capacidad)
    - Carga del worker mas ocupado (metrica operativa real)

Contraste:
    Se compara contra un hash "naive" (sumar codigos ASCII) que sirve de grupo
    de control. El naive es deterministico (no se promedia) y, como los
    driver_id comparten el prefijo "drv_0", su hash casi no varia y termina
    concentrando los drivers en pocos buckets. Eso hace visible el valor del
    hashing universal.

Relacion con Task 4:
    Task 4 reparte las solicitudes de UNA zona entre B=16 colas fijas
    (chaining vs power-of-two-choices). Task 3 reparte TODOS los drivers de la
    ciudad entre K workers globales, y mide como el tamano de K afecta el
    desbalance. Son complementarios: Task 4 mira el caso local (una zona),
    Task 3 mira el caso global (toda la ciudad).

Salida: results/task3_results.json
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")
RESULTS_JSON = os.path.join(RESULTS_DIR, "task3_results.json")

import csv
import hashlib
import json
import random
import time


def _env(name, cast, default):
    """Permite sobreescribir parametros por variables de entorno sin tocar el
    codigo (el dashboard web corre este mismo script dentro de Pyodide y
    necesita perfiles rapidos para la exploracion interactiva). Sin variables
    de entorno, los defaults son los valores de la entrega."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)



SEED = _env("RIDES_SEED", int, 42)
PRIME_P = 2305843009213693951          # 2^61 - 1, primo de Mersenne
K_VALUES = _env(
    "RIDES_K_VALUES",
    lambda v: [int(x) for x in v.split(",") if x.strip()],
    [16, 32, 64, 128, 256, 512, 1024],
)
K_DETAIL = _env("RIDES_K_DETAIL", int, 128)
TRIALS = _env("RIDES_TRIALS", int, 30)

random.seed(SEED)

# RNG separado SOLO para los sorteos de (a,b) del hash universal. Va aparte
# del RNG principal para que el numero de trials no desplace la secuencia de
# numeros aleatorios usada en otros calculos (consistencia con el resto del
# pipeline: mismos parametros -> mismos resultados, byte a byte).
_hash_rng = random.Random(SEED ^ 0x3A)



def stable_hash(key) -> int:
    """Hash determinista entre procesos.

    El hash() nativo de Python esta aleatorizado por proceso (PYTHONHASHSEED),
    asi que usarlo haria que los buckets cambiaran en cada corrida aunque la
    semilla fuera fija. blake2b da el mismo reparto siempre, que es lo que
    permite comparar configuraciones y atribuir diferencias a los parametros
    y no al ruido del interprete.
    """
    return int.from_bytes(
        hashlib.blake2b(repr(key).encode("utf-8"), digest_size=8).digest(), "big"
    )



# Funciones hash

def universal_bucket(driver_id, a, b, K):
    """Familia universal h_{a,b}(x) = ((a*x + b) mod p) mod K.

    Se pasa x = stable_hash(driver_id) mod p para que el resultado de
    a*x + b quepa en un rango manejable y no dependa del tamano del entero
    original. Como p es primo, la aplicacion x -> (a*x + b) mod p es una
    biyeccion sobre [0, p): eso es lo que garantiza la universalidad.
    """
    x = stable_hash(driver_id) % PRIME_P
    return ((a * x + b) % PRIME_P) % K


def naive_bucket(driver_id, K):
    """Hash 'naive' a proposito: suma de codigos ASCII mod K.

    Se usa como grupo de control. Tiene dos defectos conocidos:
      1. Es conmutativo: 'abc' y 'cba' dan el mismo resultado.
      2. Se rompe con prefijos comunes: todos los driver_id son 'drv_00XXX',
         asi que la suma solo varia en los ultimos digitos y el hash
         concentra los drivers en pocos buckets.
    Sirve para mostrar, por contraste, el valor del hashing universal.
    """
    total = 0
    for letra in driver_id:
        total += ord(letra)
    return total % K

# Metricas

def count_colliding_pairs(loads):
    """Numero de pares de elementos que cayeron en el mismo bucket.

    Si un bucket tiene c elementos, alli hay C(c,2) = c*(c-1)/2 pares que
    colisionan. Sumando sobre todos los buckets se obtiene la cantidad que
    la formula de Balls & Bins predice como C(n,2)/K.
    """
    pares = 0
    for c in loads:
        pares += c * (c - 1) // 2
    return pares

# Lectura de datos

def load_unique_drivers(csv_path):
    """Devuelve (set de driver_id unicos, total de solicitudes) en una sola
    pasada por el CSV."""
    drivers = set()
    total_requests = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_requests += 1
            did = row.get("driver_id")
            if did:
                drivers.add(did)
    return drivers, total_requests


# Evaluacion: universal vs naive

def evaluate_universal(drivers, K):
    """Promedia colisiones, desbalance y workers vacios sobre TRIALS sorteos
    independientes de (a,b), para un K dado."""
    n = len(drivers)
    avg_load = n / K

    colisiones = []
    desbalances = []
    vacios = []
    maximos = []

    for _ in range(TRIALS):
        a = _hash_rng.randint(1, PRIME_P - 1)
        b = _hash_rng.randint(0, PRIME_P - 1)

        loads = [0] * K
        for d in drivers:
            loads[universal_bucket(d, a, b, K)] += 1

        colisiones.append(count_colliding_pairs(loads))
        desbalances.append(max(loads) / avg_load)
        vacios.append(loads.count(0))
        maximos.append(max(loads))

    # Prediccion teorica (Balls & Bins): E[colisiones] = C(n,2)/K.
    teorico = (n * (n - 1) / 2) / K if K > 0 else 0.0

    return {
        "K": K,
        "avg_load_factor": round(n / K, 4) if K > 0 else 0.0,
        "avg_desbalance": round(sum(desbalances) / TRIALS, 4),
        "avg_max_load": round(sum(maximos) / TRIALS, 2),
        "avg_buckets_vacios": round(sum(vacios) / TRIALS, 2),
        "avg_collisions_empirical": round(sum(colisiones) / TRIALS, 2),
        "theoretical_expected_collisions": round(teorico, 2),
    }


def evaluate_naive(drivers, K):
    """Una sola corrida: el hash naive es determinista, no hay aleatoriedad
    que promediar."""
    n = len(drivers)
    avg_load = n / K

    loads = [0] * K
    for d in drivers:
        loads[naive_bucket(d, K)] += 1

    return {
        "K": K,
        "load_factor": round(n / K, 4) if K > 0 else 0.0,
        "desbalance": round(max(loads) / avg_load, 4) if avg_load > 0 else 0.0,
        "max_load": max(loads) if loads else 0,
        "buckets_vacios": loads.count(0),
        "collisions_empirical": count_colliding_pairs(loads),
    }



# Enrutamiento completo de solicitudes (no solo drivers unicos)

def route_requests_detail(csv_path, K):
    """Enrutamiento completo de TODAS las solicitudes para un K representativo.

    A diferencia de evaluate_universal (que reparte drivers UNICOS), este
    reparto usa el flujo real de solicitudes: cada ride request se suma al
    worker de su driver. Esa es la metrica operativa real (cuantas solicitudes
    le tocan a cada worker de despacho).
    """
    a = _hash_rng.randint(1, PRIME_P - 1)
    b = _hash_rng.randint(0, PRIME_P - 1)

    driver_to_worker = {}
    loads = [0] * K
    total = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            did = row.get("driver_id")
            if not did:
                continue
            if did not in driver_to_worker:
                driver_to_worker[did] = universal_bucket(did, a, b, K)
            loads[driver_to_worker[did]] += 1

    return {
        "K": K,
        "hash_parameters": {"prime_p": PRIME_P, "a": a, "b": b},
        "total_requests_routed": total,
        "num_unique_drivers": len(driver_to_worker),
        "max_worker_load": max(loads) if loads else 0,
        "min_worker_load": min(loads) if loads else 0,
        "buckets_vacios": loads.count(0),
        "bucket_distribution": loads,
    }


 #Main

def main():
    t0 = time.perf_counter()

    if not os.path.exists(RIDES_CSV):
        print(f"[task3] No existe {RIDES_CSV}; corre primero src/data_generator.py")
        return

    drivers, total_requests = load_unique_drivers(RIDES_CSV)
    n = len(drivers)

    print(f"[task3] {n} drivers unicos | {total_requests} solicitudes | "
          f"K={K_VALUES} | {TRIALS} trials/K")

    universal_results = [evaluate_universal(drivers, K) for K in K_VALUES]
    naive_results = [evaluate_naive(drivers, K) for K in K_VALUES]
    detail = route_requests_detail(RIDES_CSV, K_DETAIL)

    results = {
        "task": 3,
        "title": "Universal Hashing",
        "domain": "Ride-Sharing Dispatch",
        "num_unique_drivers": n,
        "total_requests_processed": total_requests,
        "num_trials_per_K": TRIALS,
        "K_values": K_VALUES,
        "universal": universal_results,
        "naive": naive_results,
        "detail_at_K": detail,
        "elapsed_sec": round(time.perf_counter() - t0, 3),
    }

    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

   
    print()
    print("== Universal vs Naive ==")
    print(f"  {'K':>6}{'desb u':>9}{'desb n':>9}"
          f"{'colis u':>11}{'colis n':>11}{'teoricas':>11}")
    for u, nv in zip(universal_results, naive_results):
        print(f"  {u['K']:>6}{u['avg_desbalance']:>9.3f}{nv['desbalance']:>9.3f}"
              f"{u['avg_collisions_empirical']:>11.1f}"
              f"{nv['collisions_empirical']:>11}"
              f"{u['theoretical_expected_collisions']:>11.1f}")

    print()
    print("== Workers vacios (universal / naive) ==")
    for u, nv in zip(universal_results, naive_results):
        pct_u = 100 * u["avg_buckets_vacios"] / u["K"]
        pct_n = 100 * nv["buckets_vacios"] / nv["K"]
        print(f"  K={u['K']:>5}: {u['avg_buckets_vacios']:>6.1f} ({pct_u:>5.1f}%)  |  "
              f"{nv['buckets_vacios']:>4} ({pct_n:>5.1f}%)")

    print()
    print(f"== Detalle a K={K_DETAIL} (todas las solicitudes) ==")
    print(f"  Solicitudes enrutadas : {detail['total_requests_routed']}")
    print(f"  Drivers unicos        : {detail['num_unique_drivers']}")
    print(f"  Worker mas cargado    : {detail['max_worker_load']}")
    print(f"  Worker menos cargado  : {detail['min_worker_load']}")
    print(f"  Workers vacios        : {detail['buckets_vacios']} de {K_DETAIL}")

    print()
    print(f"[task3] Resultados guardados en {RESULTS_JSON}")


if __name__ == "__main__":
    main()
    