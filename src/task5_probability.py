"""
Task 5 - Probability Analysis (Chebyshev vs Chernoff)
-----------------------------------------------------
Para cada zona se toma su hora de mayor demanda y se modela el numero de
solicitudes X en esa hora como Poisson(mu), con mu estimado como el promedio de
los conteos diarios observados. La tarifa dinamica (surge) se activa cuando

    X >= mu + k * sigma,      sigma = sqrt(mu)  (desviacion bajo el modelo)

y se acota P(X >= umbral) de tres maneras:

  - Chebyshev (version unilateral, Cantelli): P(X - mu >= t) <= s^2/(s^2 + t^2).
    Con t = k*sigma queda 1/(1 + k^2): identica en todas las zonas, porque solo
    usa media y varianza.
  - Chernoff (multiplicativa): P(X >= (1+d) mu) <= (e^d / (1+d)^(1+d))^mu, con
    d = k*sigma/mu = k/sqrt(mu). Usa la forma completa del modelo y decae
    exponencialmente.
  - Monte Carlo: la frecuencia con la que un Poisson(mu) simulado alcanza el
    umbral. Es "lo que de verdad ocurre" bajo el modelo; se reporta tambien la
    probabilidad exacta de la cola Poisson para verificar la simulacion.

Como X es entero, X >= mu + k*sigma equivale a X >= ceil(mu + k*sigma): las
cotas se evaluan en el valor real y la simulacion cuenta contra el entero, y
ambas se refieren al mismo evento.

Ademas se reportan los 14 conteos diarios observados y su desviacion empirica
sigma_hat, para contrastar el supuesto Poisson (sigma_hat ~ sqrt(mu)) con los
datos.

Salida: results/task5_results.json, con las claves que lee build_panel_c en
dashboard/build_dashboard.py.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")
RESULTS_JSON = os.path.join(RESULTS_DIR, "task5_results.json")

import csv
import json
import math
import random
from collections import defaultdict
from datetime import datetime


def _env(name, cast, default):
    """Parametros por variable de entorno; el dashboard los fija desde su panel.
    Sin variables de entorno se usan los valores del informe."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


K_SIGMA = _env("RIDES_K_SIGMA", float, 2.0)
MC_TRIALS = _env("RIDES_MC_TRIALS", int, 50000)

# RNG propio y con semilla fija: la corrida es reproducible.
rng = random.Random(55)


# ---------------------------------------------------------------------------
# Muestreo Poisson. web/lib/poisson.ts es un port de esta funcion: si se cambia
# aqui, hay que cambiarla alla, para que el medidor en vivo del Panel C converja
# al mismo valor que el Monte Carlo de este script.
# ---------------------------------------------------------------------------
def poisson_sample(lam, rnd=rng):
    """Knuth por debajo de 30; por encima, rechazo con propuesta logistica
    (Atkinson), porque el producto de uniformes hace underflow con lam grande."""
    if lam <= 0:
        return 0

    if lam < 30:
        L = math.exp(-lam)
        k = 0
        p = 1.0
        while True:
            k += 1
            p *= rnd.random()
            if p <= L:
                return k - 1

    c = 0.767 - 3.36 / lam
    beta = math.pi / math.sqrt(3.0 * lam)
    alpha = beta * lam
    k_const = math.log(c) - lam - math.log(beta)

    for _ in range(10000):
        u = rnd.random()
        if u <= 0 or u >= 1:
            continue
        x = (alpha - math.log((1 - u) / u)) / beta
        n = math.floor(x + 0.5)
        if n < 0:
            continue
        v = rnd.random()
        if v <= 0:
            continue
        y = alpha - beta * x
        lhs = y + math.log(v / (1 + math.exp(y)) ** 2)
        rhs = k_const + n * math.log(lam) - math.lgamma(n + 1)
        if lhs <= rhs:
            return n
    # No deberia alcanzarse: el rechazo acepta en ~1.2 intentos.
    return round(lam)


# ---------------------------------------------------------------------------
# Cotas
# ---------------------------------------------------------------------------
def chebyshev_bound(k):
    """Cantelli: P(X - mu >= k*sigma) <= 1 / (1 + k^2)."""
    return 1.0 / (1.0 + k * k)


def chernoff_bound(mu, delta):
    """P(X >= (1+delta) mu) <= (e^delta / (1+delta)^(1+delta))^mu.
    Se calcula en logaritmos para no desbordar con mu grande."""
    if mu <= 0 or delta <= 0:
        return 1.0
    log_b = mu * (delta - (1 + delta) * math.log(1 + delta))
    return min(1.0, math.exp(log_b))


