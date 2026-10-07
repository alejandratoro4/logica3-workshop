"""
Workshop 3 - Task 6 - Medidor de surge por zona (para el Panel D)
------------------------------------------------------------------
El Panel D pide el ranking de PageRank contra el de volumen "overlaid on
Unit 1's surge meter". El ranking sale de la Task 3; este script pone el
medidor: para cada zona, que fraccion de sus horas supero el umbral de surge
de la Task 5 del Workshop 1,

    T = mu + k * sqrt(mu),   mu = media de esa (zona, hora del dia)
                                  en los dias YA vistos del stream

que es el mismo medidor del Panel C del Workshop 2 (src/w2/task6_surge.py),
resumido por zona. No se importa de alla porque los scripts no se importan
entre si: cada uno corre solo, igual en la terminal que en el navegador.

Escenario alterno (dispatch_scenario): con el grafo del enunciado, en la
corrida canonica, el ranking de PageRank sale igual al de volumen, porque en
el W1 el conductor de cada viaje se sortea al azar (ver src/w3/dataset.py).
Para explorar otra estructura, este script calcula PageRank tambien sobre
data/edges_despacho.csv,
el grafo con despacho espacial, y guarda por zona:

    pi           la distribucion estacionaria de M (pi = pi M), que queda muy
                 cerca del volumen
    pagerank     la de la caminata con reinicios: con probabilidad 1 - beta el
                 conductor salta a una zona al azar
    stay_prob    M[i][i], la probabilidad de que el conductor se quede
    inflow_mean  media de la columna i de M: la probabilidad de llegar a i en
                 un paso desde una zona elegida al azar

pagerank - pi es lo que cada zona pierde o gana con los reinicios, y es lo que
mueve los puestos respecto al volumen. stay_prob e inflow_mean son
diagnosticos para leer ese cambio, no una regla: PageRank mezcla caminatas de
todas las longitudes (con beta = 0.85, los pasos 0 y 1 pesan solo el 28%).
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")
EDGES_DESPACHO_CSV = os.path.join(DATA_DIR, "edges_despacho.csv")

import csv
import json
import math
from collections import defaultdict
from datetime import date


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


K_SIGMA = _env("RIDES_K_SIGMA", float, 2.0)
BETA = 0.85


def escenario_despacho(edges_csv, volumen):
    """PageRank ponderado por reloc_count sobre el grafo con despacho
    espacial, con el puesto por volumen y las dos columnas que lo explican."""
    count = defaultdict(int)
    with open(edges_csv, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            count[(r["from_zone"], r["to_zone"])] += int(r["reloc_count"])
    zonas = sorted(volumen)
    n = len(zonas)
    M = []
    for a in zonas:
        sale = sum(count[(a, b)] for b in zonas)
        M.append([count[(a, b)] / sale if sale else 1 / n for b in zonas])

    def iterar(beta):
        # beta = 1 da pi = pi M; beta < 1, PageRank con reinicio uniforme.
        v = [1 / n] * n
        for _ in range(5000):
            nuevo = [beta * sum(v[i] * M[i][j] for i in range(n)) + (1 - beta) / n for j in range(n)]
            listo = sum(abs(x - y) for x, y in zip(nuevo, v)) < 1e-12
            v = nuevo
            if listo:
                break
        return v

    v = iterar(BETA)
    pi = iterar(1.0)

    def puestos(valor):
        orden = sorted(zonas, key=lambda z: (-valor[z], z))
        return {z: i + 1 for i, z in enumerate(orden)}

    pr = dict(zip(zonas, v))
    p_pr, p_vol = puestos(pr), puestos(volumen)
    return {
        "beta": BETA,
        "zones": [{
            "zone": z,
            "pi": round(pi[i], 4),
            "pagerank": round(pr[z], 4),
            "pagerank_rank": p_pr[z],
            "volume_rank": p_vol[z],
            "stay_prob": round(M[i][i], 4),
            "inflow_mean": round(sum(M[k][i] for k in range(n)) / n, 4),
        } for i, z in enumerate(zonas)],
    }


def conteos_por_hora(stream_csv):
    """{(zona, dia, hora del dia): solicitudes}, con los dias numerados desde
    el primero del stream (un dia sin eventos tambien cuenta). Las horas sin
    solicitudes de una zona cuentan 0.

    Tambien devuelve, en horas desde la medianoche del primer dia, la hora en
    que aparece cada zona y la del ultimo evento: el intervalo observado, el
    mismo que recorre src/w2/task6_surge.py en vivo (una zona entra a la
    historia cuando aparece, y nada se cuenta despues del ultimo evento)."""
    conteo = defaultdict(int)
    dias = {}
    primero = None
    aparece = {}
    ultima = -1
    with open(stream_csv, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        i_ts, i_zone = header.index("timestamp"), header.index("pickup_zone")
        for rec in reader:
            ts, z = rec[i_ts], rec[i_zone]
            if ts[:10] not in dias:
                fecha = date.fromisoformat(ts[:10])
                primero = primero or fecha
                dias[ts[:10]] = (fecha - primero).days
            dia = dias[ts[:10]]
            t = dia * 24 + int(ts[11:13])
            conteo[(z, dia, int(ts[11:13]))] += 1
            aparece.setdefault(z, t)
            ultima = max(ultima, t)
    return conteo, aparece, ultima


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero src/w2/dataset.py")

    conteo, aparece, ultima = conteos_por_hora(STREAM_CSV)
    out_zonas = []
    for z in sorted(aparece):
        slots = surged = 0
        suma = defaultdict(int)         # hora del dia -> suma de los dias previos
        vistos = defaultdict(int)       #              -> cuantos dias
        for t in range(aparece[z], ultima + 1):
            dia, hod = divmod(t, 24)
            c = conteo.get((z, dia, hod), 0)
            if vistos[hod] and suma[hod] > 0:
                mu = suma[hod] / vistos[hod]
                slots += 1
                surged += c >= mu + K_SIGMA * math.sqrt(mu)
            suma[hod] += c
            vistos[hod] += 1
        out_zonas.append({"zone": z, "slots": slots, "surged": surged,
                          "surge_rate": round(surged / slots, 4) if slots else 0.0})

    if not os.path.exists(EDGES_DESPACHO_CSV):
        raise SystemExit("Falta data/edges_despacho.csv: corre primero src/w3/dataset.py")
    volumen = defaultdict(int)
    for (z, _dia, _hora), c in conteo.items():
        volumen[z] += c
    alterno = escenario_despacho(EDGES_DESPACHO_CSV, volumen)

    out = {"k_sigma": K_SIGMA, "zones": out_zonas, "dispatch_scenario": alterno}
    with open(os.path.join(RESULTS_DIR, "task6.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Medidor de surge por zona: T = mu + {K_SIGMA:g} sqrt(mu), mu de los dias previos")
    print(f"  {'zona':<12}{'horas':>7}{'surge':>7}{'tasa':>8}")
    for s in out_zonas:
        print(f"  {s['zone']:<12}{s['slots']:>7}{s['surged']:>7}{s['surge_rate']:>8.2%}")
    print(f"\nEscenario alterno (despacho espacial), PageRank con beta = {BETA:g}:")
    print(f"  {'zona':<12}{'vol':>4}{'PR':>4}{'pi':>8}{'pagerank':>10}{'PR - pi':>9}{'quedarse':>10}{'llegada':>9}")
    for s in sorted(alterno["zones"], key=lambda s: s["pagerank_rank"]):
        print(f"  {s['zone']:<12}{s['volume_rank']:>4}{s['pagerank_rank']:>4}{s['pi']:>8.4f}{s['pagerank']:>10.4f}"
              f"{s['pagerank'] - s['pi']:>+9.4f}{s['stay_prob']:>10.3f}{s['inflow_mean']:>9.3f}")
    print("\nResultados guardados en results/w3/task6.json")
