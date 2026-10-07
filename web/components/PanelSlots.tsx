"use client";

/** Los paneles de un workshop, sacados del registro: uno por task.
 *
 * No hay un dashboard escrito a mano por workshop. El panel de la task K es
 * components/panels/wN/TaskK.tsx y recibe el JSON de la task tal como lo
 * escribio (recortado a su contrato). Si no hay datos, se muestra el hueco
 * con el motivo: no es lo mismo "nadie ha subido el script" que "corrio pero
 * su JSON no cumple el contrato" o "esta corriendo". */

import Link from "next/link";
import { getTaskDocs } from "@/lib/tasks";
import { PANELS, SCRIPTS } from "@/lib/generated/registro";
import type { ResultErrors, Results, StageState } from "@/lib/types";
import type { Workshop } from "@/lib/workshops";

/** Encabezado que lleva del panel a la pagina de su task. Es el puente entre
 *  el dashboard (todo junto, para explorar) y la explicacion (una a la vez). */
export function TaskLink({ slug, n }: { slug: string; n: number }) {
  const doc = getTaskDocs(slug).find((d) => d.n === n);
  if (!doc) return null;
  return (
    <Link href={`/w/${slug}/t/${doc.slug}/`} className="task-jump">
      Task {doc.n} — {doc.title} <span>→</span>
    </Link>
  );
}

/** El panel de una task con datos, o null. */
export function TaskPanel({ slug, n, results }: { slug: string; n: number; results: Results }) {
  const Panel = PANELS[slug]?.[n];
  const data = results[`task${n}`];
  if (!Panel || data === undefined) return null;
  return <Panel data={data} all={results} />;
}

/** Hueco de un panel sin datos, diciendo por que. */
export function PendingPanel({
  slug,
  n,
  title,
  error,
  stage,
  running,
}: {
  slug: string;
  n: number;
  title: string;
  /** Si el pipeline esta corriendo: una etapa "pending" solo espera turno si hay corrida. */
  running: boolean;
  /** El JSON existe pero no cumple el contrato. */
  error?: string;
  /** La etapa de la task en el pipeline, si el script esta en el repo. */
  stage?: StageState;
}) {
  const script = SCRIPTS[slug]?.[n];
  const corriendo = stage?.status === "running" || (stage?.status === "pending" && running);
  const fallo = stage?.status === "error";
  const estado = error || fallo ? "SIN DATOS" : corriendo ? "CORRIENDO" : "PENDIENTE";

  return (
    <section className="panel-pending">
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        <span className="panel-tag">
          TASK {n} · {estado}
        </span>
      </div>
      <div className="hint">
        {error ? (
          <>
            <span style={{ color: "var(--amber)" }}>
              results/w{slug}/task{n}.json no cumple el contrato: {error}
            </span>
            <span>
              Las claves que lee este panel estan en <code>contratos/w{slug}.md</code>, seccion Task {n}.
              Se revisa con <code>python dashboard/contrato.py w{slug} {n}</code>.
            </span>
          </>
        ) : fallo ? (
          <>
            <span style={{ color: "var(--amber)" }}>{script} fallo al correr.</span>
            <span>El error esta en la consola del pipeline, a la izquierda.</span>
          </>
        ) : corriendo ? (
          <span>
            <span className="spinner" /> {script} todavia no termina.
          </span>
        ) : script ? (
          <span>
            {script} esta en el repo pero no ha corrido. Dale a &quot;Correr pipeline&quot;.
          </span>
        ) : (
          <>
            <span>
              Falta <code>{`src/w${slug}/task${n}_<tema>.py`}</code> en el repo.
            </span>
            <span>
              Lo que debe escribir esta en <code>contratos/w{slug}.md</code>; al agregarlo, el panel se
              llena solo.
            </span>
          </>
        )}
      </div>
    </section>
  );
}

/** Todos los paneles del workshop, en el orden de `workshop.order`. */
export function Dashboard({
  workshop,
  results,
  errors,
  stages,
  running,
}: {
  workshop: Workshop;
  results: Results;
  errors: ResultErrors;
  stages: StageState[];
  running: boolean;
}) {
  const slug = workshop.slug;
  const orden = workshop.order ?? workshop.tasks.map((t) => t.n);
  return (
    <>
      {orden.map((n) => {
        const t = workshop.tasks.find((x) => x.n === n);
        const panel = <TaskPanel slug={slug} n={n} results={results} />;
        if (results[`task${n}`] !== undefined && PANELS[slug]?.[n]) {
          return (
            <div key={n}>
              <TaskLink slug={slug} n={n} />
              {panel}
            </div>
          );
        }
        return (
          <PendingPanel
            key={n}
            slug={slug}
            n={n}
            title={`Task ${n} — ${t?.title ?? ""}`}
            error={errors[`task${n}`]}
            stage={stages.find((s) => s.key === `task${n}`)}
            running={running}
          />
        );
      })}
    </>
  );
}
