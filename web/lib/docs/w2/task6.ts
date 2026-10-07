import type { TaskDoc } from "@/lib/tasks";
import type { W2Task6 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W2Task6> = {
  title: "El surge se decide con una suma y un conteo por zona y hora",
  topic: "DASHBOARD · PANEL C",
  statement:
    "Panel C del dashboard: un medidor de surge en vivo por zona, que compare las solicitudes de la hora en curso con la cota de probabilidad de la Unidad 1, junto al resultado de F_k.",
  standfirst:
    "El umbral de surge de la Unidad 1 se calculaba sobre el dataset entero. En un stream no hay dataset entero: la media de cada zona y cada hora se estima con los dias ya vistos, y el umbral se fija al empezar la hora. El medidor cuenta en vivo y dispara el surge en la solicitud que cruza el umbral.",
  lede: (r) => {
    const o = r.overall;
    return `Con el umbral μ + ${fmt(r.k_sigma, 1)}√μ y μ estimado de los dias previos, ${int(o.surged)} de ${int(
      o.slots
    )} horas-zona entraron en surge: ${pct(o.surge_rate)}. La cola exacta de Poisson predice ${pct(
      o.poisson_tail_mean
    )}, y las cotas de la Unidad 1, calculadas con ese μ estimado como si fuera el verdadero, dan a lo sumo ${pct(o.chernoff_mean)} (Chernoff) y ${pct(
      r.cantelli_bound
    )} (Cantelli).`;
  },
  metrics: (r) => {
    const o = r.overall;
    const peor = [...r.by_zone].sort((a, b) => b.surge_rate - a.surge_rate)[0];
    return [
      { label: "Horas-zona con surge", value: pct(o.surge_rate), hint: `${int(o.surged)} de ${int(o.slots)} evaluadas` },
      { label: "Cola exacta de Poisson", value: pct(o.poisson_tail_mean), hint: "referencia de Poisson con μ estimado" },
      { label: "Cota de Chernoff", value: pct(o.chernoff_mean), hint: `Cantelli ${pct(r.cantelli_bound)}` },
      ...(peor ? [{ label: "Zona con mas surge", value: peor.zone, hint: pct(peor.surge_rate) }] : []),
    ];
  },
  sections: [
    {
      h: "Por que el umbral de la Unidad 1 no sirve tal cual",
      p: "En la Task 5 del Workshop 1 la media de cada zona se calculaba con todos los dias del dataset, y despues se comparaba cada dia contra ella. En un stream eso es mirar el futuro: a las 8 de la manana del dia 3 solo se conocen los dias 1 y 2. Por eso el umbral se estima con lo que ya paso, y se fija al empezar cada hora, antes de contar ninguna solicitud de esa hora.",
    },
    {
      h: "Que guarda el medidor",
      p: "Por cada zona y cada hora del dia, una suma de solicitudes y un conteo de dias, nada mas. Al empezar la hora se calcula mu como suma sobre dias y el umbral T = mu + k raiz de mu. Durante la hora se cuenta en vivo; el medidor es conteo / T y el surge se dispara en la solicitud que lo cruza. Al cerrar la hora se suma su conteo a la historia, despues de decidir.",
    },
    {
      h: "Contra que se compara",
      p: "Si las llegadas son Poisson(mu), la probabilidad de cruzar T tiene una cola exacta, y las cotas de Chernoff y Cantelli la acotan por arriba. Pero aqui mu no se conoce: se reemplaza por la media de los dias previos, asi que la cola y las cotas son las del modelo ajustado, Poisson(mu estimado), no garantias sobre la intensidad verdadera del generador. La frecuencia observada es el contraste empirico: que quede por debajo de una cota es coherente con el modelo, pero no lo valida por si solo. Lo observado puede quedar algo por encima de la cola exacta, porque mu se estima con pocos dias y su ruido baja el umbral de vez en cuando: con mas historia, se acerca.",
    },
    {
      h: "Y F_k",
      p: "F2 dice que tan concentrada esta la demanda entre zonas: que zonas se llevan mas de su cuota. El medidor dice cuando una zona se sale de lo esperado para ella a esa hora. Son preguntas distintas: una zona puede concentrar la demanda todo el dia sin entrar nunca en surge, si siempre recibe lo mismo.",
    },
  ],
  takeaway:
    "El surge en un stream no necesita el historico: necesita una suma y un conteo por zona y hora, y una cota que diga que tan seguido se va a disparar.",
};

export default doc;
