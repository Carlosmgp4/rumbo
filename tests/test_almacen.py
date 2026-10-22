"""Guardar productos, movimientos y valores: validaciones en castellano y copias automáticas."""
import os
import unittest
from unittest import mock

from comun import ConCarpeta, cartera, etf, manual, mov
from app import almacen


class Productos(unittest.TestCase):
    def test_errores_comprensibles(self):
        with self.assertRaises(almacen.ErrorValidacion) as e:
            almacen.guarda_producto(cartera(), {"nombre": "", "tipo": "nada", "moneda": "EUROS", "riesgo": 9})
        texto = " ".join(e.exception.errores)
        for trozo in ("Ponle un nombre", "Elige de qué tipo", "moneda", "riesgo va de 1 a 7"):
            self.assertIn(trozo, texto)

    def test_online_necesita_codigo(self):
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_producto(cartera(), {"nombre": "Apple", "tipo": "accion", "fuente": "yahoo"})

    def test_color_menos_usado_y_se_conserva_al_editar(self):
        cfg = cartera()
        slots = [almacen.guarda_producto(cfg, {"nombre": f"P{i}", "tipo": "otro"})[0]["slot"] for i in range(13)]
        self.assertEqual(slots[:12], list(range(1, 13)))   # los 12 colores antes de repetir
        p = cfg["productos"][2]
        almacen.guarda_producto(cfg, {"id": p["id"], "nombre": "Otro nombre", "tipo": "otro"})
        self.assertEqual(p["slot"], 3)
        self.assertEqual(p["nombre"], "Otro nombre")

    def test_efectivo_siempre_a_mano(self):
        p, cambio = almacen.guarda_producto(cartera(), {"nombre": "Cuenta", "tipo": "efectivo",
                                                        "fuente": "yahoo", "codigo": "X"})
        self.assertEqual(p["fuente"], "manual")
        self.assertFalse(cambio)
        self.assertNotIn("codigo", p)

    def test_ter_en_porcentaje(self):
        p, _ = almacen.guarda_producto(cartera(), {"nombre": "F", "tipo": "otro", "ter": "0,12"})
        self.assertAlmostEqual(p["ter"], 0.0012)

    def test_borrar_producto_borra_sus_datos(self):
        cfg = cartera([etf(), manual()], [mov("2024-01-02", "etf", "compra", 1, 10)],
                      [{"id": "v1", "fecha": "2024-01-02", "producto": "piso", "valor": 5}])
        almacen.borra_producto(cfg, "etf")
        self.assertEqual(cfg["movimientos"], [])
        self.assertEqual(len(cfg["valoraciones"]), 1)


class Movimientos(unittest.TestCase):
    def setUp(self):
        self.cfg = cartera([etf(), manual("cuenta", "efectivo")])

    def test_no_puedes_vender_lo_que_no_tienes(self):
        almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "compra", "fecha": "2024-01-02",
                                             "unidades": "10", "importe": "100"})
        with self.assertRaises(almacen.ErrorValidacion) as e:
            almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "venta", "fecha": "2024-01-03",
                                                 "unidades": "10,5", "importe": "120"})
        self.assertIn("solo tenías 10 unidades", e.exception.errores[0])

    def test_venta_anterior_a_la_compra(self):
        almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "compra", "fecha": "2024-06-02",
                                             "unidades": 10, "importe": 100})
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "venta", "fecha": "2024-01-03",
                                                 "unidades": 1, "importe": 12})

    def test_cuentas_van_con_saldos(self):
        with self.assertRaises(almacen.ErrorValidacion) as e:
            almacen.guarda_movimiento(self.cfg, {"producto": "cuenta", "tipo": "compra", "fecha": "2024-01-02",
                                                 "importe": 100})
        self.assertIn("Saldos y valores", e.exception.errores[0])

    def test_comision_mayor_que_importe(self):
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "compra", "fecha": "2024-01-02",
                                                 "unidades": 1, "importe": 10, "comision": 10})

    def test_editar_conserva_el_id(self):
        m = almacen.guarda_movimiento(self.cfg, {"producto": "etf", "tipo": "compra", "fecha": "2024-01-02",
                                                 "unidades": 1, "importe": 10})
        almacen.guarda_movimiento(self.cfg, {"id": m["id"], "producto": "etf", "tipo": "compra",
                                             "fecha": "2024-01-02", "unidades": 2, "importe": "1.000"})
        self.assertEqual(len(self.cfg["movimientos"]), 1)
        self.assertEqual(self.cfg["movimientos"][0]["importe"], 1000)


class Valoraciones(unittest.TestCase):
    def test_un_valor_por_dia(self):
        cfg = cartera([manual()])
        almacen.guarda_valoracion(cfg, {"producto": "piso", "fecha": "2024-01-02", "valor": "100.000"})
        almacen.guarda_valoracion(cfg, {"producto": "piso", "fecha": "2024-01-02", "valor": "120.000"})
        self.assertEqual(len(cfg["valoraciones"]), 1)
        self.assertEqual(cfg["valoraciones"][0]["valor"], 120000)


class Disco(ConCarpeta):
    def test_copia_automatica_y_limite(self):
        ruta = os.path.join(self.carpeta, "cartera.json")
        with mock.patch.object(almacen, "COPIAS_MAX", 3):
            for i in range(6):
                almacen.guarda(ruta, cartera([manual(f"p{i}")]))
        copias = os.listdir(os.path.join(self.carpeta, "copias"))
        self.assertEqual(len(copias), 3)
        self.assertEqual(almacen.carga(ruta)["productos"][0]["id"], "p5")
        self.assertFalse(os.path.exists(ruta + ".tmp"))


if __name__ == "__main__":
    unittest.main()
