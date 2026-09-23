"""
data_generator.py
------------------
Generador sintetico de datos para el escenario "Ride-Sharing Dispatch & Surge Pricing".

Simula una ciudad con varias zonas de recogida (pickup_zone). La tasa de solicitudes
de viaje por zona varia por hora del dia (proceso de Poisson no homogeneo), de forma
que se producen picos realistas (hora pico de la manana/tarde, zona del aeropuerto, etc.)
que sirven como disparadores de "surge pricing" en las Tasks 3, 4 y 5.

Salida: data/rides.csv con las columnas del enunciado:
    ride_id, timestamp, rider_id, driver_id, pickup_zone, distance_km, fare
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import random
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Parametros de ciudad inyectables por entorno
# ---------------------------------------------------------------------------
# Los defaults son EXACTAMENTE los originales, asi que correr el script sin
# variables de entorno reproduce los resultados commiteados en results/.
# El dashboard web (que corre este mismo archivo dentro de Pyodide) los usa
# para dejar elegir ciudad, escala, dias y semilla sin tocar el codigo.
def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


SEED = _env("RIDES_SEED", int, 42)
random.seed(SEED)

# RNG separado SOLO para los ride_id. Va aparte a proposito: si los ids se
# sacaran del RNG principal consumirian de la misma secuencia y desplazarian
# todos los sorteos posteriores (conteos de Poisson incluidos), cambiando el
# tamano del dataset y con el todas las metricas. Asi los ids son
# reproducibles sin alterar ni un solo numero del resto del pipeline.
_id_rng = random.Random(SEED ^ 0x1D)

# ---------------------------------------------------------------------------
# Configuracion de la ciudad simulada
# ---------------------------------------------------------------------------
ZONES = [
    "DOWNTOWN", "AIRPORT", "UNIV_NORTE", "EL_POBLADO", "LAURELES",
    "BELEN", "ENVIGADO", "SABANETA", "ITAGUI", "BELLO",
]

ALL_ZONES = list(ZONES)

# Subconjunto de zonas a simular (lista separada por comas). Permite comparar
# una ciudad de 10 zonas contra uno de 3 sin regenerar nada mas.
_zone_filter = _env("RIDES_ZONES", lambda v: [z.strip().upper() for z in v.split(",") if z.strip()], None)
if _zone_filter:
    ZONES = [z for z in ALL_ZONES if z in _zone_filter] or ALL_ZONES

N_DRIVERS = _env("RIDES_N_DRIVERS", int, 1200)
N_RIDERS = _env("RIDES_N_RIDERS", int, 20000)

# Perfil de intensidad (lambda relativo) por zona y hora del dia (0-23).
# Cada zona tiene un patron distinto: DOWNTOWN y EL_POBLADO pican en hora pico
# de oficina (7-9 y 17-19h); AIRPORT tiene una meseta mas plana con picos de vuelo.
BASE_LAMBDA = {
    "DOWNTOWN":    [2,1,1,1,1,2,5,14,16,8,6,6,7,6,6,8,10,16,15,9,6,4,3,2],
    "AIRPORT":     [4,3,3,3,4,6,8,9,8,7,7,8,8,7,7,8,9,10,11,10,8,7,6,5],
    "UNIV_NORTE":  [1,1,1,1,1,2,6,10,9,6,5,6,7,6,5,7,9,9,7,4,3,2,1,1],
    "EL_POBLADO":  [3,2,1,1,1,2,4,8,9,7,7,8,9,8,8,9,11,15,17,13,10,7,5,4],
    "LAURELES":    [2,1,1,1,1,2,5,9,8,6,6,7,8,7,6,7,9,11,10,7,5,4,3,2],
    "BELEN":       [1,1,1,1,1,1,3,6,6,5,5,5,6,5,5,6,7,8,7,5,4,3,2,1],
    "ENVIGADO":    [1,1,1,1,1,1,3,6,6,5,5,6,6,5,5,6,8,9,8,6,4,3,2,1],
    "SABANETA":    [1,1,1,1,1,1,2,5,5,4,4,5,5,4,4,5,6,7,6,4,3,2,1,1],
    "ITAGUI":      [1,1,1,1,1,1,2,5,5,4,4,4,5,4,4,5,6,7,6,4,3,2,1,1],
    "BELLO":       [1,1,1,1,1,2,4,7,7,5,5,6,6,5,5,6,8,9,8,6,4,3,2,1],
}

# Factor de escala global: sube este numero para simular una ciudad mas grande.
SCALE = _env("RIDES_SCALE", float, 30.0)

# Numero de dias simulados (mismo patron horario por zona, con ruido Poisson
# independiente cada dia) -> da repeticiones i.i.d. por (zona, hora) que se
# usan en la Task 5 para estimar media/varianza empiricas y contrastarlas
# contra las cotas de Chebyshev/Chernoff.
N_DAYS = _env("RIDES_N_DAYS", int, 14)

BASE_FARE = 3500       # tarifa base (moneda local, p.ej. COP)
FARE_PER_KM = 1450      # tarifa por km
FARE_NOISE_STD = 800


def poisson(lmbda):
    """Muestreo Poisson simple (algoritmo de Knuth) sin dependencias externas."""
    L = pow(2.718281828459045, -lmbda)
    k = 0
    p = 1.0
    while True:
        k += 1
        p *= random.random()
        if p <= L:
            return k - 1


def generate(start_day: datetime, n_days: int, out_path: str):
    driver_ids = [f"drv_{i:05d}" for i in range(N_DRIVERS)]
    rider_ids = [f"rdr_{i:05d}" for i in range(N_RIDERS)]

    rows = []
    for d in range(n_days):
        day = start_day + timedelta(days=d)
        for hour in range(24):
            for zone in ZONES:
                lam = BASE_LAMBDA[zone][hour] * SCALE
                n_requests = poisson(lam)
                for _ in range(n_requests):
                    # Concentrar las solicitudes en un subconjunto de minutos
                    # (en vez de repartirlas uniformemente en la hora) simula
                    # rafagas reales de concurrencia dentro de la ventana.
                    minute = int(min(59, max(0, random.gauss(30, 12))))
                    second = random.randint(0, 59)
                    ts = day.replace(hour=hour, minute=minute, second=second)
                    distance_km = round(max(0.5, random.gammavariate(2.0, 2.3)), 2)
                    fare = round(
                        BASE_FARE + FARE_PER_KM * distance_km
                        + random.gauss(0, FARE_NOISE_STD), 0
                    )
                    fare = max(BASE_FARE, fare)
                    rows.append({
                        # id derivado de un RNG propio (no uuid4, que ignora la
                        # semilla) para que el dataset quede determinado por
                        # completo: mismos parametros -> mismo CSV byte a byte.
                        "ride_id": "%012x" % _id_rng.getrandbits(48),
                        "timestamp": ts.isoformat(),
                        "rider_id": random.choice(rider_ids),
                        "driver_id": random.choice(driver_ids),
                        "pickup_zone": zone,
                        "distance_km": distance_km,
                        "fare": fare,
                    })

    rows.sort(key=lambda r: r["timestamp"])

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "ride_id", "timestamp", "rider_id", "driver_id",
            "pickup_zone", "distance_km", "fare"
        ])
        writer.writeheader()
        writer.writerows(rows)

    return rows


if __name__ == "__main__":
    start_day = datetime(2026, 9, 1, 0, 0, 0)
    rows = generate(start_day, N_DAYS, RIDES_CSV)
    print(f"Generadas {len(rows)} solicitudes de viaje para {len(ZONES)} zonas "
          f"a lo largo de {N_DAYS} dias.")
    print(f"Archivo: {RIDES_CSV}")
