import type { TaskDoc } from "@/lib/tasks";
import type { W2Task3 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

/** Error relativo medio entre zonas, en %, para un tamano de reservorio. */
function errorMedio(r: W2Task3, size: number, campo: "fare" | "wait"): number {
  const errores: number[] = [];
  for (const z of r.zones) {
    const b = z.by_size.find((x) => x.size === size);
    if (!b) continue;
    const real = campo === "fare" ? z.true_avg_fare : z.true_avg_wait;
    const est = campo === "fare" ? b.est_avg_fare : b.est_avg_wait;
    if (real) errores.push((100 * Math.abs(est - real)) / Math.abs(real));
  }
  return errores.length ? errores.reduce((a, b) => a + b, 0) / errores.length : 0;
}

const doc: TaskDoc<W2Task3> = {
  title: "Un reservorio de tamano fijo estima el promedio de cada zona",
  topic: "MUESTREO SOBRE EL STREAM",
  statement:
    "Reservoir sampling: muestrear viajes para estimar la tarifa promedio y wait_for_driver_sec por zona; comparar con los valores verdaderos con reservorios de 100, 300 y 500.",
  standfirst:
    "El stream se lee una sola vez, sin conocer su longitud. Por cada zona se mantiene un reservorio de tamano fijo con una muestra uniforme de sus viajes, y con esa muestra se estiman la tarifa y la espera promedio. El promedio verdadero se lleva aparte con suma y conteo para medir el error.",
  lede: (r) => {
    if (!r.sizes.length || !r.zones.length) return "";
    const k0 = r.sizes[0];
    const kN = r.sizes[r.sizes.length - 1];
    return `Sobre ${int(r.zones.length)} zonas, el error relativo medio de la tarifa estimada pasa de ${fmt(errorMedio(r, k0, "fare"), 2)}% con un reservorio de ${int(k0)} a ${fmt(errorMedio(r, kN, "fare"), 2)}% con uno de ${int(kN)}; el de la espera, de ${fmt(errorMedio(r, k0, "wait"), 2)}% a ${fmt(errorMedio(r, kN, "wait"), 2)}%.`;
  },
  metrics: (r) => [
    ...r.sizes.map((k) => ({
      label: `Error con reservorio de ${int(k)}`,
      value: `${fmt(errorMedio(r, k, "fare"), 2)}%`,
      hint: `tarifa; espera ${fmt(errorMedio(r, k, "wait"), 2)}%`,
    })),
    { label: "Zonas", value: int(r.zones.length), hint: "un reservorio por zona y por tamano" },
    {
      label: "Viajes en memoria",
      value: int(r.sizes.length ? r.sizes[r.sizes.length - 1] * r.zones.length : 0),
      hint: "con el reservorio mas grande",
    },
  ],
  sections: [
    {
      h: "Problema",
      p: "El stream de solicitudes no cabe en memoria ni se conoce su longitud de antemano. Se requiere la tarifa y la espera promedio por zona usando una cantidad fija de memoria.",
    },
    {
      h: "Algoritmo",
      p: "Para un reservorio de tamano m, los primeros m viajes de la zona entran directamente. Para el viaje i, con i mayor que m, se sortea un entero j uniforme entre 1 e i; si j es menor o igual que m, el viaje reemplaza al que ocupa la posicion j. Con esa regla cada viaje visto permanece en la muestra con probabilidad m/i, sin importar cuando llego.",
    },
    {
      h: "Un reservorio por zona",
      p: "El enunciado pide promedios por zona, asi que cada zona tiene su propio reservorio y su propio contador i. Un solo reservorio para toda la ciudad dejaria a las zonas de menor demanda con pocas observaciones.",
    },
    {
      h: "Valor verdadero",
      p: "La media exacta de cada zona se calcula en la misma pasada con una suma y un conteo. Se usa solo como referencia para medir el error; el estimador no la consulta.",
    },
    {
      h: "Error esperado",
      p: "El error estandar de la media de una muestra de tamano m es proporcional a 1/raiz(m). Al pasar de un reservorio a otro mas grande, el error deberia reducirse en la raiz del cociente de los tamanos. Con una sola muestra por tamano el error de una zona puede no bajar de forma monotona; la tendencia se observa en el promedio entre zonas.",
    },
    {
      h: "Memoria",
      p: "Se guardan m viajes por zona, independientemente de cuantos eventos tenga el stream. El costo por evento es un numero aleatorio y, como mucho, un reemplazo.",
    },
  ],
  takeaway:
    "El reservorio mantiene una muestra uniforme del stream con memoria fija; el error esperado de la estimacion decrece como 1/raiz(m).",
};

export default doc;
