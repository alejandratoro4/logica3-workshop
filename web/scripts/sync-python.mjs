/**
 * sync-python.mjs
 * ---------------
 * Copia los .py del proyecto academico (../src y ../dashboard) a public/py/
 * para que (a) Pyodide pueda descargarlos en tiempo de ejecucion y (b) el
 * visor de codigo muestre exactamente el mismo archivo que se ejecuta.
 *
 * Ademas deriva de data_generator.py el perfil de la ciudad (zonas y suma de
 * BASE_LAMBDA por zona), que la UI usa para estimar cuantas filas producira
 * una configuracion ANTES de generarlas. Se extrae del fuente en vez de
 * duplicarse a mano, para que no se pueda desincronizar en silencio.
 *
 * Es la unica fuente de verdad: no hay copias editadas a mano.
 *
 * Las tasks que todavia no existen en el repo se SALTAN, no rompen el build.
 * El repo se trabaja entre varias personas y cada quien agrega su script; el
 * manifest.json registra lo que si esta, y el worker y el visor de codigo se
 * arman a partir de el en vez de asumir los siete archivos.
 */
import { copyFile, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
const REPO = resolve(WEB, "..");
const OUT = join(WEB, "public", "py");

/** `required`: sin el no hay app que construir. El resto es opcional. */
const FILES = [
  { path: "src/data_generator.py", required: true, note: "Genera el dataset" },
  { path: "src/task1_bigdata.py", note: "Contexto de Big Data" },
  { path: "src/task2_randomized.py", note: "QuickSort + reservoir" },
  { path: "src/task3_hashing.py", note: "Hashing universal" },
  { path: "src/task4_hashtable.py", note: "Chaining vs P2C" },
  { path: "src/task5_probability.py", note: "Chebyshev / Chernoff" },
  { path: "dashboard/build_dashboard.py", required: true, note: "Arma los paneles" },
];

await rm(OUT, { recursive: true, force: true });

const manifest = [];
const faltantes = [];
for (const { path: rel, required, note } of FILES) {
  const src = join(REPO, rel);
  if (!existsSync(src)) {
    if (required) {
      throw new Error(
        `Falta ${rel}, que es indispensable para construir la app. ` +
          `Revisa que estes corriendo esto desde web/ dentro del repo.`
      );
    }
    faltantes.push(rel);
    continue;
  }
  const dst = join(OUT, rel);
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
  const text = await readFile(src, "utf8");
  manifest.push({
    path: rel,
    note,
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split("\n").length,
  });
}

// --- perfil de ciudad derivado de data_generator.py ------------------------
const genSrc = await readFile(join(REPO, "src/data_generator.py"), "utf8");
const block = genSrc.match(/BASE_LAMBDA\s*=\s*\{([\s\S]*?)^\}/m);
if (!block) throw new Error("No se encontro el bloque BASE_LAMBDA en data_generator.py");

const LAMBDA_SUM = {};
for (const m of block[1].matchAll(/"([A-Z_]+)"\s*:\s*\[([^\]]*)\]/g)) {
  LAMBDA_SUM[m[1]] = m[2].split(",").reduce((a, n) => a + Number(n.trim()), 0);
}
const zones = Object.keys(LAMBDA_SUM);
if (!zones.length) throw new Error("BASE_LAMBDA quedo vacio: cambio el formato del dict?");

await mkdir(join(WEB, "lib", "generated"), { recursive: true });
const lines = [
  "// GENERADO por scripts/sync-python.mjs desde src/data_generator.py - no editar a mano.",
  `export const ALL_ZONES = ${JSON.stringify(zones)} as const;`,
  `export const LAMBDA_SUM: Record<string, number> = ${JSON.stringify(LAMBDA_SUM, null, 2)};`,
  "",
];
await writeFile(join(WEB, "lib", "generated", "city-profile.ts"), lines.join("\n"));

await writeFile(
  join(OUT, "manifest.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), files: manifest, missing: faltantes },
    null,
    2
  )
);

const total = Object.values(LAMBDA_SUM).reduce((a, b) => a + b, 0);
console.log(`sync-python: ${manifest.length} .py -> public/py/`);
if (faltantes.length) {
  console.log(`sync-python: ${faltantes.length} sin agregar todavia al repo: ${faltantes.join(", ")}`);
  console.log("sync-python: sus paneles saldran marcados como pendientes.");
}
console.log(`sync-python: ${zones.length} zonas, suma BASE_LAMBDA = ${total} -> lib/generated/city-profile.ts`);
