import type { TaskDoc } from "@/lib/tasks";
import type { W2Task1 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W2Task1> = {
  title: "Modelo de stream y diseño de consultas",
  topic: "STREAM · VENTANA · DISTINTOS",
  statement:
    "El índice de despacho recibe solicitudes en un flujo continuo; las decisiones de surge se toman desde resúmenes, no desde el histórico almacenado. Consulta permanente: promedio móvil de wait_for_driver_sec por zona sobre las últimas 500 solicitudes. Consulta ad hoc: cuántos pasajeros distintos pidieron viaje en la última hora. Estimar el tamaño del almacén de trabajo dentro de un presupuesto de 10 MB.",
  standfirst:
    "Dos consultas en línea sobre el stream: una ventana deslizante por zona y un conteo de distintos por hora, con su costo de memoria.",
  lede: (r) =>
    `Con ${int(r.n_events)} eventos leídos y una ventana de ${int(r.window_n)} solicitudes ${r.window_scope === "por zona" ? "por zona" : "en toda la ciudad"}, el almacén de trabajo cabe en ${fmt(r.budget.total_bytes)} bytes de un presupuesto de ${fmt(r.budget.limit_bytes)}.`,
  metrics: (r) => [
    { label: "Eventos del stream", value: int(r.n_events), hint: "filas leídas de stream.csv" },
    { label: "Ventana", value: int(r.window_n), hint: "últimas solicitudes por zona" },
    { label: "Alcance", value: r.window_scope, hint: "cómo se lee la ventana" },
    { label: "Almacén usado", value: fmt(r.budget.total_bytes), hint: "de " + fmt(r.budget.limit_bytes) + " disponibles" },
  ],
  sections: [
    {
      h: "Paso 1 — Leer el stream una sola vez",
      p: "El script recorre stream.csv en orden de stream_seq y solo guarda el resumen: una cola por zona con las últimas 500 esperas y un diccionario rider → timestamp para la ventana de una hora. No retiene el histórico.",
    },
    {
      h: "Paso 2 — Consulta permanente",
      p: "Por cada evento se encola la espera en la ventana de su zona y se descarta la más antigua al pasar de 500. El promedio móvil es la media de la cola.",
    },
    {
      h: "Paso 3 — Consulta ad hoc",
      p: "Se registra cada rider con la hora de su solicitud y se podan los que llevan más de una hora. El tamaño del diccionario es la respuesta: pasajeros distintos en la última hora.",
    },
    {
      h: "Paso 4 — Presupuesto",
      p: "Se suma el costo de las colas (500 floats por zona) y del diccionario de riders, y se compara contra el límite de 10 MB.",
    },
  ],
  takeaway:
    "Con una ventana por zona y un conteo de distintos por hora, el resumen cabe holgado en 10 MB: las decisiones de surge no necesitan el histórico.",
};

export default doc;
