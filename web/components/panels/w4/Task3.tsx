"use client";

import { Legend, LineChart, fmt, int } from "../../charts";
import { bytes } from "@/lib/format";
import type { PanelProps } from "@/lib/types";
import type { W4Task3 } from "@/lib/generated/contratos";

type Run = W4Task3["runs"][number];

const COLOR: Record<string, string> = {
  "1a sin": "var(--blue)",
  "1a con": "var(--violet)",
  "1b sin": "var(--amber)",
  "1b con": "var(--green)",
};
const nombre = (job: string, combiner: boolean) => `${job} ${combiner ? "con" : "sin"}`;

/** Task 3 del W4 — tamano del shuffle del Job 1 con y sin combiner, a 1x, 2x
 *  y 4x datos, su extrapolacion a 10x y el costo de PageRank. */
export default function Task3({ data: t }: PanelProps<W4Task3>) {
  const escalas = [...t.scales].sort((a, b) => a - b);
  const claves = Array.from(new Set(t.runs.map((r) => nombre(r.job, r.combiner)))).sort();
  const celda = (k: string, s: number): Run | undefined =>
    t.runs.find((r) => nombre(r.job, r.combiner) === k && r.scale === s);
  const MB = 1024 * 1024;
  const job1 = celda("1a sin", escalas[0]);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Lo que cuesta el shuffle, con y sin combiner</h2>
        <span className="panel-tag">TASK 3 · ESCALAS {escalas.map((s) => `${s}x`).join(" · ")}</span>
      </div>
      <p className="panel-desc">
        El costo de comunicacion de un algoritmo MapReduce es la suma de lo que entra a todas sus tareas;
        aqui se mide la parte que cambia con el combiner, el shuffle: lo que viaja del map a los reducers.
        Cada linea es una ronda del Job 1 con o sin combiner, en megabytes de pares serializados, contra el
        tamano de los datos. 2x y 4x son el mismo stream repetido con conductores renombrados, asi que el grafo crece
        exactamente al doble y al cuadruple.
      </p>

      <LineChart
        xs={escalas}
        xLabel=""
        yUnit="MB"
        series={claves.map((k) => ({
          name: k,
          color: COLOR[k] ?? "var(--text-dim)",
          values: escalas.map((s) => (celda(k, s)?.shuffle_bytes ?? 0) / MB),
        }))}
      />
      <Legend
        items={[
          { name: "eje x: escala de los datos (1x, 2x, 4x)", color: "transparent" },
          ...claves.map((k) => ({ name: `ronda ${k} combiner`, color: COLOR[k] ?? "var(--text-dim)" })),
        ]}
      />

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Ronda</th>
              {escalas.map((s) => (
                <th key={s}>{s}x · pares</th>
              ))}
              <th>10x (ajuste lineal)</th>
              <th>R²</th>
            </tr>
          </thead>
          <tbody>
            {claves.map((k) => {
              const [job, con] = k.split(" ");
              const ext = t.extrapolation_10x.find((e) => e.job === job && e.combiner === (con === "con"));
              // Con combiner el shuffle de 1b no crece con los datos: un R² de una
              // serie constante no dice nada, asi que se nombra lo que es.
              const pares = escalas.map((s) => celda(k, s)?.shuffle_pairs);
              const constante = pares.length > 1 && pares.every((p) => p !== undefined && p === pares[0]);
              return (
                <tr key={k}>
                  <td style={{ color: COLOR[k] }}>{`${job} ${con} combiner`}</td>
                  {escalas.map((s) => {
                    const r = celda(k, s);
                    return (
                      <td key={s} title={r ? bytes(r.shuffle_bytes) : undefined}>
                        {r ? int(r.shuffle_pairs) : "—"}
                      </td>
                    );
                  })}
                  <td>{ext ? `${int(ext.shuffle_pairs)} · ${bytes(ext.shuffle_bytes)}` : "—"}</td>
                  <td>{constante ? "constante" : ext ? fmt(ext.linear_r2, 4) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="panel-desc" style={{ marginTop: 10 }}>
        <b>Por que el combiner solo ayuda al contar.</b> {t.combiner_explanation}
      </p>
      <p className="panel-desc" style={{ marginBottom: 0 }}>
        <b>PageRank (S10).</b> {int(t.pagerank_cost.pairs_per_iteration)} pares por iteracion ×{" "}
        {int(t.pagerank_cost.iterations)} iteraciones = {int(t.pagerank_cost.total_pairs)} pares en total
        {job1 && job1.shuffle_pairs > 0
          ? `, contra ${int(job1.shuffle_pairs)} del shuffle de la ronda 1a a ${job1.scale}x: el grafo de zonas es diminuto al lado del stream.`
          : "."}
      </p>
    </section>
  );
}
