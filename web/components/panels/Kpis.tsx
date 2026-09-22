"use client";

import { GroupedBars, Legend, fmt } from "../charts";
import type { Kpis as KpisData } from "@/lib/types";

export function KpiRow({ data }: { data: KpisData }) {
  const t = data.task1;
  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="label">Solicitudes/seg en hora pico</div>
        <div className="value">{fmt(t.peak_req_per_sec, 3)}</div>
        <div className="delta">{fmt(t.peak_req_per_sec_10x, 2)} con crecimiento 10x</div>
      </div>
      <div className="kpi">
        <div className="label">Almacenamiento del log por ano</div>
        <div className="value">{fmt(t.storage_year_gb, 2)} GB</div>
        <div className="delta">{fmt(t.storage_year_10x_gb, 1)} GB con 10x</div>
      </div>
      <div className="kpi">
        <div className="label">Viajes en el dataset</div>
        <div className="value">{t.total_requests.toLocaleString("es-CO")}</div>
        <div className="delta">{t.n_days} dias simulados</div>
      </div>
      <Task3Kpi data={data.task3} />
    </div>
  );
}

/** Cuarta tarjeta: si la Task 3 trajo baseline ingenuo se muestra el
 *  desbalance; si no (el enunciado no lo pide), se muestran las colisiones,
 *  que es lo que si pide. Y si no vino ninguno de los dos, el load factor. */
function Task3Kpi({ data }: { data: KpisData["task3"] }) {
  const last = data.K_values.length - 1;
  const K = data.K_values[last];
  const ingenuo = data.naive_load_factor;
  const col = data.universal_collisions;
  const teo = data.theoretical_collisions;

  if (ingenuo.length > last && last >= 0) {
    return (
      <div className="kpi">
        <div className="label">Desbalance del hash ingenuo</div>
        <div className="value">{fmt(ingenuo[last], 2)}x</div>
        <div className="delta">
          universal {fmt(data.universal_load_factor[last], 2)}x con K={K}
        </div>
      </div>
    );
  }
  if (col && teo && col.length > last && teo.length > last && last >= 0) {
    return (
      <div className="kpi">
        <div className="label">Colisiones con K={K}</div>
        <div className="value sm">{fmt(col[last], 0)}</div>
        <div className="delta">cota C(n,2)/K = {fmt(teo[last], 0)}</div>
      </div>
    );
  }
  return (
    <div className="kpi">
      <div className="label">Load factor universal (K={K})</div>
      <div className="value">{fmt(data.universal_load_factor[last], 2)}x</div>
      <div className="delta">el ideal es 1,0</div>
    </div>
  );
}

/** Task 3 — load factor (carga del worker mas cargado / carga media) segun K.
 *  El punto no es que el hash ingenuo sea malo, sino que no se nota hasta que
 *  se escala: con K=8 parece aceptable y con K=64 colapsa. */
export function Task3Panel({ data }: { data: KpisData }) {
  const t = data.task3;
  // El baseline ingenuo fue una decision nuestra, no del enunciado: si la task
  // no lo trae, el panel muestra la familia universal sola en vez de romperse.
  const hayIngenuo = t.naive_load_factor.length === t.universal_load_factor.length
    && t.naive_load_factor.length > 0;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">
          {hayIngenuo ? "Hashing universal vs. hash ingenuo" : "Hashing universal"}
        </h2>
        <span className="panel-tag">TASK 3 · CARTER-WEGMAN</span>
      </div>
      <p className="panel-desc">
        Load factor = carga del worker mas cargado dividida por la carga media. El ideal es 1.
        {hayIngenuo
          ? " El hash ingenuo (suma de codigos de caracteres) parece aceptable con pocos workers y se degrada al escalar, porque los driver_id comparten el prefijo drv_ y solo difieren en digitos."
          : " La familia universal garantiza Pr[h(x)=h(y)] <= 1/K sin suponer nada sobre como son las claves."}
      </p>

      <GroupedBars
        series={[
          { name: "Universal", color: "var(--green)", values: t.universal_load_factor },
          ...(hayIngenuo
            ? [{ name: "Ingenuo", color: "var(--red)", values: t.naive_load_factor }]
            : []),
        ]}
        refLine={1}
        refLabel="ideal = 1"
        xLabel={`K workers: ${t.K_values.join(" · ")}`}
        height={190}
      />

      <Legend
        items={[
          { name: "Familia universal h(x)=((ax+b) mod p) mod K", color: "var(--green)" },
          ...(hayIngenuo
            ? [{ name: "Hash ingenuo (suma de caracteres)", color: "var(--red)" }]
            : []),
        ]}
      />

      {t.universal_collisions && t.theoretical_collisions && (
        <div className="scroll-x" style={{ marginTop: 14 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Colisiones (lo que pide el enunciado)</th>
                {t.K_values.map((k) => (
                  <th key={k}>K={k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Medidas</td>
                {t.universal_collisions.map((c, i) => (
                  <td key={i}>{fmt(c, 0)}</td>
                ))}
              </tr>
              <tr>
                <td>Cota C(n,2)/K</td>
                {t.theoretical_collisions.map((c, i) => (
                  <td key={i}>{fmt(c, 0)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
