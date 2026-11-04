"use client";

import { fmt, int } from "../../charts";
import { bytes } from "@/lib/format";
import type { PanelProps } from "@/lib/types";
import type { W4Task1 } from "@/lib/generated/contratos";

/** Que hace cada ronda, para la tabla. Un job con otro nombre sale tal cual. */
const RONDAS: Record<string, string> = {
  "1a": "Job 1 · agrupar por conductor",
  "1b": "Job 1 · contar pares de zonas",
  "2": "Job 2 · resumen por zona",
};

/** Task 1 del W4 — el grafo de la Unidad 3 rehecho con jobs de MapReduce:
 *  las cifras de cada ronda, la validacion contra edges.csv y la salida del
 *  Job 2 (el resumen por zona de la plantilla). */
export default function Task1({ data: t }: PanelProps<W4Task1>) {
  const v = t.validation;
  const [primero] = t.jobs;
  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">El grafo de reubicaciones en dos jobs de MapReduce</h2>
        <span className="panel-tag">
          TASK 1 · {t.n_fragments} FRAGMENTOS · {t.workers} WORKERS
        </span>
      </div>
      <p className="panel-desc">
        El Job 1 junta los viajes de cada conductor, que estan repartidos entre los fragmentos, y los
        ordena por stream_seq: cada par de viajes seguidos es una reubicacion. Contarlas pide un segundo
        shuffle, ahora por par de zonas. El Job 2 suma por zona lo que sale y lo que llega. Cada fila es
        una ronda: cuantos registros entran, cuantos pares emite el map y cuantos viajan a los reducers
        despues del combiner.
      </p>
      {!t.parallel && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Esta corrida no uso procesos en paralelo (en el navegador todo corre en secuencia): los
          conteos son los mismos, los tiempos no.
        </p>
      )}

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Ronda</th>
              <th>Map · reduce</th>
              <th>Entran</th>
              <th>Emite el map</th>
              <th>Shuffle</th>
              <th>Bytes</th>
              <th>Salen</th>
              <th>q</th>
              <th>Segundos</th>
            </tr>
          </thead>
          <tbody>
            {t.jobs.map((j) => (
              <tr key={j.job}>
                <td>{RONDAS[j.job] ?? j.job}</td>
                <td>
                  {j.map_tasks} · {j.reduce_tasks}
                </td>
                <td>{int(j.input_records)}</td>
                <td>{int(j.map_output_pairs)}</td>
                <td>{int(j.shuffle_pairs)}</td>
                <td>{bytes(j.shuffle_bytes)}</td>
                <td>{int(j.output_records)}</td>
                <td
                  title={
                    j.hot_key_ties !== undefined && j.hot_key_ties > 1
                      ? `${int(j.hot_key_ties)} claves empatan (p. ej. ${j.hot_key})`
                      : j.hot_key
                  }
                >
                  {int(j.max_key_values)}
                </td>
                <td>{j.total_s < 0.01 ? "< 0.01" : fmt(j.total_s, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 8 }}>
        q es el tamano de reducer: los valores que recibe la clave mas cargada
        {primero ? ` (en la primera ronda, ${primero.hot_key})` : ""}.
      </p>

      <p
        className="panel-desc"
        style={{ color: v.edges_match ? "var(--green)" : "var(--red)", fontWeight: 600 }}
      >
        {v.edges_match
          ? `Las ${int(v.edges_compared)} aristas coinciden con edges.csv de la Unidad 3`
          : `Las aristas NO coinciden con edges.csv de la Unidad 3 (${int(v.edges_compared)} comparadas)`}
        : diferencia maxima de {int(v.max_diff_reloc_count)} en reloc_count, {fmt(v.max_diff_avg_fare, 2)} en
        la tarifa media y {fmt(v.max_diff_avg_wait, 2)} s en la espera.
        {t.nodes_match !== undefined &&
          (t.nodes_match ? " El resumen por zona coincide con nodes.csv." : " El resumen por zona NO coincide con nodes.csv.")}
      </p>

      <h3 className="panel-title" style={{ fontSize: 15, marginTop: 18 }}>
        Salida del Job 2: el resumen por zona
      </h3>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Zona</th>
              <th>Salen</th>
              <th>Llegan</th>
              <th>net_flow</th>
              <th>Tarifa media</th>
              <th>Espera media</th>
            </tr>
          </thead>
          <tbody>
            {t.nodes.map((n) => (
              <tr key={n.zone_id}>
                <td>{n.zone_id}</td>
                <td>{int(n.out_reloc_count)}</td>
                <td>{int(n.in_reloc_count)}</td>
                <td style={{ color: n.net_flow < 0 ? "var(--amber)" : "var(--text)" }}>
                  {n.net_flow > 0 ? "+" : ""}
                  {int(n.net_flow)}
                </td>
                <td>{int(n.avg_fare)}</td>
                <td>{fmt(n.avg_wait_for_driver_sec, 1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
