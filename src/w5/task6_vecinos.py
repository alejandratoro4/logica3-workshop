"""
Workshop 5 - Task 6 - Vecinos de un conductor con cada metodo (Panel I)
-----------------------------------------------------------------------
El Panel I deja elegir un conductor y ver sus 5 vecinos con cada metodo,
con su puntaje, cuantos candidatos se examinaron y las zonas que comparten.
El Panel J (curva S, recall contra comparaciones ahorradas y el outcome test
de avg_fare) no necesita nada de aca: lo arma la web con las Tasks 4, 2 y 5.

Los cuatro metodos, con las reglas de contratos/w5.md:

    jaccard   los neighbors de data/similarity.jsonl: Jaccard exacto (k = 3)
              contra todos los conductores, por fuerza bruta. La verdad.
    minhash   candidatos por banding de minhash_signature, con el (b, r) del
              enunciado cuyo umbral queda mas cerca de lo que se parecen los
              vecinos de verdad; ordenados por la fraccion de valores de
              firma que coinciden (el Jaccard estimado).
    cosine    candidatos por bandas de N_BITS hiperplanos gaussianos sobre
              occupancy_vector; ordenados por coseno.
    lcs       los mismos candidatos de minhash, ordenados por la similitud
              LCS de la Unidad 5 (src/w5/lcs.py).

exact_in_candidates dice cuantos de los 5 vecinos exactos llego a examinar
cada metodo. Con el umbral cerca de s~, la mitad mas o menos no sale
candidata: es el precio de examinar decenas de conductores y no cientos
(contratos/w5.md, "Configuracion de LSH").

Se consultan 3 conductores por grupo (los de menor driver_id), no todos: el
LCS cuesta O(m n) por par y, con unos 400 viajes por conductor, el de todos
contra todos tardaria horas. Los candidatos de minhash son los que lo hacen
posible: se compara la consulta contra decenas de conductores, no contra
todos.
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
from lcs import similitud_lcs

import json
import math
import random
import statistics
import time
from collections import defaultdict

SEED = int(os.environ.get("RIDES_SEED") or 42)
CONFIGS = [(20, 5), (10, 10), (50, 2)]   # (b, r) del enunciado
N_BITS, BANDAS_COSENO = 64, 8            # 8 bandas de 8 bits
POR_GRUPO = 3
TOP = 5
UMBRAL_ZONA = 0.05                       # zona principal: >= 5 % de sus viajes


def elegir_lsh(conductores):
    """El (b, r) cuyo umbral (1/b)^(1/r) queda mas cerca de s~, la mediana
    del Jaccard medio de los 5 vecinos reales de cada conductor."""
    medias = [statistics.fmean(v["jaccard"] for v in c["neighbors"]) for c in conductores if c["neighbors"]]
    s = statistics.median(medias) if medias else 0.0
    b, r = min(CONFIGS, key=lambda br: abs((1 / br[0]) ** (1 / br[1]) - s))
    return b, r, s


def buckets_por_banda(firmas, bandas, filas):
    """Para cada banda, {valores de la banda: [indices de conductor]}."""
    tablas = []
    for k in range(bandas):
        t = defaultdict(list)
        for i, f in enumerate(firmas):
            t[tuple(f[k * filas:(k + 1) * filas])].append(i)
        tablas.append(t)
    return tablas


def candidatos(i, firmas, tablas, filas):
    out = set()
    for k, t in enumerate(tablas):
        out.update(t[tuple(firmas[i][k * filas:(k + 1) * filas])])
    out.discard(i)
    return out


def coseno(x, y):
    nx = math.sqrt(sum(a * a for a in x))
    ny = math.sqrt(sum(b * b for b in y))
    return sum(a * b for a, b in zip(x, y)) / (nx * ny) if nx and ny else 0.0


if __name__ == "__main__":
    if not os.path.exists(SIMILARITY_JSONL):
        raise SystemExit("Falta data/similarity.jsonl: corre primero src/w5/dataset.py")
    t0 = time.perf_counter()
    with open(SIMILARITY_JSONL, encoding="utf-8") as f:
        conductores = [json.loads(linea) for linea in f]
    n = len(conductores)
    indice = {c["driver_id"]: i for i, c in enumerate(conductores)}
    zonas = sorted({z for c in conductores for z in c["zone_sequence"]})

    # Zonas principales de cada conductor.
    principales = []
    for c in conductores:
        s = c["zone_sequence"]
        principales.append([z for z in zonas if s.count(z) / len(s) >= UMBRAL_ZONA])

    # MinHash + banding sobre las firmas del archivo.
    b, r, s_tilde = elegir_lsh(conductores)
    firmas = [c["minhash_signature"] for c in conductores]
    tablas_mh = buckets_por_banda(firmas, b, r)

    # Hiperplanos gaussianos sobre el vector de ocupacion.
    vectores = [c["occupancy_vector"] for c in conductores]
    dim = len(vectores[0])
    rng = random.Random(SEED ^ 0xC0)
    planos = [[rng.gauss(0, 1) for _ in range(dim)] for _ in range(N_BITS)]
    bits = [[1 if sum(p * x for p, x in zip(plano, v)) >= 0 else 0 for plano in planos] for v in vectores]
    filas_cos = N_BITS // BANDAS_COSENO
    tablas_cos = buckets_por_banda(bits, BANDAS_COSENO, filas_cos)

    por_grupo = defaultdict(list)
    for i, c in enumerate(conductores):
        por_grupo[c["cluster"]].append(i)
    consultas = sorted(i for g in por_grupo.values() for i in sorted(g, key=lambda i: conductores[i]["driver_id"])[:POR_GRUPO])

    def vecino(i, j, score):
        cj = conductores[j]
        return {
            "driver_id": cj["driver_id"],
            "score": round(score, 4),
            "cluster": cj["cluster"],
            "avg_fare": cj["avg_fare"],
            "shared_zones": [z for z in principales[i] if z in principales[j]],
        }

    def top(i, puntajes):
        mejores = sorted(puntajes.items(), key=lambda kv: (-kv[1], conductores[kv[0]]["driver_id"]))[:TOP]
        return [vecino(i, j, s) for j, s in mejores]

    salida = []
    pares_lcs = 0
    t_lcs = 0.0
    for i in consultas:
        c = conductores[i]
        cand_mh = candidatos(i, firmas, tablas_mh, r)
        cand_cos = candidatos(i, bits, tablas_cos, filas_cos)
        exacto = [vecino(i, indice[v["driver_id"]], v["jaccard"]) for v in c["neighbors"]]
        # Cuantos de los 5 exactos llegaron a examinarse: los demas son
        # falsos negativos de LSH, que ningun orden puede recuperar.
        ids_exactos = {indice[v["driver_id"]] for v in c["neighbors"]}
        estimado = {j: sum(x == y for x, y in zip(firmas[i], firmas[j])) / len(firmas[i]) for j in cand_mh}
        cos = {j: coseno(vectores[i], vectores[j]) for j in cand_cos}
        t1 = time.perf_counter()
        lcs = {j: similitud_lcs(c["zone_sequence"], conductores[j]["zone_sequence"]) for j in cand_mh}
        t_lcs += time.perf_counter() - t1
        pares_lcs += len(cand_mh)
        salida.append({
            "driver_id": c["driver_id"],
            "cluster": c["cluster"],
            "seq_length": c["seq_length"],
            "avg_fare": c["avg_fare"],
            "main_zones": principales[i],
            "methods": [
                {"method": "jaccard", "candidates": n - 1, "exact_in_candidates": len(ids_exactos),
                 "neighbors": exacto},
                {"method": "minhash", "candidates": len(cand_mh), "exact_in_candidates": len(ids_exactos & cand_mh),
                 "neighbors": top(i, estimado)},
                {"method": "cosine", "candidates": len(cand_cos), "exact_in_candidates": len(ids_exactos & cand_cos),
                 "neighbors": top(i, cos)},
                {"method": "lcs", "candidates": len(cand_mh), "exact_in_candidates": len(ids_exactos & cand_mh),
                 "neighbors": top(i, lcs)},
            ],
        })

    out = {
        "drivers": n,
        "zones": zonas,
        "lsh_config": {"bands": b, "rows": r, "threshold": round((1 / b) ** (1 / r), 4)},
        "cosine_config": {"bits": N_BITS, "bands": BANDAS_COSENO, "rows": filas_cos},
        "clusters": [
            {"cluster": g, "territory": conductores[por_grupo[g][0]]["territory"], "drivers": len(por_grupo[g])}
            for g in sorted(por_grupo)
        ],
        "queries": salida,
    }
    with open(os.path.join(RESULTS_DIR, "task6.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # Resumen: cuantos exactos llegaron a examinarse, cuanto coincide cada
    # metodo con el exacto y cuantos de sus vecinos son del mismo grupo.
    print(f"{n:,} conductores, {len(consultas)} consultas (hasta {POR_GRUPO} por grupo)")
    print(f"LSH de MinHash: (b, r) = ({b}, {r}), umbral {(1 / b) ** (1 / r):.3f}; "
          f"la mediana del Jaccard de los 5 vecinos reales es {s_tilde:.3f}")
    print(f"LSH de coseno: {N_BITS} hiperplanos en {BANDAS_COSENO} bandas de {filas_cos} bits")
    print(f"  {'metodo':<9}{'candidatos':>11}{'exactos examinados':>20}{'igual al exacto':>17}{'mismo grupo':>13}")
    for k, nombre in enumerate(["jaccard", "minhash", "cosine", "lcs"]):
        filas_m = [q["methods"][k] for q in salida]
        exactos = [{v["driver_id"] for v in q["methods"][0]["neighbors"]} for q in salida]
        cand = statistics.fmean(m["candidates"] for m in filas_m)
        total_exactos = sum(len(e) for e in exactos)
        examinados = sum(m["exact_in_candidates"] for m in filas_m) / total_exactos if total_exactos else 0.0
        igual = statistics.fmean(len(exactos[q] & {v["driver_id"] for v in m["neighbors"]}) / TOP
                                 for q, m in enumerate(filas_m))
        vecinos = [(salida[q]["cluster"], v["cluster"]) for q, m in enumerate(filas_m) for v in m["neighbors"]]
        mismo = sum(a == b for a, b in vecinos) / len(vecinos) if vecinos else 0.0
        print(f"  {nombre:<9}{cand:>11.1f}{examinados:>20.0%}{igual:>17.0%}{mismo:>13.0%}")
    print(f"LCS: {pares_lcs:,} pares en {t_lcs:.1f} s (solo candidatos); total {time.perf_counter() - t0:.1f} s")
    print("Resultados guardados en results/w5/task6.json")
