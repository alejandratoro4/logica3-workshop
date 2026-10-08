import type { TaskDoc } from "@/lib/tasks";
import type { W2Task2 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W2Task2> = {
  title: "El filtro de Bloom evita despachar dos veces al mismo pasajero",
  topic: "FILTRO DE BLOOM · PANEL A",
  statement:
    "Filtro de Bloom de los pasajeros ya emparejados en el minuto en curso, para no despacharlos dos veces. Elegir k = floor((n/m) ln 2) y medir la tasa de falsos positivos empírica contra la teórica.",
  standfirst:
    "Cada minuto, el índice de despacho tiene que saber si un pasajero ya fue emparejado, sin guardar la lista de IDs. Un filtro de Bloom lo responde con una huella fija de bits: nunca dice que no cuando sí estaba, pero a veces dice que sí cuando no estaba. El costo de ese falso positivo es esperar una asignación que no llega, no un error de datos.",
  lede: (r) =>
    `Con n = ${int(r.n_bits)} bits, m = ${int(r.m_items)} pasajeros esperados por minuto y k = ${int(r.k)} funciones hash, la tasa teórica es ${pct(r.fp_theoretical, 2)} y la empírica sobre el stream quedó en ${pct(r.fp_empirical, 2)}.`,
  metrics: (r) => [
    { label: "Bits del filtro", value: int(r.n_bits), hint: `≈ ${fmt(r.n_bits / 8)} bytes` },
    { label: "Funciones hash", value: int(r.k), hint: "k = floor((n/m) ln 2)" },
    { label: "FP teórico", value: pct(r.fp_theoretical, 2), hint: "(1 − e^(−km/n))^k" },
    { label: "FP empírico", value: pct(r.fp_empirical, 2), hint: "falsos positivos / consultas de pasajeros no insertados" },
  ],
  sections: [
    {
      h: "Por qué un filtro y no la lista",
      p: "El despacho decide por minuto: si un pasajero ya fue emparejado en este minuto, no se le asigna un segundo conductor. Guardar los IDs de todos los pasajeros del minuto cuesta memoria que crece con la demanda; un filtro de Bloom fija ese costo en n bits pase lo que pase. El filtro nunca da falsos negativos: si el pasajero fue insertado, la consulta siempre dice que sí. El único error posible es el falso positivo, y su consecuencia es benigna: el pasajero espera un poco más, no se corrompe ningún dato.",
    },
    {
      h: "El diseño: k = floor((n/m) ln 2)",
      p: "Con n bits y m elementos esperados, la tasa de falsos positivos se minimiza cuando k ≈ (n/m) ln 2 funciones hash. La probabilidad teórica de que una consulta negativa encienda los k bits es (1 − e^(−km/n))^k. El filtro se reinicia al cambiar de minuto, así que m es el número de pasajeros distintos que se esperan en un minuto de la zona más cargada.",
    },
    {
      h: "Medir la tasa empírica",
      p: "Para medir sin mirar el futuro se lleva, aparte, el conjunto exacto de los pasajeros insertados en el minuto. La primera aparición de un pasajero es una consulta con ground truth negativo: si el filtro responde que ya estaba, es un falso positivo. La tasa empírica es falsos positivos sobre todas esas consultas negativas, y la serie running la acumula a lo largo del stream, un punto por hora.",
    },
    {
      h: "Por qué la empírica puede salir por debajo de la teórica",
      p: "La fórmula teórica supone que el filtro se llena hasta m. Si el minuto real trae menos pasajeros distintos que la cota, el filtro queda menos cargado y la tasa observada baja. La brecha entre las dos curvas no es un error: es la holgura del diseño.",
    },
  ],
  takeaway:
    "Evitar el doble despacho no exige recordar a los pasajeros: exige recordar su huella, y un falso positivo cuesta una espera, no un error.",
};

export default doc;
