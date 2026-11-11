"use client";

import { fmt, int } from "../../charts";
import { pct } from "../../charts-stream";
import { METODO, PruebaTarifa } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W5Task5 } from "@/lib/generated/contratos";

/** Task 5 del W5 — top-5 por MinHash/LSH, coseno/LSH y LCS sobre
 *  candidatos: cuanto coinciden entre si y el outcome test de avg_fare. */
export default function Task5({ data: t }: PanelProps<W5Task5>) {
  const metodos = t.methods.map((m) => m.method);
  const overlap = (a: string, b: string) =>
    a === b ? 1 : t.overlap_at_5.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))?.overlap;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Los mismos conductores, vecinos distintos segun el metodo</h2>
        <span className="panel-tag">TASK 5 · {int(t.queries)} CONSULTAS</span>
      </div>
      <p className="panel-desc">
        MinHash busca candidatos con {t.lsh_config.bands} bandas de {t.lsh_config.rows} filas (umbral{" "}
        {fmt(t.lsh_config.threshold, 3)}); el coseno, con {t.cosine_config.bits} hiperplanos en {t.cosine_config.bands}{" "}
        bandas de {t.cosine_config.rows} bits. LCS ordena los mismos candidatos de MinHash con programacion dinamica.
        El Jaccard exacto compara contra todos: es la referencia.
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Metodo</th>
              <th>Candidatos por consulta</th>
              {metodos.map((m) => (
                <th key={m}>Overlap con {METODO[m] ?? m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.methods.map((m) => (
              <tr key={m.method}>
                <td>{METODO[m.method] ?? m.method}</td>
                <td>{fmt(m.mean_candidates, 1)}</td>
                {metodos.map((o) => {
                  const v = overlap(m.method, o);
                  return <td key={o}>{v === undefined ? "—" : pct(v, 0)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 10 }}>
        Overlap@5: de los 5 vecinos de un metodo, que fraccion esta tambien en el top-5 del otro, en promedio
        sobre las consultas.
      </p>
      {t.disagreements && (
        <p className="panel-desc">
          <b>Por que no coinciden:</b> {t.disagreements}
        </p>
      )}

      <h3 className="panel-sub">Outcome test: avg_fare, que ningun metodo vio</h3>
      <PruebaTarifa t={t} />
    </section>
  );
}
