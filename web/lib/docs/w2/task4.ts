import type { TaskDoc } from "@/lib/tasks";
import type { W2Task4 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const errorPct = (r: W2Task4) =>
  r.true_distinct ? (100 * (r.estimate - r.true_distinct)) / r.true_distinct : 0;

const doc: TaskDoc<W2Task4> = {
  title: "Un entero por funcion hash estima los pasajeros distintos",
  topic: "CONTEO DE DISTINTOS - PANEL B",
  statement:
    "Flajolet-Martin: estimar cuantos rider_id distintos hay activos en el stream con 10 o mas funciones hash; comparar con el conteo verdadero.",
  standfirst:
    "Cada funcion hash convierte el rider_id en un numero y guarda solo R, la cola de ceros mas larga que ha visto en su representacion binaria. Su estimacion del numero de pasajeros distintos es 2^R. Las estimaciones de todas las funciones se combinan, y el resultado se compara con el conteo exacto, que se lleva aparte con un conjunto.",
  lede: (r) => {
    const e = errorPct(r);
    return `Con ${int(r.n_hashes)} funciones hash${r.combine ? ` combinadas con la ${r.combine}` : ""}, la estimacion es ${int(r.estimate)} pasajeros distintos y el conteo exacto es ${int(r.true_distinct)}: un error de ${e > 0 ? "+" : ""}${fmt(e, 1)}%.`;
  },
  metrics: (r) => {
    const e = errorPct(r);
    const ph = r.per_hash ?? [];
    return [
      { label: "Distintos (exacto)", value: int(r.true_distinct), hint: "conjunto con todos los rider_id" },
      { label: "Estimado", value: int(r.estimate), hint: r.combine ? `${r.combine} de los 2^R` : "combinacion de los 2^R" },
      { label: "Error", value: `${e > 0 ? "+" : ""}${fmt(e, 1)}%`, hint: "al final del stream" },
      { label: "Funciones hash", value: int(r.n_hashes), hint: "un entero de memoria por funcion" },
      ...(ph.length
        ? [{ label: "Rango de los 2^R", value: `${int(Math.min(...ph))} a ${int(Math.max(...ph))}`, hint: "menor y mayor estimacion individual" }]
        : []),
    ];
  },
  sections: [
    {
      h: "Problema",
      p: "El conteo exacto de pasajeros distintos exige guardar todos los identificadores vistos, y esa memoria crece con el numero de pasajeros. Se busca una estimacion con memoria fija, leyendo el stream una sola vez.",
    },
    {
      h: "Cola de ceros",
      p: "A cada rider_id se le aplica una funcion hash y se mira cuantos ceros tiene al final su representacion binaria. Un valor termina en al menos r ceros con probabilidad 1/2^r, asi que colas largas son raras. Cuantos mas pasajeros distintos pasan, mas probable es que alguno produzca una cola larga. Los repetidos no cambian nada: el mismo rider_id da siempre el mismo valor.",
    },
    {
      h: "Por que 2^R",
      p: "Con n elementos distintos, la probabilidad de que ninguno tenga una cola de al menos r ceros es aproximadamente e^(-n / 2^r). Si 2^r es mucho menor que n esa probabilidad es casi 0, y si es mucho mayor es casi 1. Por eso la cola mas larga observada, R, queda cerca de log2(n) y 2^R sirve como estimacion de n.",
    },
    {
      h: "Funciones hash",
      p: "El rider_id se convierte a un entero x con blake2b, que da el mismo valor en cada corrida. Cada funcion es h(x) = (a x + b) mod p, con p primo y con a y b elegidos al azar con semilla fija: la misma familia del ejemplo de clase y del Workshop 1.",
    },
    {
      h: "Combinacion",
      p: "Una sola funcion es muy variable: su estimacion solo puede ser una potencia de 2 y basta un valor con una cola inusualmente larga para sobreestimar mucho. El promedio de los 2^R hereda ese problema, porque un solo valor extremo lo domina. La mediana no: descarta los extremos por los dos lados.",
    },
    {
      h: "Limitaciones",
      p: "La mediana de potencias de 2 sigue siendo una potencia de 2, o el punto medio entre dos consecutivas, asi que la estimacion no puede acercarse al valor verdadero mas de lo que permite esa rejilla. Agregar funciones hace la estimacion mas estable, pero no mas fina. HyperLogLog resuelve esto repartiendo los elementos en cubetas y usando la media armonica.",
    },
    {
      h: "Memoria",
      p: "El resumen es un entero por funcion hash, sin importar cuantos pasajeros o eventos tenga el stream. El conjunto del conteo exacto se mantiene solo para medir el error.",
    },
  ],
  takeaway:
    "Flajolet-Martin cambia un conjunto con todos los identificadores por un entero por funcion hash, a cambio de una estimacion que solo cae en potencias de 2.",
};

export default doc;
