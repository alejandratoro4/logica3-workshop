"use client";

import { fmt, int } from "../../charts";
import { pct } from "../../charts-stream";
import { CurvaS } from "./graficos";
import type { PanelProps } from "@/lib/types";
import type { W5Task4 } from "@/lib/generated/contratos";

/** Task 4 del W5 — MinHash como map en el runner del W4, las bandas en el
 *  reduce, y la curva S de cada (b, r) contra la tasa empirica. */
export default function Task4({ data: t }: PanelProps<W5Task4>) {
  const configs = [...t.configs].sort((a, b) => a.threshold - b.threshold);
  const sinArriba = configs.filter((c) => c.pairs_above_threshold === 0);

  return (
    <section className="panel-box">
      <div className="panel-head">
        <h2 className="panel-title">MinHash y bandas: la curva S contra lo medido</h2>
        <span className="panel-tag">
          TASK 4 · n = {t.n_hashes} · {t.workers} WORKERS {t.parallel ? "" : "· SIN PARALELISMO"}
        </span>
      </div>
      {!t.parallel && (
        <p className="panel-desc" style={{ color: "var(--amber)" }}>
          Esta corrida no uso procesos en paralelo (el navegador no tiene): los jobs corrieron en secuencia.
          Los candidatos son los mismos; los segundos no miden paralelismo.
        </p>
      )}
      <p className="panel-desc">
        El map calcula la firma de cada conductor y emite una clave por banda; el reduce junta los conductores
        de cada bucket y emite sus pares.{" "}
        {t.signatures_match
          ? "Las firmas del map son exactamente las del dataset."
          : "Las firmas del map no coinciden con las del dataset: la task uso otra familia o semilla."}{" "}
        La curva de cada (b, r) es 1 − (1 − s^r)^b; los puntos, la fraccion de los pares de cada intervalo de
        Jaccard que salieron candidatos, entre los {int(t.total_pairs)} pares de conductores; la raya junto a cada
        punto, lo que predice la curva para esos mismos pares, que no estan repartidos parejo en el intervalo.
      </p>
      <p className="panel-desc">
        Que un punto se aleje de su raya no es un error. Todos los pares comparten las mismas {t.n_hashes}{" "}
        funciones, asi que los de un mismo grupo salen candidatos juntos o no: si en una banda el minimo cae en un
        shingle que todo el grupo tiene, coinciden todos a la vez. Con una sola tanda de funciones, la tasa de un
        intervalo se mueve mucho mas que con pares independientes; promediada sobre muchas semillas, coincide con
        la curva.
      </p>
      <CurvaS t={t} />
      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>(b, r)</th>
              <th>Umbral</th>
              <th>Candidatos</th>
              <th>Pares ≥ umbral</th>
              <th>Falsos +</th>
              <th>% de candidatos</th>
              <th>Falsos −</th>
              <th>% de pares ≥ umbral</th>
              <th>Shuffle</th>
              <th>Buckets</th>
              <th>Mayor bucket</th>
              <th>Segundos</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={`${c.bands}x${c.rows}`}>
                <td>
                  ({c.bands}, {c.rows})
                </td>
                <td>{fmt(c.threshold, 3)}</td>
                <td>{int(c.candidate_pairs)}</td>
                <td>{int(c.pairs_above_threshold)}</td>
                <td>{int(c.false_positives)}</td>
                <td>{c.candidate_pairs ? pct(c.false_positives / c.candidate_pairs, 1) : "—"}</td>
                <td>{int(c.false_negatives)}</td>
                <td>{c.pairs_above_threshold ? pct(c.false_negatives / c.pairs_above_threshold, 1) : "—"}</td>
                <td>{int(c.shuffle_pairs)}</td>
                <td>{int(c.buckets)}</td>
                <td>{int(c.largest_bucket)}</td>
                <td>{fmt(c.seconds, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        Falso positivo: candidatos con Jaccard bajo el umbral; falso negativo: un par sobre el umbral que no
        salio candidato. Bajar el umbral (mas bandas, menos filas) encuentra mas pares parecidos a cambio de
        examinar mas que no lo son. La curva no es un escalon: los pares un poco por debajo del umbral
        tambien salen candidatos a veces, y los que estan un poco por encima a veces no.{" "}
        {sinArriba.length > 0 &&
          `Ningun par llega al umbral de ${sinArriba.map((c) => `(${c.bands}, ${c.rows}) = ${fmt(c.threshold, 2)}`).join(", ")}: con esos conductores, ese umbral es mas exigente que lo que se parecen los mas parecidos.`}
      </p>
    </section>
  );
}
