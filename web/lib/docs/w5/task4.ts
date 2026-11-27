import type { TaskDoc } from "@/lib/tasks";
import type { W5Task4 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

type Config = W5Task4["configs"][number];

const porUmbral = (r: W5Task4): Config[] => [...r.configs].sort((a, b) => a.threshold - b.threshold);

const pct = (x: number, d = 1) => `${fmt(100 * x, d)} %`;

/** Fraccion de los candidatos que no llegan al umbral. */
const tasaFP = (c: Config) => (c.candidate_pairs ? c.false_positives / c.candidate_pairs : 0);
/** Fraccion de los pares sobre el umbral que no salieron candidatos. */
const tasaFN = (c: Config) => (c.pairs_above_threshold ? c.false_negatives / c.pairs_above_threshold : 0);

const nombre = (c: Config) => `(${c.bands}, ${c.rows})`;

/** Corte fijo de "parecidos" para comparar las configuraciones entre si: los
 *  falsos negativos del contrato son contra el umbral propio de cada (b, r), y
 *  esos no se comparan entre filas. */
const CORTE = 0.5;

/** Pares con Jaccard >= CORTE y cuantos de ellos no salieron candidatos. */
const parecidos = (c: Config) => {
  const altos = c.jaccard_buckets.filter((j) => j.lo >= CORTE);
  const pares = altos.reduce((a, j) => a + j.pairs, 0);
  const fuera = altos.reduce((a, j) => a + j.pairs - j.candidates, 0);
  return { pares, fuera };
};

const doc: TaskDoc<W5Task4> = {
  title: "Las bandas cambian falsos negativos por falsos positivos",
  topic: "MINHASH Y LSH",
  statement:
    "S24, estudio de la curva S: MinHash con n = 100 (la familia hash de la Unidad 1) calculado como una tarea Map en el runner de la Unidad 4, con las bandas agrupadas en el Reduce (>= 2 workers); probar (b, r) = (20, 5), (10, 10) y (50, 2); graficar la curva teorica 1 - (1 - s^r)^b contra la tasa empirica de candidatos por intervalo de Jaccard, y explicar el compromiso entre falsos positivos y falsos negativos.",
  standfirst:
    "Cada conductor se resume en una firma de 100 numeros con MinHash, calculada como tarea map en el runner del Workshop 4. La firma se parte en b bandas de r filas, y dos conductores son candidatos si coinciden en una banda entera. Se prueban tres formas de partirla y se compara lo que sale contra el Jaccard exacto de todos los pares.",
  lede: (r) => {
    const cs = porUmbral(r);
    const bajo = cs[0];
    const alto = cs.at(-1);
    if (!bajo || !alto) return "";
    const firmas = r.signatures_match
      ? "Las firmas que calcula el map son exactamente las del dataset."
      : "Las firmas del map no coinciden con las del dataset.";
    const todosCandidatos = r.total_pairs > 0 && cs.every((c) => c.candidate_pairs === r.total_pairs);
    if (todosCandidatos)
      return `${firmas} En esta ciudad las ${cs.length} configuraciones marcan candidatos a todos los pares (pasa, por ejemplo, con una sola zona: todos los conductores tienen los mismos shingles y Jaccard 1), asi que la curva S no se puede ver.`;
    const altoTxt =
      alto.pairs_above_threshold === 0
        ? `Con ${nombre(alto)} el umbral sube a ${fmt(alto.threshold, 2)}: ningun par llega, y los ${int(alto.candidate_pairs)} candidatos son todos falsos positivos.`
        : `Con ${nombre(alto)} el umbral sube a ${fmt(alto.threshold, 2)}: salen ${int(alto.candidate_pairs)} candidatos y se pierde el ${pct(
            tasaFN(alto)
          )} de los pares que lo superan.`;
    // Con un corte fijo si se pueden comparar las tres: cuantos pares parecidos deja fuera cada una.
    const { pares } = parecidos(bajo);
    const comparacion =
      pares > 0
        ? ` Con un mismo corte para las tres, de los ${int(pares)} pares con Jaccard de ${fmt(CORTE, 1)} o mas no salen candidatos ${cs
            .map((c) => `${int(parecidos(c).fuera)} con ${nombre(c)}`)
            .join(", ")}.`
        : "";
    return `${firmas} Con ${nombre(bajo)} el umbral es ${fmt(bajo.threshold, 2)} y salen ${int(bajo.candidate_pairs)} candidatos de ${int(
      r.total_pairs
    )} pares (${pct(bajo.candidate_pairs / r.total_pairs)}); el ${pct(tasaFP(bajo))} de ellos esta por debajo del umbral. ${altoTxt}${comparacion}`;
  },
  metrics: (r) => {
    const out = [
      { label: "Firmas del map", value: r.signatures_match ? "iguales" : "distintas", hint: `${int(r.n_hashes)} funciones, contra el dataset` },
      { label: "Pares posibles", value: int(r.total_pairs), hint: `${int(r.workers)} workers${r.parallel ? "" : ", sin paralelismo"}` },
    ];
    for (const c of porUmbral(r)) {
      out.push({
        label: `${nombre(c)} · umbral ${fmt(c.threshold, 2)}`,
        value: `${int(c.candidate_pairs)} candidatos`,
        hint:
          c.pairs_above_threshold > 0
            ? `FP ${pct(tasaFP(c))} de candidatos · FN ${pct(tasaFN(c))} de ${int(c.pairs_above_threshold)} pares ≥ umbral`
            : `ningun par llega al umbral · ${int(c.false_positives)} FP`,
      });
    }
    return out;
  },
  sections: [
    {
      h: "MinHash",
      p: "Para cada una de las 100 funciones h(x) = (a x + b) mod p de la Unidad 1, el valor de la firma es el menor h(x) entre los shingles del conductor (rachas de 3 zonas). Dos conductores tienen el mismo minimo con probabilidad igual a su Jaccard, asi que la fraccion de posiciones en que coinciden sus firmas lo estima. La firma tiene 100 numeros, sin importar cuantos shingles tenga el conductor.",
    },
    {
      h: "Como corre en MapReduce",
      p: "En dos etapas sobre el runner del Workshop 4. Primero un job de firmas: el map recibe (conductor, shingles) y emite (conductor, firma); se corre una vez porque la firma no depende de (b, r). Despues, un job por cada (b, r): el map parte la firma en b bandas y emite una clave (banda, sus r valores) por cada una; el reduce recibe a los conductores que cayeron en el mismo bucket y, si son dos o mas, lo emite una vez. El proceso principal arma con esos buckets el conjunto de pares candidatos: el mismo par puede salir en varias bandas y el conjunto lo cuenta una vez.",
    },
    {
      h: "La curva S",
      p: "Con Jaccard s, una banda coincide entera con probabilidad s^r, y el par es candidato si coincide al menos una de las b bandas: 1 - (1 - s^r)^b. Esa curva pasa de casi 0 a casi 1 cerca del umbral (1/b)^(1/r). Mas filas por banda la vuelven mas empinada y la corren a la derecha; mas bandas la corren a la izquierda.",
    },
    {
      h: "El compromiso",
      p: "Un falso positivo es un candidato con Jaccard bajo el umbral: cuesta tiempo, porque hay que compararlo de verdad y descartarlo. Un falso negativo es un par sobre el umbral que no salio candidato: se pierde sin que nadie se entere. Ojo al leer la tabla: cada fila cuenta sus falsos negativos contra su propio umbral, asi que esa columna no se compara entre filas; (50, 2) puede tener mas porque su umbral bajo llama parecidos a muchos mas pares. Para comparar hay que fijar un corte, como hace el resumen con Jaccard de 0,5 o mas: ahi un umbral bajo, como (50, 2), deja fuera menos pares parecidos pero saca muchos mas candidatos, y uno alto, como (10, 10), saca pocos y deja fuera mas. (20, 5) queda en medio. Cual conviene depende de que cueste mas: revisar candidatos de sobra o perder vecinos.",
    },
    {
      h: "Por que los puntos no caen sobre la curva",
      p: "La tasa medida de un intervalo es la fraccion de sus pares que salio candidata; la raya es la media de la curva sobre esos mismos pares. No coinciden exactamente porque todos los pares comparten las mismas 100 funciones: si en una banda el minimo cae en un shingle que todo un grupo de conductores tiene, coinciden todos a la vez. Esos pares no son independientes, y la tasa de un intervalo se mueve mas que con pares independientes. Promediada sobre muchas semillas, coincide con la curva.",
    },
    {
      h: "Comprobaciones",
      p: "Las firmas que emite el job de firmas se comparan una por una con las del dataset. El Jaccard verdadero de los pares se calcula con enteros, y el intervalo de un par es min(10 x interseccion / union, 9) en division entera, para que los Jaccard de exactamente 0,3 o 0,6 no caigan en el intervalo de abajo.",
    },
  ],
  takeaway:
    "Elegir (b, r) es elegir donde poner el umbral: con uno mas bajo se escapan menos pares parecidos, a cambio de revisar mas candidatos.",
};

export default doc;
