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
import random

K_VALUES = [2, 3, 4]
PAIRS_PER_TYPE = 2000      # pares del mismo grupo y pares de grupos distintos
MAX_ATTEMPTS = 200000      # tope de sorteos, por si la ciudad tiene pocos conductores
SEED = 42


def leer_conductores(ruta):
    """Una lista con un diccionario por conductor."""
    with open(ruta, encoding="utf-8") as f:
        return [json.loads(linea) for linea in f]


def shingles(secuencia, k):
    """El conjunto de pedacitos de k zonas seguidas de una secuencia."""
    return set(tuple(secuencia[i:i + k]) for i in range(len(secuencia) - k + 1))


def jaccard(a, b):
    """Lo que comparten dividido por lo que tienen entre los dos.
    Si los dos conjuntos estan vacios, 0."""
    union = len(a | b)
    if union == 0:
        return 0.0
    return len(a & b) / union


def promedio(valores):
    """Promedio de una lista; 0 si esta vacia (nunca NaN)."""
    if not valores:
        return 0.0
    return sum(valores) / len(valores)


def sortear_pares(conductores, rng):
    """Saca dos conductores al azar muchas veces. Si son del mismo grupo, el
    par va a `mismos`; si no, a `distintos`. Para cuando las dos listas
    tienen PAIRS_PER_TYPE pares o se acaban los intentos."""
    mismos, distintos = [], []
    n = len(conductores)
    if n < 2:
        return mismos, distintos
    intentos = 0
    while (len(mismos) < PAIRS_PER_TYPE or len(distintos) < PAIRS_PER_TYPE) and intentos < MAX_ATTEMPTS:
        intentos += 1
        i, j = rng.sample(range(n), 2)
        if conductores[i]["cluster"] == conductores[j]["cluster"]:
            if len(mismos) < PAIRS_PER_TYPE:
                mismos.append((i, j))
        else:
            if len(distintos) < PAIRS_PER_TYPE:
                distintos.append((i, j))
    return mismos, distintos


def razon_mejor_k(filas, mejor):
    """El texto de best_k_reason, armado con los numeros de esta corrida."""
    partes = []
    for f in filas:
        partes.append(
            f"k = {f['k']}: {f['jaccard_same_cluster']:.3f} dentro contra "
            f"{f['jaccard_other_cluster']:.3f} entre (diferencia {f['difference']:.3f})"
        )
    texto = (
        f"Se elige k = {mejor['k']} porque es el que mas separa a los conductores del mismo "
        f"grupo de los de grupos distintos: " + "; ".join(partes) + ". "
        "Con k pequeno hay pocas rachas posibles y casi todos los conductores las comparten, "
        "asi que hasta los de grupos distintos se parecen. Con k grande cada conductor tiene "
        "rachas mas propias: baja el parecido entre grupos, pero tambien el de dentro del grupo, "
        "y si los vecinos de verdad quedan con un Jaccard muy bajo, LSH necesita un umbral muy "
        "bajo y da demasiados candidatos. El mejor k es el punto donde la diferencia es mayor."
    )
    if mejor["difference"] < 0.01:
        texto += (" Ojo: en esta corrida ningun k separa a los grupos (la diferencia es casi 0). "
                  "Pasa cuando la ciudad tiene muy pocas zonas: cada territorio es casi la ciudad "
                  "entera y todos los conductores se mueven igual.")
    if mejor["k"] != 3:
        texto += " El dataset y las demas tasks siguen usando k = 3, como pide el enunciado."
    return texto


if __name__ == "__main__":
    conductores = leer_conductores(SIMILARITY_JSONL)
    zonas = sorted(set(z for c in conductores for z in c["zone_sequence"]))
    print(f"Task 3 (W5): {len(conductores):,} conductores, {len(zonas)} zonas")

    # Los mismos pares para los tres k, para que la comparacion sea justa.
    rng = random.Random(SEED)
    mismos, distintos = sortear_pares(conductores, rng)
    print(f"Pares sorteados: {len(mismos):,} del mismo grupo y {len(distintos):,} de grupos distintos")

    filas = []
    for k in K_VALUES:
        conjuntos = [shingles(c["zone_sequence"], k) for c in conductores]

        todos = set()
        for s in conjuntos:
            todos |= s

        fila = {
            "k": k,
            "mean_set_size": round(promedio([len(s) for s in conjuntos]), 2),
            "possible_shingles": len(zonas) ** k,
            "observed_shingles": len(todos),
            "jaccard_same_cluster": round(promedio([jaccard(conjuntos[i], conjuntos[j]) for i, j in mismos]), 4),
            "jaccard_other_cluster": round(promedio([jaccard(conjuntos[i], conjuntos[j]) for i, j in distintos]), 4),
        }
        fila["difference"] = round(fila["jaccard_same_cluster"] - fila["jaccard_other_cluster"], 4)
        if fila["jaccard_other_cluster"] > 0:
            fila["ratio"] = round(fila["jaccard_same_cluster"] / fila["jaccard_other_cluster"], 3)
        else:
            fila["ratio"] = 0.0

        # Control: con k = 3, el tamano de cada conjunto debe ser el shingle_count del archivo.
        if k == 3:
            fila["matches_dataset_shingle_count"] = all(
                len(s) == c["shingle_count"] for s, c in zip(conjuntos, conductores))

        filas.append(fila)
        print(f"  k = {k}: {fila['mean_set_size']:6.1f} shingles por conductor | "
              f"posibles {fila['possible_shingles']:>6,} | observados {fila['observed_shingles']:>6,} | "
              f"Jaccard mismo {fila['jaccard_same_cluster']:.3f} / entre {fila['jaccard_other_cluster']:.3f} "
              f"(diferencia {fila['difference']:.3f})")

    # El mejor k: la mayor diferencia entre dentro y entre grupos.
    # Si empatan, el menor k (conjuntos mas pequenos, mas baratos).
    mejor = max(filas, key=lambda f: (f["difference"], -f["k"]))
    resultado = {
        "n_drivers": len(conductores),
        "n_zones": len(zonas),
        "pairs_same_cluster": len(mismos),
        "pairs_other_cluster": len(distintos),
        "k_values": filas,
        "best_k": mejor["k"],
        "best_k_criterion": "mayor diferencia entre el Jaccard medio dentro de un grupo y entre grupos",
        "best_k_reason": razon_mejor_k(filas, mejor),
    }

    with open(os.path.join(RESULTS_DIR, "task3.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    print(f"Mejor k = {mejor['k']}")
    print("Resultados guardados en results/w5/task3.json")
