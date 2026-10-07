"use client";

import { fmt } from "../../charts";
import { Heatmap } from "../../charts-graph";
import type { PanelProps } from "@/lib/types";
import type { W3Task1 } from "@/lib/generated/contratos";
import Requisitos from "../../Requisitos";

/** Task 1 del W3 — la matriz de transicion M y la clasificacion de estados. */
export default function Task1({ data: t }: PanelProps<W3Task1>) {
  // Revision independiente de lo que reporta la task: cada fila de M debe
  // sumar 1. Una fila que no suma 1 delata una matriz por columnas o sin normalizar.
  const malas = t.matrix
    .map((fila, i) => ({ zona: t.states[i], suma: fila.reduce((a, b) => a + b, 0) }))
    .filter((f) => Math.abs(f.suma - 1) > 1e-3);
  const diag = t.states.map((z, i) => ({ z, p: t.matrix[i]?.[i] ?? 0 })).sort((a, b) => b.p - a.p);

  const insignia = (ok: boolean, si: string, no: string) => (
    <span className="panel-tag" style={{ color: ok ? "var(--green)" : "var(--amber)", marginRight: 8 }}>
      {ok ? si : no}
    </span>
  );

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Matriz de transicion entre zonas</h2>
        <span className="panel-tag">TASK 1 · DTMC · {t.states.length} ESTADOS</span>
      </div>
      <p className="panel-desc">
        Fila = zona de origen, columna = zona del siguiente viaje del mismo conductor. Cada celda es
        P(ir de la fila a la columna); la diagonal (borde ambar) es quedarse en la misma zona. Una zona
        absorbente tendria un 1 en su diagonal y ceros en el resto de su fila.
      </p>

      <Requisitos items={[{ ok: t.states.length >= 8, texto: `8 o mas zonas como estados (hay ${t.states.length})` }]} />

      <div style={{ margin: "4px 0 12px" }}>
        {insignia(t.irreducible, "IRREDUCIBLE", "NO IRREDUCIBLE")}
        {insignia(t.aperiodic, "APERIODICA", "PERIODICA")}
        {insignia(
          t.absorbing.length === 0,
          "SIN ZONAS ABSORBENTES",
          `ABSORBENTES: ${t.absorbing.join(", ")}`
        )}
      </div>

      <Heatmap
        label="Matriz de transicion entre zonas"
        rows={t.states}
        cols={t.states}
        values={t.matrix}
        format={(v) => fmt(v, 2)}
      />

      {malas.length > 0 && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Ojo: estas filas no suman 1 ({malas.map((f) => `${f.zona} ${fmt(f.suma, 3)}`).join(", ")}). El
          contrato pide M por filas: matrix[i][j] = P(i → j).
        </p>
      )}

      <p className="panel-desc" style={{ marginTop: 10 }}>
        Probabilidad de quedarse en la misma zona: la mas alta es {diag[0]?.z} ({fmt(diag[0]?.p, 3)}) y
        la mas baja {diag[diag.length - 1]?.z} ({fmt(diag[diag.length - 1]?.p, 3)}).
        {t.classes && t.classes.length > 0 && (
          <>
            {" "}
            Clases de comunicacion:{" "}
            {t.classes.map((c) => `{${c.states.join(", ")}} ${c.type}`).join("; ")}.
          </>
        )}
      </p>
    </section>
  );
}
