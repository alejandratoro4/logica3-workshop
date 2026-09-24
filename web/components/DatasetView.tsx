"use client";

import type { DatasetPreview } from "@/lib/types";
import { type CityParams, toEnv } from "@/lib/params";

/** Muestra el dataset que acaba de generarse en el FS virtual de Pyodide,
 *  junto a las variables de entorno equivalentes para reproducirlo en la
 *  terminal. Es el puente entre la app y el proyecto tal como se entrega. */
export default function DatasetView({
  dataset,
  params,
}: {
  dataset: DatasetPreview | null;
  params: CityParams;
}) {
  const env = toEnv(params);
  const envLine = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

  return (
    <>
      <section className="panel-box">
        <div className="panel-head">
          <h2 className="panel-title">Dataset generado</h2>
          <span className="panel-tag">data/rides.csv</span>
        </div>
        <p className="panel-desc">
          Generado en memoria por data_generator.py dentro de Pyodide. El CSV nunca viaja por la
          red: el mismo navegador lo produce y las cinco tasks lo leen del sistema de archivos
          virtual.
        </p>

        {!dataset ? (
          <div className="empty">Aun no se ha generado el dataset.</div>
        ) : (
          <>
            <div className="kpi-row">
              <div className="kpi">
                <div className="label">Filas</div>
                <div className="value">{dataset.total.toLocaleString("es-CO")}</div>
              </div>
              <div className="kpi">
                <div className="label">Tamano en memoria</div>
                <div className="value">{(dataset.bytes / (1024 * 1024)).toFixed(1)} MB</div>
              </div>
              <div className="kpi">
                <div className="label">Zonas</div>
                <div className="value">{params.zones.length}</div>
              </div>
              <div className="kpi">
                <div className="label">Semilla</div>
                <div className="value">{params.seed}</div>
              </div>
            </div>

            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    {Object.keys(dataset.rows[0] ?? {}).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataset.rows.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel-box">
        <div className="panel-head">
          <h2 className="panel-title">Reproducir en la terminal</h2>
          <span className="panel-tag">MISMOS BYTES</span>
        </div>
        <p className="panel-desc">
          El generador es determinista: con la misma semilla y los mismos parametros produce el
          CSV identico byte a byte. Estas variables reproducen esta ciudad exacta en local.
        </p>
        <div className="code-wrap">
          <div className="code-bar">
            <span style={{ color: "var(--text)" }}>bash</span>
          </div>
          <pre className="code" style={{ padding: "13px 16px" }}>
            <span className="row">
              <span className="tok-com"># desde la raiz del repo</span>
            </span>
            <span className="row">
              {envLine.split(" ").map((kv, i) => (
                <span key={i}>
                  <span className="tok-dec">{kv.split("=")[0]}</span>
                  <span>=</span>
                  <span className="tok-num">{kv.split("=")[1]}</span>{" "}
                </span>
              ))}
              <span className="tok-kw">python</span>
              <span> run_all.py</span>
            </span>
          </pre>
        </div>
      </section>
    </>
  );
}
