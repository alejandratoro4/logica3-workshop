import type { TaskDoc } from "@/lib/tasks";
import type { W5Task4, W5Task5, W5Task6 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

/** Por metodo, sobre todas las consultas del Panel I: candidatos examinados,
 *  que fraccion de los vecinos exactos llego a examinarse, que fraccion de
 *  sus vecinos es del grupo de la consulta y cuantos estan en el top-5
 *  exacto. Lo usan esta pagina y el panel. */
export function resumenMetodos(t: W5Task6) {
  const nombres = t.queries[0]?.methods.map((m) => m.method) ?? [];
  return nombres.map((nombre) => {
    let vecinos = 0;
    let mismo = 0;
    let comunes = 0;
    let candidatos = 0;
    let exactos = 0;
    let examinados = 0;
    for (const q of t.queries) {
      const m = q.methods.find((x) => x.method === nombre);
      if (!m) continue;
      const exacto = new Set(q.methods.find((x) => x.method === "jaccard")?.neighbors.map((v) => v.driver_id) ?? []);
      candidatos += m.candidates;
      exactos += exacto.size;
      examinados += m.exact_in_candidates;
      for (const v of m.neighbors) {
        vecinos++;
        if (v.cluster === q.cluster) mismo++;
        if (exacto.has(v.driver_id)) comunes++;
      }
    }
    return {
      method: nombre,
      candidatos: t.queries.length ? candidatos / t.queries.length : 0,
      /** De los vecinos exactos, la fraccion que el metodo llego a examinar. */
      examinados: exactos ? examinados / exactos : 0,
      mismoGrupo: vecinos ? mismo / vecinos : 0,
      /** De los vecinos exactos, la fraccion que esta en su top-5 (el
       *  overlap@5 con el exacto). Mismo denominador que `examinados`, asi
       *  que nunca lo supera. */
      conExacto: exactos ? comunes / exactos : 0,
      vecinos,
    };
  });
}

/** Si todos los vecinos exactos de todas las consultas tienen Jaccard 1:
 *  todos los conductores tienen los mismos shingles (pasa con una sola
 *  zona), los "vecinos" son el desempate por driver_id y el outcome test no
 *  mide nada. */
export function todosIguales(t: W5Task6) {
  const exactos = t.queries.flatMap((q) => q.methods.find((m) => m.method === "jaccard")?.neighbors ?? []);
  return exactos.length > 0 && exactos.every((v) => v.score >= 1);
}

type FilaTarifa = W5Task5["outcome_test"][number];

/** Si la diferencia de tarifa con los vecinos se distingue del azar. Con
 *  `neighbor_mad_se`, cuando la distancia a `random_mad` pasa de 2 errores
 *  estandar; sin el, solo cocientes por debajo de 0,8 o por encima de 1,2
 *  (con unas decenas de consultas, el cociente tiene ~10 % de ruido). Lo usan
 *  esta pagina y el Panel J, asi dicen lo mismo. */
export function veredictoTarifa(o: FilaTarifa): { cociente: number; lado: "bajo" | "encima" | "ruido"; conSe: boolean } | null {
  if (!(o.random_mad > 0)) return null;
  const cociente = o.neighbor_mad / o.random_mad;
  const se = o.neighbor_mad_se;
  if (se !== undefined && se > 0) {
    const z = (o.random_mad - o.neighbor_mad) / se;
    return { cociente, lado: z >= 2 ? "bajo" : z <= -2 ? "encima" : "ruido", conSe: true };
  }
  return { cociente, lado: cociente <= 0.8 ? "bajo" : cociente >= 1.2 ? "encima" : "ruido", conSe: false };
}

const doc: TaskDoc<W5Task6> = {
  // Titulo y cierre hablan del Panel I, el unico con datos propios: lo del
  // Panel J depende de las Tasks 2, 4 y 5 y va en el lede, condicionado.
  title: "Con LSH, cada conductor se compara solo con sus candidatos",
  topic: "DASHBOARD · PANELES I Y J",
  statement:
    "Conservar los Paneles A a H; agregar el Panel I, elegir un conductor y ver sus 5 vecinos con cada metodo, con sus puntajes, los candidatos examinados y las zonas que comparten, y el Panel J, la curva S teorica contra la empirica, el recall contra las comparaciones ahorradas y el outcome test de avg_fare.",
  standfirst:
    "El Panel I pone lado a lado los vecinos de un conductor segun el Jaccard exacto, MinHash con bandas, el coseno con hiperplanos y la LCS de la Unidad 5 sobre los candidatos, con cuantos conductores tuvo que mirar cada metodo. El Panel J junta lo que cuesta y lo que gana LSH: la curva S, el recall contra el ahorro y si los vecinos se parecen tambien en la tarifa. Los Paneles A a F siguen en los dashboards del W2 al W4.",
  lede: (r, all) => {
    const res = resumenMetodos(r);
    const mh = res.find((x) => x.method === "minhash");
    const ex = res.find((x) => x.method === "jaccard");
    const partes: string[] = [];
    if (mh && mh.candidatos >= r.drivers - 1) {
      partes.push("MinHash no ahorra comparaciones en esta ciudad: todos los conductores caen en el mismo bucket.");
    } else if (mh && ex && mh.vecinos) {
      partes.push(
        `MinHash examina en promedio ${fmt(mh.candidatos, 1)} candidatos por consulta en vez de ${int(
          r.drivers - 1
        )}, y el ${pct(mh.mismoGrupo, 0)} de sus vecinos son del grupo de la consulta (con el Jaccard exacto, el ${pct(
          ex.mismoGrupo,
          0
        )}).`
      );
      // Los falsos negativos de LSH: los vecinos exactos que nunca se
      // examinaron. Explican buena parte del desacuerdo con el top-5 exacto.
      if (mh.examinados < 1)
        partes.push(
          `De los 5 vecinos exactos de cada consulta, el ${pct(mh.examinados, 0)} sale candidato; los demas son falsos negativos de LSH, y ningun orden los recupera.`
        );
    }
    const t4 = all.task4 as W5Task4 | undefined;
    if (t4) {
      const c = t4.configs.find((x) => x.bands === r.lsh_config.bands && x.rows === r.lsh_config.rows);
      if (c && t4.total_pairs > 0)
        partes.push(
          `Con (b, r) = (${c.bands}, ${c.rows}) salen candidatos ${int(c.candidate_pairs)} de ${int(t4.total_pairs)} pares (${pct(
            c.candidate_pairs / t4.total_pairs,
            1
          )}).`
        );
    }
    const t5 = all.task5 as W5Task5 | undefined;
    const o = t5?.outcome_test.find((x) => x.method === "minhash");
    const v = o ? veredictoTarifa(o) : null;
    if (v && todosIguales(r)) {
      partes.push(
        "En esta ciudad todos los conductores tienen los mismos shingles: los vecinos salen del desempate por driver_id, y el outcome test de la tarifa no mide nada."
      );
    } else if (v) {
      // El mismo criterio que el Panel J (veredictoTarifa).
      partes.push(
        v.lado === "bajo"
          ? `En la tarifa, que ningun metodo vio, los vecinos de MinHash difieren ${fmt(v.cociente, 2)} veces lo que difieren conductores al azar.`
          : v.lado === "ruido"
            ? `En la tarifa, los vecinos de MinHash difieren ${fmt(v.cociente, 2)} veces lo que conductores al azar: con ${int(
                t5?.queries
              )} consultas no se distingue del ruido.`
            : `En la tarifa, los vecinos de MinHash difieren mas que conductores al azar (${fmt(v.cociente, 2)}×).`
      );
    }
    return partes.join(" ");
  },
  metrics: (r) => {
    const res = resumenMetodos(r);
    const out = [];
    const mh = res.find((x) => x.method === "minhash");
    const cos = res.find((x) => x.method === "cosine");
    if (mh)
      out.push({
        label: "Candidatos de MinHash",
        value: fmt(mh.candidatos, 1),
        hint: `por consulta, de ${int(r.drivers - 1)}; (b, r) = (${r.lsh_config.bands}, ${r.lsh_config.rows})`,
      });
    if (mh && mh.vecinos) out.push({ label: "Vecinos del mismo grupo", value: pct(mh.mismoGrupo, 0), hint: "con MinHash" });
    if (mh)
      out.push({
        label: "Vecinos exactos examinados",
        value: pct(mh.examinados, 0),
        hint: "por MinHash; los demas son falsos negativos de LSH",
      });
    if (cos && cos.vecinos)
      out.push({ label: "Candidatos del coseno", value: fmt(cos.candidatos, 1), hint: `${pct(cos.mismoGrupo, 0)} de sus vecinos del mismo grupo` });
    out.push({ label: "Consultas", value: int(r.queries.length), hint: `hasta 3 por grupo, de ${int(r.drivers)} conductores` });
    return out;
  },
  sections: [
    {
      h: "De donde salen los grupos",
      p: "El enunciado pide grupos plantados de conductores que comparten un territorio de 4 a 6 zonas, y stream.csv no los tiene: el Workshop 1 sorteo el conductor de cada viaje al azar, asi que todos recorren la ciudad igual. El dataset del W5 reparte los mismos viajes, con su zona, hora, tarifa y espera, entre los conductores de 8 territorios: cada viaje va a alguien cuyo territorio contiene la zona de recogida y, con mas peso, el destino probable del viaje; uno de cada diez va a cualquiera. Es un escenario propio del W5, como el de despacho del W3, y no cambia nada de los workshops anteriores.",
    },
    {
      h: "Panel I: que compara",
      p: "Para cada conductor consultado hay cuatro listas. El Jaccard exacto compara sus shingles contra los de todos los demas: es la verdad, y cuesta N − 1 pares por consulta, uno por cada otro conductor. MinHash con bandas solo mira a los que caen en el mismo bucket en alguna banda y los ordena por la fraccion de su firma que coincide. El coseno hace lo mismo con los bits de hiperplanos sobre el vector de ocupacion. La LCS de la Unidad 5 ordena los candidatos de MinHash comparando las secuencias completas con programacion dinamica: es la medida mas fina, y por eso solo se puede pagar sobre unos pocos candidatos. Las zonas en comun son las que tienen al menos el 5 % de los viajes de los dos.",
    },
    {
      h: "Por que los top-5 no coinciden",
      p: "Hay dos razones, y el panel las separa. La primera: el vecino nunca se examino. El umbral de las bandas se elige cerca de lo que se parecen los vecinos de verdad, y ahi la curva S vale mas o menos un medio: buena parte de los vecinos exactos puede no salir candidata (falsos negativos de LSH), y ni MinHash ni la LCS, que ordena esos mismos candidatos, pueden recuperarlos. Es el precio de examinar decenas de conductores y no cientos; el curso pide bajar el umbral cuando perder pares parecidos importa mas que el tiempo. La segunda: entre los que si se examinaron, dentro de un grupo todos recorren el mismo territorio y se parecen casi lo mismo, asi que el orden de los cinco primeros depende de diferencias pequenas. El Jaccard estimado con 100 funciones tiene un error de unas centesimas, del tamano de esas diferencias, y empata a menudo. El coseno mira algo distinto: la fraccion de viajes por zona, la espera media y el numero de viajes, sin el orden de las zonas. La LCS si mira el orden, pero de la secuencia entera. Por eso el panel muestra tambien cuantos vecinos son del grupo de la consulta.",
    },
    {
      h: "Panel J: la curva S y el compromiso",
      p: "Con b bandas de r filas, dos conductores con Jaccard s salen candidatos con probabilidad 1 − (1 − s^r)^b, una curva en S que sube cerca del umbral (1/b)^(1/r). Mas filas por banda mueven el umbral a la derecha: menos falsos positivos y mas falsos negativos. Mas bandas lo mueven a la izquierda. Los puntos son lo medido: la fraccion de los pares de cada intervalo de Jaccard que salio candidata; las rayas, lo que la teoria predice para esos mismos pares, que no estan repartidos parejo dentro del intervalo. Que un punto se aleje de su raya no es un error: todos los pares comparten las mismas 100 funciones, asi que los de un mismo grupo salen candidatos juntos o no, y con una sola tanda de funciones la tasa de un intervalo se mueve mucho mas que con pares independientes. Promediada sobre muchas semillas, coincide con la teoria. El recall contra el ahorro es el mismo compromiso con los hiperplanos: encontrar a los vecinos de verdad contra comparar con menos conductores.",
    },
    {
      h: "Panel J: el outcome test",
      p: "avg_fare no entra en los shingles ni en el vector. Si los vecinos de un metodo se parecen en tarifa mas que conductores al azar, el metodo agrupo conductores que tambien se parecen en algo que no vio. En este escenario nadie planto la tarifa por grupo: la tarifa depende de la distancia del viaje, y un territorio con zonas lejanas recibe viajes mas largos. Si la prueba sale bajo el azar, es por eso.",
    },
    {
      h: "Paneles A a H",
      p: "Los Paneles A a F siguen donde estaban: A, B y C en el dashboard del W2, D en el del W3, E y F en el del W4. El enunciado tambien pide conservar G y H, pero serian de un workshop de la Unidad 5 (programacion dinamica) que no se asigno. Lo que el W5 necesitaba de esa unidad, la secuencia de zonas de cada conductor y la similitud LCS, lo aportan el dataset y src/w5/lcs.py.",
    },
  ],
  takeaway:
    "Comparar todos los pares con programacion dinamica no escala; con MinHash y bandas, cada conductor se compara solo con los que caen en su mismo bucket, y la LCS se reserva para ordenar esos pocos candidatos.",
};

export default doc;
