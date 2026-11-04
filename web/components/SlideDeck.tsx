"use client";

import { useCallback, useEffect, useState } from "react";
import type { Results } from "@/lib/types";
import type { CityParams } from "@/lib/params";
import { estimateRows } from "@/lib/params";
import { getTaskDocs } from "@/lib/tasks";
import { getWorkshop } from "@/lib/workshops";
import { TaskPanel } from "./PanelSlots";
import TaskMetrics from "./TaskMetrics";
import CodeBlock from "./CodeBlock";

/** Solicitudes del dataset segun lo que reporto la corrida: W1 Task 1
 *  (total_requests), W2 Task 1 (n_events), W4 Task 1 (input_records del
 *  primer job) o W3 Task 2 (ride_count por zona).
 *  null si ninguna de esas tasks esta cargada. */
function filasReales(results: Results): number | null {
  const t1 = results.task1 as
    | { total_requests?: number; n_events?: number; jobs?: { input_records?: number }[] }
    | undefined;
  if (typeof t1?.total_requests === "number") return t1.total_requests;
  if (typeof t1?.n_events === "number") return t1.n_events;
  // W4: lo que leyo el primer job de MapReduce, el stream completo.
  if (typeof t1?.jobs?.[0]?.input_records === "number") return t1.jobs[0].input_records;
  const t2 = results.task2 as { zones?: { ride_count?: number }[] } | undefined;
  const zonas = t2?.zones;
  if (zonas?.length && zonas.every((z) => typeof z.ride_count === "number")) {
    return zonas.reduce((a, z) => a + (z.ride_count ?? 0), 0);
  }
  return null;
}

type Vista = "panel" | "texto" | "codigo";

/** Modo presentacion continuo: una diapositiva por task, en un overlay.
 *
 * Los titulos y los textos salen de lib/docs/, los mismos que muestra la
 * pagina dedicada de cada task — cambiar una frase alla la cambia en los dos
 * lados. Cada diapositiva muestra titular, cifras, panel y cierre, igual que
 * la pagina en modo presentar; el enunciado, el metodo y el script quedan a
 * una tecla (E, C) para no tener que salir a buscarlos. */
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
  // El conteo real si la corrida lo trae; si no, el esperado por BASE_LAMBDA,
  // que difiere del real en ~0,4% y no debe leerse como el mismo numero.
  const reales = filasReales(results);
  const filas = reales
    ? `${reales.toLocaleString("es-CO")} solicitudes`
    : `unas ${estimateRows(params).toLocaleString("es-CO")} solicitudes esperadas`;
  const intro = {
    metrics: [],
    title: ws?.title ?? "Despacho de viajes y surge pricing",
    lede: `${ws?.subtitle ?? ""} Esta corrida simula ${params.zones.length} zonas durante ${params.days} dias: ${filas}, generadas con un proceso de Poisson no homogeneo, donde cada zona tiene su propio perfil de demanda por hora.`,
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
          doc: d,
        };
      }),
  ];

  // Cada diapositiva arranca en su panel. "Explicacion" (E) muestra lo que la
  // pagina de la task tiene debajo del panel, y "Codigo" (C) su script, ahi
  // mismo, sin salir del modo presentacion.
  const [vista, setVista] = useState<Vista>("panel");
  const irA = useCallback((idx: number) => {
    setI(idx);
    setVista("panel");
  }, []);
  const go = useCallback(
    (d: number) => irA(Math.max(0, Math.min(slides.length - 1, i + d))),
    [irA, i, slides.length]
  );
  const alternar = useCallback((v: Vista) => setVista((actual) => (actual === v ? "panel" : v)), []);

  const s = slides[Math.min(i, slides.length - 1)];
  const doc = s && "doc" in s ? s.doc : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+C para copiar (o Ctrl+E del navegador) no son atajos del deck.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
      else if (k === "e" && doc) alternar("texto");
      else if (k === "c" && doc?.source) alternar("codigo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, doc, alternar]);

  if (!s) return null;

  const vistas: { v: Vista; label: string; ok: boolean }[] = [
    { v: "panel", label: "Panel", ok: true },
    { v: "texto", label: "Explicación (E)", ok: true },
    { v: "codigo", label: "Código (C)", ok: !!doc?.source },
  ];

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
          {vista === "codigo" && doc?.source ? (
            <CodeBlock path={doc.source} />
          ) : vista === "texto" && doc ? (
            <div>
              <section className="panel-box task-statement">
                <div className="panel-head" style={{ marginBottom: 6 }}>
                  <h2 className="panel-title" style={{ fontSize: 13 }}>
                    Lo que pide el enunciado
                  </h2>
                </div>
                <p className="panel-desc" style={{ margin: 0 }}>
                  {doc.statement}
                </p>
              </section>
              {doc.sections.map((sec) => (
                <section key={sec.h} className="task-section">
                  <h2>{sec.h}</h2>
                  <p>{sec.p}</p>
                </section>
              ))}
            </div>
          ) : (
            s.body
          )}
          {doc && (
            <section className="task-takeaway">
              <div className="panel-tag">PARA CERRAR</div>
              <p>{doc.takeaway}</p>
            </section>
          )}
        </div>
      </div>

      <div className="deck-nav">
        <button className="btn ghost" style={{ width: "auto" }} onClick={() => go(-1)} disabled={i === 0}>
          ← Anterior
        </button>
        <div className="deck-dots">
          {slides.map((_, idx) => (
            <i key={idx} className={idx === i ? "on" : ""} onClick={() => irA(idx)} />
          ))}
        </div>
        {doc &&
          vistas
            .filter((x) => x.ok)
            .map((x) => (
              <button
                key={x.v}
                className="btn ghost"
                style={{
                  width: "auto",
                  ...(vista === x.v ? { borderColor: "var(--blue)", color: "var(--text)" } : {}),
                }}
                onClick={(e) => {
                  setVista(x.v);
                  // Sin foco: si no, la barra espaciadora para avanzar tambien lo "pulsa".
                  e.currentTarget.blur();
                }}
              >
                {x.label}
              </button>
            ))}
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
