"use client";

/** Maneja el Web Worker de Pyodide: arranque, corridas y estado por etapa.
 *  La UI nunca habla con el worker directamente. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CityParams } from "./params";
import { toEnv } from "./params";
import type {
  DatasetPreview,
  PanelErrors,
  Panels,
  RawResults,
  StageKey,
  StageState,
} from "./types";

/** Las etapas NO se declaran aca.
 *
 *  Cuales existen depende de que tasks esten agregadas al repo, y eso solo lo
 *  sabe el worker despues de leer public/py/manifest.json. Listarlas a mano
 *  aca significaria mostrar etapas que nunca van a correr. Llegan en el
 *  mensaje "ready" y hasta entonces la consola muestra el estado de arranque. */
const initialStages = (): StageState[] => [];

export type PipelineState = {
  booting: boolean;
  ready: boolean;
  running: boolean;
  error: string | null;
  stages: StageState[];
  panels: Panels | null;
  raw: RawResults | null;
  /** Paneles que no se pudieron armar pese a que su task corrio. */
  panelErrors: PanelErrors;
  dataset: DatasetPreview | null;
  pyodideVersion: string | null;
  statusMessage: string;
};

/** @param enabled  Si es false no se crea el worker. Los workshops que todavia
 *  no tienen codigo no deben descargar Pyodide solo por abrirlos. */
export function usePipeline(enabled = true) {
  const workerRef = useRef<Worker | null>(null);
  // Cuando se carga una corrida precomputada, el pipeline que venia corriendo
  // puede seguir emitiendo resultados y pisarla. Esta bandera los descarta
  // hasta que el usuario pida una corrida nueva de forma explicita.
  const supersededRef = useRef(false);
  const [state, setState] = useState<PipelineState>({
    booting: false, ready: false, running: false, error: null,
    stages: initialStages(), panels: null, raw: null, panelErrors: {}, dataset: null,
    pyodideVersion: null, statusMessage: "",
  });

  useEffect(() => {
    if (!enabled) return;
    const w = new Worker("/pyodide-worker.js");
    workerRef.current = w;

    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data || {};
      setState((prev) => {
        switch (m.type) {
          case "status":
            return { ...prev, booting: true, statusMessage: m.message };
          case "ready": {
            // Se puede haber cargado la corrida canonica ANTES de que Pyodide
            // terminara de arrancar (el boton no espera al worker). En ese caso
            // las etapas ya quedaron en "done"; pisarlas con "pending" al llegar
            // el ready mostraria un pipeline sin correr junto a datos cargados.
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
            if (supersededRef.current) return prev;
            // Se fusiona en vez de reemplazar: cada mensaje trae los paneles
            // que ya se pueden armar, y los que faltan llegan mas tarde.
            return {
              ...prev,
              panels: { ...(prev.panels ?? {}), ...(m.payload.panels ?? {}) },
              raw: m.payload.raw ?? prev.raw,
              // Se reemplaza, no se fusiona: el reporte es del estado actual,
              // y un panel que ya se arreglo no debe seguir figurando roto.
              panelErrors: m.payload.panelErrors ?? {},
            };
          case "dataset":
            return supersededRef.current ? prev : { ...prev, dataset: m.payload };
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
    w.postMessage({ type: "init", baseUrl: `${location.origin}/` });

    return () => w.terminate();
  }, [enabled]);

  const run = useCallback((params: CityParams, stages?: StageKey[]) => {
    const w = workerRef.current;
    if (!w) return;
    supersededRef.current = false;
    setState((prev) => ({
      ...prev,
      running: true,
      error: null,
      panelErrors: {},
      stages: prev.stages.map((s) =>
        !stages || stages.includes(s.key)
          ? { ...s, status: "pending", seconds: undefined, output: undefined }
          : s
      ),
    }));
    w.postMessage({
      type: "run",
      baseUrl: `${location.origin}/`,
      params: toEnv(params),
      stages: stages ?? null,
    });
  }, []);

  /** Inyecta una corrida ya calculada (la canonica precomputada) sin pasar por
   *  Pyodide: evita esperar ~2 minutos solo para ver los numeros del informe. */
  const loadPanels = useCallback((panels: Panels, label: string) => {
    supersededRef.current = true;
    setState((prev) => ({
      ...prev,
      panels,
      error: null,
      panelErrors: {},
      stages: prev.stages.map((st) => ({
        ...st,
        status: "done" as const,
        seconds: undefined,
        output: `Cargado de ${label} (sin recomputar).`,
      })),
    }));
  }, []);

  return { ...state, run, loadPanels };
}
