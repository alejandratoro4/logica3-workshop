import type { TaskDoc } from "@/lib/tasks";
import type { W3Task3 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W3Task3> = {
  title: "PageRank rankea las zonas por las reubicaciones que reciben",
  topic: "PAGERANK",
  statement:
    "PageRank estandar: rankear las zonas, comparar contra el ranking por volumen de viajes y explicar una zona que quede mas arriba en PageRank que en volumen.",
  standfirst:
    "La matriz de transicion M se arma con reloc_count como peso de cada arista. PageRank se calcula iterando v = beta v M + (1 - beta) / n hasta converger, y el puesto de cada zona se compara con su puesto por numero de viajes.",
  lede: (r) => {
    const orden = [...r.zones].sort((a, b) => a.pagerank_rank - b.pagerank_rank);
    const primera = orden[0];
    if (!primera) return "";
    const suben = r.zones.filter((z) => z.pagerank_rank < z.volume_rank);
    const cambio = suben.length
      ? `Suben respecto al volumen: ${suben.map((z) => `${z.zone} (del puesto ${int(z.volume_rank)} al ${int(z.pagerank_rank)})`).join(", ")}.`
      : "Ninguna zona cambia de puesto respecto al ranking por volumen.";
    return `Con beta = ${fmt(r.beta, 2)}, la iteracion converge en ${int(r.iterations)} pasos. La zona con mayor PageRank es ${primera.zone} (${fmt(primera.pagerank, 4)}), con ${int(primera.ride_volume)} viajes. ${cambio}`;
  },
  metrics: (r) => {
    const orden = [...r.zones].sort((a, b) => a.pagerank_rank - b.pagerank_rank);
    const primera = orden[0];
    const ultima = orden[orden.length - 1];
    const suben = r.zones.filter((z) => z.pagerank_rank < z.volume_rank);
    return [
      { label: "beta", value: fmt(r.beta, 2), hint: "probabilidad de seguir una arista" },
      { label: "Iteraciones", value: int(r.iterations), hint: "hasta converger" },
      { label: "Mayor PageRank", value: primera?.zone ?? "-", hint: fmt(primera?.pagerank, 4) },
      { label: "Menor PageRank", value: ultima?.zone ?? "-", hint: fmt(ultima?.pagerank, 4) },
      { label: "Zonas que suben", value: int(suben.length), hint: "puesto por PageRank mejor que por volumen" },
    ];
  },
  sections: [
    {
      h: "Grafo y matriz",
      p: "Cada arista del grafo va de la zona de un viaje a la zona del siguiente viaje del mismo conductor, y reloc_count cuenta cuantas veces ocurrio. M[i][j] es reloc_count(i -> j) dividido por el total que sale de i, de modo que cada fila suma 1. Sin los pesos el grafo es completo y todas las zonas empatan.",
    },
    {
      h: "Iteracion",
      p: "Se parte de la distribucion uniforme y se itera v = beta v M + (1 - beta) / n, con v como vector fila, hasta que el cambio en norma 1 es menor que la tolerancia. Con probabilidad beta el conductor sigue una arista; con probabilidad 1 - beta salta a una zona elegida al azar. Una zona sin salidas se trata como un salto uniforme.",
    },
    {
      h: "Relacion con la distribucion estacionaria",
      p: "Con beta = 1 la iteracion es pi = pi M, la distribucion estacionaria de la Task 2. En este grafo cada recogida es la llegada de una reubicacion y la salida de la siguiente, por lo que pi queda muy cerca de la participacion de cada zona en los viajes. La diferencia entre PageRank y volumen la introduce el salto aleatorio.",
    },
    {
      h: "Efecto del salto aleatorio",
      p: "PageRank es igual a (1 - beta) por la suma, sobre k, de beta^k por u M^k, con u la distribucion uniforme: promedia caminatas de todas las longitudes que empiezan en una zona al azar. Una zona gana peso frente a pi cuando esas caminatas cortas la visitan mas que la cadena a largo plazo.",
    },
    {
      h: "Filas casi iguales",
      p: "Si el conductor de cada viaje se asigna al azar, la zona del siguiente viaje no depende de la actual y las filas de M son casi iguales. En ese caso v M es la misma distribucion para cualquier v, y PageRank es beta por pi mas (1 - beta) / n: una transformacion creciente que acerca todas las zonas a 1/n sin cambiar el orden.",
    },
    {
      h: "Comparacion de rankings",
      p: "El ranking por volumen ordena las zonas por numero de viajes en rides.csv. El panel une el puesto de cada zona en los dos rankings y el texto de la explicacion se genera con los valores de la corrida: indica que zona sube y como se reparte la diferencia, o por que ninguna cambia de puesto.",
    },
  ],
  takeaway:
    "PageRank coincide con el ranking por volumen cuando el destino de un conductor no depende de su origen; los puestos cambian cuando la matriz de transicion tiene estructura, o entre zonas de volumen casi igual por ruido de muestreo.",
};

export default doc;
