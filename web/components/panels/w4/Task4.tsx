"use client";

import { fmt, int } from "../../charts";
import { MeterBars } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W4Task4 } from "@/lib/generated/contratos";

/** Task 4 del W4 — tasa de replicacion r y tamano de reducer q de cada job, y
 *  la carga maxima por reducer del Job 1 con R = 1, 2, 4, 8 reduce tasks. */
export default function Task4({ data: t }: PanelProps<W4Task4>) {
  const sweep = [...t.reducer_sweep].sort((a, b) => a.reduce_tasks - b.reduce_tasks);
  const ultimo = sweep[sweep.length - 1];
  const q = t.hot_driver.rides;
  const desbalance = (s: (typeof sweep)[number]) => (s.mean_reducer_load ? s.max_reducer_load / s.mean_reducer_load : 1);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Tamano de reducer, tasa de replicacion y carga por reducer</h2>
        <span className="panel-tag">
          TASK 4 · CLAVE CALIENTE {t.hot_driver.driver_id} · q = {int(q)}
        </span>
      </div>
      <p className="panel-desc">
        r es cuantos pares emite el map por registro de entrada; q, cuantos valores recibe la clave mas
        cargada. En el Job 1 la clave caliente es el conductor con mas viajes: todos sus viajes tienen
        que llegar al mismo reducer, porque solo ahi se pueden ordenar.
      </p>

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Job</th>
              <th>Entran</th>
              <th>Emite el map</th>
              <th>r</th>
              <th>q</th>
              <th>Clave mas cargada</th>
            </tr>
          </thead>
          <tbody>
            {t.jobs.map((j) => (
              <tr key={j.job}>
                <td>{j.job}</td>
                <td>{int(j.input_records)}</td>
                <td>{int(j.map_output_pairs)}</td>
                <td>{fmt(j.replication_rate, 3)}</td>
                <td>{int(j.reducer_size_q)}</td>
                <td>
                  {j.hot_key_ties !== undefined && j.hot_key_ties > 1
                    ? `empate entre ${int(j.hot_key_ties)} claves (p. ej. ${j.hot_key})`
                    : j.hot_key}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="panel-title" style={{ fontSize: 15, marginTop: 18 }}>
        Job 1 con R reduce tasks: la mas cargada contra el promedio
      </h3>
      <p className="panel-desc">
        La barra es la carga del reducer mas cargado dividida entre la media (1 = reparto perfecto). Con
        R reducers el maximo no puede bajar de N/R, ni de q: una clave no se parte entre reducers.
      </p>
      <MeterBars
        label="Carga maxima sobre carga media por numero de reduce tasks"
        rows={sweep.map((s) => ({
          label: `R = ${s.reduce_tasks}`,
          value: desbalance(s),
          color: "var(--blue)",
          note: `max ${int(s.max_reducer_load)} · media ${int(s.mean_reducer_load)}${
            s.total_s !== undefined ? ` · ${fmt(s.total_s, 2)} s` : ""
          }`,
        }))}
        refValue={1}
        refLabel="reparto perfecto"
        valueFormat={(v) => `${fmt(v, 3)}×`}
      />
      {ultimo && (
        <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
          {desbalance(ultimo) > desbalance(sweep[0]) + 0.01
            ? `Con mas reducers la carga maxima baja, pero el desbalance crece hasta ${fmt(desbalance(ultimo), 2)}× con R = ${
                ultimo.reduce_tasks
              }: con menos claves por reducer, que el hash le toque a uno algunas claves de mas se nota mas. `
            : "Con mas reducers la carga maxima baja casi como 1/R. "}
          {q < ultimo.mean_reducer_load
            ? `q (${int(q)}) queda muy por debajo de la carga media con R = ${ultimo.reduce_tasks} (${int(
                ultimo.mean_reducer_load
              )}), asi que no es la clave caliente la que limita; lo seria con tantos reducers como conductores.`
            : `q (${int(q)}) ya alcanza la carga media: mas reducers no bajarian el maximo, porque la clave caliente no se parte.`}
        </p>
      )}
    </section>
  );
}
