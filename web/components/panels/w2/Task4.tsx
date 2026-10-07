"use client";

import { GroupedBars, Legend, fmt, int } from "../../charts";
import { TimeSeries, hourLabel } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W2Task4 } from "@/lib/generated/contratos";
import Requisitos from "../../Requisitos";

/** Panel B del W2 — conteo de distintos estimado por Flajolet-Martin contra
 *  el verdadero, a lo largo del stream y al final. */
export default function Task4({ data: t }: PanelProps<W2Task4>) {
  const running = t.running ?? [];
  const labels = running.map((r) => r.timestamp);
  const fx = hourLabel(labels[0] ?? "");
  const errPct = t.true_distinct ? (100 * (t.estimate - t.true_distinct)) / t.true_distinct : NaN;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel B — Pasajeros distintos: estimado contra verdadero</h2>
        <span className="panel-tag">TASK 4 · FLAJOLET-MARTIN · {int(t.n_hashes)} HASH</span>
      </div>
      <p className="panel-desc">
        Cada funcion hash guarda solo R, la cola de ceros mas larga que ha visto; su estimacion es 2^R.
        Una sola es muy ruidosa (salta en potencias de 2), por eso se combinan {int(t.n_hashes)}
        {t.combine ? ` con ${t.combine}` : ""}. La memoria es un entero por funcion, contra un
        conjunto con cada pasajero para el conteo exacto.
      </p>

      <Requisitos items={[{ ok: t.n_hashes >= 10, texto: `10 o mas funciones hash (usa ${t.n_hashes})` }]} />

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Distintos (exacto)</div>
          <div className="value">{int(t.true_distinct)}</div>
          <div className="delta">guardando todos los rider_id</div>
        </div>
        <div className="kpi">
          <div className="label">Estimado</div>
          <div className="value">{int(t.estimate)}</div>
          <div className="delta">{int(t.n_hashes)} enteros de memoria</div>
        </div>
        <div className="kpi">
          <div className="label">Error</div>
          <div className="value" style={{ color: Math.abs(errPct) > 50 ? "var(--amber)" : undefined }}>
            {errPct > 0 ? "+" : ""}
            {fmt(errPct, 1)}%
          </div>
          <div className="delta">al final del stream</div>
        </div>
      </div>

      {running.length > 0 && (
        <>
          <TimeSeries
            label="Pasajeros distintos vistos, verdaderos y estimados"
            labels={labels}
            xFormat={fx}
            yFormat={(v) => int(v)}
            series={[
              { name: "verdadero", color: "var(--green)", values: running.map((r) => r.true_distinct) },
              { name: "estimado", color: "var(--blue)", values: running.map((r) => r.estimate) },
            ]}
          />
          <Legend
            items={[
              { name: "Verdadero (conteo exacto)", color: "var(--green)" },
              { name: "Estimado (Flajolet-Martin)", color: "var(--blue)" },
            ]}
          />
        </>
      )}

      {t.per_hash && t.per_hash.length > 0 && (
        <>
          <h3 className="panel-sub">La estimacion 2^R de cada funcion hash</h3>
          <GroupedBars
            label="Estimacion de cada funcion hash contra el verdadero"
            series={[{ name: "2^R", color: "var(--blue)", values: t.per_hash }]}
            refLine={t.true_distinct}
            refLabel={`verdadero ${int(t.true_distinct)}`}
            xLabel={`${t.per_hash.length} funciones hash`}
            height={170}
          />
        </>
      )}
    </section>
  );
}
