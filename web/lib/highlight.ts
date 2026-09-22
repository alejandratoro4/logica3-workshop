/** Resaltador de Python minimo.
 *
 * Se escribe a mano en vez de traer una libreria: son ~7 clases de token y el
 * bundle se mantiene sin dependencias, igual que el resto del proyecto.
 * Devuelve tramos {text, cls} para renderizarlos como nodos de React, sin
 * dangerouslySetInnerHTML. */

export type Tok = { text: string; cls: string | null };

const KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
  "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield", "True", "False", "None", "self",
]);

/** Delimitador de string triple que abre o cierra un bloque, o null. */
function tripleAt(line: string, i: number): string | null {
  const three = line.slice(i, i + 3);
  return three === '"""' || three === "'''" ? three : null;
}

/**
 * Tokeniza el archivo entero (necesita estado entre lineas por los docstrings
 * triples) y devuelve una lista de tramos por linea.
 */
export function highlightPython(source: string): Tok[][] {
  const out: Tok[][] = [];
  let inTriple: string | null = null;

  for (const line of source.split("\n")) {
    const toks: Tok[] = [];
    let i = 0;
    let plain = "";

    const flush = () => {
      if (plain) {
        toks.push({ text: plain, cls: null });
        plain = "";
      }
    };

    // Continuacion de un docstring abierto en una linea anterior.
    if (inTriple) {
      const end = line.indexOf(inTriple);
      if (end === -1) {
        out.push([{ text: line, cls: "tok-str" }]);
        continue;
      }
      toks.push({ text: line.slice(0, end + 3), cls: "tok-str" });
      i = end + 3;
      inTriple = null;
    }

    while (i < line.length) {
      const ch = line[i];

      // comentario hasta fin de linea
      if (ch === "#") {
        flush();
        toks.push({ text: line.slice(i), cls: "tok-com" });
        i = line.length;
        break;
      }

      // string triple
      const triple = tripleAt(line, i);
      if (triple) {
        flush();
        const end = line.indexOf(triple, i + 3);
        if (end === -1) {
          toks.push({ text: line.slice(i), cls: "tok-str" });
          inTriple = triple;
          i = line.length;
          break;
        }
        toks.push({ text: line.slice(i, end + 3), cls: "tok-str" });
        i = end + 3;
        continue;
      }

      // string simple, respetando escapes
      if (ch === '"' || ch === "'") {
        flush();
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
        toks.push({ text: line.slice(i, Math.min(j + 1, line.length)), cls: "tok-str" });
        i = j + 1;
        continue;
      }

      // decorador
      if (ch === "@" && (i === 0 || /\s/.test(line[i - 1]))) {
        flush();
        let j = i + 1;
        while (j < line.length && /[\w.]/.test(line[j])) j++;
        toks.push({ text: line.slice(i, j), cls: "tok-dec" });
        i = j;
        continue;
      }

      // numero
      if (/[0-9]/.test(ch) && !/[\w]/.test(line[i - 1] ?? "")) {
        flush();
        let j = i;
        while (j < line.length && /[0-9_.xXeEa-fA-F]/.test(line[j])) j++;
        toks.push({ text: line.slice(i, j), cls: "tok-num" });
        i = j;
        continue;
      }

      // identificador o palabra clave
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < line.length && /[\w]/.test(line[j])) j++;
        const word = line.slice(i, j);
        const prev = line.slice(0, i).trimEnd();
        flush();
        if (KEYWORDS.has(word)) {
          toks.push({ text: word, cls: "tok-kw" });
        } else if (prev.endsWith("def") || prev.endsWith("class")) {
          toks.push({ text: word, cls: "tok-def" });
        } else {
          toks.push({ text: word, cls: null });
        }
        i = j;
        continue;
      }

      plain += ch;
      i++;
    }

    flush();
    out.push(toks);
  }

  return out;
}
