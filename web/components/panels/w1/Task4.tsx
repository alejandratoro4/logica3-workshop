"use client";

import { GroupedBars, Legend, fmt } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W1Task4 } from "@/lib/generated/contratos";

/** Panel A — distribucion de carga de buckets: chaining vs power of two choices
 *  en la ventana de maxima concurrencia (la primera de top_windows). */
export default function Task4({ data: r }: PanelProps<W1Task4>) {
  const w = r.top_windows[0];
  if (!w) return null;
  const s = r.summary;
  const B = s.B_buckets;
  const chaining = w.chaining.loads;
  const p2c = w.power_of_two_choices.loads;
  const avg = w.n_requests / B;
  const maxChain = Math.max(...chaining);
  const maxP2c = Math.max(...p2c);
  const t = w.theory ?? null;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel A — Carga de buckets</h2>
        <span className="panel-tag">TASK 4 · CHAINING vs P2C</span>
      </div>
      <p className="panel-desc">
        Ventana de maxima concurrencia: <b>{w.n_requests}</b> solicitudes de{" "}
        <b>{w.zone}</b> repartidas en {B} colas de despacho. La linea ambar es la
        carga media. Lo que importa no es el promedio sino la barra mas alta: esa cola fija la
        latencia del pasajero que peor la pasa.
      </p>

      <GroupedBars
        series={[
          { name: "Chaining", color: "var(--blue)", values: chaining },
          { name: "Power of two choices", color: "var(--green)", values: p2c },
        ]}
        refLine={avg}
        refLabel={`media ${fmt(avg, 1)}`}
        refLines={
          t
            ? [
                {
                  value: t.chaining_expected_max,
                  label: `ref. chaining ~${fmt(t.chaining_expected_max, 1)}`,
                  color: "var(--blue)",
                },
                {
                  value: t.p2c_expected_max,
                  label: `ref. P2C ~${fmt(t.p2c_expected_max, 1)}`,
                  color: "var(--green)",
                },
              ]
            : undefined
        }
        xLabel={`${B} colas de despacho`}
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
                      label: "Referencia teorica (aprox.)",
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

      {/* Solo aplica en el regimen cargado: a escala baja la carga media ronda
          1 y la afirmacion "muy por encima de 1" seria falsa en pantalla. */}
      {t && t.avg_load >= 2 && (
        <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
          La referencia no es la del caso <i>m = n</i> que se ve en clase (una solicitud por cola).
          Aqui la carga media es <b>{fmt(t.avg_load, 2)}</b> solicitudes por cola, muy por encima de
          1, y en ese regimen la carga maxima es la media mas una desviacion. Las lineas son
          aproximaciones de ese orden de magnitud, sin el termino O(1): no son un limite que cada
          ventana tenga que respetar, y una ventana puede pasarlas por poco. Lo que se sostiene sin
          ellas es la comparacion medida entre chaining y P2C.
        </p>
      )}
    </section>
  );
}
