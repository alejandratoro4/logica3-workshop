"use client";

import { GroupedBars, Legend, fmt } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W1Task3 } from "@/lib/generated/contratos";

/** Task 3 — desbalance (carga del worker mas cargado / carga media) segun K,
 *  y las colisiones contra la cota C(n,2)/K, que es lo que pide el enunciado.
 *  El hash ingenuo es opcional: si la task no lo trae, el panel muestra la
 *  familia universal sola. */
export default function Task3({ data: t }: PanelProps<W1Task3>) {
  const Ks = t.universal.map((u) => u.K);
  const naive = t.naive ?? [];
  const hayIngenuo = naive.length === t.universal.length && naive.length > 0;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">
          {hayIngenuo ? "Hashing universal vs. hash ingenuo" : "Hashing universal"}
        </h2>
        <span className="panel-tag">TASK 3 · CARTER-WEGMAN</span>
      </div>
      <p className="panel-desc">
        Desbalance = carga del worker mas cargado dividida por la carga media; 1 seria un reparto
        perfecto. Con los conductores fijos, al crecer K cada worker recibe pocos y hasta un hash
        perfectamente aleatorio se aleja de 1 (es el problema de bolas en cajas): la comparacion que
        importa es universal contra ingenuo, no contra 1.
        {hayIngenuo
          ? " El hash ingenuo parece aceptable con pocos workers y se degrada al escalar, porque los driver_id comparten el prefijo drv_ y solo difieren en digitos."
          : " La familia universal garantiza Pr[h(x)=h(y)] <= 1/K sin suponer nada sobre como son las claves."}
      </p>

      <GroupedBars
        series={[
          { name: "Universal", color: "var(--green)", values: t.universal.map((u) => u.avg_desbalance) },
          ...(hayIngenuo
            ? [{ name: "Ingenuo", color: "var(--red)", values: naive.map((n) => n.desbalance) }]
            : []),
        ]}
        refLine={1}
        refLabel="reparto perfecto = 1"
        xLabel={`K workers: ${Ks.join(" · ")}`}
        height={190}
      />

      <Legend
        items={[
          { name: "Familia universal h(x)=((ax+b) mod p) mod K", color: "var(--green)" },
          ...(hayIngenuo ? [{ name: "Hash ingenuo", color: "var(--red)" }] : []),
        ]}
      />

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Colisiones (lo que pide el enunciado)</th>
              {Ks.map((k) => (
                <th key={k}>K={k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Medidas (universal)</td>
              {t.universal.map((u) => (
                <td key={u.K}>{fmt(u.avg_collisions_empirical, 0)}</td>
              ))}
            </tr>
            <tr>
              <td>Cota C(n,2)/K</td>
              {t.universal.map((u) => (
                <td key={u.K}>{fmt(u.theoretical_expected_collisions, 0)}</td>
              ))}
            </tr>
            {hayIngenuo && (
              <tr>
                <td>Medidas (ingenuo)</td>
                {naive.map((n) => (
                  <td key={n.K}>{fmt(n.collisions_empirical, 0)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
