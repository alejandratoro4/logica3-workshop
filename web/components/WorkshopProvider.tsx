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
import type { Panels, StageKey } from "@/lib/types";
import type { Workshop } from "@/lib/workshops";

type Ctx = {
  workshop: Workshop;
  params: CityParams;
  setParams: (p: CityParams) => void;
  pipeline: PipelineState & {
    run: (p: CityParams, stages?: StageKey[]) => void;
    loadPanels: (p: Panels, label: string) => void;
  };
  /** Etiqueta de la corrida canonica cuando esta cargada. */
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
  const [canonical, setCanonical] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const pipeline = usePipeline(ready);

  // Configuracion inicial desde la URL, para poder compartir una ciudad por link.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      setParams(fromQuery(window.location.search));
    }
  }, []);

  const claimRun = useCallback(() => setClaimed(true), []);

  /** Corrida canonica a escala completa, precomputada y servida como JSON
   *  estatico: son los mismos numeros del informe, al instante. */
  const loadCanonical = useCallback(async () => {
    setClaimed(true); // evita que la corrida automatica la reemplace
    try {
      const res = await fetch("/data/canonical-run.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      pipeline.loadPanels(data.panels, "la corrida canonica");
      // El sidebar debe reflejar lo que se esta viendo, no la config anterior.
      setParams(FULL);
      // rows sale de la Task 1, o se deduce de la Task 2 (ver export_canonical.py).
      // Sin ninguna de las dos no hay conteo que mostrar, y tampoco es grave.
      const rows: number | null = data.params?.rows ?? null;
      setCanonical(
        rows ? `${rows.toLocaleString("es-CO")} viajes · escala completa` : "escala completa"
      );
    } catch {
      setCanonical("no disponible");
    }
  }, [pipeline]);

  const value = useMemo(
    () => ({ workshop, params, setParams, pipeline, canonical, loadCanonical, claimRun, claimed }),
    [workshop, params, pipeline, canonical, loadCanonical, claimRun, claimed]
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
  const hasPanels = Boolean(pipeline.panels && Object.keys(pipeline.panels).length);

  useEffect(() => {
    if (asked.current || hasPanels || claimed) return;
    asked.current = true;
    claimRun();
    void loadCanonical();
  }, [hasPanels, claimed, claimRun, loadCanonical]);

  return { hasPanels, loading: !hasPanels && canonical !== "no disponible" };
}
