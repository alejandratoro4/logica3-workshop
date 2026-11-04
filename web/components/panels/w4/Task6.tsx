"use client";

import { fmt, int } from "../../charts";
import { MeterBars, pct } from "../../charts-stream";
import { bytes } from "@/lib/format";
import { Escalamiento } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W4Task3, W4Task5, W4Task6 } from "@/lib/generated/contratos";

/** "Dia 14, 22:34" a partir de horas desde la medianoche del primer dia. */
const cuando = (h: number) => {
  const dia = Math.floor(h / 24) + 1;
  const min = Math.round((h - (dia - 1) * 24) * 60);
  return `dia ${dia}, ${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

/** P(|Z| > 2) para una normal: la fraccion de zonas que el azar solo deja
 *  fuera de la franja. */
const P_FUERA_2SIGMA = 0.0455;

type Zona = W4Task6["zones"][number];

/** Barras divergentes de net_flow con la banda de ±2 desviaciones de ruido y
 *  la frecuencia de surge de cada zona a la derecha. */
function FlujoNeto({ zonas }: { zonas: Zona[] }) {
  const W = 720;
  const rowH = 24;
  const pad = { t: 8, r: 200, b: 18, l: 100 };
  const H = pad.t + zonas.length * rowH + pad.b;
  const iw = W - pad.l - pad.r;
  const tope = Math.max(1, ...zonas.map((z) => Math.max(Math.abs(z.net_flow), 2 * z.noise_sd))) * 1.1;
  const X = (v: number) => pad.l + iw / 2 + (v / tope) * (iw / 2);
  const maxSurge = Math.max(...zonas.map((z) => z.surge_rate), 1e-9);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Flujo neto de conductores por zona, con su banda de ruido y su frecuencia de surge">
      {zonas.map((z, i) => {
        const y = pad.t + i * rowH;
        const fuera = Math.abs(z.net_flow) > 2 * z.noise_sd;
        const color = !fuera ? "var(--text-faint)" : z.net_flow < 0 ? "var(--amber)" : "var(--blue)";
        const sigmas = z.noise_sd ? z.net_flow / z.noise_sd : 0;
        return (
          <g key={z.zone}>
            <rect
              x={X(-2 * z.noise_sd)}
              y={y + 3}
              width={X(2 * z.noise_sd) - X(-2 * z.noise_sd)}
              height={rowH - 6}
              fill="var(--grid)"
              opacity="0.55"
              rx="2"
            />
            <rect
              x={Math.min(X(0), X(z.net_flow))}
              y={y + 7}
              width={Math.max(1.5, Math.abs(X(z.net_flow) - X(0)))}
              height={rowH - 14}
              fill={color}
              rx="1.5"
            />
            <text x={pad.l - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill="var(--text)">
              {z.zone}
            </text>
            <text x={W - pad.r + 10} y={y + rowH / 2 + 4} fontSize="11" fontFamily="var(--mono)" fill={color === "var(--text-faint)" ? "var(--text-dim)" : color}>
              {z.net_flow > 0 ? "+" : ""}
              {z.net_flow} · {sigmas > 0 ? "+" : ""}
              {fmt(sigmas, 1)}σ
            </text>
            <text
              x={W - 6}
              y={y + rowH / 2 + 4}
              textAnchor="end"
              fontSize="11"
              fontFamily="var(--mono)"
              fill={z.surge_rate >= 0.75 * maxSurge ? "var(--red)" : "var(--text-dim)"}
            >
              surge {pct(z.surge_rate, 1)}
            </text>
          </g>
        );
      })}
      <line x1={X(0)} x2={X(0)} y1={pad.t} y2={H - pad.b} stroke="var(--border)" />
      <text x={X(0) - 6} y={H - 4} textAnchor="end" fontSize="9.5" fill="var(--amber)">
        ← salen mas de los que llegan
      </text>
      <text x={X(0) + 6} y={H - 4} fontSize="9.5" fill="var(--blue)">
        llegan mas de los que salen →
      </text>
    </svg>
  );
}

/** Paneles E y F del W4.
 *
 *  E no tiene datos propios: lee speedup y eficiencia de la Task 5 y el
 *  shuffle con y sin combiner de la Task 3 (via `all`), y dice cual falta.
 *  F es de esta task: las zonas por net_flow, con su banda de ruido, junto
 *  al medidor de surge de la Unidad 1. */
export default function Task6({ data: t, all }: PanelProps<W4Task6>) {
  const t3 = all.task3 as W4Task3 | undefined;
  const t5 = all.task5 as W4Task5 | undefined;

  const escalaBase = t3 ? Math.min(...t3.runs.map((r) => r.scale)) : 1;
  const shuffle = t3
    ? t3.runs
        .filter((r) => r.scale === escalaBase)
        .sort((a, b) => a.job.localeCompare(b.job) || Number(a.combiner) - Number(b.combiner))
    : [];
  const maxBytes = Math.max(1, ...shuffle.map((r) => r.shuffle_bytes));
  const sin1b = shuffle.find((r) => r.job === "1b" && !r.combiner);
  const con1b = shuffle.find((r) => r.job === "1b" && r.combiner);

  const zonas = [...t.zones].sort((a, b) => a.net_flow_rank - b.net_flow_rank);
  const pierden = zonas.filter((z) => z.net_flow < -2 * z.noise_sd);
  const ganan = zonas.filter((z) => z.net_flow > 2 * z.noise_sd);
  const surgeMedio = zonas.reduce((a, z) => a + z.surge_rate, 0) / Math.max(1, zonas.length);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel E — Escalamiento y costo del shuffle</h2>
        <span className="panel-tag">TASK 6 · TASKS 5 + 3</span>
      </div>
      {t5 ? (
        <>
          <p className="panel-desc">
            Speedup del pipeline completo contra el numero de workers, una linea por tamano de datos (Task 5).
            {!t5.parallel && (
              <b style={{ color: "var(--amber)" }}>
                {" "}
                Esta corrida no tuvo procesos en paralelo: el speedup no mide nada.
              </b>
            )}
          </p>
          <Escalamiento t={t5} medida="speedup" />
          <div style={{ marginTop: 10 }}>
            <Escalamiento t={t5} medida="efficiency" />
          </div>
        </>
      ) : (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Sin datos de la Task 5 (eficiencia paralela): no se ha entregado, no ha terminado o su JSON no cumple
          el contrato. Cuando los haya, aqui aparecen el speedup y la eficiencia.
        </p>
      )}

      {t3 ? (
        <>
          <p className="panel-desc" style={{ marginTop: 14 }}>
            Bytes que viajan del map a los reducers en cada ronda del Job 1, con y sin combiner, a {escalaBase}x
            datos (Task 3).
            {sin1b && con1b && con1b.shuffle_bytes > 0
              ? ` Al contar pares (1b), el combiner reduce el shuffle ${int(sin1b.shuffle_bytes / con1b.shuffle_bytes)} veces: de ${int(
                  sin1b.shuffle_pairs
                )} pares a ${int(con1b.shuffle_pairs)}.`
              : ""}
          </p>
          <MeterBars
            label="Bytes del shuffle por ronda, con y sin combiner"
            rows={shuffle.map((r) => ({
              label: `${r.job} ${r.combiner ? "con" : "sin"}`,
              value: r.shuffle_bytes / maxBytes,
              color: r.combiner ? "var(--green)" : "var(--blue)",
              note: `${bytes(r.shuffle_bytes)} · ${int(r.shuffle_pairs)} pares`,
            }))}
            refValue={1}
            refLabel="la ronda mas pesada"
            valueFormat={(v) => bytes(v * maxBytes)}
          />
        </>
      ) : (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Sin datos de la Task 3 (analisis de costo): no se ha entregado, no ha terminado o su JSON no cumple el
          contrato. Cuando los haya, aqui aparece el shuffle con y sin combiner.
        </p>
      )}

      <div className="panel-head" style={{ marginTop: 26 }}>
        <h2 className="panel-title">Panel F — Flujo neto de conductores por zona, junto al surge</h2>
        <span className="panel-tag">TASK 6 · UMBRAL μ + {fmt(t.k_sigma, 1)}√μ</span>
      </div>
      <p className="panel-desc">
        net_flow = reubicaciones que llegan − las que salen. En la lectura del enunciado, negativo es una zona
        que pierde conductores, candidata a un incentivo de surge; abajo se ve que mide en este grafo. La
        franja gris es ±2 desviaciones de lo que daria el azar; a la derecha, la fraccion de horas de cada
        zona por encima del umbral de surge de la Unidad 1.
      </p>
      <FlujoNeto zonas={zonas} />

      <p className="panel-desc" style={{ marginTop: 10 }}>
        <b>Que mide net_flow aqui.</b> Cada recogida es la llegada de una reubicacion y la salida de la
        siguiente, asi que en el interior de la ventana todo lo que llega a una zona vuelve a salir. Solo
        cuentan los bordes: net_flow = conductores que terminan en la zona − los que empiezan ahi. Los{" "}
        {int(t.drivers)} conductores empiezan, en la mediana, el {cuando(t.first_ride_median_h)} y terminan el{" "}
        {cuando(t.last_ride_median_h)}, asi que net_flow compara la demanda de cada zona a esas dos horas, no un
        flujo sostenido durante los dias.
      </p>
      <p className="panel-desc" style={{ marginBottom: 0 }}>
        {pierden.length
          ? `Por debajo de −2σ: ${pierden
              .map((z) => `${z.zone} (${z.net_flow}, ${fmt(z.net_flow / z.noise_sd, 1)}σ, surge ${pct(z.surge_rate, 1)})`)
              .join(", ")}. `
          : "Ninguna zona queda por debajo de −2σ. "}
        {ganan.length
          ? `Por encima de +2σ: ${ganan
              .map((z) => `${z.zone} (+${z.net_flow}, +${fmt(z.net_flow / z.noise_sd, 1)}σ, surge ${pct(z.surge_rate, 1)})`)
              .join(", ")}. `
          : ""}
        {zonas.length > 1 &&
          `Con ${zonas.length} zonas, el azar solo ya deja en promedio ${fmt(zonas.length * P_FUERA_2SIGMA, 1)} fuera de ±2σ: las que estan cerca de 2σ no dicen mucho; las de 3σ o mas, si. `}
        El surge medio de las {zonas.length} zonas es {pct(surgeMedio, 1)}.
      </p>
    </section>
  );
}
