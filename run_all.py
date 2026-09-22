"""
run_all.py
-----------
Corre el pipeline de datos de principio a fin: generador -> Tasks 1-5.

No construye ningun dashboard. El dashboard es la app de web/, que corre estos
mismos .py dentro del navegador con Pyodide; este script existe para correrlos
desde la terminal, con CPython, que es varias veces mas rapido y es como se
desarrolla y se verifica cada task.

Uso:  python run_all.py
      cd web && npm install && npm run dev    (para ver los resultados)
"""

import subprocess
import sys
import os

BASE = os.path.dirname(os.path.abspath(__file__))

PASOS = [
    ("Generando dataset sintetico",        "src/data_generator.py"),
    ("Task 1 - Contexto de Big Data",      "src/task1_bigdata.py"),
    ("Task 2 - Algoritmo aleatorizado",    "src/task2_randomized.py"),
    ("Task 3 - Hashing universal",         "src/task3_hashing.py"),
    ("Task 4 - Tabla hash",                "src/task4_hashtable.py"),
    ("Task 5 - Analisis de probabilidad",  "src/task5_probability.py"),
]


def main():
    # Una task que todavia no existe se salta con aviso, no aborta el pipeline.
    # El repo se trabaja entre varias personas y cada quien agrega su script:
    # abortar dejaria sin correr las tasks que si estan. La app de web/ sigue
    # el mismo criterio y marca esos paneles como pendientes.
    faltantes = []
    for i, (titulo, script) in enumerate(PASOS, 1):
        print(f"\n{'='*70}\n[{i}/{len(PASOS)}] {titulo}\n{'='*70}")
        ruta = os.path.join(BASE, script)
        if not os.path.exists(ruta):
            print(f"SALTADA: {script} todavia no existe en el repo.")
            faltantes.append(script)
            continue
        r = subprocess.run([sys.executable, ruta])
        if r.returncode != 0:
            print(f"\nFallo en: {script}", file=sys.stderr)
            sys.exit(r.returncode)

    print(f"\n{'='*70}")
    if faltantes:
        print(f"Sin correr ({len(faltantes)}): {', '.join(faltantes)}")
        print("Sus paneles salen marcados como pendientes en el dashboard.")
    print("Listo. Para ver los resultados:  cd web && npm install && npm run dev")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
