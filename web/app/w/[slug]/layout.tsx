import { notFound } from "next/navigation";
import WorkshopTabs from "@/components/WorkshopTabs";
import WorkshopProvider from "@/components/WorkshopProvider";
import { WORKSHOPS, getWorkshop } from "@/lib/workshops";

export function generateStaticParams() {
  return WORKSHOPS.map((w) => ({ slug: w.slug }));
}

/** Envuelve el dashboard Y las paginas de task del mismo workshop.
 *
 * Al quedar el provider aca, navegar entre /w/1 y /w/1/t/3 conserva el worker
 * de Pyodide y la corrida en curso: la pagina de la task muestra los mismos
 * numeros que el dashboard, sin recomputar nada. */
export default async function WorkshopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workshop = getWorkshop(slug);
  if (!workshop) notFound();

  return (
    <>
      <WorkshopTabs active={slug} />
      <WorkshopProvider workshop={workshop}>{children}</WorkshopProvider>
    </>
  );
}
