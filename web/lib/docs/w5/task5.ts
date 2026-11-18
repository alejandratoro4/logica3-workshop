import type { TaskDoc } from "@/lib/tasks";
import type { W5Task5 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const NOMBRE: Record<string, string> = {
  jaccard: "Jaccard exacto",
  minhash: "MinHash/LSH",
  cosine: "Coseno/LSH",
  lcs: "LCS",
};

/** overlap@5 entre dos metodos, en cualquier orden. */
const ov = (r: W5Task5, a: string, b: string) =>
  r.overlap_at_5.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))?.overlap;

/** Fila del outcome test de un metodo. */
const prueba = (r: W5Task5, m: string) => r.outcome_test.find((o) => o.method === m);

const doc: TaskDoc<W5Task5> = {
  title: "Cuatro metodos aciertan el grupo y discrepan en el vecino",
  topic: "VECINOS CERCANOS",
  statement:
    "Top-5 vecinos para >= 20 consultas por Jaccard con MinHash/LSH, por coseno con LSH y por la similitud LCS de la Unidad 5 (solo sobre candidatos); reportar el overlap@5 entre metodos y explicar los desacuerdos. Outcome test: avg_fare (que no esta en ninguna representacion), diferencia absoluta media entre un conductor y sus 5 vecinos contra 5 conductores al azar.",
  standfirst:
    "Para los 3 conductores de menor driver_id de cada grupo se buscan sus 5 vecinos con cuatro metodos: el Jaccard exacto contra todos (la referencia), MinHash con bandas, hiperplanos aleatorios para el coseno y LCS sobre los mismos candidatos de MinHash. Se mide cuanto coinciden los top-5 y si los vecinos se parecen en la tarifa, que ningun metodo vio.",
  lede: (r) => {
    const mh = ov(r, "jaccard", "minhash");
    const cs = ov(r, "jaccard", "cosine");
    const p = prueba(r, "minhash");
    const cociente = p && p.random_mad ? p.neighbor_mad / p.random_mad : undefined;
    const se = p?.neighbor_mad_se ?? 0;
    const real = p !== undefined && se > 0 && p.neighbor_mad < p.random_mad - 2 * se;
    return `Con ${int(r.queries)} consultas, el top-5 de MinHash/LSH coincide con el exacto en ${pct(
      mh,
      0
    )} y el del coseno en ${pct(cs, 0)}. En tarifa, los vecinos de MinHash difieren de la consulta ${fmt(
      cociente,
      2
    )} veces lo que difieren conductores al azar: ${
      real ? "mas de 2 errores estandar por debajo, no es ruido" : "dentro de 2 errores estandar, no se distingue del azar"
    }.`;
  },
  metrics: (r) => {
    const out = [
      {
        label: "LSH de MinHash",
        value: `b = ${int(r.lsh_config.bands)}, r = ${int(r.lsh_config.rows)}`,
        hint: `umbral ${fmt(r.lsh_config.threshold, 3)}`,
      },
    ];
    const mh = r.methods.find((m) => m.method === "minhash");
    const cs = r.methods.find((m) => m.method === "cosine");
    if (mh) out.push({ label: "Candidatos MinHash", value: fmt(mh.mean_candidates, 1), hint: "por consulta" });
    if (cs) out.push({ label: "Candidatos coseno", value: fmt(cs.mean_candidates, 1), hint: "por consulta" });
    out.push({ label: "Overlap MinHash–LCS", value: pct(ov(r, "minhash", "lcs"), 0), hint: "mismos candidatos, otro orden" });
    const ex = prueba(r, "jaccard");
    if (ex)
      out.push({
        label: "avg_fare: vecinos vs azar",
        value: `${fmt(ex.neighbor_mad, 0)} vs ${fmt(ex.random_mad, 0)}`,
        hint: `${NOMBRE.jaccard}, diferencia absoluta media`,
      });
    return out;
  },
  sections: [
    {
      h: "Que pregunta responde esta task",
      p: "Las Tasks 2 y 4 midieron cada metodo por separado. Aqui se ponen lado a lado sobre las mismas consultas: si cuatro formas de medir parecido eligen los mismos vecinos, y si esos vecinos se parecen en algo que ninguna representacion incluye. Lo segundo es el outcome test: una similitud util deberia agrupar conductores que tambien se parecen fuera de lo que se midio.",
    },
    {
      h: "Paso 1: consultas y candidatos",
      p: "Las consultas son los 3 conductores de menor driver_id de cada grupo plantado. MinHash reparte las 100 posiciones de la firma en bandas con el (b, r) cuyo umbral queda mas cerca del Jaccard tipico de un vecino real; dos conductores son candidatos si coinciden en todos los valores de alguna banda. El coseno usa 64 hiperplanos gaussianos en 8 bandas de 8 bits sobre el vector de ocupacion. LCS no busca candidatos propios: reordena los de MinHash, porque calcularlo contra todos costaria horas.",
    },
    {
      h: "Paso 2: el orden dentro de los candidatos",
      p: "MinHash ordena por la fraccion de valores de firma que coinciden (el Jaccard estimado), el coseno por el coseno exacto y LCS por 2 LCS / (|a| + |b|). Los empates se rompen por driver_id, igual que la lista exacta: el Jaccard estimado es una fraccion de 100 y empata a menudo.",
    },
    {
      h: "Paso 3: overlap@5",
      p: "Para cada par de metodos se cuenta cuantos de los 5 vecinos comparten y se divide por 5, en promedio sobre las consultas. Un overlap bajo no significa que un metodo falle: puede que encuentre vecinos igual de buenos pero distintos, porque dentro de un grupo hay muchos conductores casi empatados.",
    },
    {
      h: "Por que no coinciden",
      p: "Hay dos razones. La primera son los candidatos: con el umbral cerca del Jaccard tipico de un vecino, la curva S deja pasar mas o menos la mitad de los vecinos reales, y el que no es candidato no puede aparecer ni en MinHash ni en LCS. La segunda es el orden: el error del Jaccard estimado con 100 funciones es mayor que la diferencia entre el quinto y el decimo vecino real, asi que el top-5 por firma es casi un sorteo entre empatados. LCS mira el orden completo de las zonas, no ventanas de tres, y elige otros. El coseno no ve el orden y su vector incluye dos metricas normalizadas que pesan mas que las fracciones por zona: separa bien los grupos, pero dentro del grupo su ranking no tiene que ver con el Jaccard. Las cifras de cada corrida estan en el texto del panel.",
    },
    {
      h: "El outcome test",
      p: "La tarifa media no entra en ninguna representacion. Para cada metodo se compara la diferencia absoluta media de avg_fare entre la consulta y sus 5 vecinos con la que habria contra conductores al azar, calculada sin sortear como la media contra todos los demas. Si la de los vecinos es menor por mas de dos errores estandar, los vecinos se parecen en tarifa sin que nadie la haya puesto: el territorio decide que viajes recibe cada conductor, y la distancia de esos viajes fija la tarifa.",
    },
  ],
  takeaway:
    "Los metodos coinciden en el grupo y discrepan en quien es el mas parecido dentro de el; ahi deciden los falsos negativos de LSH, el ruido de la firma y lo que cada representacion mira. El outcome test dice si ese parecido se extiende a algo que nadie midio.",
};
export default doc;
