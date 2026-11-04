/** Formateo de numeros compartido por graficos, paneles y paginas de task.
 *
 * Vive en lib/ y no en components/charts porque lib/tasks.ts tambien lo usa
 * para armar los textos de cada task, y lib no debe depender de components.
 * charts.tsx lo reexporta, asi que los imports existentes siguen igual. */

/** Formatea un numero, tolerando ausencias.
 *
 * Es deliberadamente defensivo: los datos vienen de JSON que produce Python, y
 * renombrar una clave alla no debe tumbar el arbol de React entero — mejor un
 * guion visible en una celda que una pantalla en blanco. */
export const fmt = (v: number | undefined | null, d = 2) => {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString("es-CO");
  const s = v.toFixed(d);
  // Se quitan los ceros sobrantes SOLO despues del punto decimal. Recortarlos
  // sin mirar el punto convertia "10" en "1" y "0" en cadena vacia, que era
  // justo lo que salia en los ticks de los ejes.
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

/** Entero con separador de miles, para conteos grandes (viajes, ventanas). */
export const int = (v: number | undefined | null) =>
  v === undefined || v === null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("es-CO");

/** Tamano en bytes con su unidad (17733 -> "17.3 KB"), para el shuffle del W4.
 *  Punto decimal, como `fmt`, para que no se mezcle con los segundos de al lado. */
export const bytes = (v: number | undefined | null) => {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const unidades = ["B", "KB", "MB", "GB"];
  let x = v;
  let i = 0;
  while (Math.abs(x) >= 1024 && i < unidades.length - 1) {
    x /= 1024;
    i++;
  }
  // toFixed y no fmt: fmt pone separador de miles desde 1000, y 1010 KB
  // saldria "1.010 KB", que se lee como un decimal.
  return `${i ? x.toFixed(1).replace(/\.0$/, "") : Math.round(x)} ${unidades[i]}`;
};

/** Notacion cientifica corta para diferencias diminutas (2.17e-9). */
export const sci = (v: number | undefined | null, d = 1) =>
  v === undefined || v === null || !Number.isFinite(v) ? "—" : v === 0 ? "0" : v.toExponential(d);

/** Porcentaje legible de una proporcion (0.0321 -> "3.21%"), con notacion
 *  cientifica para lo diminuto (tasas de falso positivo de 1e-6). */
export const pct = (v: number | undefined | null, d = 2) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0%";
  const p = v * 100;
  if (Math.abs(p) < 0.001) return `${p.toExponential(1)}%`;
  return `${fmt(p, Math.abs(p) < 0.1 ? 4 : d)}%`;
};
