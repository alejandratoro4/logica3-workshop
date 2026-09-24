"""
Task 4 - Hash Table Operations
--------------------------------
Se modela una tabla hash cuyas "claves" son las solicitudes concurrentes de
viaje (agrupadas por ventanas de tiempo de 5 minutos, ver WINDOW_MIN) que
deben repartirse en
B "colas de despacho" (buckets) por zona pickup_zone. Se implementan y
comparan dos estrategias de balanceo de carga:

  (a) Chaining (encadenamiento separado): cada solicitud se enruta a
      bucket = h(ride_id) mod B (la zona no entra en el hash porque cada tabla
      ES la de una zona y ventana); las colisiones se resuelven
      con una lista enlazada por bucket -> soporta cualquier carga pero puede
      generar buckets muy desbalanceados si llegan muchas solicitudes de la
      misma zona en el mismo minuto (justo lo que se busca detectar: un pico
      de demanda).

  (b) Power of Two Choices (P2C): para cada solicitud se calculan DOS
      posiciones candidatas con dos funciones hash independientes h1, h2, y
      se elige la de MENOR carga actual -> reduce drasticamente la carga
      maxima esperada (de O(log n / log log n) a O(log log n) en la teoria
      clasica de balls-into-bins).

Se reporta, para cada ventana de 5 minutos con alta concurrencia, la carga
maxima de bucket y la distribucion completa, bajo ambas estrategias.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import hashlib
import json
import math
import random
from collections import defaultdict

random.seed(21)


def stable_hash(key) -> int:
    """Hash determinista entre procesos.

    El hash() nativo de Python esta aleatorizado por proceso (PYTHONHASHSEED),
    asi que usarlo hacia que las cargas de buckets cambiaran en cada corrida
    aunque la semilla fuera fija. blake2b da el mismo reparto siempre, que es
    lo que permite comparar dos configuraciones de ciudad y atribuir la
    diferencia a los parametros y no al ruido del interprete.
    """
    return int.from_bytes(
        hashlib.blake2b(repr(key).encode("utf-8"), digest_size=8).digest(), "big"
    )

B = 16  # numero de "colas de despacho" (buckets) por zona


def balls_in_bins_theory(n, B):
    """Carga maxima esperada al repartir n solicitudes en B colas.

    CUIDADO CON LA FORMULA DE CLASE. Las cotas vistas en el modulo de hashing
    -- 3 ln n / ln ln n para chaining, y ln ln n / ln 2 para dos opciones --
    se derivan bajo el supuesto m = n: tantas bolas como bins, o sea una bola
    por bin en promedio. Aqui no es el caso: en la ventana mas concurrida hay
    del orden de 100 solicitudes para B = 16 colas, con carga media n/B muy por
    encima de 1.

    En ese regimen cargado la carga maxima es n/B MAS una desviacion:

        chaining : n/B + sqrt( 2 (n/B) ln B )
        P2C      : n/B + ln ln B / ln 2

    Aplicar la formula de m = n en este escenario haria parecer que las
    mediciones violan la cota, cuando lo que pasa es que esa cota es para otro
    regimen. Con la de aca, lo medido y lo predicho coinciden de cerca.

    La simetrica tambien vale: si se baja la escala de la ciudad, las ventanas
    quedan con n/B < 1 (pocas solicitudes, muchas colas) y entonces es ESTA
    formula la que esta fuera de su regimen. Ahi el valor que devuelve hay que
    leerlo como referencia suelta, no como una cota ajustada.
    """
    if n <= 0 or B <= 1:
        return {"avg_load": 0.0, "chaining_expected_max": 0.0, "p2c_expected_max": 0.0}
    mu = n / B
    chaining = mu + math.sqrt(2 * mu * math.log(B))
    # ln ln B solo esta definido para B > e; con B = 16 lo esta de sobra.
    p2c = mu + (math.log(math.log(B)) / math.log(2) if math.log(B) > 1 else 0.0)
    return {
        "avg_load": round(mu, 3),
        "chaining_expected_max": round(chaining, 2),
        "p2c_expected_max": round(p2c, 2),
    }


class ChainingHashTable:
    """Tabla hash con encadenamiento separado (lista de listas)."""

    def __init__(self, size):
        self.size = size
        self.buckets = [[] for _ in range(size)]

    def _hash(self, key):
        return stable_hash(key) % self.size

    def insert(self, key, value):
        b = self._hash(key)
        self.buckets[b].append(value)
        return b

    def loads(self):
        return [len(b) for b in self.buckets]


class PowerOfTwoChoicesTable:
    """Balanceo 'power of two choices': para cada insercion se consultan dos
    buckets candidatos (con hashes independientes) y se elige el menos
    cargado."""

    def __init__(self, size):
        self.size = size
        self.buckets = [[] for _ in range(size)]
        # dos "sales" independientes para simular dos funciones hash h1, h2
        self.salt1 = random.randint(1, 10 ** 9)
        self.salt2 = random.randint(1, 10 ** 9)

    def _h1(self, key):
        return stable_hash((self.salt1, key)) % self.size

    def _h2(self, key):
        return stable_hash((self.salt2, key)) % self.size

    def insert(self, key, value):
        c1, c2 = self._h1(key), self._h2(key)
        chosen = c1 if len(self.buckets[c1]) <= len(self.buckets[c2]) else c2
        self.buckets[chosen].append(value)
        return chosen

    def loads(self):
        return [len(b) for b in self.buckets]


def load_requests(csv_path):
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def group_by_zone_window(rows, window_minutes=5):
    groups = defaultdict(list)
    for r in rows:
        ts = r["timestamp"]
        minute = int(ts[14:16])
        bucket_minute = (minute // window_minutes) * window_minutes
        window_key = f"{ts[:14]}{bucket_minute:02d}"  # YYYY-MM-DDTHH:MM (redondeado)
        groups[(r["pickup_zone"], window_key)].append(r["ride_id"])
    return groups


if __name__ == "__main__":
    rows = load_requests(RIDES_CSV)
    WINDOW_MIN = 5
    groups = group_by_zone_window(rows, WINDOW_MIN)

    # Nos quedamos con las ventanas (zona, minuto) de MAYOR concurrencia,
    # que son las candidatas naturales a saturar buckets/colas de despacho.
    top_windows = sorted(groups.items(), key=lambda kv: -len(kv[1]))[:15]

    comparisons = []
    for (zone, minute), ride_ids in top_windows:
        chain_table = ChainingHashTable(B)
        p2c_table = PowerOfTwoChoicesTable(B)
        for rid in ride_ids:
            chain_table.insert(rid, rid)
            p2c_table.insert(rid, rid)

        chain_loads = chain_table.loads()
        p2c_loads = p2c_table.loads()

        comparisons.append({
            "zone": zone, "minute": minute, "n_requests": len(ride_ids),
            "chaining": {
                "loads": chain_loads,
                "max_load": max(chain_loads),
                "variance": round(sum((l - len(ride_ids) / B) ** 2 for l in chain_loads) / B, 3),
            },
            "power_of_two_choices": {
                "loads": p2c_loads,
                "max_load": max(p2c_loads),
                "variance": round(sum((l - len(ride_ids) / B) ** 2 for l in p2c_loads) / B, 3),
            },
            "theory": balls_in_bins_theory(len(ride_ids), B),
        })

    # Agregado global: promedio de max_load / varianza sobre TODAS las
    # ventanas (zona, minuto) con al menos 2 solicitudes, no solo el top-15.
    all_max_chain, all_max_p2c = [], []
    for (zone, minute), ride_ids in groups.items():
        if len(ride_ids) < 2:
            continue
        ct = ChainingHashTable(B)
        pt = PowerOfTwoChoicesTable(B)
        for rid in ride_ids:
            ct.insert(rid, rid)
            pt.insert(rid, rid)
        all_max_chain.append(max(ct.loads()))
        all_max_p2c.append(max(pt.loads()))

    summary = {
        "B_buckets": B,
        "n_windows_analyzed": len(all_max_chain),
        "avg_max_load_chaining": round(sum(all_max_chain) / len(all_max_chain), 3),
        "avg_max_load_p2c": round(sum(all_max_p2c) / len(all_max_p2c), 3),
        "worst_max_load_chaining": max(all_max_chain),
        "worst_max_load_p2c": max(all_max_p2c),
    }

    summary["theory_note"] = (
        "Cotas para el regimen cargado (n/B >> 1): chaining n/B + sqrt(2(n/B)ln B), "
        "P2C n/B + ln ln B / ln 2. Las formulas de clase (3 ln n / ln ln n y "
        "ln ln n / ln 2) suponen m = n y no aplican aqui."
    )

    out = {"top_windows": comparisons, "summary": summary}
    with open(os.path.join(RESULTS_DIR, "task4_results.json"), "w") as f:
        json.dump(out, f, indent=2)

    print(f"Buckets por zona (B) = {B}")
    print("\n== Top ventanas (zona, minuto) por concurrencia ==")
    print(f"  {'zona':<12}{'n':>5}{'chain':>7}{'teor.':>7}{'P2C':>6}{'teor.':>7}")
    for c in comparisons[:8]:
        t = c["theory"]
        print(f"  {c['zone']:<12}{c['n_requests']:>5}"
              f"{c['chaining']['max_load']:>7}{t['chaining_expected_max']:>7.1f}"
              f"{c['power_of_two_choices']['max_load']:>6}{t['p2c_expected_max']:>7.1f}")
    print("  (teor. = regimen cargado n/B >> 1, no la formula de m=n; ver "
          "balls_in_bins_theory)")

    print("\n== Resumen global ({} ventanas) ==".format(summary["n_windows_analyzed"]))
    print(f"  Carga maxima promedio (chaining): {summary['avg_max_load_chaining']}")
    print(f"  Carga maxima promedio (P2C):      {summary['avg_max_load_p2c']}")
    print(f"  Peor caso (chaining): {summary['worst_max_load_chaining']}")
    print(f"  Peor caso (P2C):      {summary['worst_max_load_p2c']}")
    print("\nResultados guardados en results/task4_results.json")
