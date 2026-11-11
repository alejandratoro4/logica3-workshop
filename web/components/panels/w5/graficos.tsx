"use client";

import { fmt, int, Legend, niceTicks } from "../../charts";
import { MeterBars } from "../../charts-stream";
import { veredictoTarifa } from "@/lib/docs/w5/task6";
import type { W5Task1, W5Task2, W5Task4, W5Task5 } from "@/lib/generated/contratos";

/** Graficos que comparten los paneles del W5 y el Panel J (Task 6). No es un
 *  panel: sync-python solo registra los TaskK.tsx. */

export const COLORES = ["var(--blue)", "var(--green)", "var(--violet)", "var(--amber)"];

/** Nombre corto de cada metodo de vecinos, para tablas y leyendas. */
export const METODO: Record<string, string> = {
  jaccard: "Jaccard exacto",
  minhash: "MinHash + LSH",
  cosine: "Coseno + LSH",
  lcs: "LCS (candidatos)",
};

const W = 720;

/** Histograma de una medida con los pares del mismo grupo y los de grupos
 *  distintos apilados. */
export function Histograma({ m, height = 150 }: { m: W5Task1["measures"][number]; height?: number }) {
  const n = m.counts_same_cluster.length;
  if (!n || m.bin_edges.length < 2) return null;
  const pad = { t: 10, r: 10, b: 24, l: 40 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const totales = m.counts_same_cluster.map((c, i) => c + (m.counts_other_cluster[i] ?? 0));
  const ticks = niceTicks(Math.max(1, ...totales));
  const top = ticks[ticks.length - 1] || 1;
  const Y = (v: number) => pad.t + ih - (v / top) * ih;
  const bw = iw / n;
  const lo = m.bin_edges[0];
  const hi = m.bin_edges[m.bin_edges.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={`Distribucion de ${m.measure}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--grid)" />
          <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
            {int(t)}
          </text>
        </g>
      ))}
      {totales.map((_, i) => {
        const otros = m.counts_other_cluster[i] ?? 0;
        const mismo = m.counts_same_cluster[i] ?? 0;
        const x = pad.l + i * bw + 1;
        return (
          <g key={i}>
            <rect x={x} y={Y(otros)} width={Math.max(1, bw - 2)} height={pad.t + ih - Y(otros)} fill="var(--text-faint)" opacity="0.55" />
            <rect x={x} y={Y(otros + mismo)} width={Math.max(1, bw - 2)} height={Y(otros) - Y(otros + mismo)} fill="var(--blue)" />
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--border)" />
      <text x={pad.l} y={height - 7} fontSize="9.5" fill="var(--text-faint)">
        {fmt(lo, 3)}
      </text>
      <text x={W - pad.r} y={height - 7} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        {fmt(hi, 3)}
      </text>
    </svg>
  );
}

/** Puntos (x, y) con una diagonal opcional: el angulo estimado contra el
 *  verdadero, o el recall contra las comparaciones ahorradas. */
export function Dispersion({
  puntos,
  xMax,
  yMax,
  xLabel,
  yLabel,
  diagonal = false,
  height = 240,
  label,
}: {
  puntos: { x: number; y: number; color: string; texto?: string }[];
  xMax: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  diagonal?: boolean;
  height?: number;
  label?: string;
}) {
  if (!puntos.length) return null;
  const pad = { t: 14, r: 16, b: 30, l: 46 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const xt = niceTicks(xMax);
  const yt = niceTicks(yMax);
  const xTop = xt[xt.length - 1] || 1;
  const yTop = yt[yt.length - 1] || 1;
  const X = (v: number) => pad.l + (v / xTop) * iw;
  const Y = (v: number) => pad.t + ih - (v / yTop) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={label}>
      {yt.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--grid)" />
          <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
            {fmt(t, 2)}
          </text>
        </g>
      ))}
      {xt.map((t) => (
        <text key={`x${t}`} x={X(t)} y={height - 14} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)">
          {fmt(t, 2)}
        </text>
      ))}
      {diagonal && (
        <line
          x1={X(0)}
          y1={Y(0)}
          x2={X(Math.min(xTop, yTop))}
          y2={Y(Math.min(xTop, yTop))}
          stroke="var(--amber)"
          strokeDasharray="5 4"
          strokeWidth="1.4"
        />
      )}
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={X(p.x)} cy={Y(p.y)} r="3.2" fill={p.color} opacity="0.75" />
          {p.texto && (
            <text x={X(p.x) + 6} y={Y(p.y) - 5} fontSize="9.5" fill="var(--text-dim)">
              {p.texto}
            </text>
          )}
        </g>
      ))}
      <text x={W - pad.r} y={height - 2} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        {xLabel}
      </text>
      <text x={pad.l - 6} y={pad.t - 4} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        {yLabel}
      </text>
    </svg>
  );
}

/** Probabilidad de ser candidatos con Jaccard s: 1 - (1 - s^r)^b. */
export const curvaS = (s: number, b: number, r: number) => 1 - Math.pow(1 - Math.pow(s, r), b);

/** La curva S teorica de cada (b, r), con la tasa empirica de candidatos en
 *  cada intervalo de Jaccard (los puntos, en el centro del intervalo) y, al
 *  lado de cada punto, una raya con `theoretical_rate`: la curva promediada
 *  sobre los pares de ese intervalo, que no estan repartidos parejo. Es con
 *  la raya, no con la curva en el centro, que se compara el punto. */
export function CurvaS({ t, height = 250 }: { t: W5Task4; height?: number }) {
  const pad = { t: 14, r: 16, b: 30, l: 46 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const X = (s: number) => pad.l + s * iw;
  const Y = (p: number) => pad.t + ih - p * ih;
  const xs = Array.from({ length: 101 }, (_, i) => i / 100);
  const marcas = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label="Curva S teorica contra la tasa empirica de candidatos">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(m)} y2={Y(m)} stroke="var(--grid)" />
            <text x={pad.l - 6} y={Y(m) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
              {fmt(m, 1)}
            </text>
            <text x={X(m)} y={height - 14} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)">
              {fmt(m, 1)}
            </text>
          </g>
        ))}
        {t.configs.map((c, i) => {
          const color = COLORES[i % COLORES.length];
          return (
            <g key={`${c.bands}x${c.rows}`}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="1.8"
                opacity="0.85"
                points={xs.map((s) => `${X(s)},${Y(curvaS(s, c.bands, c.rows))}`).join(" ")}
              />
              <line x1={X(c.threshold)} x2={X(c.threshold)} y1={pad.t} y2={pad.t + ih} stroke={color} strokeDasharray="2 4" opacity="0.6" />
              {c.jaccard_buckets.map((k) => {
                const cx = X((k.lo + k.hi) / 2);
                return (
                  <g key={k.lo}>
                    <line
                      x1={cx - 9}
                      x2={cx + 9}
                      y1={Y(k.theoretical_rate)}
                      y2={Y(k.theoretical_rate)}
                      stroke={color}
                      strokeWidth="2.4"
                      opacity="0.7"
                    />
                    <circle
                      cx={cx}
                      cy={Y(k.empirical_rate)}
                      r={k.pairs >= 100 ? 4.2 : 2.8}
                      fill={k.pairs >= 100 ? color : "none"}
                      stroke={color}
                      strokeWidth="1.4"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x={W - pad.r} y={height - 2} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
          Jaccard verdadero s
        </text>
        <text x={pad.l - 6} y={pad.t - 4} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
          P(candidatos)
        </text>
      </svg>
      <Legend
        items={[
          ...t.configs.map((c, i) => ({
            name: `(b, r) = (${c.bands}, ${c.rows}) · umbral ${fmt(c.threshold, 2)}`,
            color: COLORES[i % COLORES.length],
          })),
          {
            name: "curva: teoria · raya: teoria para los pares del intervalo · punto: medido (hueco = menos de 100 pares)",
            color: "transparent",
          },
        ]}
      />
    </>
  );
}

/** Recall@5 contra la fraccion de comparaciones ahorradas de cada banding de
 *  hiperplanos (Task 2): el compromiso que se elige con b y r. */
export function RecallAhorro({ t, height = 230 }: { t: W5Task2; height?: number }) {
  const bits = Array.from(new Set(t.banding.map((b) => b.bits))).sort((a, b) => a - b);
  const color = (n: number) => COLORES[bits.indexOf(n) % COLORES.length];
  return (
    <>
      <Dispersion
        puntos={t.banding.map((b) => ({
          x: b.comparisons_saved,
          y: b.recall_at_5,
          color: color(b.bits),
          texto: `${b.bands}×${b.rows}`,
        }))}
        xMax={1}
        yMax={1}
        xLabel="comparaciones ahorradas"
        yLabel="recall@5"
        height={height}
        label="Recall@5 contra comparaciones ahorradas"
      />
      <Legend
        items={[
          ...bits.map((n) => ({ name: `${n} bits`, color: color(n) })),
          { name: "etiqueta: bandas × filas", color: "transparent" },
        ]}
      />
    </>
  );
}

/** El outcome test de la Task 5: la diferencia de avg_fare con los 5 vecinos
 *  de cada metodo sobre la diferencia con un conductor al azar. */
export function PruebaTarifa({ t }: { t: W5Task5 }) {
  const filas = t.outcome_test.filter((o) => o.random_mad > 0);
  const cociente = (o: (typeof filas)[number]) => o.neighbor_mad / o.random_mad;
  const nombre = (o: (typeof filas)[number]) => `${METODO[o.method] ?? o.method} (${fmt(cociente(o), 2)}×)`;
  // Mismo criterio que la pagina de la Task 6: con error estandar, a mas de 2;
  // sin el, solo cocientes fuera de 0,8-1,2.
  const lado = (o: (typeof filas)[number]) => veredictoTarifa(o)?.lado;
  const debajo = filas.filter((o) => lado(o) === "bajo");
  const cerca = filas.filter((o) => lado(o) === "ruido");
  const encima = filas.filter((o) => lado(o) === "encima");
  const conSe = filas.some((o) => veredictoTarifa(o)?.conSe);
  return (
    <>
      <p className="panel-desc">
        Para cada consulta, la diferencia absoluta media de avg_fare con sus 5 vecinos, contra la que tiene con
        un conductor al azar (la media contra todos los demas). avg_fare no esta en ninguna representacion: si los vecinos se le parecen mas que el
        azar (barra bajo 1×), el metodo agrupo conductores que tambien se parecen en algo que no vio.
      </p>
      <MeterBars
        label="Diferencia de tarifa con los vecinos sobre la diferencia con conductores al azar"
        rows={filas.map((o) => ({
          label: METODO[o.method] ?? o.method,
          value: cociente(o),
          color: cociente(o) < 1 ? "var(--green)" : "var(--amber)",
          note: `${int(o.neighbor_mad)} contra ${int(o.random_mad)} al azar`,
        }))}
        refValue={1}
        refLabel="igual que al azar"
        valueFormat={(v) => `${fmt(v, 2)}×`}
      />
      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        {debajo.length ? `Bajo el azar, mas alla del ruido de la muestra: ${debajo.map(nombre).join(", ")}. ` : ""}
        {cerca.length
          ? `No se distingue del azar con ${int(t.queries)} consultas: ${cerca.map(nombre).join(", ")}. `
          : ""}
        {encima.length ? `Por encima del azar, mas alla del ruido: ${encima.map(nombre).join(", ")}. ` : ""}
        {!debajo.length && "Con estos datos, ningun metodo muestra que parecerse en zonas diga algo de la tarifa. "}
        {conSe
          ? "Criterio: la diferencia con el azar pasa de 2 errores estandar de la media de las consultas."
          : "Criterio: sin el error estandar de la task, solo cuenta un cociente por debajo de 0,8 o por encima de 1,2; con unas decenas de consultas, el cociente tiene un ruido del orden del 10 %."}
      </p>
    </>
  );
}
