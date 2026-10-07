"use client";

import { Legend, fmt, int } from "../../charts";
import { MeterBars, TimeSeries, hourLabel } from "../../charts-stream";
import { zoneColors } from "../../charts-graph";
import type { PanelProps } from "@/lib/types";
import type { W2Task1 } from "@/lib/generated/contratos";

const MB = 1024 * 1024;

/** Task 1 del W2 — las dos consultas a lo largo del stream y el almacen de
 *  trabajo contra el presupuesto de 10 MB. */
export default function Task1({ data: t }: PanelProps<W2Task1>) {
  const cps = t.checkpoints;
  const labels = cps.map((c) => c.timestamp);
  const fx = hourLabel(labels[0] ?? "");
  const zonas = [...new Set(cps.flatMap((c) => Object.keys(c.rolling_avg_wait)))].sort();
  const color = zoneColors(zonas);
  const b = t.budget;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Modelo de stream — dos consultas y un presupuesto</h2>
        <span className="panel-tag">TASK 1 · {int(t.n_events)} EVENTOS</span>
      </div>

      <h3 className="panel-sub">
        Consulta permanente: espera media de las ultimas {int(t.window_n)} solicitudes{" "}
        {t.window_scope === "ciudad" ? "de toda la ciudad, agrupadas por zona" : "de cada zona"}
      </h3>
      <TimeSeries
        label="Promedio movil de la espera por zona a lo largo del stream"
        labels={labels}
        xFormat={fx}
        yFormat={(v) => `${fmt(v, 0)} s`}
        series={zonas.map((z) => ({
          name: z,
          color: color[z],
          width: 1.2,
          values: cps.map((c) => c.rolling_avg_wait[z] ?? null),
        }))}
      />
      <Legend items={zonas.map((z) => ({ name: z, color: color[z] }))} />

      <h3 className="panel-sub">Consulta ad hoc: pasajeros distintos en la ultima hora</h3>
      <TimeSeries
        label="Pasajeros distintos en la ultima hora"
        labels={labels}
        xFormat={fx}
        yFormat={(v) => int(v)}
        series={[{ name: "distintos", color: "var(--violet)", values: cps.map((c) => c.distinct_riders_last_hour) }]}
        height={170}
      />

      <h3 className="panel-sub">
        Almacen de trabajo: {fmt(b.total_bytes / MB, 3)} MB de {fmt(b.limit_bytes / MB, 0)} MB (
        {fmt((100 * b.total_bytes) / b.limit_bytes, 2)}%)
      </h3>
      <MeterBars
        label="Bytes de cada estructura sobre el presupuesto"
        rows={b.items.map((i) => ({
          label: i.name.length > 14 ? i.name.slice(0, 13) + "…" : i.name,
          value: i.bytes / b.limit_bytes,
          color: "var(--blue)",
          note: `${int(i.bytes)} B · ${i.name}`,
        }))}
        refLabel="10 MB"
        valueFormat={(v) => `${fmt(v * 100, 2)}%`}
      />
    </section>
  );
}
