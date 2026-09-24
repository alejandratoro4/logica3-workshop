/** Muestreo Poisson — port fiel de poisson_sample() en src/task5_probability.py.
 *
 * El dashboard original aproximaba con una normal para mu >= 30. Con mu ~ 500
 * el sesgo es pequeno, pero la cola es justamente lo que el Panel C afirma
 * estar midiendo: la frecuencia observada tiene que converger al valor que
 * Python calculo por Monte Carlo, no a la cola de una normal. Asi que se usa
 * el mismo metodo: Knuth por debajo de 30, y rechazo con propuesta logistica
 * por encima (el producto de uniformes hace underflow con mu grande).
 */

/** log-gamma por la aproximacion de Lanczos (JS no trae math.lgamma). */
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(z: number): number {
  if (z < 0.5) {
    // reflexion: Gamma(z)Gamma(1-z) = pi / sin(pi z)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  }
  const x = z - 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function poissonSample(lambda: number, rnd: () => number = Math.random): number {
  if (lambda <= 0) return 0;

  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    for (;;) {
      k++;
      p *= rnd();
      if (p <= L) return k - 1;
    }
  }

  const c = 0.767 - 3.36 / lambda;
  const beta = Math.PI / Math.sqrt(3 * lambda);
  const alpha = beta * lambda;
  const kConst = Math.log(c) - lambda - Math.log(beta);

  for (let guard = 0; guard < 10000; guard++) {
    const u = rnd();
    if (u <= 0 || u >= 1) continue;
    const x = (alpha - Math.log((1 - u) / u)) / beta;
    const n = Math.floor(x + 0.5);
    if (n < 0) continue;
    const v = rnd();
    if (v <= 0) continue;
    const y = alpha - beta * x;
    const lhs = y + Math.log(v / Math.pow(1 + Math.exp(y), 2));
    const rhs = kConst + n * Math.log(lambda) - lgamma(n + 1);
    if (lhs <= rhs) return n;
  }
  // Salida de emergencia: no deberia alcanzarse, el rechazo acepta en ~1.2 intentos.
  return Math.round(lambda);
}
