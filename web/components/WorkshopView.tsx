"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toQuery } from "@/lib/params";
import { getTaskDocs } from "@/lib/tasks";
import type { StageKey } from "@/lib/types";
import { useWorkshop } from "./WorkshopProvider";
import ParamPanel from "./ParamPanel";
import RunConsole from "./RunConsole";
import CodeViewer from "./CodeViewer";
import SlideDeck from "./SlideDeck";
import DatasetView from "./DatasetView";
import TaskIndex from "./TaskIndex";
import PanelA from "./panels/PanelA";
import PanelB from "./panels/PanelB";
import PanelC from "./panels/PanelC";
import { KpiRow, Task3Panel } from "./panels/Kpis";

type View = "dashboard" | "codigo" | "dataset";

/** Encabezado que lleva del panel a la pagina de su task. Es el puente entre
 *  el dashboard (todo junto, para explorar) y la explicacion (una a la vez). */
function TaskLink({ slug, task }: { slug: string; task: string }) {
  const doc = getTaskDocs(slug).find((d) => d.slug === task);
  if (!doc) return null;
  return (
    <Link href={`/w/${slug}/t/${doc.slug}/`} className="task-jump">
      Task {doc.n} — {doc.title} <span>→</span>
    </Link>
  );
}

/** Hueco de un panel cuya task todavia no esta en el repo.
 *
 * Se muestra el espacio que le corresponde en vez de omitirlo en silencio: asi
 * el dashboard refleja el alcance completo del enunciado y dice exactamente
 * que falta, en lugar de parecer que el panel no existe. */
function PendingPanel({
  title,
  tag,
  script,
  error,
}: {
  title: string;
  tag: string;
  script: string;
  /** Si la task SI corrio pero su JSON no sirvio, se dice eso en vez de
   *  "falta el script": son dos problemas distintos y se arreglan distinto. */
  error?: string;
}) {
  return (
    <section className="panel-pending">
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        <span className="panel-tag">
          {tag} · {error ? "SIN DATOS" : "PENDIENTE"}
        </span>
      </div>
      <div className="hint">
        {error ? (
          <>
            <span style={{ color: "var(--amber)" }}>{error}</span>
            <span>
              Las claves que este panel necesita las define la funcion build_* correspondiente en{" "}
              <code>dashboard/build_dashboard.py</code>.
            </span>
          </>
        ) : (
          <>
            <span>
              Falta <code>{script}</code> en el repo.
            </span>
            <span>Al agregarlo, el panel se llena solo en la proxima corrida.</span>
          </>
        )}
      </div>
    </section>
  );
}

