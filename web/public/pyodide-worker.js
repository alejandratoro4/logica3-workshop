/* eslint-disable no-restricted-globals */
/**
 * pyodide-worker.js
 * -----------------
 * Corre el pipeline real del proyecto (los mismos .py de ../src) dentro de
 * Pyodide, en un Web Worker para no congelar la UI.
 *
 * No hay reimplementacion de los algoritmos: se monta un FS virtual con la
 * misma estructura que el repo (/proj/src/wN, /proj/dashboard, /proj/contratos)
 * y cada script se ejecuta con runpy bajo run_name="__main__", que es
 * exactamente como corre desde la terminal. Los parametros de ciudad viajan
 * por os.environ.
 *
 * Que etapas hay NO se escribe aca: sale de public/py/manifest.json, que
 * scripts/sync-python.mjs arma con lo que hay en el repo. Para el workshop N:
 * los datasets de w1 a wN (cada uno parte del anterior) y despues las tasks
 * de wN en orden. Una task que nadie ha entregado no tiene etapa, y su panel
 * queda pendiente en la UI.
 */

const PYODIDE_VERSION = "0.28.3";
importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

// Tasks que van al final de su workshop porque se comen la mayor parte del
// tiempo: asi los demas paneles ya estan pintados cuando arrancan. La Task 2
// del W1 es el benchmark de QuickSort.
const AL_FINAL = { "1": [2] };

// El CSV principal que escribe el dataset de cada workshop: es el que se
// muestra en la vista Dataset y el que leen sus tasks. Se nombra explicito, no
// por fecha de modificacion: el W3 escribe ademas edges_despacho.csv en el
// mismo milisegundo.
const SALIDA_DATASET = { "1": "rides.csv", "2": "stream.csv", "3": "edges.csv" };

let pyodide = null;
let ready = false;
let ws = "1";
let stages = [];

const post = (msg) => self.postMessage(msg);

function armarEtapas(manifest, w) {
  const out = [];
  for (let i = 1; i <= Number(w); i++) {
    const info = manifest.workshops[String(i)];
    if (info?.dataset) {
      out.push({
        key: `dataset${i}`,
        file: info.dataset,
        label: `Dataset · Workshop ${i}`,
        dataset: true,
        csv: SALIDA_DATASET[String(i)],
      });
    }
  }
  const tasks = Object.entries(manifest.workshops[w]?.tasks ?? {})
    .map(([k, file]) => ({ k: Number(k), file }))
    .sort((a, b) => a.k - b.k);
  const lentas = AL_FINAL[w] ?? [];
  const orden = [...tasks.filter((t) => !lentas.includes(t.k)), ...tasks.filter((t) => lentas.includes(t.k))];
  for (const t of orden) {
    out.push({ key: `task${t.k}`, file: t.file, label: `Task ${t.k}`, json: `results/w${w}/task${t.k}.json` });
  }
  return out;
}

async function init(baseUrl, workshop) {
  if (ready) return;
  ws = String(workshop ?? "1");
  post({ type: "status", message: `Descargando Pyodide ${PYODIDE_VERSION}...` });
  pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
  });

  post({ type: "status", message: "Montando el proyecto..." });
  const res = await fetch(`${baseUrl}py/manifest.json`);
  if (!res.ok) throw new Error(`No se pudo leer el manifest: HTTP ${res.status}`);
  const manifest = await res.json();
  for (const { path: rel } of manifest.files) {
    const r = await fetch(`${baseUrl}py/${rel}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${rel}: HTTP ${r.status}`);
    pyodide.FS.mkdirTree(`/proj/${rel.split("/").slice(0, -1).join("/")}`);
    pyodide.FS.writeFile(`/proj/${rel}`, await r.text(), { encoding: "utf8" });
  }
  stages = armarEtapas(manifest, ws);

  // Helpers de orquestacion. Ejecutan los scripts tal cual, capturando stdout
  // para mostrar en la web la misma salida de consola que en la terminal.
  pyodide.runPython(`
import os, sys, io, json, runpy, contextlib, importlib.util

PROJ = "/proj"
os.makedirs(os.path.join(PROJ, "data"), exist_ok=True)

def set_params(params):
    for k in list(os.environ):
        if k.startswith("RIDES_"):
            del os.environ[k]
    for k, v in params.items():
        if v is not None and v != "":
            os.environ[k] = str(v)

def clear_results(ws):
    """Borra los results/<ws>/ de la corrida anterior. Sin esto, una task que
    falla con los parametros nuevos seguiria mostrando los numeros viejos como
    si fueran de esta corrida, y mientras corre se mezclarian las dos."""
    import shutil
    shutil.rmtree(os.path.join(PROJ, "results", ws), ignore_errors=True)

def borrar(rel):
    """Borra la salida de una task antes de correrla: si falla o no escribe
    nada, no puede quedar la de una corrida anterior."""
    p = os.path.join(PROJ, rel)
    if os.path.exists(p):
        os.remove(p)

def existe(rel):
    return os.path.exists(os.path.join(PROJ, rel))

def run_script(rel):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        runpy.run_path(os.path.join(PROJ, rel), run_name="__main__")
    return buf.getvalue()

def _contrato():
    spec = importlib.util.spec_from_file_location(
        "contrato", os.path.join(PROJ, "dashboard", "contrato.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def read_results(ws):
    """Los results/wN/taskK.json que ya existen y cumplen el contrato,
    recortados a sus claves; y el motivo de los que no cumplen. Se llama
    despues de cada etapa, asi que los paneles aparecen de a uno."""
    resultados, errores = _contrato().cargar(ws)
    return json.dumps({"results": resultados, "errors": errores})

def dataset_preview(name, n=8):
    """Primeras n filas de data/<name>, el CSV principal del dataset que
    acaba de correr."""
    import csv
    p = os.path.join(PROJ, "data", name)
    if not os.path.exists(p):
        return json.dumps({"name": "", "rows": [], "total": 0, "bytes": 0})
    with open(p, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = []
        total = 0
        for row in r:
            total += 1
            if total <= n:
                rows.append(row)
    return json.dumps({"name": name, "rows": rows, "total": total, "bytes": os.path.getsize(p)})
`);

  ready = true;
  post({
    type: "ready",
    pyodideVersion: PYODIDE_VERSION,
    stages: stages.map(({ key, label }) => ({ key, label })),
  });
}

