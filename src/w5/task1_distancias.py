"""
Task 1 - Medidas de distancia
-----------------------------
Representaciones de conjunto (k-shingles de pickup_zone, k = 3) y de vector
(ocupacion por zona + 2 metricas z-normalizadas) para los conductores de
data/similarity.jsonl.

Sobre 5.000 pares al azar: Jaccard, coseno, L1 y L2, con histogramas por
grupo plantado. Sobre 500 pares: correlacion de Jaccard, coseno y LCS.
Concentracion de distancias L2 para la primera consulta.
"""

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
import statistics
import time

SHINGLE_K = 3
N_PAIRS = 5000
N_CORR = 500
N_BINS = 20
SEED = 42
RESULTS_JSON = os.path.join(RESULTS_DIR, "task1.json")


# ---------------------------------------------------------------------------
# Representaciones
# ---------------------------------------------------------------------------
def shingles(secuencia, k=SHINGLE_K):
    """Conjunto de k-shingles consecutivos, como tuplas."""
    if len(secuencia) < k:
        return set()
    return {tuple(secuencia[i:i + k]) for i in range(len(secuencia) - k + 1)}


def jaccard(a, b):
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def coseno(x, y):
    nx = math.sqrt(sum(v * v for v in x))
    ny = math.sqrt(sum(v * v for v in y))
    if nx == 0.0 or ny == 0.0:
        return 0.0
    return sum(p * q for p, q in zip(x, y)) / (nx * ny)


def l1(x, y):
    return sum(abs(p - q) for p, q in zip(x, y))


def l2(x, y):
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(x, y)))


def pearson(a, b):
    """Pearson; 0 si alguna serie es constante (nada de NaN)."""
    n = len(a)
    if n < 2:
        return 0.0
    ma = sum(a) / n
    mb = sum(b) / n
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    if va == 0.0 or vb == 0.0:
        return 0.0
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return cov / math.sqrt(va * vb)


def histograma(valores, lo, hi, n_bins=N_BINS):
    """Bordes de n_bins intervalos iguales y los conteos de cada uno."""
    if hi <= lo:
        return [lo, hi], [len(valores)]
    ancho = (hi - lo) / n_bins
    bordes = [lo + i * ancho for i in range(n_bins + 1)]
    bordes[-1] = hi
    counts = [0] * n_bins
    for v in valores:
        idx = int((v - lo) / ancho) if ancho > 0 else 0
        if idx >= n_bins:
            idx = n_bins - 1
        if idx < 0:
            idx = 0
        counts[idx] += 1
    return bordes, counts


def pares_al_azar(n, rng, max_pares):
    """Pares (i, j) con i < j, sin repetir, hasta max_pares."""
    total = n * (n - 1) // 2
    if total <= max_pares:
        return [(i, j) for i in range(n) for j in range(i + 1, n)]
    vistos = set()
    pares = []
    while len(pares) < max_pares:
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


