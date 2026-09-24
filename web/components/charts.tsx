"use client";

/** Primitivas de grafico en SVG. Sin librerias ni CDN, igual que el dashboard
 *  original: son pocos tipos de grafico y el control total sobre el trazo vale
 *  mas que la dependencia. */

/** fmt vive en lib/format.ts: lo comparten los graficos y lib/tasks.ts.
 *  Se importa Y se reexporta: los ejes de aca lo usan, y los imports que ya
 *  apuntaban a "../charts" siguen funcionando sin tocarlos. */
import { fmt, int } from "@/lib/format";
import { lgamma } from "@/lib/poisson";
export { fmt, int };

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

type Pad = { t: number; r: number; b: number; l: number };
const PAD: Pad = { t: 14, r: 14, b: 26, l: 42 };

/** Barras agrupadas: varias series comparten cada categoria del eje X. */
export function GroupedBars({
  series,
  height = 210,
  refLine,
  refLabel,
  refLines,
  xLabel,
}: {
  series: { name: string; color: string; values: number[] }[];
  height?: number;
  refLine?: number;
  refLabel?: string;
  /** Varias lineas de referencia (p.ej. la cota teorica de cada estrategia).
   *  Se suma a refLine/refLabel, que se conservan por los llamados existentes. */
  refLines?: { value: number; label?: string; color?: string }[];
  xLabel?: string;
}) {
  const n = series[0]?.values.length ?? 0;
  if (!n) return null;

  const W = 720;
  const H = height;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const allRefs = [
    ...(refLine !== undefined ? [{ value: refLine, label: refLabel, color: "var(--amber)" }] : []),
    ...(refLines ?? []),
  ];
  const max = Math.max(1, ...series.flatMap((s) => s.values), ...allRefs.map((r) => r.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.t + ih - (v / top) * ih;

  const groupW = iw / n;
  const barW = Math.max(1.5, (groupW - 3) / series.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
          <text x={PAD.l - 7} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">
            {fmt(t, 0)}
          </text>
        </g>
      ))}

      {series.map((s, si) =>
        s.values.map((v, i) => (
          <rect
            key={`${s.name}-${i}`}
            x={PAD.l + i * groupW + 1.5 + si * barW}
            y={y(v)}
            width={barW}
            height={Math.max(0, PAD.t + ih - y(v))}
            fill={s.color}
            rx="1.5"
          />
        ))
      )}

      {allRefs.map((r, i) => (
        <g key={`ref-${i}`}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(r.value)}
            y2={y(r.value)}
            stroke={r.color ?? "var(--amber)"}
            strokeWidth="1.4"
            strokeDasharray="5 4"
          />
          {r.label && (
            <text
              x={W - PAD.r}
              y={y(r.value) - 5}
              textAnchor="end"
              fontSize="10"
              fill={r.color ?? "var(--amber)"}
            >
              {r.label}
            </text>
          )}
        </g>
      ))}

      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke="var(--border)" />
      {xLabel && (
        <text x={PAD.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
          {xLabel}
        </text>
      )}
    </svg>
  );
}

/** Lineas con marcadores. logX sirve para los benchmarks, donde los tamanos
 *  de entrada crecen por ordenes de magnitud. */
