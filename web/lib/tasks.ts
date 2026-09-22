/** Contenido por task: enunciado, metodo, hallazgos y que decir al exponer.
 *
 * Fuente unica de la prosa. La consumen la pagina dedicada de cada task
 * (app/w/[slug]/t/[task]) y el modo diapositivas (SlideDeck), asi que el texto
 * no se duplica entre las dos vistas.
 *
 * Regla: aca NO se escriben numeros a mano. Todo dato medido sale de la
 * corrida que este cargada, via `lede` y `metrics`, que reciben los paneles.
 * Asi mover un parametro de ciudad cambia tambien la exposicion, y nunca
 * queda una cifra escrita que contradiga al grafico que tiene al lado.
 *
 * Solo hay entrada para las tasks implementadas en este repo. El resto figura
 * en lib/workshops.ts como hoja de ruta, con el enunciado y nada mas: cuando
 * alguien agregue su script, agrega aca su TaskDoc y hereda la pagina, el
 * modo presentacion y el panel sin tocar nada mas. */

import type { Panels } from "./types";
import type { CityParams } from "./params";
import { fmt, int } from "./format";

/** Que panel del dashboard se incrusta en la diapositiva de esta task. */
export type TaskPanelKey = "kpis" | "task3" | "panelA" | "panelB" | "panelC";

export type TaskMetric = { label: string; value: string; hint?: string };

export type TaskDoc = {
  n: number;
  slug: string;
  /** Titulo corto y afirmativo: es el titular de la diapositiva. */
  title: string;
  /** Tema, para el tag monoespaciado del encabezado. */
  topic: string;
  /** El enunciado original, traducido. Lo que hay que demostrar que se hizo. */
  statement: string;
  /** Script que produce los numeros; enlaza con la pestana Codigo. */
  source: string;
  /** Titular sin datos, para la primera pintada y el HTML prerenderizado.
   *  Nunca menciona cifras: se muestra antes de que haya corrida. */
  standfirst: string;
  /** Titular con datos de la corrida actual. */
  lede: (p: Panels, params: CityParams) => string;
  /** Cifras de la corrida actual, para leer en voz alta sin buscar en el grafico. */
  metrics: (p: Panels) => TaskMetric[];
  /** Explicacion larga. Es lo que la diapositiva no alcanza a decir. */
  sections: { h: string; p: string }[];
  /** La frase con la que se cierra la task al exponer. */
  takeaway: string;
  panel: TaskPanelKey | null;
};

