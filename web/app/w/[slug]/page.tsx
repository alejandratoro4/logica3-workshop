import WorkshopView from "@/components/WorkshopView";

/** El slug, las tabs y el provider los resuelve layout.tsx; aca solo queda la
 *  vista. Las rutas estaticas por workshop tambien las genera el layout. */
export default function WorkshopPage() {
  return <WorkshopView />;
}
