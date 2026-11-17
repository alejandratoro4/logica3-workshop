"""
dataset.py (Workshop 5)
-----------------------
Workshop 5 - una fila por conductor, con su secuencia de zonas y sus
representaciones para buscar conductores parecidos.

Escribe data/similarity.jsonl: un conductor por linea, con los campos de la
plantilla del enunciado.

    driver_id                el conductor
    cluster                  el grupo plantado al que pertenece (0, 1, ...)
    territory                las zonas de ese grupo
    zone_sequence            sus zonas de recogida, en orden de stream_seq
    seq_length               cuantos viajes tiene
    avg_fare                 tarifa media de sus viajes
    avg_wait_for_driver_sec  espera media de sus viajes
    shingle_count            shingles distintos de k = 3 zonas consecutivas
    minhash_signature        100 valores de MinHash de esos shingles
    occupancy_vector         la fraccion de sus viajes en cada zona (en orden
                             alfabetico de zona) y despues z(avg_wait) y
                             z(seq_length), z-normalizados entre conductores
    neighbors                los 5 conductores con mayor Jaccard (k = 3) y su
                             valor, por fuerza bruta: la verdad de referencia

cluster y territory no son de la plantilla: son la verdad plantada, que la
Task 3 necesita para medir la separacion. avg_fare queda fuera del vector a
proposito: la Task 5 lo usa para ver si los vecinos se parecen en algo que el
metodo no vio.

Por que hay un escenario y no el driver_id del stream
-----------------------------------------------------
El enunciado pide "planted clusters = drivers sharing a 4-6 zone territory".
En stream.csv no los hay: el W1 sortea el driver_id de cada viaje al azar,
asi que todos los conductores recorren la ciudad igual (el script imprime su
Jaccard medio para comparar). Como hizo el W3 con edges_despacho.csv, aqui se
arma un escenario propio: los mismos viajes, con la misma zona, hora, tarifa
y espera, repartidos de nuevo entre los conductores. stream.csv no se toca y
W1-W4 no cambian. El driver_id de este archivo NO es el del stream: es el
mismo parque de RIDES_N_DRIVERS conductores, con otros viajes.

El escenario:
  1. N_CLUSTERS territorios de 4 a 6 zonas, sorteados con la semilla. Si la
     ciudad tiene menos zonas, cada territorio es la ciudad entera y no hay
     grupos que encontrar (es un resultado valido, no un error).
  2. Los conductores se reparten entre los territorios por turno.
  3. Cada viaje, en orden de stream_seq, va a un conductor del territorio
     que contiene su zona de recogida. Entre los grupos que la contienen se
     elige con peso (conductores del grupo) x (probabilidad de que el destino
     del viaje caiga en el territorio), con el modelo de destinos del W3:
     P(destino b) proporcional a POPULARIDAD[b] * exp(-(d - dist(a, b))^2 /
     (2 SIGMA_KM^2)), con d la distance_km del viaje (redondeada al km). Asi
     un territorio con zonas lejanas recibe viajes mas largos y, por eso, mas
     caros: la tarifa depende del territorio sin que nadie la plante.
  4. Con probabilidad RUIDO el viaje va a cualquier conductor. Sin ruido
     todos los conductores de un grupo tendrian los mismos shingles.

Los conductores con menos de MIN_VIAJES viajes quedan fuera (con k = 4 no
tendrian ni dos shingles, y un Jaccard de conjuntos vacios es 0/0).

Representaciones (las mismas reglas que contratos/w5.md):
  - Shingle: k = 3 zonas consecutivas, unidas con "|"
    ("AIRPORT|BELEN|DOWNTOWN"). Como numero, con la conversion del W1
    (src/w1/task3_hashing.py): blake2b de 8 bytes, modulo p = 2^61 - 1.
  - MinHash: la familia universal de la Unidad 1, h_i(x) = (a_i x + b_i) mod
    p, con a_i en [1, p-1] y b_i en [0, p-1] sorteados en orden con
    random.Random(RIDES_SEED ^ 0x5B). El valor i de la firma es el minimo de
    h_i sobre los shingles del conductor (Algoritmo 2 de la clase 24).

Reproducible: misma ciudad -> mismo archivo byte a byte.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w5")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")
SIMILARITY_JSONL = os.path.join(DATA_DIR, "similarity.jsonl")

import csv
import hashlib
import heapq
import json
import math
import random
import statistics
import time
from collections import defaultdict


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


SEED = _env("RIDES_SEED", int, 42)
N_DRIVERS = _env("RIDES_N_DRIVERS", int, 1200)   # el parque del W1

N_CLUSTERS = 8
TERRITORIO_MIN, TERRITORIO_MAX = 4, 6   # zonas por territorio (el enunciado)
RUIDO = 0.10              # fraccion de viajes que va a cualquier conductor
MIN_VIAJES = 5
K_SHINGLE = 3
N_HASHES = 100
TOP = 5
PRIMO = 2 ** 61 - 1       # el de la Unidad 1

# Modelo de destinos de src/w3/dataset.py (copiado: los datasets no se
# importan entre si). Coordenadas en km, con DOWNTOWN en el origen.
COORDS = {
    "DOWNTOWN": (0, 0), "LAURELES": (-3, 0), "BELEN": (-4, -3),
    "EL_POBLADO": (2, -4), "ENVIGADO": (1, -8), "SABANETA": (0, -12),
    "ITAGUI": (-3, -9), "BELLO": (1, 9), "UNIV_NORTE": (0, 4),
    "AIRPORT": (18, -6),
}
POPULARIDAD = {
    "DOWNTOWN": 3, "EL_POBLADO": 3, "LAURELES": 2, "UNIV_NORTE": 2,
    "ENVIGADO": 1.5, "BELEN": 1, "ITAGUI": 1, "SABANETA": 1, "BELLO": 1,
    "AIRPORT": 0.6,
}
SIGMA_KM = 3.0
DIST_MIN_KM = 1.5


def distancia(a, b):
    if a == b:
        return DIST_MIN_KM
    return max(DIST_MIN_KM, math.dist(COORDS[a], COORDS[b]))


def shingle_a_entero(shingle):
    """El entero de un shingle: la conversion de driver_id del W1."""
    digest = hashlib.blake2b(shingle.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % PRIMO


def shingles(secuencia, k):
    """Los shingles de k zonas consecutivas, como enteros."""
    return {shingle_a_entero("|".join(secuencia[i:i + k])) for i in range(len(secuencia) - k + 1)}


def coeficientes():
    """Los (a_i, b_i) de las N_HASHES funciones, en el orden del contrato."""
    rng = random.Random(SEED ^ 0x5B)
    out = []
    for _ in range(N_HASHES):
        a = rng.randint(1, PRIMO - 1)
        b = rng.randint(0, PRIMO - 1)
        out.append((a, b))
    return out


def firma(ids, coef):
    """MinHash: para cada h_i, el menor h_i(x) entre los shingles."""
    return [min((a * x + b) % PRIMO for x in ids) for a, b in coef]


def leer_stream():
    filas = []
    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        h = next(reader)
        idx = [h.index(c) for c in ("stream_seq", "driver_id", "pickup_zone", "fare",
                                    "wait_for_driver_sec", "distance_km")]
        for rec in reader:
            seq, drv, zona, fare, wait, dist = (rec[i] for i in idx)
            filas.append((int(seq), drv, zona, float(fare), float(wait), float(dist)))
    filas.sort()
    return filas


def territorios(zonas, rng):
    out = []
    for _ in range(N_CLUSTERS):
        k = min(rng.randint(TERRITORIO_MIN, TERRITORIO_MAX), len(zonas))
        out.append(sorted(rng.sample(zonas, k)))
    return out


def reasignar(filas, zonas, terr, conductores, rng):
    """Reparte los viajes del stream entre los conductores del escenario.
    Devuelve, por conductor, sus (zona, tarifa, espera) en orden de stream_seq."""
    grupo = {d: i % N_CLUSTERS for i, d in enumerate(conductores)}
    miembros = defaultdict(list)
    for d in conductores:
        miembros[grupo[d]].append(d)
    activos = [c for c in range(N_CLUSTERS) if miembros[c]]
    # Grupos que pueden recoger en cada zona. Una zona que no quedo en ningun
    # territorio (pasa si hay mas zonas que las que cubren los sorteos) la
    # atiende cualquiera.
    elegibles = {z: [c for c in activos if z in terr[c]] or activos for z in zonas}

    cache = {}

    def pesos(zona, dist_km):
        clave = (zona, round(dist_km))
        if clave not in cache:
            d = clave[1]
            dest = {b: POPULARIDAD.get(b, 1.0) * math.exp(-((d - distancia(zona, b)) ** 2) / (2 * SIGMA_KM ** 2))
                    for b in zonas}
            total = sum(dest.values()) or 1.0
            gs = elegibles[zona]
            w = [len(miembros[c]) * (sum(dest[b] for b in terr[c]) / total) + 1e-12 for c in gs]
            cache[clave] = (gs, w)
        return cache[clave]

    viajes = defaultdict(list)
    for _seq, _drv, zona, fare, wait, dist_km in filas:
        if rng.random() < RUIDO:
            d = conductores[rng.randrange(len(conductores))]
        else:
            gs, w = pesos(zona, dist_km)
            m = miembros[rng.choices(gs, w)[0]]
            d = m[rng.randrange(len(m))]
        viajes[d].append((zona, fare, wait))
    return grupo, viajes


def zscores(valores):
    m = statistics.fmean(valores) if valores else 0.0
    s = statistics.pstdev(valores) if len(valores) > 1 else 0.0
    return [(v - m) / s if s > 0 else 0.0 for v in valores]


def vecinos_exactos(conjuntos):
    """Los TOP mayores Jaccard de cada conductor contra todos los demas.
    Cada par se calcula una vez; cada conductor guarda un heap de TOP con el
    peor arriba (menor Jaccard; a igual Jaccard, el driver_id mayor)."""
    n = len(conjuntos)
    heaps = [[] for _ in range(n)]
    tam = [len(s) for s in conjuntos]
    for i in range(n):
        si, ti, hi = conjuntos[i], tam[i], heaps[i]
        for j in range(i + 1, n):
            inter = len(si & conjuntos[j])
            union = ti + tam[j] - inter
            jac = inter / union if union else 0.0
            for h, otro in ((hi, j), (heaps[j], i)):
                clave = (jac, -otro)
                if len(h) < TOP:
                    heapq.heappush(h, clave)
                elif clave > h[0]:
                    heapq.heapreplace(h, clave)
    # (Jaccard, indice del vecino), del mejor al peor.
    return [[(jac, -menos) for jac, menos in sorted(h, reverse=True)] for h in heaps]


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero src/w2/dataset.py")
    t0 = time.perf_counter()

    filas = leer_stream()
    zonas = sorted({f[2] for f in filas})
    faltan = [z for z in zonas if z not in COORDS]
    if faltan:
        raise SystemExit(f"Zonas sin coordenada en COORDS: {faltan}")

    rng = random.Random(SEED ^ 0x5A)
    terr = territorios(zonas, rng)
    parque = [f"drv_{i:05d}" for i in range(N_DRIVERS)]
    grupo, viajes = reasignar(filas, zonas, terr, parque, rng)

    conductores = [d for d in parque if len(viajes[d]) >= MIN_VIAJES]
    fuera = len(parque) - len(conductores)
    if len(conductores) < 2:
        raise SystemExit(f"Solo {len(conductores)} conductores con {MIN_VIAJES} viajes o mas: "
                         "la ciudad es demasiado chica para buscar vecinos")

    secuencias = [[z for z, _f, _w in viajes[d]] for d in conductores]
    tarifa = [statistics.fmean(f for _z, f, _w in viajes[d]) for d in conductores]
    espera = [statistics.fmean(w for _z, _f, w in viajes[d]) for d in conductores]
    largo = [len(s) for s in secuencias]
    z_espera, z_largo = zscores(espera), zscores(largo)
    t_escenario = time.perf_counter() - t0

    t1 = time.perf_counter()
    conjuntos = [frozenset(shingles(s, K_SHINGLE)) for s in secuencias]
    coef = coeficientes()
    firmas = [firma(c, coef) for c in conjuntos]
    t_minhash = time.perf_counter() - t1

    t1 = time.perf_counter()
    vecinos = vecinos_exactos(conjuntos)
    t_vecinos = time.perf_counter() - t1

    with open(SIMILARITY_JSONL, "w", encoding="utf-8", newline="\n") as f:
        for i, d in enumerate(conductores):
            s = secuencias[i]
            cuota = [s.count(z) / len(s) for z in zonas]
            fila = {
                "driver_id": d,
                "cluster": grupo[d],
                "territory": terr[grupo[d]],
                "zone_sequence": s,
                "seq_length": len(s),
                "avg_fare": round(tarifa[i], 2),
                "avg_wait_for_driver_sec": round(espera[i], 2),
                "shingle_count": len(conjuntos[i]),
                "minhash_signature": firmas[i],
                "occupancy_vector": [round(v, 6) for v in cuota + [z_espera[i], z_largo[i]]],
                "neighbors": [{"driver_id": conductores[j], "jaccard": round(jac, 4)} for jac, j in vecinos[i]],
            }
            f.write(json.dumps(fila, separators=(",", ":")) + "\n")

    # Lo que se imprime es para leerlo en la terminal: cuanto separan los
    # grupos y que tan parecidos se ven todos con el driver_id del stream.
    pr = random.Random(SEED ^ 0x5C)
    n = len(conductores)
    por_grupo = defaultdict(list)
    for i, d in enumerate(conductores):
        por_grupo[grupo[d]].append(i)
    def jac(a, b):
        u = len(a | b)
        return len(a & b) / u if u else 0.0

    con_pares = [g for g in por_grupo.values() if len(g) > 1]
    dentro = []
    for _ in range(1000 if con_pares else 0):
        i, j = pr.sample(pr.choice(con_pares), 2)
        dentro.append(jac(conjuntos[i], conjuntos[j]))
    entre = []
    for _ in range(3000):
        i, j = pr.sample(range(n), 2)
        if grupo[conductores[i]] != grupo[conductores[j]]:
            entre.append(jac(conjuntos[i], conjuntos[j]))
    pureza = statistics.fmean(
        sum(grupo[conductores[j]] == grupo[d] for _jac, j in vecinos[i]) / max(1, len(vecinos[i]))
        for i, d in enumerate(conductores))
    literal = defaultdict(list)
    for _seq, drv, zona, *_ in filas:
        literal[drv].append(zona)
    lit = [frozenset(shingles(s, K_SHINGLE)) for s in literal.values() if len(s) >= MIN_VIAJES]
    lit_j = [jac(*pr.sample(lit, 2)) for _ in range(1000)] if len(lit) > 1 else [0.0]

    print(f"Escenario W5: {len(filas):,} viajes de stream.csv repartidos entre {len(parque):,} conductores "
          f"en {N_CLUSTERS} territorios (ruido {RUIDO:.0%})")
    for c in range(N_CLUSTERS):
        print(f"  grupo {c}: {len(por_grupo[c]):>4} conductores  {', '.join(terr[c])}")
    if fuera:
        print(f"  {fuera} conductor{'es' if fuera > 1 else ''} con menos de {MIN_VIAJES} viajes "
              f"{'quedan' if fuera > 1 else 'queda'} fuera")
    print(f"seq_length: mediana {statistics.median(largo):.0f}, de {min(largo)} a {max(largo)}")
    print(f"Jaccard k={K_SHINGLE}: dentro de un grupo {statistics.fmean(dentro) if dentro else 0:.3f}, "
          f"entre grupos {statistics.fmean(entre) if entre else 0:.3f}; "
          f"{pureza:.1%} de los 5 vecinos reales son del mismo grupo")
    print(f"Con el driver_id del stream (sin escenario) el Jaccard medio entre conductores es "
          f"{statistics.fmean(lit_j):.3f}: todos recorren la ciudad igual")
    print(f"Tiempos: escenario {t_escenario:.1f} s, shingles y MinHash {t_minhash:.1f} s, "
          f"vecinos por fuerza bruta ({n * (n - 1) // 2:,} pares) {t_vecinos:.1f} s")
    print(f"Archivo: data/similarity.jsonl ({n:,} conductores, "
          f"{os.path.getsize(SIMILARITY_JSONL) / 2**20:.1f} MB)")
