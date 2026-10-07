"use client";

import { fmt } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W1Task1 } from "@/lib/generated/contratos";

/** Task 1 — los indicadores de escala: solicitudes por segundo en el pico y
 *  almacenamiento, hoy y con crecimiento 10x. */
export default function Task1({ data: t }: PanelProps<W1Task1>) {
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
    </div>
  );
}