const T2: TaskDoc = {
  n: 2,
  slug: "2",
  title: "La aleatorizacion no acelera: elimina el peor caso",
  topic: "ALGORITMO ALEATORIZADO",
  statement:
    "Usar QuickSort aleatorizado para rankear viajes por tarifa, o reservoir sampling para estimar rapido la tarifa promedio; comparar contra ordenar o contar el dataset completo.",
  source: "src/task2_randomized.py",
  standfirst:
    "Se compara QuickSort con pivote aleatorio contra pivote fijo, y reservoir sampling contra el calculo exacto. La ventaja de aleatorizar no aparece donde uno la espera.",
  lede: (p) => {
    const s = p.panelB?.sorted_input_worst_case;
    const last = s ? s.n.length - 1 : -1;
    const ratio = s && last >= 0 && s.randomized_time[last] > 0 ? s.deterministic_time[last] / s.randomized_time[last] : null;
    return `Con las tarifas en orden natural, el pivote aleatorio y el fijo empatan — el aleatorio incluso cuesta un poco mas por generar numeros. La diferencia aparece con la entrada ya ordenada, donde el pivote fijo degenera a O(n^2)${
      ratio ? ` y tarda ${fmt(ratio, 0)} veces mas con n=${int(s?.n[last])}` : ""
    }.`;
  },
  metrics: (p) => {
    const r = p.panelB?.random_input;
    const s = p.panelB?.sorted_input_worst_case;
    const li = r ? r.n.length - 1 : -1;
    const ls = s ? s.n.length - 1 : -1;
    const out: TaskMetric[] = [];
    if (r && li >= 0) {
      out.push({
        label: `Entrada desordenada (n=${int(r.n[li])})`,
        value: `${fmt(r.randomized_time[li], 2)} s`,
        hint: `pivote fijo ${fmt(r.deterministic_time[li], 2)} s — empate`,
      });
    }
    if (s && ls >= 0) {
      out.push({
        label: `Entrada ya ordenada (n=${int(s.n[ls])})`,
        value: `${fmt(s.randomized_time[ls], 3)} s`,
        hint: `pivote fijo ${fmt(s.deterministic_time[ls], 2)} s — colapso`,
      });
    }
    // El tiempo depende de la maquina; las comparaciones son lo que el teorema
    // predice, asi que es la cifra que de verdad contrasta teoria con medicion.
    const medidas = r?.randomized_comparisons;
    const teoria = r?.expected_comparisons;
    if (r && medidas && teoria && li >= 0 && teoria[li] > 0) {
      out.push({
        label: "Comparaciones vs. 2n ln n",
        value: `${fmt(medidas[li] / teoria[li], 2)}x`,
        hint: `${int(medidas[li])} medidas contra ${int(teoria[li])} previstas`,
      });
    }
    return out;
  },
  sections: [
    {
      h: "Los dos experimentos",
      p: "Primero QuickSort con pivote aleatorio contra pivote fijo (el primer elemento), sobre las tarifas en su orden natural y sobre las tarifas ya ordenadas ascendentemente. Despues reservoir sampling contra el calculo exacto, para la media y para los cuantiles. Cada punto es el promedio de varias repeticiones.",
    },
    {
      h: "Por que el caso adversario se corta en n = 8000",
      p: "Con la entrada ordenada el pivote fijo parte el arreglo en 1 y n-1 en cada nivel: la recursion se vuelve lineal en profundidad y el costo cuadratico. A escala completa no terminaria, asi que ese escenario se mide hasta n = 8000 y ademas se sube el limite de recursion, capturando el desborde en una bandera en vez de dejar que reviente. No es una limitacion del experimento: es exactamente el resultado que se queria mostrar.",
    },
    {
      h: "El muestreo pierde en tiempo y gana en memoria",
      p: "Para la media, reservoir sampling es mas lento que sumar y dividir: ambos recorren el stream una vez con memoria constante, pero el muestreo paga generar un aleatorio por elemento. Esa comparacion esta puesta a proposito, porque muestra que muestrear no es un atajo de velocidad. Donde si gana es en los cuantiles: calcularlos exactos exige tener los n elementos en memoria, mientras el reservorio trabaja con k fijo y da un error de decimas de punto porcentual.",
    },
    {
      h: "Por que importa en este dominio",
      p: "Las tarifas casi nunca llegan desordenadas: vienen de una consulta con ORDER BY, de un indice, o de un archivo particionado por fecha. Es decir, el peor caso del pivote fijo es el caso comun en produccion. El pivote aleatorio no mejora el promedio, pero hace que ningun orden de entrada en particular sea el malo.",
    },
    {
      h: "Donde la medicion se separa de la teoria, y por que",
      p: "El teorema dice que el quicksort aleatorizado hace 2n ln n comparaciones en promedio, sumando sobre cada par la probabilidad de que lleguen a compararse. La medicion lo sigue bien hasta cierto tamanio y despues se despega hacia arriba. No es un error de implementacion: la demostracion supone que los elementos son distintos, y estas tarifas estan redondeadas a peso entero, asi que cada valor se repite decenas de veces. La particion de Lomuto compara con <=, de modo que todos los valores iguales al pivote se van del mismo lado y la particion se desbalancea. Se reporta el conteo de valores distintos junto a la razon justamente para que la desviacion se pueda atribuir a su causa y no quede como un numero raro.",
    },
  ],
  takeaway:
    "La aleatorizacion no compra velocidad, compra la garantia de que no existe una entrada que te hunda. Se paga un poco en el caso comun para que no exista el caso catastrofico.",
  panel: "panelB",
};

