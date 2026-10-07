"use client";

import { fmt, int } from "../../charts";
import { TimeSeries } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W3Task5 } from "@/lib/generated/contratos";
import Requisitos from "../../Requisitos";

/** Valor de un literal ("x3" o "-x3") con la asignacion; undefined si la
 *  variable no esta asignada. */
function vale(lit: string, a: Record<string, boolean>) {
  const neg = lit.startsWith("-") || lit.startsWith("¬");
  const v = a[neg ? lit.slice(1) : lit];
  return v === undefined ? undefined : neg ? !v : v;
}

/** Task 5 del W3 — Papadimitriou para 2-SAT. El panel vuelve a evaluar cada
 *  clausula con la asignacion final: no le cree a `satisfiable`, lo verifica. */
export default function Task5({ data: t }: PanelProps<W3Task5>) {
  const a = t.assignment;
  const significado = Object.fromEntries(t.variables.map((v) => [v.name, v.meaning]));
  const clausulas = t.constraints.flatMap((c) => c.clauses);
  const evaluar = (c: string[]) => c.some((l) => vale(l, a) === true);
  const cumplidas = clausulas.filter(evaluar).length;
  const coincide = (cumplidas === clausulas.length) === t.satisfiable;
  const n = t.variables.length;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">2-SAT aleatorizado sobre politicas de despacho</h2>
        <span className="panel-tag">
          TASK 5 · {n} VARIABLES · {clausulas.length} CLAUSULAS
        </span>
      </div>
      <p className="panel-desc">
        Papadimitriou: empezar con una asignacion al azar y, mientras haya una clausula sin cumplir,
        cambiar una de sus dos variables al azar. Si la formula es satisfacible, el numero esperado de
        cambios es a lo sumo n², asi que con 2n² cambios falla con probabilidad a lo sumo 1/2 (Markov);
        repetirlo b veces la baja a 1/2^b.
      </p>

      <Requisitos
        items={[
          { ok: t.constraints.length === 5, texto: `5 restricciones (hay ${t.constraints.length})` },
          { ok: n >= 8, texto: `8 o mas variables (hay ${n})` },
          {
            ok: clausulas.every((c) => c.length === 2),
            texto: "clausulas de exactamente 2 literales (si no, ya no es 2-SAT)",
          },
        ]}
      />

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Resultado</div>
          <div className="value" style={{ color: t.satisfiable ? "var(--green)" : "var(--amber)" }}>
            {t.satisfiable ? "Satisfacible" : "Sin asignacion"}
          </div>
          <div className="delta">
            verificado aca: {cumplidas} de {clausulas.length} clausulas
            {coincide ? "" : " · NO coincide"}
            {!t.satisfiable && " · agoto el limite sin encontrarla: no prueba que no exista"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Cambios hechos</div>
          <div className="value">{int(t.flips)}</div>
          <div className="delta">limite {int(t.max_flips)}</div>
        </div>
        <div className="kpi">
          <div className="label">n² (esperado)</div>
          <div className="value">{int(n * n)}</div>
          <div className="delta">cota del numero esperado de cambios</div>
        </div>
      </div>

      {t.trace && t.trace.length > 1 && (
        <>
          <h3 className="panel-sub">Clausulas sin cumplir despues de cada cambio</h3>
          <TimeSeries
            label="Clausulas sin cumplir a lo largo de la busqueda"
            labels={t.trace.map((_, i) => String(i))}
            xFormat={(s) => `cambio ${s}`}
            yFormat={(v) => fmt(v, 0)}
            series={[{ name: "sin cumplir", color: "var(--violet)", values: t.trace }]}
            height={150}
          />
        </>
      )}

      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Restriccion</th>
              <th>Clausulas</th>
              <th>Con la asignacion final</th>
            </tr>
          </thead>
          <tbody>
            {t.constraints.map((c, i) => (
              <tr key={i}>
                <td>{c.text}</td>
                <td className="mono">{c.clauses.map((cl) => `(${cl.join(" ∨ ")})`).join(" ∧ ")}</td>
                <td style={{ color: c.clauses.every(evaluar) ? "var(--green)" : "var(--red)" }}>
                  {c.clauses.every(evaluar) ? "se cumple" : "NO se cumple"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="panel-sub">Asignacion final</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Object.entries(a).map(([v, val]) => (
          <span
            key={v}
            className="zone-chip on"
            title={significado[v] ?? ""}
            style={{ borderColor: val ? "var(--green)" : "var(--border)", cursor: "default" }}
          >
            {v} = {val ? "V" : "F"}
            {significado[v] ? ` · ${significado[v]}` : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
