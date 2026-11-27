"""
Workshop 5 - Task 4: MinHash y bandas (S24, estudio de la curva S).

La idea en palabras sencillas:
  Comparar los 1.200 conductores de a pares son ~720.000 Jaccard. LSH evita
  revisar todos: resume cada conductor en una firma de 100 numeros (MinHash)
  y solo compara los pares que coinciden en alguna "banda" de la firma.

  MinHash (Clase 24): para cada una de las 100 funciones h_i(x) = (a_i x + b_i)
  mod p de la Unidad 1, el valor i de la firma es el minimo de h_i sobre los
  shingles del conductor. La probabilidad de que dos conductores coincidan en
  una posicion es su Jaccard.

  Bandas (Clase 25): la firma se parte en b bandas de r filas (b x r = 100).
  Dos conductores son candidatos si en ALGUNA banda tienen las r filas
  iguales. Con Jaccard s, la probabilidad es 1 - (1 - s^r)^b: la curva S, que
  pasa de casi 0 a casi 1 cerca del umbral t = (1/b)^(1/r).

  En el runner MapReduce del W4, en dos etapas:
    Job "firmas"   map: (driver_id, ids de shingles) -> (driver_id, firma).
                   Se corre una vez: la firma no depende de (b, r).
    Job "bxr"      map: (driver_id, firma) -> ((banda, r valores), driver_id),
                   una clave por banda.
                   reduce: los conductores de un bucket; si son 2 o mas, emite
                   el bucket una vez. El proceso principal arma el CONJUNTO de
                   pares candidatos (el mismo par sale de varias bandas).

  Despues se compara con la verdad: el Jaccard exacto de los ~720.000 pares.
  Por cada (b, r): falsos positivos (candidatos bajo el umbral), falsos
  negativos (pares sobre el umbral que no salieron) y, por intervalo de
  Jaccard, la fraccion que salio candidata contra la que predice la curva.

Referencia: Clases 24 y 25 (MinHash, LSH), Clase 18 (MapReduce).

Entrada: data/similarity.jsonl (src/w5/dataset.py)
Salida:  results/w5/task4.json (claves del contrato, contratos/w5.md, Task 4)
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w5")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
SIMILARITY_JSONL = os.path.join(DATA_DIR, "similarity.jsonl")

import sys
sys.path.insert(0, os.path.join(BASE, "src", "w4"))
from mapreduce import Cluster, dividir, PARALELO

import hashlib
import json
import random
from array import array
from functools import partial

K = 3                                   # shingles de 3 zonas, como el dataset
N_HASHES = 100
CONFIGS = [(20, 5), (10, 10), (50, 2)]  # (bandas, filas)
WORKERS = 2
REDUCERS = 4
N_SPLITS = 8

# La familia de la Unidad 1. Los coeficientes se sortean aqui arriba porque el
# map los necesita en cada proceso del pool; son 100 sorteos, no cuestan nada.
PRIMO = 2 ** 61 - 1
SEED = int(os.environ.get("RIDES_SEED") or 42)
_rng = random.Random(SEED ^ 0x5B)
COEF = [(_rng.randint(1, PRIMO - 1), _rng.randint(0, PRIMO - 1)) for _ in range(N_HASHES)]


def shingle_a_entero(tupla):
    """("AIRPORT", "BELEN", "DOWNTOWN") -> entero, con el blake2b del W1."""
    texto = "|".join(tupla)
    return int.from_bytes(hashlib.blake2b(texto.encode("utf-8"), digest_size=8).digest(), "big") % PRIMO


def shingles(secuencia):
    """Los ids de los shingles de K zonas consecutivas, como conjunto."""
    return frozenset(shingle_a_entero(tuple(secuencia[i:i + K])) for i in range(len(secuencia) - K + 1))


def firma(ids):
    """MinHash: para cada h_i, el menor h_i(x) entre los shingles."""
    return [min((a * x + b) % PRIMO for x in ids) for a, b in COEF]


# ---------------------------------------------------------------------------
# Job "firmas" (nivel superior: cada proceso las busca por nombre)
# ---------------------------------------------------------------------------
def map_firma(registro):
    driver_id, ids = registro
    yield driver_id, firma(ids)


def reduce_firma(driver_id, firmas):
    yield driver_id, firmas[0]


# ---------------------------------------------------------------------------
# Job de bandas
# ---------------------------------------------------------------------------
def map_bandas(registro, filas):
    """Una clave por banda: (numero de banda, sus r valores). Llega con
    functools.partial, que fija `filas` para cada (b, r)."""
    driver_id, sig = registro
    for banda in range(len(sig) // filas):
        yield (banda, tuple(sig[banda * filas:(banda + 1) * filas])), driver_id


def reduce_bucket(clave, conductores):
    """Un bucket con 2 o mas conductores se emite una vez, no par por par."""
    if len(conductores) >= 2:
        yield clave, sorted(conductores)


# ---------------------------------------------------------------------------
# Ayudas
# ---------------------------------------------------------------------------
def leer_conductores(ruta):
    with open(ruta, encoding="utf-8") as f:
        return [json.loads(linea) for linea in f]


def candidatos(buckets, indice, n):
    """El conjunto de pares candidatos, cada par (i, j) con i < j guardado
    como el entero i * n + j."""
    pares = set()
    for _, ids in buckets:
        idx = sorted(indice[d] for d in ids)
        for a in range(len(idx)):
            base = idx[a] * n
            for b in idx[a + 1:]:
                pares.add(base + b)
    return pares


if __name__ == "__main__":
    conductores = leer_conductores(SIMILARITY_JSONL)
    n = len(conductores)
    ids = [c["driver_id"] for c in conductores]
    indice = {d: i for i, d in enumerate(ids)}
    conjuntos = [shingles(c["zone_sequence"]) for c in conductores]
    print(f"Task 4 (W5): {n:,} conductores, {N_HASHES} funciones, {WORKERS} workers, paralelo: {PARALELO}")

    with Cluster(workers=WORKERS) as c:
        # 1. Las firmas, una vez.
        registros = [(ids[i], tuple(sorted(conjuntos[i]))) for i in range(n)]
        rf = c.ejecutar("firmas", dividir(registros, N_SPLITS), map_firma, reduce_firma, reducers=REDUCERS)
        firmas = dict(rf.salida)
        iguales = all(firmas[cd["driver_id"]] == cd["minhash_signature"] for cd in conductores)
        print(f"  Firmas: {rf.stats['total_s']:.2f} s, iguales a las del archivo: {iguales}")

        # 2. Un job de bandas por (b, r).
        jobs = {}
        for b, r in CONFIGS:
            jobs[(b, r)] = c.ejecutar(f"{b}x{r}", rf.por_reducer, partial(map_bandas, filas=r),
                                      reduce_bucket, reducers=REDUCERS)

    # 3. La verdad: el Jaccard de todos los pares, con enteros. El intervalo
    # de un par es min(10 * inter // union, 9): con flotantes, 0.3 y 0.6
    # caerian en el intervalo de abajo.
    # Tres arreglos de enteros (no una lista de tuplas: en el navegador la
    # memoria importa): codigo del par i * n + j, tamano de la interseccion
    # y tamano de la union.
    codigos, inters, uniones = array("i"), array("i"), array("i")
    tam = [len(s) for s in conjuntos]
    for i in range(n):
        a, ta, base = conjuntos[i], tam[i], i * n
        for j in range(i + 1, n):
            inter = len(a & conjuntos[j])
            codigos.append(base + j)
            inters.append(inter)
            uniones.append(ta + tam[j] - inter)
    total = len(codigos)

    configs = []
    for b, r in CONFIGS:
        res = jobs[(b, r)]
        cand = candidatos(res.salida, indice, n)
        umbral = (1 / b) ** (1 / r)
        arriba = fp = fn = 0
        # Por intervalo: [pares, candidatos, suma de la probabilidad teorica].
        cubetas = [[0, 0, 0.0] for _ in range(10)]
        for codigo, inter, union in zip(codigos, inters, uniones):
            s = inter / union if union else 0.0
            k = min(10 * inter // union, 9) if union else 0
            es_cand = codigo in cand
            cubetas[k][0] += 1
            cubetas[k][2] += 1 - (1 - s ** r) ** b
            if es_cand:
                cubetas[k][1] += 1
            if s >= umbral:
                arriba += 1
                if not es_cand:
                    fn += 1
            elif es_cand:
                fp += 1
        st = res.stats
        configs.append({
            "bands": b,
            "rows": r,
            "threshold": round(umbral, 4),
            "candidate_pairs": len(cand),
            "pairs_above_threshold": arriba,
            "false_positives": fp,
            "false_negatives": fn,
            "shuffle_pairs": st["shuffle_pairs"],
            "buckets": st["distinct_keys"],
            "largest_bucket": st["max_key_values"],
            "seconds": st["total_s"],
            "jaccard_buckets": [
                {
                    "lo": k / 10,
                    "hi": (k + 1) / 10,
                    "pairs": p,
                    "candidates": cc,
                    "empirical_rate": round(cc / p, 6),
                    "theoretical_rate": round(teo / p, 6),
                }
                for k, (p, cc, teo) in enumerate(cubetas) if p
            ],
        })
        print(f"  ({b:>2}, {r:>2}) umbral {umbral:.3f}: {len(cand):>7,} candidatos, {arriba:>6,} pares sobre el "
              f"umbral, FP {fp:>7,}, FN {fn:>5,} | shuffle {st['shuffle_pairs']:,}, "
              f"{st['distinct_keys']:,} buckets, el mayor {st['max_key_values']}, {st['total_s']:.2f} s")

    resultado = {
        "n_hashes": N_HASHES,
        "workers": WORKERS,
        "parallel": PARALELO,
        "signatures_match": iguales,
        "total_pairs": total,
        "configs": configs,
    }
    with open(os.path.join(RESULTS_DIR, "task4.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    print("Resultados guardados en results/w5/task4.json")
