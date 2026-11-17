"use client";

import { useState } from "react";
import { fmt, int } from "../../charts";
import { pct } from "../../charts-stream";
import { CurvaS, METODO, PruebaTarifa, RecallAhorro } from "./graficos";
import { resumenMetodos, todosIguales } from "@/lib/docs/w5/task6";
import type { PanelProps } from "@/lib/types";
import type { W5Task2, W5Task4, W5Task5, W5Task6 } from "@/lib/generated/contratos";

type Consulta = W5Task6["queries"][number];

function Vecinos({ q, territorio }: { q: Consulta; territorio: string[] }) {
  const nExactos = q.methods.find((m) => m.method === "jaccard")?.neighbors.length ?? 0;
  return (
    <>
      <p className="panel-desc">
        {q.driver_id} es del grupo {q.cluster} (territorio {territorio.join(", ")}): {int(q.seq_length)} viajes, tarifa
        media {int(q.avg_fare)}. Sus zonas principales, con al menos el 5 % de sus viajes:{" "}
        {q.main_zones.length ? q.main_zones.join(", ") : "ninguna"}.
      </p>
      {q.methods.map((m) => (
        <div key={m.method}>
          <h3 className="panel-sub">
            {METODO[m.method] ?? m.method} · {int(m.candidates)} candidatos examinados
            {m.method !== "jaccard" && ` · ${m.exact_in_candidates} de sus ${nExactos} vecinos exactos entre ellos`}
          </h3>
          {m.neighbors.length ? (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vecino</th>
                    <th>Puntaje</th>
                    <th>Grupo</th>
                    <th>Tarifa media</th>
                    <th>Zonas principales en comun</th>
                  </tr>
                </thead>
                <tbody>
                  {m.neighbors.map((v) => (
                    <tr key={v.driver_id}>
                      <td>{v.driver_id}</td>
                      <td>{fmt(v.score, 4)}</td>
                      <td style={{ color: v.cluster === q.cluster ? "var(--green)" : "var(--amber)" }}>
                        {v.cluster}
                        {v.cluster === q.cluster ? " (el mismo)" : ""}
                      </td>
                      <td>{int(v.avg_fare)}</td>
                      <td style={{ textAlign: "left" }}>{v.shared_zones.length ? v.shared_zones.join(", ") : "ninguna"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-desc" style={{ color: "var(--amber)" }}>
              Ningun candidato: LSH no puso a este conductor en el mismo bucket que ningun otro.
            </p>
          )}
        </div>
      ))}
    </>
  );
}

/** Paneles I y J del W5.
 *
 *  I es de esta task: un conductor y sus 5 vecinos con cada metodo.
 *  J no tiene datos propios: la curva S de la Task 4, el recall contra las
 *  comparaciones ahorradas de la Task 2 y el outcome test de la Task 5 (via
 *  `all`), y dice cual falta. */
export default function Task6({ data: t, all }: PanelProps<W5Task6>) {
  const [sel, setSel] = useState<string | null>(null);
  const q = t.queries.find((x) => x.driver_id === sel) ?? t.queries[0];
  const territorio = (c: number) => t.clusters.find((g) => g.cluster === c)?.territory ?? [];
  const resumen = resumenMetodos(t);
  const t2 = all.task2 as W5Task2 | undefined;
  const t4 = all.task4 as W5Task4 | undefined;
  const t5 = all.task5 as W5Task5 | undefined;
  const falta = (n: number, que: string) => (
    <p className="panel-desc" style={{ color: "var(--amber)" }}>
      Sin datos de la Task {n} ({que}): no se ha entregado, no ha terminado o su JSON no cumple el contrato.
    </p>
  );

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel I — Los vecinos de un conductor con cada metodo</h2>
        <span className="panel-tag">
          TASK 6 · {int(t.queries.length)} CONSULTAS DE {int(t.drivers)} CONDUCTORES
        </span>
      </div>
      <p className="panel-desc">
        MinHash busca candidatos con {t.lsh_config.bands} bandas de {t.lsh_config.rows} filas (umbral{" "}
        {fmt(t.lsh_config.threshold, 3)}) y los ordena por la fraccion de su firma que coincide; el coseno, con{" "}
        {t.cosine_config.bits} hiperplanos en {t.cosine_config.bands} bandas de {t.cosine_config.rows} bits; LCS ordena los
        candidatos de MinHash con programacion dinamica. El Jaccard exacto compara contra todos. En verde, los
        vecinos del mismo grupo plantado.
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Metodo</th>
              <th>Candidatos por consulta</th>
              <th>Vecinos exactos examinados</th>
              <th>Vecinos del mismo grupo</th>
              <th>En el top-5 exacto</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((r) => (
              <tr key={r.method}>
                <td>{METODO[r.method] ?? r.method}</td>
                <td>{fmt(r.candidatos, 1)}</td>
                <td>{pct(r.examinados, 0)}</td>
                <td>{r.vecinos ? pct(r.mismoGrupo, 0) : "—"}</td>
                <td>{pct(r.conExacto, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 10 }}>
        &quot;Vecinos exactos examinados&quot;: de los 5 vecinos del Jaccard exacto, cuantos salieron candidatos del
        metodo. Los que no, son falsos negativos de LSH y ningun orden los recupera; &quot;En el top-5 exacto&quot; no
        puede pasar de esa columna. La diferencia entre las dos es el orden: entre los que si se examinaron, el
        metodo eligio a otros.
      </p>

      {q ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 6px" }}>
            <label htmlFor="w5-consulta" className="panel-desc" style={{ margin: 0 }}>
              Conductor
            </label>
            <select id="w5-consulta" className="select" value={q.driver_id} onChange={(e) => setSel(e.target.value)}>
              {t.queries.map((x) => (
                <option key={x.driver_id} value={x.driver_id}>
                  {x.driver_id} · grupo {x.cluster}
                </option>
              ))}
            </select>
          </div>
          <Vecinos q={q} territorio={territorio(q.cluster)} />
        </>
      ) : (
        <p className="panel-desc">Esta corrida no tiene conductores para consultar.</p>
      )}

      <div className="panel-head" style={{ marginTop: 26 }}>
        <h2 className="panel-title">Panel J — Curva S, recall contra ahorro y outcome test</h2>
        <span className="panel-tag">TASK 6 · TASKS 4 + 2 + 5</span>
      </div>
      <h3 className="panel-sub">Curva S de MinHash: teoria contra lo medido (Task 4)</h3>
      {t4 ? <CurvaS t={t4} /> : falta(4, "MinHash y bandas")}
      <h3 className="panel-sub">Hiperplanos: recall@5 contra comparaciones ahorradas (Task 2)</h3>
      {t2 ? <RecallAhorro t={t2} /> : falta(2, "LSH para el coseno")}
      <h3 className="panel-sub">Outcome test de avg_fare (Task 5)</h3>
      {t5 && todosIguales(t) && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          En esta ciudad todos los conductores tienen los mismos shingles (Jaccard 1 entre todos): los vecinos de
          cada metodo salen del desempate por driver_id, asi que lo que diga esta prueba no viene de que se parezcan.
        </p>
      )}
      {t5 ? <PruebaTarifa t={t5} /> : falta(5, "vecinos con tres metodos")}
    </section>
  );
}
