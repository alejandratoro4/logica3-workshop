"""
Workshop 2 - Task 5: momentos de frecuencia sobre pickup_zone.

Lee data/stream.csv fila por fila, en orden de stream_seq, y lleva un contador
exacto f_i por zona. Al final calcula los momentos de frecuencia

    F_k = sum_i f_i^k

    F0 = numero de zonas distintas
    F1 = largo del stream (total de solicitudes)
    F2 = suma de los cuadrados de los f_i

Con F0 y F1 fijos, F2 es minimo cuando todas las zonas tienen la misma demanda
(F1^2 / F0) y maximo cuando una sola zona se lleva todo (F1^2). Por eso la
razon F2 / (F1^2 / F0), que va de 1 a F0, mide que tan concentrada esta la
demanda: un F2 alto dice que pocas zonas dominan, y esas son las candidatas a
surge.

Con 10 zonas el conteo exacto cabe en memoria (10 contadores), asi que no hace
falta un estimador aproximado como AMS: el resumen del stream es el propio
diccionario de conteos.

Entrada: data/stream.csv
Salida:  results/w2/task5.json (claves del contrato, contratos/w2.md, Task 5)
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


def count_zones(csv_path):
    """Recorre el stream una vez y devuelve f_i por zona. Verifica que las filas
    lleguen en orden de stream_seq, porque el contrato lo exige."""
    counts = {}
    last_seq = 0
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            seq = int(row["stream_seq"])
            if seq <= last_seq:
                raise ValueError(f"stream fuera de orden en stream_seq={seq}")
            last_seq = seq
            zone = row["pickup_zone"]
            counts[zone] = counts.get(zone, 0) + 1
    return counts


def frequency_moment(counts, k):
    """F_k = sum_i f_i^k, en enteros exactos. F0 cuenta las zonas con f_i > 0."""
    if k == 0:
        return sum(1 for f in counts.values() if f > 0)
    return sum(f ** k for f in counts.values())


if __name__ == "__main__":
    if not os.path.exists(STREAM_CSV):
        print(f"Error: no se encontro {STREAM_CSV}. Corre primero src/w2/dataset.py")
        raise SystemExit(1)

    counts = count_zones(STREAM_CSV)
    F0 = frequency_moment(counts, 0)
    F1 = frequency_moment(counts, 1)
    F2 = frequency_moment(counts, 2)

    # F2 si la demanda estuviera repartida por igual, y la concentracion.
    F2_uniform = F1 * F1 / F0
    concentration = F2 / F2_uniform

    # Una zona es candidata a surge si aporta a F2 mas que su cuota pareja 1/F0,
    # lo que equivale a f_i > F1 / F0 (estar por encima de la demanda media).
    ordered = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    share_F2 = {z: f * f / F2 for z, f in ordered}
    candidates = [z for z, s in share_F2.items() if s > 1 / F0]

    print(f"F0 = {F0} zonas | F1 = {F1} solicitudes | F2 = {F2}")
    print(f"F2 parejo (F1^2/F0) = {F2_uniform:.0f} | concentracion = {concentration:.4f} (1 = parejo, {F0} = una zona)")
    print(f"\n{'zona':<14}{'f_i':>9}{'f_i/F1':>9}{'f_i^2/F2':>10}")
    for z, f in ordered:
        print(f"{z:<14}{f:>9}{f / F1:>9.2%}{share_F2[z]:>10.2%}")
    print(f"\nCandidatas a surge (aportan a F2 mas que 1/F0): {', '.join(candidates) or 'ninguna'}")

    resultado = {
        "task": "W2 Task 5 - Momentos de frecuencia",
        "F0": F0,
        "F1": F1,
        "F2": F2,
        "counts": dict(ordered),
        # Extras: el panel los recalcula, pero sirven para leer el JSON solo.
        "F2_uniform": round(F2_uniform, 2),
        "concentration": round(concentration, 6),
        "surge_candidates": candidates,
    }
    with open(os.path.join(RESULTS_DIR, "task5.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"\nResultados guardados en {os.path.join(RESULTS_DIR, 'task5.json')}")
