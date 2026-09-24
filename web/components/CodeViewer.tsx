"use client";

import { useEffect, useMemo, useState } from "react";
import { highlightPython } from "@/lib/highlight";

type PyFile = { path: string; note?: string; bytes: number; lines: number };

/** Muestra el codigo fuente tal cual esta en el repo.
 *
 * No es una copia para exhibir: son exactamente los mismos bytes que el worker
 * carga en Pyodide y ejecuta, servidos desde /py/ (que sync-python.mjs
 * sincroniza desde ../src en cada build).
 *
 * La lista de archivos sale de /py/manifest.json, no de una constante: cuales
 * existen depende de que tasks esten agregadas al repo, y una lista fija
 * mostraria pestanias que dan 404. */
export default function CodeViewer() {
  const [files, setFiles] = useState<PyFile[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/py/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m) => {
        if (cancelled) return;
        const fs: PyFile[] = m.files ?? [];
        setFiles(fs);
        setMissing(m.missing ?? []);
        setActive((a) => a ?? fs[0]?.path ?? null);
        // Sin archivos no hay segundo efecto que apague el spinner.
        if (!fs.length) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/py/${active}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        if (!cancelled) {
          setSource(t);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSource(`# No se pudo cargar ${active}: ${e.message}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const lines = useMemo(() => highlightPython(source), [source]);
  const meta = files.find((f) => f.path === active);
  const label = (p: string) => p.split("/").pop() ?? p;

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Codigo fuente</h2>
        <span className="panel-tag">EL MISMO QUE CORRE ARRIBA</span>
      </div>
      <p className="panel-desc">
        Estos archivos no son una copia para mostrar: son los bytes que el worker carga en Pyodide
        y ejecuta. El pipeline de la izquierda corre este codigo, sin puerto a JavaScript ni
        reimplementacion.
      </p>

      {missing.length > 0 && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Todavia no estan en el repo: {missing.map(label).join(", ")}. Sus paneles salen marcados
          como pendientes.
        </p>
      )}

      <div className="file-tabs">
        {files.map((f) => (
          <button
            key={f.path}
            className={`file-tab ${active === f.path ? "on" : ""}`}
            onClick={() => setActive(f.path)}
          >
            {label(f.path)}
          </button>
        ))}
      </div>

      <div className="code-wrap">
        <div className="code-bar">
          <span style={{ color: "var(--text)" }}>{active ?? "—"}</span>
          {meta?.note && <span>· {meta.note}</span>}
          <span style={{ marginLeft: "auto" }}>
            {loading ? "cargando..." : `${lines.length} lineas`}
          </span>
        </div>
        <pre className="code">
          {lines.map((toks, i) => (
            <span className="row" key={i}>
              <span className="ln">{i + 1}</span>
              {toks.map((t, j) =>
                t.cls ? (
                  <span key={j} className={t.cls}>
                    {t.text}
                  </span>
                ) : (
                  <span key={j}>{t.text}</span>
                )
              )}
            </span>
          ))}
        </pre>
      </div>
    </section>
  );
}
