"""
export_canonical.py
-------------------
Exporta los results/wN/taskK.json de escala completa a
web/public/data/canonical-wN.json, con la MISMA forma que produce el worker
en tiempo de ejecucion: los JSON de las tasks que cumplen su contrato,
recortados a sus claves (lo hace dashboard/contrato.py, igual que alla).

Para que sirve: correr el pipeline a escala completa tarda minutos en
Pyodide. Con la corrida canonica precomputada, la app la muestra al instante
y solo paga el computo cuando se quiere explorar OTRA configuracion de ciudad.

Se ejecuta a mano cuando cambian los resultados, y el JSON se commitea para
que el build de Vercel no necesite Python:

    python run_all.py w2                          (a escala completa: sin RIDES_*)
    python web/scripts/export_canonical.py w2

Una task sin JSON, o con uno que no cumple su contrato, simplemente no
aporta su panel; se avisa en la consola.
"""

import csv
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
REPO = os.path.dirname(WEB)
OUT_DIR = os.path.join(WEB, "public", "data")
RIDES_CSV = os.path.join(REPO, "data", "rides.csv")


def load_contrato():
    spec = importlib.util.spec_from_file_location(
        "contrato", os.path.join(REPO, "dashboard", "contrato.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def contar_viajes():
    """Filas y zonas de rides.csv: el dataset base de los tres workshops."""
    if not os.path.exists(RIDES_CSV):
        return None, None
    zonas = set()
    n = 0
    with open(RIDES_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            n += 1
            zonas.add(row["pickup_zone"])
    return n, len(zonas)


def main():
    if len(sys.argv) < 2 or not re.fullmatch(r"w\d+", sys.argv[1]):
        print("Uso: python web/scripts/export_canonical.py w1|w2|w3", file=sys.stderr)
        return 2
    ws = sys.argv[1]
    contrato = load_contrato()
    resultados, errores = contrato.cargar(ws)
    if not resultados:
        print(f"No hay ningun results/{ws}/taskK.json que cumpla su contrato.", file=sys.stderr)
        print(f"Corre primero: python run_all.py {ws}", file=sys.stderr)
        return 1

    filas, zonas = contar_viajes()
    payload = {
        "label": f"Corrida canonica del Workshop {ws[1:]} (escala completa)",
        # Los mismos defaults que los scripts. Si se exporta con variables
        # RIDES_* puestas, la etiqueta dice la ciudad que de verdad se corrio.
        "params": {
            "rows": filas, "unit": "viajes", "zones": zonas,
            "scale": float(os.environ.get("RIDES_SCALE") or 30),
            "days": int(os.environ.get("RIDES_N_DAYS") or 14),
            "seed": int(os.environ.get("RIDES_SEED") or 42),
        },
        "results": resultados,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"canonical-{ws}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"canonical-{ws}.json escrito ({os.path.getsize(out) / 1024:.1f} KB, {filas} viajes)")
    print(f"  tasks: {', '.join(sorted(resultados))}")
    faltan = [f"task{k}" for k in sorted(contrato.leer_contrato(ws)) if f"task{k}" not in resultados]
    if faltan:
        print(f"  sin datos todavia: {', '.join(faltan)}")
    for clave, msg in errores.items():
        print(f"  AVISO {clave} no cumple el contrato: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
