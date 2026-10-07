"use client";

import { Legend, fmt, int } from "../../charts";
import { TimeSeries, hourLabel, pct } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W2Task2 } from "@/lib/generated/contratos";

/** Panel A del W2 — tasa de falsos positivos del filtro de Bloom "hasta
 *  ahora", contra la que predice la formula con el diseno elegido. */
export default function Task2({ data: t }: PanelProps<W2Task2>) {
  const labels = t.running.map((r) => r.timestamp);
  const fx = hourLabel(labels[0] ?? "");
  const kOptimo = Math.floor((t.n_bits / t.m_items) * Math.log(2));

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel A — Falsos positivos del filtro de Bloom</h2>
        <span className="panel-tag">TASK 2 · n = BITS, m = ELEMENTOS</span>
      </div>
      <p className="panel-desc">
        Un falso positivo es un pasajero que NO habia sido emparejado en el minuto y el filtro dice
        que si: se le negaria el despacho. La linea ambar es la tasa que predice (1 − e^(−km/n))^k
        con el diseno elegido; la azul, la que se ha medido en lo que va del stream.
      </p>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Diseno</div>
          <div className="value sm">
            n = {int(t.n_bits)} · m = {int(t.m_items)}
          </div>
          <div className="delta">{fmt(t.n_bits / t.m_items, 1)} bits por elemento</div>
        </div>
        <div className="kpi">
          <div className="label">Funciones hash</div>
          <div className="value">k = {int(t.k)}</div>
          <div className="delta">
            floor((n/m) ln 2) = {kOptimo}
            {kOptimo !== t.k ? " · distinto al del enunciado" : ""}
          </div>
        </div>
        <div className="kpi">
          <div className="label">FP teorico</div>
          <div className="value">{pct(t.fp_theoretical)}</div>
          <div className="delta">con m elementos en el filtro</div>
        </div>
        <div className="kpi">
          <div className="label">FP medido</div>
          <div className="value">{pct(t.fp_empirical)}</div>
          <div className="delta">sobre todo el stream</div>
        </div>
      </div>

      <TimeSeries
        label="Tasa de falsos positivos acumulada a lo largo del stream"
        labels={labels}
        xFormat={fx}
        yFormat={(v) => pct(v)}
        refLines={[{ value: t.fp_theoretical, label: "teorica", color: "var(--amber)" }]}
        series={[{ name: "medida hasta ahora", color: "var(--blue)", values: t.running.map((r) => r.fp_rate_so_far) }]}
      />
      <Legend
        items={[
          { name: "FP medido en lo que va del stream", color: "var(--blue)" },
          { name: "FP teorico del diseno", color: "var(--amber)" },
        ]}
      />
      <p className="panel-desc" style={{ marginTop: 8, marginBottom: 0 }}>
        La formula supone el filtro con sus m elementos. Si en la mayoria de los minutos entran menos
        pasajeros que m, el filtro esta mas vacio de lo que supone el diseno y lo medido queda por
        debajo de la teorica; en los minutos pico se acercan.
      </p>
    </section>
  );
}
