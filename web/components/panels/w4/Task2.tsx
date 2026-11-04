"use client";

import { fmt, int } from "../../charts";
import { sci } from "@/lib/format";
import type { PanelProps } from "@/lib/types";
import type { W4Task2 } from "@/lib/generated/contratos";

/** Task 2 del W4 — PageRank como rondas de producto matriz-vector: como cae
 *  el cambio entre iteraciones y que tanto se parece al de la Unidad 3. */
export default function Task2({ data: t }: PanelProps<W4Task2>) {
  // Barras en escala logaritmica: el cambio cae ordenes de magnitud por ronda.
  const logs = t.rounds.map((r) => Math.log10(Math.max(r.l1_change, 1e-16)));
  const piso = Math.min(Math.log10(t.tol), ...logs) - 0.5;
  const techo = Math.max(0, ...logs);
  const ancho = (x: number) => `${Math.max(1, ((x - piso) / (techo - piso)) * 100)}%`;
  const zonas = [...t.zones].sort((a, b) => b.pagerank_mr - a.pagerank_mr);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">PageRank en rondas de MapReduce</h2>
        <span className="panel-tag">
          TASK 2 · β = {fmt(t.beta, 2)} · {int(t.iterations)} RONDAS
        </span>
      </div>
      <p className="panel-desc">
        Cada ronda es una multiplicacion v M: el map emite (j, p(i,j) · v_i) por cada entrada de la
        matriz y el reduce suma por j; el teletransporte, (1 − β)/n, se agrega en el reduce o al cerrar la
        ronda. La barra es
        ||v(t+1) − v(t)||₁ en escala logaritmica; la linea punteada es la tolerancia, {sci(t.tol, 0)}.
      </p>

      <div style={{ position: "relative", margin: "6px 0 4px" }}>
        {t.rounds.map((r, i) => (
          <div key={r.iteration} style={{ display: "flex", alignItems: "center", gap: 10, margin: "5px 0" }}>
            <span style={{ width: 70, fontSize: 12, color: "var(--text-dim)" }}>ronda {r.iteration}</span>
            <div style={{ flex: 1, position: "relative", height: 14 }}>
              <div
                style={{
                  width: ancho(logs[i]),
                  height: "100%",
                  borderRadius: 2,
                  background: r.l1_change < t.tol ? "var(--green)" : "var(--blue)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -3,
                  bottom: -3,
                  left: ancho(Math.log10(t.tol)),
                  borderLeft: "1.5px dashed var(--amber)",
                }}
              />
            </div>
            <span style={{ width: 150, fontSize: 12, fontFamily: "var(--mono)", textAlign: "right" }}>
              {sci(r.l1_change, 2)} · {int(r.shuffle_pairs)} pares
            </span>
          </div>
        ))}
      </div>
      <p className="panel-desc" style={{ marginTop: 6 }}>
        {t.converged
          ? `Converge en ${int(t.iterations)} rondas.`
          : `No llego a la tolerancia en ${int(t.iterations)} rondas.`}{" "}
        Cada ronda mueve {int(t.rounds[0]?.map_output_pairs)} pares del map, uno por entrada de M.
      </p>

      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Zona</th>
              <th>MapReduce</th>
              <th>Unidad 3</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((z) => (
              <tr key={z.zone}>
                <td>{z.zone}</td>
                <td>{fmt(z.pagerank_mr, 6)}</td>
                <td>{fmt(z.pagerank_unit3, 6)}</td>
                <td>{sci(z.abs_diff, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="panel-desc"
        style={{ marginTop: 8, marginBottom: 0, color: t.agrees_1e4 ? "var(--green)" : "var(--red)", fontWeight: 600 }}
      >
        {t.agrees_1e4
          ? `Coincide con la Unidad 3: la mayor diferencia es ${sci(t.max_abs_diff, 1)}, por debajo de 1e-4.`
          : `No coincide con la Unidad 3: la mayor diferencia es ${sci(t.max_abs_diff, 1)}, por encima de 1e-4.`}
      </p>
    </section>
  );
}
