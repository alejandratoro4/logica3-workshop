"use client";

import { GroupedBars, Legend, fmt, int } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W2Task3 } from "@/lib/generated/contratos";

const err = (est: number, real: number) => (real ? Math.abs(est - real) / Math.abs(real) : 0);

/** Task 3 del W2 — error del reservorio contra el valor verdadero, por tamano.
 *  El error de la media de una muestra de k cae como 1/raiz(k): triplicar el
 *  reservorio deberia bajarlo a ~58%, y pasar de 100 a 500 a ~45%. */
export default function Task3({ data: t }: PanelProps<W2Task3>) {
  const sizes = t.sizes;
  // Promedio sobre las zonas que si traen ese tamano: el contrato no obliga a
  // que by_size tenga todos, y una zona sin el daria NaN en el grafico.
  const media = (f: (z: W2Task3["zones"][number], k: number) => number) =>
    sizes.map((k) => {
      const vals = t.zones.map((z) => f(z, k)).filter(Number.isFinite);
      return vals.length ? (100 * vals.reduce((a, b) => a + b, 0)) / vals.length : 0;
    });
  const est = (z: W2Task3["zones"][number], k: number) => z.by_size.find((b) => b.size === k);
  const fare = media((z, k) => err(est(z, k)?.est_avg_fare ?? NaN, z.true_avg_fare));
  const wait = media((z, k) => err(est(z, k)?.est_avg_wait ?? NaN, z.true_avg_wait));
  const k0 = sizes[0];
  const kN = sizes[sizes.length - 1];

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Reservoir sampling — error contra el valor verdadero</h2>
        <span className="panel-tag">TASK 3 · {sizes.join(" / ")}</span>
      </div>
      <p className="panel-desc">
        Error relativo medio entre zonas, en %, de la tarifa y la espera estimadas con el reservorio
        frente a las verdaderas. La teoria dice que cae como 1/√k: de k = {k0} a k = {kN} deberia
        quedar en ~{fmt(100 * Math.sqrt(k0 / kN), 0)}% del inicial. Con una sola muestra por tamano el
        error salta mucho; lo que importa es la tendencia.
      </p>

      <GroupedBars
        label="Error relativo medio por tamano de reservorio"
        series={[
          { name: "Tarifa", color: "var(--blue)", values: fare },
          { name: "Espera", color: "var(--green)", values: wait },
        ]}
        xLabel={`tamano del reservorio: ${sizes.join(" · ")}`}
        height={180}
      />
      <Legend
        items={[
          { name: "Error relativo de la tarifa media (%)", color: "var(--blue)" },
          { name: "Error relativo de la espera media (%)", color: "var(--green)" },
        ]}
      />

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Zona</th>
              <th>Tarifa real</th>
              {sizes.map((k) => (
                <th key={k}>k={k}</th>
              ))}
              <th>Espera real</th>
              {sizes.map((k) => (
                <th key={`w${k}`}>k={k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.zones.map((z) => (
              <tr key={z.zone}>
                <td>{z.zone}</td>
                <td>{int(z.true_avg_fare)}</td>
                {sizes.map((k) => (
                  <td key={k}>{int(est(z, k)?.est_avg_fare)}</td>
                ))}
                <td>{fmt(z.true_avg_wait, 1)} s</td>
                {sizes.map((k) => (
                  <td key={`w${k}`}>{fmt(est(z, k)?.est_avg_wait, 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
