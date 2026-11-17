"use client";

import { fmt, int, Legend } from "../../charts";
import { pct } from "../../charts-stream";
import { COLORES, Dispersion, RecallAhorro } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W5Task2 } from "@/lib/generated/contratos";

/** Task 2 del W5 — hiperplanos aleatorios: el angulo estimado con n bits
 *  contra el verdadero, y el banding de las firmas (recall@5 contra
 *  comparaciones ahorradas). */
export default function Task2({ data: t }: PanelProps<W5Task2>) {
  const chequeo = [...t.angle_check].sort((a, b) => a.bits - b.bits);
  const menor = chequeo[0];
  const mayor = chequeo[chequeo.length - 1];
  const extremos = chequeo.length > 1 ? [menor, mayor] : chequeo;
  const maxAng = Math.max(1, ...extremos.flatMap((c) => c.sample.flatMap((p) => [p.true_deg, p.est_deg])));
  const bandas = [...t.banding].sort((a, b) => a.bits - b.bits || a.rows - b.rows);
  // La fila que mas ahorra sin perder recall: la que ahorra mas entre las de
  // mayor recall.
  const mejorRecall = Math.max(0, ...bandas.map((b) => b.recall_at_5));
  const elegida = [...bandas]
    .filter((b) => b.recall_at_5 === mejorRecall)
    .sort((a, b) => b.comparisons_saved - a.comparisons_saved)[0];

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Hiperplanos aleatorios: el angulo con bits y los vecinos con bandas</h2>
        <span className="panel-tag">
          TASK 2 · {int(t.drivers)} CONDUCTORES · {int(t.queries)} CONSULTAS
        </span>
      </div>
      <p className="panel-desc">
        Cada hiperplano da un bit: de que lado queda el vector de ocupacion. Dos vectores coinciden en un bit
        con probabilidad 1 − θ/180, asi que la fraccion de bits distintos por 180 estima el angulo. Cada punto es
        un par de conductores: su angulo verdadero contra el estimado; sobre la diagonal, la estimacion es
        exacta.
      </p>
      {menor && (
        <>
          <Dispersion
            puntos={extremos.flatMap((c, i) =>
              c.sample.map((p) => ({ x: p.true_deg, y: p.est_deg, color: COLORES[i === 0 ? 3 : 0] }))
            )}
            xMax={maxAng}
            yMax={maxAng}
            xLabel="angulo verdadero (grados)"
            yLabel="estimado"
            diagonal
            label="Angulo estimado contra verdadero"
          />
          <Legend items={extremos.map((c, i) => ({ name: `${c.bits} bits`, color: COLORES[i === 0 ? 3 : 0] }))} />
        </>
      )}
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Bits</th>
              <th>Pares</th>
              <th>Error medio (grados)</th>
            </tr>
          </thead>
          <tbody>
            {chequeo.map((c) => (
              <tr key={c.bits}>
                <td>{c.bits}</td>
                <td>{int(c.pairs)}</td>
                <td>{fmt(c.mean_abs_error_deg, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chequeo.length > 1 && (
        <p className="panel-desc" style={{ marginTop: 10 }}>
          {mayor.mean_abs_error_deg < menor.mean_abs_error_deg
            ? `De ${menor.bits} a ${mayor.bits} bits el error medio baja de ${fmt(menor.mean_abs_error_deg, 1)}° a ${fmt(
                mayor.mean_abs_error_deg,
                1
              )}°: cada bit es una moneda con probabilidad 1 − θ/180, y con mas monedas la fraccion se acerca a la probabilidad.`
            : `Con ${mayor.bits} bits el error medio (${fmt(mayor.mean_abs_error_deg, 1)}°) no baja respecto a ${menor.bits} bits (${fmt(
                menor.mean_abs_error_deg,
                1
              )}°).`}
        </p>
      )}

      <h3 className="panel-sub">Bandas: cuantos vecinos se encuentran y cuantas comparaciones se ahorran</h3>
      <p className="panel-desc">
        Con b bandas de r bits, dos conductores son candidatos si coinciden en los r bits de alguna banda. El
        top-5 se busca solo entre los candidatos y se compara con el top-5 por coseno exacto contra todos.
      </p>
      <RecallAhorro t={t} />
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Bits</th>
              <th>Bandas × filas</th>
              <th>Recall@5</th>
              <th>Candidatos</th>
              <th>Ahorro</th>
            </tr>
          </thead>
          <tbody>
            {bandas.map((b) => (
              <tr key={`${b.bits}-${b.bands}-${b.rows}`}>
                <td>{b.bits}</td>
                <td>
                  {b.bands} × {b.rows}
                </td>
                <td>{fmt(b.recall_at_5, 3)}</td>
                <td>{fmt(b.mean_candidates, 1)}</td>
                <td>{pct(b.comparisons_saved, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {elegida && (
        <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
          Con el mayor recall@5 medido ({fmt(elegida.recall_at_5, 3)}), la configuracion que mas ahorra es {elegida.bits}{" "}
          bits en {elegida.bands} bandas de {elegida.rows}: examina {fmt(elegida.mean_candidates, 1)} candidatos por consulta en
          vez de {int(t.drivers - 1)} ({pct(elegida.comparisons_saved, 1)} menos). Mas filas por banda exigen mas
          coincidencia y ahorran mas; mas bandas dan mas oportunidades y encuentran mas.
        </p>
      )}
    </section>
  );
}
