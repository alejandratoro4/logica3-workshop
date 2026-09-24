"""
export_canonical.py
-------------------
Exporta los results/task*.json de escala completa a
web/public/data/canonical-run.json, con la MISMA forma que produce el worker
en tiempo de ejecucion (usa las funciones de dashboard/build_dashboard.py).

Para que sirve: correr el pipeline a 495k filas tarda ~2 minutos en Pyodide.
Teniendo la corrida canonica precomputada, la app la muestra al instante y el
usuario ve los numeros del informe sin esperar; solo paga el computo cuando
quiere explorar OTRA configuracion de ciudad.

Exporta los paneles que se puedan armar con los results/ que existan: una task
que todavia no este en el repo simplemente no aporta su panel, igual que en el
worker. Se ejecuta a mano cuando cambian los resultados y el JSON se commitea,
para que el build de Vercel no necesite Python:

    python web/scripts/export_canonical.py
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
REPO = os.path.dirname(WEB)
RESULTS = os.path.join(REPO, "results")
OUT_DIR = os.path.join(WEB, "public", "data")
OUT = os.path.join(OUT_DIR, "canonical-run.json")


def load_build_dashboard():
    path = os.path.join(REPO, "dashboard", "build_dashboard.py")
    spec = importlib.util.spec_from_file_location("build_dashboard", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def contar_filas(res):
    """Filas del dataset de la corrida.

    La task 1 la reporta directamente. Si no esta, se deduce de la task 2: el
    benchmark incluye el dataset completo entre sus tamanios, asi que el n mas
    grande ES el total de filas. Se prefiere deducirla a dejar el dato en nulo,
    porque es lo unico que la UI muestra de esta seccion."""
    if "task1" in res:
        return res["task1"]["n_total_requests_dataset"]
    if "task2" in res:
        ns = [r["n"] for r in res["task2"]["quicksort"] if r["input"] == "random_input"]
        if ns:
            return max(ns)
    return None


def main():
    bd = load_build_dashboard()
    problemas = {}
    res = bd.available_results(RESULTS, errors=problemas)
    if not res:
        print(f"No hay ningun results/task*.json en {RESULTS}.", file=sys.stderr)
        print("Corre primero: python run_all.py", file=sys.stderr)
        return 1

    panels = bd.build_panels(res, errors=problemas)
    if not panels:
        print("Hay resultados, pero ninguno completa un panel.", file=sys.stderr)
        return 1

    payload = {
        "label": "Corrida canonica (escala completa)",
        "params": {
            "zones": len({z["zone"] for z in res["task5"]["zones"]}) if "task5" in res else None,
            "scale": 30,
            "days": res["task1"]["n_days_simulated"] if "task1" in res else None,
            "seed": 42,
            "drivers": 1200,
            "rows": contar_filas(res),
        },
        "panels": panels,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUT) / 1024
    filas = payload["params"]["rows"]
    filas_txt = f"{filas:,} viajes".replace(",", ".") if filas else "filas desconocidas"
    print(f"canonical-run.json escrito ({size_kb:.1f} KB, {filas_txt})")
    print(f"  paneles: {', '.join(sorted(panels))}")
    faltan = [p for p, _d, _f, _s in bd.PANELS if p not in panels]
    if faltan:
        print(f"  sin datos todavia: {', '.join(faltan)}")
    for clave, msg in problemas.items():
        print(f"  AVISO {clave}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
