import type { TaskDoc } from "@/lib/tasks";
import type { W5Task1 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W5Task1> = {
  title: "Dos representaciones, cuatro distancias, un mismo grafo de parecidos",
  topic: "MEDIDAS DE DISTANCIA",
  statement:
    "Representaciones de conjunto (shingles de pickup_zone con k = 3) y de vector (ocupacion por zona + 2 metricas z-normalizadas) para >= 1.000 conductores. Sobre 5.000 pares al azar, calcular Jaccard, coseno, L1 y L2; graficar sus distribuciones; reportar la correlacion entre Jaccard, coseno y la similitud LCS de la Unidad 5 en 500 pares; revisar la concentracion de distancias.",
  standfirst:
    "Comparar cada par de conductores con programacion dinamica no escala. Antes de aproximar hay que saber que mide cada distancia: el conjunto ve que zonas comparten, el vector ve cuanto peso tiene cada zona y como se mueve el conductor.",
  lede: (r) =>
    `Con ${int(r.drivers)} conductores y ${int(r.clusters)} territorios plantados, el Jaccard medio dentro de un grupo es ${fmt(
      r.measures[0]?.mean_same_cluster ?? 0,
    )} contra ${fmt(r.measures[0]?.mean_other_cluster ?? 0)} entre grupos. ` +
    `Jaccard y LCS correlacionan ${fmt(r.correlation.jaccard_lcs)}, y la L2 de una consulta se concentra en un rango de ${fmt(
      r.concentration.ratio,
    )}x.`,
  metrics: (r) => [
    { label: "Conductores", value: int(r.drivers) },
    { label: "Shingles medios (k=3)", value: fmt(r.mean_shingle_count) },
    { label: "Dimensiones del vector", value: int(r.vector_dims) },
    { label: "Pares evaluados", value: int(r.pairs) },
    { label: "Pares LCS", value: int(r.correlation.pairs) },
    { label: "Ratio de concentracion L2", value: fmt(r.concentration.ratio) },
  ],
  sections: [
    {
      h: "Paso 1 — El conjunto: k-shingles de zonas",
      p: "Cada conductor se vuelve el conjunto de sus 3-shingles consecutivos de pickup_zone. Dos conductores que recorren el mismo territorio comparten shingles aunque el orden global difiera; el Jaccard mide esa interseccion sobre la union.",
    },
    {
      h: "Paso 2 — El vector: ocupacion y dos metricas",
      p: "El vector tiene una componente por zona (fraccion de viajes) y dos mas con la espera media y el largo de la secuencia, z-normalizadas. El coseno mira la forma del reparto; L1 y L2 miran cuanto se separan las componentes.",
    },
    {
      h: "Paso 3 — Que separa cada medida",
      p: "Las medias por grupo muestran que las similitudes suben dentro del territorio y bajan fuera; las distancias hacen lo contrario. Si una medida no separa, no sirve para agrupar aunque sea correcta.",
    },
    {
      h: "Paso 4 — Correlacion con LCS",
      p: "El LCS de la Unidad 5 compara las secuencias completas y cuesta O(|a||b|) por par. Sirve de referencia, no de metodo.",
    },
    {
      h: "Paso 5 — Concentracion de distancias",
      p: "Cuanto menor el ratio entre la L2 maxima y minima de una consulta, menos separa la distancia y mas dificil es que un indice como LSH acierte.",
    },
  ],
  takeaway:
    "Ninguna distancia es la verdadera: cada una define que es parecerse, y elegirla es la primera decision del pipeline.",
};

export default doc;
