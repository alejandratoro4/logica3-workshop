import type { TaskDoc } from "@/lib/tasks";
import type { W1Task1 } from "@/lib/generated/contratos";
import { fmt, int } from "@/lib/format";

const doc: TaskDoc<W1Task1> = {
  title: "La hora pico es un problema de red y de disco",
  topic: "CONTEXTO DE BIG DATA",
  statement:
    "Estimar las solicitudes por segundo a nivel ciudad en la hora pico, y dimensionar el almacenamiento si la ciudad crece 10x.",
  standfirst:
    "Se agrupa el dataset por hora, se toma la de mayor demanda a nivel ciudad y se convierte en solicitudes por segundo. Despues se mide el tamaño promedio del registro y se proyecta el almacenamiento anual si la demanda crece diez veces. El pico no es un dato curioso: es el que fija el dimensionamiento.",
  lede: (r) =>
    `Agrupando el dataset por hora, la de mayor demanda a nivel ciudad recibe ${fmt(r.peak_req_per_sec, 2)} solicitudes por segundo. Si la demanda crece 10x, la cifra sube a ${fmt(r.peak_req_per_sec_10x, 2)} y el almacenamiento anual pasaria de ${fmt(r.storage_year_gb, 1)} GB a ${fmt(r.storage_year_10x_gb, 1)} GB. Ese contraste — de ${fmt(r.storage_year_gb, 1)} a ${fmt(r.storage_year_10x_gb, 1)} GB — es la diferencia entre operar y dimensionar para crecer.`,
  metrics: (r) => [
    { label: "Solicitudes por segundo (pico)", value: fmt(r.peak_req_per_sec, 2), hint: "a nivel ciudad, en la hora de mayor demanda" },
    { label: "Solicitudes por segundo (10x)", value: fmt(r.peak_req_per_sec_10x, 2), hint: "si la demanda crece diez veces" },
    { label: "Almacenamiento anual", value: `${fmt(r.storage_year_gb, 1)} GB`, hint: "con la demanda actual" },
    { label: "Almacenamiento anual (10x)", value: `${fmt(r.storage_year_10x_gb, 1)} GB`, hint: "con crecimiento 10x" },
    { label: "Solicitudes totales", value: int(r.total_requests), hint: `${int(r.n_days)} dias simulados` },
  ],
  sections: [
    {
      h: "Que es esta task y por que es la primera",
      p: "Antes de escribir hashing, colas de despacho o surge pricing, hay que saber a que escala opera el sistema. Esta task no resuelve nada inteligente: solo pone dos numeros sobre la mesa — solicitudes por segundo en el pico y almacenamiento proyectado a crecimiento. Esos dos numeros son los que justifican que las demas tasks existan: si el pico fueran 2 solicitudes por segundo no haria falta hashing ni power-of-two-choices; con cientos, cada milisegundo cuenta.",
    },
    {
      h: "Paso 1: agrupar por hora y encontrar el pico",
      p: "El dataset no llega ordenado por demanda: las solicitudes se reparten por zona y por hora segun un proceso de Poisson no homogeneo, con un perfil de intensidad distinto por zona. Para encontrar el momento critico se truncan todos los timestamps a la hora y se agrupan: cada grupo es una hora de la simulacion a nivel ciudad. La hora con mas solicitudes es la pico. Esa hora es la que fija cuantos despachadores, colas y servidores hacen falta.",
    },
    {
      h: "Paso 2: de la hora pico a solicitudes por segundo",
      p: "Una vez identificada la hora pico, se divide su conteo entre 3600 segundos. El resultado son las solicitudes por segundo a nivel ciudad en el peor momento del dia. Ese numero es el que dimensiona la red: cuantas peticiones por segundo tiene que aguantar el sistema de despacho sin degradarse. Si se dimensiona para el promedio, en el pico las colas crecen mas rapido de lo que se vacian.",
    },
    {
      h: "Paso 3: medir el registro y proyectar el almacenamiento",
      p: "Para saber cuanto disco se necesita, se mide el tamaño promedio de un registro sobre una muestra del CSV — como proxy del tamaño que ocuparia en una base real. Ese promedio se multiplica por el volumen diario de solicitudes para obtener los bytes por dia. Luego se proyecta a un año de retencion operativa (365 dias) y se convierte a gigabytes. El resultado es el almacenamiento minimo que habria que tener hoy.",
    },
    {
      h: "Paso 4: que pasa si la ciudad crece 10x",
      p: "El enunciado pide dimensionar para crecimiento. Se toma el volumen diario y se multiplica por 10 — simular que la demanda se multiplica por diez — y se vuelve a proyectar a un año. La diferencia entre el numero actual y el de 10x es la que de verdad importa para planear: comprar disco para hoy es facil; comprarlo para el doble, el triple o diez veces mas es lo que exige arquitectura. Ambos numeros (actual y 10x) se muestran juntos en el panel para que el contraste se vea de un vistazo.",
    },
    {
      h: "Por que se mide en el pico y no en el promedio",
      p: "Dimensionar para el promedio es planear el colapso. La tarifa dinamica (surge pricing) no se activa por el promedio: se activa cuando una zona supera un umbral de desviaciones sobre su media. La hora pico a nivel ciudad es el escenario donde mas zonas superan ese umbral a la vez y donde el sistema recibe la mayor presion de red y de almacenamiento. Si el sistema aguanta el pico, aguanta todo lo demas.",
    },
    {
      h: "Limitaciones del estimado",
      p: "El calculo de almacenamiento es una cota inferior: usa el tamaño del registro tal como viaja en el CSV y no incluye indices, replicas, backups ni logs, que en produccion multiplican la cifra varias veces. Tampoco modela compresion ni archivado de datos viejos. Sirve para ordenar de magnitud y comparar escenarios, no como presupuesto final de infraestructura.",
    },
    {
      h: "Como leerlo en el dashboard",
      p: "Todo sale de la corrida actual del generador: mover los parametros de ciudad (escala, zonas, dias) regenera el dataset y cambia los numeros, y la exposicion los sigue sin contradecir al panel. Las solicitudes por segundo fijan la red; el almacenamiento con crecimiento fija el disco. Son dos decisiones de arquitectura distintas que esta task reduce a dos numeros comparables.",
    },
  ],
  takeaway:
    "El pico define el sistema:las solicitudes por segundo fijan la red,y el almacenamiento con crecimiento fija el disco. Dimensionar para el promedio es planear el colapso.",
};

export default doc;
