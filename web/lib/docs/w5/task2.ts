import type { TaskDoc } from "@/lib/tasks";
import type { W5Task2 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

const doc: TaskDoc<W5Task2> = {
  title: "El angulo se vuelve bits: hiperplanos aleatorios y bandas",
  topic: "LSH PARA EL COSENO",
  statement:
    "Firmas de hiperplanos aleatorios (bit = signo de v·x) con n = 16, 32, 64 y 128; verificar que la fraccion de bits que coinciden es ~ 1 - theta/180 (angulo estimado contra el verdadero en 1.000 pares); hacer bandas con las firmas y reportar el recall@5 contra el top-5 por coseno de fuerza bruta para 50 consultas, y la fraccion de comparaciones ahorradas.",
  standfirst:
    "Cada hiperplano parte el espacio en dos: el signo del producto punto es un bit. Con suficientes bits, la fraccion que coincide entre dos conductores estima su angulo, y agrupar esos bits en bandas convierte la busqueda exhaustiva en unas pocas comparaciones.",
  lede: (r) =>
    `Con ${int(r.drivers)} conductores y ${int(r.queries)} consultas, el error medio del angulo cae de ${fmt(
      r.angle_check[0]?.mean_abs_error_deg ?? 0,
    )} grados con ${int(r.angle_check[0]?.bits ?? 0)} bits a ${fmt(
      r.angle_check[r.angle_check.length - 1]?.mean_abs_error_deg ?? 0,
    )} con ${int(r.angle_check[r.angle_check.length - 1]?.bits ?? 0)}. La mejor banda guarda ${pct(
      r.banding[0]?.comparisons_saved ?? 0,
    )} de las comparaciones.`,
  metrics: (r) => [
    { label: "Conductores", value: int(r.drivers) },
    { label: "Consultas", value: int(r.queries) },
    { label: "Pares de la verificacion", value: int(r.angle_check[0]?.pairs ?? 0) },
    { label: "Configuraciones de bandas", value: int(r.banding.length) },
  ],
  sections: [
    {
      h: "Paso 1 — Un hiperplano, un bit",
      p: "Cada hiperplano es un vector con componentes gaussianas de la misma dimension que el vector de ocupacion. El bit es 1 si el producto punto es mayor o igual a cero. Dos conductores coinciden en un bit con probabilidad 1 - theta/180, donde theta es el angulo entre sus vectores.",
    },
    {
      h: "Paso 2 — Por que gaussianas y no +-1",
      p: "Con componentes +-1 la direccion del hiperplano no queda uniforme y el error contra 1 - theta/180 crece. Las gaussianas reparten la direccion por igual en todas las orientaciones, que es lo que exige la formula.",
    },
    {
      h: "Paso 3 — Del angulo a los bits",
      p: "Con n bits, el angulo estimado es 180 por la fraccion de bits distintos. La verificacion compara ese estimado con el angulo verdadero, sacado del coseno exacto, sobre mil pares al azar: el error medio debe bajar al crecer n, porque cada bit extra reduce la varianza del estimador.",
    },
    {
      h: "Paso 4 — Bandas: de bits a candidatos",
      p: "La firma se parte en b bandas de r filas. Dos conductores son candidatos si coinciden en los r bits de alguna banda. Mas bandas suben el recall y tambien el numero de candidatos; menos bandas ahorran comparaciones pero pierden vecinos.",
    },
    {
      h: "Paso 5 — Recall contra ahorro",
      p: "El recall@5 mide cuantos de los cinco vecinos exactos por coseno aparecen en el top-5 de los candidatos. El ahorro es la fraccion de comparaciones que no se hacen: uno menos el cociente entre los candidatos medios y los demas conductores.",
    },
  ],
  takeaway:
    "La LSH no busca mejor: busca menos. Su unica promesa es gastar comparaciones donde hay probabilidad de parecido, y las bandas son la perilla que fija ese precio.",
};

export default doc;
