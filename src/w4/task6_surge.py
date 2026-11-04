"""
Workshop 4 - Task 6 - Flujo neto por zona y medidor de surge (Panel F)
----------------------------------------------------------------------
El Panel F pide las zonas ordenadas por net_flow (negativo = salen mas
conductores de los que llegan, candidatas a incentivo de surge) junto al
medidor de surge de la Unidad 1. El Panel E (speedup y shuffle) no necesita
nada de aca: lo arma la web con las Tasks 3 y 5.

net_flow sale de data/nodes.csv (src/w4/dataset.py). Lo que este script
agrega es de donde viene ese numero. Cada recogida es la llegada de una
reubicacion y la salida de la siguiente, salvo el primer viaje de cada
conductor (no tiene llegada) y el ultimo (no tiene salida). Entonces, en cada
zona,

    net_flow = last_rides - first_rides

con first_rides / last_rides = conductores cuyo primer / ultimo viaje de la
ventana fue en esa zona. Se cuentan aca desde stream.csv y se comprueba la
identidad contra nodes.csv.

noise_sd es la desviacion que tendria net_flow si el primer y el ultimo viaje
de cada conductor fueran independientes y salieran de la misma distribucion
por zona, estimada juntando ambos (p = (first + last) / 2D, con D
conductores). Por conductor, X = [ultimo en z] - [primero en z] tiene
varianza 2p(1-p), asi que

    Var(last - first) = 2 D p (1 - p)

Un |net_flow| de una o dos noise_sd es lo que da el azar; con 10 zonas,
alrededor de media zona cae fuera de +-2 noise_sd sin que pase nada. Mucho
mas que eso dice que los conductores empiezan y terminan la ventana en
lugares distintos, que es un efecto de borde de la ventana (la hora a la que
empieza y termina), no un flujo sostenido durante los dias.

El medidor de surge es el de la Task 6 del Workshop 3 (y del Panel C del W2):
para cada zona, que fraccion de sus horas supero T = mu + k * sqrt(mu), con mu
la media de esa (zona, hora del dia) en los dias YA vistos del stream. No se
importa de alla porque las tasks no se importan entre si.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w4")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")
NODES_CSV = os.path.join(DATA_DIR, "nodes.csv")

import csv
import json
import math
import statistics
from collections import defaultdict
from datetime import date


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


K_SIGMA = _env("RIDES_K_SIGMA", float, 2.0)


def leer_stream(stream_csv):
    """Una pasada sobre el stream: solicitudes por (zona, dia, hora del dia),
    la hora en que aparece cada zona y la del ultimo evento (para el medidor),
    y la zona del primer y del ultimo viaje de cada conductor."""
    conteo = defaultdict(int)
    dias = {}
    primero = None
    aparece = {}
    ultima = -1
    inicio, fin = {}, {}
    hora_ini, hora_fin = {}, {}
    filas = []
    with open(stream_csv, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        h = next(reader)
        i_ts, i_zone = h.index("timestamp"), h.index("pickup_zone")
        i_drv, i_seq = h.index("driver_id"), h.index("stream_seq")
        for rec in reader:
            filas.append((int(rec[i_seq]), rec[i_drv], rec[i_zone], rec[i_ts]))
    filas.sort()
    for _seq, driver, z, ts in filas:
        if ts[:10] not in dias:
            fecha = date.fromisoformat(ts[:10])
            primero = primero or fecha
            dias[ts[:10]] = (fecha - primero).days
        dia = dias[ts[:10]]
        t = dia * 24 + int(ts[11:13])
        conteo[(z, dia, int(ts[11:13]))] += 1
        aparece.setdefault(z, t)
        ultima = max(ultima, t)
        hora = t + int(ts[14:16]) / 60
        if driver not in inicio:
            inicio[driver] = z
            hora_ini[driver] = hora
        fin[driver] = z
        hora_fin[driver] = hora
    return conteo, aparece, ultima, inicio, fin, hora_ini, hora_fin


def medidor(conteo, aparece, ultima, z):
    """Horas evaluadas y horas en surge de una zona (el mismo recorrido que
    src/w3/task6_surge.py)."""
    slots = surged = 0
    suma = defaultdict(int)
    vistos = defaultdict(int)
    for t in range(aparece[z], ultima + 1):
        dia, hod = divmod(t, 24)
        c = conteo.get((z, dia, hod), 0)
        if vistos[hod] and suma[hod] > 0:
            mu = suma[hod] / vistos[hod]
            slots += 1
            surged += c >= mu + K_SIGMA * math.sqrt(mu)
        suma[hod] += c
        vistos[hod] += 1
    return slots, surged


if __name__ == "__main__":
    for ruta, quien in ((STREAM_CSV, "src/w2/dataset.py"), (NODES_CSV, "src/w4/dataset.py")):
        if not os.path.exists(ruta):
            raise SystemExit(f"Falta data/{os.path.basename(ruta)}: corre primero {quien}")

    conteo, aparece, ultima, inicio, fin, hora_ini, hora_fin = leer_stream(STREAM_CSV)
    with open(NODES_CSV, newline="", encoding="utf-8") as f:
        nodos = {r["zone_id"]: r for r in csv.DictReader(f)}

    D = len(inicio)
    n_inicio = defaultdict(int)
    n_fin = defaultdict(int)
    for d in inicio:
        n_inicio[inicio[d]] += 1
        n_fin[fin[d]] += 1

    zonas = []
    for z in sorted(nodos):
        n = nodos[z]
        net = int(n["net_flow"])
        if net != n_fin[z] - n_inicio[z]:
            raise SystemExit(f"net_flow de {z} en nodes.csv ({net}) no es last - first "
                             f"({n_fin[z]} - {n_inicio[z]}): nodes.csv y stream.csv son de corridas distintas")
        p = (n_inicio[z] + n_fin[z]) / (2 * D) if D else 0.0
        slots, surged = medidor(conteo, aparece, ultima, z) if z in aparece else (0, 0)
        zonas.append({
            "zone": z,
            "out_reloc_count": int(n["out_reloc_count"]),
            "in_reloc_count": int(n["in_reloc_count"]),
            "net_flow": net,
            "first_rides": n_inicio[z],
            "last_rides": n_fin[z],
            "noise_sd": round(math.sqrt(2 * D * p * (1 - p)), 2),
            "slots": slots,
            "surged": surged,
            "surge_rate": round(surged / slots, 4) if slots else 0.0,
        })
    # Puesto 1 = el flujo mas negativo: la zona que mas conductores pierde.
    for i, s in enumerate(sorted(zonas, key=lambda s: (s["net_flow"], s["zone"])), 1):
        s["net_flow_rank"] = i

    # Cuando empiezan y terminan los conductores, en horas desde la medianoche
    # del primer dia: net_flow compara la demanda de cada zona a esas horas.
    out = {
        "k_sigma": K_SIGMA,
        "drivers": D,
        "first_ride_median_h": round(statistics.median(hora_ini.values()), 2) if D else 0.0,
        "last_ride_median_h": round(statistics.median(hora_fin.values()), 2) if D else 0.0,
        "zones": sorted(zonas, key=lambda s: s["net_flow_rank"]),
    }
    with open(os.path.join(RESULTS_DIR, "task6.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Flujo neto por zona ({D:,} conductores) y medidor de surge, T = mu + {K_SIGMA:g} sqrt(mu)")
    print(f"  {'#':>2} {'zona':<12}{'neto':>6}{'empiezan':>10}{'terminan':>10}{'ruido':>7}{'en sd':>7}{'surge':>8}")
    for s in out["zones"]:
        en_sd = s["net_flow"] / s["noise_sd"] if s["noise_sd"] else 0.0
        print(f"  {s['net_flow_rank']:>2} {s['zone']:<12}{s['net_flow']:>+6}{s['first_rides']:>10}{s['last_rides']:>10}"
              f"{s['noise_sd']:>7.1f}{en_sd:>+7.1f}{s['surge_rate']:>8.2%}")
    print(f"\nLa mitad de los conductores empieza antes de la hora {out['first_ride_median_h']:.1f} y termina despues "
          f"de la {out['last_ride_median_h']:.1f} (horas desde la medianoche del primer dia).")
    print("net_flow = terminan - empiezan: es un efecto de borde de la ventana, no un flujo sostenido.")
    print("Resultados guardados en results/w4/task6.json")