const T4: TaskDoc = {
  n: 4,
  slug: "4",
  title: "Dos consultas en vez de una",
  topic: "TABLA HASH",
  statement:
    "Construir una tabla hash indexada por pickup_zone para agrupar las solicitudes concurrentes; comparar la carga de los buckets con encadenamiento contra power-of-two-choices.",
  source: "src/task4_hashtable.py",
  standfirst:
    "Las solicitudes que compiten en la misma zona y la misma ventana de 5 minutos se reparten entre colas de despacho, con encadenamiento y con power-of-two-choices. La segunda consulta cambia el peor caso.",
  lede: (p) => {
    const s = p.panelA?.summary;
    return `Sobre ${int(s?.n_windows_analyzed)} ventanas de cinco minutos, la cola mas cargada baja de ${fmt(
      s?.avg_max_load_chaining,
      2
    )} a ${fmt(
      s?.avg_max_load_p2c,
      2
    )} solicitudes en promedio con solo mirar dos colas en vez de una. En la peor ventana observada, de ${fmt(
      s?.worst_max_load_chaining,
      0
    )} a ${fmt(s?.worst_max_load_p2c, 0)}.`;
  },
  metrics: (p) => {
    const s = p.panelA?.summary;
    if (!s) return [];
    const t = p.panelA?.theory;
    const medido = p.panelA?.chaining_loads?.length
      ? Math.max(...p.panelA.chaining_loads)
      : null;
    return [
      { label: "Carga maxima promedio", value: fmt(s.avg_max_load_chaining, 2), hint: `power-of-two-choices ${fmt(s.avg_max_load_p2c, 2)}` },
      { label: "Peor ventana observada", value: fmt(s.worst_max_load_chaining, 0), hint: `power-of-two-choices ${fmt(s.worst_max_load_p2c, 0)}` },
      { label: "Ventanas analizadas", value: int(s.n_windows_analyzed), hint: `${fmt(s.B_buckets, 0)} colas de despacho` },
      ...(t
        ? [
            {
              label: "Cota teorica en esta ventana",
              value: fmt(t.chaining_expected_max, 1),
              hint:
                medido !== null
                  ? `medido ${fmt(medido, 0)} — carga media ${fmt(t.avg_load, 2)}`
                  : `carga media ${fmt(t.avg_load, 2)}`,
            },
          ]
        : []),
    ];
  },
  sections: [
    {
      h: "Que es una ventana",
      p: "Las solicitudes se agrupan por (zona, ventana de 5 minutos): cada grupo es el conjunto de viajes que compiten por un conductor casi al mismo tiempo en el mismo sitio. Cada grupo se reparte entre B colas de despacho y se mide la carga de la cola mas llena. Esa cola es la que fija cuanto espera el pasajero con peor suerte de esa ventana.",
    },
    {
      h: "Las dos estrategias",
      p: "Con encadenamiento, cada solicitud se manda a la cola que le indique su hash y se encola ahi. Con power-of-two-choices se calculan dos hashes independientes, se miran las dos colas candidatas y la solicitud va a la menos cargada. El costo adicional es un hash y una comparacion por solicitud.",
    },
    {
      h: "Por que mejora tanto por tan poco",
      p: "Con una sola opcion, la carga maxima esperada crece como Theta(log n / log log n). Con dos opciones cae a Theta(log log n): una mejora exponencial en la cota, no una constante. La intuicion es que basta una segunda opcion para romper el efecto de bola de nieve por el que un bucket que va ganando sigue ganando. Pasar de dos a tres opciones ya casi no aporta.",
    },
    {
      h: "Lo que se mide y lo que se promete",
      p: "El promedio sobre todas las ventanas confirma la mejora, pero el numero que vale es la peor ventana: es la que define el SLA. Ahi es donde la diferencia entre las dos estrategias se vuelve visible para un pasajero real, no solo para una grafica.",
    },
    {
      h: "Cual es la cota que aplica",
      p: "Las cotas que se ven en clase (del orden de log n sobre log log n para una opcion, y log log n para dos) se derivan suponiendo tantas bolas como bins: una solicitud por cola en promedio. Este escenario no es ese. En la ventana mas concurrida hay del orden de cien solicitudes para dieciseis colas, o sea una carga media muy por encima de uno, y en ese regimen la carga maxima es la media mas una desviacion. Si se cita la formula del caso balanceado sin el ajuste, las mediciones aparentan violar la cota; con la del regimen cargado, lo medido y lo predicho coinciden de cerca. Distinguir los dos regimenes es la mitad del ejercicio.",
    },
  ],
  takeaway:
    "Es el mejor retorno por complejidad de todo el proyecto: un hash adicional por solicitud compra una mejora exponencial en el peor caso.",
  panel: "panelA",
};

/** Tasks documentadas por workshop. Un workshop sin entrada aca simplemente no
 *  muestra el indice ni genera paginas: no hay que tocar nada mas. */
export const TASK_DOCS: Record<string, TaskDoc[]> = {
  "1": [T2, T4],
};

export const getTaskDocs = (slug: string): TaskDoc[] => TASK_DOCS[slug] ?? [];

export const getTaskDoc = (slug: string, task: string): TaskDoc | undefined =>
  getTaskDocs(slug).find((t) => t.slug === task);
