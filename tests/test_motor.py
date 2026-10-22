"""El motor de cálculo: FIFO, TIR, divisas, valores a mano y la cartera de ejemplo."""
import datetime as dt
import json
import os
import unittest

from comun import (RAIZ, ConCarpeta, PreciosInventados, cartera, etf, lee_demo, manual, mov,
                   serie_inventada)
from app import motor


def suma(r):
    return sum(e[1] for e in r["eventos"]), sum(e[2] for e in r["eventos"])


class Fifo(unittest.TestCase):
    P = {"id": "x", "corto": "X"}

    def test_venta_descuenta_lo_mas_antiguo(self):
        r = motor.aplicar_movimientos(self.P, [
            mov("2024-01-02", "x", "compra", 10, 100),
            mov("2024-06-03", "x", "compra", 10, 200),
            mov("2025-01-02", "x", "venta", 15, 300),
        ])
        unidades, aportado = suma(r)
        self.assertAlmostEqual(unidades, 5)
        self.assertAlmostEqual(aportado, 100)          # quedan 5 del segundo lote (a 20)
        self.assertAlmostEqual(r["realizado"], 100)    # 300 - (100 + 5*20)
        self.assertEqual(len(r["vendidas"]), 2)

    def test_mismo_dia_compra_antes_que_venta(self):
        r = motor.aplicar_movimientos(self.P, [
            mov("2024-01-02", "x", "venta", 5, 60),
            mov("2024-01-02", "x", "compra", 10, 100),
        ])
        self.assertAlmostEqual(suma(r)[0], 5)
        self.assertAlmostEqual(r["realizado"], 10)

    def test_vender_de_mas_avisa(self):
        motor.AVISOS.clear()
        motor.aplicar_movimientos(self.P, [mov("2024-01-02", "x", "compra", 1, 10),
                                           mov("2024-02-02", "x", "venta", 2, 30)])
        self.assertTrue(any("vendes más" in a for a in motor.AVISOS))

    def test_dividendos_comisiones_y_flujos(self):
        r = motor.aplicar_movimientos(self.P, [
            mov("2024-01-02", "x", "compra", 10, 100, comision=1),
            mov("2024-03-01", "x", "dividendo", 0, 5),
            mov("2024-04-01", "x", "comision", 0, 2),
        ])
        self.assertAlmostEqual(r["realizado"], 3)
        self.assertAlmostEqual(r["comisiones"], 3)
        self.assertEqual([f[1] for f in r["flujos"]], [-100, 5, -2])   # negativo: sale de tu cuenta


class Tir(unittest.TestCase):
    def test_diez_por_ciento_en_un_ano(self):
        t = motor.xirr([(dt.date(2023, 1, 1), -100), (dt.date(2024, 1, 1), 110)])
        self.assertAlmostEqual(t, 0.10, places=3)

    def test_perdidas(self):
        t = motor.xirr([(dt.date(2023, 1, 1), -100), (dt.date(2024, 1, 1), 80)])
        self.assertAlmostEqual(t, -0.20, places=3)


