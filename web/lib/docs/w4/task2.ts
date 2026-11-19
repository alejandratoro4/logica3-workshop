import type { TaskDoc } from "@/lib/tasks";
import type { W4Task2 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W4Task2> = {
  title: "Una ronda de MapReduce es una multiplicacion matriz-vector",
  topic: "S10 · PAGERANK",
  statement:
    "Una ronda de MapReduce = una multiplicacion de PageRank sobre el grafo de reubicaciones. El map emite (j, p(i,j) * v_i) y el reduce suma por j. Se itera hasta que ||v(t+1) - v(t)||_1 < 1e-6 y se compara con el mismo PageRank calculado en memoria (la Unidad 3), que debe coincidir a 1e-4.",
  standfirst:
    "El grafo de la Task 1 se vuelve una matriz por filas. Multiplicarla por el vector de masas es un shuffle por columna: cada arista manda su contribucion a la zona de destino y el reduce la acumula y aplica el teletransporte.",
  lede: (r) =>
    `Con beta = ${fmt(r.beta)} y ${int(r.zones.length)} zonas, el metodo converge en ${int(
      r.iterations,
    )} rondas a una diferencia final de ${(r.rounds[r.rounds.length - 1]?.l1_change ?? 0).toExponential(2)}. ` +
    `La mayor diferencia con la Unidad 3 es ${r.max_abs_diff.toExponential(2)}, ${
      r.agrees_1e4 ? "por debajo" : "por encima"
    } de 1e-4.`,
  metrics: (r) => [
    { label: "Zonas", value: int(r.zones.length) },
    { label: "Iteraciones", value: int(r.iterations) },
    { label: "Delta final (L1)", value: (r.rounds[r.rounds.length - 1]?.l1_change ?? 0).toExponential(2) },
    { label: "Max |dif| vs Unidad 3", value: r.max_abs_diff.toExponential(2) },
  ],
  sections: [
    {
      h: "Paso 1 — La matriz por filas",
      p: "Cada fila i se normaliza por el total que sale de i, asi que p(i,j) es la fraccion de la masa de i que va a j. Con reloc_count como peso, la matriz es estocastica por filas y la masa se conserva en cada multiplicacion.",
    },
    {
      h: "Paso 2 — El vector viaja en el registro",
      p: "Cada entrada de la ronda es (i, j, p_ij, v_i): el map no necesita leer v de otro lado ni de una variable global. Emite (j, p_ij * v_i) y el reduce agrupa por j y suma.",
    },
    {
      h: "Paso 3 — Teletransporte y parada",
      p: "El reduce aplica v'_j = beta * suma + (1 - beta) / n, con beta = 0.85. Se mide la norma L1 entre vectores consecutivos y se para al bajar de 1e-6.",
    },
    {
      h: "Comparacion con la Unidad 3",
      p: "La task recalcula el mismo PageRank en memoria, iterado hasta 1e-10, y compara zona por zona. La mayor diferencia absoluta debe quedar por debajo de 1e-4; si no, hay un error de normalizacion o de teletransporte.",
    },
  ],
  takeaway:
    "PageRank no necesita una libreria de algebra: necesita un shuffle por columna repetido hasta que el vector deje de moverse.",
};

export default doc;
