import type { TaskDoc } from "@/lib/tasks";
import type { W3Task2 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W3Task2> = {
  title: "Los conductores pasan el tiempo donde están las recogidas",
  topic: "DISTRIBUCIÓN ESTACIONARIA · π",
  statement:
    "Interpretar pi: en qué zonas pasan más tiempo los conductores a largo plazo. Compararla con el conteo de viajes por zona de la Unidad 1.",
  standfirst:
    "La cadena salta de recogida en recogida, así que pi_i no mide horas de reloj: mide la fracción de las recogidas que a largo plazo caen en la zona i. No es exactamente la participación en viajes: el primer y el último viaje de cada conductor solo aportan una arista, y eso deja diferencias pequeñas.",
  lede: (r) => {
    const mejor = [...r.zones].sort((a, b) => b.pi - a.pi)[0];
    const peor = [...r.zones].sort((a, b) => a.pi - b.pi)[0];
    const corr = correlacion(r.zones);
    return `Con ${r.method} y ${int(r.iterations)} iteraciones, la zona donde más tiempo pasan los conductores es ${mejor?.zone} (${pct(mejor?.pi, 2)} de las recogidas), y la que menos, ${peor?.zone} (${pct(peor?.pi, 2)}). La correlación entre π y el volumen de viajes de la Unidad 1 es ${fmt(corr, 2)}.`;
  },
  metrics: (r) => {
    const mejor = [...r.zones].sort((a, b) => b.pi - a.pi)[0];
    const peor = [...r.zones].sort((a, b) => a.pi - b.pi)[0];
    const corr = correlacion(r.zones);
    return [
      { label: "Método", value: r.method, hint: `${int(r.iterations)} iteraciones hasta converger` },
      { label: "Más tiempo", value: mejor?.zone ?? "—", hint: pct(mejor?.pi, 2) },
      { label: "Menos tiempo", value: peor?.zone ?? "—", hint: pct(peor?.pi, 2) },
      { label: "Correlación π vs. volumen", value: fmt(corr, 2), hint: "Pearson entre π y ride_count" },
    ];
  },
  sections: [
    {
      h: "Qué mide π",
      p: "Cada paso de la cadena es un viaje: el conductor termina en una zona y empieza el siguiente. π_i es la fracción de esos pasos que a largo plazo caen en la zona i. No es la fracción del tiempo de reloj — un conductor que espera 10 minutos en una zona y 1 en otra no está modelado aquí. Tampoco es exactamente la participación en viajes: el primer viaje de cada conductor no tiene arista de entrada y el último no tiene de salida, así que los bordes de la muestra pesan distinto.",
    },
    {
      h: "Cómo se calcula",
      p: "Se itera π ← π M desde una distribución uniforme hasta que el cambio máximo entre iteraciones baja de 1e-12. En el escenario del enunciado, donde cada conductor se sortea al azar, las filas de M son casi iguales entre sí, así que π termina muy cerca de la participación de cada zona en los viajes y la convergencia es rápida.",
    },
    {
      h: "La comparación con la Unidad 1",
      p: "El conteo de viajes por zona de rides.csv es el criterio de volumen de la Unidad 1. La correlación entre π y ese conteo dice qué tan parecidas son las dos vistas: si es casi 1, la cadena no añade información nueva — el volumen ya ordenaba las zonas igual. Las diferencias pequeñas que quedan vienen de los bordes de la muestra y del ruido de sorteo, no de una estructura espacial que no existe en el modelo del enunciado.",
    },
    {
      h: "Cuándo se separarían",
      p: "Si el despacho fuera espacial (el conductor más cercano toma el viaje, como en el escenario alterno del Panel D), las filas de M dejarían de ser iguales y π se alejaría del volumen: zonas que reciben muchos conductores pero generan pocos viajes tendrían π alta y volumen bajo, y al revés. Esa separación es la que el Panel D explora con PageRank.",
    },
  ],
  takeaway:
    "π reparte las recogidas a largo plazo: en el modelo del enunciado, donde el conductor se sortea, queda casi igual al volumen de viajes; si el despacho fuera espacial, la cadena sí contaría otra historia.",
};

function correlacion(zones: { pi: number; ride_count: number }[]): number {
  const n = zones.length;
  if (n === 0) return 0;
  const mediaPi = zones.reduce((s, z) => s + z.pi, 0) / n;
  const mediaRides = zones.reduce((s, z) => s + z.ride_count, 0) / n;
  let num = 0, denPi = 0, denRides = 0;
  for (const z of zones) {
    const dPi = z.pi - mediaPi;
    const dRides = z.ride_count - mediaRides;
    num += dPi * dRides;
    denPi += dPi * dPi;
    denRides += dRides * dRides;
  }
  if (denPi === 0 || denRides === 0) return 0;
  return num / Math.sqrt(denPi * denRides);
}
export default doc;
