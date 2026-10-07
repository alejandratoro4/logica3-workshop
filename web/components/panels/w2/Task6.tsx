"use client";

import { useEffect, useState } from "react";
import { fmt, int } from "../../charts";
import { MeterBars, pct } from "../../charts-stream";
import type { PanelProps } from "@/lib/types";
import type { W2Task5, W2Task6 } from "@/lib/generated/contratos";
import { momentos } from "./Task5";

/** Panel C del W2 — medidor de surge en vivo por zona contra la cota de la
 *  Unidad 1, mas el resultado de F_k (Task 5) si ya esta.
 *
 *  "En vivo" es una repeticion: el dia guardado en replay se reproduce hora
 *  por hora, con el medidor de cada zona al cierre de esa hora. */
export default function Task6({ data: t, all }: PanelProps<W2Task6>) {
  const horas = t.replay.hours;
  const [i, setI] = useState(() => {
    // Arranca en la hora con mas zonas en surge: la que justifica el panel.
    let mejor = 0;
    horas.forEach((h, j) => {
      if (h.zones.filter((z) => z.surge).length > horas[mejor].zones.filter((z) => z.surge).length) mejor = j;
    });
    return mejor;
  });
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!play) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % Math.max(1, horas.length)), 1100);
    return () => window.clearInterval(id);
  }, [play, horas.length]);

  const h = horas[Math.min(i, horas.length - 1)];
  const o = t.overall;
  const k = t.k_sigma;
  const t5 = all.task5 as W2Task5 | undefined;
  const fk = t5 ? momentos(t5) : null;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel C — Medidor de surge en vivo por zona</h2>
        <span className="panel-tag">TASK 6 · COTA DE LA UNIDAD 1</span>
      </div>
      <p className="panel-desc">
        Durante cada hora se cuentan las solicitudes de cada zona. El umbral es el de la Unidad 1,{" "}
        <b>T = μ + {fmt(k, 1)}√μ</b>, con μ estimado de los dias ya vistos para esa zona y esa hora
        (una suma y un conteo de dias por zona y hora del dia, sin guardar el historico). El medidor
        es conteo / T: cruzar 1.0 es activar surge.
      </p>

      {h && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "6px 0 4px" }}>
            <button className="btn ghost" style={{ width: "auto" }} onClick={() => setPlay((v) => !v)}>
              {play ? "Pausa" : "Reproducir el dia"}
            </button>
            <input
              type="range"
              min={0}
              max={horas.length - 1}
              value={i}
              onChange={(e) => {
                setPlay(false);
                setI(Number(e.target.value));
              }}
              style={{ flex: 1, minWidth: 160 }}
              aria-label="Hora del dia"
            />
            <span className="mono" style={{ fontSize: 12 }}>
              {t.replay.date} · {String(h.hour).padStart(2, "0")}:00 ·{" "}
              {h.zones.filter((z) => z.surge).length} zonas en surge
            </span>
          </div>
          <MeterBars
            label="Medidor de surge por zona: conteo de la hora dividido por el umbral"
            rows={[...h.zones]
              .sort((a, b) => b.count / b.threshold - a.count / a.threshold)
              .map((z) => ({
                label: z.zone,
                value: z.threshold ? z.count / z.threshold : 0,
                color: z.surge ? "var(--red)" : "var(--blue)",
                note: z.surge
                  ? `${z.count} ≥ T=${fmt(z.threshold, 0)}${z.cross_minute !== undefined ? ` · cruzo min ${z.cross_minute}` : ""}`
                  : `${z.count} de T=${fmt(z.threshold, 0)} (μ=${fmt(z.mu, 0)})`,
              }))}
            refLabel="T (surge)"
          />
        </>
      )}

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Horas-zona con surge ({int(o.slots)} evaluadas en todo el stream)</th>
              <th>Frecuencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Observada en el stream</b> ({int(o.surged)} horas)
              </td>
              <td>
                <b>{pct(o.surge_rate)}</b>
              </td>
            </tr>
            <tr>
              <td>Cola exacta de Poisson(μ̂), referencia con μ estimado</td>
              <td>{pct(o.poisson_tail_mean)}</td>
            </tr>
            <tr>
              <td>Cota de Chernoff para Poisson</td>
              <td>{pct(o.chernoff_mean)}</td>
            </tr>
            <tr>
              <td>Cota de Cantelli (Chebyshev de una cola), 1 / (1 + k²)</td>
              <td>{pct(t.cantelli_bound)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 8 }}>
        {o.surge_rate <= o.chernoff_mean && o.surge_rate <= t.cantelli_bound
          ? "Lo observado queda por debajo de las dos cotas. Es coherente con el modelo, pero no lo valida: las cotas acotan una probabilidad y se calcularon con μ estimado como si fuera el verdadero. "
          : "Lo observado supera alguna cota: las cotas se calcularon con μ estimado como si fuera el verdadero, y con pocos dias ese μ̂ es ruidoso. "}
        {o.surge_rate > o.poisson_tail_mean
          ? "Tambien queda por encima de la cola de Poisson(μ̂): el ruido de μ̂ baja el umbral de vez en cuando."
          : "Queda por debajo de la cola de Poisson(μ̂), a una diferencia que el panel no somete a prueba: es un contraste descriptivo, no una prueba de ajuste."}
      </p>

      <h3 className="panel-sub">Resultado de F_k (Task 5)</h3>
      {fk && t5 ? (
        <p className="panel-desc" style={{ marginBottom: 0 }}>
          Concentracion F2 / (F1²/F0) = <b>{fmt(fk.concentracion, 3)}</b> (1 = demanda pareja). Zonas
          que aportan mas que su cuota a F2: <b>{fk.candidatas.join(", ") || "ninguna"}</b>. Su surge
          observado:{" "}
          {fk.candidatas
            .map((z) => {
              const s = t.by_zone.find((b) => b.zone === z);
              return s ? `${z} ${pct(s.surge_rate)}` : null;
            })
            .filter(Boolean)
            .join(" · ")}
          . F2 dice donde se concentra el volumen; el medidor dice cuando ese volumen se sale de lo
          esperado para la zona y la hora.
        </p>
      ) : (
        <p className="panel-desc" style={{ marginBottom: 0, color: "var(--amber)" }}>
          La Task 5 todavia no tiene resultados: aqui aparece F2 en cuanto los tenga.
        </p>
      )}
    </section>
  );
}
