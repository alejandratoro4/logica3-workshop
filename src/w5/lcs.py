"""
lcs.py (Workshop 5)
-------------------
La similitud LCS de la Unidad 5, para las tasks del Workshop 5.

El enunciado del W5 compara los metodos de la Unidad 6 contra "Unit 5 LCS
similarity", pero la Unidad 5 (programacion dinamica) no tuvo workshop. Este
modulo es lo que habria dejado: la subsecuencia comun mas larga de dos
secuencias de zonas, con el algoritmo de tabulacion de la clase 27 (Algoritmo
4 del notebook de la Unidad 5).

Uso desde una task (src/w5/taskK_tema.py), despues del bloque BASE:

    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from lcs import lcs, similitud_lcs

La recurrencia es la del curso: con dp[i][j] = LCS de los prefijos a[:i] y
b[:j],

    dp[i][j] = dp[i-1][j-1] + 1                 si a[i-1] == b[j-1]
    dp[i][j] = max(dp[i-1][j], dp[i][j-1])      si no

Cada fila solo usa la anterior, asi que se guardan dos filas en vez de la
matriz completa: el tiempo sigue siendo O(m n), la memoria baja a O(n). Con
secuencias de unas 400 zonas son unas 160.000 celdas por par: medido en
CPython, 500 pares tardan unos 10 s (23 s con la matriz completa). Por eso el
enunciado pide LCS solo sobre 500 pares o sobre los candidatos de LSH, nunca
sobre todos los pares.

La similitud es

    similitud_lcs(a, b) = 2 LCS(a, b) / (|a| + |b|)

que es 1 - d / (|a| + |b|), con d la distancia de edicion con solo inserciones
y borrados: d = |a| + |b| - 2 LCS (Mining of Massive Datasets, sec. 3.5.5).
Va de 0 (nada en comun) a 1 (secuencias iguales).
"""


def lcs(a, b):
    """Largo de la subsecuencia comun mas larga de las listas a y b."""
    if len(b) > len(a):
        a, b = b, a                    # la fila es la secuencia mas corta
    previa = [0] * (len(b) + 1)
    for x in a:
        fila = [0]
        for j, y in enumerate(b, 1):
            if x == y:
                fila.append(previa[j - 1] + 1)
            else:
                fila.append(previa[j] if previa[j] > fila[j - 1] else fila[j - 1])
        previa = fila
    return previa[-1]


def similitud_lcs(a, b):
    """2 LCS / (|a| + |b|), en [0, 1]. Dos secuencias vacias dan 0."""
    total = len(a) + len(b)
    return 2 * lcs(a, b) / total if total else 0.0
