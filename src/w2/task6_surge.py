"""
Workshop 2 - Task 6 - Medidor de surge en vivo (Panel C del dashboard)
-----------------------------------------------------------------------
El Panel C pide un "live surge meter per zone (requests vs. Unit 1
probability bound)". Ninguna task del enunciado lo produce, asi que lo
calcula el dashboard aqui, con la cota de la Task 5 del Workshop 1:

    X = solicitudes de la zona en una hora ~ Poisson(mu)
    umbral de surge  T = mu + k * sqrt(mu)
    Cantelli:  P(X >= T) <= 1 / (1 + k^2)
    Chernoff:  P(X >= T) <= (e^d / (1+d)^(1+d))^mu,   d = k / sqrt(mu)

En un stream mu no se conoce de antemano: se estima por (zona, hora del dia)
con la media de los dias YA vistos, que son 24 x zonas sumas y conteos. El
primer dia no tiene historia y solo calienta. Durante la hora se cuenta en
vivo; el medidor es conteo / T y el surge se dispara en el evento que cruza T.

Al final se compara la frecuencia observada de horas con surge contra la cola
exacta de Poisson y contra las dos cotas, todas calculadas con el mu ESTIMADO
como si fuera el verdadero: son referencias del modelo ajustado, no garantias
sobre la intensidad real del generador. La frecuencia observada es el
contraste empirico; que quede debajo de una cota es coherente con el modelo,
pero no lo valida por si solo.

Para la animacion del panel se guarda un dia completo, hora por hora: el dia
con la hora de mas zonas en surge entre los que tienen 7 o mas dias de
historia (con menos, mu es demasiado ruidoso para fiarse del umbral).
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


K_SIGMA = _env("RIDES_K_SIGMA", float, 2.0)   # el mismo parametro que la Task 5 del W1
MIN_HISTORIA_REPLAY = 7


def cantelli(k):
    return 1 / (1 + k * k)


def chernoff_poisson(mu, a):
    """P(X >= mu + a) <= (e^d / (1+d)^(1+d))^mu,  d = a/mu"""
    if mu <= 0 or a <= 0:
        return 1.0
    d = a / mu
    return math.exp(mu * (d - (1 + d) * math.log(1 + d)))


def poisson_tail(mu, t):
    """P(X >= t) exacta para X ~ Poisson(mu), t real (se usa ceil(t))."""
    t = math.ceil(t)
    if t <= 0:
        return 1.0
    log_mu = math.log(mu)
    cdf = sum(math.exp(x * log_mu - mu - math.lgamma(x + 1)) for x in range(t))
    return max(0.0, 1.0 - cdf)


def medir_horas(stream_csv, k):
    """Recorre el stream una vez. Devuelve una fila por (zona, dia, hora)
    evaluada (las que ya tenian historia) y la fecha de cada dia. Los dias se
    numeran desde la medianoche del primer evento."""
    hist_sum = defaultdict(int)     # (zona, hora del dia) -> suma de dias previos
    hist_days = defaultdict(int)    #                       -> cuantos dias
    live = defaultdict(int)         # zona -> conteo en vivo de la hora en curso
    umbral = {}                     # zona -> (mu, T) de la hora en curso
    cruce = {}                      # zona -> minuto en que cruzo T esta hora
    zonas = set()
    filas = []
    inicio = None                   # medianoche del primer dia del stream
    actual = None                   # hora abierta (datetime)

    def abrir(hod):
        umbral.clear()
        cruce.clear()
        for z in zonas:
            d = hist_days[(z, hod)]
            # Con mu = 0 el umbral es 0 y cualquier conteo "dispararia" surge:
            # una zona sin historia en esa hora no se evalua.
            if d and hist_sum[(z, hod)] > 0:
                mu = hist_sum[(z, hod)] / d
                umbral[z] = (mu, mu + k * math.sqrt(mu))

    def cerrar(dia, hod):
        # La historia se actualiza despues de decidir, no antes.
        for z in sorted(zonas):
            c = live[z]
            if z in umbral:
                mu, T = umbral[z]
                filas.append({"zone": z, "day": dia, "hour": hod, "count": c,
                              "mu": mu, "threshold": T, "surge": c >= T,
                              "cross_minute": cruce.get(z)})
            hist_sum[(z, hod)] += c
            hist_days[(z, hod)] += 1
        live.clear()

    with open(stream_csv, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        i_ts, i_zone = header.index("timestamp"), header.index("pickup_zone")
        clave = None
        for rec in reader:
            ts, z = rec[i_ts], rec[i_zone]
            if ts[:13] != clave:
                clave = ts[:13]
                hora = datetime.strptime(clave, "%Y-%m-%dT%H")
                if actual is None:
                    inicio = hora.replace(hour=0)
                    actual = hora
                    abrir(actual.hour)
                # Se cierran la hora en curso y las que pasaron sin ningun
                # evento: una hora vacia es un conteo de 0, no una hora que no
                # existio (igual que en src/w3/task6_surge.py).
                while actual < hora:
                    cerrar((actual - inicio).days, actual.hour)
                    actual += timedelta(hours=1)
                    abrir(actual.hour)
            # La zona entra a la historia en la hora en que aparece, no en las
            # horas vacias que se acaban de cerrar.
            zonas.add(z)
            live[z] += 1
            u = umbral.get(z)
            if u and z not in cruce and live[z] >= u[1]:
                cruce[z] = int(ts[14:16])
        if actual is not None:
            cerrar((actual - inicio).days, actual.hour)

    for r in filas:
        r["chernoff"] = chernoff_poisson(r["mu"], k * math.sqrt(r["mu"]))
        r["poisson_tail"] = poisson_tail(r["mu"], r["threshold"])
    n_dias = (actual - inicio).days + 1 if actual is not None else 0
    nombres = {i: (inicio + timedelta(days=i)).date().isoformat() for i in range(n_dias)}
    return filas, nombres


def resumir(filas):
    n = len(filas)
    surged = sum(r["surge"] for r in filas)
    return {
        "slots": n,
        "surged": surged,
        "surge_rate": round(surged / n, 4) if n else 0.0,
        "poisson_tail_mean": round(sum(r["poisson_tail"] for r in filas) / n, 4) if n else 0.0,
        "chernoff_mean": round(sum(r["chernoff"] for r in filas) / n, 4) if n else 0.0,
    }


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        raise SystemExit("Falta data/stream.csv: corre primero src/w2/dataset.py")

    filas, nombres = medir_horas(STREAM_CSV, K_SIGMA)
    if not filas:
        raise SystemExit("El stream tiene un solo dia: no hay historia para estimar mu.")
    zonas = sorted({r["zone"] for r in filas})

    by_zone = []
    for z in zonas:
        s = resumir([r for r in filas if r["zone"] == z])
        by_zone.append({"zone": z, **s})

    # Dia para la animacion: el de la hora con mas zonas en surge (y, entre
    # esas, mas solicitudes), entre los dias con historia suficiente.
    por_hora = defaultdict(list)
    for r in filas:
        por_hora[(r["day"], r["hour"])].append(r)
    candidatas = [h for h in por_hora if h[0] >= MIN_HISTORIA_REPLAY] or list(por_hora)
    dia = max(candidatas, key=lambda h: (sum(r["surge"] for r in por_hora[h]),
                                         sum(r["count"] for r in por_hora[h])))[0]
    horas = []
    for hod in range(24):
        rs = por_hora.get((dia, hod))
        if not rs:
            continue
        zs = []
        for r in rs:
            e = {"zone": r["zone"], "count": r["count"], "mu": round(r["mu"], 1),
                 "threshold": round(r["threshold"], 1), "surge": r["surge"]}
            if r["cross_minute"] is not None:
                e["cross_minute"] = r["cross_minute"]
            zs.append(e)
        horas.append({"hour": hod, "zones": zs})

    out = {
        "k_sigma": K_SIGMA,
        "cantelli_bound": round(cantelli(K_SIGMA), 4),
        "overall": resumir(filas),
        "by_zone": by_zone,
        "replay": {"day": dia, "date": nombres[dia], "hours": horas},
    }
    with open(os.path.join(RESULTS_DIR, "task6.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    a = out["overall"]
    print(f"Medidor de surge: T = mu + {K_SIGMA:g} sqrt(mu), mu de los dias previos")
    print(f"  {a['slots']:,} horas-zona evaluadas (el primer dia solo calienta la historia)")
    print(f"  Horas con surge: {a['surged']} = {a['surge_rate']:.2%}")
    print(f"  Cola exacta de Poisson (promedio): {a['poisson_tail_mean']:.2%}   "
          f"Chernoff: {a['chernoff_mean']:.2%}   Cantelli: {out['cantelli_bound']:.2%}")
    print("  Referencias con mu estimado: Poisson <= Chernoff <= Cantelli; lo observado es el contraste")
    print(f"  {'zona':<12}{'surge':>7}{'tasa':>8}{'Poisson':>9}{'Chernoff':>10}")
    for s in by_zone:
        print(f"  {s['zone']:<12}{s['surged']:>7}{s['surge_rate']:>8.2%}"
              f"{s['poisson_tail_mean']:>9.2%}{s['chernoff_mean']:>10.2%}")
    print(f"  Animacion del panel: dia {dia} ({nombres[dia]}), {len(horas)} horas")
    print("\nResultados guardados en results/w2/task6.json")
