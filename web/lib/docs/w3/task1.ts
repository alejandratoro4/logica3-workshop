import type { TaskDoc } from "@/lib/tasks";
import type { W3Task1 } from "@/lib/generated/contratos";
import { int } from "@/lib/format";

const doc: TaskDoc<W3Task1> = {
  title: "La cadena de reubicaciones no tiene zona muerta",
  topic: "DTMC · CLASIFICACIÓN DE ESTADOS",
  statement:
    "Estados = zonas de recogida (8 o más). Construir M a partir de reloc_count. ¿Hay alguna zona absorbente ('zona muerta': los conductores llegan pero nunca salen)?",
  standfirst:
    "El grafo de reubicaciones de la Unidad 2 se convierte en una cadena de Markov: cada fila de M reparte las salidas de una zona entre las demás. La pregunta es si alguna zona retiene a todos los conductores que llegan — un sumidero de flota — y si la cadena se puede recorrer entera desde cualquier punto.",
  lede: (r) => {
    const n = r.states.length;
    const muertas = r.absorbing;
    const zonas = muertas.length
      ? `y hay ${int(muertas.length)} zona muerta: ${muertas.join(", ")}`
      : "y ninguna zona es un sumidero de conductores";
    return `Con ${int(n)} zonas como estados, la matriz M queda de ${int(n)}×${int(n)}: ${r.irreducible ? "irreducible" : "reducible"}, ${r.aperiodic ? "aperiódica" : "periódica"}, ${zonas}.`;
  },
  metrics: (r) => [
    { label: "Estados", value: int(r.states.length), hint: "zonas de recogida" },
    {
      label: "Absorbentes",
      value: int(r.absorbing.length),
      hint: r.absorbing.length ? r.absorbing.join(", ") : "ninguna zona muerta",
    },
    { label: "Irreducible", value: r.irreducible ? "sí" : "no", hint: "se llega de toda zona a toda zona" },
    { label: "Aperiódica", value: r.aperiodic ? "sí" : "no", hint: "el mcd de los ciclos es 1" },
    ...(r.classes
      ? [
          {
            label: "Clases",
            value: int(r.classes.length),
            hint: r.classes.map((c) => `${c.type} (${c.states.length})`).join(", "),
          },
        ]
      : []),
  ],
  sections: [
    {
      h: "De las aristas a la matriz",
      p: "edges.csv trae una fila por par de zonas con su reloc_count: cuántas veces un conductor terminó un viaje en from_zone y empezó el siguiente en to_zone. M[i][j] divide ese conteo entre el total de salidas de la zona i, así que cada fila suma 1 y M[i][j] es la probabilidad de pasar de i a j. Los lazos — dos viajes seguidos en la misma zona — quedan en la diagonal.",
    },
    {
      h: "La zona muerta",
      p: "Una zona absorbente es un estado con M[i][i] = 1: todo conductor que llega se queda, y una vez dentro nunca sale. Es un sumidero de conductores: si el despacho tuviera una, la flota se acumularía ahí y las demás zonas se quedarían sin coches. La pregunta del enunciado es exactamente esa, y la respuesta sale de mirar la diagonal de M.",
    },
    {
      h: "Irreducible y aperiódica",
      p: "Irreducible significa que desde cualquier zona se alcanza cualquier otra; en el grafo del enunciado cada zona tiene salidas hacia todas las demás, porque en la Unidad 1 el conductor de cada viaje se sorteaba al azar. Aperiódica significa que no hay un periodo que congele los retornos: basta un lazo en la diagonal para que el máximo común divisor de las longitudes de los ciclos sea 1, y en los datos los hay.",
    },
    {
      h: "Clases de comunicación",
      p: "Dos zonas están en la misma clase si se alcanzan mutuamente. Una clase es recurrente si no tiene salida a otra clase — una zona absorbente es una clase recurrente de un solo estado — y transitoria si desde ella se puede caer a otra. Con una sola clase recurrente que las contiene todas, la cadena se puede estudiar como un todo.",
    },
  ],
  takeaway:
    "Construir M es dividir cada fila entre su total; clasificar la cadena es preguntar si hay un sumidero de conductores. En el escenario del enunciado no lo hay: los conductores se sortean al azar, toda zona tiene salidas y ninguna es una zona muerta.",
};

export default doc;
