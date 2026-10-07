"use client";

/** Maneja el Web Worker de Pyodide: arranque, corridas y estado por etapa.
 *  La UI nunca habla con el worker directamente. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CityParams } from "./params";
import { toEnv } from "./params";
import type { DatasetPreview, ResultErrors, Results, StageKey, StageState } from "./types";

/** De donde salen los resultados que se estan mostrando. Es aparte de los
 *  controles editables: mover un control no cambia lo que ya se corrio. */
export type Procedencia = {
  /** Parametros con los que se produjeron los resultados. */
  params: CityParams;
  /** Etiqueta si son precomputados (la corrida canonica); null si los corrio Pyodide. */
  label: string | null;
};

export type PipelineState = {
  booting: boolean;
  ready: boolean;
  running: boolean;
  error: string | null;
  /** Las etapas NO se declaran aca: dependen de que tasks esten en el repo, y
   *  eso lo sabe el worker al leer public/py/manifest.json. Llegan en "ready". */
  stages: StageState[];
  /** JSON de cada task que ya corrio y cumple su contrato, por "taskK". */
  results: Results | null;
  /** Tasks que corrieron pero cuyo JSON no cumple el contrato, con el motivo. */
  errors: ResultErrors;
  dataset: DatasetPreview | null;
  ran: Procedencia | null;
  pyodideVersion: string | null;
  statusMessage: string;
};

/** @param workshop  Cada worker corre un solo workshop.
 *  @param enabled   Si es false no se crea el worker: un workshop sin codigo
 *                   no debe descargar Pyodide solo por abrirlo. */
export function usePipeline(workshop: string, enabled = true) {
  const workerRef = useRef<Worker | null>(null);
  // Id de la corrida vigente. El worker lo repite en cada mensaje de una
  // corrida; los de una corrida sustituida (por otra, o por la canonica
  // cargada mientras el worker seguia corriendo) se descartan todos: etapas,
  // resultados, dataset, fin y errores.
  const runIdRef = useRef(0);
  // Permite comprobar si una carga asincrona de resultados sigue vigente
  // cuando termina su descarga, sin sustituir una corrida posterior.
  const getRunId = useCallback(() => runIdRef.current, []);
  const [state, setState] = useState<PipelineState>({
    booting: false, ready: false, running: false, error: null,
    stages: [], results: null, errors: {}, dataset: null, ran: null,
    pyodideVersion: null, statusMessage: "",
  });

  useEffect(() => {
    if (!enabled) return;
    const w = new Worker("/pyodide-worker.js");
    workerRef.current = w;

    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data || {};
      // Los mensajes del arranque no traen runId; los de una corrida, si.
      if (m.runId !== undefined && m.runId !== runIdRef.current) return;
      setState((prev) => {
        switch (m.type) {
          case "status":
            return { ...prev, booting: true, statusMessage: m.message };
          case "ready": {
            // Se puede haber cargado la corrida canonica ANTES de que Pyodide
            // terminara de arrancar. En ese caso las etapas ya quedaron en
            // "done"; pisarlas con "pending" mostraria un pipeline sin correr
            // junto a datos cargados.
            const previas = new Map(prev.stages.map((st) => [st.key, st]));
            return {
              ...prev, booting: false, ready: true, statusMessage: "",
              pyodideVersion: m.pyodideVersion,
              stages: (m.stages ?? []).map(
                (st: { key: StageKey; label: string }) =>
                  previas.get(st.key) ?? { ...st, status: "pending" as const }
              ),
            };
          }
          case "stage": {
            const stages = prev.stages.map((s) =>
              s.key === m.key
                ? { ...s, status: m.status, seconds: m.seconds, output: m.output ?? s.output }
                : s
            );
            return {
              ...prev, stages,
              error: m.status === "error" ? `${m.label}: ${m.output}` : prev.error,
            };
          }
          case "partial":
            // El worker manda el estado completo de results/ cada vez, asi que
            // se reemplaza: un JSON que se arreglo no debe seguir figurando roto.
            return { ...prev, results: m.payload.results ?? {}, errors: m.payload.errors ?? {} };
          case "dataset":
            return { ...prev, dataset: m.payload };
          case "done":
            return { ...prev, running: false };
          case "fatal":
            return { ...prev, booting: false, running: false, error: m.message };
          default:
            return prev;
        }
      });
    };

    w.onerror = (e) =>
      setState((p) => ({ ...p, booting: false, running: false, error: e.message || "Error en el worker" }));

    setState((p) => ({ ...p, booting: true, statusMessage: "Iniciando runtime de Python..." }));
    w.postMessage({ type: "init", baseUrl: `${location.origin}/`, workshop });

    return () => w.terminate();
  }, [enabled, workshop]);

  const run = useCallback(
    (params: CityParams, stages?: StageKey[]) => {
      const w = workerRef.current;
      if (!w) return;
      const runId = ++runIdRef.current;
      // Si se corre algun dataset, el que se estaba mostrando deja de ser el
      // de estos resultados hasta que llegue el nuevo.
      const rehaceDataset = !stages || stages.some((k) => k.startsWith("dataset"));
      setState((prev) => ({
        ...prev,
        running: true,
        error: null,
        ran: { params, label: null },
        ...(rehaceDataset ? { dataset: null } : {}),
        // Una corrida completa empieza de cero, igual que en el worker: los
        // paneles de la corrida anterior no deben quedar como si fueran de esta.
        ...(stages ? {} : { results: null, errors: {} }),
        stages: prev.stages.map((s) =>
          !stages || stages.includes(s.key)
            ? { ...s, status: "pending", seconds: undefined, output: undefined }
            : s
        ),
      }));
      w.postMessage({
        type: "run",
        baseUrl: `${location.origin}/`,
        workshop,
        params: toEnv(params),
        stages: stages ?? null,
        runId,
      });
    },
    [workshop]
  );

  /** Inyecta una corrida ya calculada (la canonica precomputada) sin pasar por
   *  Pyodide: evita esperar minutos solo para ver los numeros del informe. */
  const loadResults = useCallback((results: Results, label: string, params: CityParams) => {
    // Sustituye a cualquier corrida en curso: sus mensajes ya no se aplican.
    runIdRef.current++;
    setState((prev) => ({
      ...prev,
      results,
      running: false,
      error: null,
      errors: {},
      // La canonica no trae vista previa del CSV: mostrar la de una corrida
      // anterior seria mostrar otro dataset.
      dataset: null,
      ran: { params, label },
      stages: prev.stages.map((st) => ({
        ...st,
        status: "done" as const,
        seconds: undefined,
        output: `Precomputado (${label}), sin recomputar.`,
      })),
    }));
  }, []);

  return { ...state, run, loadResults, getRunId };
}
