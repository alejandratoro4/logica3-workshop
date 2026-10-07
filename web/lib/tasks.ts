/** Paginas de cada task: enunciado, metodo, hallazgos y que decir al exponer.
 *
 * Cada pagina es un archivo, lib/docs/wN/taskK.ts, que exporta un TaskDoc. No
 * hay lista que mantener: scripts/sync-python.mjs encuentra los archivos y los
 * registra en lib/generated/registro.ts. Asi una task nueva no toca el
 * archivo de nadie mas.
 *
 * La consumen la pagina dedicada (app/w/[slug]/t/[task]) y el modo
 * diapositivas (SlideDeck), asi que el texto no se duplica entre las dos.
 *
 * Regla: en la prosa NO se escriben numeros a mano. Todo dato medido sale de
 * la corrida cargada, via `lede` y `metrics`, que reciben el JSON de la task.
 * Asi mover un parametro de ciudad cambia tambien la exposicion, y nunca queda
 * una cifra escrita que contradiga al grafico que tiene al lado. */

import type { CityParams } from "./params";
import type { Results } from "./types";
import { DOCS, SCRIPTS } from "./generated/registro";

export type TaskMetric = { label: string; value: string; hint?: string };

/** Lo que escribe quien documenta una task. `R` es el tipo de su JSON
 *  (W2Task3, ...), generado de su contrato. */
export type TaskDoc<R = unknown> = {
  /** Titulo corto y afirmativo: es el titular de la diapositiva. */
  title: string;
  /** Tema, para el tag monoespaciado del encabezado. */
  topic: string;
  /** El enunciado original, traducido. Lo que hay que demostrar que se hizo. */
  statement: string;
  /** Titular sin datos, para la primera pintada y el HTML prerenderizado.
   *  Nunca menciona cifras: se muestra antes de que haya corrida. */
  standfirst: string;
  /** Titular con datos de la corrida actual. `all` trae las demas tasks. */
  lede: (r: R, all: Results, params: CityParams) => string;
  /** Cifras de la corrida actual, para leer en voz alta sin buscar en el grafico. */
  metrics: (r: R, all: Results) => TaskMetric[];
  /** Explicacion larga. Es lo que la diapositiva no alcanza a decir. */
  sections: { h: string; p: string }[];
  /** La frase con la que se cierra la task al exponer. */
  takeaway: string;
};

/** Un TaskDoc ya ubicado: numero, ruta y script salen del nombre del archivo. */
export type Doc = TaskDoc<unknown> & {
  n: number;
  slug: string;
  /** Script que produce los numeros, o null si todavia no esta en el repo. */
  source: string | null;
};

export const getTaskDocs = (ws: string): Doc[] =>
  Object.entries(DOCS[ws] ?? {})
    .map(([k, d]) => ({ ...(d as TaskDoc<unknown>), n: Number(k), slug: k, source: SCRIPTS[ws]?.[Number(k)] ?? null }))
    .sort((a, b) => a.n - b.n);

export const getTaskDoc = (ws: string, task: string): Doc | undefined =>
  getTaskDocs(ws).find((t) => t.slug === task);
