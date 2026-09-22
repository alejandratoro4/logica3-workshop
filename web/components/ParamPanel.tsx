"use client";

import { ALL_ZONES, PRESETS, estimateRows, estimateSeconds, type CityParams } from "@/lib/params";

/** Controles de ciudad. Cada uno se traduce a una variable RIDES_* que leen
 *  los scripts de Python: mover un deslizador equivale a exportar esa variable
 *  antes de correr el pipeline en la terminal. */
export default function ParamPanel({
  params,
  onChange,
  onRun,
  running,
  ready,
}: {
  params: CityParams;
  onChange: (p: CityParams) => void;
  onRun: () => void;
  running: boolean;
  ready: boolean;
}) {
  const set = <K extends keyof CityParams>(k: K, v: CityParams[K]) =>
    onChange({ ...params, [k]: v });

  const toggleZone = (z: string) => {
    const has = params.zones.includes(z);
    if (has && params.zones.length === 1) return; // al menos una zona
    set("zones", has ? params.zones.filter((x) => x !== z) : [...params.zones, z]);
  };

  const rows = estimateRows(params);
  const secs = estimateSeconds(params);
  const activePreset = PRESETS.find(
    (p) =>
      p.params.scale === params.scale &&
      p.params.days === params.days &&
      p.params.drivers === params.drivers &&
      p.params.zones.length === params.zones.length
  );

  return (
    <div className="card">
      <h3>Ciudad</h3>

      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`preset ${activePreset?.id === p.id ? "on" : ""}`}
            title={p.hint}
            onClick={() => onChange(p.params)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="field">
        <label>
          Escala <b>{params.scale}x</b>
        </label>
        <input
          type="range"
          min={1}
          max={30}
          step={1}
          value={params.scale}
          onChange={(e) => set("scale", Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>
          Dias simulados <b>{params.days}</b>
        </label>
        <input
          type="range"
          min={3}
          max={28}
          step={1}
          value={params.days}
          onChange={(e) => set("days", Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>
          Conductores <b>{params.drivers}</b>
        </label>
        <input
          type="range"
          min={60}
          max={2400}
          step={60}
          value={params.drivers}
          onChange={(e) => set("drivers", Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>
          Umbral de surge <b>mu + {params.kSigma}sigma</b>
        </label>
        <input
          type="range"
          min={1}
          max={4}
          step={0.5}
          value={params.kSigma}
          onChange={(e) => set("kSigma", Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>
          Semilla <b>{params.seed}</b>
        </label>
        <input
          type="number"
          value={params.seed}
          onChange={(e) => set("seed", Number(e.target.value) || 0)}
        />
      </div>

      <div className="field">
        <label>
          Zonas <b>{params.zones.length}</b>
        </label>
        <div className="zone-grid">
          {ALL_ZONES.map((z) => (
            <button
              key={z}
              className={`zone-chip ${params.zones.includes(z) ? "on" : ""}`}
              onClick={() => toggleZone(z)}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      <button className="btn" onClick={onRun} disabled={!ready || running} style={{ marginTop: 14 }}>
        {running ? "Corriendo..." : "Correr pipeline"}
      </button>

      <p className="estimate">
        ~<b>{rows.toLocaleString("es-CO")}</b> viajes · aprox. <b>{secs}s</b> en Pyodide.
        {params.scale < 10 && (
          <>
            {" "}
            A escala baja la ventana pico del Panel A tiene pocas solicitudes para 16 colas; subi la
            escala para que el desbalance se vea.
          </>
        )}
      </p>
    </div>
  );
}
