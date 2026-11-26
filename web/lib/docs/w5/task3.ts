import type { TaskDoc } from "@/lib/tasks";
import type { W5Task3 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

type Fila = W5Task3["k_values"][number];

const ordenadas = (r: W5Task3): Fila[] => [...r.k_values].sort((a, b) => a.k - b.k);
const elegida = (r: W5Task3): Fila | undefined => r.k_values.find((f) => f.k === r.best_k);

const doc: TaskDoc<W5Task3> = {
  title: "El tamano del shingle se elige por cuanto separa a los grupos",
  topic: "SHINGLING",
  statement:
    "S21, k-shingles consecutivos: construir los conjuntos de shingles con k = 2, 3 y 4; reportar el tamano medio del conjunto, los shingles posibles contra los observados y la separacion de los grupos plantados (Jaccard medio dentro de un grupo contra entre grupos); elegir el mejor k.",
  standfirst:
    "Cada conductor se convierte en un conjunto de rachas de k zonas seguidas. Se prueba con k = 2, 3 y 4, y para cada uno se mira que tanto se parecen dos conductores del mismo grupo comparado con dos de grupos distintos. El mejor k es el que mas los separa.",
  lede: (r) => {
    const f = elegida(r);
    if (!f) return "";
    return `Con k = ${int(r.best_k)}, dos conductores del mismo grupo comparten en promedio ${fmt(
      f.jaccard_same_cluster,
      3
    )} de sus rachas (Jaccard), y dos de grupos distintos solo ${fmt(
      f.jaccard_other_cluster,
      3
    )}. Cada conductor tiene en promedio ${fmt(f.mean_set_size, 1)} rachas distintas, de ${int(
      f.possible_shingles
    )} posibles.`;
  },
  metrics: (r) => {
    const fs = ordenadas(r);
    const f = elegida(r);
    return [
      { label: "Mejor k", value: int(r.best_k), hint: "mayor diferencia dentro - entre" },
      ...fs.map((x) => ({
        label: `Diferencia con k = ${x.k}`,
        value: fmt(x.jaccard_same_cluster - x.jaccard_other_cluster, 3),
        hint: `${fmt(x.jaccard_same_cluster, 3)} dentro / ${fmt(x.jaccard_other_cluster, 3)} entre`,
      })),
      { label: "Pares comparados", value: `${int(r.pairs_same_cluster)} + ${int(r.pairs_other_cluster)}`, hint: "mismo grupo + grupos distintos" },
      { label: "Rachas por conductor", value: fmt(f?.mean_set_size, 1), hint: `con k = ${int(r.best_k)}` },
    ];
  },
  sections: [
    {
      h: "Que es un shingle",
      p: "Es un pedacito de k zonas seguidas en la lista de recogidas de un conductor. Si un conductor va de LAURELES a EL_POBLADO y luego a DOWNTOWN, con k = 2 sus shingles son (LAURELES, EL_POBLADO) y (EL_POBLADO, DOWNTOWN). Se guardan como conjunto: si una racha se repite, cuenta una sola vez.",
    },
    {
      h: "Como se comparan dos conductores",
      p: "Con Jaccard: el numero de rachas que tienen en comun dividido por el numero de rachas que tienen entre los dos. Da 1 si tienen exactamente las mismas rachas y 0 si no comparten ninguna.",
    },
    {
      h: "Posibles contra observados",
      p: "Con Z zonas hay Z^k rachas posibles. Con k = 2 son pocas y practicamente todas aparecen en todos los conductores, asi que todos se parecen. Con k = 4 las posibles se multiplican y cada conductor solo alcanza a usar una parte: sus rachas son mas propias.",
    },
    {
      h: "Separacion de los grupos",
      p: "Se sortean pares de conductores al azar y se separan en dos montones: los del mismo grupo plantado y los de grupos distintos. Se usan los mismos pares para k = 2, 3 y 4, asi la comparacion es justa. Un buen k da un Jaccard alto dentro del grupo y bajo entre grupos.",
    },
    {
      h: "Por que no el k mas grande",
      p: "Al subir k baja el parecido entre grupos, que es bueno, pero tambien baja el parecido dentro del grupo. Si los vecinos de verdad quedan con un Jaccard muy bajo, LSH necesita un umbral muy bajo para encontrarlos y devuelve demasiados candidatos. Por eso el criterio es la diferencia entre los dos promedios y no solo el cociente.",
    },
    {
      h: "Control",
      p: "Con k = 3 el tamano del conjunto de cada conductor se compara con el campo shingle_count del dataset, que se calculo aparte: deben coincidir.",
    },
  ],
  takeaway:
    "El k se elige mirando que tanto separa a los grupos: con rachas muy cortas todos se parecen y con rachas muy largas ni los del mismo grupo se parecen.",
};

export default doc;