if __name__ == "__main__":
    t0 = time.perf_counter()

    if not os.path.exists(SIMILARITY_JSONL):
        raise SystemExit("Falta data/similarity.jsonl: corre primero run_all.py w5")

    with open(SIMILARITY_JSONL, encoding="utf-8") as f:
        conductores = [json.loads(linea) for linea in f if linea.strip()]

    n = len(conductores)
    ids = [c["driver_id"] for c in conductores]
    grupos = [int(c.get("cluster", -1)) for c in conductores]
    conjuntos = [shingles(c["zone_sequence"]) for c in conductores]
    vectores = [list(c["occupancy_vector"]) for c in conductores]
    secuencias = [c["zone_sequence"] for c in conductores]

    rng = random.Random(SEED)
    pares = pares_al_azar(n, rng, N_PAIRS)

    # --- las cuatro medidas sobre los 5.000 pares -------------------------
    valores = {"jaccard": [], "cosine": [], "l1": [], "l2": []}
    mismo = []
    for i, j in pares:
        valores["jaccard"].append(jaccard(conjuntos[i], conjuntos[j]))
        valores["cosine"].append(coseno(vectores[i], vectores[j]))
        valores["l1"].append(l1(vectores[i], vectores[j]))
        valores["l2"].append(l2(vectores[i], vectores[j]))
        mismo.append(grupos[i] == grupos[j])

    medidas = []
    for nombre in ("jaccard", "cosine", "l1", "l2"):
        vals = valores[nombre]
        lo, hi = min(vals), max(vals)
        bordes, counts = histograma(vals, lo, hi)
        en_mismo = [v for v, m in zip(vals, mismo) if m]
        en_otro = [v for v, m in zip(vals, mismo) if not m]
        medidas.append({
            "measure": nombre,
            "kind": "similitud" if nombre in ("jaccard", "cosine") else "distancia",
            "mean_same_cluster": statistics.fmean(en_mismo) if en_mismo else 0.0,
            "mean_other_cluster": statistics.fmean(en_otro) if en_otro else 0.0,
            "bin_edges": bordes,
            "counts_same_cluster": _c if False else histograma(en_mismo, lo, hi)[1],
            "counts_other_cluster": histograma(en_otro, lo, hi)[1],
        })

    # --- correlacion con LCS en 500 pares ---------------------------------
    pares_corr = pares[:N_CORR]
    jac_c, cos_c, lcs_c = [], [], []
    t_lcs = time.perf_counter()
    for i, j in pares_corr:
        jac_c.append(jaccard(conjuntos[i], conjuntos[j]))
        cos_c.append(coseno(vectores[i], vectores[j]))
        lcs_c.append(similitud_lcs(secuencias[i], secuencias[j]))
    lcs_seconds = round(time.perf_counter() - t_lcs, 3)

    correlacion = {
        "pairs": len(pares_corr),
        "jaccard_cosine": pearson(jac_c, cos_c),
        "jaccard_lcs": pearson(jac_c, lcs_c),
        "cosine_lcs": pearson(cos_c, lcs_c),
        "lcs_seconds": lcs_seconds,
    }

    # --- concentracion de distancias L2 -----------------------------------
    q = 0
    distancias = [l2(vectores[q], vectores[j]) for j in range(n) if j != q]
    positivas = [d for d in distancias if d > 0.0]
    if positivas:
        dmin, dmax = min(positivas), max(distancias)
        ratio = (dmax - dmin) / dmin if dmin > 0 else 0.0
    else:
        dmin = dmax = 0.0
        ratio = 0.0
    concentracion = {
        "query": ids[q],
        "min_l2": dmin,
        "max_l2": dmax,
        "ratio": ratio,
    }

    resultado = {
        "drivers": n,
        "clusters": len(set(grupos)),
        "shingle_k": SHINGLE_K,
        "mean_shingle_count": statistics.fmean(len(s) for s in conjuntos) if n else 0.0,
        "vector_dims": len(vectores[0]) if vectores else 0,
        "pairs": len(pares),
        "same_cluster_pairs": sum(1 for m in mismo if m),
        "measures": medidas,
        "correlation": correlacion,
        "concentration": concentracion,
        "elapsed_sec": round(time.perf_counter() - t0, 3),
    }

    tmp = RESULTS_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    os.replace(tmp, RESULTS_JSON)

    print(f"Conductores: {n} | grupos: {resultado['clusters']} | pares: {len(pares)}")
    for m in medidas:
        print(f"  {m['measure']:<8} mismo={m['mean_same_cluster']:.3f}  "
              f"otro={m['mean_other_cluster']:.3f}")
    print(f"Correlaciones: jac-cos={correlacion['jaccard_cosine']:.3f}  "
          f"jac-lcs={correlacion['jaccard_lcs']:.3f}  "
          f"cos-lcs={correlacion['cosine_lcs']:.3f}  ({lcs_seconds}s)")
    print(f"Concentracion L2: min={dmin:.3f} max={dmax:.3f} ratio={ratio:.2f}")
    print(f"Resultados en {RESULTS_JSON}")
