/** Registro de workshops.
 *
 * Agregar un workshop = agregar una entrada aca (y, cuando exista, su codigo
 * bajo w2/src). El shell, las tabs, el ruteo estatico, el runtime de Pyodide,
 * el panel de parametros, el visor de codigo y el modo presentacion ya estan
 * y se heredan sin tocar nada. */

export type WorkshopStatus = "ready" | "planned";

export type Workshop = {
  slug: string;
  n: number;
  title: string;
  subtitle: string;
  status: WorkshopStatus;
  /** Tareas del enunciado. En los workshops "planned" se listan como hoja de ruta. */
  tasks?: { n: number; title: string; blurb: string }[];
  /** Nota que se muestra en el slot mientras status === "planned". */
  note?: string;
};

export const WORKSHOPS: Workshop[] = [
  {
    slug: "1",
    n: 1,
    title: "Ride-Sharing Dispatch & Surge Pricing",
    subtitle:
      "Big Data, algoritmos aleatorizados, hashing universal, tablas hash y cotas de concentracion.",
    status: "ready",
    // Las cinco del enunciado, con el texto del enunciado y nada mas. Cual
    // esta implementada NO se marca aca: se deduce de si tiene TaskDoc en
    // lib/tasks.ts, para que no existan dos listas que se puedan contradecir.
    tasks: [
      {
        n: 1,
        title: "Contexto de Big Data",
        blurb:
          "Estimar las solicitudes de viaje por segundo en toda la ciudad en hora pico, y el almacenamiento con un crecimiento de 10x.",
      },
      {
        n: 2,
        title: "Algoritmo aleatorizado",
        blurb:
          "QuickSort aleatorizado para rankear viajes por tarifa, o reservoir sampling para estimar la tarifa promedio; contra ordenar o contar el dataset completo.",
      },
      {
        n: 3,
        title: "Hashing universal",
        blurb:
          "Hashear driver_id para rutear las solicitudes de viaje a los procesos de despacho; medir las colisiones.",
      },
      {
        n: 4,
        title: "Tabla hash",
        blurb:
          "Tabla hash indexada por pickup_zone para agrupar las solicitudes concurrentes; comparar encadenamiento contra power-of-two-choices.",
      },
      {
        n: 5,
        title: "Analisis de probabilidad",
        blurb:
          "Chernoff o Chebyshev para acotar la probabilidad de que una zona reciba un numero inusualmente alto de solicitudes: la senial para activar surge pricing.",
      },
    ],
  },
  {
    slug: "2",
    n: 2,
    title: "Streams de solicitudes y resumenes en linea",
    subtitle:
      "El indice de despacho de la Unidad 1 ahora recibe un flujo continuo: las decisiones de surge se toman desde resumenes, no desde el historico almacenado.",
    status: "planned",
    tasks: [
      {
        n: 1,
        title: "Modelo de stream y diseno de consultas",
        blurb:
          "Promedio movil de wait_for_driver_sec por zona sobre las ultimas 500 solicitudes, y cuantos pasajeros distintos pidieron viaje en la ultima hora, dentro de un presupuesto de 10 MB.",
      },
      {
        n: 2,
        title: "Filtro de Bloom",
        blurb:
          "Pasajeros ya emparejados en el minuto, para evitar doble despacho. k = floor((n/m) ln 2), con tasa de falsos positivos empirica contra la teorica.",
      },
      {
        n: 3,
        title: "Muestreo sobre el stream",
        blurb:
          "Reservoir sampling con reservorios de 100/300/500 para estimar tarifa y espera promedio por zona, contra los valores verdaderos.",
      },
      {
        n: 4,
        title: "Conteo de distintos",
        blurb:
          "Flajolet-Martin con 10 o mas funciones hash para estimar cuantos rider_id distintos hay activos, contra el conteo exacto.",
      },
      {
        n: 5,
        title: "Momentos de frecuencia",
        blurb:
          "F0, F1 y F2 exactos sobre pickup_zone. Un F2 alto significa que pocas zonas concentran la demanda: candidatas a surge.",
      },
    ],
    note:
      "El dataset es el de la Unidad 1 mas dos campos: stream_seq y wait_for_driver_sec. El Panel C reusa la cota de probabilidad de la Task 5 del Workshop 1, asi que el generador y esa task se comparten en vez de duplicarse.",
  },
  {
    slug: "3",
    n: 3,
    title: "Workshop 3",
    subtitle: "Sin enunciado todavia.",
    status: "planned",
    note:
      "Cuando salga el enunciado, se registra aca igual que el Workshop 2 y hereda toda la infraestructura.",
  },
];

export const getWorkshop = (slug: string) => WORKSHOPS.find((w) => w.slug === slug);
