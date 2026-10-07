/**
 * sync-python.mjs
 * ---------------
 * Puente entre el proyecto Python y la app. Corre antes de cada dev/build y
 * deja todo lo que la app necesita saber del repo, sin listas escritas a mano:
 *
 *  1. public/py/: copia de src/wN/*.py, dashboard/contrato.py y contratos/*.md,
 *     para que Pyodide los ejecute y el visor de codigo muestre los mismos
 *     bytes. public/py/manifest.json dice que hay de cada workshop.
 *  2. lib/generated/city-profile.ts: zonas y suma de BASE_LAMBDA, parseadas de
 *     src/w1/dataset.py, para estimar filas antes de generar.
 *  3. lib/generated/contratos.ts: un tipo por task (W2Task3, ...) sacado del
 *     ejemplo JSON de contratos/wN.md, con las mismas reglas que valida
 *     dashboard/contrato.py. Asi el panel, la pagina y el validador leen el
 *     mismo contrato.
 *  4. lib/generated/registro.ts: importa las paginas (lib/docs/wN/taskK.ts) y
 *     los paneles (components/panels/wN/TaskK.tsx) que existan.
 *
 * Convenciones (las mismas de run_all.py):
 *   src/wN/dataset.py          el dataset del workshop N
 *   src/wN/taskK_tema.py       la task K; escribe results/wN/taskK.json
 *
 * Es la unica fuente de verdad: nada de lo generado se edita a mano.
 */
