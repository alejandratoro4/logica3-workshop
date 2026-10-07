"""
dataset.py (Workshop 3)
-----------------------
Workshop 3 - convierte el stream de la Unidad 2 en el grafo de reubicaciones
de conductores entre zonas.

El enunciado:

    "for each driver_id, order rides by stream_seq and record an edge from the
    zone of one ride to the zone of that driver's next ride."

Asi que una arista (A -> B) cuenta las veces que un conductor recogio a un
pasajero en la zona A y su SIGUIENTE viaje lo recogio en la zona B. Si el
siguiente viaje es en la misma zona, la arista es un lazo (A -> A).

Salida principal: data/edges.csv, exactamente eso, con el driver_id de
stream.csv. Es el grafo que leen las Tasks 1 a 5.

Que se puede esperar de ese grafo
---------------------------------
En src/w1/dataset.py el driver_id de cada viaje se sortea al azar entre todos
los conductores, sin modelo de despacho. Con eso la zona del siguiente viaje de
un conductor no depende de la zona del anterior: las filas de M salen casi
iguales (difieren en menos de 0.02) y, en la corrida canonica, PageRank ordena
las zonas igual que el volumen de viajes. Con pocos dias o escala chica, dos
zonas de volumen parecido pueden cambiar de puesto por ruido.

Escenario alterno: data/edges_despacho.csv
------------------------------------------
Para ver que pasa cuando el despacho SI tiene memoria espacial, el mismo
script arma un segundo grafo, con las mismas columnas, en el que se vuelve a
asignar el conductor de cada viaje. Las filas, los tiempos, las tarifas y las
esperas son las de stream.csv; solo cambia QUE conductor toma cada viaje. Lo
usa el Panel D (src/w3/task6_surge.py); las Tasks 1 a 5 no lo leen.

Modelo de despacho (de juguete, con parametros declarados abajo):
  1. Cada zona tiene una coordenada aproximada de Medellin (km, centro en
     DOWNTOWN). Distancia entre zonas = euclidiana, minimo 1.5 km.
  2. Cada viaje lo toma el conductor libre mas cercano a su zona de recogida:
     primero uno de la misma zona, si no de la zona libre mas cercana. Si no
     hay ninguno libre, el que se desocupe primero (el viaje espera).
  3. El destino del viaje no esta en el dataset: se sortea entre las zonas con
     peso POPULARIDAD[destino] * exp(-(distancia - distance_km)^2 / 2 SIGMA^2),
     es decir, zonas cuya distancia se parezca a la del viaje, preferidas por
     su atractivo como destino.
  4. El conductor queda ocupado lo que tarda en llegar a la recogida y hacer
     el viaje a VELOCIDAD_KMH, y queda libre en la zona de destino. Ambos
     tramos se miden con la distancia entre zonas del punto 1, no con
     distance_km, que solo se usa para elegir el destino.

En los dos grafos, en cada zona entran casi tantas reubicaciones como salen
(cada recogida es la llegada de una y la salida de la siguiente); solo el
primer y el ultimo viaje de cada conductor tienen una de las dos. Por eso la
distribucion estacionaria de M queda muy cerca de la participacion de cada
zona en los viajes, pero no es igual. Lo que el despacho cambia es de DONDE
vienen los conductores de cada zona.

Campos de cada arista (los de la plantilla JSON del enunciado):

    edge_id                  e001, e002, ... en orden (from_zone, to_zone)
    from_zone, to_zone       zonas de recogida
    reloc_count              cuantas reubicaciones A -> B hubo
    avg_fare                 tarifa media del viaje que se toma en to_zone
    avg_wait_for_driver_sec  espera media de ese mismo viaje

Reproducible: el despacho usa un RNG propio derivado de RIDES_SEED, asi que
misma ciudad -> mismos edges.csv y edges_despacho.csv byte a byte.

Salida: una fila por par (from_zone, to_zone) observado en cada archivo.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
EDGES_DESPACHO_CSV = os.path.join(DATA_DIR, "edges_despacho.csv")

import csv
import heapq
import math
import random
from collections import defaultdict
from datetime import datetime


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


SEED = _env("RIDES_SEED", int, 42)
N_DRIVERS = _env("RIDES_N_DRIVERS", int, 1200)   # los mismos conductores del W1

# Coordenadas aproximadas (km) de cada zona, con DOWNTOWN en el origen.
COORDS = {
    "DOWNTOWN": (0, 0), "LAURELES": (-3, 0), "BELEN": (-4, -3),
    "EL_POBLADO": (2, -4), "ENVIGADO": (1, -8), "SABANETA": (0, -12),
    "ITAGUI": (-3, -9), "BELLO": (1, 9), "UNIV_NORTE": (0, 4),
    "AIRPORT": (18, -6),
}
# Que tan atractiva es cada zona como DESTINO. No es su demanda de recogida:
# el aeropuerto genera muchas recogidas pero pocos viajes terminan alli.
POPULARIDAD = {
    "DOWNTOWN": 3, "EL_POBLADO": 3, "LAURELES": 2, "UNIV_NORTE": 2,
    "ENVIGADO": 1.5, "BELEN": 1, "ITAGUI": 1, "SABANETA": 1, "BELLO": 1,
    "AIRPORT": 0.6,
}
SIGMA_KM = 3.0          # tolerancia entre distance_km y la distancia entre zonas
VELOCIDAD_KMH = 25.0
DIST_MIN_KM = 1.5       # distancia de un viaje dentro de la misma zona
RECOGIDA_MISMA_ZONA_KM = 0.5

FIELDS = ["edge_id", "from_zone", "to_zone", "reloc_count",
          "avg_fare", "avg_wait_for_driver_sec"]


def distancia(a, b):
    if a == b:
        return DIST_MIN_KM
    return max(DIST_MIN_KM, math.dist(COORDS[a], COORDS[b]))


class Grafo:
    """Acumula las reubicaciones de un juego de conductores: cada viaje de un
    conductor es una arista desde la zona de su viaje anterior."""

    def __init__(self):
        self.ultimo = {}               # conductor -> zona de su ultima recogida
        self.count = defaultdict(int)
        self.fare_sum = defaultdict(float)
        self.wait_sum = defaultdict(float)

    def viaje(self, conductor, zona, fare, wait):
        if conductor in self.ultimo:
            arista = (self.ultimo[conductor], zona)
            self.count[arista] += 1
            self.fare_sum[arista] += fare
            self.wait_sum[arista] += wait
        self.ultimo[conductor] = zona

    def escribir(self, ruta):
        with open(ruta, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            for i, (a, b) in enumerate(sorted(self.count), 1):
                c = self.count[(a, b)]
                w.writerow({
                    "edge_id": f"e{i:03d}",
                    "from_zone": a,
                    "to_zone": b,
                    "reloc_count": c,
                    "avg_fare": round(self.fare_sum[(a, b)] / c, 2),
                    "avg_wait_for_driver_sec": round(self.wait_sum[(a, b)] / c, 2),
                })

    def p_quedarse(self, z, zonas):
        sale = sum(self.count[(z, b)] for b in zonas)
        return self.count[(z, z)] / max(sale, 1)


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero src/w2/dataset.py")

    # Primera pasada: cuantos viajes tiene cada zona, para repartir a los
    # conductores del despacho al empezar en proporcion a la demanda.
    volumen = defaultdict(int)
    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        h = next(reader)
        i_zone = h.index("pickup_zone")
        for rec in reader:
            volumen[rec[i_zone]] += 1
    zonas = sorted(volumen)
    faltan = [z for z in zonas if z not in COORDS]
    if faltan:
        raise SystemExit(f"Zonas sin coordenada en COORDS: {faltan}")
    cerca = {a: sorted(zonas, key=lambda b: (0 if a == b else distancia(a, b), b)) for a in zonas}
    total = sum(volumen.values())

    libres = {z: [] for z in zonas}
    acumulado = 0.0
    corte = []
    for z in zonas:
        acumulado += volumen[z] / total
        corte.append((acumulado, z))
    for d in range(N_DRIVERS):
        x = (d + 0.5) / N_DRIVERS
        libres[next(z for c, z in corte if x <= c + 1e-12)].append(d)

    rng = random.Random(SEED ^ 0x3D)
    ocupados = []                      # (libre desde, conductor, zona)
    literal = Grafo()                  # driver_id de stream.csv (el enunciado)
    despacho = Grafo()                 # conductor re-asignado (escenario alterno)
    esperaron = 0
    prev_seq = 0

    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        h = next(reader)
        i_ts, i_zone, i_km = h.index("timestamp"), h.index("pickup_zone"), h.index("distance_km")
        i_fare, i_wait, i_seq = h.index("fare"), h.index("wait_for_driver_sec"), h.index("stream_seq")
        i_drv = h.index("driver_id")
        for rec in reader:
            seq = int(rec[i_seq])
            if seq <= prev_seq:
                raise SystemExit(f"stream.csv no viene ordenado por stream_seq (fila {seq})")
            prev_seq = seq
            a = rec[i_zone]
            fare, wait = float(rec[i_fare]), float(rec[i_wait])
            literal.viaje(rec[i_drv], a, fare, wait)

            t = datetime.fromisoformat(rec[i_ts]).timestamp()
            while ocupados and ocupados[0][0] <= t:
                _, d, z = heapq.heappop(ocupados)
                libres[z].append(d)
            origen = next((z for z in cerca[a] if libres[z]), None)
            if origen is None:
                t, d, origen = heapq.heappop(ocupados)
                esperaron += 1
            else:
                d = libres[origen].pop()

            km = float(rec[i_km])
            pesos = [POPULARIDAD[b] * math.exp(-((distancia(a, b) - km) ** 2) / (2 * SIGMA_KM ** 2))
                     for b in zonas]
            destino = rng.choices(zonas, weights=pesos)[0]
            ida = RECOGIDA_MISMA_ZONA_KM if origen == a else distancia(origen, a)
            fin = t + (ida + distancia(a, destino)) / VELOCIDAD_KMH * 3600
            heapq.heappush(ocupados, (fin, d, destino))
            despacho.viaje(d, a, fare, wait)

    # edges.csv al final: la app web muestra el CSV mas reciente de data/.
    despacho.escribir(EDGES_DESPACHO_CSV)
    literal.escribir(EDGES_CSV)

    print(f"Grafo del enunciado: {len(zonas)} zonas, {len(literal.count)} aristas dirigidas, "
          f"{sum(literal.count.values())} reubicaciones de {len(literal.ultimo)} conductores "
          f"(de {total} viajes)")
    print(f"Escenario alterno (despacho espacial): {len(despacho.count)} aristas, "
          f"{sum(despacho.count.values())} reubicaciones; {esperaron} viajes "
          f"({100 * esperaron / max(total, 1):.1f}%) esperaron al primer conductor en desocuparse")
    print("Probabilidad de que el siguiente viaje sea en la misma zona:")
    print(f"  {'zona':<12}{'enunciado':>10}{'despacho':>10}")
    for z in zonas:
        print(f"  {z:<12}{literal.p_quedarse(z, zonas):10.2f}{despacho.p_quedarse(z, zonas):10.2f}")
    print(f"Archivos: {EDGES_CSV}\n          {EDGES_DESPACHO_CSV}")
