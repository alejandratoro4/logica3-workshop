"use client";

import { useEffect, useMemo, useState } from "react";
import { highlightPython } from "@/lib/highlight";
import { CONTRACT_TASKS } from "@/lib/generated/contratos";

type PyFile = { path: string; ws?: string; kind: string; task?: number; bytes: number; lines: number };

/** Muestra el codigo fuente tal cual esta en el repo.
 *
 * No es una copia para exhibir: son exactamente los mismos bytes que el worker
 * carga en Pyodide y ejecuta, servidos desde /py/ (que sync-python.mjs
 * sincroniza desde ../src en cada build).
 *
 * La lista de archivos sale de /py/manifest.json, no de una constante: cuales
 * existen depende de que tasks esten agregadas al repo, y una lista fija
 * mostraria pestanias que dan 404. Se muestran los del workshop: sus datasets
 * (los de los anteriores incluidos, porque corren antes) y sus tasks. El
 * contrato y el validador son infraestructura del repo, no parte de lo que
 * se presenta, asi que no salen aqui. */
export default function CodeViewer({ slug }: { slug: string }) {
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
        const n = Number(slug);
        const fs: PyFile[] = (m.files ?? []).filter((f: PyFile) =>
          f.kind === "dataset" ? Number(f.ws) <= n : f.kind === "task" && f.ws === slug
        );
        const orden = (f: PyFile) => (f.kind === "dataset" ? Number(f.ws) : 100 + (f.task ?? 0));
        fs.sort((a, b) => orden(a) - orden(b));
        setFiles(fs);
        // Tasks del enunciado sin script: las del contrato que no estan.
        const tasks = Object.keys(m.workshops?.[slug]?.tasks ?? {}).map(Number);
        setMissing(
          (CONTRACT_TASKS[slug] ?? []).filter((k) => !tasks.includes(k)).map((k) => `task${k}`)
        );
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
  }, [slug]);

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

  const esPython = active?.endsWith(".py") ?? true;
  const lines = useMemo(
    () => (esPython ? highlightPython(source) : source.split("\n").map((t) => [{ text: t, cls: null }])),
    [source, esPython]
  );
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
          Todavia sin script: {missing.join(", ")}. Sus paneles salen marcados como pendientes.
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
          {meta?.kind === "dataset" && <span>· dataset del Workshop {meta.ws}</span>}
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
