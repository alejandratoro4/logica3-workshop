"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { poissonSample } from "@/lib/poisson";
import type { PanelProps } from "@/lib/types";
import type { W1Task5 } from "@/lib/generated/contratos";
import { DistributionChart, fmt } from "../../charts";

type ZoneState = { count: number; ticks: number; over: number };

/** Panel C — medidor de surge en vivo por zona.
 *
 * Simula llegadas Poisson(mu) en la hora pico de cada zona y contrasta el
 * conteo actual contra el umbral mu + k*sigma. Debajo de cada barra van las dos
 * cotas y la frecuencia que la propia simulacion acumula: esa frecuencia tiene
 * que quedarse por debajo de ambas cotas, que es la afirmacion entera de la
 * Task 5 vuelta observable. */
export default function Task5({ data }: PanelProps<W1Task5>) {
  // Se aplana model_based una sola vez por corrida: `zones` es dependencia de
  // los callbacks del medidor, y un arreglo nuevo en cada render los reiniciaria.
  const zones = useMemo(
    () =>
      data.zones.map((z) => ({
        zone: z.zone,
        peak_hour: z.peak_hour,
        mu: z.mu,
        sigma: z.sigma_model_sqrt_mu,
        sigma_hat: z.sigma_hat,
        daily_counts: z.daily_counts_observed ?? [],
        ...z.model_based,
        threshold: z.model_based.surge_threshold,
      })),
    [data.zones]
  );
  // Zona que se dibuja en detalle. Por defecto la de mayor demanda, que es la
  // que hace mas evidente el punto; el resto queda a un clic.
  const porDemanda = [...zones].sort((a, b) => b.mu - a.mu);
  const [zonaSel, setZonaSel] = useState<string | null>(null);
  const zona = zones.find((z) => z.zone === zonaSel) ?? porDemanda[0] ?? null;

  const [live, setLive] = useState(true);
  const [state, setState] = useState<Record<string, ZoneState>>({});
  const timer = useRef<number | null>(null);

  const reset = useCallback(() => {
    const next: Record<string, ZoneState> = {};
    for (const z of zones) next[z.zone] = { count: 0, ticks: 0, over: 0 };
    setState(next);
  }, [zones]);

  const tick = useCallback(() => {
    setState((prev) => {
      const next: Record<string, ZoneState> = {};
      for (const z of zones) {
        const s = prev[z.zone] ?? { count: 0, ticks: 0, over: 0 };
        const v = poissonSample(z.mu);
        next[z.zone] = {
          count: v,
          ticks: s.ticks + 1,
          over: s.over + (v >= z.threshold ? 1 : 0),
        };
      }
      return next;
    });
  }, [zones]);

  // Al cambiar los parametros de ciudad cambian las zonas y los umbrales:
  // la frecuencia acumulada de la corrida anterior ya no significa nada.
  useEffect(() => {
    reset();
    tick();
  }, [reset, tick]);

  useEffect(() => {
    if (!live) return;
    timer.current = window.setInterval(tick, 1400);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [live, tick]);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel C — Medidor de surge en vivo por zona</h2>
        <span className="panel-tag">TASK 5 · CANTELLI / CHERNOFF</span>
      </div>
      <p className="panel-desc">
        Llegadas Poisson(mu) simuladas en la hora de mayor demanda de cada zona. La marca ambar es
        el umbral de surge mu + {fmt(data.k_sigma, 1)}sigma. Bajo cada barra estan las dos cotas
        para P(X ≥ umbral), la probabilidad bajo el modelo estimada por Monte Carlo, y la frecuencia
        que la simulacion va observando. Las cotas acotan una probabilidad: con muchas muestras la
        frecuencia se acerca a ella, pero con pocas puede pasar una cota sin contradecirla.
      </p>

      {zona && (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {porDemanda.map((z) => (
              <button
                key={z.zone}
                className={`file-tab ${z.zone === zona.zone ? "on" : ""}`}
                onClick={() => setZonaSel(z.zone)}
              >
                {z.zone}
              </button>
            ))}
          </div>

          <DistributionChart
            mu={zona.mu}
            threshold={zona.threshold}
            observed={zona.daily_counts}
          />

          <p className="panel-desc" style={{ marginTop: 10 }}>
            Distribucion de las solicitudes que llegan a <b>{zona.zone}</b> en su hora de mayor
            demanda, con mu = {fmt(zona.mu, 1)}. En rojo, la cola que queda a la derecha del
            umbral: eso es lo que las cotas acotan.
            {zona.daily_counts && zona.daily_counts.length > 0 && (
              <>
                {" "}
                Los puntos bajo el eje son los {zona.daily_counts.length} dias realmente
                observados.
              </>
            )}
          </p>

          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>P(X ≥ umbral) en {zona.zone}</th>
                  <th>Valor</th>
                  <th>Que supone</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cantelli (Chebyshev unilateral)</td>
                  <td>{fmt(zona.chebyshev_bound, 4)}</td>
                  <td className="muted">solo media y varianza</td>
                </tr>
                <tr>
                  <td>Chernoff</td>
                  <td>{fmt(zona.chernoff_bound, 4)}</td>
                  <td className="muted">el modelo Poisson completo</td>
                </tr>
                <tr>
                  <td>Monte Carlo</td>
                  <td style={{ color: "var(--green)" }}>{fmt(zona.monte_carlo_prob, 4)}</td>
                  <td className="muted">estimacion de la probabilidad bajo el modelo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="panel-desc" style={{ marginTop: 8, marginBottom: 0 }}>
            Las tres miden la misma area roja. La de Cantelli es la version unilateral de Chebyshev,
            la que corresponde a un evento de una sola cola como X ≥ umbral: 1/(1+k²) en vez del 1/k²
            de la Chebyshev bilateral del notebook (con k = 2, 0.20 contra 0.25). Permite mucho mas de
            lo que pasa porque solo usa media y varianza: con el umbral en mu + k·sigma sale identica en
            todas las zonas. Una cota dice que la probabilidad no es mayor que eso; no predice cuanto
            vale, ni garantiza que la frecuencia de una muestra finita quede siempre debajo.
          </p>
        </div>
      )}

      <div
        className="panel-head"
        style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 10 }}
      >
        <h2 className="panel-title" style={{ fontSize: 14 }}>
          Medidor en vivo
        </h2>
        <span className="panel-tag">SIMULACION POISSON(mu)</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn ghost" style={{ width: "auto" }} onClick={() => setLive((v) => !v)}>
          {live ? "Pausar simulacion" : "Reanudar simulacion"}
        </button>
        <button className="btn ghost" style={{ width: "auto" }} onClick={reset}>
          Reiniciar conteo
        </button>
        <span
          className="mono"
          style={{
            alignSelf: "center",
            fontSize: 11,
            color: live ? "var(--green)" : "var(--text-faint)",
          }}
        >
          {live ? "● EN VIVO" : "PAUSADO"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 11 }}>
        {zones.map((z) => {
          const s = state[z.zone] ?? { count: 0, ticks: 0, over: 0 };
          const scaleMax = z.threshold * 1.35;
          const pct = Math.min(100, (s.count / scaleMax) * 100);
          const surging = s.count >= z.threshold;
          const near = !surging && s.count >= z.threshold * 0.93;
          const color = surging ? "var(--red)" : near ? "var(--amber)" : "var(--blue)";
          const observed = s.ticks ? s.over / s.ticks : 0;

          return (
            <div key={z.zone}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {z.zone} <span className="muted">· {z.peak_hour}:00</span>
                </span>
                <span className="mono">
                  <b style={{ color }}>{s.count}</b>
                  <span className="muted"> / {z.threshold}</span>
                </span>
              </div>

              <div
                style={{
                  position: "relative",
                  height: 22,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: color,
                    transition: "width .45s ease, background .3s ease",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${(z.threshold / scaleMax) * 100}%`,
                    width: 2,
                    background: "var(--amber)",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                  marginTop: 4,
                  fontFamily: "var(--mono)",
                }}
              >
                <span>mu={fmt(z.mu, 1)}</span>
                <span>sigma={fmt(z.sigma, 2)}</span>
                <span>Cantelli ≤ {fmt(z.chebyshev_bound, 3)}</span>
                <span>Chernoff ≤ {fmt(z.chernoff_bound, 3)}</span>
                <span>real {fmt(z.monte_carlo_prob, 4)}</span>
                <span
                  style={{
                    color: observed > z.chernoff_bound ? "var(--amber)" : "var(--green)",
                  }}
                >
                  obs. {observed.toFixed(3)} ({s.ticks})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
