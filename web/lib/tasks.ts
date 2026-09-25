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
export type TaskPanelKey = "kpis" | "task3" | "panelA" | "panelB" | "panelC" ;

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

const T1: TaskDoc = {
  n: 1,
  slug: "1",
  title: "La hora pico es un problema de red y de disco",
  topic: "CONTEXTO DE BIG DATA",
  statement:
    "Estimar las solicitudes por segundo a nivel ciudad en la hora pico, y dimensionar el almacenamiento si la ciudad crece 10x.",
  source: "src/task1_bigdata.py",
  standfirst:
    "Se agrupa el dataset por hora, se toma la de mayor demanda a nivel ciudad y se convierte en solicitudes por segundo. Despues se mide el tamaño promedio del registro y se proyecta el almacenamiento anual si la demanda crece diez veces. El pico no es un dato curioso: es el que fija el dimensionamiento.",
  lede: (p) => {
    const r = p.kpis?.task1;
    if (!r) return "";
    return `Agrupando el dataset por hora, la de mayor demanda a nivel ciudad recibe ${fmt(r.peak_req_per_sec, 2)} solicitudes por segundo. Si la demanda crece 10x, la cifra sube a ${fmt(r.peak_req_per_sec_10x, 2)} y el almacenamiento anual pasaria de ${fmt(r.storage_year_gb,  1)} GB a ${fmt(r.storage_year_10x_gb,  1)} GB. Ese contraste — de ${fmt(r.storage_year_gb,  1)} a ${fmt(r.storage_year_10x_gb,  1)} GB — es la diferencia entre operar y dimensionar para crecer.`;
  },
  metrics: (p) => {
    const r = p.kpis?.task1;
    if (!r) return [];
    return [
      { label: "Solicitudes por segundo (pico)", value: fmt(r.peak_req_per_sec,  2), hint:"a nivel ciudad, en la hora de mayor demanda" },
      { label:"Solicitudes por segundo (10x)", value: fmt(r.peak_req_per_sec_10x,  2), hint:"si la demanda crece diez veces" },
      { label:"Almacenamiento anual", value: `${fmt(r.storage_year_gb,  1)} GB`, hint:"con la demanda actual" },
      { label:"Almacenamiento anual (10x)", value: `${fmt(r.storage_year_10x_gb,  1)} GB`, hint:"con crecimiento 10x" },
      { label:"Solicitudes totales", value: int(r.total_requests), hint:`${int(r.n_days)} dias simulados` },
    ];
  },
  sections: [
    {
      h: "Que es esta task y por que es la primera",
      p: "Antes de escribir hashing, colas de despacho o surge pricing, hay que saber a que escala opera el sistema. Esta task no resuelve nada inteligente: solo pone dos numeros sobre la mesa — solicitudes por segundo en el pico y almacenamiento proyectado a crecimiento. Esos dos numeros son los que justifican que las demas tasks existan: si el pico fueran 2 solicitudes por segundo no haria falta hashing ni power-of-two-choices; con cientos, cada milisegundo cuenta.",
    },
    {
      h: "Paso 1: agrupar por hora y encontrar el pico",
      p: "El dataset no llega ordenado por demanda: las solicitudes se reparten por zona y por hora segun un proceso de Poisson no homogeneo, con un perfil de intensidad distinto por zona. Para encontrar el momento critico se truncan todos los timestamps a la hora y se agrupan: cada grupo es una hora de la simulacion a nivel ciudad. La hora con mas solicitudes es la pico. Esa hora es la que fija cuantos despachadores, colas y servidores hacen falta.",
    },
    {
      h: "Paso 2: de la hora pico a solicitudes por segundo",
      p: "Una vez identificada la hora pico, se divide su conteo entre 3600 segundos. El resultado son las solicitudes por segundo a nivel ciudad en el peor momento del dia. Ese numero es el que dimensiona la red: cuantas peticiones por segundo tiene que aguantar el sistema de despacho sin degradarse. Si se dimensiona para el promedio, en el pico las colas crecen mas rapido de lo que se vacian.",
    },
    {
      h: "Paso 3: medir el registro y proyectar el almacenamiento",
      p: "Para saber cuanto disco se necesita, se mide el tamaño promedio de un registro sobre una muestra del CSV — como proxy del tamaño que ocuparia en una base real. Ese promedio se multiplica por el volumen diario de solicitudes para obtener los bytes por dia. Luego se proyecta a un año de retencion operativa (365 dias) y se convierte a gigabytes. El resultado es el almacenamiento minimo que habria que tener hoy.",
    },
    {
      h: "Paso 4: que pasa si la ciudad crece 10x",
      p: "El enunciado pide dimensionar para crecimiento. Se toma el volumen diario y se multiplica por 10 — simular que la demanda se multiplica por diez — y se vuelve a proyectar a un año. La diferencia entre el numero actual y el de 10x es la que de verdad importa para planear: comprar disco para hoy es facil; comprarlo para el doble, el triple o diez veces mas es lo que exige arquitectura. Ambos numeros (actual y 10x) se muestran juntos en el panel para que el contraste se vea de un vistazo.",
    },
    {
      h: "Por que se mide en el pico y no en el promedio",
      p: "Dimensionar para el promedio es planear el colapso. La tarifa dinamica (surge pricing) no se activa por el promedio: se activa cuando una zona supera un umbral de desviaciones sobre su media. La hora pico a nivel ciudad es el escenario donde mas zonas superan ese umbral a la vez y donde el sistema recibe la mayor presion de red y de almacenamiento. Si el sistema aguanta el pico, aguanta todo lo demas.",
    },
    {
      h: "Limitaciones del estimado",
      p: "El calculo de almacenamiento es una cota inferior: usa el tamaño del registro tal como viaja en el CSV y no incluye indices, replicas, backups ni logs, que en produccion multiplican la cifra varias veces. Tampoco modela compresion ni archivado de datos viejos. Sirve para ordenar de magnitud y comparar escenarios, no como presupuesto final de infraestructura.",
    },
    {
      h: "Como leerlo en el dashboard",
      p: "Todo sale de la corrida actual del generador: mover los parametros de ciudad (escala, zonas, dias) regenera el dataset y cambia los numeros, y la exposicion los sigue sin contradecir al panel. Las solicitudes por segundo fijan la red; el almacenamiento con crecimiento fija el disco. Son dos decisiones de arquitectura distintas que esta task reduce a dos numeros comparables.",
    },
  ],
  takeaway:
    "El pico define el sistema:las solicitudes por segundo fijan la red,y el almacenamiento con crecimiento fija el disco. Dimensionar para el promedio es planear el colapso.",
  panel:"kpis",
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
  "1": [T1, T2, T4],
};

export const getTaskDocs = (slug: string): TaskDoc[] => TASK_DOCS[slug] ?? [];

export const getTaskDoc = (slug: string, task: string): TaskDoc | undefined =>
  getTaskDocs(slug).find((t) => t.slug === task);
