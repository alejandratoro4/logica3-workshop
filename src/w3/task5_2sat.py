"""
Workshop 3 - Task 5: 2-SAT aleatorizado (algoritmo de Papadimitriou).

Se traducen 5 restricciones de politica de despacho a clausulas de 2
literales sobre 8 variables booleanas, y se busca una asignacion que las
cumpla todas con el algoritmo aleatorizado de Papadimitriou:

    1. empezar con una asignacion al azar;
    2. mientras haya una clausula sin cumplir y no se agote el limite,
       escoger al azar una clausula sin cumplir y cambiar al azar una de sus
       dos variables.

Si la formula es satisfacible, el numero esperado de cambios hasta dar con
una asignacion que la cumple es a lo sumo n^2 (la distancia de Hamming a una
solucion fija hace una caminata aleatoria con sesgo hacia 0). Por Markov,
con 2 n^2 cambios falla con probabilidad a lo sumo 1/2, y repetirlo b veces
(2 b n^2 cambios en total) baja el fallo a 1/2^b.

Las condiciones del tipo "si pi(X) es alta" NO son variables: si lo fueran,
la restriccion quedaria con 3 literales y dejaria de ser 2-SAT. Se evaluan
con los datos: este script arma su propia matriz M desde edges.csv, calcula
la distribucion estacionaria pi = pi M por iteracion de potencias, y decide
con ella. Si la condicion se cumple, la restriccion entra como clausula; si
no, no aplica (lista de clausulas vacia).

Entrada: data/edges.csv
Salida:  results/w3/task5.json (claves del contrato, contratos/w3.md, Task 5)
"""

import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results", "w3")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
EDGES_CSV = os.path.join(DATA_DIR, "edges.csv")
RIDES_CSV = os.path.join(DATA_DIR, "rides.csv")

import csv
import itertools
import json
import random

SEED = int(os.environ.get("RIDES_SEED") or 42)
B_REPEATS = 10          # b: el fallo queda acotado por 1/2^b
POWER_TOL = 1e-12       # tolerancia de la iteracion de potencias
POWER_MAX_IT = 10000


# ---------------------------------------------------------------------------
# Distribucion estacionaria desde edges.csv
# ---------------------------------------------------------------------------
def build_transition_matrix(csv_path):
    """Zonas ordenadas y M[i][j] = reloc_count(i -> j) / total que sale de i."""
    counts = {}
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            key = (row["from_zone"], row["to_zone"])
            counts[key] = counts.get(key, 0) + int(row["reloc_count"])
    zones = sorted({z for pair in counts for z in pair})
    idx = {z: i for i, z in enumerate(zones)}
    n = len(zones)
    M = [[0.0] * n for _ in range(n)]
    for (a, b), c in counts.items():
        M[idx[a]][idx[b]] += c
    for i in range(n):
        s = sum(M[i])
        if s > 0:
            M[i] = [v / s for v in M[i]]
        else:
            M[i][i] = 1.0   # zona sin salidas: se queda (no deberia ocurrir)
    return zones, M


def stationary_distribution(M):
    """pi = pi M por iteracion de potencias, desde la distribucion uniforme."""
    n = len(M)
    pi = [1.0 / n] * n
    for _ in range(POWER_MAX_IT):
        nxt = [sum(pi[i] * M[i][j] for i in range(n)) for j in range(n)]
        s = sum(nxt)
        nxt = [v / s for v in nxt]
        if max(abs(a - b) for a, b in zip(pi, nxt)) < POWER_TOL:
            return nxt
        pi = nxt
    return pi


# ---------------------------------------------------------------------------
# Formula 2-SAT
# ---------------------------------------------------------------------------
def neg(lit):
    return lit[1:] if lit.startswith("-") else "-" + lit


def lit_value(lit, assignment):
    if lit.startswith("-"):
        return not assignment[lit[1:]]
    return assignment[lit]


def clause_ok(clause, assignment):
    return lit_value(clause[0], assignment) or lit_value(clause[1], assignment)


