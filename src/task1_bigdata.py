"""
task1_bigdata.py
------------------
Task 1 — Contexto de Big Data.

Est network and storage sizing for a ride-sharing dispatch system.

Estimates ride requests/sec city-wide at peak hour, and storage at 10x city growth.
Produces results/task1_results.json with the metrics the dashboard expects.
"""

import os
import csv
import json
import math
import time
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")
RESULTS_JSON = os.path.join(RESULTS_DIR, "task1_results.json")


def _env(name, cast, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return cast(raw)


# ---------------------------------------------------------------------------
# Parametros (mismos defaults que el generador)
# ---------------------------------------------------------------------------
SEED = _env("RIDES_SEED", int, 42)
SCALE = _env("RIDES_SCALE", float, 30.0)
N_DAYS = _env("RIDES_N_DAYS", int, 14)


def peak_hour_rates(rows):
    """Devuelve (total_peak, peak_ts, per_zone) con las solicitudes de la hora
    de mayor demanda a nivel ciudad."""
    hourly = {}
    for r in rows:
        ts = datetime.fromisoformat(r["timestamp"]).replace(minute=0, second=0, microsecond=0)
        hourly.setdefault(ts, []).append(r)

    peak_ts = max(hourly, key=lambda k: len(hourly[k]))
    peak_rows = hourly[peak_ts]
    per_zone = {}
    for r in peak_rows:
        per_zone[r["pickup_zone"]] = per_zone.get(r["pickup_zone"], 0) + 1
    return len(peak_rows), peak_ts, per_zone


def estimate_requests_per_sec(peak_count):
    """Solicitudes por segundo en la hora pico a nivel ciudad."""
    return peak_count / 3600.0



def estimate_storage_10x(rows, peak_rows):
    """Estimacion de almacenamiento diario y total a 10x de crecimiento."""
    # Tamaño promedio por fila del CSV (bytes) como proxy del tamano del registro.

    # (Es una cota inferior: en una base real habria indices, replicas, etc.)
    sample = rows[:20000] if len(rows) > 20000 else rows
    avg_bytes = sum(len(json.dumps(r, ensure_ascii=False).encode("utf-8")) for r in sample) / len(sample)

    # Escenario 10x: la ciudad crece 10x y el volumen diario tambien.
    daily_bytes_10x = (len(rows) / N_DAYS) * avg_bytes * 10

    # Retencion: 1 ano de historial operativo (365 dias).
    total_bytes_10x = daily_bytes_10x * 365
    return {
        "avg_bytes_per_record": round(avg_bytes, 2),
        "daily_bytes_10x": int(daily_bytes_10x),
        "daily_mb_10x": round(daily_bytes_10x / (1024 * 1024), 2),
        "total_bytes_10x_1yr": int(total_bytes_10x),
        "total_gb_10x_1yr": round(total_bytes_10x / (1024 ** 3),  2),
    }

def avg_record_bytes(rows):
    sample = rows[:20000] if len(rows) > 20000 else rows
    return sum(len(json.dumps(r, ensure_ascii=False).encode("utf-8")) for r in sample) / len(sample)

def main():
    t0 = time.perf_counter()
    if not os.path.exists(RIDES_CSV):
        print(f"[task1] No existe {RIDES_CSV}; corre primero src/data_generator.py")
        return

    rows = []
    with open(RIDES_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    total_peak, peak_ts, per_zone = peak_hour_rates(rows)
    rps = estimate_requests_per_sec(total_peak)
    storage = estimate_storage_10x(rows, total_peak)

    avg_bytes = avg_record_bytes(rows)
    peak_req_per_sec = total_peak / 3600.0
    daily_bytes = (len(rows) / N_DAYS) * avg_bytes

    results = {
        "task": 1,
        "title": "Contexto de Big Data",
        "total_requests": len(rows),
        "n_days": N_DAYS,
        "peak_req_per_sec": round(peak_req_per_sec,  2),
        "peak_req_per_sec_10x": round(peak_req_per_sec * 10,  2),
        "storage_year_gb": round(daily_bytes * 365 / (1024 ** 3),  2),
        "storage_year_10x_gb": round(daily_bytes * 10 * 365 / (1024 ** 3),  2),
        # extras utiles (el build_* las ignora)
        "peak_hour": peak_ts.isoformat(),
        "peak_hour_rides": total_peak,
        "peak_per_zone": per_zone,
        "avg_bytes_per_record": round(avg_bytes,  2),
        "elapsed_sec": round(time.perf_counter() - t0,  3),
    }

    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"[task1] {len(rows)} rides | pico {peak_ts.isoformat()} "
          f"({total_peak} rides, {rps:.2f} req/s) | "
          f"storage 10x: {storage['total_gb_10x_1yr']:.2f} GB/año")


if __name__ == "__main__":
    main()
