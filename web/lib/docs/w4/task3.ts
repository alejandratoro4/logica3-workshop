import type { TaskDoc } from "@/lib/tasks";
import type { W4Task3 } from "@/lib/generated/contratos";
import { bytes, fmt, int, pct } from "@/lib/format";

type R = W4Task3;

const corrida = (r: R, escala: number, job: string, combiner: boolean) =>
  r.runs.find((x) => x.scale === escala && x.job === job && x.combiner === combiner);
const extrapolada = (r: R, job: string, combiner: boolean) =>
  r.extrapolation_10x.find((x) => x.job === job && x.combiner === combiner);

const doc: TaskDoc<R> = {
  title: "El combiner deja el shuffle de 1b fijo mientras los datos crecen",
  topic: "COSTO DE COMUNICACION",
  statement:
    "Medir el tamano del shuffle del Job 1 con y sin combiner (el combiner solo ayuda en el paso de contar pares: explicar por que); correr con 1x, 2x y 4x datos, verificar que crece linealmente y extrapolar a 10x; sumar el costo de PageRank (S10): pares por iteracion x iteraciones.",
  standfirst:
    "El costo de comunicacion de un algoritmo MapReduce es lo que viaja del map a los reducers. Sin combiner ese shuffle crece en proporcion exacta a los datos; con combiner, la ronda que cuenta pares de zonas manda a lo sumo un par por zona y map task, sin importar cuantos viajes haya.",
  lede: (r) => {
    const e = Math.min(...r.scales);
    const sin = corrida(r, e, "1b", false);
    const con = corrida(r, e, "1b", true);
    const ext = extrapolada(r, "1b", false);
    const ahorro = sin && con && sin.shuffle_pairs ? 1 - con.shuffle_pairs / sin.shuffle_pairs : 0;
    return (
      `A ${e}x, el combiner baja el shuffle de 1b de ${int(sin?.shuffle_pairs)} a ${int(con?.shuffle_pairs)} pares ` +
      `(${pct(ahorro)} menos). Sin combiner, la recta (R^2 = ${fmt(ext?.linear_r2, 6)}) predice ` +
      `${int(ext?.shuffle_pairs)} pares a 10x. PageRank cuesta ${int(r.pagerank_cost.pairs_per_iteration)} pares x ` +
      `${int(r.pagerank_cost.iterations)} iteraciones = ${int(r.pagerank_cost.total_pairs)} pares.`
    );
  },
  metrics: (r) => {
    const sin = extrapolada(r, "1b", false);
    const con = extrapolada(r, "1b", true);
    const a = extrapolada(r, "1a", false);
    return [
      { label: "Shuffle 1a a 10x", value: `${int(a?.shuffle_pairs)} pares`, hint: bytes(a?.shuffle_bytes) },
      { label: "Shuffle 1b a 10x sin combiner", value: `${int(sin?.shuffle_pairs)} pares`, hint: bytes(sin?.shuffle_bytes) },
      { label: "Shuffle 1b a 10x con combiner", value: `${int(con?.shuffle_pairs)} pares`, hint: bytes(con?.shuffle_bytes) },
      { label: "Costo PageRank", value: `${int(r.pagerank_cost.total_pairs)} pares` },
    ];
  },
  sections: [
    {
      h: "Paso 1 — Medir el shuffle a 1x, 2x y 4x",
      p: "Se corre el Job 1 completo sobre el stream repetido 1, 2 y 4 veces con los conductores renombrados, asi el grafo crece exactamente al doble y al cuadruple. De cada ronda se guardan los pares y los bytes que pasan del map a los reducers, con y sin combiner en 1b.",
    },
    {
      h: "Paso 2 — Ajuste lineal y extrapolacion a 10x",
      p: "Por cada ronda se ajusta una recta por minimos cuadrados a los pares contra la escala. Un R^2 de 1 confirma que el shuffle sin combiner es lineal en los datos, y la recta da el valor a 10x. Con combiner la serie es constante: la recta es horizontal y su R^2 se toma como 1, no como 0/0.",
    },
    {
      h: "Por que el combiner solo ayuda en 1b",
      p: "En 1b la clave es un par de zonas y el valor es un 1: sumar sumas parciales da lo mismo que sumar todo, asi que cada map task manda un solo par por par de zonas. En 1a la clave es el conductor y el reducer necesita cada viaje por separado para ordenarlos por stream_seq; un combiner solo los juntaria en una lista que pesa lo mismo.",
    },
    {
      h: "El costo de PageRank",
      p: "Cada iteracion de PageRank es una ronda que emite un par por arista del grafo. El costo total es pares por iteracion por el numero de iteraciones que necesita la Task 2 para que el vector deje de moverse.",
    },
  ],
  takeaway:
    "Un combiner no reduce el costo de cualquier job: solo el de los reduce que se pueden aplicar por partes, y ahi convierte un shuffle que crece con los datos en uno que depende del numero de claves.",
};

export default doc;
