import type { TaskDoc } from "@/lib/tasks";
import type { W2Task5 } from "@/lib/generated/contratos";
import { fmt, int, pct } from "@/lib/format";

/** Lo que se lee de F2: F2 parejo, concentracion y zonas sobre su cuota.
 *  Sale solo de las claves del contrato (F0, F1, F2, counts). */
const leer = (r: W2Task5) => {
  const zonas = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
  const parejo = r.F0 ? (r.F1 * r.F1) / r.F0 : 0;
  const concentracion = parejo ? r.F2 / parejo : NaN;
  const candidatas = zonas.filter(([, f]) => r.F2 && r.F0 && (f * f) / r.F2 > 1 / r.F0).map(([z]) => z);
  return { zonas, parejo, concentracion, candidatas };
};

const expo = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : "—");

const doc: TaskDoc<W2Task5> = {
  title: "F2 mide si la demanda se reparte o se amontona",
  topic: "MOMENTOS DE FRECUENCIA",
  statement:
    "Calcular F0, F1 y F2 exactos sobre pickup_zone en el stream. Un F2 alto significa que pocas zonas concentran la demanda: son las candidatas a surge.",
  standfirst:
    "Se recorre el stream una vez llevando un contador por zona. De esos conteos salen los momentos de frecuencia: F0 cuenta las zonas, F1 las solicitudes y F2 suma los cuadrados de los conteos. Comparar F2 con el valor que tendria si la demanda fuera pareja dice que tan concentrada esta.",
  lede: (r) => {
    const m = leer(r);
    const top = m.zonas[0];
    return `El stream trae ${int(r.F1)} solicitudes repartidas en ${int(r.F0)} zonas. F2 vale ${expo(r.F2)}, contra ${expo(m.parejo)} si la demanda fuera pareja: una concentracion de ${fmt(m.concentracion, 3)}, en una escala que va de 1 a ${int(r.F0)}. ${top ? `La zona mas cargada es ${top[0]}, con ${pct(top[1] / r.F1, 1)} de las solicitudes. ` : ""}Las candidatas a surge son ${m.candidatas.join(", ") || "ninguna"}.`;
  },
  metrics: (r) => {
    const m = leer(r);
    const top = m.zonas[0];
    const bottom = m.zonas[m.zonas.length - 1];
    return [
      { label: "F0 · zonas distintas", value: int(r.F0), hint: "cuantas f_i son mayores que cero" },
      { label: "F1 · largo del stream", value: int(r.F1), hint: "suma de los f_i" },
      { label: "F2", value: expo(r.F2), hint: `parejo seria ${expo(m.parejo)}` },
      { label: "Concentracion F2 / (F1²/F0)", value: fmt(m.concentracion, 3), hint: `1 = parejo · ${int(r.F0)} = una sola zona` },
      ...(top && bottom
        ? [{ label: "Zona mas y menos cargada", value: `${top[0]} / ${bottom[0]}`, hint: `${pct(top[1] / r.F1, 1)} contra ${pct(bottom[1] / r.F1, 1)} de las solicitudes` }]
        : []),
      { label: "Candidatas a surge", value: int(m.candidatas.length), hint: m.candidatas.join(", ") || "ninguna" },
    ];
  },
  sections: [
    {
      h: "Que pregunta responde esta task",
      p: "El surge tiene sentido donde la demanda se amontona. Antes de mirar hora por hora, conviene saber si en el stream completo unas pocas zonas se llevan la mayor parte de las solicitudes o si todas pesan mas o menos lo mismo. Los momentos de frecuencia responden eso con tres numeros.",
    },
    {
      h: "Paso 1: un contador por zona",
      p: "Se lee el stream una sola vez, en orden de stream_seq, y por cada solicitud se suma uno al contador de su pickup_zone. Al final, f_i es cuantas veces aparecio la zona i. Como hay pocas zonas, los contadores caben en memoria y los momentos salen exactos: no hace falta un estimador aproximado como AMS, que es el que se usaria si las claves fueran millones.",
    },
    {
      h: "Paso 2: F0, F1 y F2",
      p: "El momento k es la suma de f_i elevado a k. F0 cuenta las zonas que aparecieron al menos una vez. F1 es la suma de los conteos, o sea el largo del stream. F2 es la suma de los cuadrados. Elevar al cuadrado premia a las zonas grandes: una zona con el doble de solicitudes aporta cuatro veces mas a F2.",
    },
    {
      h: "Paso 3: contra que comparar F2",
      p: "F2 solo no dice mucho, porque crece con el largo del stream. Con F0 y F1 fijos, F2 es minimo cuando todas las zonas tienen la misma demanda, y entonces vale F1²/F0; es maximo cuando una sola zona se lleva todo, y vale F1². La razon F2 / (F1²/F0) queda entre 1 y F0, y sirve para comparar streams de distinto tamanio.",
    },
    {
      h: "Paso 4: quienes son las candidatas",
      p: "Cada zona aporta f_i²/F2 al total. Si la demanda fuera pareja, cada una aportaria 1/F0. Las zonas que aportan mas que esa cuota son las que estan por encima de la demanda media, y son las que hacen subir F2: esas son las candidatas a surge.",
    },
    {
      h: "Lo que F2 no dice",
      p: "F2 se calcula sobre el stream completo, asi que mezcla todas las horas y todos los dias. Una zona puede tener poca demanda en total y aun asi un pico fuerte a cierta hora. Por eso F2 sirve para priorizar donde mirar, y el medidor de surge por zona y hora, el de la Task 6, es el que decide cuando activarlo.",
    },
  ],
  takeaway:
    "F1 cuenta cuanta demanda hay; F2 dice como esta repartida. Compararlo con F1²/F0 convierte un numero enorme en una escala de 1 a F0, y las zonas que lo empujan hacia arriba son las candidatas a surge.",
};
export default doc;
