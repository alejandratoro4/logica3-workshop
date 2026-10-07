"""
dataset.py (Workshop 2)
-----------------------
Workshop 2 - convierte el dataset de la Unidad 1 en un STREAM de solicitudes.

El enunciado del Workshop 2 agrega dos campos a los de la Unidad 1:

    stream_seq           numero creciente del evento en el stream (int)
    wait_for_driver_sec  segundos que el pasajero espero a que le asignaran
                         conductor (float)

Por que es un script aparte y no una modificacion de src/w1/dataset.py:
sortear wait_for_driver_sec dentro del generador consumiria numeros del RNG
principal, correria toda la secuencia y cambiaria los conteos de Poisson, o
sea el tamano del dataset y todos los resultados del Workshop 1 ya
commiteados. Aqui se LEE data/rides.csv sin tocarlo y se escribe
data/stream.csv con las 7 columnas originales mas las 2 nuevas.

Modelo de wait_for_driver_sec
-----------------------------
La espera depende de la concurrencia: cuantas solicitudes llegaron en la
MISMA zona en la MISMA ventana de 5 minutos (w5). Con los conductores fijos,
mas solicitudes simultaneas = mas espera:

    media(w5) = WAIT_BASE_SEC + WAIT_PER_REQUEST_SEC * w5
    wait      ~ Gamma(forma = WAIT_SHAPE, escala = media / WAIT_SHAPE)

La Gamma da esperas siempre positivas, con cola a la derecha y media exacta
media(w5). Con la escala completa w5 va de 1 a ~100 (p50 = 8, p99 = 57), asi
que la espera media va de ~40 s en la madrugada a ~190 s en el pico: justo la
senal que la consulta permanente de la Task 1 debe ver subir en hora pico.

Reproducibilidad: RNG propio derivado de RIDES_SEED (el mismo que usa el
generador), asi que misma ciudad -> mismo stream.csv byte a byte.

Salida: data/stream.csv, en orden de llegada (el de rides.csv, que ya viene
ordenado por timestamp), con stream_seq = 1, 2, 3, ...
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

import csv
import random
from collections import Counter


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


SEED = _env("RIDES_SEED", int, 42)

WINDOW_MIN = 5              # ventana de concurrencia (misma que la Task 4 del W1)
WAIT_BASE_SEC = 40.0        # espera con la zona vacia
WAIT_PER_REQUEST_SEC = 1.5  # segundos extra por cada solicitud concurrente
WAIT_SHAPE = 4.0            # forma de la Gamma: coef. de variacion 1/sqrt(4) = 50%

FIELDS_W1 = ["ride_id", "timestamp", "rider_id", "driver_id",
             "pickup_zone", "distance_km", "fare"]
FIELDS_W2 = FIELDS_W1 + ["stream_seq", "wait_for_driver_sec"]


def window_key(row):
    """(zona, YYYY-MM-DDTHH, bloque de 5 min) de una solicitud."""
    ts = row["timestamp"]
    return (row["pickup_zone"], ts[:13], int(ts[14:16]) // WINDOW_MIN)


def expected_wait(w5):
    return WAIT_BASE_SEC + WAIT_PER_REQUEST_SEC * w5


if __name__ == "__main__":
    if not os.path.exists(RIDES_CSV):
        raise SystemExit("Falta data/rides.csv: corre primero src/w1/dataset.py")

    with open(RIDES_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Primera pasada: concurrencia por (zona, ventana). Es el "mundo" que genera
    # los datos, no un algoritmo de streaming: puede mirar la ventana completa.
    w5 = Counter(window_key(r) for r in rows)

    rng = random.Random(SEED ^ 0x57)
    with open(STREAM_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS_W2)
        writer.writeheader()
        total_wait = 0.0
        for seq, r in enumerate(rows, 1):
            mean = expected_wait(w5[window_key(r)])
            wait = round(rng.gammavariate(WAIT_SHAPE, mean / WAIT_SHAPE), 1)
            total_wait += wait
            out = {k: r[k] for k in FIELDS_W1}
            out["stream_seq"] = seq
            out["wait_for_driver_sec"] = wait
            writer.writerow(out)

    n = len(rows)
    print(f"Stream generado: {n} eventos (stream_seq 1..{n}) desde data/rides.csv")
    print(f"Espera media: {total_wait / max(n, 1):.1f} s  "
          f"(modelo: {WAIT_BASE_SEC:g} + {WAIT_PER_REQUEST_SEC:g} * solicitudes "
          f"concurrentes en la zona, ventana de {WINDOW_MIN} min)")
    print(f"Concurrencia maxima en una ventana: {max(w5.values())} solicitudes "
          f"-> espera media {expected_wait(max(w5.values())):.0f} s")
    print(f"Archivo: {STREAM_CSV}")
