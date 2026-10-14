import type { TaskDoc } from "@/lib/tasks";
import type { W3Task5 } from "@/lib/generated/contratos";
import { int } from "@/lib/format";

const clausulas = (r: W3Task5) => r.constraints.flatMap((c) => c.clauses);

/** Vuelve a evaluar la formula con la asignacion final, como el panel. */
const cumplidas = (r: W3Task5) => {
  const vale = (lit: string) => {
    const neg = lit.startsWith("-");
    const v = r.assignment[neg ? lit.slice(1) : lit];
    return neg ? v === false : v === true;
  };
  return clausulas(r).filter((c) => c.some(vale)).length;
};

const verdaderas = (r: W3Task5) => {
  const sig = Object.fromEntries(r.variables.map((v) => [v.name, v.meaning]));
  return Object.entries(r.assignment)
    .filter(([, v]) => v)
    .map(([k]) => sig[k] ?? k);
};

const doc: TaskDoc<W3Task5> = {
  title: "Una caminata al azar resuelve las reglas de despacho",
  topic: "2-SAT ALEATORIZADO",
  statement:
    "Algoritmo de Papadimitriou: plantear 5 restricciones de politica de despacho sobre 8 o mas variables (por ejemplo, si la probabilidad estacionaria de una zona es alta, o el surge esta activo alli o se envian conductores extra) y buscar una asignacion que las cumpla todas.",
  standfirst:
    "Las reglas de despacho se escriben como clausulas de dos literales sobre variables como surge activo o conductores extra en cada zona. Las condiciones sobre la distribucion estacionaria se evaluan con los datos antes de armar la formula. Despues, una caminata aleatoria sobre las asignaciones busca una que cumpla todo.",
  lede: (r) => {
    const n = r.variables.length;
    const m = clausulas(r).length;
    return `Con ${int(n)} variables y ${int(m)} clausulas, el algoritmo de Papadimitriou ${
      r.satisfiable ? "encontro una asignacion que cumple todas las reglas" : "no encontro asignacion"
    } en ${int(r.flips)} cambios, de un limite de ${int(r.max_flips)} = 2·b·n². ${
      r.satisfiable ? `Quedan activos: ${verdaderas(r).join("; ")}.` : ""
    }`;
  },
  metrics: (r) => {
    const n = r.variables.length;
    const m = clausulas(r).length;
    const aplican = r.constraints.filter((c) => c.clauses.length > 0).length;
    return [
      { label: "Resultado", value: r.satisfiable ? "Satisfacible" : "Sin asignacion", hint: `${int(cumplidas(r))} de ${int(m)} clausulas cumplidas` },
      { label: "Variables · clausulas", value: `${int(n)} · ${int(m)}`, hint: "todas de 2 literales" },
      { label: "Restricciones que aplican", value: `${int(aplican)} de ${int(r.constraints.length)}`, hint: "segun la pi calculada con los datos" },
      { label: "Cambios hechos", value: int(r.flips), hint: `limite 2·b·n² = ${int(r.max_flips)}` },
      { label: "Cota esperada n²", value: int(n * n), hint: "cambios esperados si es satisfacible" },
    ];
  },
  sections: [
    {
      h: "Que pregunta responde esta task",
      p: "El despacho tiene reglas que compiten: las zonas que mas atraen conductores necesitan surge o refuerzo, pero la flota de refuerzo es limitada y sale de algun lado. La pregunta es si existe una configuracion que cumpla todas las reglas a la vez y, si existe, encontrarla. Cuando cada regla se puede escribir con clausulas de dos literales, eso es 2-SAT.",
    },
    {
      h: "Paso 1: las variables",
      p: "Cada variable es una decision de si o no: surge activo en una zona, enviar conductores extra a una zona, reubicar conductores desde otra. Las zonas se escogen con la distribucion estacionaria: las tres de mayor pi, que son las que mas reciben conductores a largo plazo, y la de menor pi, de donde puede salir el refuerzo.",
    },
    {
      h: "Paso 2: las condiciones se evaluan, no se vuelven variables",
      p: "Una regla como si pi(X) es alta, entonces surge en X o extra a X parece tener tres partes. Si pi alta fuera una variable p, quedaria la clausula (no p o surge o extra), de tres literales, y eso ya no es 2-SAT. Por eso la condicion se evalua con los datos: la task arma su propia matriz M desde las reubicaciones, calcula pi = pi M y compara con la participacion pareja 1/n. Si se cumple, entra la clausula (surge o extra); si no, la regla no aplica.",
    },
    {
      h: "Paso 3: el algoritmo de Papadimitriou",
      p: "Se empieza con una asignacion al azar. Mientras quede una clausula sin cumplir, se escoge una al azar y se cambia una de sus dos variables, tambien al azar. Si la formula tiene solucion, cada cambio acerca a una asignacion que la cumple con probabilidad al menos 1/2, porque al menos uno de los dos literales esta mal respecto a esa solucion. La distancia de Hamming hace entonces una caminata aleatoria que llega a cero en a lo sumo n² cambios esperados.",
    },
    {
      h: "Paso 4: cuantos cambios dejar",
      p: "Con 2n² cambios, por la desigualdad de Markov, el algoritmo falla con probabilidad a lo sumo 1/2. Repetirlo b veces, o sea dejar 2·b·n² cambios, baja el fallo a 1/2^b. Un resultado sin asignacion solo dice que se agoto ese limite: no prueba que la formula sea insatisfacible. Con 8 variables tambien se puede revisar a mano: el script cuenta por fuerza bruta cuantas de las 2^8 asignaciones cumplen todo, solo para verificar.",
    },
    {
      h: "Como leer el resultado",
      p: "La asignacion es una de varias posibles: otra semilla puede dar otra igualmente valida. Lo que si se mantiene es la estructura: la flota limitada impide reforzar a la vez las zonas mas cargadas, asi que en algunas el surge tiene que hacer el trabajo. Y como la pi de este grafo queda muy cerca del volumen de viajes, las zonas que piden surge son las mismas que concentran la demanda.",
    },
  ],
  takeaway:
    "Escoger una clausula rota y cambiar una variable al azar parece demasiado simple, pero en 2-SAT cada cambio acerca a la solucion con probabilidad al menos 1/2: n² cambios esperados bastan, y repetir baja el fallo tan rapido como se quiera.",
};
export default doc;
