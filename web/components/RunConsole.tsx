"use client";

import { useState } from "react";
import type { StageState } from "@/lib/types";

/** Estado del pipeline por etapa, con la salida de consola real de cada script
 *  (la misma que imprime en la terminal) desplegable al hacer clic. */
export default function RunConsole({
  stages,
  booting,
  statusMessage,
  pyodideVersion,
  error,
}: {
  stages: StageState[];
  booting: boolean;
  statusMessage: string;
  pyodideVersion: string | null;
  error: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const total = stages.reduce((a, s) => a + (s.seconds ?? 0), 0);

  return (
    <div className="card">
      <h3>Pipeline</h3>

      {booting && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 10px" }}>
          <span className="spinner" /> {statusMessage}
        </p>
      )}

      {stages.map((s) => (
        <div key={s.key}>
          <div
            className="stage"
            onClick={() => setOpen(open === s.key ? null : s.key)}
            style={{ cursor: s.output ? "pointer" : "default" }}
          >
            <span className={`dot ${s.status}`} />
            <span style={{ color: s.status === "pending" ? "var(--text-faint)" : "var(--text-dim)" }}>
              {s.label}
            </span>
            {s.seconds !== undefined && <span className="secs">{s.seconds.toFixed(1)}s</span>}
          </div>
          {open === s.key && s.output && (
            <pre
              style={{
                margin: "2px 0 8px 15px",
                padding: "8px 10px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 10.5,
                lineHeight: 1.5,
                maxHeight: 190,
                overflow: "auto",
                color: "var(--text-dim)",
                whiteSpace: "pre-wrap",
              }}
            >
              {s.output}
            </pre>
          )}
        </div>
      ))}

      {total > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "10px 0 0" }}>
          Total {total.toFixed(1)}s
          {pyodideVersion && ` · Pyodide ${pyodideVersion}`}
        </p>
      )}

      {error && (
        <pre
          style={{
            marginTop: 10,
            padding: "8px 10px",
            background: "rgba(229,72,77,.08)",
            border: "1px solid var(--red)",
            borderRadius: 6,
            fontSize: 10.5,
            color: "var(--red)",
            whiteSpace: "pre-wrap",
            maxHeight: 170,
            overflow: "auto",
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
}