class Construir(ConCarpeta):
    def test_etf_en_euros_con_venta_y_cuenta(self):
        serie = serie_inventada(base=10, desde="2024-01-01", paso=0)
        cfg = cartera([etf(), manual("cuenta", "efectivo")],
                      [mov("2024-01-02", "etf", "compra", 10, 100), mov("2025-01-02", "etf", "venta", 4, 60)],
                      [{"id": "v1", "fecha": "2024-06-03", "producto": "cuenta", "valor": 1000}])
        with PreciosInventados({"TEST.DE": serie}):
            D = motor.construir(cfg, self.carpeta, descargar=False)
        p = D["productos"][0]
        self.assertAlmostEqual(p["participaciones"], 6)
        self.assertAlmostEqual(p["aportado"], 60)
        self.assertAlmostEqual(p["realizado"], 20)
        self.assertAlmostEqual(p["valor"], 60)
        self.assertAlmostEqual(D["total"]["patrimonio"], 1060)
        self.assertEqual(D["avisos"], [])

    def test_accion_en_dolares_se_pasa_a_euros(self):
        serie = serie_inventada(base=100, desde="2024-01-01", paso=0)
        fx = serie_inventada(base=0.9, desde="2024-01-01", paso=0)
        cfg = cartera([etf("aapl", "AAPL", "USD", tipo="accion")],
                      [mov("2024-01-02", "aapl", "compra", 2, 180)])
        with PreciosInventados({"AAPL": serie, "USDEUR=X": fx}):
            D = motor.construir(cfg, self.carpeta, descargar=False)
        p = D["productos"][0]
        self.assertAlmostEqual(p["valor"], 2 * 100 * 0.9)
        self.assertIn("convertido de USD", p["fuenteTexto"])
        self.assertEqual(p["etqPrecio"], "Precio de la acción")

    def test_precio_hasta_hoy_aunque_el_cambio_sea_diario(self):
        # Regresión v1.1.2: el precio de hoy tiene que llegar al panel (no el de hace semanas).
        hoy = dt.date.today().isoformat()
        serie = serie_inventada(base=100, desde="2024-01-01", paso=0.001)
        fx = serie_inventada(base=0.9, desde="2024-01-01", paso=0)
        cfg = cartera([etf("aapl", "AAPL", "USD", tipo="accion")], [mov("2024-01-02", "aapl", "compra", 1, 90)])
        with PreciosInventados({"AAPL": serie, "USDEUR=X": fx}):
            D = motor.construir(cfg, self.carpeta, descargar=False)
        ultimo = max(serie)
        self.assertEqual(D["productos"][0]["navFecha"], ultimo)
        self.assertLessEqual((dt.date.fromisoformat(hoy) - dt.date.fromisoformat(ultimo)).days, 3)

    def test_valor_anotado_a_mano(self):
        cfg = cartera([manual("piso")], [], [
            {"id": "v1", "fecha": "2023-01-02", "producto": "piso", "valor": 150000, "aportado": 140000},
            {"id": "v2", "fecha": "2025-01-02", "producto": "piso", "valor": 180000, "aportado": 140000}])
        with PreciosInventados():
            D = motor.construir(cfg, self.carpeta, descargar=False)
        p = next(x for x in D["productos"] + D["otrosActivos"] if x["id"] == "piso")
        self.assertAlmostEqual(p["valor"], 180000)
        self.assertAlmostEqual(D["total"]["patrimonio"], 180000)


class CarteraDeEjemplo(ConCarpeta):
    """Lo que se ve al abrir la app por primera vez. Si cambia, algo se ha roto."""

    def test_unidades_aportado_y_realizado_no_cambian(self):
        with open(os.path.join(RAIZ, "tests", "datos", "demo_esperado.json"), encoding="utf-8") as f:
            esperado = json.load(f)
        from regenerar_esperados import foto_demo
        actual = foto_demo()
        self.assertEqual(set(actual), set(esperado))
        for pid, e in esperado.items():
            for campo, v in e.items():
                with self.subTest(producto=pid, campo=campo):
                    self.assertAlmostEqual(actual[pid][campo], v, places=4)

    def test_el_panel_completo_se_calcula(self):
        with PreciosInventados():
            D = motor.construir(lee_demo(), self.carpeta, descargar=False)
        self.assertGreater(D["total"]["patrimonio"], 0)
        self.assertEqual(len(D["comparacion"]["referencias"]), 4)
        for r in D["comparacion"]["referencias"]:
            self.assertIsNotNone(r["valor"], r["id"])
        ids = {p["id"] for p in D["productos"] + D["otrosActivos"] + D["pasivos"]}
        self.assertEqual(ids, {p["id"] for p in lee_demo()["productos"]})
        self.assertEqual(len(D["fechas"]), len(D["total"]["serie"]))


if __name__ == "__main__":
    unittest.main()
