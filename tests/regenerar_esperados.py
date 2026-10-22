"""
Vuelve a sacar la "foto" de la cartera de ejemplo que comprueba test_motor.py
(participaciones, aportado y realizado de cada producto; no dependen de los precios).

Solo hay que ejecutarlo cuando se cambie A PROPÓSITO la cartera de ejemplo o la forma
de calcular, y después revisar con git diff que los cambios son los esperados:

    .venv\\Scripts\\python.exe tests\\regenerar_esperados.py
"""
import json
import os

from comun import RAIZ, lee_demo, motor


def foto_demo():
    cfg = lee_demo()
    salida = {}
    for p in cfg["productos"]:
        movs = [m for m in cfg["movimientos"] if m["producto"] == p["id"]]
        if not movs:
            continue
        r = motor.aplicar_movimientos(dict(p, corto=p.get("corto") or p["id"]), movs)
        salida[p["id"]] = {
            "movimientos": len(movs),
            "unidades": round(sum(e[1] for e in r["eventos"]), 6),
            "aportado": round(sum(e[2] for e in r["eventos"]), 2),
            "realizado": round(r["realizado"], 2),
            "comisiones": round(r["comisiones"], 2),
        }
    return salida


if __name__ == "__main__":
    ruta = os.path.join(RAIZ, "tests", "datos", "demo_esperado.json")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(foto_demo(), f, ensure_ascii=False, indent=1)
    print("Guardado", ruta)