async function run({ params, stages: wanted, runId }) {
  // Cada mensaje de la corrida lleva su id: la UI descarta los de una corrida
  // que ya fue sustituida (por otra o por la canonica).
  const post = (msg) => self.postMessage({ ...msg, runId });
  const filtro = wanted && wanted.length ? new Set(wanted) : null;
  const toRun = stages.filter((s) => !filtro || filtro.has(s.key));

  pyodide.globals.get("set_params")(pyodide.toPy(params));
  // Una corrida parcial (solo algunas etapas) conserva lo demas; una completa
  // empieza de cero.
  if (!filtro) pyodide.globals.get("clear_results")(`w${ws}`);

  let fallo = false;
  for (const stage of toRun) {
    post({ type: "stage", key: stage.key, label: stage.label, status: "running" });
    const t0 = performance.now();
    if (stage.json) pyodide.globals.get("borrar")(stage.json);
    let output = "";
    let error = null;
    try {
      output = pyodide.globals.get("run_script")(stage.file);
      // Una task presente que corre sin entregar su JSON es un fallo, no un
      // pendiente: pendiente es solo la que no tiene script.
      if (stage.json && !pyodide.globals.get("existe")(stage.json)) {
        error = `${output}
Termino sin escribir ${stage.json}.`;
      }
    } catch (err) {
      error = String(err && err.message ? err.message : err);
    }
    // Una salida existente tambien debe cumplir el contrato antes de marcar
    // la task como terminada. Se conserva el payload para publicarlo incluso
    // si fallo, con el motivo y sin los datos viejos de esa task.
    let payload = null;
    if (!stage.dataset) {
      payload = JSON.parse(pyodide.globals.get("read_results")(`w${ws}`));
      const problema = payload.errors?.[stage.key];
      if (error === null && problema) {
        error = `${output}\n${stage.json} no cumple el contrato: ${problema}`;
      }
    }
    post({
      type: "stage",
      key: stage.key,
      label: stage.label,
      status: error === null ? "done" : "error",
      seconds: (performance.now() - t0) / 1000,
      output: error ?? output,
    });
    if (error !== null) fallo = true;
    if (stage.dataset) {
      // Sin dataset no hay nada que correr.
      if (error !== null) {
        post({ type: "done", ok: false });
        return;
      }
      post({ type: "dataset", payload: JSON.parse(pyodide.globals.get("dataset_preview")(stage.csv, 8)) });
    } else {
      // Tras cada task, haya fallado o no, se publica lo que ya se puede
      // pintar: los paneles aparecen de a uno, y el de una task que fallo deja
      // de mostrar datos viejos. Una task que falla no detiene a las demas:
      // cada una es de una persona distinta.
      post({ type: "partial", payload });
    }
  }

  post({ type: "done", ok: !fallo });
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      await init(msg.baseUrl, msg.workshop);
    } else if (msg.type === "run") {
      if (!ready) await init(msg.baseUrl, msg.workshop);
      await run(msg);
    }
  } catch (err) {
    post({ type: "fatal", message: String(err && err.message ? err.message : err), runId: msg.runId });
  }
};
