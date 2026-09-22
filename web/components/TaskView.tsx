"use client";

/** Pagina dedicada de una task: el enunciado, el metodo, el panel en vivo y la
 *  frase de cierre.
 *
 * Sirve para dos cosas a la vez, y por eso tiene modo presentacion: leida
 * normal es la explicacion larga; en modo presentacion esconde la prosa y deja
 * titular, cifras y grafico, que es lo que se proyecta. El contenido sale de
 * lib/tasks.ts y los numeros de la corrida cargada en el provider, asi que las
 * dos vistas nunca se contradicen. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTaskDocs, type TaskPanelKey } from "@/lib/tasks";
import type { Panels } from "@/lib/types";
import { useEnsureRun, useWorkshop } from "./WorkshopProvider";
import PanelA from "./panels/PanelA";
import PanelB from "./panels/PanelB";
import PanelC from "./panels/PanelC";
import { KpiRow, Task3Panel } from "./panels/Kpis";
import TaskMetrics from "./TaskMetrics";

function TaskPanel({ which, panels }: { which: TaskPanelKey | null; panels: Panels }) {
  switch (which) {
    case "kpis":
      return panels.kpis ? <KpiRow data={panels.kpis} /> : null;
    case "task3":
      return panels.kpis ? <Task3Panel data={panels.kpis} /> : null;
    case "panelA":
      return panels.panelA ? <PanelA data={panels.panelA} /> : null;
    case "panelB":
      return panels.panelB ? <PanelB data={panels.panelB} /> : null;
    case "panelC":
      return panels.panelC ? <PanelC data={panels.panelC} /> : null;
    default:
      return null;
  }
}

export default function TaskView({ slug, index }: { slug: string; index: number }) {
  const { params, pipeline, canonical } = useWorkshop();
  const { hasPanels } = useEnsureRun();
  const router = useRouter();
  const [presenting, setPresenting] = useState(false);

  const docs = getTaskDocs(slug);
  const doc = docs[index];
  const prev = index > 0 ? docs[index - 1] : null;
  const next = index < docs.length - 1 ? docs[index + 1] : null;

  const go = useCallback(
    (to: typeof prev) => {
      if (to) router.push(`/w/${slug}/t/${to.slug}/`);
    },
    [router, slug]
  );

  // Prefetch de las vecinas: en una exposicion no se puede esperar a que
  // Next descargue el chunk de la diapositiva siguiente al pulsar la flecha.
  useEffect(() => {
    if (prev) router.prefetch(`/w/${slug}/t/${prev.slug}/`);
    if (next) router.prefetch(`/w/${slug}/t/${next.slug}/`);
  }, [router, slug, prev, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(next);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(prev);
      } else if (e.key === "Escape") {
        setPresenting(false);
      } else if (e.key === "p" || e.key === "P") {
        setPresenting((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prev, next]);

  // La barra de workshops estorba al proyectar; se esconde por clase en body
  // porque vive en el layout, fuera de este arbol.
  useEffect(() => {
    document.body.classList.toggle("presenting", presenting);
    return () => document.body.classList.remove("presenting");
  }, [presenting]);

  if (!doc) return null;

  const p = pipeline.panels ?? {};
  const metrics = hasPanels ? doc.metrics(p) : [];

  return (
    <div className={`wrap task-page ${presenting ? "task-present" : ""}`}>
      <div className="task-top">
        <Link href={`/w/${slug}/`} className="task-back">
          ← Dashboard
        </Link>
        <div className="task-steps">
          {docs.map((d, i) => (
            <Link
              key={d.slug}
              href={`/w/${slug}/t/${d.slug}/`}
              className={`task-step ${i === index ? "on" : ""}`}
              title={d.title}
            >
              {d.n}
            </Link>
          ))}
        </div>
        <button className="btn ghost task-present-btn" onClick={() => setPresenting((v) => !v)}>
          {presenting ? "Salir (Esc)" : "Presentar (P)"}
        </button>
      </div>

      <header className="task-head">
        <div className="panel-tag">
          TASK {doc.n} · {doc.topic}
        </div>
        <h1>{doc.title}</h1>
        <p className="task-lede">{hasPanels ? doc.lede(p, params) : doc.standfirst}</p>
      </header>

      {!hasPanels && (
        <div className="empty">
          <span className="spinner" /> Cargando la corrida para poblar los numeros de esta task...
        </div>
      )}

      <TaskMetrics metrics={metrics} />

      <TaskPanel which={doc.panel} panels={p} />

      {doc.panel === "panelB" && !p.panelB && hasPanels && (
        <div className="empty" style={{ padding: "26px 20px" }}>
          <span className="spinner" /> El benchmark de QuickSort es la etapa mas larga del pipeline y
          llega al final de la corrida.
        </div>
      )}

      <div className="task-prose">
        <section className="panel-box task-statement">
          <div className="panel-head" style={{ marginBottom: 6 }}>
            <h2 className="panel-title" style={{ fontSize: 13 }}>
              Lo que pide el enunciado
            </h2>
            <span className="panel-tag">{doc.source}</span>
          </div>
          <p className="panel-desc" style={{ margin: 0 }}>
            {doc.statement}
          </p>
        </section>

        {doc.sections.map((s) => (
          <section key={s.h} className="task-section">
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </div>

      <section className="task-takeaway">
        <div className="panel-tag">PARA CERRAR</div>
        <p>{doc.takeaway}</p>
      </section>

      <div className="task-foot">
        {prev ? (
          <Link href={`/w/${slug}/t/${prev.slug}/`} className="task-move">
            <span>← Task {prev.n}</span>
            <b>{prev.title}</b>
          </Link>
        ) : (
          <Link href={`/w/${slug}/`} className="task-move">
            <span>← Volver</span>
            <b>Dashboard completo</b>
          </Link>
        )}
        {next ? (
          <Link href={`/w/${slug}/t/${next.slug}/`} className="task-move right">
            <span>Task {next.n} →</span>
            <b>{next.title}</b>
          </Link>
        ) : (
          <Link href={`/w/${slug}/`} className="task-move right">
            <span>Cerrar →</span>
            <b>Volver al dashboard</b>
          </Link>
        )}
      </div>

      <p className="task-run-note">
        {canonical
          ? `Numeros de ${canonical}.`
          : `Numeros de la corrida actual: ${params.zones.length} zonas, ${params.days} dias, escala ${params.scale}.`}{" "}
        Flechas ← → para moverte entre tasks, P para presentar.
      </p>
    </div>
  );
}
