import type { TaskDoc, TaskMetric } from "@/lib/tasks";
import type { W1Task2 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";
import { quicksortSeries } from "@/lib/quicksort";

const doc: TaskDoc<W1Task2> = {
  title: "La aleatorizacion no acelera: quita la dependencia del orden de entrada",
  topic: "ALGORITMO ALEATORIZADO",
  statement:
    "Usar QuickSort aleatorizado para rankear viajes por tarifa, o reservoir sampling para estimar rapido la tarifa promedio; comparar contra ordenar o contar el dataset completo.",
  standfirst:
    "Se compara QuickSort con pivote aleatorio contra pivote fijo, y reservoir sampling contra el calculo exacto. La ventaja de aleatorizar no aparece donde uno la espera.",
  lede: (r) => {
    const s = quicksortSeries(r, "sorted_input");
    const last = s.n.length - 1;
    const ratio = last >= 0 && s.randomized_time[last] > 0 ? s.deterministic_time[last] / s.randomized_time[last] : null;
    return `Con las tarifas en orden natural, el pivote aleatorio y el fijo empatan — el aleatorio incluso cuesta un poco mas por generar numeros. La diferencia aparece con la entrada ya ordenada, donde el pivote fijo degenera a O(n^2)${
      ratio ? ` y tarda ${fmt(ratio, 0)} veces mas con n=${int(s.n[last])}` : ""
    }.`;
  },
  metrics: (r) => {
    const a = quicksortSeries(r, "random_input");
    const s = quicksortSeries(r, "sorted_input");
    const li = a.n.length - 1;
    const ls = s.n.length - 1;
    const out: TaskMetric[] = [];
    if (li >= 0) {
      out.push({
        label: `Entrada desordenada (n=${int(a.n[li])})`,
        value: `${fmt(a.randomized_time[li], 2)} s`,
        hint: `pivote fijo ${fmt(a.deterministic_time[li], 2)} s — empate`,
      });
    }
    if (ls >= 0) {
      out.push({
        label: `Entrada ya ordenada (n=${int(s.n[ls])})`,
        value: `${fmt(s.randomized_time[ls], 3)} s`,
        hint: `pivote fijo ${fmt(s.deterministic_time[ls], 2)} s — colapso`,
      });
    }
    // El tiempo depende de la maquina; las comparaciones son lo que el teorema
    // predice, asi que es la cifra que de verdad contrasta teoria con medicion.
    const medidas = a.randomized_comparisons[li];
    const teoria = a.expected_comparisons[li];
    if (li >= 0 && medidas !== undefined && teoria !== undefined && teoria > 0) {
      out.push({
        label: "Comparaciones vs. 2n ln n",
        value: `${fmt(medidas / teoria, 2)}x`,
        hint: `${int(medidas)} medidas contra ${int(teoria)} previstas`,
      });
    }
    return out;
  },
  sections: [
    {
      h: "Los dos experimentos",
      p: "Primero QuickSort con pivote aleatorio contra pivote fijo (el primer elemento), sobre las tarifas en su orden natural y sobre las tarifas ya ordenadas ascendentemente. Despues reservoir sampling contra el calculo exacto, para la media y para los cuantiles. Los tiempos de QuickSort son de una sola corrida por tamano: la diferencia que interesa, la del peor caso, es mucho mayor que lo que varia una corrida a otra. Los del muestreo son el promedio de varias repeticiones, porque ahi las diferencias son chicas.",
    },
    {
      h: "Por que el caso adversario se corta en n = 8000",
      p: "Con la entrada ordenada el pivote fijo parte el arreglo en 1 y n-1 en cada nivel: la recursion se vuelve lineal en profundidad y el costo cuadratico. A escala completa no terminaria, asi que ese escenario se mide hasta n = 8000 y ademas se sube el limite de recursion, capturando el desborde en una bandera en vez de dejar que reviente. No es una limitacion del experimento: es exactamente el resultado que se queria mostrar.",
    },
    {
      h: "El muestreo pierde en tiempo y gana en memoria",
      p: "Para la media, reservoir sampling es mas lento que sumar y dividir: ambos recorren el stream una vez con memoria constante, pero el muestreo paga generar un aleatorio por elemento. Esa comparacion esta puesta a proposito, porque muestra que muestrear no es un atajo de velocidad. Donde si gana es en los cuantiles: calcularlos exactos exige tener los n elementos en memoria, mientras el reservorio trabaja con k fijo y da un error de decimas de punto porcentual.",
    },
    {
      h: "Por que importa en este dominio",
      p: "Las tarifas casi nunca llegan desordenadas: vienen de una consulta con ORDER BY, de un indice, o de un archivo particionado por fecha. Es decir, el peor caso del pivote fijo es el caso comun en produccion. El pivote aleatorio no mejora el promedio, pero hace que, con valores distintos, ningun orden de entrada en particular sea el malo: el costo esperado es O(n log n) para cualquier entrada. El peor caso O(n^2) sigue existiendo para ambas versiones; con pivote aleatorio solo es improbable, no imposible.",
    },
    {
      h: "Donde la medicion se separa de la teoria, y por que",
      p: "El teorema dice que el quicksort aleatorizado hace 2n ln n comparaciones en promedio, sumando sobre cada par la probabilidad de que lleguen a compararse. La medicion lo sigue bien hasta cierto tamanio y despues se despega hacia arriba. No es un error de implementacion: la demostracion supone que los elementos son distintos, y estas tarifas estan redondeadas a peso entero, asi que cada valor se repite decenas de veces. La particion de Lomuto compara con <=, de modo que todos los valores iguales al pivote se van del mismo lado y la particion se desbalancea. En el extremo, con todos los valores iguales, hace n(n-1)/2 comparaciones aunque el pivote sea aleatorio; una particion de tres vias (menores, iguales, mayores) lo evitaria. Se reporta el conteo de valores distintos junto a la razon justamente para que la desviacion se pueda atribuir a su causa y no quede como un numero raro.",
    },
  ],
  takeaway:
    "La aleatorizacion no compra velocidad: compra que el costo esperado no dependa del orden de la entrada. Se paga un poco en el caso comun para que el caso catastrofico deje de ser una entrada concreta (los datos ya ordenados) y pase a ser mala suerte improbable. El peor caso sigue siendo cuadratico.",
};

export default doc;
