"use client";

import { LineChart, Legend, fmt, int } from "../../charts";
import type { PanelProps } from "@/lib/types";
import type { W1Task2 } from "@/lib/generated/contratos";
import { quicksortSeries } from "@/lib/quicksort";

/** La otra mitad de la Task 2: reservoir sampling contra el calculo exacto.
 *  No es parte del Panel B que pide el enunciado (aleatorizado contra
 *  determinista), por eso va aparte y solo si la task reporta el muestreo.
 *
 *  El error se grafica contra n con la linea que predice la teoria: depende
 *  de k, no de n. La tabla pone tiempo y memoria a escala completa, que es
 *  donde se ve que muestrear pierde para la media y gana para los cuantiles. */
function Muestreo({ data }: { data: W1Task2 }) {
  const porN = <T extends { n: number }>(filas: T[]) => [...filas].sort((a, b) => a.n - b.n);
  const res = porN((data.sampling ?? []).filter((s) => s.method.startsWith("reservoir")));
  const exactas = data.sampling?.filter((s) => s.method === "exact_mean") ?? [];
  if (!res.length) return null;

  const k = res[0].method.split("_k")[1] ?? "?";
  const teoria = res.every((s) => s.expected_rel_error_pct !== undefined)
    ? res.map((s) => s.expected_rel_error_pct as number)
    : null;

  // La fila de escala completa: el n mas grande que tengan los cuatro metodos.
  const nMax = res[res.length - 1].n;
  const exMedia = exactas.find((s) => s.n === nMax);
  const resMedia = res[res.length - 1];
  const qs = data.quantiles?.filter((q) => q.n === nMax) ?? [];
  const exQ = qs.find((q) => q.method === "exact_quantiles");
  const resQ = qs.find((q) => q.method.startsWith("reservoir"));
  const lentitud = exMedia && exMedia.time_s > 0 ? resMedia.time_s / exMedia.time_s : null;
  const errQ = (q: typeof resQ, c: string) => (q ? q.errors_pct[c] : undefined);
  const p50 = errQ(resQ, "0.5");
  const p95 = errQ(resQ, "0.95");

  return (
    <>
      <div className="panel-head" style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <h2 className="panel-title" style={{ fontSize: 14 }}>
          Reservoir sampling contra el calculo exacto
        </h2>
        <span className="panel-tag">ALGORITMO R · k = {k}</span>
      </div>
      <p className="panel-desc">
        Una sola pasada por las tarifas, guardando {k} al azar: el viaje i entra con probabilidad k/i
        y, si entra, reemplaza a uno de los guardados. Al final cada viaje tuvo la misma
        probabilidad de quedar. Se compara el promedio de la muestra contra el promedio exacto.
      </p>

      <LineChart
        xs={res.map((s) => s.n)}
        logX
        yUnit="% error"
        series={[
          { name: "error medido", color: "var(--amber)", values: res.map((s) => s.rel_error_pct) },
          ...(teoria ? [{ name: "teoria", color: "var(--text-faint)", values: teoria }] : []),
        ]}
      />
      <Legend
        items={[
          { name: "Error relativo medido (promedio de las repeticiones)", color: "var(--amber)" },
          ...(teoria ? [{ name: "Teoria: raiz(2/pi) · sigma / raiz(k), con correccion por poblacion finita", color: "var(--text-faint)" }] : []),
        ]}
      />
      <p className="panel-desc" style={{ marginTop: 10 }}>
        El error no baja al crecer n: depende de cuantos se guardan (k), no de cuantos pasan. Con
        n = k la muestra es todo el arreglo y la teoria da cero; con n chico la correccion por
        poblacion finita lo reduce.
      </p>

      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>n = {int(nMax)}</th>
              <th>Tiempo</th>
              <th>Memoria</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {exMedia && (
              <tr>
                <td>Media exacta (sumar y dividir)</td>
                <td>{fmt(exMedia.time_s, 3)} s</td>
                <td>1 acumulador</td>
                <td>0</td>
              </tr>
            )}
            <tr>
              <td>Media con reservorio de {k}</td>
              <td>{fmt(resMedia.time_s, 3)} s</td>
              <td>{k} valores</td>
              <td>{fmt(resMedia.rel_error_pct, 2)} %</td>
            </tr>
            {exQ && (
              <tr>
                <td>Mediana y p95 exactos (ordenar todo)</td>
                <td>{fmt(exQ.time_s, 3)} s</td>
                <td>{int(exQ.memory_items)} valores</td>
                <td>0</td>
              </tr>
            )}
            {resQ && (
              <tr>
                <td>Mediana y p95 con reservorio</td>
                <td>{fmt(resQ.time_s, 3)} s</td>
                <td>{int(resQ.memory_items)} valores</td>
                <td>
                  {fmt(errQ(resQ, "0.5"), 2)} % y {fmt(errQ(resQ, "0.95"), 2)} %
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
        Para la media, muestrear no sirve
        {lentitud ? (
          <>
            {" "}
            y es <b style={{ color: "var(--amber)" }}>{fmt(lentitud, 0)}x</b> mas lento
          </>
        ) : null}
        : la media exacta tambien es una pasada con memoria constante, y el reservorio paga un
        numero aleatorio por elemento. Los cuantiles exactos, en cambio, necesitan guardar y ordenar
        los n valores; el reservorio los estima con memoria fija.
        {resQ && exQ && resQ.memory_items >= exQ.memory_items
          ? " En esta ciudad hay menos viajes que el tamano del reservorio: guarda el arreglo entero y no ahorra memoria."
          : ` Ahi gana en memoria${resQ && exQ ? (resQ.time_s > exQ.time_s ? ", no en tiempo." : " y tambien en tiempo.") : "."}`}
        {p50 !== undefined && p95 !== undefined && p95 > p50
          ? " El p95 sale peor que la mediana: en la cola alta las tarifas estan mas dispersas, asi que el mismo error de posicion dentro de la muestra se traduce en mas pesos de error."
          : ""}
      </p>
    </>
  );
}

/** Panel B — tiempo del algoritmo aleatorizado vs. el determinista segun el
 *  tamano de entrada, en los dos escenarios, y el conteo de comparaciones
 *  contra las 2n ln n que predice el teorema.
 *
 *  El tiempo depende de la maquina; las comparaciones no. Por eso la tercera
 *  grafica es la que se puede contrastar de verdad contra la teoria. */
export default function Task2({ data }: PanelProps<W1Task2>) {
  const r = quicksortSeries(data, "random_input");
  const s = quicksortSeries(data, "sorted_input");
  const dist = data.fare_distribution ?? null;

  const lastIdx = s.n.length - 1;
  const ratio =
    lastIdx >= 0 && s.randomized_time[lastIdx] > 0
      ? s.deterministic_time[lastIdx] / s.randomized_time[lastIdx]
      : 0;

  // Se grafica la RAZON y no los conteos crudos: van de diez mil a veintiocho
  // millones, y en un eje lineal los n pequenos quedarian pegados al cero.
  const medidas = r.randomized_comparisons;
  const teoria = r.expected_comparisons;
  const hayComparaciones =
    medidas.length > 0 && medidas.length === teoria.length && teoria.every((t) => t > 0);
  const razones = hayComparaciones ? medidas.map((m, i) => m / teoria[i]) : [];

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Panel B — Tiempo de ejecucion</h2>
        <span className="panel-tag">TASK 2 · QUICKSORT</span>
      </div>
      <p className="panel-desc">
        QuickSort con pivote aleatorio contra pivote fijo, ordenando tarifas. Arriba la entrada en
        su orden natural: empatan, porque ambos son O(n log n) en promedio. Abajo la entrada ya
        ordenada, que es el peor caso del pivote fijo.
      </p>

      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>
        Caso promedio · entrada desordenada
      </div>
      <LineChart
        xs={r.n}
        logX
        series={[
          { name: "Aleatorizado", color: "var(--green)", values: r.randomized_time },
          { name: "Determinista", color: "var(--blue)", values: r.deterministic_time },
        ]}
      />

      <div style={{ fontSize: 12, color: "var(--text-dim)", margin: "18px 0 4px" }}>
        Peor caso · entrada ya ordenada
      </div>
      <LineChart
        xs={s.n}
        logX
        series={[
          { name: "Aleatorizado", color: "var(--green)", values: s.randomized_time },
          { name: "Determinista", color: "var(--red)", values: s.deterministic_time },
        ]}
      />

      <Legend
        items={[
          { name: "Aleatorizado", color: "var(--green)" },
          { name: "Determinista (caso promedio)", color: "var(--blue)" },
          { name: "Determinista (peor caso, O(n^2))", color: "var(--red)" },
        ]}
      />

      {ratio > 1 && (
        <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
          Con n = {fmt(s.n[lastIdx], 0)} ya ordenado, el pivote fijo tarda{" "}
          <b style={{ color: "var(--amber)" }}>{fmt(ratio, 0)}x</b> mas. La aleatorizacion no hace
          nada mas rapido en promedio: hace que el costo esperado no dependa del orden de la entrada,
          porque la aleatoriedad viene del algoritmo y no de los datos. El peor caso O(n²) sigue
          existiendo; solo deja de ser una entrada concreta.
        </p>
      )}

      {hayComparaciones && (
        <>
          <div
            className="panel-head"
            style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 16 }}
          >
            <h2 className="panel-title" style={{ fontSize: 14 }}>
              Comparaciones medidas contra el teorema
            </h2>
            <span className="panel-tag">E[X] = 2n ln n</span>
          </div>
          <p className="panel-desc">
            El tiempo depende de la maquina; el numero de comparaciones no, asi que es lo que se
            puede contrastar contra la teoria. Se grafica la razon entre lo medido y las 2n ln n
            del teorema: la linea gris en 1,0 seria el acuerdo perfecto.
          </p>

          <LineChart
            xs={r.n}
            logX
            yUnit="razon"
            series={[
              { name: "medidas / 2n ln n", color: "var(--amber)", values: razones },
              { name: "teorema", color: "var(--text-faint)", values: razones.map(() => 1) },
            ]}
          />

          <div className="scroll-x" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>n</th>
                  <th>Comparaciones medidas</th>
                  <th>2n ln n</th>
                  <th>Razon</th>
                </tr>
              </thead>
              <tbody>
                {r.n.map((n, i) => (
                  <tr key={n}>
                    <td>{int(n)}</td>
                    <td>{int(medidas[i])}</td>
                    <td>{int(teoria[i])}</td>
                    <td
                      style={{
                        color: razones[i] > 1.5 ? "var(--amber)" : "var(--text-dim)",
                      }}
                    >
                      {fmt(razones[i], 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
            La razon se despega al crecer n, y no es un error de implementacion: la demostracion
            del teorema supone que los elementos son <b>distintos</b>.
            {dist && (
              <>
                {" "}
                Estas tarifas no lo son — <b>{int(dist.n_total)}</b> valores con solo{" "}
                <b>{int(dist.n_distinct)}</b> distintos, {fmt(dist.avg_repeats, 1)} repeticiones
                por valor y hasta {int(dist.max_repeats)} para el mas frecuente.
              </>
            )}{" "}
            La particion de Lomuto compara con <code>&lt;=</code>, asi que todos los valores
            iguales al pivote caen del mismo lado: la particion se desbalancea y hacen falta mas
            comparaciones de las que predice el teorema.
          </p>
        </>
      )}

      <Muestreo data={data} />
    </section>
  );
}
