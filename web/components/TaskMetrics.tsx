"use client";

/** Fila de cifras de una task, en el mismo formato que los KPI del dashboard.
 *  La comparten la pagina dedicada y el modo diapositivas: son los numeros que
 *  uno lee en voz alta, sin tener que buscarlos dentro del grafico. */

import type { TaskMetric } from "@/lib/tasks";

export default function TaskMetrics({ metrics }: { metrics: TaskMetric[] }) {
  if (!metrics.length) return null;
  return (
    <div className="task-metrics">
      {metrics.map((m) => (
        <div className="kpi" key={m.label}>
          <div className="label">{m.label}</div>
          <div className="value">{m.value}</div>
          {m.hint && <div className="delta">{m.hint}</div>}
        </div>
      ))}
    </div>
  );
}
