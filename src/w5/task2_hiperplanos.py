import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w5")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
SIMILARITY_JSONL = os.path.join(DATA_DIR, "similarity.jsonl")

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lcs import lcs, similitud_lcs

import json
import math
import random

BITS = [16, 32, 64, 128]
MAX_BITS = 128
N_PAIRS = 1000
N_QUERIES = 50
TOP_K = 5
SAMPLE_MAX = 200
SEED = int(os.environ.get("RIDES_SEED") or 42)
# (b, r) por cada n; b * r = n
BAND_CONFIGS = {
    16: [(4, 4), (2, 8)],
    32: [(8, 4), (4, 8)],
    64: [(16, 4), (8, 8)],
    128: [(32, 4), (16, 8)],
}


def cargar_conductores():
    with open(SIMILARITY_JSONL, encoding="utf-8") as f:
        return [json.loads(linea) for linea in f]


def hiperplanos(dim, n, rng):
    return [[rng.gauss(0.0, 1.0) for _ in range(dim)] for _ in range(n)]


def firma_hiperplanos(vector, planos):
    bits = []
    for plano in planos:
        punto = 0.0
        for vi, pi in zip(vector, plano):
            punto += vi * pi
        bits.append(1 if punto >= 0.0 else 0)
    return bits


def coseno(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    punto = sum(x * y for x, y in zip(a, b))
    c = punto / (na * nb)
    return max(-1.0, min(1.0, c))


def angulo_grados(c):
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def pares_al_azar(n, k, rng):
    total = n * (n - 1) // 2
    if k >= total:
        return [(i, j) for i in range(n) for j in range(i + 1, n)]
    vistos = set()
    pares = []
    while len(pares) < k:
        i = rng.randrange(n)
        j = rng.randrange(n)
        if i == j:
            continue
        a, b = (i, j) if i < j else (j, i)
        if (a, b) in vistos:
            continue
        vistos.add((a, b))
        pares.append((a, b))
    return pares


def bandas_de(bits, b, r):
    return [tuple(bits[i * r:(i + 1) * r]) for i in range(b)]


def candidatos_por_bandas(firmas, b, r):
    """Devuelve, por conductor, el conjunto de indices candidatos (sin el mismo)."""
    buckets = {}
    for idx, bits in enumerate(firmas):
        for banda, clave in enumerate(bandas_de(bits, b, r)):
            buckets.setdefault((banda, clave), []).append(idx)
    candidatos = [set() for _ in firmas]
    for miembros in buckets.values():
        if len(miembros) < 2:
            continue
        for x in miembros:
            for y in miembros:
                if x != y:
                    candidatos[x].add(y)
    return candidatos


def top_k_por_coseno(vector, vectores, k, excluir):
    puntajes = []
    for idx, otro in enumerate(vectores):
        if idx == excluir:
            continue
        puntajes.append((coseno(vector, otro), idx))
    puntajes.sort(key=lambda t: (-t[0], t[1]))
    return [idx for _, idx in puntajes[:k]]


if __name__ == "__main__":
    rng = random.Random(SEED)
    conductores = cargar_conductores()
    n = len(conductores)
    vectores = [c["occupancy_vector"] for c in conductores]
    dim = len(vectores[0]) if vectores else 0

    # Una sola tanda de 128 hiperplanos; las firmas de n bits son sus primeros n.
    planos = hiperplanos(dim, MAX_BITS, rng)
    firmas = [firma_hiperplanos(v, planos) for v in vectores]

    # --- Verificacion del angulo ---
    pares = pares_al_azar(n, N_PAIRS, rng)
    angulos_verdaderos = [angulo_grados(coseno(vectores[i], vectores[j])) for i, j in pares]

    angle_check = []
    for bits in BITS:
        errores = []
        muestra = []
        for (i, j), verdadero in zip(pares, angulos_verdaderos):
            distintos = sum(1 for t in range(bits) if firmas[i][t] != firmas[j][t])
            estimado = 180.0 * distintos / bits
            errores.append(abs(estimado - verdadero))
            if len(muestra) < SAMPLE_MAX:
                muestra.append({
                    "true_deg": round(verdadero, 3),
                    "est_deg": round(estimado, 3),
                })
        angle_check.append({
            "bits": bits,
            "pairs": len(pares),
            "mean_abs_error_deg": round(sum(errores) / len(errores), 4) if errores else 0.0,
            "sample": muestra,
        })

    # --- Banding y recall@5 ---
    n_queries = min(N_QUERIES, n)
    consultas = list(range(n_queries))  # los primeros: regla fija y reproducible
    exactos = {q: top_k_por_coseno(vectores[q], vectores, TOP_K, q) for q in consultas}

    banding = []
    for bits in BITS:
        firmas_n = [f[:bits] for f in firmas]
        for b, r in BAND_CONFIGS[bits]:
            candidatos = candidatos_por_bandas(firmas_n, b, r)
            recalls = []
            total_cand = 0
            for q in consultas:
                cand = candidatos[q]
                total_cand += len(cand)
                ordenados = sorted(cand, key=lambda idx: (-coseno(vectores[q], vectores[idx]), idx))
                top = ordenados[:TOP_K]
                aciertos = len(set(top) & set(exactos[q]))
                recalls.append(aciertos / TOP_K)
            media_recall = sum(recalls) / len(recalls) if recalls else 0.0
            media_cand = total_cand / len(consultas) if consultas else 0.0
            denominador = n - 1
            saved = 1.0 - media_cand / denominador if denominador > 0 else 0.0
            banding.append({
                "bits": bits,
                "bands": b,
                "rows": r,
                "recall_at_5": round(media_recall, 4),
                "mean_candidates": round(media_cand, 2),
                "comparisons_saved": round(max(0.0, saved), 4),
            })

    resultado = {
        "drivers": n,
        "queries": n_queries,
        "angle_check": angle_check,
        "banding": banding,
    }

    with open(os.path.join(RESULTS_DIR, "task2.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Task 2: {n} conductores, {n_queries} consultas, {len(pares)} pares")
    for fila in angle_check:
        print(f"  n={fila['bits']:3d}  error medio = {fila['mean_abs_error_deg']:.2f} grados")
    for fila in banding:
        print(
            f"  n={fila['bits']:3d} b={fila['bands']:2d} r={fila['rows']}  "
            f"recall@5={fila['recall_at_5']:.3f}  cand={fila['mean_candidates']:.1f}  "
            f"ahorro={fila['comparisons_saved']:.3f}"
        )
