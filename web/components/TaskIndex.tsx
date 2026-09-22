"use client";

/** Indice de tasks del dashboard: la puerta de entrada a cada pagina dedicada.
 *
 * Lista las cinco del enunciado (lib/workshops.ts), pero solo enlaza las que
 * tienen TaskDoc en lib/tasks.ts. Cual esta implementada no se declara en
 * ningun lado: es exactamente "tiene doc o no", asi que no hay forma de que
 * el indice diga una cosa y el repo tenga otra.
 *
 * Los titulos de las implementadas salen de lib/tasks.ts, asi que la tarjeta
 * promete exactamente lo que el usuario va a encontrar al hacer click. */

import Link from "next/link";
import { getTaskDocs } from "@/lib/tasks";
import { getWorkshop } from "@/lib/workshops";

export default function TaskIndex({ slug }: { slug: string }) {
  const docs = getTaskDocs(slug);
  const roadmap = getWorkshop(slug)?.tasks ?? [];
  if (!docs.length && !roadmap.length) return null;

  // Sin hoja de ruta se cae a las implementadas, que es el caso de un workshop
  // que ya este completo.
  const items = roadmap.length
    ? roadmap.map((t) => ({ n: t.n, fallback: t.title, blurb: t.blurb }))
    : docs.map((d) => ({ n: d.n, fallback: d.title, blurb: "" }));

  const hechas = docs.length;

  return (
    <section className="panel-box task-index">
      <div className="panel-head">
        <h2 className="panel-title">Las {items.length} tasks</h2>
        <span className="panel-tag">
          {hechas} DE {items.length} EN ESTE REPO
        </span>
      </div>
      <p className="panel-desc">
        Cada task implementada tiene su pagina con el enunciado, el metodo, el panel en vivo y la
        conclusion. Sirven de diapositivas: se navegan con las flechas y la tecla P las proyecta.
        Las que faltan muestran el enunciado hasta que alguien agregue su script.
      </p>
      <div className="task-cards">
        {items.map((t) => {
          const doc = docs.find((d) => d.n === t.n);
          if (!doc) {
            return (
              <div key={t.n} className="task-card pending" title={t.blurb}>
                <div className="n">Task {t.n}</div>
                <div className="t">{t.fallback}</div>
                <div className="k">PENDIENTE</div>
              </div>
            );
          }
          return (
            <Link key={t.n} href={`/w/${slug}/t/${doc.slug}/`} className="task-card">
              <div className="n">Task {doc.n}</div>
              <div className="t">{doc.title}</div>
              <div className="k">{doc.topic}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
