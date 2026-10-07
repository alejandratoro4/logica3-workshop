"use client";

import { useCallback, useEffect, useState } from "react";
import type { Results } from "@/lib/types";
import type { CityParams } from "@/lib/params";
import { estimateRows } from "@/lib/params";
import { getTaskDocs } from "@/lib/tasks";
import { getWorkshop } from "@/lib/workshops";
import { TaskPanel } from "./PanelSlots";
import TaskMetrics from "./TaskMetrics";

/** Modo presentacion continuo: una diapositiva por task, en un overlay.
 *
 * Los titulos y los textos salen de lib/docs/, los mismos que muestra la
 * pagina dedicada de cada task — cambiar una frase alla la cambia en los dos
 * lados. Aca se da la pasada rapida; la pagina de la task es la version con la
 * explicacion completa. */
export default function SlideDeck({
  results,
  params,
  slug = "1",
  onClose,
}: {
  results: Results;
  params: CityParams;
  slug?: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);

  const ws = getWorkshop(slug);
  const intro = {
    metrics: [],
    title: ws?.title ?? "Despacho de viajes y surge pricing",
    lede: `${ws?.subtitle ?? ""} Esta corrida simula ${params.zones.length} zonas durante ${params.days} dias: ${estimateRows(
      params
    ).toLocaleString("es-CO")} solicitudes generadas con un proceso de Poisson no homogeneo, donde cada zona tiene su propio perfil de demanda por hora.`,
    // Sin grafico: la diapositiva siguiente es la Task 1 con su panel.
    body: null,
  };

  // Solo se arman las diapositivas cuyos datos ya existen: se puede entrar a
  // presentar antes de que termine la task mas lenta.
  const slides = [
    intro,
    ...getTaskDocs(slug)
      .filter((d) => results[`task${d.n}`] !== undefined)
      .map((d) => {
        const r = results[`task${d.n}`];
        return {
          title: `Task ${d.n} — ${d.title}`,
          lede: d.lede(r, results, params),
          metrics: d.metrics(r, results),
          body: <TaskPanel slug={slug} n={d.n} results={results} />,
        };
      }),
  ];

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
