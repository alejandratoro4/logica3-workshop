import type { TaskDoc } from "@/lib/tasks";
import type { W1Task5 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W1Task5> = {
  title: "Una cota es una garantia, no una prediccion",
  topic: "ANALISIS PROBABILISTICO",
  statement:
    "Usar las cotas de Chebyshev o de Chernoff para acotar la probabilidad de que una zona reciba un numero inusualmente alto de solicitudes, que es la senial para activar surge pricing.",
  standfirst:
    "En la hora de mayor demanda de cada zona, las solicitudes se modelan como Poisson y el surge se activa cuando el conteo supera la media en k desviaciones. Chebyshev y Chernoff acotan esa probabilidad; una simulacion Monte Carlo dice cuanto vale de verdad.",
  lede: (r) => {
    if (r.zones.length === 0) return "";
    const z = [...r.zones].sort((a, b) => b.mu - a.mu)[0];
    const m = z.model_based;
    return `En ${z.zone}, la zona de mayor demanda, llegan en promedio ${fmt(z.mu, 1)} solicitudes a las ${z.peak_hour}:00 y el surge se activa desde ${int(m.surge_threshold)}, es decir mu + ${fmt(r.k_sigma, 1)} sigma. Chebyshev garantiza que eso pasa a lo sumo con probabilidad ${fmt(m.chebyshev_bound, 3)}, Chernoff baja la garantia a ${fmt(m.chernoff_bound, 3)}, y bajo el modelo ocurre con probabilidad ${fmt(m.monte_carlo_prob, 3)}.`;
  },
  metrics: (r) => {
    const zs = r.zones;
    if (zs.length === 0) return [];
    const rango = (f: (z: (typeof zs)[number]) => number, d: number) => {
      const v = zs.map(f).filter((x) => Number.isFinite(x));
      return v.length ? `${fmt(Math.min(...v), d)} – ${fmt(Math.max(...v), d)}` : "—";
    };
    return [
      { label: "Umbral de surge", value: `mu + ${fmt(r.k_sigma, 1)} sigma`, hint: `${int(zs.length)} zonas, cada una en su hora pico` },
      { label: "Cota de Chebyshev", value: fmt(zs[0].model_based.chebyshev_bound, 3), hint: "1/(1+k^2): la misma en todas las zonas" },
      { label: "Cota de Chernoff", value: rango((z) => z.model_based.chernoff_bound, 3), hint: "depende de mu de cada zona" },
      { label: "Probabilidad real (Monte Carlo)", value: rango((z) => z.model_based.monte_carlo_prob, 3), hint: "bajo el modelo Poisson" },
      { label: "sigma observada / sigma del modelo", value: rango((z) => (z.sigma_model_sqrt_mu > 0 ? z.sigma_hat / z.sigma_model_sqrt_mu : NaN), 2), hint: "cerca de 1 si el supuesto Poisson se sostiene" },
    ];
  },
  sections: [
    {
      h: "Que pregunta responde esta task",
      p: "La tarifa dinamica se activa cuando una zona recibe bastante mas demanda de la habitual. Antes de fijar el umbral hay que saber con que frecuencia se va a cruzar: si se cruza demasiado seguido, el surge deja de ser una senial y se vuelve el precio normal. Las cotas de concentracion dan un techo garantizado para esa frecuencia a partir de muy poca informacion sobre la distribucion.",
    },
    {
      h: "Paso 1: una variable por zona",
      p: "Para cada zona se busca su hora de mayor demanda y se cuentan las solicitudes de esa hora en cada dia simulado; los dias sin solicitudes cuentan como cero. La media de esos conteos es mu. Como las llegadas vienen de un proceso de Poisson, la desviacion del modelo es sigma = raiz de mu, y el surge se activa cuando el conteo X alcanza mu + k sigma.",
    },
    {
      h: "Paso 2: la cota de Chebyshev",
      p: "La version unilateral de Chebyshev (Cantelli) dice que P(X - mu >= t) es a lo sumo sigma^2 / (sigma^2 + t^2). Con t = k sigma eso es 1/(1 + k^2), sin importar la zona: Chebyshev solo conoce media y varianza, y con el umbral medido en desviaciones ya no puede distinguir una zona de otra. Vale para cualquier distribucion, y por eso promete poco.",
    },
    {
      h: "Paso 3: la cota de Chernoff",
      p: "Escribiendo el umbral como (1 + delta) mu, con delta = k / raiz de mu, la cota multiplicativa de Chernoff da (e^delta / (1 + delta)^(1 + delta))^mu. Usa que X es suma de muchas llegadas independientes, no solo su varianza, y por eso queda por debajo de Chebyshev en todas las zonas. Para mu grande se acerca a e^(-k^2/2), la cola de una normal sin los factores polinomiales.",
    },
    {
      h: "Paso 4: lo que de verdad ocurre",
      p: "Para saber cuanto valen las cotas hay que conocer la probabilidad real. Se simulan muchas muestras de Poisson(mu) y se cuenta la fraccion que alcanza el umbral. El script calcula tambien la cola exacta de la Poisson, y que las dos coincidan es la prueba de que la simulacion esta bien. El medidor en vivo del panel usa el mismo muestreador, asi que su frecuencia acumulada converge a ese valor.",
    },
    {
      h: "Por que las cotas quedan tan lejos",
      p: "Ninguna de las dos cotas falla: ambas quedan por encima de la probabilidad real, que es lo unico que prometen. La distancia es el precio de suponer poco. Chebyshev tiene que valer incluso para distribuciones con colas pesadas, y Chernoff descarta los factores polinomiales de la cola. Una cota sirve para garantizar que el surge no se activara mas seguido que cierto valor, no para predecir cuanto se activara.",
    },
    {
      h: "Lo que el modelo supone y como se revisa",
      p: "Chernoff y la simulacion dependen de que los conteos sean Poisson; Chebyshev no. Para revisarlo se compara la desviacion observada en los dias simulados con raiz de mu. Si la observada es claramente mayor, hay dias con mas variabilidad de la que el modelo admite y la probabilidad real de surge seria mayor que la simulada. Con pocos dias por zona esa comparacion es ruidosa, asi que sirve para detectar desviaciones grandes, no pequenas.",
    },
  ],
  takeaway:
    "Chebyshev garantiza poco porque no supone nada; Chernoff garantiza mucho mas porque cree en el modelo de llegadas. Ninguna predice: las dos ponen un techo, y la simulacion dice donde esta el piso.",
};
export default doc;
