import type { TaskDoc } from "@/lib/tasks";
import type { W4Task3, W4Task5, W4Task6 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

/** Las zonas cuyo net_flow se sale de ±2 desviaciones de ruido. */
const fuera = (r: W4Task6) => r.zones.filter((z) => Math.abs(z.net_flow) > 2 * z.noise_sd);

/** El mejor speedup medido, con su P y su escala. */
const mejor = (t5: W4Task5) => [...t5.runs].sort((a, b) => b.speedup - a.speedup)[0];

const doc: TaskDoc<W4Task6> = {
  // Titulo y cierre hablan del Panel F, el unico con datos propios: lo del
  // Panel E (speedup, combiner) depende de las Tasks 3 y 5 y va en el lede.
  title: "El flujo neto de conductores es un efecto de borde de la ventana",
  topic: "DASHBOARD · PANELES E Y F",
  statement:
    "Conservar los Paneles A a D; agregar el Panel E, speedup y eficiencia contra workers y tamano del shuffle con y sin combiner, y el Panel F, las zonas ordenadas por net_flow (negativo = salen conductores, candidatas a incentivo de surge) junto al medidor de surge de la Unidad 1.",
  standfirst:
    "El Panel E junta lo que cuesta correr el grafo como MapReduce: cuanto acelera con mas workers y cuanto ahorra el combiner en el shuffle. El Panel F ordena las zonas por su flujo neto de conductores, con una banda de ruido para separar lo que da el azar, y lo pone al lado del medidor de surge. Los Paneles A a D siguen en los dashboards del W2 y del W3.",
  lede: (r, all) => {
    const t5 = all.task5 as W4Task5 | undefined;
    const t3 = all.task3 as W4Task3 | undefined;
    const partes: string[] = [];
    if (t5) {
      const m = mejor(t5);
      partes.push(
        t5.parallel
          ? `Con ${m.workers} workers y ${m.scale}x datos el pipeline va ${fmt(m.speedup, 2)} veces mas rapido, con eficiencia ${fmt(
              m.efficiency,
              2
            )}.`
          : "La Task 5 corrio sin procesos en paralelo, asi que su speedup no mide nada."
      );
    }
    const sin = t3?.runs.find((x) => x.job === "1b" && !x.combiner && x.scale === Math.min(...t3.scales));
    const con = t3?.runs.find((x) => x.job === "1b" && x.combiner && x.scale === Math.min(...t3.scales));
    if (sin && con) partes.push(`Al contar pares, el combiner baja el shuffle de ${int(sin.shuffle_pairs)} pares a ${int(con.shuffle_pairs)}.`);
    const f = fuera(r);
    partes.push(
      f.length
        ? `En el Panel F quedan fuera de ±2σ: ${f
            .map((z) => `${z.zone} (${z.net_flow > 0 ? "+" : ""}${z.net_flow}, ${z.net_flow > 0 ? "+" : ""}${fmt(z.net_flow / z.noise_sd, 1)}σ)`)
            .join(", ")}.`
        : "En el Panel F ninguna zona queda fuera de ±2σ."
    );
    return partes.join(" ");
  },
  metrics: (r, all) => {
    const t5 = all.task5 as W4Task5 | undefined;
    const peor = [...r.zones].sort((a, b) => a.net_flow - b.net_flow)[0];
    const out = [];
    // Sin procesos (navegador) el "speedup" es ruido de calentamiento.
    if (t5?.parallel) {
      const m = mejor(t5);
      out.push({ label: "Mejor speedup", value: `${fmt(m.speedup, 2)}×`, hint: `P = ${m.workers}, ${m.scale}x datos` });
    }
    const pierde = peor && peor.net_flow < 0;
    out.push(
      {
        label: "Pierde mas conductores",
        value: pierde ? peor.zone : "ninguna",
        hint: pierde ? `net_flow ${peor.net_flow}` : "ninguna zona tiene net_flow negativo",
      },
      { label: "Fuera de ±2σ", value: String(fuera(r).length), hint: `de ${r.zones.length} zonas` },
      { label: "Conductores", value: int(r.drivers), hint: "cada uno aporta un primer y un ultimo viaje" }
    );
    return out;
  },
  sections: [
    {
      h: "Panel E: por que el speedup se queda corto",
      p: "Los map y los reduce corren en procesos de verdad, pero una fase no usa mas workers que tareas tiene: el reduce de cada job tiene R tareas, y el map de la ronda 1b tambien, porque sus splits son la salida de 1a. Si R es menor que P, parte del pool espera. Ademas, todo lo que viaja en el shuffle pasa por el proceso principal, que es uno solo: recibe los bytes de cada map task y los reenvia a cada reduce task, y eso no se reparte. Serializar y deserializar los pares, en cambio, si se reparte, porque ocurre dentro de cada tarea. El panel de la Task 5 muestra cuanto acelera cada fase por separado; la que se queda atras es la que frena la eficiencia E_P = S_P / P. En el navegador no hay procesos y el panel lo dice.",
    },
    {
      h: "Panel E: el combiner solo sirve al contar",
      p: "En la ronda que cuenta reubicaciones (1b) cada map task ve miles de veces el mismo par de zonas, y el combiner los suma ahi mismo: al shuffle llega como mucho un par por cada par de zonas y map task, sin importar cuanto crezcan los datos. En la ronda que agrupa por conductor (1a) no hay nada que sumar: el reducer necesita cada viaje para ordenarlos. Un combiner puede empaquetar los viajes de un conductor en una lista, y eso baja el numero de pares, pero no los viajes que tienen que viajar.",
    },
    {
      h: "Panel F: que mide net_flow en este grafo",
      p: "Una reubicacion es el paso de un conductor de la zona de un viaje a la del siguiente. Cada recogida es entonces la llegada de una reubicacion y la salida de la siguiente, salvo el primer viaje de cada conductor, que no tiene llegada, y el ultimo, que no tiene salida. En cada zona net_flow es exactamente los conductores que terminan ahi menos los que empiezan ahi. Es un efecto de borde de la ventana de dias: compara la demanda de cada zona a la hora en que arrancan los conductores, en la madrugada del primer dia, con la hora en que terminan, en la noche del ultimo.",
    },
    {
      h: "Panel F: la banda de ruido",
      p: "Si el primer y el ultimo viaje de cada conductor fueran independientes y salieran de la misma distribucion por zona, net_flow seguiria variando por puro azar, con desviacion raiz de 2 D p (1 - p), D conductores y p la fraccion de zona estimada con ambos viajes. La franja gris es ±2 de esas desviaciones. Como se miran todas las zonas a la vez, el azar solo ya deja fuera de la franja, en promedio, al 4,5 % de ellas: una zona apenas fuera, cerca de 2σ, dice poco. Una a 3σ o mas si empieza y termina distinto, y eso se explica por su demanda a esas horas; dentro de la franja, el signo no dice nada. Ninguna de las dos lecturas es un flujo sostenido de conductores durante el dia: para eso haria falta la zona de destino de cada viaje, que el dataset no tiene.",
    },
    {
      h: "Por que importa para el surge",
      p: "El medidor de surge marca cuando la demanda de una zona se dispara contra su historia; net_flow, cuando en el agregado se van mas conductores de los que llegan. Las zonas que pierden conductores y ademas entran seguido en surge serian las primeras candidatas a un incentivo. Pero en un grafo de recogidas consecutivas net_flow es siempre los conductores que terminan menos los que empiezan, aunque el despacho fuera real: el calculo no puede decir donde faltan conductores. Para eso haria falta otra informacion: el destino de cada viaje, cuantos conductores libres hay por zona y hora, o la demanda que no se atendio, medida por franja horaria y no sobre toda la ventana.",
    },
  ],
  takeaway:
    "En un grafo hecho de viajes consecutivos, el flujo neto de conductores solo mide donde empieza y termina la ventana: las zonas que se salen de la banda lo hacen por su demanda a esas horas, no porque los conductores las abandonen durante el dia.",
};

export default doc;
