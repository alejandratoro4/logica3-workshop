"use client";

import { useEffect, useMemo, useState } from "react";
import { highlightPython } from "@/lib/highlight";

/** Un solo archivo de /py/, resaltado, para el modo presentacion.
 *
 * Son los mismos bytes que muestra CodeViewer y que ejecuta el worker; aca
 * sin pestanias, porque la diapositiva ya sabe cual es su script. */
export default function CodeBlock({ path }: { path: string }) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/py/${path}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        if (!cancelled) setSource(t);
      })
      .catch((e) => {
        if (!cancelled) setSource(`# No se pudo cargar ${path}: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const lines = useMemo(() => highlightPython(source), [source]);

  return (
    <div className="code-wrap">
      <div className="code-bar">
        <span style={{ color: "var(--text)" }}>{path}</span>
        <span style={{ marginLeft: "auto" }}>{loading ? "cargando..." : `${lines.length} lineas`}</span>
      </div>
      <pre className="code" style={{ maxHeight: "62vh" }}>
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
  );
}
