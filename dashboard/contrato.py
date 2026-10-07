"""
contrato.py
-----------
Revisa que el JSON de cada task tenga lo que el dashboard lee.

El contrato de cada workshop esta escrito en contratos/wN.md: una seccion
"## Task K" por task, con un ejemplo en un bloque ```json. Ese ejemplo ES el
contrato. Este archivo no tiene ninguna clave escrita a mano: las lee del .md,
asi que el texto que se le pasa a una persona (o a su IA) y lo que se valida
no se pueden contradecir.

Reglas del ejemplo:
    "clave": 1.5         numero (entero o decimal da igual)
    "clave": "texto"     texto
    "clave": true        booleano
    "clave": null        cualquier cosa
    "clave?": ...        opcional: si viene, se revisa; si no, no pasa nada
    [ {...} ]            lista; CADA elemento debe tener la forma del primero
    []                   lista de cualquier cosa
    {"*": ...}           diccionario con claves libres (p. ej. una por zona)

La task puede escribir mas claves de las que pide el contrato: se ignoran. El
dashboard recibe solo las del contrato (ver `proyectar`), para que ningun
panel dependa de una clave que nadie prometio escribir.

Lo usan:
  - run_all.py, despues de correr cada task, para avisar en la terminal;
  - web/public/pyodide-worker.js, que lo monta en Pyodide y lo llama para
    armar los datos de los paneles;
  - web/scripts/export_canonical.py, para la corrida precomputada.

Uso directo:
    python dashboard/contrato.py w2        revisa todos los results/w2/*.json
    python dashboard/contrato.py w2 3      revisa solo la task 3
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRATOS_DIR = os.path.join(BASE, "contratos")
RESULTS_DIR = os.path.join(BASE, "results")

import json
import math
import re
import sys

MAX_ERRORES = 6


def leer_contrato(ws, contratos_dir=CONTRATOS_DIR):
    """{numero de task: ejemplo} sacado de contratos/<ws>.md."""
    ruta = os.path.join(contratos_dir, f"{ws}.md")
    with open(ruta, encoding="utf-8") as f:
        texto = f.read()
    tasks = {}
    # Cada seccion va desde "## Task K" hasta el siguiente "## ".
    for m in re.finditer(r"^## Task (\d+)\b(.*?)(?=^## |\Z)", texto, re.S | re.M):
        n = int(m.group(1))
        bloque = re.search(r"```json\s*\n(.*?)\n```", m.group(2), re.S)
        if not bloque:
            continue
        try:
            tasks[n] = json.loads(bloque.group(1))
        except json.JSONDecodeError as e:
            raise ValueError(f"El ejemplo de la Task {n} en {ruta} no es JSON valido: {e}")
    return tasks


def _tipo(v):
    if isinstance(v, bool):
        return "booleano"
    if isinstance(v, (int, float)):
        return "numero"
    if isinstance(v, str):
        return "texto"
    if isinstance(v, list):
        return "lista"
    if isinstance(v, dict):
        return "diccionario"
    return "null"


def _campos(ejemplo):
    """(clave en el JSON, es opcional, ejemplo de su valor)."""
    for k, v in ejemplo.items():
        if k.endswith("?"):
            yield k[:-1], True, v
        else:
            yield k, False, v


def validar(dato, ejemplo, ruta=""):
    """Lista de problemas de `dato` frente a `ejemplo`. Vacia = cumple."""
    errores = []
    if ejemplo is None:
        return errores
    donde = ruta or "la raiz"
    esperado = _tipo(ejemplo)
    real = _tipo(dato)
    if esperado != real:
        return [f"`{donde}` deberia ser {esperado} y es {real}"]
    if esperado == "numero":
        if not math.isfinite(dato):
            errores.append(f"`{donde}` es {dato}: el navegador no puede leer NaN ni infinito")
    elif esperado == "lista":
        if ejemplo:
            for i, item in enumerate(dato):
                errores += validar(item, ejemplo[0], f"{ruta}[{i}]")
                if len(errores) >= MAX_ERRORES:
                    break
    elif esperado == "diccionario":
        if list(ejemplo) == ["*"]:
            for k, v in dato.items():
                errores += validar(v, ejemplo["*"], f"{ruta}.{k}" if ruta else k)
        else:
            for k, opcional, sub in _campos(ejemplo):
                hijo = f"{ruta}.{k}" if ruta else k
                if k not in dato:
                    if not opcional:
                        errores.append(f"falta la clave `{hijo}`")
                    continue
                errores += validar(dato[k], sub, hijo)
    return errores[:MAX_ERRORES]


def proyectar(dato, ejemplo):
    """`dato` recortado a las claves del contrato (asume que ya cumple)."""
    if isinstance(ejemplo, dict) and isinstance(dato, dict):
        if list(ejemplo) == ["*"]:
            return {k: proyectar(v, ejemplo["*"]) for k, v in dato.items()}
        out = {}
        for k, _opcional, sub in _campos(ejemplo):
            if k in dato:
                out[k] = proyectar(dato[k], sub)
        return out
    if isinstance(ejemplo, list) and ejemplo and isinstance(dato, list):
        return [proyectar(x, ejemplo[0]) for x in dato]
    return dato


def no_finitos(dato, ruta=""):
    """Rutas con NaN o infinito. Se revisa sobre lo proyectado porque un
    ejemplo `null` acepta cualquier valor, y un NaN ahi tambien rompe el
    JSON.parse del navegador."""
    if isinstance(dato, float) and not math.isfinite(dato):
        return [f"`{ruta or 'la raiz'}` es {dato}: el navegador no puede leer NaN ni infinito"]
    out = []
    if isinstance(dato, dict):
        for k, v in dato.items():
            out += no_finitos(v, f"{ruta}.{k}" if ruta else k)
    elif isinstance(dato, list):
        for i, v in enumerate(dato):
            out += no_finitos(v, f"{ruta}[{i}]")
    return out[:MAX_ERRORES]


def revisar_archivo(ruta, ejemplo):
    """(dato proyectado o None, lista de problemas)."""
    try:
        with open(ruta, encoding="utf-8") as f:
            dato = json.load(f)
    except Exception as e:  # JSON a medio escribir, encoding, etc.
        return None, [f"no se pudo leer {os.path.basename(ruta)}: {type(e).__name__}: {e}"]
    errores = validar(dato, ejemplo)
    if errores:
        return None, errores
    proyectado = proyectar(dato, ejemplo)
    errores = no_finitos(proyectado)
    if errores:
        return None, errores
    return proyectado, []


def cargar(ws, results_dir=RESULTS_DIR, contratos_dir=CONTRATOS_DIR):
    """Los results/<ws>/taskK.json que cumplen su contrato.

    Devuelve (resultados, errores), los dos con clave "taskK". Una task sin
    JSON no aparece en ninguno: es el estado normal de una task que nadie ha
    entregado. Una task cuyo JSON no cumple aparece solo en `errores`, con el
    motivo, y no afecta a las demas."""
    contrato = leer_contrato(ws, contratos_dir)
    resultados, errores = {}, {}
    for n, ejemplo in sorted(contrato.items()):
        ruta = os.path.join(results_dir, ws, f"task{n}.json")
        if not os.path.exists(ruta):
            continue
        dato, problemas = revisar_archivo(ruta, ejemplo)
        if problemas:
            errores[f"task{n}"] = "; ".join(problemas)
        else:
            resultados[f"task{n}"] = dato
    return resultados, errores


def reporte(ws, solo=None):
    """Imprime el estado de cada task del workshop. Devuelve cuantas fallan."""
    contrato = leer_contrato(ws)
    fallas = 0
    for n, ejemplo in sorted(contrato.items()):
        if solo is not None and n != solo:
            continue
        rel = f"results/{ws}/task{n}.json"
        ruta = os.path.join(RESULTS_DIR, ws, f"task{n}.json")
        if not os.path.exists(ruta):
            print(f"  Task {n}  pendiente  no existe {rel}")
            continue
        _dato, problemas = revisar_archivo(ruta, ejemplo)
        if problemas:
            fallas += 1
            print(f"  Task {n}  NO CUMPLE  {rel}")
            for p in problemas:
                print(f"            - {p}")
        else:
            print(f"  Task {n}  OK         {rel}")
    return fallas


if __name__ == "__main__":
    if len(sys.argv) < 2 or not re.fullmatch(r"w\d+", sys.argv[1]):
        sys.exit("Uso: python dashboard/contrato.py w2 [numero de task]")
    ws = sys.argv[1]
    solo = int(sys.argv[2]) if len(sys.argv) > 2 else None
    print(f"Contrato de {ws} (contratos/{ws}.md):")
    sys.exit(1 if reporte(ws, solo) else 0)