import { copyFile, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
const REPO = resolve(WEB, "..");
const OUT = join(WEB, "public", "py");
const GEN = join(WEB, "lib", "generated");

const PATRON_TASK = /^task(\d+)_[a-z0-9_]+\.py$/;

const ls = async (dir) => (existsSync(dir) ? (await readdir(dir)).sort() : []);

// --- 1. que hay en src/ -------------------------------------------------------

const workshops = {};
const avisos = [];
for (const d of await ls(join(REPO, "src"))) {
  const m = d.match(/^w(\d+)$/);
  if (!m) {
    // Una task de antes de la reorganizacion (src/task3_hashing.py) no corre:
    // se avisa en vez de dejar que su panel diga "falta" sin explicar por que.
    if (d.endsWith(".py")) avisos.push(`src/${d} esta fuera de src/wN/: muevelo a la carpeta de su workshop (p. ej. src/w1/${d}).`);
    continue;
  }
  const ws = m[1];
  const info = { dataset: null, tasks: {} };
  for (const f of await ls(join(REPO, "src", d))) {
    if (!f.endsWith(".py")) continue;
    if (f === "dataset.py") {
      info.dataset = `src/${d}/${f}`;
      continue;
    }
    const t = f.match(PATRON_TASK);
    if (!t) {
      avisos.push(`src/${d}/${f} no sigue el patron taskK_tema.py: no se usa.`);
      continue;
    }
    const k = Number(t[1]);
    if (info.tasks[k]) {
      avisos.push(`hay dos scripts para la task ${k} del W${ws}: se usa ${info.tasks[k]}.`);
      continue;
    }
    info.tasks[k] = `src/${d}/${f}`;
  }
  workshops[ws] = info;
}

if (!workshops["1"]?.dataset) {
  throw new Error("Falta src/w1/dataset.py, que es indispensable. Corre esto desde web/ dentro del repo.");
}

// Contratos: un .md por workshop.
const contratos = {};
for (const f of await ls(join(REPO, "contratos"))) {
  const m = f.match(/^w(\d+)\.md$/);
  if (m) contratos[m[1]] = await readFile(join(REPO, "contratos", f), "utf8");
}

await rm(OUT, { recursive: true, force: true });
const files = [];
async function publicar(rel, extra) {
  const dst = join(OUT, rel);
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(join(REPO, rel), dst);
  const text = await readFile(join(REPO, rel), "utf8");
  files.push({ path: rel, ...extra, bytes: Buffer.byteLength(text, "utf8"), lines: text.split("\n").length });
}

for (const [ws, info] of Object.entries(workshops)) {
  if (info.dataset) await publicar(info.dataset, { ws, kind: "dataset" });
  for (const [k, rel] of Object.entries(info.tasks)) await publicar(rel, { ws, kind: "task", task: Number(k) });
}
await publicar("dashboard/contrato.py", { kind: "infra" });
for (const ws of Object.keys(contratos)) await publicar(`contratos/w${ws}.md`, { ws, kind: "contrato" });

await writeFile(
  join(OUT, "manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), workshops, files, avisos }, null, 2)
);

// --- 2. perfil de ciudad -------------------------------------------------------

const genSrc = await readFile(join(REPO, "src/w1/dataset.py"), "utf8");
const block = genSrc.match(/BASE_LAMBDA\s*=\s*\{([\s\S]*?)^\}/m);
if (!block) throw new Error("No se encontro el bloque BASE_LAMBDA en src/w1/dataset.py");
const LAMBDA_SUM = {};
for (const m of block[1].matchAll(/"([A-Z_]+)"\s*:\s*\[([^\]]*)\]/g)) {
  LAMBDA_SUM[m[1]] = m[2].split(",").reduce((a, n) => a + Number(n.trim()), 0);
}
const zones = Object.keys(LAMBDA_SUM);
if (!zones.length) throw new Error("BASE_LAMBDA quedo vacio: cambio el formato del dict?");

await mkdir(GEN, { recursive: true });
await writeFile(
  join(GEN, "city-profile.ts"),
  [
    "// GENERADO por scripts/sync-python.mjs desde src/w1/dataset.py - no editar a mano.",
    `export const ALL_ZONES = ${JSON.stringify(zones)} as const;`,
    `export const LAMBDA_SUM: Record<string, number> = ${JSON.stringify(LAMBDA_SUM, null, 2)};`,
    "",
  ].join("\n")
);

// --- 3. tipos desde los contratos ---------------------------------------------

/** {K: ejemplo} de un contratos/wN.md, con la misma regla que contrato.py. */
function leerContrato(texto) {
  const tasks = {};
  const re = /^## Task (\d+)\b([\s\S]*?)(?=^## |(?![\s\S]))/gm;
  for (const m of texto.matchAll(re)) {
    const bloque = m[2].match(/```json\s*\n([\s\S]*?)\n```/);
    if (bloque) tasks[Number(m[1])] = JSON.parse(bloque[1]);
  }
  return tasks;
}

/** Tipo TypeScript del ejemplo (reglas en dashboard/contrato.py). */
function tipo(ej, ind = "") {
  if (ej === null) return "unknown";
  if (typeof ej === "number") return "number";
  if (typeof ej === "string") return "string";
  if (typeof ej === "boolean") return "boolean";
  if (Array.isArray(ej)) {
    if (!ej.length) return "unknown[]";
    const t = tipo(ej[0], ind);
    return /^[\w]+$/.test(t) ? `${t}[]` : `Array<${t}>`;
  }
  const claves = Object.keys(ej);
  if (claves.length === 1 && claves[0] === "*") return `Record<string, ${tipo(ej["*"], ind)}>`;
  const sub = ind + "  ";
  const campos = claves.map((k) => {
    const opcional = k.endsWith("?");
    const nombre = opcional ? k.slice(0, -1) : k;
    const clave = /^[A-Za-z_]\w*$/.test(nombre) ? nombre : JSON.stringify(nombre);
    return `${sub}${clave}${opcional ? "?" : ""}: ${tipo(ej[k], sub)};`;
  });
  return `{\n${campos.join("\n")}\n${ind}}`;
}

const tiposLineas = [
  "// GENERADO por scripts/sync-python.mjs desde contratos/wN.md - no editar a mano.",
  "// Cada tipo es el ejemplo JSON de su task; las reglas estan en dashboard/contrato.py.",
  "",
];
const tareasContrato = {};
for (const [ws, texto] of Object.entries(contratos)) {
  const tasks = leerContrato(texto);
  tareasContrato[ws] = Object.keys(tasks).map(Number).sort((a, b) => a - b);
  for (const k of tareasContrato[ws]) {
    tiposLineas.push(`export type W${ws}Task${k} = ${tipo(tasks[k])};`, "");
  }
  tiposLineas.push(
    `export type ResultsW${ws} = {`,
    ...tareasContrato[ws].map((k) => `  task${k}?: W${ws}Task${k};`),
    "};",
    ""
  );
}
tiposLineas.push(`export const CONTRACT_TASKS: Record<string, number[]> = ${JSON.stringify(tareasContrato)};`, "");
await writeFile(join(GEN, "contratos.ts"), tiposLineas.join("\n"));

// --- 4. registro de paginas y paneles -----------------------------------------

const imports = [];
const docs = {};
const panels = {};
for (const d of await ls(join(WEB, "lib", "docs"))) {
  const m = d.match(/^w(\d+)$/);
  if (!m) continue;
  for (const f of await ls(join(WEB, "lib", "docs", d))) {
    const t = f.match(/^task(\d+)\.ts$/);
    if (!t) continue;
    const id = `doc_${m[1]}_${t[1]}`;
    imports.push(`import ${id} from "@/lib/docs/${d}/task${t[1]}";`);
    (docs[m[1]] ??= []).push(`${t[1]}: ${id}`);
  }
}
for (const d of await ls(join(WEB, "components", "panels"))) {
  const m = d.match(/^w(\d+)$/);
  if (!m) continue;
  for (const f of await ls(join(WEB, "components", "panels", d))) {
    const t = f.match(/^Task(\d+)\.tsx$/);
    if (!t) continue;
    const id = `Panel_${m[1]}_${t[1]}`;
    imports.push(`import ${id} from "@/components/panels/${d}/Task${t[1]}";`);
    (panels[m[1]] ??= []).push(`${t[1]}: ${id}`);
  }
}
const mapa = (obj) =>
  `{\n${Object.entries(obj)
    .map(([ws, xs]) => `  "${ws}": { ${xs.join(", ")} },`)
    .join("\n")}\n}`;
// Los scripts de cada task, para enlazar la pagina con su codigo.
const scripts = Object.fromEntries(Object.entries(workshops).map(([ws, i]) => [ws, i.tasks]));
await writeFile(
  join(GEN, "registro.ts"),
  [
    "// GENERADO por scripts/sync-python.mjs - no editar a mano.",
    "// Una pagina es lib/docs/wN/taskK.ts y un panel components/panels/wN/TaskK.tsx:",
    "// basta crear el archivo para que aparezca.",
    "/* eslint-disable @typescript-eslint/no-explicit-any */",
    'import type { ComponentType } from "react";',
    'import type { TaskDoc } from "@/lib/tasks";',
    'import type { PanelProps } from "@/lib/types";',
    ...imports,
    "",
    `export const DOCS: Record<string, Record<number, TaskDoc<any>>> = ${mapa(docs)};`,
    "",
    `export const PANELS: Record<string, Record<number, ComponentType<PanelProps<any>>>> = ${mapa(panels)};`,
    "",
    `export const SCRIPTS: Record<string, Record<number, string>> = ${JSON.stringify(scripts, null, 2)};`,
    "",
  ].join("\n")
);

// --- resumen ------------------------------------------------------------------

for (const [ws, info] of Object.entries(workshops)) {
  const hechas = Object.keys(info.tasks).map(Number);
  const faltan = (tareasContrato[ws] ?? []).filter((k) => !hechas.includes(k));
  console.log(
    `sync-python: W${ws} tasks [${hechas.join(", ")}]` + (faltan.length ? `, sin script todavia [${faltan.join(", ")}]` : "")
  );
}
for (const a of avisos) console.log(`sync-python: AVISO ${a}`);
console.log(`sync-python: ${files.length} archivos -> public/py/, ${zones.length} zonas, tipos de ${Object.keys(contratos).length} contratos`);