def build_formula(zones, pi):
    """Variables, restricciones y clausulas. Las zonas se escogen con pi: las
    tres de mayor pi (Z1, Z2, Z3) y la de menor pi (Zb). 'Alta' significa por
    encima de la participacion pareja 1/n; 'baja', por debajo."""
    n = len(zones)
    share = 1.0 / n
    order = sorted(range(n), key=lambda i: pi[i], reverse=True)
    z1, z2, z3 = (zones[i] for i in order[:3])
    zb = zones[order[-1]]
    p = {z: pi[i] for i, z in enumerate(zones)}

    variables = [
        {"name": "x1", "meaning": f"surge activo en {z1}"},
        {"name": "x2", "meaning": f"conductores extra enviados a {z1}"},
        {"name": "x3", "meaning": f"surge activo en {z2}"},
        {"name": "x4", "meaning": f"conductores extra enviados a {z2}"},
        {"name": "x5", "meaning": f"surge activo en {z3}"},
        {"name": "x6", "meaning": f"conductores extra enviados a {z3}"},
        {"name": "x7", "meaning": f"se reubican conductores desde {zb} (pi mas baja)"},
        {"name": "x8", "meaning": f"surge activo en {zb}"},
    ]

    def high(z):
        return p[z] > share

    constraints = []

    # R1-R3: zonas de pi alta necesitan surge o refuerzo.
    for z, s, e in ((z1, "x1", "x2"), (z2, "x3", "x4"), (z3, "x5", "x6")):
        applies = high(z)
        constraints.append({
            "text": f"si pi({z}) es alta, surge en {z} o conductores extra a {z}",
            "condition": f"pi({z}) = {p[z]:.4f} {'>' if applies else '<='} 1/{n} = {share:.4f}",
            "applies": applies,
            "clauses": [[s, e]] if applies else [],
        })

    # R4: flota de refuerzo limitada: no alcanza para reforzar a la vez las dos
    # zonas de mayor pi, ni la segunda y la tercera.
    constraints.append({
        "text": f"flota de refuerzo limitada: no se envian extra a {z1} y {z2} a la vez, ni a {z2} y {z3} a la vez",
        "condition": "siempre aplica",
        "applies": True,
        "clauses": [["-x2", "-x4"], ["-x4", "-x6"]],
    })

    # R5: los conductores extra salen de la zona de pi mas baja, y si esa zona
    # cede conductores se activa surge alli para no dejarla sin oferta.
    applies = p[zb] < share
    constraints.append({
        "text": (f"los conductores extra salen de {zb}: enviar extra a {z1}, {z2} o {z3} "
                 f"exige reubicar desde {zb}, y si {zb} cede conductores se activa surge en {zb}"),
        "condition": f"pi({zb}) = {p[zb]:.4f} {'<' if applies else '>='} 1/{n} = {share:.4f}",
        "applies": applies,
        "clauses": ([["-x2", "x7"], ["-x4", "x7"], ["-x6", "x7"], ["-x7", "x8"]] if applies else []),
    })
    return variables, constraints


# ---------------------------------------------------------------------------
# Papadimitriou
# ---------------------------------------------------------------------------
def papadimitriou(names, clauses, max_flips, rng):
    """Caminata aleatoria sobre asignaciones. Devuelve (ok, asignacion,
    cambios, traza de clausulas sin cumplir: la inicial y una por cambio)."""
    assignment = {v: rng.random() < 0.5 for v in names}
    unsat = [c for c in clauses if not clause_ok(c, assignment)]
    trace = [len(unsat)]
    flips = 0
    while unsat and flips < max_flips:
        clause = rng.choice(unsat)
        lit = rng.choice(clause)
        var = lit[1:] if lit.startswith("-") else lit
        assignment[var] = not assignment[var]
        flips += 1
        unsat = [c for c in clauses if not clause_ok(c, assignment)]
        trace.append(len(unsat))
    return (not unsat), assignment, flips, trace


def brute_force_count(names, clauses):
    """Cuantas de las 2^n asignaciones cumplen todo. Con n = 8 son 256: sirve
    para verificar el resultado del algoritmo aleatorizado, no lo reemplaza."""
    total = 0
    for values in itertools.product([False, True], repeat=len(names)):
        a = dict(zip(names, values))
        if all(clause_ok(c, a) for c in clauses):
            total += 1
    return total


if __name__ == "__main__":
    if not os.path.exists(EDGES_CSV):
        print(f"Error: no se encontro {EDGES_CSV}. Corre primero src/w3/dataset.py")
        raise SystemExit(1)

    zones, M = build_transition_matrix(EDGES_CSV)
    pi = stationary_distribution(M)
    variables, constraints = build_formula(zones, pi)

    names = [v["name"] for v in variables]
    clauses = [c for r in constraints for c in r["clauses"]]
    assert all(len(c) == 2 for c in clauses), "toda clausula debe tener 2 literales"

    n = len(names)
    max_flips = 2 * B_REPEATS * n * n
    rng = random.Random(SEED)
    ok, assignment, flips, trace = papadimitriou(names, clauses, max_flips, rng)
    n_solutions = brute_force_count(names, clauses)

    print("Distribucion estacionaria (pi = pi M):")
    for z, v in sorted(zip(zones, pi), key=lambda t: -t[1]):
        print(f"  {z:<12}{v:.4f}")
    print(f"\n{n} variables, {len(constraints)} restricciones, {len(clauses)} clausulas")
    for k, r in enumerate(constraints, 1):
        print(f"  R{k} [{'aplica' if r['applies'] else 'no aplica'}] {r['text']}")
        print(f"      {r['condition']} -> {r['clauses']}")
    print(f"\nPapadimitriou: {'satisfacible' if ok else 'sin asignacion'} con {flips} cambios "
          f"(limite 2*b*n^2 = {max_flips}, b = {B_REPEATS})")
    for v in variables:
        print(f"  {v['name']} = {str(assignment[v['name']]):<5}  {v['meaning']}")
    print(f"Verificacion por fuerza bruta: {n_solutions} de {2 ** n} asignaciones cumplen todo")

    resultado = {
        "task": "W3 Task 5 - 2-SAT aleatorizado (Papadimitriou)",
        "variables": variables,
        "constraints": constraints,
        "satisfiable": ok,
        "assignment": assignment,
        "flips": flips,
        "max_flips": max_flips,
        "trace": trace,
        # Extras: el panel los ignora; sirven para leer el JSON solo.
        "b_repeats": B_REPEATS,
        "seed": SEED,
        "pi": {z: round(v, 6) for z, v in zip(zones, pi)},
        "brute_force_solutions": n_solutions,
    }
    with open(os.path.join(RESULTS_DIR, "task5.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"\nResultados guardados en {os.path.join(RESULTS_DIR, 'task5.json')}")
