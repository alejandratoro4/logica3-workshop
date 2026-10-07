import type { TaskDoc } from "@/lib/tasks";
import type { W1Task4 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W1Task4> = {
  title: "Dos consultas en vez de una",
  topic: "TABLA HASH",
  statement:
    "Construir una tabla hash indexada por pickup_zone para agrupar las solicitudes concurrentes; comparar la carga de los buckets con encadenamiento contra power-of-two-choices.",
  standfirst:
    "Las solicitudes que compiten en la misma zona y la misma ventana de 5 minutos se reparten entre colas de despacho, con encadenamiento y con power-of-two-choices. La segunda consulta cambia el peor caso.",
  lede: (r) => {
    const s = r.summary;
    return `Sobre ${int(s.n_windows_analyzed)} ventanas de cinco minutos, la cola mas cargada baja de ${fmt(
      s.avg_max_load_chaining,
      2
    )} a ${fmt(
      s.avg_max_load_p2c,
      2
    )} solicitudes en promedio con solo mirar dos colas en vez de una. En la peor ventana observada, de ${fmt(
      s.worst_max_load_chaining,
      0
    )} a ${fmt(s.worst_max_load_p2c, 0)}.`;
  },
  metrics: (r) => {
    const s = r.summary;
    const w = r.top_windows[0];
    const t = w?.theory;
    const medido = w?.chaining.loads.length ? Math.max(...w.chaining.loads) : null;
    return [
      { label: "Carga maxima promedio", value: fmt(s.avg_max_load_chaining, 2), hint: `power-of-two-choices ${fmt(s.avg_max_load_p2c, 2)}` },
      { label: "Peor ventana observada", value: fmt(s.worst_max_load_chaining, 0), hint: `power-of-two-choices ${fmt(s.worst_max_load_p2c, 0)}` },
      { label: "Ventanas analizadas", value: int(s.n_windows_analyzed), hint: `${fmt(s.B_buckets, 0)} colas de despacho` },
      ...(t
        ? [
            {
              label: "Referencia teorica (aprox.)",
              value: fmt(t.chaining_expected_max, 1),
              hint:
                medido !== null
                  ? `medido ${fmt(medido, 0)} — carga media ${fmt(t.avg_load, 2)}`
                  : `carga media ${fmt(t.avg_load, 2)}`,
            },
          ]
        : []),
    ];
  },
  sections: [
    {
      h: "Que es una ventana",
      p: "Las solicitudes se agrupan por (zona, ventana de 5 minutos): cada grupo es el conjunto de viajes que compiten por un conductor casi al mismo tiempo en el mismo sitio. Cada grupo se reparte entre B colas de despacho y se mide la carga de la cola mas llena. Esa cola es la que fija cuanto espera el pasajero con peor suerte de esa ventana.",
    },
    {
      h: "Las dos estrategias",
      p: "Con encadenamiento, cada solicitud se manda a la cola que le indique su hash y se encola ahi. Con power-of-two-choices se calculan dos hashes independientes, se miran las dos colas candidatas y la solicitud va a la menos cargada. El costo adicional es un hash y una comparacion por solicitud.",
    },
    {
      h: "Dos capas de hashing",
      p: "La tabla indexada por pickup_zone es la capa exterior: un diccionario con clave (zona, ventana de 5 minutos) que junta las solicitudes que compiten a la vez en el mismo sitio. La capa interior es la que se compara: las solicitudes de cada grupo se reparten entre 16 colas hasheando su ride_id, una vez con encadenamiento y dos con power-of-two-choices. Hashear la zona en la capa interior no tendria sentido: todas las solicitudes del grupo comparten zona e irian a la misma cola. El agregado excluye las ventanas con menos de dos solicitudes, donde no hay nada que balancear.",
    },
    {
      h: "Por que mejora tanto por tan poco",
      p: "Con una sola opcion, la carga maxima esperada crece como Theta(log n / log log n). Con dos opciones cae a Theta(log log n): una mejora exponencial en la cota, no una constante. La intuicion es que basta una segunda opcion para romper el efecto de bola de nieve por el que un bucket que va ganando sigue ganando. Pasar de dos a tres opciones ya casi no aporta.",
    },
    {
      h: "Lo que se mide y lo que se promete",
      p: "El promedio sobre todas las ventanas confirma la mejora, pero el numero que vale es la peor ventana: es la que define el SLA. Ahi es donde la diferencia entre las dos estrategias se vuelve visible para un pasajero real, no solo para una grafica.",
    },
    {
      h: "Que referencia teorica aplica",
      p: "Las cotas que se ven en clase (del orden de log n sobre log log n para una opcion, y log log n para dos) se derivan suponiendo tantas bolas como bins: una solicitud por cola en promedio. Este escenario no es ese. En la ventana mas concurrida hay del orden de cien solicitudes para dieciseis colas, o sea una carga media muy por encima de uno, y en ese regimen la carga maxima es la media mas una desviacion. Las referencias que se dibujan (media + raiz de 2 media ln B para chaining, media + ln ln B / ln 2 para P2C) son aproximaciones de ese orden de magnitud, sin el termino O(1) ni un nivel de confianza: no son un limite que cada ventana deba respetar, y alguna lo pasa por poco. Sirven para ver que lo medido tiene el tamano esperado. La mejora de P2C sobre chaining se sostiene con la medicion sola. Distinguir los dos regimenes es la mitad del ejercicio.",
    },
  ],
  takeaway:
    "Es el mejor retorno por complejidad de todo el proyecto: un hash adicional por solicitud compra una mejora exponencial en el peor caso.",
};

export default doc;
