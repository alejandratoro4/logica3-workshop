/** Formas que viajan entre el worker de Pyodide y la UI.
 *
 * Los datos de cada task NO se declaran aca: son el JSON que escribe la task,
 * recortado a las claves de su contrato (contratos/wN.md), y sus tipos se
 * generan de ese mismo contrato en lib/generated/contratos.ts. */

/** Los results/wN/taskK.json de la corrida, con clave "taskK". Cada task
 *  aparece en cuanto termina, asi que cualquiera puede faltar. */
export type Results = Record<string, unknown>;

/** Por que una task que SI corrio no tiene panel: su JSON no cumple el
 *  contrato. Clave "taskK"; el texto lo arma dashboard/contrato.py. */
export type ResultErrors = Record<string, string>;

/** Lo que recibe cada panel: el JSON de su task y, para los paneles que
 *  cruzan datos (el Panel D del W3), los de las demas. */
export type PanelProps<R> = { data: R; all: Results };

/** "dataset1", "dataset2", ... o "task1", "task2", ... */
export type StageKey = string;

export type StageState = {
  key: StageKey;
  label: string;
  status: "pending" | "running" | "done" | "error";
  seconds?: number;
  output?: string;
};

export type DatasetPreview = {
  name: string;
  rows: Record<string, string>[];
  total: number;
  bytes: number;
};
