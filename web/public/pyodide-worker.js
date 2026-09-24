/* eslint-disable no-restricted-globals */
/**
 * pyodide-worker.js
 * -----------------
 * Corre el pipeline real del proyecto (los mismos .py que estan en ../src)
 * dentro de Pyodide, en un Web Worker para no congelar la UI.
 *
 * No hay reimplementacion de los algoritmos: se monta un FS virtual con la
 * misma estructura que el repo (/proj/src, /proj/dashboard) y cada script se
 * ejecuta con runpy bajo run_name="__main__", que es exactamente como corren
 * desde la terminal. Los parametros de ciudad viajan por os.environ.
 *
 * Que archivos existen NO se asume: se lee de public/py/manifest.json, que
 * escribe scripts/sync-python.mjs con lo que realmente hay en el repo. Una
 * task que todavia no se agrego simplemente no tiene etapa, y su panel queda
 * pendiente en la UI.
 */

const PYODIDE_VERSION = "0.28.3";
importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

// Orden del pipeline. `key` es lo que la UI usa para pedir corridas parciales.
const STAGES = [
  { key: "generator", file: "src/data_generator.py", label: "Generando dataset" },
  { key: "task1", file: "src/task1_bigdata.py", label: "Task 1 · Contexto Big Data" },
  { key: "task3", file: "src/task3_hashing.py", label: "Task 3 · Hashing universal" },
  { key: "task4", file: "src/task4_hashtable.py", label: "Task 4 · Tabla hash" },
  { key: "task5", file: "src/task5_probability.py", label: "Task 5 · Cotas de probabilidad" },
  // Task 2 va al final a proposito: es el benchmark de QuickSort y se come la
  // mayor parte del tiempo. Asi los demas paneles ya estan pintados cuando
  // arranca, en vez de bloquear todo el dashboard.
  { key: "task2", file: "src/task2_randomized.py", label: "Task 2 · Benchmark QuickSort" },
];

let pyodide = null;
let ready = false;
/** Rutas .py efectivamente montadas, segun el manifest. */
let mounted = new Set();

const post = (msg) => self.postMessage(msg);

/** Etapas que se pueden correr: las que tienen su .py en el repo. */
const activeStages = () => STAGES.filter((s) => mounted.has(s.file));

/** Sube los .py del repo al FS virtual, respetando la estructura de carpetas
 *  (el prologo BASE de cada script deriva las rutas de su propio __file__). */
async function mountProject(baseUrl) {
  const res = await fetch(`${baseUrl}py/manifest.json`);
  if (!res.ok) throw new Error(`No se pudo leer el manifest: HTTP ${res.status}`);
  const manifest = await res.json();

  pyodide.FS.mkdirTree("/proj/src");
  pyodide.FS.mkdirTree("/proj/dashboard");

  mounted = new Set();
  for (const { path: rel } of manifest.files) {
    const r = await fetch(`${baseUrl}py/${rel}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${rel}: HTTP ${r.status}`);
    pyodide.FS.writeFile(`/proj/${rel}`, await r.text(), { encoding: "utf8" });
    mounted.add(rel);
  }
}

