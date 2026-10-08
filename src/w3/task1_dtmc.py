import os
import csv
import json
import math
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")


def leer_edges():
    """{ (from, to): reloc_count } a partir de edges.csv."""
    aristas = defaultdict(int)
    with open(EDGES_CSV, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            aristas[(fila["from_zone"], fila["to_zone"])] += int(fila["reloc_count"])
    return aristas


def construir_M(aristas):
    """Estados ordenados y M[i][j] = reloc_count(i->j) / total que sale de i."""
    estados = sorted({z for (a, b) in aristas for z in (a, b)})
    idx = {z: i for i, z in enumerate(estados)}
    n = len(estados)
    M = [[0.0] * n for _ in range(n)]
    salidas = [0.0] * n
    for (a, b), c in aristas.items():
        salidas[idx[a]] += c
    for (a, b), c in aristas.items():
        M[idx[a]][idx[b]] = c / salidas[idx[a]]
    return estados, M


def clasificar(estados, M):
    n = len(estados)
    # Absorbentes: M[i][i] == 1 (los conductores llegan pero nunca salen)
    absorbing = [estados[i] for i in range(n) if M[i][i] == 1.0]

    # Alcanzabilidad (BFS sobre la matriz): de i se llega a j?
    def alcanza(i):
        visto = {i}
        pila = [i]
        while pila:
            u = pila.pop()
            for v in range(n):
                if M[u][v] > 0 and v not in visto:
                    visto.add(v)
                    pila.append(v)
        return visto

    # Irreducible: desde cualquier estado se llega a todos
    irreducible = all(len(alcanza(i)) == n for i in range(n))

    # Aperiodicidad: gcd de las longitudes de todos los ciclos cerrados.
    # Con n <= 10 basta DFS con deteccion de ciclos y gcd de sus longitudes.
    def es_aperiodico():
        # Si hay un lazo (M[i][i] > 0), ya hay ciclo de longitud 1 -> aperiodico.
        if any(M[i][i] > 0 for i in range(n)):
            return True
        # Sin lazos, probar gcd de ciclos por DFS. (n pequeño)
        g = 0
        color = [0] * n
        profundidad = [0] * n

        def dfs(u, d):
            nonlocal g
            color[u] = 1
            profundidad[u] = d
            for v in range(n):
                if M[u][v] == 0:
                    continue
                if color[v] == 0:
                    dfs(v, d + 1)
                elif color[v] == 1:
                    g = math.gcd(g, d - profundidad[v] + 1)
            color[u] = 2

        for i in range(n):
            if color[i] == 0:
                dfs(i, 0)
        return g == 1

    aperiodic = es_aperiodico()

    # Clases de comunicacion (opcional): SCC por alcance mutuo
    clases = []
    resto = set(range(n))
    while resto:
        i = next(iter(resto))
        A = alcanza(i)
        B = {j for j in resto if i in alcanza(j)}
        # clase = estados que se alcanzan mutuamente con i
        clase = A & B
        # recurrente si no hay salida a otra clase (no transitoria)
        recurrente = all(
            all(M[u][v] == 0 or v in clase for v in range(n))
            for u in clase
        )
        clases.append({
            "states": [estados[j] for j in sorted(clase)],
            "type": "recurrente" if recurrente else "transitoria",
        })
        resto -= clase

    return absorbing, irreducible, aperiodic, clases


if __name__ == "__main__":
    aristas = leer_edges()
    estados, M = construir_M(aristas)
    absorbing, irreducible, aperiodic, clases = clasificar(estados, M)

    resultado = {
        "states": estados,
        "matrix": M,
        "absorbing": absorbing,
        "irreducible": irreducible,
        "aperiodic": aperiodic,
        "classes": clases,
    }

    out = os.path.join(RESULTS_DIR, "task1.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"OK  {len(estados)} zonas, M {len(estados)}x{len(estados)}")
    print(f"    absorbentes: {absorbing or 'ninguna'}")
    print(f"    irreducible: {irreducible} | aperiodica: {aperiodic}")
    for c in clases:
        print(f"    clase {c['type']}: {', '.join(c['states'])}")