export function LineChart({
  xs,
  series,
  height = 200,
  logX = false,
  yUnit = "s",
  xLabel = "n",
}: {
  xs: number[];
  series: { name: string; color: string; values: number[] }[];
  height?: number;
  logX?: boolean;
  yUnit?: string;
  xLabel?: string;
}) {
  if (!xs.length) return null;

  const W = 720;
  const H = height;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const tx = (v: number) => (logX ? Math.log10(Math.max(1, v)) : v);
  const xMin = tx(Math.min(...xs));
  const xMax = tx(Math.max(...xs));
  const xSpan = xMax - xMin || 1;
  const X = (v: number) => PAD.l + ((tx(v) - xMin) / xSpan) * iw;

  const max = Math.max(...series.flatMap((s) => s.values), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const Y = (v: number) => PAD.t + ih - (v / top) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--grid)" />
          <text x={PAD.l - 7} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">
            {t < 0.01 && t > 0 ? t.toExponential(0) : fmt(t, 2)}
          </text>
        </g>
      ))}

      {series.map((s) => (
        <g key={s.name}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${X(xs[i])},${Y(v)}`).join(" ")}
          />
          {s.values.map((v, i) => (
            <circle key={i} cx={X(xs[i])} cy={Y(v)} r="2.8" fill={s.color} />
          ))}
        </g>
      ))}

      {xs.map((x, i) => (
        <text
          key={i}
          x={X(x)}
          y={H - 8}
          textAnchor="middle"
          fontSize="9.5"
          fill="var(--text-faint)"
        >
          {x >= 1000 ? `${Math.round(x / 1000)}k` : x}
        </text>
      ))}

      <text x={PAD.l - 7} y={PAD.t - 4} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        {yUnit}
      </text>
      <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        {xLabel}
      </text>
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.name}>
          <i style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/** Distribucion de X con el umbral de surge y la cola sombreada.
 *
 * Es el grafico que vuelve evidente de que habla la Task 5. El medidor en vivo
 * cumple el enunciado al pie de la letra, pero la probabilidad real ronda unas
 * centesimas: hacen falta decenas de ticks para que la frecuencia observada
 * insinue algo. Aqui se ve de un golpe la forma completa de la demanda, donde
 * cae el umbral, y que la cola a su derecha es minuscula al lado de lo que las
 * cotas permiten. Las cotas dejan de ser numeros sueltos y pasan a ser areas. */
export function DistributionChart({
  mu,
  threshold,
  observed,
  height = 240,
}: {
  mu: number;
  threshold: number;
  /** Conteos reales, si la task los reporta. Se dibujan como puntos bajo el eje. */
  observed?: number[];
  height?: number;
}) {
  if (!(mu > 0) || !(threshold > 0)) return null;

  const sigma = Math.sqrt(mu);
  const lo = Math.max(0, Math.floor(mu - 4.2 * sigma));
  const hi = Math.ceil(Math.max(mu + 4.6 * sigma, threshold + 1.5 * sigma));

  const ks: number[] = [];
  for (let k = lo; k <= hi; k++) ks.push(k);
  // pmf en logaritmos: con mu de cientos, mu^k y k! desbordan en coma flotante.
  const pmf = ks.map((k) => Math.exp(-mu + k * Math.log(mu) - lgamma(k + 1)));
  const colaReal = ks.reduce((acc, k, i) => (k >= threshold ? acc + pmf[i] : acc), 0);

  const W = 720;
  const H = height;
  const pad = { t: 18, r: 14, b: 48, l: 46 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxP = Math.max(...pmf, Number.MIN_VALUE);
  const X = (k: number) => pad.l + ((k - lo) / Math.max(1, hi - lo)) * iw;
  const Y = (p: number) => pad.t + ih - (p / maxP) * ih;
  const bw = Math.max(1, iw / ks.length - 0.4);

  const marcas = Array.from(
    new Set([lo, Math.round(mu), Math.round(threshold), hi])
  ).sort((a, b) => a - b);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Distribucion de solicitudes por hora con el umbral de surge y su cola"
    >
      {ks.map((k, i) => (
        <rect
          key={k}
          x={X(k)}
          y={Y(pmf[i])}
          width={bw}
          height={Math.max(0, pad.t + ih - Y(pmf[i]))}
          fill={k >= threshold ? "var(--red)" : "var(--blue)"}
          opacity={k >= threshold ? 0.95 : 0.5}
        />
      ))}

      <line
        x1={X(threshold)}
        x2={X(threshold)}
        y1={pad.t}
        y2={pad.t + ih}
        stroke="var(--amber)"
        strokeWidth="1.6"
        strokeDasharray="5 4"
      />
      <text x={X(threshold)} y={pad.t - 5} textAnchor="middle" fontSize="10" fill="var(--amber)">
        umbral {fmt(threshold, 0)}
      </text>
      <text x={X(threshold) + 7} y={pad.t + 13} fontSize="10" fill="var(--red)">
        cola real {colaReal < 0.001 ? colaReal.toExponential(1) : fmt(colaReal, 4)}
      </text>

      {observed?.map((v, i) => (
        <circle
          key={`obs-${i}`}
          cx={X(v)}
          cy={pad.t + ih + 11}
          r="3"
          fill={v >= threshold ? "var(--red)" : "var(--text-dim)"}
        />
      ))}

      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--border)" />
      {marcas.map((k) => (
        <text
          key={`m-${k}`}
          x={X(k)}
          y={H - 20}
          textAnchor="middle"
          fontSize="9.5"
          fill="var(--text-faint)"
        >
          {fmt(k, 0)}
        </text>
      ))}
      <text x={pad.l - 7} y={pad.t - 5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        P(X=k)
      </text>
      <text x={W - pad.r} y={H - 5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
        solicitudes en la hora pico
      </text>
    </svg>
  );
}
