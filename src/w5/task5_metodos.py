"""
Workshop 5 - Task 5 - Vecinos con tres metodos (S25-S26 + Unidad 5)
------------------------------------------------------------------
Top-5 vecinos para >= 20 consultas con cuatro metodos y cuanto coinciden:

    jaccard   los neighbors de data/similarity.jsonl: Jaccard exacto (k = 3)
              contra todos, por fuerza bruta. Es la referencia.
    minhash   candidatos por banding de minhash_signature con el (b, r) del
              enunciado cuyo umbral queda mas cerca de s~ (contratos/w5.md,
              "Configuracion de LSH"); ordenados por la fraccion de valores
              de firma que coinciden (el Jaccard estimado).
    cosine    candidatos por bandas de 64 hiperplanos gaussianos (8 bandas de
              8 bits) sobre occupancy_vector; ordenados por coseno exacto.
    lcs       los MISMOS candidatos de minhash, ordenados por similitud_lcs
              (Unidad 5, src/w5/lcs.py). Nunca contra todos: el LCS es
              O(m n) por par.

Empates: siempre por driver_id (el menor primero), como en neighbors. El
Jaccard estimado es una fraccion de 100 y empata a menudo en el 5.o puesto.

overlap@5(a, b) = media sobre las consultas de |top5_a ∩ top5_b| / 5.

Outcome test con avg_fare, que no entra en ninguna representacion:
    neighbor_mad  media sobre las consultas de la diferencia absoluta media
                  de avg_fare entre la consulta y sus vecinos del metodo.
    random_mad    lo mismo contra TODOS los demas conductores (el valor
                  esperado de 5 al azar, sin sortear).
    neighbor_mad_se  stdev de las diferencias por consulta / sqrt(consultas).
Si neighbor_mad < random_mad por mas de 2 errores estandar, los vecinos se
parecen en tarifa aunque el metodo nunca la vio: el territorio arrastra la
distancia de los viajes y con ella la tarifa.

Ademas de las claves del contrato, cada fila de methods trae cuantos de los 5
vecinos exactos llego a examinar el metodo, el Jaccard verdadero medio de su
top-5 y la fraccion de vecinos del mismo grupo plantado: con eso se separan
las dos causas de desacuerdo (el vecino nunca fue candidato, o fue candidato
y otro le gano en el orden).

Entrada: data/similarity.jsonl (src/w5/dataset.py)
Salida:  results/w5/task5.json (claves del contrato, contratos/w5.md, Task 5)
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
from collections import defaultdict
from itertools import combinations

SEED = int(os.environ.get("RIDES_SEED") or 42)
CONFIGS = [(20, 5), (10, 10), (50, 2)]   # (b, r) del enunciado
N_BITS, BANDAS_COSENO = 64, 8            # coseno: 8 bandas de 8 bits
POR_GRUPO = 3                            # consultas: 3 de menor driver_id por grupo
TOP = 5
SHINGLE_K = 3
METODOS = ["jaccard", "minhash", "cosine", "lcs"]


# ---------------------------------------------------------------- medidas

def shingles(seq, k=SHINGLE_K):
    return {tuple(seq[i:i + k]) for i in range(len(seq) - k + 1)}


def jaccard(a, b):
    u = len(a | b)
    return len(a & b) / u if u else 0.0


def coseno(x, y):
    nx = math.sqrt(sum(a * a for a in x))
    ny = math.sqrt(sum(b * b for b in y))
    return sum(a * b for a, b in zip(x, y)) / (nx * ny) if nx and ny else 0.0


# ---------------------------------------------------------------- LSH

def elegir_lsh(conductores):
    """El (b, r) cuyo umbral (1/b)^(1/r) queda mas cerca de s~, la mediana
    (entre conductores) del Jaccard medio de sus 5 neighbors."""
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


def top5(puntajes, ids):
    """Los 5 de mayor puntaje; empates por driver_id (el menor primero)."""
    return [j for j, _ in sorted(puntajes.items(), key=lambda kv: (-kv[1], ids[kv[0]]))[:TOP]]


def mad(fare, otros):
    return statistics.fmean(abs(fare - f) for f in otros)


if __name__ == "__main__":
    if not os.path.exists(SIMILARITY_JSONL):
        raise SystemExit("Falta data/similarity.jsonl: corre primero src/w5/dataset.py")
    t0 = time.perf_counter()
    with open(SIMILARITY_JSONL, encoding="utf-8") as f:
        conductores = [json.loads(linea) for linea in f]
    n = len(conductores)
    ids = [c["driver_id"] for c in conductores]
    indice = {d: i for i, d in enumerate(ids)}
    tarifas = [c["avg_fare"] for c in conductores]
    grupos = [c["cluster"] for c in conductores]

    # --- consultas: los POR_GRUPO de menor driver_id de cada grupo
    por_grupo = defaultdict(list)
    for i, c in enumerate(conductores):
        por_grupo[c["cluster"]].append(i)
    consultas = sorted(i for g in por_grupo.values() for i in sorted(g, key=lambda i: ids[i])[:POR_GRUPO])

    # --- MinHash + banding sobre las firmas del archivo
    b, r, s_tilde = elegir_lsh(conductores)
    umbral = (1 / b) ** (1 / r)
    firmas = [c["minhash_signature"] for c in conductores]
    tablas_mh = buckets_por_banda(firmas, b, r)

    # --- hiperplanos gaussianos sobre occupancy_vector
    vectores = [c["occupancy_vector"] for c in conductores]
    dim = len(vectores[0])
    rng = random.Random(SEED ^ 0xC0)
    planos = [[rng.gauss(0, 1) for _ in range(dim)] for _ in range(N_BITS)]
    bits = [[1 if sum(p * x for p, x in zip(plano, v)) >= 0 else 0 for plano in planos] for v in vectores]
    filas_cos = N_BITS // BANDAS_COSENO
    tablas_cos = buckets_por_banda(bits, BANDAS_COSENO, filas_cos)

    # Shingles solo de quien hace falta (consultas y sus candidatos), para el
    # Jaccard verdadero de los vecinos de cada metodo.
    cache_sh = {}

    def sh(j):
        if j not in cache_sh:
            cache_sh[j] = shingles(conductores[j]["zone_sequence"])
        return cache_sh[j]

    tops = {m: [] for m in METODOS}            # tops[m][q] = lista de indices
    n_cand = {m: [] for m in METODOS}
    exactos_examinados = {m: 0 for m in METODOS}
    # diagnostico de desacuerdos
    exacto_examinado_pero_fuera = {"minhash": 0, "lcs": 0, "cosine": 0}
    t_lcs, pares_lcs = 0.0, 0

    for i in consultas:
        c = conductores[i]
        exacto = [indice[v["driver_id"]] for v in c["neighbors"]][:TOP]
        set_exacto = set(exacto)
        cand_mh = candidatos(i, firmas, tablas_mh, r)
        cand_cos = candidatos(i, bits, tablas_cos, filas_cos)

        estimado = {j: sum(x == y for x, y in zip(firmas[i], firmas[j])) / len(firmas[i]) for j in cand_mh}
        cos = {j: coseno(vectores[i], vectores[j]) for j in cand_cos}
        t1 = time.perf_counter()
        sim_lcs = {j: similitud_lcs(c["zone_sequence"], conductores[j]["zone_sequence"]) for j in cand_mh}
        t_lcs += time.perf_counter() - t1
        pares_lcs += len(cand_mh)

        resultado = {"jaccard": exacto, "minhash": top5(estimado, ids),
                     "cosine": top5(cos, ids), "lcs": top5(sim_lcs, ids)}
        cands = {"jaccard": set(range(n)) - {i}, "minhash": cand_mh, "cosine": cand_cos, "lcs": cand_mh}
        for m in METODOS:
            tops[m].append(resultado[m])
            n_cand[m].append(len(cands[m]))
            exactos_examinados[m] += len(set_exacto & cands[m])
            if m != "jaccard":
                exacto_examinado_pero_fuera[m] += len((set_exacto & cands[m]) - set(resultado[m]))

    q = len(consultas)
    total_exactos = sum(len(t) for t in tops["jaccard"])

    # --- metodos
    methods = []
    for m in METODOS:
        vec = [(qi, j) for qi, t in zip(consultas, tops[m]) for j in t]
        jac_true = statistics.fmean(jaccard(sh(qi), sh(j)) for qi, j in vec) if vec else 0.0
        mismo = sum(grupos[qi] == grupos[j] for qi, j in vec) / len(vec) if vec else 0.0
        methods.append({
            "method": m,
            "mean_candidates": round(statistics.fmean(n_cand[m]), 2),
            "exact_examined": round(exactos_examinados[m] / total_exactos, 4) if total_exactos else 0.0,
            "mean_true_jaccard": round(jac_true, 4),
            "same_cluster": round(mismo, 4),
        })

    # --- overlap@5 entre los 6 pares de metodos
    overlap = []
    ov = {}
    for a, bb in combinations(METODOS, 2):
        v = statistics.fmean(len(set(x) & set(y)) / TOP for x, y in zip(tops[a], tops[bb]))
        ov[(a, bb)] = v
        overlap.append({"a": a, "b": bb, "overlap": round(v, 4)})

    # --- outcome test con avg_fare
    random_mad = statistics.fmean(mad(tarifas[i], [tarifas[j] for j in range(n) if j != i]) for i in consultas)
    outcome = []
    ratios = {}
    for m in METODOS:
        difs = [mad(tarifas[i], [tarifas[j] for j in t]) for i, t in zip(consultas, tops[m]) if t]
        nm = statistics.fmean(difs) if difs else 0.0
        se = statistics.stdev(difs) / math.sqrt(len(difs)) if len(difs) >= 2 else 0.0
        ratios[m] = (nm, se)
        outcome.append({"method": m, "neighbor_mad": round(nm, 2), "random_mad": round(random_mad, 2),
                        "neighbor_mad_se": round(se, 2)})

    # --- diagnosticos para explicar los desacuerdos (medidos, no supuestos)
    # (a) brecha de Jaccard verdadero entre el 5.o y el 10.o vecino de cada
    #     consulta, contra el error tipico del Jaccard estimado con 100 hashes.
    # (b) dentro del grupo de la consulta, correlacion entre coseno y Jaccard.
    brechas, corr_cos_jac, cos_min = [], [], []
    for i in consultas:
        js = sorted((jaccard(sh(i), sh(j)) for j in range(n) if j != i), reverse=True)
        if len(js) >= 10:
            brechas.append(js[TOP - 1] - js[9])
        mismos = [j for j in por_grupo[grupos[i]] if j != i]
        if len(mismos) >= 3:
            cs = [coseno(vectores[i], vectores[j]) for j in mismos]
            jc = [jaccard(sh(i), sh(j)) for j in mismos]
            cos_min.append(min(cs))
            if len(set(cs)) > 1 and len(set(jc)) > 1:
                corr_cos_jac.append(statistics.correlation(cs, jc))
    brecha = statistics.median(brechas) if brechas else 0.0
    error_mh = math.sqrt(s_tilde * (1 - s_tilde) / len(firmas[0]))
    corr_med = statistics.median(corr_cos_jac) if corr_cos_jac else 0.0
    cos_peor = min(cos_min) if cos_min else 0.0
    # (c) cuanto pesa la parte z (las 2 ultimas componentes) frente a las fracciones
    norma_frac = statistics.fmean(math.sqrt(sum(x * x for x in v[:-2])) for v in vectores)
    norma_z = statistics.fmean(math.sqrt(sum(x * x for x in v[-2:])) for v in vectores)

    # --- desacuerdos, con las cifras de esta corrida
    M = {x["method"]: x for x in methods}
    ov = {k: round(v, 4) for k, v in ov.items()}
    ex_mh = M["minhash"]["exact_examined"]
    fuera_mh = exacto_examinado_pero_fuera["minhash"] / total_exactos if total_exactos else 0.0
    sig = [m for m in METODOS if ratios[m][0] < random_mad - 2 * ratios[m][1]]
    disagreements = (
        f"Hay dos fuentes de desacuerdo. (1) Candidatos: con (b, r) = ({b}, {r}) el umbral {umbral:.3f} "
        f"queda cerca de s~ = {s_tilde:.3f}, el Jaccard tipico de un vecino real, asi que MinHash/LSH solo "
        f"examina el {ex_mh:.0%} de los 5 vecinos exactos (falsos negativos de la curva S); lo que no es "
        f"candidato no puede salir ni en minhash ni en lcs. Por eso overlap(jaccard, minhash) = "
        f"{ov[('jaccard', 'minhash')]:.0%}. (2) Orden: aun entre candidatos, el Jaccard estimado con "
        f"{len(firmas[0])} funciones tiene error tipico sqrt(s(1-s)/n) = {error_mh:.3f}, mientras que entre el "
        f"5.o y el 10.o vecino verdadero hay solo {brecha:.3f} de Jaccard (mediana): el top-5 por firma es "
        f"casi un sorteo entre vecinos empatados. Un {fuera_mh:.0%} de los vecinos exactos fue candidato y "
        f"quedo fuera del top-5 por ese ruido. LCS ordena los mismos candidatos por la subsecuencia comun "
        f"(el orden completo de las zonas, no ventanas de 3), asi que coincide con minhash en "
        f"{ov[('minhash', 'lcs')]:.0%} y con el exacto en {ov[('jaccard', 'lcs')]:.0%}. El coseno es el que "
        f"mas se aleja (overlap con el exacto {ov[('jaccard', 'cosine')]:.0%}): no ve el orden, y las dos "
        f"metricas z (espera y numero de viajes) pesan "
        f"{'mas que' if norma_z > norma_frac else 'menos que'} las fracciones por zona (norma media "
        f"{norma_z:.2f} contra {norma_frac:.2f})"
        f"{', asi que el angulo lo deciden sobre todo variables que no son el recorrido' if norma_z > norma_frac else ''}. "
        f"Separa los grupos (vecinos del mismo grupo: {M['cosine']['same_cluster']:.0%}), pero dentro del "
        f"grupo su ranking no tiene relacion con el Jaccard (correlacion mediana coseno-Jaccard dentro del "
        f"grupo: {corr_med:.2f}; hay companeros de grupo con coseno de hasta {cos_peor:.2f}). Su top-5 tiene "
        f"Jaccard verdadero medio {M['cosine']['mean_true_jaccard']:.3f} contra "
        f"{M['jaccard']['mean_true_jaccard']:.3f} del exacto. Los cuatro metodos aciertan el grupo "
        f"plantado; discrepan en quien es el mas parecido dentro de el. Outcome test: "
        + (f"{', '.join(sig)} quedan mas de 2 errores estandar por debajo del azar en avg_fare"
           if sig else "ningun metodo queda mas de 2 errores estandar por debajo del azar en avg_fare")
        + ": los vecinos comparten territorio, y el territorio fija la distancia de los viajes y con ella la tarifa."
    )

    resultado = {
        "queries": q,
        "query_rule": f"los {POR_GRUPO} de menor driver_id de cada grupo",
        "s_tilde": round(s_tilde, 4),
        "lsh_config": {"bands": b, "rows": r, "threshold": round(umbral, 4)},
        "cosine_config": {"bits": N_BITS, "bands": BANDAS_COSENO, "rows": filas_cos},
        "methods": methods,
        "overlap_at_5": overlap,
        "outcome_test": outcome,
        "disagreements": disagreements,
        "diagnostics": {
            "minhash_estimate_se": round(error_mh, 4),
            "median_gap_jaccard_5th_10th": round(brecha, 4),
            "median_corr_cosine_jaccard_in_cluster": round(corr_med, 4),
            "min_cosine_in_cluster": round(cos_peor, 4),
            "mean_norm_zone_fractions": round(norma_frac, 4),
            "mean_norm_z_metrics": round(norma_z, 4),
            "exact_examined_but_out_of_top5_minhash": round(fuera_mh, 4),
        },
        "lcs_pairs": pares_lcs,
        "lcs_seconds": round(t_lcs, 2),
    }
    with open(os.path.join(RESULTS_DIR, "task5.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    # --- resumen en consola
    print(f"{n:,} conductores, {q} consultas ({POR_GRUPO} de menor driver_id por grupo)")
    print(f"MinHash/LSH: (b, r) = ({b}, {r}), umbral {umbral:.3f}; s~ = {s_tilde:.3f}")
    print(f"Coseno/LSH: {N_BITS} hiperplanos en {BANDAS_COSENO} bandas de {filas_cos} bits")
    print(f"  {'metodo':<9}{'candidatos':>11}{'exactos exam.':>15}{'Jaccard top5':>14}{'mismo grupo':>13}")
    for x in methods:
        print(f"  {x['method']:<9}{x['mean_candidates']:>11.1f}{x['exact_examined']:>15.0%}"
              f"{x['mean_true_jaccard']:>14.3f}{x['same_cluster']:>13.0%}")
    print("overlap@5:")
    for o in overlap:
        print(f"  {o['a']:>8} vs {o['b']:<8} {o['overlap']:.0%}")
    print(f"Outcome test avg_fare (azar: {random_mad:.1f}):")
    for o in outcome:
        print(f"  {o['method']:<9} {o['neighbor_mad']:>9.1f} ± {o['neighbor_mad_se']:.1f}"
              f"   cociente {o['neighbor_mad'] / random_mad if random_mad else 0:.2f}")
    print(f"LCS: {pares_lcs:,} pares en {t_lcs:.1f} s; total {time.perf_counter() - t0:.1f} s")
    print("Resultados guardados en results/w5/task5.json")
