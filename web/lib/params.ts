/** Parametros de ciudad. Cada campo se traduce a una variable RIDES_* que
 *  data_generator.py y las tasks leen de os.environ, asi que mover un control
 *  en la UI es equivalente a exportar esa variable antes de correr el script. */
import { ALL_ZONES, LAMBDA_SUM } from "./generated/city-profile";

export { ALL_ZONES, LAMBDA_SUM };

export type CityParams = {
  zones: string[];
  scale: number;
  days: number;
  seed: number;
  drivers: number;
  kSigma: number;
  mcTrials: number;
  benchTrials: number;
};

/** Escala completa: reproduce exactamente los numeros del informe. */
export const FULL: CityParams = {
  zones: [...ALL_ZONES], scale: 30, days: 14, seed: 42,
  drivers: 1200, kSigma: 2, mcTrials: 50000, benchTrials: 8,
};

/** Escala demo: ~50k filas, pipeline completo en ~14s dentro de Pyodide.
 *  Es la que permite mover parametros y ver el efecto sin esperar dos minutos. */
export const DEMO: CityParams = { ...FULL, scale: 3, mcTrials: 20000, benchTrials: 3 };

export const PRESETS: { id: string; label: string; hint: string; params: CityParams }[] = [
  { id: "demo", label: "Demo", hint: "~50k viajes · pipeline en ~14s", params: DEMO },
  { id: "full", label: "Escala completa", hint: "~495k viajes · ~2 min · iguala el informe", params: FULL },
  {
    id: "small-city", label: "Ciudad pequena", hint: "3 zonas · menos ventanas de concurrencia",
    params: { ...DEMO, zones: ["DOWNTOWN", "AIRPORT", "BELLO"] },
  },
  {
    id: "few-drivers", label: "Pocos conductores", hint: "120 conductores · dispara colisiones en Task 3",
    params: { ...DEMO, drivers: 120 },
  },
];

/** Traduce los parametros a las variables de entorno que leen los scripts. */
export function toEnv(p: CityParams): Record<string, string> {
  const env: Record<string, string> = {
    RIDES_SCALE: String(p.scale),
    RIDES_N_DAYS: String(p.days),
    RIDES_SEED: String(p.seed),
    RIDES_N_DRIVERS: String(p.drivers),
    RIDES_K_SIGMA: String(p.kSigma),
    RIDES_MC_TRIALS: String(p.mcTrials),
    RIDES_BENCH_TRIALS: String(p.benchTrials),
  };
  // RIDES_ZONES solo se manda si es un subconjunto real, para que el caso por
  // defecto sea byte a byte igual a correr el script sin variables de entorno.
  if (p.zones.length !== ALL_ZONES.length) env.RIDES_ZONES = p.zones.join(",");
  return env;
}

/** Filas esperadas antes de generar: suma de BASE_LAMBDA de las zonas
 *  elegidas x escala x dias. Da ~0,4% de error contra el conteo real. */
export function estimateRows(p: CityParams): number {
  const base = p.zones.reduce((acc, z) => acc + (LAMBDA_SUM[z] ?? 0), 0);
  return Math.round(base * p.scale * p.days);
}

/** Segundos aproximados del pipeline completo en Pyodide, medidos a escala
 *  demo (49.823 filas -> 13,9s) y extrapolados: las tasks son ~lineales y el
 *  benchmark de QuickSort crece como n log n. */
export function estimateSeconds(p: CityParams): number {
  const n = Math.max(1, estimateRows(p));
  const r = n / 49823;
  const lineal = 4.2 * r;                                  // generator + tasks 1,3,4,5
  const bench = 9.7 * r * (Math.log2(n) / Math.log2(49823)); // task 2
  return Math.round(lineal + bench);
}

/** Serializa la configuracion a querystring, para compartirla por link. */
export function toQuery(p: CityParams): string {
  const q = new URLSearchParams({
    scale: String(p.scale), days: String(p.days), seed: String(p.seed),
    drivers: String(p.drivers), k: String(p.kSigma),
  });
  if (p.zones.length !== ALL_ZONES.length) q.set("zones", p.zones.join(","));
  return q.toString();
}

export function fromQuery(qs: string, base: CityParams = DEMO): CityParams {
  const q = new URLSearchParams(qs);
  const num = (k: string, d: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : d;
  };
  const zonesRaw = q.get("zones");
  const valid = zonesRaw
    ? zonesRaw.split(",").filter((z) => (ALL_ZONES as readonly string[]).includes(z))
    : null;
  return {
    ...base,
    zones: valid && valid.length ? valid : base.zones,
    scale: num("scale", base.scale),
    days: num("days", base.days),
    seed: num("seed", base.seed),
    drivers: num("drivers", base.drivers),
    kSigma: num("k", base.kSigma),
  };
}
