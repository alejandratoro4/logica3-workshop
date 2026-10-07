"use client";

/** Primitivas de grafico para series largas (W2 y W3), en el mismo estilo que
 *  charts.tsx (SVG a mano, sin librerias, con los mismos tokens de color).
 *
 *  Van aparte porque las series del stream son largas (una hora por punto,
 *  336 horas) y LineChart rotula cada x. */

import { fmt, niceTicks } from "./charts";
import { pct } from "@/lib/format";

export { pct };

type Serie = {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  width?: number;
  /** Solo puntos, sin linea: para muestras sueltas. */
  dots?: boolean;
};

/** Serie temporal con eje x por indice y pocas etiquetas.
 *
 *  logY sirve cuando lo que se compara abarca ordenes de magnitud (tasas de
 *  falso positivo de 1e-6 a 1e-1): en escala lineal todo menos el primer punto
 *  quedaria pegado al cero. Los null cortan la linea en vez de inventar datos. */
export function TimeSeries({
  labels,
  series,
  height = 210,
  logY = false,
  yFormat = (v: number) => fmt(v, 2),
  yUnit,
  xTicks = 7,
  xFormat = (s: string) => s,
  refLines,
  yMin,
  label,
}: {
  /** Descripcion para lectores de pantalla (aria-label del SVG). */
  label?: string;
  labels: string[];
  series: Serie[];
  height?: number;
  logY?: boolean;
  yFormat?: (v: number) => string;
  yUnit?: string;
  xTicks?: number;
  xFormat?: (s: string) => string;
  refLines?: { value: number; label?: string; color?: string }[];
  /** Piso del eje en escala lineal; por defecto 0. */
  yMin?: number;
}) {
  const n = labels.length;
  if (!n) return null;
  const W = 720;
  const H = height;
  const pad = { t: 16, r: 14, b: 26, l: 54 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const vals = [
    ...series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v))),
    ...(refLines ?? []).map((r) => r.value),
  ];
  const X = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);

  let Y: (v: number) => number;
  let ticks: number[];
  if (logY) {
    const pos = vals.filter((v) => v > 0);
    const lo = Math.floor(Math.log10(pos.length ? Math.min(...pos) : 1e-3));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(pos.length ? Math.max(...pos) : 1)));
    ticks = [];
    for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
    Y = (v: number) => pad.t + ih - ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo)) * ih;
  } else {
    const floor = yMin ?? 0;
    const max = Math.max(...vals, floor + 1e-9);
    ticks = niceTicks(max - floor).map((x) => x + floor);
    const top = ticks[ticks.length - 1];
    Y = (v: number) => pad.t + ih - ((v - floor) / (top - floor || 1)) * ih;
  }

  const step = Math.max(1, Math.round((n - 1) / Math.max(1, xTicks - 1)));
  const xIdx: number[] = [];
  for (let i = 0; i < n; i += step) xIdx.push(i);

  const ok = (v: number | null): v is number => v !== null && Number.isFinite(v) && (!logY || v > 0);
  const path = (vs: (number | null)[]) => {
    let d = "";
    let pen = false;
    vs.forEach((v, i) => {
      if (!ok(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--grid)" />
          <text x={pad.l - 7} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {(refLines ?? []).map((r, i) => (
        <g key={`r${i}`}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={Y(r.value)}
            y2={Y(r.value)}
            stroke={r.color ?? "var(--amber)"}
            strokeWidth="1.4"
            strokeDasharray="5 4"
          />
          {r.label && (
            <text
              x={W - pad.r}
              y={Y(r.value) - 5}
              textAnchor="end"
              fontSize="10"
              fill={r.color ?? "var(--amber)"}
            >
              {r.label}
            </text>
          )}
        </g>
      ))}
      {series.map((s) =>
        s.dots ? (
          <g key={s.name}>
            {s.values.map((v, i) =>
              ok(v) ? <circle key={i} cx={X(i)} cy={Y(v)} r="1.8" fill={s.color} opacity="0.75" /> : null
            )}
          </g>
        ) : (
          <path
            key={s.name}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 1.8}
            strokeLinejoin="round"
            strokeDasharray={s.dashed ? "5 4" : undefined}
          />
        )
      )}
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--border)" />
      {xIdx.map((i) => (
        <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)">
          {xFormat(labels[i])}
        </text>
      ))}
      {yUnit && (
        <text x={pad.l - 7} y={pad.t - 5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
          {yUnit}
        </text>
      )}
    </svg>
  );
}

/** Barras horizontales con una linea de referencia: el medidor de surge.
 *  Cada barra es conteo / umbral; cruzar la linea de 1.0 es activar surge. */