export default function WorkshopView() {
  const { workshop, params, setParams, pipeline, canonical, loadCanonical, claimed, claimRun } =
    useWorkshop();
  const [view, setView] = useState<View>("dashboard");
  const [presenting, setPresenting] = useState(false);
  const slug = workshop.slug;

  // Primera corrida automatica en cuanto el runtime esta listo: que el
  // dashboard tenga algo que mostrar sin que haya que pedirlo. `claimed` evita
  // pisar los datos que una pagina de task ya haya cargado.
  useEffect(() => {
    if (workshop.status === "ready" && pipeline.ready && !claimed) {
      claimRun();
      pipeline.run(params);
    }
  }, [workshop.status, pipeline, params, claimed, claimRun]);

  if (workshop.status === "planned") {
    return (
      <div className="wrap" style={{ paddingTop: 38, paddingBottom: 80, maxWidth: 900 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--amber)", marginBottom: 8 }}>
          PENDIENTE
        </div>
        <h1 style={{ fontSize: 23, margin: "0 0 7px", lineHeight: 1.25 }}>{workshop.title}</h1>
        <p className="muted" style={{ marginTop: 0, fontSize: 14, maxWidth: "72ch" }}>
          {workshop.subtitle}
        </p>

        {workshop.tasks && (
          <div style={{ marginTop: 26 }}>
            {workshop.tasks.map((t) => (
              <div className="panel-box" key={t.n} style={{ marginBottom: 10 }}>
                <div className="panel-head" style={{ marginBottom: 6 }}>
                  <h2 className="panel-title" style={{ fontSize: 14 }}>
                    Task {t.n} — {t.title}
                  </h2>
                </div>
                <p className="panel-desc" style={{ margin: 0 }}>
                  {t.blurb}
                </p>
              </div>
            ))}
          </div>
        )}

        {workshop.note && (
          <div className="empty" style={{ marginTop: 18, textAlign: "left" }}>
            {workshop.note}
          </div>
        )}
      </div>
    );
  }

  const p = pipeline.panels;
  const hasAny = Boolean(p && Object.keys(p).length);

  // El worker publica las etapas que pudo montar (ver public/pyodide-worker.js).
  // Si una task no esta entre ellas, no es que vaya lenta: no esta en el repo.
  // Solo se puede afirmar eso una vez el runtime arranco y las reporto.
  const conScript = new Set(pipeline.stages.map((st) => st.key));
  const falta = (k: StageKey) => pipeline.ready && !conScript.has(k);
  // Un panel tambien queda vacio si su task corrio pero su JSON no trae lo que
  // el build_* indexa; el worker lo reporta aparte (ver read_results).
  const errores = pipeline.panelErrors ?? {};

  const share = () => {
    const url = `${location.origin}${location.pathname}?${toQuery(params)}`;
    navigator.clipboard?.writeText(url);
  };

  return (
    <>
      {presenting && p && (
        <SlideDeck panels={p} params={params} slug={slug} onClose={() => setPresenting(false)} />
      )}

      <div className="wrap layout">
        <aside className="side">
          <ParamPanel
            params={params}
            onChange={setParams}
            onRun={() => {
              claimRun();
              pipeline.run(params);
            }}
            running={pipeline.running}
            ready={pipeline.ready}
          />
          <RunConsole
            stages={pipeline.stages}
            booting={pipeline.booting}
            statusMessage={pipeline.statusMessage}
            pyodideVersion={pipeline.pyodideVersion}
            error={pipeline.error}
          />
          <div className="card">
            <h3>Corrida del informe</h3>
            <button className="btn ghost" onClick={loadCanonical}>
              Cargar escala completa
            </button>
            <p className="estimate" style={{ marginTop: 9 }}>
              {canonical
                ? canonical
                : "Precomputada a 495k viajes. Carga al instante, sin esperar los ~2 min que tarda el pipeline a esa escala."}
            </p>
          </div>

          <div className="card">
            <h3>Presentacion</h3>
            <button
              className="btn"
              disabled={!p}
              onClick={() => setPresenting(true)}
              style={{ marginBottom: 8 }}
            >
              Modo diapositivas
            </button>
            <button className="btn ghost" onClick={share}>
              Copiar link de esta ciudad
            </button>
            <p className="estimate" style={{ marginTop: 9 }}>
              El link lleva los parametros: quien lo abra regenera exactamente este dataset.
            </p>
          </div>
        </aside>

        <main>
          <header style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 23, margin: "0 0 5px", lineHeight: 1.2 }}>{workshop.title}</h1>
            <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: "76ch" }}>
              {workshop.subtitle}
            </p>
          </header>

          <div className="file-tabs" style={{ marginBottom: 16 }}>
            {(
              [
                ["dashboard", "Dashboard"],
                ["codigo", "Codigo"],
                ["dataset", "Dataset"],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                className={`file-tab ${view === k ? "on" : ""}`}
                onClick={() => setView(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "dashboard" && (
            <>
              <TaskIndex slug={slug} />

              {!hasAny && (
                <div className="empty">
                  {pipeline.booting || pipeline.running ? (
                    <>
                      <span className="spinner" /> Corriendo el pipeline de Python en el navegador...
                      <br />
                      <span style={{ fontSize: 12 }}>
                        Los paneles aparecen a medida que cada task termina.
                      </span>
                    </>
                  ) : (
                    "Ajusta los parametros de ciudad y corre el pipeline."
                  )}
                </div>
              )}
              {p?.kpis ? (
                <>
                  <TaskLink slug={slug} task="1" />
                  <KpiRow data={p.kpis} />
                </>
              ) : (
                // El KpiRow se arma con task1 Y task3: si falta cualquiera de
                // las dos no hay panel, asi que el hueco tiene que nombrar la
                // que realmente falte, no siempre la task 1.
                (falta("task1") || falta("task3") || errores.kpis) && (
                  <PendingPanel
                    error={errores.kpis}
                    title="Indicadores — solicitudes/seg y almacenamiento"
                    tag="TASK 1 + TASK 3"
                    script={[
                      falta("task1") ? "src/task1_bigdata.py" : null,
                      falta("task3") ? "src/task3_hashing.py" : null,
                    ]
                      .filter(Boolean)
                      .join(" y ")}
                  />
                )
              )}
              {p?.panelC ? (
                <>
                  <TaskLink slug={slug} task="5" />
                  <PanelC data={p.panelC} />
                </>
              ) : (
                (falta("task5") || errores.panelC) && (
                  <PendingPanel
                    error={errores.panelC}
                    title="Panel C — Medidor de surge en vivo por zona"
                    tag="TASK 5 · CHEBYSHEV / CHERNOFF"
                    script="src/task5_probability.py"
                  />
                )
              )}
              {p?.panelA ? (
                <>
                  <TaskLink slug={slug} task="4" />
                  <PanelA data={p.panelA} />
                </>
              ) : (
                (falta("task4") || errores.panelA) && (
                  <PendingPanel
                    error={errores.panelA}
                    title="Panel A — Carga de buckets"
                    tag="TASK 4"
                    script="src/task4_hashtable.py"
                  />
                )
              )}
              {p?.kpis ? (
                <>
                  <TaskLink slug={slug} task="3" />
                  <Task3Panel data={p.kpis} />
                </>
              ) : (
                (falta("task3") || errores.kpis) && (
                  <PendingPanel
                    error={errores.kpis}
                    title="Hashing universal vs. hash ingenuo"
                    tag="TASK 3 · CARTER-WEGMAN"
                    script="src/task3_hashing.py"
                  />
                )
              )}
              {p?.panelB ? (
                <>
                  <TaskLink slug={slug} task="2" />
                  <PanelB data={p.panelB} />
                </>
              ) : falta("task2") || errores.panelB ? (
                <PendingPanel
                  error={errores.panelB}
                  title="Panel B — Tiempo de ejecucion"
                  tag="TASK 2"
                  script="src/task2_randomized.py"
                />
              ) : (
                hasAny && (
                  <div className="empty" style={{ padding: "26px 20px" }}>
                    <span className="spinner" /> Panel B — el benchmark de QuickSort es la etapa mas
                    larga del pipeline y llega al final.
                  </div>
                )
              )}
            </>
          )}

          {view === "codigo" && <CodeViewer />}
          {view === "dataset" && <DatasetView dataset={pipeline.dataset} params={params} />}
        </main>
      </div>
    </>
  );
}
