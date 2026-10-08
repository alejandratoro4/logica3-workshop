import os
import csv
import json
import math
import hashlib
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w2")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
STREAM_CSV = os.path.join(DATA_DIR, "stream.csv")

# Diseño del filtro: n bits, m = pasajeros distintos esperados por minuto (cota)
N_BITS = 4096
M_ITEMS = 300
K = int(math.floor((N_BITS / M_ITEMS) * math.log(2)))   # k = floor((n/m) ln 2)


class BloomFilter:
    """Filtro de Bloom con k funciones blake2b (key distinta por función)."""

    def __init__(self, n_bits, k):
        self.n_bits = n_bits
        self.k = k
        self.bits = bytearray((n_bits + 7) // 8)

    def _posiciones(self, item):
        for i in range(self.k):
            d = hashlib.blake2b(item.encode("utf-8"), key=bytes([i]), digest_size=8).digest()
            yield int.from_bytes(d, "big") % self.n_bits

    def insertar(self, item):
        for p in self._posiciones(item):
            self.bits[p // 8] |= 1 << (p % 8)

    def contiene(self, item):
        return all(self.bits[p // 8] & (1 << (p % 8)) for p in self._posiciones(item))

    def reset(self):
        self.bits = bytearray((self.n_bits + 7) // 8)


def main():
    filtro = BloomFilter(N_BITS, K)
    vistos_minuto = set()          # ground truth: riders realmente insertados este minuto
    minuto_actual = None

    n_neg = 0                      # consultas de riders que NO estaban en el filtro (FP + TN)
    n_fp = 0                       # falsos positivos
    n_tp = 0                       # verdaderos positivos (repetidos del minuto, bien detectados)

    running = []
    ultimo_checkpoint = None

    with open(STREAM_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for fila in reader:
            ts = datetime.fromisoformat(fila["timestamp"])
            minuto = ts.strftime("%Y-%m-%dT%H:%M")
            rider = fila["rider_id"]

            # Cada minuto: filtro nuevo (solo vale lo del minuto en curso)
            if minuto != minuto_actual:
                filtro.reset()
                vistos_minuto.clear()
                minuto_actual = minuto

            if rider in vistos_minuto:
                # Ya emparejado este minuto: el filtro debe decirlo (TP)
                if filtro.contiene(rider):
                    n_tp += 1
                # (un Bloom no da falsos negativos para lo insertado)
            else:
                # Primera aparición en el minuto: ground truth negativo
                n_neg += 1
                if filtro.contiene(rider):
                    n_fp += 1
                filtro.insertar(rider)
                vistos_minuto.add(rider)

            # Foto acumulada una vez por hora
            if ultimo_checkpoint is None or (ts - ultimo_checkpoint).total_seconds() >= 3600:
                ultimo_checkpoint = ts
                running.append({
                    "timestamp": ts.isoformat(),
                    "fp_rate_so_far": round(n_fp / n_neg, 6) if n_neg else 0.0,
                })

    fp_empirical = n_fp / n_neg if n_neg else 0.0
    fp_theoretical = (1 - math.exp(-K * M_ITEMS / N_BITS)) ** K

    resultado = {
        "n_bits": N_BITS,
        "m_items": M_ITEMS,
        "k": K,
        "fp_theoretical": round(fp_theoretical, 6),
        "fp_empirical": round(fp_empirical, 6),
        "running": running,
    }

    out = os.path.join(RESULTS_DIR, "task2.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"OK  n={N_BITS} bits, m={M_ITEMS}, k={K}")
    print(f"    FP teorico: {fp_theoretical:.6f}  |  FP empirico: {fp_empirical:.6f}")
    print(f"    consultas negativas: {n_neg}, FP: {n_fp}, TP: {n_tp}, checkpoints: {len(running)}")


if __name__ == "__main__":
    main()
