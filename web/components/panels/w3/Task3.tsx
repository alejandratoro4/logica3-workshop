"use client";

import { fmt, int } from "../../charts";
import { SlopeChart, zoneColors } from "../../charts-graph";
import type { PanelProps } from "@/lib/types";
import type { W3Task3 } from "@/lib/generated/contratos";

/** Task 3 del W3 — ranking por PageRank contra ranking por volumen. */
export default function Task3({ data: t }: PanelProps<W3Task3>) {
  const color = zoneColors(t.zones.map((z) => z.zone));
  const suben = t.zones.filter((z) => z.pagerank_rank < z.volume_rank);
  const valores = t.zones.map((z) => z.pagerank);
  const rango = Math.max(...valores) - Math.min(...valores);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">PageRank contra volumen de viajes</h2>
        <span className="panel-tag">
          TASK 3 · β = {fmt(t.beta, 2)} · {int(t.iterations)} ITERACIONES
        </span>
      </div>
      <p className="panel-desc">
        A la izquierda, el puesto de cada zona por viajes; a la derecha, por PageRank. Con reloc_count
        como peso y sin el salto aleatorio, PageRank seria la distribucion estacionaria, que queda muy
        cerca del volumen (Task 2). El salto (probabilidad 1 − β) reinicia la caminata en una zona al
        azar: PageRank promedia caminatas de todas las longitudes, cortadas por esos reinicios. Una
        zona sube (▲) o baja (▼) segun gane o pierda peso con los cortes respecto a π, y eso depende
        de las transiciones concretas de M. Si las filas de M son casi iguales, los cortes casi no
        mueven nada y los puestos tienden a repetir el volumen.
      </p>

      <SlopeChart
        label="Puesto por volumen de viajes contra puesto por PageRank"
        leftTitle="Por volumen"
        rightTitle="Por PageRank"
        items={t.zones.map((z) => ({ name: z.zone, left: z.volume_rank, right: z.pagerank_rank, color: color[z.zone] }))}
        badge={(name) => {
          const z = t.zones.find((x) => x.zone === name);
          return z ? { text: fmt(z.pagerank, 4), color: "var(--text-dim)" } : null;
        }}
      />

      {rango < 1e-6 && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Todas las zonas tienen el mismo PageRank ({fmt(valores[0], 4)}): el orden de la derecha es solo
          el desempate, no un ranking. Pasa cuando cada zona enlaza con todas las demas y no se usan los
          pesos reloc_count.
        </p>
      )}

      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        {suben.length
          ? `Suben en PageRank: ${suben.map((z) => `${z.zone} (${z.volume_rank} → ${z.pagerank_rank})`).join(", ")}.`
          : "Ninguna zona sube de puesto."}
        {t.explanation && (
          <>
            {" "}
            <b>{t.explanation}</b>
          </>
        )}
      </p>
    </section>
  );
}
