"use client";

import { useEffect, useState } from "react";
import { toQuery } from "@/lib/params";
import { useWorkshop } from "./WorkshopProvider";
import ParamPanel from "./ParamPanel";
import RunConsole from "./RunConsole";
import CodeViewer from "./CodeViewer";
import SlideDeck from "./SlideDeck";
import DatasetView from "./DatasetView";
import TaskIndex from "./TaskIndex";
import { Dashboard } from "./PanelSlots";

type View = "dashboard" | "codigo" | "dataset";

export default function WorkshopView() {
  const { workshop, params, setParams, pipeline, ranParams, canonical, loadCanonical, claimed, claimRun } =
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

  const r = pipeline.results;
  const hasAny = Boolean(r && Object.keys(r).length);

  const share = () => {
    const url = `${location.origin}${location.pathname}?${toQuery(params)}`;
    navigator.clipboard?.writeText(url);
  };

  return (
    <>
      {presenting && r && (
        <SlideDeck results={r} params={ranParams} slug={slug} onClose={() => setPresenting(false)} />
      )}

      <div className="wrap layout">
        <aside className="side">
          <ParamPanel
            slug={slug}
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
                : "Precomputada a escala completa (~495k viajes). Carga al instante, sin esperar lo que tarda el pipeline a esa escala."}
            </p>
          </div>

          <div className="card">
            <h3>Presentacion</h3>
            <button
              className="btn"
              disabled={!hasAny}
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
            {workshop.note && (
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5, maxWidth: "76ch" }}>
                {workshop.note}
              </p>
            )}
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
              <Dashboard
                workshop={workshop}
                results={r ?? {}}
                errors={pipeline.errors}
                stages={pipeline.stages}
                running={pipeline.running || pipeline.booting}
              />
            </>
          )}

          {view === "codigo" && <CodeViewer slug={slug} />}
          {view === "dataset" && <DatasetView slug={slug} dataset={pipeline.dataset} params={ranParams} canonical={canonical} />}
        </main>
      </div>
    </>
  );
}
