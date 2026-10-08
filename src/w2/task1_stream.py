import os
import csv
import json
from collections import deque, defaultdict
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

WINDOW_N = 500          # últimas 500 solicitudes (por zona)
HOUR = timedelta(hours=1)
CHECKPOINT_EVERY = timedelta(hours=1)


def build_checkpoints():
    # Estado del stream
    n_events = 0
    # Consulta permanente: por zona, deque con las últimas WINDOW_N esperas
    windows = defaultdict(lambda: deque(maxlen=WINDOW_N))
    # Consulta ad hoc: riders vistos en la última hora (dict rider -> timestamp)
    recent_riders = {}
    # Fotografías
    checkpoints = []
    last_checkpoint = None

    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = datetime.fromisoformat(row["timestamp"])
            zone = row["pickup_zone"]
            wait = float(row["wait_for_driver_sec"])
            rider = row["rider_id"]

            n_events += 1
            windows[zone].append(wait)
            recent_riders[rider] = ts

            # Poda de la ventana temporal de 1 hora (consulta ad hoc)
            cutoff = ts - HOUR
            expired = [r for r, t in recent_riders.items() if t < cutoff]
            for r in expired:
                del recent_riders[r]

            # Fotografía al final de cada hora
            if last_checkpoint is None or ts - last_checkpoint >= CHECKPOINT_EVERY:
                last_checkpoint = ts
                rolling_avg_wait = {
                    z: sum(q) / len(q) for z, q in windows.items() if q
                }
                checkpoints.append({
                    "timestamp": ts.isoformat(),
                    "rolling_avg_wait": rolling_avg_wait,
                    "distinct_riders_last_hour": len(recent_riders),
                })

    return n_events, windows, checkpoints


def estimate_budget(n_zones):
    # Una deque de 500 floats (8 bytes c/u) por zona
    bytes_window_per_zone = WINDOW_N * 8
    total_window = n_zones * bytes_window_per_zone
    # Dict rider -> timestamp (aprox. 64 bytes por entrada, cota alta)
    bytes_riders = 64 * 20000  # cota superior de riders en una hora pico
    items = [
        {"name": "ventana de 500 esperas por zona", "bytes": total_window},
        {"name": "pasajeros de la última hora", "bytes": bytes_riders},
    ]
    return {
        "limit_bytes": 10 * 1024 * 1024,  # 10 MB
        "items": items,
        "total_bytes": sum(i["bytes"] for i in items),
    }


if __name__ == "__main__":
    n_events, windows, checkpoints = build_checkpoints()

    n_zones = len(windows)
    budget = estimate_budget(n_zones)

    resultado = {
        "n_events": n_events,
        "window_n": WINDOW_N,
        "window_scope": "por zona",
        "checkpoints": checkpoints,
        "budget": budget,
    }

    out_path = os.path.join(RESULTS_DIR, "task1.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"OK  {n_events} eventos, {n_zones} zonas, {len(checkpoints)} checkpoints")
    print(f"    presupuesto: {budget['total_bytes']} bytes de {budget['limit_bytes']}")
