"use client";

import { fmt, int } from "../../charts";
import { MeterBars } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W5Task3 } from "@/lib/generated/contratos";

/** Task 3 del W5 — shingles de k = 2, 3 y 4: tamano de los conjuntos,
 *  posibles contra observados, y separacion de los grupos plantados. */
export default function Task3({ data: t }: PanelProps<W5Task3>) {
  const ks = [...t.k_values].sort((a, b) => a.k - b.k);
  const sinGrupos = t.pairs_same_cluster === 0 || t.pairs_other_cluster === 0;
  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Cuantas zonas por shingle: k = {ks.map((k) => k.k).join(", ")}</h2>
        <span className="panel-tag">TASK 3 · MEJOR k = {t.best_k}</span>
      </div>
      <p className="panel-desc">
        Un k-shingle es una racha de k zonas consecutivas del conductor. Con k chico casi todas las rachas
        posibles aparecen en todos; con k grande cada conductor tiene rachas propias. La separacion compara el
        Jaccard medio de {int(t.pairs_same_cluster)} pares del mismo grupo plantado contra{" "}
        {int(t.pairs_other_cluster)} pares de grupos distintos.
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>k</th>
              <th>Shingles por conductor</th>
              <th>Posibles</th>
              <th>Observados</th>
              <th>Jaccard mismo grupo</th>
              <th>Jaccard entre grupos</th>
              <th>Diferencia</th>
              <th>Cociente</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => (
              <tr key={k.k} style={k.k === t.best_k ? { color: "var(--green)" } : undefined}>
                <td>{k.k}</td>
                <td>{fmt(k.mean_set_size, 1)}</td>
                <td>{int(k.possible_shingles)}</td>
                <td>{int(k.observed_shingles)}</td>
                <td>{fmt(k.jaccard_same_cluster, 3)}</td>
                <td>{fmt(k.jaccard_other_cluster, 3)}</td>
                <td>{fmt(k.jaccard_same_cluster - k.jaccard_other_cluster, 3)}</td>
                <td>{k.jaccard_other_cluster > 0 ? `${fmt(k.jaccard_same_cluster / k.jaccard_other_cluster, 1)}×` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="panel-sub">Jaccard medio dentro de un grupo y entre grupos</h3>
      <MeterBars
        label="Jaccard medio dentro y entre grupos por k"
        rows={ks.flatMap((k) => [
          { label: `k = ${k.k} mismo`, value: k.jaccard_same_cluster, color: "var(--blue)" },
          { label: `k = ${k.k} entre`, value: k.jaccard_other_cluster, color: "var(--text-faint)" },
        ])}
        refValue={1}
        refLabel="conjuntos iguales"
        valueFormat={(v) => fmt(v, 3)}
      />
      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        {sinGrupos
          ? "Esta ciudad no tiene pares de los dos tipos, asi que la separacion no se puede medir. "
          : ""}
        <b>Por que k = {t.best_k}:</b> {t.best_k_reason}
        {t.best_k !== 3 && " El dataset y las demas tasks usan k = 3, como pide el enunciado."}
      </p>
    </section>
  );
}
