import { notFound } from "next/navigation";
import TaskView from "@/components/TaskView";
import { getTaskDocs } from "@/lib/tasks";
import { WORKSHOPS, getWorkshop } from "@/lib/workshops";

/** Una ruta estatica por (workshop, task) documentada. Se devuelve el producto
 *  completo en vez de solo el segmento hijo para que el export estatico no
 *  dependa de como se resuelvan los params del layout padre. */
export function generateStaticParams() {
  return WORKSHOPS.flatMap((w) => getTaskDocs(w.slug).map((t) => ({ slug: w.slug, task: t.slug })));
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ slug: string; task: string }>;
}) {
  const { slug, task } = await params;
  const workshop = getWorkshop(slug);
  const docs = getTaskDocs(slug);
  const i = docs.findIndex((d) => d.slug === task);
  if (!workshop || i < 0) notFound();

  return <TaskView slug={slug} index={i} />;
}
