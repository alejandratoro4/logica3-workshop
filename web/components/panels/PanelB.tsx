"use client";

import { LineChart, Legend, fmt, int } from "../charts";
import type { PanelB as PanelBData } from "@/lib/types";

/** Panel B — tiempo del algoritmo aleatorizado vs. el determinista segun el
 *  tamano de entrada, en los dos escenarios, y el conteo de comparaciones
 *  contra las 2n ln n que predice el teorema.
 *
 *  El tiempo depende de la maquina; las comparaciones no. Por eso la tercera
 *  grafica es la que se puede contrastar de verdad contra la teoria. */
export default function PanelB({ data }: { data: PanelBData }) {
  const r = data.random_input;
  const s = data.sorted_input_worst_case;
  const dist = data.fare_distribution ?? null;

  const lastIdx = s.n.length - 1;
  const ratio =
    lastIdx >= 0 && s.randomized_time[lastIdx] > 0
      ? s.deterministic_time[lastIdx] / s.randomized_time[lastIdx]
      : 0;

  // Se grafica la RAZON y no los conteos crudos: van de diez mil a veintiocho
  // millones, y en un eje lineal los n pequenos quedarian pegados al cero.
  const medidas = r.randomized_comparisons ?? [];
  const teoria = r.expected_comparisons ?? [];
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
          nada mas rapido en promedio: elimina el peor caso, porque la aleatoriedad viene del
          algoritmo y no de los datos.
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
    </section>
  );
}
