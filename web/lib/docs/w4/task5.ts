import type { TaskDoc } from "@/lib/tasks";
import type { W4Task5 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

type Run = W4Task5["runs"][number];

/** Las corridas de la escala mas grande, ordenadas por P. */
const escalaMayor = (r: W4Task5): Run[] => {
  const s = Math.max(...r.runs.map((x) => x.scale));
  return r.runs.filter((x) => x.scale === s).sort((a, b) => a.workers - b.workers);
};

/** El mejor speedup medido, con su P y su escala. */
const mejor = (r: W4Task5): Run | undefined => [...r.runs].sort((a, b) => b.speedup - a.speedup)[0];

const doc: TaskDoc<W4Task5> = {
  title: "Mas workers no es mas rapido en la misma proporcion",
  topic: "EFICIENCIA PARALELA",
  statement:
    "S13, escalamiento con claves balanceadas: medir el pipeline completo (jobs 1a, 1b y 2 de la Task 1) con P = 1, 2, 4 y 8 workers en dos o mas tamanos de datos; reportar el speedup S_P = T_1 / T_P y la eficiencia E_P = S_P / P y explicar donde cae la eficiencia.",
  standfirst:
    "El mismo pipeline de la Task 1 se corre con 1, 2, 4 y 8 procesos, a 1x y a 2x datos, siempre con 8 reducers para que el job sea identico y solo cambien los workers. Se compara el tiempo con el de un solo proceso: el speedup dice cuanto mas rapido va y la eficiencia, que fraccion de cada worker se aprovecha.",
  lede: (r) => {
    const m = mejor(r);
    const ult = escalaMayor(r).at(-1);
    if (!m || !ult) return "";
    const aviso = r.parallel
      ? ""
      : " Esta corrida no uso procesos en paralelo, asi que estas cifras no miden speedup: las que se exponen salen de la terminal.";
    return `En una maquina de ${int(r.cpu_count)} nucleos, el mejor speedup fue ${fmt(m.speedup, 2)}x, con P = ${int(
      m.workers
    )} a ${int(m.scale)}x datos. Con P = ${int(ult.workers)} a ${int(ult.scale)}x el speedup es ${fmt(
      ult.speedup,
      2
    )}x y la eficiencia ${fmt(ult.efficiency, 2)}: cada worker extra rinde mucho menos que el primero.${aviso}`;
  },
  metrics: (r) => {
    const m = mejor(r);
    const runs = escalaMayor(r);
    const uno = runs[0];
    const ult = runs.at(-1);
    const out = [
      { label: "Nucleos de la maquina", value: int(r.cpu_count), hint: r.parallel ? "procesos en paralelo" : "sin paralelismo: corrio en secuencia" },
    ];
    if (m) out.push({ label: "Mejor speedup", value: `${fmt(m.speedup, 2)}x`, hint: `P = ${int(m.workers)}, ${int(m.scale)}x datos` });
    if (uno && ult) {
      out.push({ label: `Tiempo a ${int(uno.scale)}x`, value: `${fmt(uno.time_s, 2)} s → ${fmt(ult.time_s, 2)} s`, hint: `P = 1 contra P = ${int(ult.workers)}` });
      out.push({ label: `Eficiencia con P = ${int(ult.workers)}`, value: fmt(ult.efficiency, 2), hint: "1 = cada worker rinde completo" });
      if (uno.map_s && ult.map_s && uno.reduce_s && ult.reduce_s) {
        out.push({
          label: "Cuanto acelera cada fase",
          value: `map ${fmt(uno.map_s / ult.map_s, 1)}x · reduce ${fmt(uno.reduce_s / ult.reduce_s, 1)}x`,
          hint: `de P = 1 a P = ${int(ult.workers)}, ideal ${int(ult.workers)}x`,
        });
      }
    }
    return out;
  },
  sections: [
    {
      h: "Que pregunta responde esta task",
      p: "MapReduce promete repartir el trabajo entre muchas maquinas. La pregunta es cuanto se gana de verdad: si con 8 workers el pipeline tarda la octava parte, o bastante menos de lo esperado. El speedup S_P = T_1 / T_P mide cuantas veces mas rapido va con P workers, y la eficiencia E_P = S_P / P dice que fraccion de cada worker se aprovecha: 1 es el ideal y 0,5 significa que la mitad del esfuerzo se pierde.",
    },
    {
      h: "Paso 1: el mismo job para todos los P",
      p: "Se corre el pipeline completo de la Task 1: 1a agrupa los viajes por conductor y emite las reubicaciones, 1b las suma por par de zonas con un combiner y 2 arma el resumen por zona. Para que solo cambie el numero de workers, todos los P usan 8 reducers, el P mas alto: con el valor por defecto de 4, a P = 8 la mitad del pool se quedaria esperando en cada reduce. El script comprueba que la salida del Job 2 es identica para todos los P y que a 1x coincide con nodes.csv.",
    },
    {
      h: "Paso 2: como se mide el tiempo",
      p: "Cada P abre su propio pool de procesos. El arranque del pool no entra en el tiempo: el runner lo deja aparte. T_P es la suma del tiempo de los tres jobs. Cada medicion se repite tres veces y se toma la mediana, porque una sola corrida tiene ruido del sistema operativo. Se mide a 1x y a 2x datos para ver como cambia la eficiencia cuando hay mas trabajo que repartir.",
    },
    {
      h: "Por que las claves estan balanceadas",
      p: "En 1a la clave es el conductor, y los conductores se sortean al azar viaje por viaje, asi que todos tienen mas o menos los mismos viajes. Ninguna reduce task recibe una clave gigante que la retrase. Por eso, si la eficiencia cae, no es por sesgo de claves: es por lo que no se puede repartir entre procesos.",
    },
    {
      h: "Donde cae la eficiencia",
      p: "Primero, hay fases con pocas tareas: el map de 1b tiene tantas tareas como reducers tuvo 1a, y el Job 2 trabaja sobre solo 100 aristas, asi que ahi casi no hay nada que repartir. Segundo, el proceso principal es uno solo y por el pasan los bytes de todas las map tasks hacia las reduce tasks. Tercero, cada tarea paga un costo fijo: enviar la funcion y el split a otro proceso y serializar sus particiones con pickle. Con un solo proceso ese costo no existe, por eso el reduce puede tardar mas con varios workers. Y cuarto, si P supera los nucleos de la maquina, los procesos se turnan y el speedup se aplana.",
    },
    {
      h: "Lo que dice la ley de Amdahl",
      p: "Si una fraccion f del trabajo no se puede repartir, el speedup nunca pasa de 1 / f, por muchos workers que se agreguen. Aqui esa parte es el reparto en el proceso principal, las fases con pocas tareas y el costo fijo de cada tarea. Con mas datos esa parte pesa menos frente al trabajo que si se reparte, y por eso la eficiencia tiende a mejorar al pasar de 1x a 2x.",
    },
    {
      h: "Como leer los numeros",
      p: "Los tiempos dependen de la maquina: cambian con los nucleos, el sistema operativo y lo que este corriendo al mismo tiempo. En el navegador no hay procesos y todo corre en secuencia, asi que el speedup que sale ahi no mide nada. Las cifras para exponer son las de la terminal, y conviene decir cuantos nucleos tenia la maquina.",
    },
  ],
  takeaway:
    "Duplicar los workers no divide el tiempo a la mitad: la parte que no se reparte, el costo fijo de cada tarea y los nucleos disponibles ponen un techo. Con mas datos ese techo sube, porque el trabajo repartible pesa mas.",
};
export default doc;
