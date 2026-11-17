"use client";

import { fmt, int, Legend } from "../../charts";
import { Histograma } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W5Task1 } from "@/lib/generated/contratos";

const NOMBRE: Record<string, string> = {
  jaccard: "Jaccard (shingles k = 3)",
  cosine: "Coseno (vector de ocupacion)",
  l1: "L1 (vector de ocupacion)",
  l2: "L2 (vector de ocupacion)",
};

/** Task 1 del W5 — Jaccard, coseno, L1 y L2 sobre pares al azar, separados
 *  por si los dos conductores son del mismo grupo plantado; la correlacion
 *  con la similitud LCS y la concentracion de distancias. */
export default function Task1({ data: t }: PanelProps<W5Task1>) {
  const c = t.correlation;
  const k = t.concentration;
  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">Cuatro medidas sobre los mismos pares de conductores</h2>
        <span className="panel-tag">
          TASK 1 · {int(t.drivers)} CONDUCTORES · {int(t.pairs)} PARES
        </span>
      </div>
      <p className="panel-desc">
        Cada conductor es un conjunto de shingles de {t.shingle_k} zonas consecutivas (en promedio{" "}
        {fmt(t.mean_shingle_count, 1)}) y un vector de {t.vector_dims} numeros: la fraccion de sus viajes en
        cada zona y dos metricas z-normalizadas. De los {int(t.pairs)} pares al azar, {int(t.same_cluster_pairs)}{" "}
        son de conductores del mismo grupo plantado: en azul, apilados sobre los demas.
      </p>
      <Legend
        items={[
          { name: "mismo grupo", color: "var(--blue)" },
          { name: "grupos distintos", color: "var(--text-faint)" },
        ]}
      />
      {t.measures.map((m) => (
        <div key={m.measure}>
          <h3 className="panel-sub">
            {NOMBRE[m.measure] ?? m.measure} · {m.kind}: media {fmt(m.mean_same_cluster, 3)} en el mismo grupo,{" "}
            {fmt(m.mean_other_cluster, 3)} entre grupos
          </h3>
          <Histograma m={m} height={120} />
        </div>
      ))}

      <h3 className="panel-sub">Correlacion entre similitudes, en {int(c.pairs)} pares</h3>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Par de medidas</th>
              <th>Pearson</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Jaccard y coseno</td>
              <td>{fmt(c.jaccard_cosine, 3)}</td>
            </tr>
            <tr>
              <td>Jaccard y LCS</td>
              <td>{fmt(c.jaccard_lcs, 3)}</td>
            </tr>
            <tr>
              <td>Coseno y LCS</td>
              <td>{fmt(c.cosine_lcs, 3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 10 }}>
        La LCS de esos {int(c.pairs)} pares tomo {fmt(c.lcs_seconds, 2)} s: programacion dinamica, O(m n) por par.
        Hacerla sobre todos los pares de conductores es lo que el enunciado dice que no escala.
      </p>

      <h3 className="panel-sub">Concentracion de distancias</h3>
      <p className="panel-desc" style={{ marginBottom: 0 }}>
        Desde {k.query}, el conductor mas cercano esta a L2 = {fmt(k.min_l2, 3)} y el mas lejano a{" "}
        {fmt(k.max_l2, 3)}: (max − min) / min = {fmt(k.ratio, 2)}.{" "}
        {k.max_l2 === 0
          ? "Todos los demas tienen su mismo vector, asi que no hay contraste que medir."
          : k.ratio === 0
            ? "Todos los demas quedan exactamente a la misma distancia: el vecino mas cercano no se distingue del mas lejano."
            : k.ratio < 1
            ? "Las distancias se concentran: casi todos quedan a la misma distancia, y el vecino mas cercano casi no se distingue del mas lejano."
            : `Con ${t.vector_dims} dimensiones las distancias no se concentran: el mas lejano esta ${fmt(
                k.max_l2 / k.min_l2,
                1
              )} veces mas lejos que el mas cercano. La concentracion aparece con muchas dimensiones y datos sin estructura, cuando (max − min) / min se acerca a 0.`}
      </p>
    </section>
  );
}
