"use client";

import { fmt } from "../../charts";
import { MeterBars, pct } from "../../charts-stream";
import { SlopeChart, zoneColors } from "../../charts-graph";
import type { PanelProps } from "@/lib/types";
import type { W3Task3, W3Task6 } from "@/lib/generated/contratos";

/** Panel D del W3 — ranking por PageRank contra ranking por volumen (de la
 *  Task 3), sobre el medidor de surge de la Unidad 1 (de esta task).
 *
 *  Es el unico panel que cruza dos tasks. Sin la Task 3 muestra solo el
 *  medidor y dice que falta; nunca inventa un ranking. Abajo, el escenario
 *  alterno con despacho espacial, que calcula esta misma task. */
/** Todas las zonas con el mismo PageRank: el ranking es solo el desempate. */
const empatado = (t3: W3Task3) => {
  const v = t3.zones.map((z) => z.pagerank);
  return v.length > 1 && Math.max(...v) - Math.min(...v) < 1e-6;
};

export default function Task6({ data: t, all }: PanelProps<W3Task6>) {
  const t3 = all.task3 as W3Task3 | undefined;
  const color = zoneColors((t3?.zones ?? t.zones).map((z) => z.zone));
  const surge = Object.fromEntries(t.zones.map((z) => [z.zone, z]));
  const maxRate = Math.max(...t.zones.map((z) => z.surge_rate), 1e-9);
  const alt = t.dispatch_scenario;
  const altCambios = alt.zones
    .filter((z) => z.pagerank_rank !== z.volume_rank)
    .sort((a, b) => a.volume_rank - b.volume_rank);
  const tono = (r: number) => (r >= 0.75 * maxRate ? "var(--red)" : r >= 0.4 * maxRate ? "var(--amber)" : "var(--text-dim)");

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel D — PageRank contra volumen, sobre el medidor de surge</h2>
        <span className="panel-tag">TASK 6 · TASK 3 + UMBRAL DE LA UNIDAD 1</span>
      </div>
      <p className="panel-desc">
        Cada zona con su puesto por viajes (izquierda) y por PageRank (derecha). A la derecha, su
        medidor de surge: la fraccion de sus horas en que las solicitudes superaron el umbral de la
        Unidad 1, T = μ + {fmt(t.k_sigma, 1)}√μ. El medidor solo mira la demanda de la zona contra su
        propio historico: dice cuando pide inusualmente mucho, no si le faltan conductores.
      </p>

      {t3 && empatado(t3) && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Ojo: la Task 3 da el mismo PageRank a todas las zonas, asi que el orden de la derecha es solo
          el desempate y las lineas que suben o bajan no significan nada.
        </p>
      )}
      {t3 ? (
        <SlopeChart
          label="Puesto por volumen contra puesto por PageRank, con la frecuencia de surge"
          leftTitle="Por volumen"
          rightTitle="Por PageRank · surge"
          items={t3.zones.map((z) => ({
            name: z.zone,
            left: z.volume_rank,
            right: z.pagerank_rank,
            color: color[z.zone],
          }))}
          badge={(name) => {
            const s = surge[name];
            return s ? { text: `surge ${pct(s.surge_rate, 1)}`, color: tono(s.surge_rate) } : null;
          }}
        />
      ) : (
        <>
          <p className="panel-desc" style={{ color: "var(--amber)" }}>
            Falta la Task 3 (PageRank): cuando este, aqui aparece el ranking. Mientras tanto, el medidor
            de surge por zona:
          </p>
          <MeterBars
            label="Fraccion de horas en surge por zona"
            rows={[...t.zones]
              .sort((a, b) => b.surge_rate - a.surge_rate)
              .map((z) => ({
                label: z.zone,
                value: z.surge_rate / maxRate,
                color: tono(z.surge_rate),
                note: `${pct(z.surge_rate, 1)} · ${z.surged} de ${z.slots} horas`,
              }))}
            refLabel="la zona con mas surge"
            valueFormat={(v) => pct(v * maxRate, 1)}
          />
        </>
      )}

      <h3 className="panel-title" style={{ fontSize: 15, marginTop: 22 }}>
        Escenario alterno: despacho espacial
      </h3>
      <p className="panel-desc">
        En el grafo del enunciado el conductor de cada viaje viene sorteado al azar desde la Unidad 1,
        asi que su siguiente zona casi no depende de la actual y PageRank tiende a ordenar igual que
        el volumen. Aqui el mismo stream se re-despacha: cada viaje lo toma el conductor libre mas
        cercano, que queda libre en el destino (data/edges_despacho.csv). La distribucion
        estacionaria π sigue cerca del volumen; PageRank, con β = {fmt(alt.beta, 2)}, corta la
        caminata con reinicios a una zona al azar, y cada zona gana o pierde peso respecto a π. A la
        derecha, π → PageRank de cada zona.
      </p>
      <SlopeChart
        label="Escenario alterno: puesto por volumen contra puesto por PageRank"
        leftTitle="Por volumen"
        rightTitle="PageRank · π → PageRank"
        items={alt.zones.map((z) => ({
          name: z.zone,
          left: z.volume_rank,
          right: z.pagerank_rank,
          color: color[z.zone] ?? "var(--text-dim)",
        }))}
        badge={(name) => {
          const z = alt.zones.find((x) => x.zone === name);
          return z ? { text: `${fmt(z.pi, 3)} → ${fmt(z.pagerank, 3)}`, color: z.pagerank < z.pi ? "var(--amber)" : "var(--text-dim)" } : null;
        }}
      />
      {altCambios.length > 0 && (
        <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
          {altCambios
            .map(
              (z) =>
                `${z.zone} pasa del puesto ${z.volume_rank} al ${z.pagerank_rank}: π ${fmt(z.pi, 4)}, PageRank ${fmt(
                  z.pagerank,
                  4
                )} (${z.pagerank >= z.pi ? "+" : "−"}${fmt(Math.abs(z.pagerank - z.pi), 4)}). Se queda en la zona con probabilidad ${fmt(
                  z.stay_prob,
                  2
                )} y le llega en un paso desde una zona al azar ${fmt(z.inflow_mean, 3)}`
            )
            .join(". ")}
          .
        </p>
      )}
    </section>
  );
}
