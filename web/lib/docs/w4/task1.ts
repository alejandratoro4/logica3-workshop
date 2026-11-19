import type { TaskDoc } from "@/lib/tasks";
import type { W4Task1 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W4Task1> = {
  title: "El grafo de reubicaciones sale de dos shuffles",
  topic: "PIPELINE MAPREDUCE",
  statement:
    "Job 1: el map emite (driver_id, (stream_seq, pickup_zone)); el reduce ordena los viajes de cada conductor por stream_seq y emite un par ((zona_i, zona_siguiente), 1) por reubicacion, y esos pares se suman en reloc_count. Job 2: el map emite (zona, (salen, llegan)) desde las aristas; el reduce arma el resumen por zona. Correr el map en paralelo sobre los 8 fragmentos con 2 o mas workers y validar las aristas contra la Unidad 3.",
  standfirst:
    "Con los viajes partidos en 8 fragmentos, agrupar por conductor exige un shuffle y contar los pares de zonas exige otro: dos rondas para reconstruir el grafo de la Unidad 3, y una tercera para el resumen por zona.",
  lede: (r) =>
    `Sobre ${int(r.n_fragments)} fragmentos y ${int(r.workers)} workers, el Job 1a mueve ${int(
      r.jobs[0]?.shuffle_pairs ?? 0,
    )} pares por el shuffle para agrupar los viajes de cada conductor; el Job 1b los reduce a ${int(
      r.jobs[1]?.shuffle_pairs ?? 0,
    )} pares de zonas. Las ${int(r.validation.edges_compared)} aristas ${
      r.validation.edges_match ? "coinciden" : "no coinciden"
    } con la Unidad 3.`,
  metrics: (r) => [
    { label: "Fragmentos", value: int(r.n_fragments) },
    { label: "Pares en el shuffle (1a)", value: int(r.jobs[0]?.shuffle_pairs ?? 0) },
    { label: "Aristas validadas", value: int(r.validation.edges_compared) },
    { label: "Zonas", value: int(r.nodes.length) },
  ],
  sections: [
    {
      h: "Paso 1 — Agrupar los viajes del conductor",
      p: "Los fragmentos son rangos contiguos de stream_seq, asi que los viajes de un mismo conductor caen en map tasks distintas. El shuffle por driver_id los junta en un solo reduce, que los ordena y emite un par por cada salto entre zonas consecutivas. Sin ese shuffle no hay forma de saber cual fue el viaje anterior de un conductor.",
    },
    {
      h: "Paso 2 — Contar los pares de zonas",
      p: "El reduce de 1a emite ((a, b), (1, tarifa, espera)) y hay que sumarlos por par: otro shuffle, ahora por par de zonas. El mismo reduce sirve de combiner porque suma (n, suma_tarifa, suma_espera) y no medias: la media de medias no es la media, y ademas la salida del combiner tiene que tener la forma de la entrada.",
    },
    {
      h: "Paso 3 — Resumen por zona",
      p: "Cada arista emite dos pares: uno por la salida desde a y otro por la llegada a b con la tarifa y la espera de ese viaje. El reduce suma y divide por las llegadas, que es lo que pide nodes.csv. net_flow = llegan - salen y sale del orden de los viajes de cada conductor, no de un flujo sostenido.",
    },
    {
      h: "Validacion contra la Unidad 3",
      p: "Mismos pares, mismo reloc_count y medias a 0.01 o menos: la diferencia maxima de las tres columnas sale 0 en la corrida de referencia.",
    }
  ],
  takeaway:
    "El grafo no se lee: se reconstruye. Dos rondas de MapReduce bastan para pasar de viajes sueltos a aristas con reloc_count, y la tercera arma el resumen por zona.",
};

export default doc;
