/** Registro de workshops: el enunciado de cada uno, nada mas.
 *
 * Lo que hay implementado no se declara aca. Se deduce del repo:
 *   - src/wN/taskK_tema.py        el script de la task (lo corre el worker);
 *   - contratos/wN.md             que claves lee el dashboard de cada task;
 *   - components/panels/wN/TaskK.tsx  su panel;
 *   - lib/docs/wN/taskK.ts        su pagina (opcional).
 * scripts/sync-python.mjs los encuentra y los registra, asi que agregar una
 * task no toca este archivo.
 *
 * Agregar un workshop = una entrada aca, su src/wN/dataset.py y su
 * contratos/wN.md. El shell, las tabs, el ruteo, el panel de parametros, el
 * visor de codigo y el modo presentacion se heredan. */

export type WorkshopStatus = "ready" | "planned";

export type Workshop = {
  slug: string;
  n: number;
  title: string;
  subtitle: string;
  status: WorkshopStatus;
  /** Las tasks del enunciado, con su texto y nada mas. */
  tasks: { n: number; title: string; blurb: string }[];
  /** Orden de los paneles en el dashboard, si no es el numerico. */
  order?: number[];
  /** Nota sobre los datos, debajo del titulo del dashboard. */
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
    // El benchmark de QuickSort (Task 2) es lo ultimo que termina: su panel va
    // al final para que no deje un hueco arriba mientras corre.
    order: [1, 5, 4, 3, 2],
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
    status: "ready",
    // Primero el contexto (T1), despues los tres paneles del enunciado
    // (A = Bloom, B = distintos, C = surge + F_k) y al final el muestreo.
    order: [1, 2, 4, 6, 5, 3],
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
      {
        n: 6,
        title: "Dashboard: medidor de surge",
        blurb:
          "Panel C: medidor de surge en vivo por zona, solicitudes contra la cota de probabilidad de la Unidad 1, junto al resultado de F_k.",
      },
    ],
    note:
      "El dataset es el de la Unidad 1 mas dos campos, stream_seq y wait_for_driver_sec, que agrega src/w2/dataset.py sin tocar rides.csv.",
  },
  {
    slug: "3",
    n: 3,
    title: "Cadenas de Markov sobre las reubicaciones de conductores",
    subtitle:
      "El stream de la Unidad 2 se agrega en un grafo: para cada conductor, una arista desde la zona de un viaje hasta la de su siguiente viaje.",
    status: "ready",
    order: [1, 2, 3, 6, 4, 5],
    tasks: [
      {
        n: 1,
        title: "DTMC y clasificacion de estados",
        blurb:
          "Estados = zonas de recogida. Construir M a partir de reloc_count. Hay alguna zona absorbente, donde los conductores llegan y nunca salen?",
      },
      {
        n: 2,
        title: "Distribucion estacionaria",
        blurb:
          "Interpretar pi: en que zonas pasan mas tiempo los conductores a largo plazo; compararla con el conteo de viajes por zona de la Unidad 1.",
      },
      {
        n: 3,
        title: "PageRank",
        blurb:
          "PageRank estandar para rankear las zonas, contra el ranking por volumen de viajes; explicar una zona que quede mas arriba en PageRank que en volumen.",
      },
      {
        n: 4,
        title: "Caminata aleatoria",
        blurb:
          "Simetrizar el grafo, caminar 50.000 pasos o mas y verificar las visitas empiricas contra pi_i = d_i / (2|E|).",
      },
      {
        n: 5,
        title: "2-SAT aleatorizado",
        blurb:
          "Papadimitriou: 5 restricciones de politica de despacho sobre 8 o mas variables.",
      },
      {
        n: 6,
        title: "Dashboard: Panel D",
        blurb:
          "Ranking de PageRank contra ranking por volumen en cada zona, sobre el medidor de surge de la Unidad 1.",
      },
    ],
    note:
      "El grafo sale de src/w3/dataset.py, que lee stream.csv del Workshop 2 y escribe data/edges.csv con el driver_id de cada viaje, como pide el enunciado. Tambien escribe data/edges_despacho.csv, un escenario alterno con despacho espacial que solo usa el Panel D.",
  },
  {
    slug: "4",
    n: 4,
    title: "El grafo de reubicaciones como jobs de MapReduce",
    subtitle:
      "Con mas de 100.000 solicitudes, el grafo de la Unidad 3 se construye con jobs de MapReduce y el PageRank de las zonas se calcula con rondas de Map/Reduce.",
    status: "ready",
    // Las Tasks 3 y 5 corren el pipeline varias veces y terminan al final; el
    // Panel E lee de ellas, asi que el dashboard va despues.
    order: [1, 2, 4, 3, 5, 6],
    tasks: [
      {
        n: 1,
        title: "Pipeline MapReduce",
        blurb:
          "Job 1: agrupar los viajes por driver_id, ordenarlos por stream_seq y contar las reubicaciones entre zonas. Job 2: el resumen por zona. Map en paralelo sobre 8 fragmentos con 2 o mas workers, validado contra la Unidad 3.",
      },
      {
        n: 2,
        title: "PageRank como producto matriz-vector",
        blurb:
          "Una ronda de MapReduce = una multiplicacion: el map emite (j, p(i,j) v_i) y el reduce suma por j. Iterar hasta ||v(t+1) - v(t)||_1 < 1e-6 y coincidir con la Unidad 3 a 1e-4.",
      },
      {
        n: 3,
        title: "Analisis de costo",
        blurb:
          "Tamano del shuffle del Job 1 con y sin combiner, a 1x, 2x y 4x datos: crece lineal y se extrapola a 10x. Mas el costo de PageRank: pares por iteracion por iteraciones.",
      },
      {
        n: 4,
        title: "Tamano de reducer y tasa de replicacion",
        blurb:
          "La clave caliente es el conductor con mas viajes, y q su numero de viajes. r y q de cada job, y el Job 1 con R = 1, 2, 4, 8 reduce tasks.",
      },
      {
        n: 5,
        title: "Eficiencia paralela",
        blurb:
          "El pipeline completo con P = 1, 2, 4, 8 workers en dos tamanos de datos: speedup T_1 / T_P, eficiencia S_P / P y donde cae.",
      },
      {
        n: 6,
        title: "Dashboard: Paneles E y F",
        blurb:
          "Panel E: speedup y eficiencia contra workers, y shuffle con y sin combiner. Panel F: las zonas ordenadas por net_flow junto al medidor de surge de la Unidad 1.",
      },
    ],
    note:
      "src/w4/dataset.py parte stream.csv en 8 fragmentos (data/w4/) y escribe data/nodes.csv, el resumen por zona del enunciado. Las tasks corren sus jobs con el runner compartido src/w4/mapreduce.py; en el navegador no hay procesos, asi que ahi todo corre en secuencia. Los Paneles A a D siguen en los dashboards del W2 y el W3.",
  },
];

export const getWorkshop = (slug: string) => WORKSHOPS.find((w) => w.slug === slug);
