"use client";

/** Estado compartido por todas las vistas de un workshop.
 *
 * Vive en el layout de /w/[slug], no en la pagina, y esa es toda la gracia:
 * Next mantiene el layout montado al navegar entre sus rutas hijas, asi que
 * pasar del dashboard a la pagina de una task NO reinicia Pyodide ni pierde la
 * corrida. Sin esto, cada click en una task volveria a arrancar el runtime y a
 * correr el pipeline entero — inaceptable en medio de una exposicion. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEMO, FULL, fromQuery, type CityParams } from "@/lib/params";
import { usePipeline, type PipelineState } from "@/lib/usePipeline";
import type { Results, StageKey } from "@/lib/types";
import type { Workshop } from "@/lib/workshops";

type Ctx = {
  workshop: Workshop;
  params: CityParams;
  setParams: (p: CityParams) => void;
  pipeline: PipelineState & {
    run: (p: CityParams, stages?: StageKey[]) => void;
    loadResults: (r: Results, label: string, p: CityParams) => void;
    getRunId: () => number;
  };
  /** Parametros con los que se produjeron los resultados que se ven. Son los
   *  que describen los numeros; `params` son los controles, que se pueden
   *  editar sin haber corrido. */
  ranParams: CityParams;
  /** Etiqueta de la corrida canonica cuando lo que se ve es la canonica. */
  canonical: string | null;
  loadCanonical: () => Promise<void>;
  /** Marca que ya hay (o va a haber) datos, para no pisarlos con la corrida
   *  automatica. Lo usa el dashboard al arrancar. */
  claimRun: () => void;
  claimed: boolean;
};

const WorkshopCtx = createContext<Ctx | null>(null);

export function useWorkshop() {
  const ctx = useContext(WorkshopCtx);
  if (!ctx) throw new Error("useWorkshop fuera de WorkshopProvider");
  return ctx;
}

export default function WorkshopProvider({
  workshop,
  children,
}: {
  workshop: Workshop;
  children: React.ReactNode;
}) {
  const ready = workshop.status === "ready";
  const [params, setParams] = useState<CityParams>(DEMO);
  const [canonicalFallo, setCanonicalFallo] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const canonicalRequestRef = useRef(0);
  const pipeline = usePipeline(workshop.slug, ready);

  // Configuracion inicial desde la URL, para poder compartir una ciudad por link.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      setParams(fromQuery(window.location.search));
    }
  }, []);

  const claimRun = useCallback(() => setClaimed(true), []);

  /** Corrida canonica a escala completa, precomputada y servida como JSON
   *  estatico (web/scripts/export_canonical.py): son los mismos numeros del
   *  informe, al instante. */
  const loadCanonical = useCallback(async () => {
    setClaimed(true); // evita que la corrida automatica la reemplace
    const requestId = ++canonicalRequestRef.current;
    const runId = pipeline.getRunId();
    const vigente = () =>
      requestId === canonicalRequestRef.current && runId === pipeline.getRunId();
    try {
      const res = await fetch(`/data/canonical-w${workshop.slug}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Una nueva corrida o una carga mas reciente tiene prioridad sobre
      // esta respuesta, incluso si la descarga antigua termina despues.
      if (!vigente()) return;
      // Filas del dataset del workshop, contadas al exportar.
      const rows: number | null = data.params?.rows ?? null;
      const label = rows
        ? `${rows.toLocaleString("es-CO")} ${data.params?.unit ?? "filas"} · escala completa`
        : "escala completa";
      pipeline.loadResults(data.results, label, FULL);
      // El sidebar arranca con la config de lo que se esta viendo, para que
      // "Correr" la reproduzca.
      setParams(FULL);
      setCanonicalFallo(false);
    } catch {
      if (vigente()) setCanonicalFallo(true);
    }
  }, [pipeline, workshop.slug]);

  // La etiqueta sale de la procedencia de los resultados: una corrida nueva
  // la borra sola, sin que nadie tenga que acordarse de limpiarla.
  const canonical = pipeline.ran ? pipeline.ran.label : (canonicalFallo ? "no disponible" : null);
  const ranParams = pipeline.ran?.params ?? params;

  const value = useMemo(
    () => ({ workshop, params, setParams, pipeline, ranParams, canonical, loadCanonical, claimRun, claimed }),
    [workshop, params, pipeline, ranParams, canonical, loadCanonical, claimRun, claimed]
  );

  return <WorkshopCtx.Provider value={value}>{children}</WorkshopCtx.Provider>;
}

/** Garantiza que haya datos que mostrar sin obligar a correr el pipeline.
 *
 * Lo usan las paginas de task: si se entra directo por link (o en modo
 * presentacion) no hay corrida previa, y esperar ~15s a Pyodide para ver una
 * diapositiva no tiene sentido. Se carga la corrida canonica, que es ademas la
 * que coincide con los numeros del informe. Si ya hay paneles, no toca nada. */
export function useEnsureRun() {
  const { pipeline, canonical, loadCanonical, claimed, claimRun } = useWorkshop();
  const asked = useRef(false);
  const hasPanels = Boolean(pipeline.results && Object.keys(pipeline.results).length);

  useEffect(() => {
    if (asked.current || hasPanels || claimed) return;
    asked.current = true;
    claimRun();
    void loadCanonical();
  }, [hasPanels, claimed, claimRun, loadCanonical]);

  return { hasPanels, loading: !hasPanels && canonical !== "no disponible" };
}
