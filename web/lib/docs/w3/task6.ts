import type { TaskDoc } from "@/lib/tasks";
import type { W3Task3, W3Task6 } from "@/lib/generated/contratos";
import { fmt, pct } from "@/lib/format";

const doc: TaskDoc<W3Task6> = {
  title: "Lo que separa PageRank del volumen son los reinicios de la caminata",
  topic: "DASHBOARD · PANEL D",
  statement:
    "Panel D del dashboard: el ranking de PageRank contra el ranking por volumen de viajes en cada zona, superpuesto al medidor de surge de la Unidad 1.",
  standfirst:
    "El volumen ordena las zonas por cuantos viajes piden. PageRank las ordena por como circulan los conductores entre ellas, con un reinicio al azar. El medidor de surge, el de la Unidad 1, dice que tan seguido la demanda de cada zona se sale de lo normal para esa hora. El panel las pone lado a lado y agrega un escenario alterno, con despacho espacial, para ver cuando PageRank y volumen se separan.",
  lede: (r, all) => {
    const t3 = all.task3 as W3Task3 | undefined;
    const peor = [...r.zones].sort((a, b) => b.surge_rate - a.surge_rate)[0];
    const alt = r.dispatch_scenario.zones.filter((z) => z.pagerank_rank < z.volume_rank).map((z) => z.zone);
    const enAlterno = alt.length
      ? ` En el escenario con despacho espacial suben: ${alt.join(", ")}.`
      : " En el escenario con despacho espacial tampoco sube ninguna.";
    const surge = `La zona que mas seguido entra en surge es ${peor?.zone}, en ${pct(peor?.surge_rate)} de sus horas (umbral μ + ${fmt(
      r.k_sigma,
      1
    )}√μ).`;
    if (!t3) return `Sin la Task 3 todavia no hay ranking del grafo del enunciado.${enAlterno} ${surge}`;
    const suben = t3.zones.filter((z) => z.pagerank_rank < z.volume_rank).map((z) => z.zone);
    return `${
      suben.length
        ? `En el grafo del enunciado suben en PageRank respecto a su volumen: ${suben.join(", ")}.`
        : "En el grafo del enunciado ninguna zona sube en PageRank respecto a su volumen."
    }${enAlterno} ${surge}`;
  },
  metrics: (r, all) => {
    const t3 = all.task3 as W3Task3 | undefined;
    const orden = [...r.zones].sort((a, b) => b.surge_rate - a.surge_rate);
    const out = [
      { label: "Mas surge", value: orden[0]?.zone ?? "—", hint: pct(orden[0]?.surge_rate) },
      { label: "Menos surge", value: orden[orden.length - 1]?.zone ?? "—", hint: pct(orden[orden.length - 1]?.surge_rate) },
    ];
    if (t3) {
      const cambios = t3.zones.filter((z) => z.pagerank_rank !== z.volume_rank).length;
      out.push({ label: "Cambian de puesto", value: String(cambios), hint: `de ${t3.zones.length}, grafo del enunciado` });
    }
    const alt = r.dispatch_scenario.zones;
    out.push({
      label: "Cambian de puesto",
      value: String(alt.filter((z) => z.pagerank_rank !== z.volume_rank).length),
      hint: `de ${alt.length}, despacho espacial`,
    });
    return out;
  },
  sections: [
    {
      h: "Las tres cosas que cruza el panel",
      p: "El puesto por volumen sale del conteo de viajes de la Unidad 1. El puesto por PageRank sale de la Task 3, con reloc_count como peso de cada arista. El medidor de surge es el de la Unidad 1 resumido por zona: la fraccion de sus horas en que las solicitudes superaron mu + k raiz de mu, con mu estimado de los dias anteriores. El medidor solo mira solicitudes: dice cuando la demanda de una zona es inusual, no si alli faltan conductores.",
    },
    {
      h: "Por que PageRank se separa del volumen",
      p: "Sin el salto aleatorio, PageRank con pesos seria la distribucion estacionaria pi, y esta queda muy cerca del volumen: cada recogida es la llegada de una reubicacion y la salida de la siguiente, salvo el primer y el ultimo viaje de cada conductor (Task 2). El salto, con probabilidad 1 - beta, reinicia la caminata en una zona al azar. PageRank es entonces un promedio de caminatas de todas las longitudes desde un inicio uniforme, con peso (1 - beta) beta^t para la de t pasos: con beta = 0.85, los pasos 0 y 1 pesan solo el 28%. Cada zona gana o pierde peso respecto a pi segun como se acumula su probabilidad a lo largo de esas caminatas cortadas, y eso depende de las transiciones concretas de M; ni la diagonal ni la media de la columna lo deciden por si solas. Tampoco es cuestion de cuantos origenes distintos tiene: en este grafo todas las zonas reciben de las diez.",
    },
    {
      h: "El grafo del enunciado y el escenario alterno",
      p: "En la Unidad 1 el conductor de cada viaje se sortea al azar, asi que la zona de su siguiente viaje no depende de la actual. En el modelo ideal las filas de M serian identicas e iguales a la demanda, y PageRank conservaria el orden de pi, pero no sus valores: con reinicios uniformes seria (1 - beta)/n + beta pi por zona; en los datos, finitos, las filas difieren en menos de 0.02 y en la corrida canonica PageRank ordena exactamente como el volumen. Con pocos dias o escala chica, dos zonas de volumen parecido pueden intercambiarse por ruido. El dataset arma ademas un grafo con despacho espacial (cada viaje lo toma el conductor libre mas cercano, que queda libre en el destino), que da otra estructura para explorar. En la corrida canonica de ese escenario el aeropuerto, lejos de todo, retiene a sus conductores (se quedan con probabilidad 0.81) y las demas zonas le mandan poco: su pi es 0.1405 pero su PageRank 0.1224, la mayor caida de las diez. DOWNTOWN cae solo de 0.1310 a 0.1274, asi que lo pasa: el aeropuerto baja del puesto 2 al 3.",
    },
    {
      h: "Que tan fino es el medidor",
      p: "Cada zona se evalua en todas sus horas salvo las del primer dia, que no tienen historia para estimar mu. Son pocas horas por zona, asi que una diferencia de un punto porcentual entre dos zonas equivale a un punado de horas: las diferencias chicas son ruido, las grandes no.",
    },
  ],
  takeaway:
    "El volumen dice cuanto pide cada zona, PageRank como circulan los conductores con reinicios al azar y el surge cuando su demanda se dispara. En la corrida canonica, con el despacho al azar del enunciado, PageRank repite el volumen; con despacho espacial, el aeropuerto, que sostiene su peso reteniendo a sus conductores, pierde con los reinicios y baja un puesto.",
};

export default doc;
