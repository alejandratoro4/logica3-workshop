import type { TaskDoc } from "@/lib/tasks";
import type { W5Task3 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

type R = W5Task3;

const mejor = (r: R) => r.k_values.find((k) => k.k === r.best_k);

const doc: TaskDoc<R> = {
  title: "El largo del shingle decide cuanto se separan los grupos",
  topic: "S21 · SHINGLING",
  statement:
    "Construir los conjuntos de k-shingles consecutivos de cada conductor con k = 2, 3 y 4; reportar el tamano medio del conjunto, los shingles posibles contra los observados y la separacion de los grupos plantados (Jaccard medio dentro de un grupo contra entre grupos); elegir el mejor k.",
  standfirst:
    "Un shingle es una racha de k zonas seguidas en la secuencia de viajes de un conductor. Con k corto todos comparten las mismas rachas; con k largo cada conductor se vuelve unico. El mejor k es el que mas separa a los conductores del mismo grupo de los demas.",
  lede: (r) => {
    const b = mejor(r);
    return (
      `Con ${int(r.pairs_same_cluster)} pares del mismo grupo y ${int(r.pairs_other_cluster)} de grupos distintos, ` +
      `el mejor k es ${int(r.best_k)}: Jaccard ${fmt(b?.jaccard_same_cluster, 3)} dentro contra ` +
      `${fmt(b?.jaccard_other_cluster, 3)} entre grupos, con ${fmt(b?.mean_set_size, 1)} shingles por conductor.`
    );
  },
  metrics: (r) => {
    const b = mejor(r);
    return [
      { label: "Mejor k", value: int(r.best_k) },
      { label: "Jaccard dentro del grupo", value: fmt(b?.jaccard_same_cluster, 3) },
      { label: "Jaccard entre grupos", value: fmt(b?.jaccard_other_cluster, 3) },
      {
        label: "Shingles observados",
        value: `${int(b?.observed_shingles)} de ${int(b?.possible_shingles)}`,
      },
    ];
  },
  sections: [
    {
      h: "Paso 1 — De secuencia a conjunto",
      p: "La secuencia de zonas de cada conductor se recorre con una ventana de k zonas; cada ventana es un shingle y el conductor queda representado por el conjunto de shingles distintos que tiene. Con Z zonas hay Z^k shingles posibles.",
    },
    {
      h: "Paso 2 — Posibles contra observados",
      p: "Con k pequeno aparecen todos los shingles posibles, asi que todos los conductores tienen casi el mismo conjunto. Al crecer k, el numero posible explota y el conjunto de cada conductor ocupa una fraccion cada vez menor: los conjuntos se vuelven mas propios de cada uno.",
    },
    {
      h: "Paso 3 — Separacion de los grupos plantados",
      p: "Se sortean pares de conductores del mismo grupo y de grupos distintos y se mide su Jaccard medio. Lo que importa para LSH es la diferencia: si los vecinos verdaderos quedan con un Jaccard muy bajo, hace falta un umbral bajo y aparecen demasiados candidatos.",
    },
    {
      h: "Por que ese k",
      p: "Subir k baja el parecido entre grupos, pero tambien el de dentro del grupo. El k elegido es el punto donde la diferencia entre ambos es maxima; es el que usan el dataset y las demas tasks del workshop.",
    },
  ],
  takeaway:
    "El k del shingle no es un detalle: es el que fija si el Jaccard distingue a los vecinos de verdad del resto de la ciudad.",
};

export default doc;
