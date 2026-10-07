"use client";

/** Primitivas de grafico del Workshop 3 (matrices y rankings), en el mismo
 *  estilo que charts.tsx: SVG a mano, sin librerias, con los tokens de color. */

import { fmt } from "./charts";

/** Un color fijo por zona, para que la misma zona se vea igual en todos los
 *  paneles. Se asigna por orden alfabetico, no por el orden de llegada. */
const PALETA = [
  "var(--blue)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
  "var(--violet)",
  "#2aa198",
  "#d33682",
  "#859900",
  "#cb4b16",
  "#6c71c4",
];

export function zoneColors(zones: string[]): Record<string, string> {
  const orden = [...zones].sort();
  return Object.fromEntries(orden.map((z, i) => [z, PALETA[i % PALETA.length]]));
}

const corta = (z: string) => (z.length > 10 ? z.slice(0, 9) + "…" : z);

/** Matriz como mapa de calor: la opacidad de cada celda es su valor sobre el
 *  maximo de la matriz. Con `diagonal` se marca la diagonal (los lazos). */
export function Heatmap({
  rows,
  cols,
  values,
  format = (v: number) => fmt(v, 2),
  label,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  format?: (v: number) => string;
  label?: string;
}) {
  const n = rows.length;
  const m = cols.length;
  if (!n || !m) return null;
  const cell = Math.min(52, Math.floor(600 / m));
  const pad = { t: 70, l: 96, r: 8, b: 8 };
  const W = pad.l + m * cell + pad.r;
  const H = pad.t + n * cell + pad.b;
  const max = Math.max(...values.flat().filter(Number.isFinite), 1e-12);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={label}>
      {cols.map((c, j) => (
        <text
          key={c}
          x={pad.l + j * cell + cell / 2}
          y={pad.t - 6}
          fontSize="10"
          fill="var(--text-dim)"
          transform={`rotate(-45 ${pad.l + j * cell + cell / 2} ${pad.t - 6})`}
        >
          {corta(c)}
        </text>
      ))}
      {rows.map((r, i) => (
        <g key={r}>
          <text x={pad.l - 6} y={pad.t + i * cell + cell / 2 + 3.5} textAnchor="end" fontSize="10" fill="var(--text-dim)">
            {corta(r)}
          </text>
          {cols.map((c, j) => {
            const v = values[i]?.[j] ?? 0;
            return (
              <g key={c}>
                <rect
                  x={pad.l + j * cell}
                  y={pad.t + i * cell}
                  width={cell - 1}
                  height={cell - 1}
                  fill="var(--blue)"
                  fillOpacity={0.08 + 0.92 * (v / max)}
                  stroke={i === j ? "var(--amber)" : "none"}
                  strokeWidth={i === j ? 1.2 : 0}
                >
                  <title>{`${r} → ${c}: ${format(v)}`}</title>
                </rect>
                {cell >= 40 && (
                  <text
                    x={pad.l + j * cell + cell / 2}
                    y={pad.t + i * cell + cell / 2 + 3.5}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={v / max > 0.55 ? "var(--bg)" : "var(--text)"}
                  >
                    {format(v)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** Dos rankings lado a lado unidos por lineas: a la izquierda el puesto en
 *  uno, a la derecha en el otro. Una linea que sube es una zona que gana
 *  puestos. `badge` agrega un texto a la derecha de cada zona (p. ej. el
 *  medidor de surge). */
export function SlopeChart({
  items,
  leftTitle,
  rightTitle,
  badge,
  label,
}: {
  items: { name: string; left: number; right: number; color: string }[];
  leftTitle: string;
  rightTitle: string;
  badge?: (name: string) => { text: string; color: string } | null;
  label?: string;
}) {
  const n = items.length;
  if (!n) return null;
  const rowH = 26;
  const pad = { t: 30, b: 10 };
  const W = 720;
  const xl = 150;
  const xr = 420;
  const H = pad.t + n * rowH + pad.b;
  const Y = (rank: number) => pad.t + (rank - 1) * rowH + rowH / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
      <text x={xl} y={16} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-dim)">
        {leftTitle}
      </text>
      <text x={xr} y={16} fontSize="11" fontWeight="600" fill="var(--text-dim)">
        {rightTitle}
      </text>
      {items.map((it) => {
        const sube = it.right < it.left;
        const baja = it.right > it.left;
        const b = badge?.(it.name) ?? null;
        return (
          <g key={it.name}>
            <line
              x1={xl + 8}
              x2={xr - 8}
              y1={Y(it.left)}
              y2={Y(it.right)}
              stroke={it.color}
              strokeWidth={sube || baja ? 2.2 : 1.2}
              strokeOpacity={sube || baja ? 0.95 : 0.45}
            />
            <circle cx={xl + 8} cy={Y(it.left)} r={3.5} fill={it.color} />
            <circle cx={xr - 8} cy={Y(it.right)} r={3.5} fill={it.color} />
            <text x={xl - 4} y={Y(it.left) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text)">
              {it.left}. {it.name}
            </text>
            <text x={xr + 4} y={Y(it.right) + 3.5} fontSize="10.5" fill="var(--text)">
              {it.right}. {it.name}
              {sube ? "  ▲" : baja ? "  ▼" : ""}
            </text>
            {b && (
              <text x={W - 8} y={Y(it.right) + 3.5} textAnchor="end" fontSize="10.5" fill={b.color}>
                {b.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
