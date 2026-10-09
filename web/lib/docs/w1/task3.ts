import type { TaskDoc } from "@/lib/tasks";
import type { W1Task3 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W1Task3> = {
  title: "Sortear la funcion hash acota las colisiones",
  topic: "HASHING UNIVERSAL",
  statement:
    "Hashear driver_id para rutear las solicitudes de viaje a los procesos de despacho; medir las colisiones.",
  standfirst:
    "Cada conductor se asigna a uno de K procesos de despacho con una funcion de la familia universal h(x) = ((a x + b) mod p) mod K, con a y b sorteados. Se cuentan los pares de conductores que caen en el mismo proceso y se comparan con la cota C(n,2)/K. Como referencia se mide tambien un hash de suma de caracteres.",
  lede: (r) => {
    const u = r.universal[r.universal.length - 1];
    if (!u) return "";
    const v = r.naive?.find((x) => x.K === u.K);
    const base = `Con K = ${int(u.K)} procesos, la familia universal deja ${int(u.avg_collisions_empirical)} pares de conductores en colision; la cota C(n,2)/K es ${int(u.theoretical_expected_collisions)}.`;
    return v
      ? `${base} El hash de suma de caracteres deja ${int(v.collisions_empirical)} con el mismo K, y su proceso mas cargado recibe ${fmt(v.desbalance, 1)} veces la carga media, contra ${fmt(u.avg_desbalance, 1)} de la familia universal.`
      : base;
  },
  metrics: (r) => {
    const first = r.universal[0];
    const last = r.universal[r.universal.length - 1];
    if (!first || !last) return [];
    const v = r.naive?.find((x) => x.K === last.K);
    return [
      { label: `Colisiones con K = ${int(first.K)}`, value: int(first.avg_collisions_empirical), hint: `cota C(n,2)/K = ${int(first.theoretical_expected_collisions)}` },
      { label: `Colisiones con K = ${int(last.K)}`, value: int(last.avg_collisions_empirical), hint: `cota C(n,2)/K = ${int(last.theoretical_expected_collisions)}` },
      { label: `Desbalance universal, K = ${int(last.K)}`, value: fmt(last.avg_desbalance, 2), hint: "carga maxima / carga media" },
      ...(v ? [{ label: `Desbalance de referencia, K = ${int(last.K)}`, value: fmt(v.desbalance, 2), hint: "hash de suma de caracteres" }] : []),
      { label: "Valores de K", value: int(r.universal.length), hint: r.universal.map((x) => x.K).join(", ") },
    ];
  },
  sections: [
    {
      h: "Problema",
      p: "Cada solicitud trae el driver_id del conductor asignado y hay K procesos de despacho. El proceso que atiende a un conductor se calcula con una funcion hash, sin guardar una tabla de asignaciones. Si la funcion reparte mal, unos procesos se saturan y otros quedan vacios.",
    },
    {
      h: "Familia universal",
      p: "Se usa h(x) = ((a x + b) mod p) mod K, con p primo mayor que cualquier clave, a en [1, p-1] y b en [0, p-1] elegidos al azar. Para dos claves distintas, la probabilidad de colision es a lo sumo 1/K. Esa probabilidad se toma sobre el sorteo de a y b, no sobre las claves, por lo que la garantia no depende de como esten formados los identificadores.",
    },
    {
      h: "Conversion de la clave",
      p: "La familia opera sobre enteros y driver_id es texto. Cada identificador se convierte a un entero con blake2b, que da el mismo valor en cada corrida. La conversion es fija; la aleatoriedad que sustenta la cota viene del sorteo de a y b.",
    },
    {
      h: "Medicion de colisiones",
      p: "Si un proceso recibe c conductores, contiene c(c-1)/2 pares en colision. Se suma sobre los K procesos y se promedia sobre varias funciones de la familia. Por linealidad de la esperanza, el valor esperado es a lo sumo C(n,2)/K, con n el numero de conductores distintos. La tabla del panel muestra el valor medido y la cota para cada K.",
    },
    {
      h: "Hash de referencia",
      p: "El hash de referencia suma los codigos de los caracteres del identificador y toma modulo K. Los driver_id comparten el prefijo y solo cambian en los digitos, de modo que la suma toma pocos valores distintos. Al aumentar K los conductores siguen cayendo en los mismos procesos y las colisiones dejan de bajar.",
    },
    {
      h: "Lectura del desbalance",
      p: "El desbalance es la carga del proceso mas cargado dividida por la carga media. En la familia universal tambien crece con K: con pocos conductores por proceso, uno o dos de mas pesan mucho en el cociente. Es la variacion propia de un reparto aleatorio. La comparacion relevante es entre la familia universal y el hash de referencia para un mismo K.",
    },
  ],
  takeaway:
    "La familia universal garantiza en promedio a lo sumo C(n,2)/K colisiones sin suponer nada sobre los identificadores; un hash fijo, como la suma de caracteres, depende de la forma de las claves.",
};

export default doc;
