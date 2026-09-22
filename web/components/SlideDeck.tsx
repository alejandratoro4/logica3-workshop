"use client";

import { useCallback, useEffect, useState } from "react";
import type { Panels } from "@/lib/types";
import type { CityParams } from "@/lib/params";
import { estimateRows } from "@/lib/params";
import { getTaskDocs, type TaskPanelKey } from "@/lib/tasks";
import PanelA from "./panels/PanelA";
import PanelB from "./panels/PanelB";
import PanelC from "./panels/PanelC";
import { KpiRow, Task3Panel } from "./panels/Kpis";
import TaskMetrics from "./TaskMetrics";

/** Modo presentacion continuo: una diapositiva por task, en un overlay.
 *
 * Los titulos y los textos salen de lib/tasks.ts, los mismos que muestra la
 * pagina dedicada de cada task — cambiar una frase alla la cambia en los dos
 * lados. Aca se da la pasada rapida; la pagina de la task es la version con la
 * explicacion completa. */
function panelFor(which: TaskPanelKey | null, p: Panels) {
  switch (which) {
    case "kpis":
      return p.kpis ? <KpiRow data={p.kpis} /> : null;
    case "task3":
      return p.kpis ? <Task3Panel data={p.kpis} /> : null;
    case "panelA":
      return p.panelA ? <PanelA data={p.panelA} /> : null;
    case "panelB":
      return p.panelB ? <PanelB data={p.panelB} /> : null;
    case "panelC":
      return p.panelC ? <PanelC data={p.panelC} /> : null;
    default:
      return null;
  }
}

export default function SlideDeck({
  panels,
  params,
  slug = "1",
  onClose,
}: {
  panels: Panels;
  params: CityParams;
  slug?: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);

  const intro = {
    metrics: [],
    title: "Despacho de viajes y surge pricing",
    lede: `Una app de ride-sharing empareja pasajeros con conductores y decide en tiempo real cuando activar tarifa dinamica. Esta corrida simula ${params.zones.length} zonas durante ${params.days} dias: ${estimateRows(
      params
    ).toLocaleString("es-CO")} solicitudes generadas con un proceso de Poisson no homogeneo, donde cada zona tiene su propio perfil de demanda por hora.`,
    body: panels.kpis ? <KpiRow data={panels.kpis} /> : null,
  };

  // Solo se arman las diapositivas cuyos datos ya existen: se puede entrar a
  // presentar antes de que termine el benchmark de QuickSort.
  const slides = [
    intro,
    ...getTaskDocs(slug).map((d) => ({
      title: `Task ${d.n} — ${d.title}`,
      lede: d.lede(panels, params),
      metrics: d.metrics(panels),
      body: panelFor(d.panel, panels),
    })),
    // Una task entra si tiene grafico O cifras: la Task 1 no tiene panel
    // propio (sus KPI son los del dashboard) y aun asi debe estar en el deck.
  ].filter((s) => s.body || s.metrics.length);

  const go = useCallback(
    (d: number) => setI((v) => Math.max(0, Math.min(slides.length - 1, v + d))),
    [slides.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const s = slides[Math.min(i, slides.length - 1)];
  if (!s) return null;

  return (
    <div className="deck">
      <div className="deck-body">
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 12 }}
          >
            {i + 1} / {slides.length}
          </div>
          <h2>{s.title}</h2>
          <p className="lede">{s.lede}</p>
          <TaskMetrics metrics={s.metrics} />
          {s.body}
        </div>
      </div>

      <div className="deck-nav">
        <button className="btn ghost" style={{ width: "auto" }} onClick={() => go(-1)} disabled={i === 0}>
          ← Anterior
        </button>
        <div className="deck-dots">
          {slides.map((_, idx) => (
            <i key={idx} className={idx === i ? "on" : ""} onClick={() => setI(idx)} />
          ))}
        </div>
        <button
          className="btn ghost"
          style={{ width: "auto" }}
          onClick={() => go(1)}
          disabled={i === slides.length - 1}
        >
          Siguiente →
        </button>
        <button className="btn ghost" style={{ width: "auto" }} onClick={onClose}>
          Salir (Esc)
        </button>
      </div>
    </div>
  );
}
