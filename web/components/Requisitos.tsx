/** Minimos del enunciado que una task puede no cumplir aunque su JSON cumpla
 *  el contrato (p. ej. "10 o mas funciones hash", "8 o mas zonas"). No se
 *  rechazan en el validador: una corrida a escala chica sirve para explorar.
 *  Se avisan en el panel, para que nadie presente como resultado una corrida
 *  que no cumple el enunciado. */

export type Requisito = { ok: boolean; texto: string };

export default function Requisitos({ items }: { items: Requisito[] }) {
  const fallan = items.filter((r) => !r.ok);
  if (!fallan.length) return null;
  return (
    <p className="panel-desc" style={{ color: "var(--amber)" }}>
      Esta corrida no cumple lo que pide el enunciado: {fallan.map((r) => r.texto).join("; ")}.
    </p>
  );
}
