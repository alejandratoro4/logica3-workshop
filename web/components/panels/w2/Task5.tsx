"use client";

import { GroupedBars, fmt, int } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W2Task5 } from "@/lib/generated/contratos";

/** Momentos de frecuencia del W2, y lo que se puede leer de F2.
 *  Las cuentas derivadas (concentracion, parte de cada zona) se hacen aca a
 *  partir de los f_i del contrato, para que la task solo entregue lo pedido. */
export function momentos(t: W2Task5) {
  const zonas = Object.entries(t.counts).sort((a, b) => b[1] - a[1]);
  const parejo = t.F0 ? (t.F1 * t.F1) / t.F0 : 0;
  return {
    zonas,
    parejo,
    concentracion: parejo ? t.F2 / parejo : NaN,
    cuota: t.F0 ? 1 / t.F0 : 0,
    candidatas: zonas.filter(([, f]) => t.F2 && (f * f) / t.F2 > 1 / t.F0).map(([z]) => z),
  };
}

const expo = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : "—");

export default function Task5({ data: t }: PanelProps<W2Task5>) {
  const m = momentos(t);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Momentos de frecuencia sobre pickup_zone</h2>
        <span className="panel-tag">TASK 5 · F0 / F1 / F2</span>
      </div>
      <p className="panel-desc">
        F2 = Σ f_i². Con F0 y F1 fijos es minimo cuando todas las zonas tienen la misma demanda (F1²/F0)
        y maximo cuando una sola zona se lleva todo (F1²). La concentracion F2 / (F1²/F0) va de 1
        (parejo) a F0 (una sola zona).
      </p>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">F0 · zonas distintas</div>
          <div className="value">{int(t.F0)}</div>
        </div>
        <div className="kpi">
          <div className="label">F1 · largo del stream</div>
          <div className="value sm">{int(t.F1)}</div>
        </div>
        <div className="kpi">
          <div className="label">F2</div>
          <div className="value sm">{expo(t.F2)}</div>
          <div className="delta">parejo seria {expo(m.parejo)}</div>
        </div>
        <div className="kpi">
          <div className="label">Concentracion</div>
          <div className="value">{fmt(m.concentracion, 3)}</div>
          <div className="delta">1 = parejo · {int(t.F0)} = una zona</div>
        </div>
      </div>

      <GroupedBars
        label="Parte de F2 que aporta cada zona, contra la cuota pareja"
        series={[{ name: "f_i^2 / F2", color: "var(--blue)", values: m.zonas.map(([, f]) => (100 * f * f) / t.F2) }]}
        refLine={100 * m.cuota}
        refLabel={`cuota pareja 1/F0 = ${fmt(100 * m.cuota, 1)}%`}
        xLabel={m.zonas.map(([z]) => z.slice(0, 4)).join(" · ")}
        height={170}
      />
      <p className="panel-desc" style={{ marginTop: 6, marginBottom: 0 }}>
        Parte de F2 que aporta cada zona, en %. Las que superan su cuota pareja concentran la demanda
        y son las candidatas a surge: <b>{m.candidatas.join(", ") || "ninguna"}</b>.
      </p>
    </section>
  );
}
