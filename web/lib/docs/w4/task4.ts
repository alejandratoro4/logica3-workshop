import type { TaskDoc } from "@/lib/tasks";
import type { W4Task4 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

type Job = W4Task4["jobs"][number];
type Sweep = W4Task4["reducer_sweep"][number];

const job = (r: W4Task4, nombre: string): Job | undefined => r.jobs.find((j) => j.job === nombre);

const barrido = (r: W4Task4): Sweep[] => [...r.reducer_sweep].sort((a, b) => a.reduce_tasks - b.reduce_tasks);

/** Carga maxima sobre carga media (1 = reparto perfecto). */
const desbalance = (s: Sweep) => (s.mean_reducer_load ? s.max_reducer_load / s.mean_reducer_load : 1);

const claveTexto = (j: Job) =>
  j.hot_key_ties !== undefined && j.hot_key_ties > 1 ? `empate entre ${int(j.hot_key_ties)} claves` : j.hot_key;

const doc: TaskDoc<W4Task4> = {
  title: "q lo pone la clave mas cargada; el reparto lo pone el hash",
  topic: "TAMANO DE REDUCER Y REPLICACION",
  statement:
    "Clave caliente del Job 1 = el driver_id con mas viajes; q es su numero de viajes. Reportar r y q de cada job y correr el Job 1 con R = 1, 2, 4 y 8 reduce tasks para mostrar el efecto en la carga maxima por reducer.",
  standfirst:
    "Para cada job del pipeline se mide la tasa de replicacion r (cuantos pares emite el map por registro de entrada) y el tamano de reducer q (cuantos valores recibe la clave mas cargada), sin combiner. Despues se corre la ronda que agrupa por conductor con 1, 2, 4 y 8 reduce tasks y se compara la carga del reducer mas cargado con el promedio.",
  lede: (r) => {
    const s = barrido(r);
    const ult = s.at(-1);
    const b = job(r, "1b");
    if (!ult) return "";
    const n = s[0]?.max_reducer_load ?? 0;
    const q = r.hot_driver.rides;
    const limita =
      q < ult.mean_reducer_load
        ? `Sus ${int(q)} viajes quedan por debajo de los ${int(ult.mean_reducer_load)} pares que le tocan en promedio a cada reducer con R = ${int(
            ult.reduce_tasks
          )}, asi que no es la clave caliente la que frena: el maximo (${int(ult.max_reducer_load)}) sale de como reparte el hash.`
        : `Con R = ${int(ult.reduce_tasks)} la carga media ya no supera sus ${int(q)} viajes: el maximo no puede bajar de ${int(q)}, porque una clave no se parte, asi que cada reducer de mas ayuda menos.`;
    const t1a = job(r, "1a")?.hot_key_ties ?? 1;
    const empate = t1a > 1 ? ` (empatado con ${t1a === 2 ? "otro" : `${int(t1a - 1)} mas`})` : "";
    return `El conductor con mas viajes es ${r.hot_driver.driver_id}${empate}, con ${int(q)}: ese es q en la ronda que agrupa por conductor, y r = 1 porque cada viaje se emite una sola vez.${
      b ? ` Contar pares de zonas sin combiner tiene q = ${int(b.reducer_size_q)}, el reloc_count del par mas frecuente.` : ""
    } Con R = 1 un solo reducer recibe los ${int(n)} viajes. ${limita}`;
  },
  metrics: (r) => {
    const s = barrido(r);
    const primero = s[0];
    const ult = s.at(-1);
    const out = [
      { label: "Clave caliente del Job 1", value: r.hot_driver.driver_id, hint: `q = ${int(r.hot_driver.rides)} viajes` },
    ];
    for (const j of r.jobs) {
      out.push({ label: `Job ${j.job}`, value: `r = ${fmt(j.replication_rate, 2)} · q = ${int(j.reducer_size_q)}`, hint: claveTexto(j) });
    }
    if (primero && ult && ult !== primero) {
      out.push({
        label: `Carga maxima, R = ${int(primero.reduce_tasks)} → ${int(ult.reduce_tasks)}`,
        value: `${int(primero.max_reducer_load)} → ${int(ult.max_reducer_load)}`,
        hint: `${fmt(primero.max_reducer_load / ult.max_reducer_load, 2)}x menos; ideal ${fmt(ult.reduce_tasks / primero.reduce_tasks, 0)}x`,
      });
      out.push({ label: `Desbalance con R = ${int(ult.reduce_tasks)}`, value: `${fmt(desbalance(ult), 3)}×`, hint: "maxima / media; 1 = reparto perfecto" });
    }
    return out;
  },
  sections: [
    {
      h: "Las dos medidas del curso",
      p: "La tasa de replicacion r es el numero de pares que emite el map por cada registro de entrada; multiplicada por la entrada da el tamano del shuffle. El tamano de reducer q es el maximo de valores que recibe una sola clave. Como todos los valores de una clave van al mismo reducer, q es el trabajo minimo del reducer mas cargado y la memoria que necesita. Bajar uno suele subir el otro: es el compromiso de la Clase 20.",
    },
    {
      h: "Por que sin combiner",
      p: "El combiner suma dentro de cada map antes del shuffle. No cambia lo que emite el map, pero si lo que llega a los reducers: en la ronda que cuenta pares, con combiner cada par de zonas recibe un valor por map task y q saldria igual al numero de map tasks. Eso es una propiedad de como se corrio el job, no del algoritmo; por eso r y q se miden sin combiner.",
    },
    {
      h: "r y q de cada job",
      p: "Agrupar por conductor: un par por viaje (r = 1) y q = los viajes del conductor mas activo. Contar pares de zonas: un par por reubicacion (r = 1) y q = el reloc_count del par mas frecuente. Resumen por zona: cada arista avisa a su zona de salida y a la de llegada (r = 2); como todos los pares de zonas aparecen, cada zona recibe una arista que sale y una que llega por cada zona de la ciudad, asi que q = 2 x zonas (20 con las 10 zonas) y todas empatan. Una ronda de PageRank: cada entrada de la matriz aporta a su columna (r = 1) y cada zona recibe un aporte por zona de origen (q = zonas).",
    },
    {
      h: "El barrido de reducers",
      p: "La ronda que agrupa por conductor se corre con 1, 2, 4 y 8 reduce tasks. Cada conductor va al reducer h(driver_id) mod R, con un hash estable (blake2b). La carga maxima no puede bajar de N / R, que seria el reparto perfecto, ni de q, porque los viajes de un conductor no se parten. Mientras q este muy por debajo de N / R, lo que separa el maximo del promedio es el azar del hash: con mas reducers cada uno recibe menos conductores y una racha de conductores grandes pesa mas, por eso el desbalance crece con R.",
    },
    {
      h: "Comprobaciones",
      p: "El script cuenta los viajes de cada conductor directamente, sin MapReduce, y verifica que salga la misma clave caliente y el mismo q que midio el runner; que el q de la ronda de conteo sea el mayor reloc_count; y que en cada R las cargas sumen todos los viajes y el maximo respete las dos cotas.",
    },
  ],
  takeaway:
    "Mas reducers bajan la carga maxima hasta donde lo permiten el hash y la clave mas cargada; aqui la clave caliente queda lejos, asi que el limite real es el reparto.",
};

export default doc;
