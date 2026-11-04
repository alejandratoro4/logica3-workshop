"use client";

import { Legend, LineChart } from "../../charts";
import type { W4Task5 } from "@/lib/generated/contratos";

/** Graficos que comparten el panel de la Task 5 y el Panel E (Task 6). No es
 *  un panel: sync-python solo registra los TaskK.tsx. */

const COLORES = ["var(--blue)", "var(--green)", "var(--violet)", "var(--amber)"];

/** Speedup (o eficiencia) contra workers, una linea por escala, con la ideal. */
export function Escalamiento({ t, medida }: { t: W4Task5; medida: "speedup" | "efficiency" }) {
  const workers = Array.from(new Set(t.runs.map((r) => r.workers))).sort((a, b) => a - b);
  const escalas = Array.from(new Set(t.runs.map((r) => r.scale))).sort((a, b) => a - b);
  const valor = (s: number, p: number) => t.runs.find((r) => r.scale === s && r.workers === p)?.[medida] ?? 0;
  const series = escalas.map((s, i) => ({
    name: `${s}x`,
    color: COLORES[i % COLORES.length],
    values: workers.map((p) => valor(s, p)),
  }));
  const ideal = {
    name: "ideal",
    color: "var(--text-faint)",
    values: workers.map((p) => (medida === "speedup" ? p : 1)),
  };
  return (
    <>
      {/* Sin xLabel: LineChart lo pinta en la esquina del ultimo tick y lo
          tapa. El eje se nombra en la leyenda. */}
      <LineChart
        xs={workers}
        xLabel=""
        yUnit={medida === "speedup" ? "S_P" : "E_P"}
        height={180}
        series={[ideal, ...series]}
      />
      <Legend
        items={[
          { name: "eje x: workers (P)", color: "transparent" },
          ...series.map((s) => ({ name: `datos ${s.name}`, color: s.color })),
          { name: medida === "speedup" ? "ideal (S_P = P)" : "ideal (E_P = 1)", color: ideal.color },
        ]}
      />
    </>
  );
}