async function init(baseUrl) {
  if (ready) return;
  post({ type: "status", message: `Descargando Pyodide ${PYODIDE_VERSION}...` });
  pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
  });

  post({ type: "status", message: "Montando el proyecto..." });
  await mountProject(baseUrl);

  // Helpers de orquestacion. Ejecutan los scripts tal cual, capturando stdout
  // para poder mostrar en la web la misma salida de consola que en la terminal.
  pyodide.runPython(`
import os, sys, io, json, runpy, contextlib, importlib.util

PROJ = "/proj"

def set_params(params):
    for k in list(os.environ):
        if k.startswith("RIDES_"):
            del os.environ[k]
    for k, v in params.items():
        if v is not None and v != "":
            os.environ[k] = str(v)

def run_script(rel):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        runpy.run_path(os.path.join(PROJ, rel), run_name="__main__")
    return buf.getvalue()

def _build_dashboard():
    """dashboard/build_dashboard.py, cargado por ruta (no esta en sys.path)."""
    spec = importlib.util.spec_from_file_location(
        "build_dashboard", os.path.join(PROJ, "dashboard", "build_dashboard.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def read_results():
    """Lee los results/task*.json que los scripts acaban de escribir y los
    reorganiza con las MISMAS funciones de dashboard/build_dashboard.py, para
    que la forma {panelA, panelB, panelC, kpis} tenga una sola fuente de verdad.

    Cada panel se arma en cuanto SUS resultados existen, no cuando terminan las
    cinco tasks: asi el dashboard se va pintando por partes, el benchmark de
    QuickSort (que tarda mas que todo el resto junto) no bloquea lo demas, y una
    task que ni siquiera esta en el repo simplemente deja su panel sin datos."""
    bd = _build_dashboard()
    problemas = {}
    out = bd.available_results(errors=problemas)
    panels = bd.build_panels(out, errors=problemas)
    # panelErrors viaja a la UI para que el hueco diga por que esta vacio:
    # no es lo mismo "esa task no esta en el repo" que "corrio y su JSON no
    # trae lo que el panel indexa".
    return json.dumps({"raw": out, "panels": panels, "panelErrors": problemas})

def dataset_preview(n=8):
    """Primeras n filas del CSV generado, para mostrar el dataset real en la UI."""
    import csv
    p = os.path.join(PROJ, "data", "rides.csv")
    if not os.path.exists(p):
        return json.dumps({"rows": [], "total": 0, "bytes": 0})
    with open(p, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = []
        total = 0
        for i, row in enumerate(r):
            total += 1
            if i < n:
                rows.append(row)
        for _ in r:
            total += 1
    return json.dumps({"rows": rows, "total": total, "bytes": os.path.getsize(p)})
`);

  ready = true;
  // La UI arma su lista de etapas con esto: no puede asumir las seis, porque
  // depende de que tasks esten agregadas al repo.
  post({
    type: "ready",
    pyodideVersion: PYODIDE_VERSION,
    stages: activeStages().map(({ key, label }) => ({ key, label })),
  });
}

async function run({ params, stages }) {
  const wanted = stages && stages.length ? new Set(stages) : null;
  const toRun = activeStages().filter((s) => !wanted || wanted.has(s.key));

  pyodide.globals.get("set_params")(pyodide.toPy(params));

  for (const stage of toRun) {
    post({ type: "stage", key: stage.key, label: stage.label, status: "running" });
    const t0 = performance.now();
    try {
      const output = pyodide.globals.get("run_script")(stage.file);
      const seconds = (performance.now() - t0) / 1000;
      post({
        type: "stage",
        key: stage.key,
        label: stage.label,
        status: "done",
        seconds,
        output,
      });
      // Tras cada etapa publicamos lo que ya se puede pintar, para que los
      // paneles aparezcan progresivamente en vez de todos al final.
      post({ type: "partial", payload: JSON.parse(pyodide.globals.get("read_results")()) });
      if (stage.key === "generator") {
        post({ type: "dataset", payload: JSON.parse(pyodide.globals.get("dataset_preview")(8)) });
      }
    } catch (err) {
      post({
        type: "stage",
        key: stage.key,
        label: stage.label,
        status: "error",
        seconds: (performance.now() - t0) / 1000,
        output: String(err && err.message ? err.message : err),
      });
      post({ type: "done", ok: false });
      return;
    }
  }

  post({ type: "done", ok: true });
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      await init(msg.baseUrl);
    } else if (msg.type === "run") {
      if (!ready) await init(msg.baseUrl);
      await run(msg);
    }
  } catch (err) {
    post({ type: "fatal", message: String(err && err.message ? err.message : err) });
  }
};
