import type { W1Task2 } from "@/lib/generated/contratos";

/** Las filas de quicksort de un tipo de entrada, como series por algoritmo y
 *  ordenadas por n. La usan la pagina de la Task 2 y
 *  el Panel B, por eso no vive en ninguno de los dos. */
export function quicksortSeries(r: W1Task2, input: "random_input" | "sorted_input") {
  // Un n en el que el determinista desbordo la recursion no termino de
  // ordenar: su tiempo no es comparable, asi que se saca de las dos series.
  const fallo = new Set(r.quicksort.filter((q) => q.input === input && q.recursion_overflow).map((q) => q.n));
  const filas = (algo: string) =>
    r.quicksort
      .filter((q) => q.input === input && q.algorithm === algo && !fallo.has(q.n))
      .sort((a, b) => a.n - b.n);
  const rr = filas("randomized_quicksort");
  const dd = filas("deterministic_quicksort");
  return {
    n: rr.map((q) => q.n),
    randomized_time: rr.map((q) => q.time_s),
    deterministic_time: dd.map((q) => q.time_s),
    /** Vacias si la task no reporta comparaciones. */
    randomized_comparisons: rr.every((q) => q.comparisons !== undefined) ? rr.map((q) => q.comparisons as number) : [],
    expected_comparisons: rr.every((q) => q.expected_comparisons !== undefined)
      ? rr.map((q) => q.expected_comparisons as number)
      : [],
  };
}
