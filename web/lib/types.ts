/** Formas que produce el pipeline Python. Se corresponden 1:1 con lo que
 *  devuelven las funciones build_* de dashboard/build_dashboard.py. */

export type PanelA = {
  zone: string;
  window: string;
  n_requests: number;
  B_buckets: number;
  chaining_loads: number[];
  p2c_loads: number[];
  /** Carga maxima esperada en el regimen cargado (n/B >> 1), no la formula de
   *  m = n que se ve en clase. Opcional: una corrida vieja no la trae. */
  theory?: {
    avg_load: number;
    chaining_expected_max: number;
    p2c_expected_max: number;
  } | null;
  /** Claves tal como las escribe src/task4_hashtable.py. */
  summary: {
    B_buckets: number;
    n_windows_analyzed: number;
    avg_max_load_chaining: number;
    avg_max_load_p2c: number;
    worst_max_load_chaining: number;
    worst_max_load_p2c: number;
    theory_note?: string;
  };
};

export type PanelBSeries = {
  n: number[];
  randomized_time: number[];
  deterministic_time: number[];
  /** Comparaciones reales del quicksort aleatorizado, y las 2n ln n que predice
   *  el teorema. Opcionales: una corrida vieja puede no traerlas. */
  randomized_comparisons?: number[];
  expected_comparisons?: number[];
};

export type PanelB = {
  random_input: PanelBSeries;
  sorted_input_worst_case: PanelBSeries;
  /** Cuantas tarifas distintas hay. El teorema 2n ln n supone elementos
   *  distintos, asi que este dato es el que explica la desviacion. */
  fare_distribution?: {
    n_total: number;
    n_distinct: number;
    avg_repeats: number;
    max_repeats: number;
  } | null;
};

export type PanelCZone = {
  zone: string;
  peak_hour: number;
  mu: number;
  sigma: number;
  sigma_hat: number;
  threshold: number;
  chebyshev_bound: number;
  chernoff_bound: number;
  monte_carlo_prob: number;
  /** Conteos diarios reales, si la task los reporta. Se superponen sobre la
   *  distribucion teorica; sin ellos se dibuja solo la curva. */
  daily_counts?: number[];
};

export type PanelC = { k_sigma: number; zones: PanelCZone[] };

export type Kpis = {
  task1: {
    peak_req_per_sec: number;
    peak_req_per_sec_10x: number;
    storage_year_gb: number;
    storage_year_10x_gb: number;
    total_requests: number;
    n_days: number;
  };
  task3: {
    K_values: number[];
    universal_load_factor: number[];
    /** Vacio si la Task 3 no reporto baseline ingenuo. El enunciado solo pide
     *  medir colisiones, asi que el panel se dibuja igual sin esto. */
    naive_load_factor: number[];
    /** Colisiones medidas y la cota C(n,2)/K, si la task las reporta. */
    universal_collisions?: number[];
    theoretical_collisions?: number[];
  };
};

/** Cada panel aparece en cuanto su task termina, no al final del pipeline,
 *  asi que todos los campos son opcionales durante la corrida. */
export type Panels = {
  panelA?: PanelA;
  panelB?: PanelB;
  panelC?: PanelC;
  kpis?: Kpis;
};

export type RawResults = Record<string, unknown>;

/** Por que un panel quedo vacio aunque su task SI corrio: su JSON no trae las
 *  claves que el build_* indexa. La clave es el nombre del panel (o el de la
 *  task, si lo que fallo fue leer el archivo). Lo llena build_panels(). */
export type PanelErrors = Record<string, string>;

export type StageKey = "generator" | "task1" | "task2" | "task3" | "task4" | "task5";

export type StageState = {
  key: StageKey;
  label: string;
  status: "pending" | "running" | "done" | "error";
  seconds?: number;
  output?: string;
};

export type DatasetPreview = {
  rows: Record<string, string>[];
  total: number;
  bytes: number;
};