def poisson_tail_exact(mu, t):
    """P(X >= t) para X ~ Poisson(mu), con t entero."""
    if t <= 0:
        return 1.0
    acc = 0.0
    for j in range(t):
        acc += math.exp(j * math.log(mu) - mu - math.lgamma(j + 1))
    return max(0.0, 1.0 - acc)


def monte_carlo_tail(mu, t, trials):
    hits = 0
    for _ in range(trials):
        if poisson_sample(mu) >= t:
            hits += 1
    return hits / trials


# ---------------------------------------------------------------------------
# Datos
# ---------------------------------------------------------------------------
def load_counts(csv_path):
    """Conteos por zona, hora y dia. Un dia sin solicitudes en una zona-hora
    cuenta como 0, para que la media y la varianza usen todos los dias."""
    counts = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    days = set()
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ts = datetime.fromisoformat(row["timestamp"])
            day = ts.strftime("%Y-%m-%d")
            days.add(day)
            counts[row["pickup_zone"]][ts.hour][day] += 1
    days = sorted(days)
    table = {}
    for zone, hours in counts.items():
        table[zone] = {h: [hours.get(h, {}).get(d, 0) for d in days] for h in range(24)}
    return table, days


def analyze_zone(zone, by_hour):
    peak_hour = max(range(24), key=lambda h: sum(by_hour[h]))
    daily = by_hour[peak_hour]
    n = len(daily)
    mu = sum(daily) / n
    sigma_hat = math.sqrt(sum((x - mu) ** 2 for x in daily) / (n - 1)) if n > 1 else 0.0
    sigma = math.sqrt(mu)

    raw_threshold = mu + K_SIGMA * sigma
    threshold = math.ceil(raw_threshold)
    delta = K_SIGMA * sigma / mu if mu > 0 else 0.0

    days_over = sum(1 for x in daily if x >= threshold)

    return {
        "zone": zone,
        "peak_hour": peak_hour,
        "mu": round(mu, 2),
        "sigma_model_sqrt_mu": round(sigma, 3),
        "sigma_hat": round(sigma_hat, 3),
        # > 1 indica mas dispersion de la que admite el modelo Poisson.
        "dispersion_index": round(sigma_hat ** 2 / mu, 3) if mu > 0 else None,
        "daily_counts_observed": daily,
        "model_based": {
            "surge_threshold": threshold,
            "delta": round(delta, 4),
            "chebyshev_bound": round(chebyshev_bound(K_SIGMA), 6),
            "chernoff_bound": round(chernoff_bound(mu, delta), 6),
            "monte_carlo_prob": round(monte_carlo_tail(mu, threshold, MC_TRIALS), 6),
            "exact_poisson_prob": round(poisson_tail_exact(mu, threshold), 6),
        },
        "empirical": {
            "days_over_threshold": days_over,
            "n_days": n,
            "frequency": round(days_over / n, 4) if n else 0.0,
        },
    }


if __name__ == "__main__":
    if not os.path.exists(RIDES_CSV):
        print(f"Error: no se encontro {RIDES_CSV}. Corre primero src/data_generator.py")
        raise SystemExit(1)

    print(f"Task 5: umbral mu + {K_SIGMA}*sigma, {MC_TRIALS} muestras Monte Carlo por zona")
    table, days = load_counts(RIDES_CSV)

    zones = [analyze_zone(z, table[z]) for z in sorted(table)]

    print(f"\n{'zona':<14}{'hora':>5}{'mu':>9}{'umbral':>8}{'Chebyshev':>11}"
          f"{'Chernoff':>10}{'MonteCarlo':>12}{'exacta':>9}{'sig_hat/sig':>12}")
    for z in zones:
        m = z["model_based"]
        ratio = z["sigma_hat"] / z["sigma_model_sqrt_mu"] if z["sigma_model_sqrt_mu"] else 0
        print(f"{z['zone']:<14}{z['peak_hour']:>5}{z['mu']:>9.1f}{m['surge_threshold']:>8}"
              f"{m['chebyshev_bound']:>11.4f}{m['chernoff_bound']:>10.4f}"
              f"{m['monte_carlo_prob']:>12.4f}{m['exact_poisson_prob']:>9.4f}{ratio:>12.2f}")

    output = {
        "task": "Task 5 - Probability Analysis",
        "k_sigma": K_SIGMA,
        "mc_trials": MC_TRIALS,
        "n_days": len(days),
        "zones": zones,
    }
    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nResultados guardados en {RESULTS_JSON}")