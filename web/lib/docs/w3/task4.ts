import type { TaskDoc } from "@/lib/tasks";
import type { W3Task4 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const tv = (r: W3Task4) => 0.5 * r.zones.reduce((a, z) => a + Math.abs(z.pi_empirical - z.pi_theory), 0);

const peor = (r: W3Task4) =>
  [...r.zones].sort((a, b) => Math.abs(b.pi_empirical - b.pi_theory) - Math.abs(a.pi_empirical - a.pi_theory))[0];

const doc: TaskDoc<W3Task4> = {
  title: "La caminata visita cada zona en proporcion a su grado",
  topic: "CAMINATA ALEATORIA",
  statement:
    "Caminata aleatoria no dirigida: simetrizar el grafo, dar 50.000 pasos o mas y verificar las visitas empiricas contra pi_i = d_i / (2|E|).",
  standfirst:
    "El grafo de reubicaciones se simetriza como multigrafo: cada reubicacion es una arista no dirigida entre sus dos zonas. Sobre ese grafo se simula una caminata aleatoria y se compara la fraccion de pasos que pasa en cada zona con la distribucion estacionaria teorica, d_i / (2|E|).",
  lede: (r) => {
    const z = peor(r);
    if (!z) return "";
    return `En ${int(r.steps)} pasos sobre un grafo de ${int(r.n_edges)} aristas, la distancia de variacion total entre las visitas y la teoria es ${fmt(tv(r), 4)}. La mayor diferencia es en ${z.zone}: ${fmt(100 * z.pi_empirical, 2)}% de las visitas contra ${fmt(100 * z.pi_theory, 2)}% teorico.`;
  },
  metrics: (r) => {
    const z = peor(r);
    const sumaD = r.zones.reduce((a, x) => a + x.degree, 0);
    return [
      { label: "Pasos", value: int(r.steps), hint: "el enunciado pide 50.000 o mas" },
      { label: "Aristas |E|", value: int(r.n_edges), hint: "una por reubicacion" },
      { label: "Suma de grados", value: int(sumaD), hint: `2|E| = ${int(2 * r.n_edges)}` },
      { label: "Variacion total", value: fmt(tv(r), 4), hint: "0 = distribuciones identicas" },
      ...(z ? [{ label: "Mayor diferencia", value: z.zone, hint: `${fmt(100 * Math.abs(z.pi_empirical - z.pi_theory), 2)} puntos porcentuales` }] : []),
    ];
  },
  sections: [
    {
      h: "Simetrizacion",
      p: "Se usa el multigrafo: cada reubicacion de edges.csv se convierte en una arista no dirigida entre la zona de salida y la de llegada. El numero de aristas |E| es el total de reubicaciones. No se usa el grafo simple, con una arista por par de zonas, porque queda completo y su distribucion teorica es uniforme.",
    },
    {
      h: "Grado y lazos",
      p: "El grado d_i es el numero de extremos de arista en la zona i. Una arista entre dos zonas distintas aporta 1 a cada una. Un lazo, es decir una reubicacion que empieza y termina en la misma zona, tiene sus dos extremos en ella y aporta 2. Con esa convencion la suma de los grados es 2|E|.",
    },
    {
      h: "Caminata",
      p: "En cada paso se elige con igual probabilidad uno de los d_i extremos de arista de la zona actual y se pasa a la zona del otro extremo. La probabilidad de ir de i a j es el numero de aristas entre i y j dividido por d_i; para quedarse en i cuentan los dos extremos de cada lazo. Es la caminata natural de clase, p_ij = 1/d_i por cada arista.",
    },
    {
      h: "Distribucion estacionaria",
      p: "Con pi_i = d_i / (2|E|) se cumple pi = pi M: la masa que llega a j es la suma, sobre sus vecinos i, de (d_i / 2|E|) por (aristas entre i y j) / d_i, que da d_j / (2|E|). Los valores suman 1 porque la suma de los grados es 2|E|. El script comprueba ademas esa igualdad numericamente.",
    },
    {
      h: "Condiciones de convergencia",
      p: "El resultado exige un grafo conexo y una cadena aperiodica. El grafo es conexo porque se observan reubicaciones entre todas las zonas, y los lazos hacen que la cadena sea aperiodica.",
    },
    {
      h: "Error de la simulacion",
      p: "La fraccion de visitas se estima con un numero finito de pasos, asi que no coincide exactamente con la teoria. El error se reduce como 1/raiz(pasos); la serie de convergencia muestra la distancia de variacion total a medida que avanza la caminata.",
    },
    {
      h: "Relacion con las Tasks 2 y 3",
      p: "En este grafo cada recogida es la llegada de una reubicacion y la salida de la siguiente, por lo que el grado de una zona es cercano al doble de sus viajes. La distribucion de la caminata no dirigida queda entonces cerca de la participacion de cada zona en los viajes, igual que la distribucion estacionaria de la cadena dirigida.",
    },
  ],
  takeaway:
    "En un grafo no dirigido la distribucion estacionaria se lee de los grados, sin iterar: pi_i = d_i / (2|E|), y la simulacion la confirma.",
};

export default doc;
