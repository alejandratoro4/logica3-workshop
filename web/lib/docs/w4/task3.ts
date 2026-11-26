import type { TaskDoc } from "@/lib/tasks";
import type { W4Task3 } from "@/lib/generated/contratos";
import { bytes, fmt, int } from "@/lib/format";

type Run = W4Task3["runs"][number];

const buscar = (r: W4Task3, escala: number, job: string, combiner: boolean): Run | undefined =>
  r.runs.find((x) => x.scale === escala && x.job === job && x.combiner === combiner);

const extra = (r: W4Task3, job: string, combiner: boolean) =>
  r.extrapolation_10x.find((e) => e.job === job && e.combiner === combiner);

const doc: TaskDoc<W4Task3> = {
  title: "El combiner abarata contar pares, no agrupar por conductor",
  topic: "COSTO DE COMUNICACION",
  statement:
    "Tamano del shuffle del Job 1 con y sin combiner (el combiner solo ayuda en el paso de contar pares: explicar por que); correr con 1x, 2x y 4x datos, verificar que crece linealmente y extrapolar a 10x; sumar el costo de S10: pares por iteracion x iteraciones.",
  standfirst:
    "Se mide cuantos pares y cuantos bytes viajan del map a los reducers en las dos rondas del Job 1, con el doble y el cuadruple de datos, y con y sin combiner en la ronda que cuenta pares. Con esos puntos se traza una recta para estimar el costo con diez veces mas datos, y se suma el costo de las rondas de PageRank.",
  lede: (r) => {
    const e = Math.min(...r.scales);
    const sin = buscar(r, e, "1b", false);
    const con = buscar(r, e, "1b", true);
    const diez = extra(r, "1b", false);
    if (!sin || !con) return "";
    return `A ${int(e)}x, contar los pares de zonas manda ${int(sin.shuffle_pairs)} pares sin combiner y solo ${int(
      con.shuffle_pairs
    )} con combiner. Sin combiner el shuffle crece en linea recta y a 10x llegaria a unos ${int(
      diez?.shuffle_pairs
    )} pares (${bytes(diez?.shuffle_bytes)}); con combiner se queda igual. PageRank cuesta ${int(
      r.pagerank_cost.total_pairs
    )} pares en total: casi nada al lado del stream.`;
  },
  metrics: (r) => {
    const e = Math.min(...r.scales);
    const sin = buscar(r, e, "1b", false);
    const con = buscar(r, e, "1b", true);
    const ahorro = sin && con && sin.shuffle_pairs > 0 ? 100 * (1 - con.shuffle_pairs / sin.shuffle_pairs) : 0;
    const r1a = extra(r, "1a", false);
    return [
      { label: `1b sin combiner (${int(e)}x)`, value: int(sin?.shuffle_pairs), hint: bytes(sin?.shuffle_bytes) },
      { label: `1b con combiner (${int(e)}x)`, value: int(con?.shuffle_pairs), hint: bytes(con?.shuffle_bytes) },
      { label: "Ahorro del combiner", value: `${fmt(ahorro, 2)} %`, hint: "en la ronda que cuenta pares" },
      { label: "1a a 10x (estimado)", value: int(r1a?.shuffle_pairs), hint: `R² = ${fmt(r1a?.linear_r2, 4)}` },
      {
        label: "PageRank (S10)",
        value: int(r.pagerank_cost.total_pairs),
        hint: `${int(r.pagerank_cost.pairs_per_iteration)} pares x ${int(r.pagerank_cost.iterations)} iteraciones`,
      },
    ];
  },
  sections: [
    {
      h: "Que es el shuffle",
      p: "Es el viaje de los datos entre el map y el reduce: cada par que emite un map se manda al reducer que le toca segun su clave. Es la parte cara de MapReduce porque pasa por la red, asi que el costo de comunicacion se mide contando esos pares y sus bytes.",
    },
    {
      h: "Las dos rondas del Job 1",
      p: "En la ronda 1a cada viaje va a su conductor; el reducer ordena sus viajes y saca un par ((zona_i, zona_siguiente), 1) por cada reubicacion. En la ronda 1b se suman esos unos por par de zonas y sale reloc_count.",
    },
    {
      h: "Por que el combiner sirve en 1b",
      p: "Cada map de 1b tiene miles de copias del mismo par de zonas, cada una con un 1. El combiner es un reduce chiquito que corre dentro del map: suma esas copias y manda un solo par por cada par de zonas. Funciona porque sumar sumas parciales da lo mismo que sumar todo junto. Por eso, con combiner, lo que viaja depende de cuantos maps y cuantos pares de zonas hay, no de cuantos viajes.",
    },
    {
      h: "Por que no sirve en 1a",
      p: "En 1a la clave es el conductor y el reducer necesita todos sus viajes, uno por uno, para ordenarlos y ver de donde a donde se movio. No hay nada que sumar. Ademas, los viajes de un conductor quedan en fragmentos distintos: si cada map sacara las reubicaciones por su cuenta, se perderian las que cruzan de un fragmento a otro.",
    },
    {
      h: "Crece en linea recta",
      p: "Los datos de 2x y 4x son el mismo stream repetido con los conductores renombrados, asi que hay exactamente el doble y el cuadruple de viajes. Se traza una recta por minimos cuadrados con los tres puntos y el R² dice que tan bien la explica (1 es perfecto). Con esa recta se estima el shuffle a 10x. Con combiner la serie es constante: la recta es horizontal y su R² se reporta como 1.",
    },
    {
      h: "El costo de PageRank (S10)",
      p: "Cada iteracion de PageRank es una ronda de MapReduce: el map emite un par por cada entrada de la matriz (una por arista del grafo de zonas) y el reduce suma por zona. El costo total es pares por iteracion por numero de iteraciones hasta converger. El grafo tiene pocas zonas, asi que este costo es diminuto comparado con el del Job 1.",
    },
  ],
  takeaway:
    "El combiner solo ayuda cuando el reduce se puede hacer por partes, como una suma; agrupar los viajes de cada conductor siempre cuesta lo que pesan los datos.",
};

export default doc;