export function MeterBars({
  rows,
  refValue = 1,
  refLabel = "umbral",
  valueFormat = (v: number) => fmt(v, 2),
  label,
}: {
  label?: string;
  rows: { label: string; value: number; color: string; note?: string }[];
  refValue?: number;
  refLabel?: string;
  valueFormat?: (v: number) => string;
}) {
  if (!rows.length) return null;
  const W = 720;
  const rowH = 22;
  const pad = { t: 18, r: 170, b: 6, l: 96 };
  const H = pad.t + rows.length * rowH + pad.b;
  const iw = W - pad.l - pad.r;
  const max = Math.max(refValue * 1.25, ...rows.map((r) => r.value));
  const X = (v: number) => pad.l + (v / max) * iw;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
      {rows.map((r, i) => {
        const y = pad.t + i * rowH;
        return (
          <g key={r.label}>
            <text x={pad.l - 8} y={y + 14} textAnchor="end" fontSize="10.5" fill="var(--text-dim)">
              {r.label}
            </text>
            <rect x={pad.l} y={y + 4} width={iw} height={rowH - 8} fill="var(--grid)" rx="2" />
            <rect
              x={pad.l}
              y={y + 4}
              width={Math.max(0, X(r.value) - pad.l)}
              height={rowH - 8}
              fill={r.color}
              rx="2"
            />
            <text x={X(r.value) + 6} y={y + 14} fontSize="10" fill="var(--text)">
              {valueFormat(r.value)}
            </text>
            {r.note && (
              <text x={W - 4} y={y + 14} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
                {r.note}
              </text>
            )}
          </g>
        );
      })}
      <line
        x1={X(refValue)}
        x2={X(refValue)}
        y1={pad.t - 4}
        y2={H - pad.b}
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <text x={X(refValue)} y={pad.t - 7} textAnchor="middle" fontSize="10" fill="var(--amber)">
        {refLabel}
      </text>
    </svg>
  );
}

/** Nube de puntos por grupo contra una linea de verdad: cada punto es una
 *  repeticion independiente. Muestra la dispersion del estimador, que es lo
 *  que el error estandar resume en un solo numero; la banda verde es +-1 SE. */
export function StripPlot({
  groups,
  truth,
  height = 180,
  color = "var(--blue)",
  yFormat = (v: number) => fmt(v, 0),
  label,
}: {
  label?: string;
  groups: { label: string; values: number[]; band?: number }[];
  truth: number;
  height?: number;
  color?: string;
  yFormat?: (v: number) => string;
}) {
  if (!groups.length) return null;
  const W = 720;
  const H = height;
  const pad = { t: 14, r: 14, b: 26, l: 62 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const all = [
    truth,
    ...groups.flatMap((g) => [...g.values, truth + (g.band ?? 0), truth - (g.band ?? 0)]),
  ];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const Y = (v: number) => pad.t + ih - ((v - (lo - span * 0.08)) / (span * 1.16)) * ih;
  const gw = iw / groups.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
      {[lo, hi].map((t, i) => (
        <text key={i} x={pad.l - 7} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">
          {yFormat(t)}
        </text>
      ))}
      {groups.map((g, gi) => {
        const cx = pad.l + gi * gw + gw / 2;
        return (
          <g key={g.label}>
            {g.band !== undefined && (
              <rect
                x={cx - gw * 0.3}
                y={Y(truth + g.band)}
                width={gw * 0.6}
                height={Math.max(0, Y(truth - g.band) - Y(truth + g.band))}
                fill="var(--green)"
                opacity="0.14"
              />
            )}
            {g.values.map((v, i) => (
              <circle
                key={i}
                // Cada repeticion en su propia x dentro de la columna: con un
                // desplazamiento ciclico (i % 10) las repeticiones i e i+10
                // compartian x y se tapaban si sus valores eran parecidos.
                cx={cx + (i - (g.values.length - 1) / 2) * ((gw * 0.5) / Math.max(1, g.values.length - 1))}
                cy={Y(v)}
                r="3"
                fill={color}
                opacity="0.7"
              />
            ))}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
              {g.label}
            </text>
          </g>
        );
      })}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={Y(truth)}
        y2={Y(truth)}
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <text x={pad.l - 7} y={Y(truth) + 3.5} textAnchor="end" fontSize="10" fill="var(--amber)">
        {yFormat(truth)}
      </text>
    </svg>
  );
}

/** "2026-09-03T17" -> "d2 17h" (dia relativo al inicio del stream). */
export function hourLabel(first: string) {
  const d0 = Date.parse(first.slice(0, 10));
  return (s: string) => {
    const d = Math.round((Date.parse(s.slice(0, 10)) - d0) / 86400000);
    return `d${d} ${s.slice(11, 13)}h`;
  };
}

/** Marca de un eje logaritmico en porcentaje: 10%, 1%, 0.1%, 0.01%, 1e-3%. */
export function pctLog(v: number) {
  const p = v * 100;
  if (p >= 1) return `${fmt(p, 0)}%`;
  if (p >= 0.001) return `${Number(p.toPrecision(1))}%`;
  return `${p.toExponential(0)}%`;
}

