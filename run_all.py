"""
run_all.py
-----------
Corre el pipeline de un workshop de principio a fin desde la terminal:
los datasets que necesita y despues sus tasks, en orden.

    python run_all.py            Workshop 1
    python run_all.py w2         Workshop 2
    python run_all.py w3         Workshop 3
    python run_all.py todo       los tres

No hay lista de tasks que mantener: se corre lo que haya en src/wN/ con el
patron taskK_tema.py, en orden de K. Una task que nadie ha entregado
simplemente no esta, y su panel sale como pendiente en el dashboard.

Los datasets se encadenan: el W2 parte del rides.csv del W1 y el W3 del
stream.csv del W2, asi que el workshop N corre src/w1/dataset.py hasta
src/wN/dataset.py. Son deterministas: volver a correrlos da los mismos bytes.

Despues de cada task se revisa su JSON contra contratos/wN.md, con
dashboard/contrato.py, y se avisa aca mismo si le falta algo al panel.

No construye ningun dashboard: el dashboard es la app de web/, que corre estos
mismos .py dentro del navegador con Pyodide. Este script existe para correrlos
con CPython, que es varias veces mas rapido.
"""

import importlib.util
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")
PATRON_TASK = re.compile(r"^task(\d+)_[a-z0-9_]+\.py$")


def cargar_contrato():
    spec = importlib.util.spec_from_file_location(
        "contrato", os.path.join(BASE, "dashboard", "contrato.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def workshops():
    """Los wN que existen en src/, en orden."""
    ws = [d for d in os.listdir(SRC) if re.fullmatch(r"w\d+", d)]
    return sorted(ws, key=lambda w: int(w[1:]))


def tasks_de(ws):
    """{K: archivo} de src/<ws>/, y los avisos de archivos que no sirven."""
    carpeta = os.path.join(SRC, ws)
    tasks, avisos = {}, []
    for nombre in sorted(os.listdir(carpeta)):
        if not nombre.endswith(".py") or nombre == "dataset.py":
            continue
        m = PATRON_TASK.match(nombre)
        if not m:
            avisos.append(f"src/{ws}/{nombre} no sigue el patron taskK_tema.py: no se corre.")
            continue
        k = int(m.group(1))
        if k in tasks:
            avisos.append(f"Hay dos scripts para la task {k} en src/{ws}/ "
                          f"({tasks[k]} y {nombre}): se corre solo {tasks[k]}.")
            continue
        tasks[k] = nombre
    return tasks, avisos


def pasos_de(ws, con_datasets=True):
    n = int(ws[1:])
    pasos = []
    if con_datasets:
        for i in range(1, n + 1):
            ruta = f"src/w{i}/dataset.py"
            if os.path.exists(os.path.join(BASE, ruta)):
                pasos.append((f"Dataset del Workshop {i}", ruta, None))
    tasks, avisos = tasks_de(ws)
    for k in sorted(tasks):
        pasos.append((f"{ws.upper()} Task {k}", f"src/{ws}/{tasks[k]}", k))
    return pasos, avisos


def main():
    # Sin esto los print de aca salen despues de la salida de los subprocesos
    # cuando la consola es un pipe (p. ej. con | tail), y el orden confunde.
    sys.stdout.reconfigure(line_buffering=True)
    modo = sys.argv[1] if len(sys.argv) > 1 else "w1"
    disponibles = workshops()
    if modo == "todo":
        elegidos = disponibles
    elif modo in disponibles:
        elegidos = [modo]
    else:
        sys.exit(f"Modo desconocido: {modo}. Usa {', '.join(disponibles)} o todo.")

    contrato = cargar_contrato()
    plan, avisos = [], []
    # Una task de antes de la reorganizacion (src/task3_hashing.py) no corre:
    # se avisa en vez de dejar que su panel diga "pendiente" sin explicar por que.
    for nombre in sorted(os.listdir(SRC)):
        if nombre.endswith(".py"):
            avisos.append(f"src/{nombre} esta fuera de src/wN/: muevelo a la carpeta de "
                          f"su workshop (p. ej. src/w1/{nombre}). No se corre.")
    for i, ws in enumerate(elegidos):
        # Con "todo" cada dataset corre una sola vez: el W2 ya tiene el del W1.
        pasos, av = pasos_de(ws, con_datasets=True)
        if i > 0:
            pasos = [p for p in pasos if p[2] is not None or p[1] == f"src/{ws}/dataset.py"]
        plan += [(ws, *p) for p in pasos]
        avisos += av
        en_contrato = contrato.leer_contrato(ws)
        for _ws, _t, script, k in [(ws, *p) for p in pasos]:
            if k is not None and k not in en_contrato:
                avisos.append(f"{script} es la task {k}, pero contratos/{ws}.md no tiene "
                              f"Task {k}: corre, pero ningun panel la lee.")

    for a in avisos:
        print(f"AVISO: {a}")

    fallidas, sin_contrato = [], []
    for i, (ws, titulo, script, k) in enumerate(plan, 1):
        print(f"\n{'=' * 70}\n[{i}/{len(plan)}] {titulo}  ({script})\n{'=' * 70}")
        salida = os.path.join(BASE, "results", ws, f"task{k}.json") if k is not None else None
        # Igual que el worker: sin el JSON de una corrida anterior, una task
        # que falla no puede aparecer como OK con datos viejos.
        if salida and os.path.exists(salida):
            os.remove(salida)
        r = subprocess.run([sys.executable, os.path.join(BASE, script)])
        if r.returncode != 0:
            if k is None:
                # Sin dataset no hay nada que correr despues.
                sys.exit(f"\nFallo el dataset {script}: se detiene el pipeline.")
            print(f"\nFallo {script} (codigo {r.returncode}); sigo con las demas.", file=sys.stderr)
            fallidas.append(script)
            continue
        if salida and not os.path.exists(salida):
            print(f"\n{script} termino sin escribir results/{ws}/task{k}.json; cuenta como fallo.",
                  file=sys.stderr)
            fallidas.append(script)
            continue
        if k is not None:
            print(f"\n-- contrato ({ws}, task {k}) --")
            if contrato.reporte(ws, solo=k):
                sin_contrato.append(script)

    print(f"\n{'=' * 70}\nEstado de los paneles\n{'=' * 70}")
    for ws in elegidos:
        print(f"{ws}:")
        contrato.reporte(ws)
    print()
    if fallidas:
        print(f"Fallaron ({len(fallidas)}): {', '.join(fallidas)}")
    if sin_contrato:
        print(f"Corrieron pero su JSON no cumple el contrato ({len(sin_contrato)}): {', '.join(sin_contrato)}")
        print("Sus paneles no se ven hasta que se arregle; el detalle esta arriba.")
    print("Listo. Para ver los resultados:  cd web && npm install && npm run dev")
    print(f"{'=' * 70}")
    sys.exit(1 if fallidas or sin_contrato else 0)


if __name__ == "__main__":
    main()
