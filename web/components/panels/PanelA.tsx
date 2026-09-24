"use client";

import { GroupedBars, Legend, fmt } from "../charts";
import type { PanelA as PanelAData } from "@/lib/types";

/** Panel A — distribucion de carga de buckets: chaining vs power of two choices
 *  en la ventana de maxima concurrencia. */
export default function PanelA({ data }: { data: PanelAData }) {
  const avg = data.n_requests / data.B_buckets;
  const maxChain = Math.max(...data.chaining_loads);
  const maxP2c = Math.max(...data.p2c_loads);
  const s = data.summary;
  const t = data.theory ?? null;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel A — Carga de buckets</h2>
        <span className="panel-tag">TASK 4 · CHAINING vs P2C</span>
      </div>
      <p className="panel-desc">
        Ventana de maxima concurrencia: <b>{data.n_requests}</b> solicitudes de{" "}
        <b>{data.zone}</b> repartidas en {data.B_buckets} colas de despacho. La linea ambar es la
        carga media. Lo que importa no es el promedio sino la barra mas alta: esa cola fija la
        latencia del pasajero que peor la pasa.
      </p>

      <GroupedBars
        series={[
          { name: "Chaining", color: "var(--blue)", values: data.chaining_loads },
          { name: "Power of two choices", color: "var(--green)", values: data.p2c_loads },
        ]}
        refLine={avg}
        refLabel={`media ${fmt(avg, 1)}`}
        refLines={
          t
            ? [
                {
                  value: t.chaining_expected_max,
                  label: `cota chaining ${fmt(t.chaining_expected_max, 1)}`,
                  color: "var(--blue)",
                },
                {
                  value: t.p2c_expected_max,
                  label: `cota P2C ${fmt(t.p2c_expected_max, 1)}`,
                  color: "var(--green)",
                },
              ]
            : undefined
        }
        xLabel={`${data.B_buckets} colas de despacho`}
      />

      <Legend
        items={[
          { name: `Chaining · max ${maxChain}`, color: "var(--blue)" },
          { name: `Power of two choices · max ${maxP2c}`, color: "var(--green)" },
        ]}
      />

      <div className="scroll-x" style={{ marginTop: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Metrica sobre {fmt(s.n_windows_analyzed, 0)} ventanas</th>
              <th>Chaining</th>
              <th>Power of two choices</th>
              <th>Mejora</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: "Carga maxima promedio",
                a: s.avg_max_load_chaining,
                b: s.avg_max_load_p2c,
                d: 3,
              },
              {
                label: "Carga maxima, peor ventana",
                a: s.worst_max_load_chaining,
                b: s.worst_max_load_p2c,
                d: 0,
              },
              { label: "Carga maxima en esta ventana", a: maxChain, b: maxP2c, d: 0 },
              ...(t
                ? [
                    {
                      label: "Cota teorica para esta ventana",
                      a: t.chaining_expected_max,
                      b: t.p2c_expected_max,
                      d: 1,
                    },
                  ]
                : []),
            ].map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{fmt(r.a, r.d)}</td>
                <td>{fmt(r.b, r.d)}</td>
                <td style={{ color: "var(--green)" }}>
                  {Number.isFinite(r.a) && r.a > 0 ? `${fmt(((r.a - r.b) / r.a) * 100, 0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {t && (
        <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
          La cota no es la del caso <i>m = n</i> que se ve en clase (una solicitud por cola). Aqui
          la carga media es <b>{fmt(t.avg_load, 2)}</b> solicitudes por cola, muy por encima de 1,
          y en ese regimen la carga maxima es la media mas una desviacion. Con la formula
          correcta, lo medido y lo predicho coinciden; con la de <i>m = n</i> pareceria que las
          mediciones violan la cota.
        </p>
      )}
    </section>
  );
}
