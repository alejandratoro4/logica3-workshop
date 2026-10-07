"use client";

import { GroupedBars, Legend, fmt, int } from "../../charts";
import { TimeSeries } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W3Task4 } from "@/lib/generated/contratos";
import Requisitos from "../../Requisitos";

/** Task 4 del W3 — visitas de la caminata contra π_i = d_i / (2|E|). */
export default function Task4({ data: t }: PanelProps<W3Task4>) {
  const zonas = t.zones;
  const tv = 0.5 * zonas.reduce((a, z) => a + Math.abs(z.pi_empirical - z.pi_theory), 0);
  const sumaD = zonas.reduce((a, z) => a + z.degree, 0);
  const conv = t.convergence ?? [];
  const uniforme = zonas.every((z) => Math.abs(z.pi_theory - zonas[0].pi_theory) < 1e-9);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Caminata aleatoria sobre el grafo simetrizado</h2>
        <span className="panel-tag">
          TASK 4 · {int(t.steps)} PASOS · |E| = {int(t.n_edges)}
        </span>
      </div>
      <p className="panel-desc">
        En un grafo no dirigido la caminata pasa en cada zona una fraccion del tiempo proporcional a su
        grado: π_i = d_i / (2|E|). Las barras comparan esa prediccion con la fraccion de pasos que la
        caminata paso en cada zona.
      </p>

      <Requisitos items={[{ ok: t.steps >= 50000, texto: `50.000 pasos o mas (dio ${int(t.steps)})` }]} />

      <GroupedBars
        label="Fraccion teorica y empirica de visitas por zona"
        series={[
          { name: "d_i / 2|E|", color: "var(--amber)", values: zonas.map((z) => 100 * z.pi_theory) },
          { name: "visitas", color: "var(--blue)", values: zonas.map((z) => 100 * z.pi_empirical) },
        ]}
        xLabel={zonas.map((z) => z.zone.slice(0, 4)).join(" · ")}
        height={180}
      />
      <Legend
        items={[
          { name: "π teorica d_i / 2|E| (%)", color: "var(--amber)" },
          { name: "Visitas / pasos (%)", color: "var(--blue)" },
        ]}
      />

      {conv.length > 1 && (
        <>
          <h3 className="panel-sub">Distancia entre lo empirico y lo teorico a medida que camina</h3>
          <TimeSeries
            label="Distancia de variacion total contra numero de pasos"
            labels={conv.map((c) => String(c.step))}
            xFormat={(s) => int(Number(s))}
            yFormat={(v) => fmt(v, 3)}
            series={[{ name: "TV", color: "var(--violet)", values: conv.map((c) => c.tv_distance) }]}
            height={160}
          />
        </>
      )}

      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        Distancia de variacion total al final: <b>{fmt(tv, 4)}</b> (0 = identicas). No llega a 0
        porque la frecuencia de visitas se estima con un numero finito de pasos: su error se achica
        como 1/√pasos, con una constante mayor que con muestras independientes porque cada paso
        depende del anterior.
        {Math.abs(sumaD - 2 * t.n_edges) > 1e-6 && (
          <span style={{ color: "var(--amber)" }}>
            {" "}
            Ojo: la suma de grados es {fmt(sumaD, 0)} y 2|E| es {fmt(2 * t.n_edges, 0)}; deberian coincidir.
          </span>
        )}
        {uniforme &&
          " Todas las zonas tienen el mismo grado: la π teorica es uniforme, porque al simetrizar cada zona queda conectada con todas las demas."}
      </p>
    </section>
  );
}
