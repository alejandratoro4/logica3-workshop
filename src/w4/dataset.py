"""
dataset.py (Workshop 4)
-----------------------
Workshop 4 - prepara el stream de la Unidad 2 para correr el grafo de la
Unidad 3 como jobs de MapReduce.

Escribe dos cosas:

1. data/w4/part-00.csv ... part-07.csv: stream.csv partido en N_FRAGMENTOS
   archivos, como los bloques de un sistema de archivos distribuido. Cada
   fragmento es un rango contiguo de stream_seq, asi que los viajes de un
   mismo conductor quedan repartidos entre fragmentos: por eso el Job 1
   necesita el shuffle por driver_id para volver a juntarlos. Solo lleva las
   columnas que usan los jobs.

2. data/nodes.csv: el resumen por zona de la plantilla del enunciado, una
   fila por zona. Es la referencia contra la que la Task 1 valida lo que
   calcula su Job 2, y lo que lee el Panel F (src/w4/task6_surge.py).

       zone_id                  zona de recogida
       out_reloc_count          reubicaciones que salen de la zona (suma de
                                su fila en edges.csv)
       in_reloc_count           reubicaciones que llegan (suma de su columna)
       net_flow                 in_reloc_count - out_reloc_count
       avg_fare                 tarifa media de los viajes que llegan por
                                reubicacion, es decir, de los viajes de la
                                zona salvo el primero de cada conductor (la
                                media de avg_fare de las aristas que entran,
                                ponderada por reloc_count)
       avg_wait_for_driver_sec  la espera media de esos mismos viajes

Que esperar de net_flow: cada recogida es la llegada de una reubicacion y la
salida de la siguiente, salvo el primer viaje de cada conductor (no tiene
llegada) y el ultimo (no tiene salida). Asi que, en cada zona,

    net_flow = (conductores que terminan ahi) - (conductores que empiezan ahi)

es un efecto de borde de la ventana de N_DAYS dias, del orden de la raiz del
numero de conductores, no un flujo sostenido. Es un resultado valido; el
Panel F lo muestra con su banda de ruido.

Este script calcula nodes.csv en una pasada sobre stream.csv (sin MapReduce)
y comprueba que sus conteos coinciden con edges.csv del Workshop 3.

Reproducible: no usa azar. Misma ciudad -> mismos bytes.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w4")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
NODES_CSV = os.path.join(DATA_DIR, "nodes.csv")
FRAGMENTOS_DIR = os.path.join(DATA_DIR, "w4")

import csv
from collections import defaultdict

N_FRAGMENTOS = 8          # el enunciado pide >= 8
COLUMNAS = ["stream_seq", "driver_id", "pickup_zone", "fare", "wait_for_driver_sec"]
FIELDS = ["zone_id", "out_reloc_count", "in_reloc_count", "net_flow",
          "avg_fare", "avg_wait_for_driver_sec"]


def escribir_fragmentos(filas):
    """Reparte las filas (ya en orden de stream_seq) en N_FRAGMENTOS archivos
    de tamano casi igual. Borra los part-*.csv de una corrida anterior, que
    con menos fragmentos se mezclarian con los nuevos."""
    os.makedirs(FRAGMENTOS_DIR, exist_ok=True)
    for f in os.listdir(FRAGMENTOS_DIR):
        if f.startswith("part-") and f.endswith(".csv"):
            os.remove(os.path.join(FRAGMENTOS_DIR, f))
    n = len(filas)
    paso, sobra = divmod(n, N_FRAGMENTOS)
    i = 0
    tamanos = []
    for k in range(N_FRAGMENTOS):
        j = i + paso + (1 if k < sobra else 0)
        with open(os.path.join(FRAGMENTOS_DIR, f"part-{k:02d}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(COLUMNAS)
            w.writerows(filas[i:j])
        tamanos.append(j - i)
        i = j
    return tamanos


def resumen_por_zona(filas):
    """nodes.csv a partir del stream: para cada conductor, en orden de
    stream_seq, cada viaje despues del primero es una reubicacion desde la
    zona del anterior."""
    ultimo = {}
    sale = defaultdict(int)
    llega = defaultdict(int)
    fare = defaultdict(float)
    wait = defaultdict(float)
    zonas = set()
    for _seq, driver, zona, f, w in filas:
        zonas.add(zona)
        if driver in ultimo:
            sale[ultimo[driver]] += 1
            llega[zona] += 1
            fare[zona] += float(f)
            wait[zona] += float(w)
        ultimo[driver] = zona
    out = []
    for z in sorted(zonas):
        out.append({
            "zone_id": z,
            "out_reloc_count": sale[z],
            "in_reloc_count": llega[z],
            "net_flow": llega[z] - sale[z],
            "avg_fare": round(fare[z] / llega[z], 2) if llega[z] else 0.0,
            "avg_wait_for_driver_sec": round(wait[z] / llega[z], 2) if llega[z] else 0.0,
        })
    return out


def comprobar_contra_edges(nodos):
    """Los conteos de salida y llegada tienen que ser la suma de la fila y de
    la columna de cada zona en edges.csv. Si no, el stream y el grafo vienen
    de corridas distintas."""
    if not os.path.exists(EDGES_CSV):
        raise SystemExit("Falta data/edges.csv: corre primero src/w3/dataset.py")
    fila = defaultdict(int)
    columna = defaultdict(int)
    with open(EDGES_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            fila[r["from_zone"]] += int(r["reloc_count"])
            columna[r["to_zone"]] += int(r["reloc_count"])
    malas = [n["zone_id"] for n in nodos
             if n["out_reloc_count"] != fila[n["zone_id"]] or n["in_reloc_count"] != columna[n["zone_id"]]]
    if malas:
        raise SystemExit(f"nodes.csv no coincide con edges.csv en {malas}: vuelve a correr src/w3/dataset.py")


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero src/w2/dataset.py")

    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        h = next(reader)
        idx = [h.index(c) for c in COLUMNAS]
        filas = [[rec[i] for i in idx] for rec in reader]
    filas.sort(key=lambda r: int(r[0]))

    tamanos = escribir_fragmentos(filas)
    nodos = resumen_por_zona(filas)
    comprobar_contra_edges(nodos)

    with open(NODES_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(nodos)

    conductores = len({r[1] for r in filas})
    print(f"Fragmentos: {N_FRAGMENTOS} en data/w4/, {len(filas):,} viajes "
          f"({min(tamanos):,} a {max(tamanos):,} por fragmento), {conductores:,} conductores")
    print(f"Resumen por zona -> data/nodes.csv ({len(nodos)} zonas), coincide con edges.csv")
    print(f"  {'zona':<12}{'salen':>9}{'llegan':>9}{'neto':>7}{'tarifa':>10}{'espera':>8}")
    for n in nodos:
        print(f"  {n['zone_id']:<12}{n['out_reloc_count']:>9,}{n['in_reloc_count']:>9,}{n['net_flow']:>+7}"
              f"{n['avg_fare']:>10,.0f}{n['avg_wait_for_driver_sec']:>8.1f}")
