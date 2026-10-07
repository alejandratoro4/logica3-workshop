"use client";

import { GroupedBars, Legend, fmt, int } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W3Task2 } from "@/lib/generated/contratos";

/** Task 2 del W3 — la distribucion estacionaria contra la participacion de
 *  cada zona en los viajes de la Unidad 1. */
export default function Task2({ data: t }: PanelProps<W3Task2>) {
  const total = t.zones.reduce((a, z) => a + z.ride_count, 0);
  const zonas = [...t.zones].sort((a, b) => b.pi - a.pi);
  const share = (z: (typeof zonas)[number]) => (total ? z.ride_count / total : 0);
  const sumaPi = t.zones.reduce((a, z) => a + z.pi, 0);
  const dif = zonas.map((z) => ({ zone: z.zone, d: z.pi - share(z) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const tv = 0.5 * dif.reduce((a, x) => a + Math.abs(x.d), 0);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Distribucion estacionaria contra volumen de viajes</h2>
        <span className="panel-tag">
          TASK 2 · π = πM · {t.method.toUpperCase()}
          {t.iterations !== undefined ? ` · ${int(t.iterations)} ITERACIONES` : ""}
        </span>
      </div>
      <p className="panel-desc">
        π_i es la fraccion de las recogidas de un conductor que caen en la zona i a largo plazo (la
        cadena salta de un viaje al siguiente, asi que cuenta pasos, no horas de reloj). La barra verde
        es la fraccion de los viajes de la Unidad 1 que salen de esa zona. Por como se arma el grafo
        quedan muy cerca: cada recogida en una zona es la llegada de una reubicacion y la salida de la
        siguiente. No son iguales porque el primer y el ultimo viaje de cada conductor solo tienen una
        de las dos.
      </p>

      <GroupedBars
        label="Distribucion estacionaria y participacion en los viajes, por zona"
        series={[
          { name: "π", color: "var(--blue)", values: zonas.map((z) => 100 * z.pi) },
          { name: "viajes", color: "var(--green)", values: zonas.map((z) => 100 * share(z)) },
        ]}
        xLabel={zonas.map((z) => z.zone.slice(0, 4)).join(" · ")}
        height={190}
      />
      <Legend
        items={[
          { name: "π estacionaria (%)", color: "var(--blue)" },
          { name: "Participacion en viajes de la Unidad 1 (%)", color: "var(--green)" },
        ]}
      />

      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        Distancia de variacion total entre las dos: <b>{fmt(tv, 4)}</b> (0 = identicas). La mayor
        diferencia es {dif[0]?.zone}: π {dif[0] && dif[0].d > 0 ? "supera" : "queda por debajo de"} su
        participacion por {fmt(Math.abs(100 * (dif[0]?.d ?? 0)), 2)} puntos.
        {Math.abs(sumaPi - 1) > 1e-3 && (
          <span style={{ color: "var(--amber)" }}> Ojo: π suma {fmt(sumaPi, 4)}, no 1.</span>
        )}
      </p>
    </section>
  );
}
