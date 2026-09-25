"""
src/task5_probability_analysis.py
----------------------------------
Implementacion de la Task 5: Probability Analysis (Chernoff vs Chebyshev)
guarda los resultados calculados en results/task5_results.json
"""

import os
import csv
import json
import math
from datetime import datetime
from collections import defaultdict

# Determinacion de rutas relativas al proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RIDES_CSV = os.path.join(BASE_DIR, "data", "rides.csv")
RESULTS_JSON = os.path.join(BASE_DIR, "results", "task5_results.json")

def load_data(csv_path):
    """Carga los datos y los agrupa en conteos por (pickup_zone, hour, day)."""
    counts_per_day = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = datetime.fromisoformat(row["timestamp"])
            zone = row["pickup_zone"]
            hour = ts.hour
            day_key = ts.strftime("%Y-%m-%d")
            
            counts_per_day[zone][hour][day_key] += 1

    observations = defaultdict(dict)
    for zone, hours in counts_per_day.items():
        for hour, days_dict in hours.items():
            observations[zone][hour] = list(days_dict.values())
            
    return observations

def chernoff_upper_bound(mu, delta):
    """Calcula la cota multiplicativa de Chernoff P(X >= (1 + delta) * mu)."""
    if mu == 0:
        return 0.0
    factor = (math.exp(delta) / ((1 + delta) ** (1 + delta))) ** mu
    return min(1.0, factor)

def chebyshev_upper_bound(variance, mu, threshold):
    """Calcula la cota de Chebyshev P(X >= threshold) para threshold > mu."""
    if threshold <= mu or variance == 0:
        return 1.0
    k = (threshold - mu)
    bound = variance / (k ** 2)
    return min(1.0, bound)

def analyze_surge_pricing(observations, delta=0.5):
    """Analiza el comportamiento probabilistico para todas las zonas y horas."""
    results = []

    for zone in sorted(observations.keys()):
        for hour in range(24):
            day_counts = observations[zone].get(hour, [0])
            n_obs = len(day_counts)
            
            mu = sum(day_counts) / n_obs if n_obs > 0 else 0
            var = sum((x - mu) ** 2 for x in day_counts) / n_obs if n_obs > 0 else 0
            threshold = (1 + delta) * mu
            
            bound_chernoff = chernoff_upper_bound(mu, delta)
            bound_chebyshev = chebyshev_upper_bound(var, mu, threshold)
            
            exceedances = sum(1 for x in day_counts if x >= threshold)
            empirical_prob = exceedances / n_obs if n_obs > 0 else 0
            
            results.append({
                "zone": zone,
                "hour": hour,
                "mean_requests": round(mu, 2),
                "variance": round(var, 2),
                "threshold": round(threshold, 2),
                "empirical_prob": round(empirical_prob, 4),
                "chernoff_bound": round(bound_chernoff, 6),
                "chebyshev_bound": round(bound_chebyshev, 6)
            })
            
    return results

if __name__ == "__main__":
    if not os.path.exists(RIDES_CSV):
        print(f"Error: No se encontro el archivo de entrada {RIDES_CSV}")
        exit(1)
        
    print("Procesando observaciones para la Task 5...")
    observations = load_data(RIDES_CSV)
    
    results = analyze_surge_pricing(observations, delta=0.5)
    
    # Crear carpeta results si no existe
    os.makedirs(os.path.dirname(RESULTS_JSON), exist_ok=True)
    
    # Guardar archivo JSON estructurado
    output_data = {
        "task": "Task 5 - Probability Analysis",
        "delta_surge": 0.5,
        "total_records_analyzed": len(results),
        "data": results
    }
    
    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)
        
    print(f"Resultados exportados exitosamente a: {RESULTS_JSON}")