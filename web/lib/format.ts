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
