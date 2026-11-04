"use client";

import { fmt, int } from "../../charts";
import { Escalamiento } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W4Task5 } from "@/lib/generated/contratos";

/** Task 5 del W4 — speedup y eficiencia del pipeline completo contra el
 *  numero de workers, en dos o mas tamanos de datos. */
export default function Task5({ data: t }: PanelProps<W4Task5>) {
  const runs = [...t.runs].sort((a, b) => a.scale - b.scale || a.workers - b.workers);
  const conFases = runs.some((r) => r.map_s !== undefined);
  // Cuanto acelera cada fase entre P = 1 y el P mas alto de la escala mayor.
  const escalaMayor = Math.max(...runs.map((r) => r.scale));
  const deEsa = runs.filter((r) => r.scale === escalaMayor);
  const uno = deEsa.find((r) => r.workers === 1);
  const tope = deEsa[deEsa.length - 1];
  const acelera = (k: "map_s" | "reduce_s") =>
    uno?.[k] && tope?.[k] ? (uno[k] as number) / (tope[k] as number) : null;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Speedup y eficiencia contra workers</h2>
        <span className="panel-tag">
          TASK 5 · {int(t.cpu_count)} NUCLEOS {t.parallel ? "" : "· SIN PARALELISMO"}
        </span>
      </div>
      {!t.parallel && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Esta corrida no uso procesos en paralelo (el navegador no tiene): todos los P corrieron en
          secuencia y el speedup no mide nada. Las cifras para exponer salen de la corrida en la terminal.
        </p>
      )}
      <p className="panel-desc">
        S_P = T_1 / T_P y E_P = S_P / P, con T el tiempo de los jobs 1a, 1b y 2 sin el arranque del pool.
        La linea gris es el ideal.
      </p>

      <Escalamiento t={t} medida="speedup" />
      <div style={{ marginTop: 12 }}>
        <Escalamiento t={t} medida="efficiency" />
      </div>

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Datos</th>
              <th>P</th>
              <th>Segundos</th>
              <th>S_P</th>
              <th>E_P</th>
              {conFases && (
                <>
                  <th>Map</th>
                  <th>Shuffle</th>
                  <th>Reduce</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={`${r.scale}-${r.workers}`}>
                <td>
                  {r.scale}x · {int(r.input_records)}
                </td>
                <td>{r.workers}</td>
                <td>{fmt(r.time_s, 2)}</td>
                <td>{fmt(r.speedup, 2)}</td>
                <td>{fmt(r.efficiency, 2)}</td>
                {conFases && (
                  <>
                    <td>{fmt(r.map_s, 2)}</td>
                    <td>{fmt(r.shuffle_s, 2)}</td>
                    <td>{fmt(r.reduce_s, 2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.parallel && acelera("map_s") !== null && acelera("reduce_s") !== null && (
        <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
          Con {escalaMayor}x datos, de P = 1 a P = {tope.workers} el map se acelera {fmt(acelera("map_s"), 1)}× y el
          reduce {fmt(acelera("reduce_s"), 1)}×, contra {tope.workers}× del ideal. Una fase no usa mas workers que
          tareas tiene (el reduce de cada job y el map de 1b tienen tantas como reducers), y todos los bytes del
          shuffle pasan por el proceso principal, que es uno solo: esas partes no bajan al sumar workers y por
          eso la eficiencia cae.
        </p>
      )}
    </section>
  );
}
