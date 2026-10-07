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
      {/* key: al cambiar de workshop el provider se monta de cero, con su propio
          worker y sin la corrida del otro. Sin el, la corrida del W1 se veria en
          el W2 y `claimed` impediria la corrida automatica del W2. Navegar entre
          las paginas de un mismo workshop no cambia el slug y no reinicia nada. */}
      <WorkshopProvider key={slug} workshop={workshop}>
        {children}
      </WorkshopProvider>
    </>
  );
}
