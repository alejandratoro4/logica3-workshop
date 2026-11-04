"""
mapreduce.py (Workshop 4)
-------------------------
El runner de MapReduce que comparten las tasks del Workshop 4. No es una task:
no escribe JSON, run_all.py no lo corre y el navegador solo lo copia para que
las tasks lo importen.

Es la excepcion a "los scripts no se importan entre si": el enunciado pide
medir shuffle, carga por reducer y speedup en varias tasks, y esas cifras solo
se pueden comparar si todas las mide el mismo codigo. Cada task trae su map y
su reduce; el runner pone el resto:

    split --map--> (k, v) --combiner--> particion h(k) mod R --reduce--> salida

Uso desde una task (src/w4/taskK_tema.py), despues del bloque BASE:

    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from mapreduce import Cluster, fragmentos

    def mapper(fila):                 # una fila de un fragmento (dict de str)
        yield fila["driver_id"], (int(fila["stream_seq"]), fila["pickup_zone"])

    def reducer(clave, valores):      # todos los valores de una clave
        yield clave, len(valores)

    if __name__ == "__main__":
        with Cluster(workers=4) as c:
            res = c.ejecutar("1a", fragmentos(), mapper, reducer, reducers=4)
        res.salida        # [(clave, valor), ...] ordenada por clave
        res.stats         # el dict de la seccion "Lo que mide el runner" del contrato

Reglas que impone el paralelismo:
  - mapper, reducer y combiner son funciones definidas arriba del archivo
    (nada de lambdas ni funciones dentro de otras): cada proceso las importa
    por nombre.
  - Todo lo que la task hace va dentro de `if __name__ == "__main__":`. Cada
    proceso del pool vuelve a importar el script; si arriba hubiera trabajo,
    se haria una vez por proceso.

Paralelismo real: con workers > 1 los map y los reduce corren en un pool de
procesos (multiprocessing, contexto spawn, igual en Windows, Linux y macOS).
En el navegador (Pyodide) no hay procesos: todo corre en secuencia, el
resultado es el mismo y stats["parallel"] dice False. Los tiempos de ahi no
sirven para medir speedup. PARALELO dice si esta maquina tiene procesos.

Una fase no usa mas workers que tareas tiene: la fase map tiene una tarea
por split y la fase reduce, `reducers`. Con reducers=4 (el valor por
defecto) y 8 workers, la mitad del pool espera en cada reduce y en el map de
una ronda cuyos splits son la salida de otra (r.por_reducer).

El particionador usa blake2b, no hash(): el hash nativo de Python cambia en
cada proceso (PYTHONHASHSEED), y entonces ni la carga por reducer ni la
asignacion serian reproducibles.
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
FRAGMENTOS_DIR = os.path.join(DATA_DIR, "w4")

import csv
import hashlib
import pickle
import sys
import time
from collections import defaultdict, namedtuple

EN_NAVEGADOR = sys.platform == "emscripten"
# Si esta maquina puede correr procesos en paralelo. Es lo que la Task 5
# reporta como "parallel": stats["parallel"] de un Cluster(workers=1) sale
# False tambien en la terminal, porque ese job corrio en un solo proceso.
PARALELO = not EN_NAVEGADOR

# Un split de entrada: un archivo de data/w4/ y la copia que representa. La
# copia c > 0 es el mismo archivo con cada driver_id cambiado a "drv_00042#c":
# conductores nuevos con los mismos viajes, asi que 2 copias son exactamente el
# doble de datos y el doble de reubicaciones (ver fragmentos()).
Fragmento = namedtuple("Fragmento", ["ruta", "copia"])


def fragmentos(copias=1):
    """Los splits de data/w4/part-*.csv, repetidos `copias` veces.

    copias=1 es el dataset tal cual; copias=2 y 4 son el 2x y el 4x de la
    Task 3. Hay un split por (archivo, copia), igual que en Hadoop, donde el
    numero de map tasks crece con el tamano de la entrada."""
    if not os.path.isdir(FRAGMENTOS_DIR):
        raise SystemExit("Falta data/w4/: corre primero src/w4/dataset.py")
    partes = sorted(f for f in os.listdir(FRAGMENTOS_DIR) if f.startswith("part-") and f.endswith(".csv"))
    if not partes:
        raise SystemExit("data/w4/ no tiene fragmentos: corre primero src/w4/dataset.py")
    return [Fragmento(os.path.join(FRAGMENTOS_DIR, p), c) for c in range(copias) for p in partes]


def dividir(registros, n):
    """Parte una lista en n splits contiguos (para entradas que ya estan en
    memoria: las aristas del Job 2, la matriz de PageRank, la salida de una
    ronda que alimenta a la siguiente)."""
    registros = list(registros)
    n = max(1, min(n, len(registros)))
    paso, sobra = divmod(len(registros), n)
    out, i = [], 0
    for k in range(n):
        j = i + paso + (1 if k < sobra else 0)
        out.append(registros[i:j])
        i = j
    return out


def leer(split):
    """Los registros de un split: filas (dict de str) si es un Fragmento o la
    ruta de un .csv; los elementos tal cual si es una lista."""
    if isinstance(split, Fragmento):
        sufijo = f"#{split.copia}" if split.copia else ""
        with open(split.ruta, newline="", encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                if sufijo:
                    fila["driver_id"] += sufijo
                yield fila
    elif isinstance(split, str):
        with open(split, newline="", encoding="utf-8") as f:
            yield from csv.DictReader(f)
    else:
        yield from split


def particion(clave, reducers):
    """A que reduce task va una clave: h(clave) mod R, con h estable."""
    h = hashlib.blake2b(repr(clave).encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(h, "big") % reducers


def _ordenadas(claves):
    try:
        return sorted(claves)
    except TypeError:                   # claves de tipos mezclados
        return sorted(claves, key=repr)


def _tarea_map(args):
    """Una map task: lee su split, aplica map (y el combiner sobre su propia
    salida) y deja los pares repartidos en R particiones. Devuelve cada
    particion serializada por separado: esos bytes son exactamente lo que
    viaja por el shuffle hasta su reduce task, y su tamano es el que se
    reporta. El proceso principal solo los reenvia, sin abrirlos."""
    mapper, combiner, split, reducers = args
    partes = [[] for _ in range(reducers)]
    destino = {}
    leidos = emitidos = 0
    buffer = defaultdict(list) if combiner else None
    for registro in leer(split):
        leidos += 1
        for clave, valor in mapper(registro):
            emitidos += 1
            if buffer is not None:
                buffer[clave].append(valor)
                continue
            r = destino.get(clave)
            if r is None:
                r = destino[clave] = particion(clave, reducers)
            partes[r].append((clave, valor))
    if buffer is not None:
        for clave in _ordenadas(buffer):
            for k2, v2 in combiner(clave, buffer[clave]):
                partes[particion(k2, reducers)].append((k2, v2))
    blobs = [pickle.dumps(p, protocol=pickle.HIGHEST_PROTOCOL) for p in partes]
    return leidos, emitidos, [len(p) for p in partes], blobs


def _tarea_reduce(args):
    """Una reduce task: abre lo que le mando cada map task, agrupa los pares
    por clave y llama al reduce una vez por clave, en orden de clave.

    Ademas de la salida devuelve la clave mas cargada de esta task (la menor,
    si varias empatan) y cuantas claves tienen ese maximo."""
    reducer, blobs = args
    grupos = defaultdict(list)
    for blob in blobs:
        for clave, valor in pickle.loads(blob):
            grupos[clave].append(valor)
    salida = []
    max_valores, clave_max, empates = 0, None, 0
    for clave in _ordenadas(grupos):
        valores = grupos[clave]
        if len(valores) > max_valores:
            max_valores, clave_max, empates = len(valores), clave, 1
        elif len(valores) == max_valores:
            empates += 1
        salida.extend(reducer(clave, valores))
    return salida, len(grupos), max_valores, clave_max, empates


class Resultado:
    """Lo que devuelve Cluster.ejecutar.

    salida       [(clave, valor), ...] de todas las reduce tasks, ordenada
    por_reducer  la salida de cada reduce task por separado: sirve de splits
                 para la ronda siguiente sin juntarla en un solo lugar
    stats        las cifras del job, con las claves del contrato"""

    def __init__(self, salida, por_reducer, stats):
        self.salida = salida
        self.por_reducer = por_reducer
        self.stats = stats


class Cluster:
    """Un pool de `workers` procesos que corre jobs de MapReduce.

    Se usa con `with`: el pool se crea una vez y sirve para todos los jobs de
    adentro (las rondas de PageRank, los R de la Task 4), y su arranque no
    entra en el tiempo de ningun job. Queda en `arranque_s`."""

    def __init__(self, workers=1):
        self.workers = max(1, int(workers))
        self.parallel = self.workers > 1 and not EN_NAVEGADOR
        self.arranque_s = 0.0
        self._pool = None

    def __enter__(self):
        if self.parallel:
            import multiprocessing
            t0 = time.perf_counter()
            self._pool = multiprocessing.get_context("spawn").Pool(self.workers)
            # Un viaje de ida y vuelta para que los procesos ya esten listos.
            self._pool.map(abs, range(self.workers), chunksize=1)
            self.arranque_s = time.perf_counter() - t0
        return self

    def __exit__(self, *exc):
        if self._pool is not None:
            self._pool.close()
            self._pool.join()
            self._pool = None
        return False

    def _mapear(self, funcion, tareas):
        if self._pool is None:
            return [funcion(t) for t in tareas]
        return self._pool.map(funcion, tareas, chunksize=1)

    def ejecutar(self, job, splits, mapper, reducer, combiner=None, reducers=4):
        """Corre un job: una map task por split y `reducers` reduce tasks."""
        reducers = max(1, int(reducers))
        splits = list(splits)
        t0 = time.perf_counter()
        mapeados = self._mapear(_tarea_map, [(mapper, combiner, s, reducers) for s in splits])
        t1 = time.perf_counter()

        # Shuffle: la particion r de cada map task va a la reduce task r. Aqui
        # solo se reparten los bytes; los abre cada reduce task.
        entrada_reduce = [[] for _ in range(reducers)]
        cargas = [0] * reducers
        leidos = emitidos = shuffle_bytes = 0
        for n_leidos, n_emitidos, tamanos, blobs in mapeados:
            leidos += n_leidos
            emitidos += n_emitidos
            for r, (n, blob) in enumerate(zip(tamanos, blobs)):
                cargas[r] += n
                shuffle_bytes += len(blob)
                entrada_reduce[r].append(blob)
        t2 = time.perf_counter()

        reducidos = self._mapear(_tarea_reduce, [(reducer, blobs) for blobs in entrada_reduce])
        t3 = time.perf_counter()

        por_reducer = [s for s, _, _, _, _ in reducidos]
        salida = [par for s in por_reducer for par in s]
        salida = [salida[i] for i in _orden_por_clave(salida)]
        # q y su clave. Si varias claves empatan (en 1b con combiner empatan
        # todos los pares; a 2x, cada conductor con su copia), la reportada es
        # la menor de todo el job, asi no depende de R, y hot_key_ties dice
        # cuantas son.
        q = max((m for _, _, m, _, _ in reducidos), default=0)
        candidatas = [c for _, _, m, c, _ in reducidos if q and m == q]
        clave_q = _ordenadas(candidatas)[0] if candidatas else None
        empates = sum(e for _, _, m, _, e in reducidos if q and m == q)
        stats = {
            "job": job,
            "map_tasks": len(splits),
            "reduce_tasks": reducers,
            "workers": self.workers,
            "parallel": self.parallel,
            "input_records": leidos,
            "map_output_pairs": emitidos,
            "shuffle_pairs": sum(cargas),
            "shuffle_bytes": shuffle_bytes,
            "reducer_loads": cargas,
            "max_reducer_load": max(cargas) if cargas else 0,
            "distinct_keys": sum(n for _, n, _, _, _ in reducidos),
            "max_key_values": q,
            "hot_key": _texto(clave_q),
            "hot_key_ties": empates,
            "output_records": len(salida),
            "map_s": round(t1 - t0, 4),
            "shuffle_s": round(t2 - t1, 4),
            "reduce_s": round(t3 - t2, 4),
            "total_s": round(t3 - t0, 4),
        }
        return Resultado(salida, por_reducer, stats)


def _orden_por_clave(pares):
    claves = [k for k, _ in pares]
    try:
        return sorted(range(len(pares)), key=claves.__getitem__)
    except TypeError:
        return sorted(range(len(pares)), key=lambda i: repr(claves[i]))


def _texto(clave):
    """La clave mas cargada, como texto para el JSON (una tupla se une con
    ' -> ', que es como se leen los pares de zonas)."""
    if clave is None:
        return ""
    if isinstance(clave, tuple):
        return " -> ".join(str(x) for x in clave)
    return str(clave)


def ejecutar(job, splits, mapper, reducer, combiner=None, reducers=4, workers=1):
    """Un job suelto, con su propio pool. Para varios jobs seguidos conviene
    abrir un Cluster con `with` y reusarlo."""
    with Cluster(workers) as c:
        return c.ejecutar(job, splits, mapper, reducer, combiner=combiner, reducers=reducers)
