"""Números y fechas tal como los escribe la gente (formato español, Excel, IA...)."""
import datetime as dt
import unittest

import comun  # noqa: F401  (corta internet y prepara la ruta de la app)
from app import almacen, importar, motor


class Numeros(unittest.TestCase):
    def test_formato_espanol(self):
        casos = {"1.000": 1000, "1.234,56": 1234.56, "1234,5": 1234.5, "1,5": 1.5,
                 "13.25": 13.25, "3352,6": 3352.6, "1.000.000": 1e6, "-2,5": -2.5,
                 " 1.399,89 € ": 1399.89, "": 0.0, "abc": 0.0}
        for texto, esperado in casos.items():
            with self.subTest(texto=texto):
                self.assertAlmostEqual(motor.num_es(texto), esperado)

    def test_lee_numero_de_importacion(self):
        self.assertIsNone(importar.lee_numero(""))
        self.assertIsNone(importar.lee_numero(None))
        self.assertEqual(importar.lee_numero("abc"), "error")
        self.assertAlmostEqual(importar.lee_numero("1.000 €"), 1000)
        self.assertAlmostEqual(importar.lee_numero("-5,5"), 5.5)   # siempre en positivo
        self.assertAlmostEqual(importar.lee_numero(12.5), 12.5)    # celdas numéricas de Excel

    def test_fmt_num_para_mensajes(self):
        self.assertEqual(almacen.fmt_num(12345.6), "12.345,6")
        self.assertEqual(almacen.fmt_num(3), "3")
        self.assertEqual(almacen.fmt_num(0.123456), "0,1235")
        self.assertEqual(almacen.fmt_fecha("2025-03-10"), "10/03/2025")


class Fechas(unittest.TestCase):
    def test_formatos_validos(self):
        casos = {"2025-03-10": "2025-03-10", "10/03/2025": "2025-03-10", "10-03-2025": "2025-03-10",
                 "1/3/25": "2025-03-01", "2025-3-1": "2025-03-01", "10.03.2025": "2025-03-10"}
        for texto, esperado in casos.items():
            with self.subTest(texto=texto):
                self.assertEqual(importar.lee_fecha(texto), esperado)

    def test_fechas_imposibles(self):
        for texto in ("2025-13-45", "31/02/2025", "ayer", "", None, "32/01/2025"):
            with self.subTest(texto=texto):
                self.assertIsNone(importar.lee_fecha(texto))

    def test_celdas_de_excel(self):
        self.assertEqual(importar.lee_fecha(dt.datetime(2025, 3, 10, 0, 0)), "2025-03-10")
        self.assertEqual(importar.lee_fecha(dt.date(2025, 3, 10)), "2025-03-10")

    def test_validacion_del_almacen(self):
        errores = []
        manana = (dt.date.today() + dt.timedelta(days=1)).isoformat()
        self.assertEqual(almacen.fecha("2024-02-29", errores), "2024-02-29")
        almacen.fecha(manana, errores)
        almacen.fecha("1900-01-01", errores)
        almacen.fecha("no", errores)
        self.assertEqual(len(errores), 3)
        self.assertIn("futura", errores[0])


if __name__ == "__main__":
    unittest.main()
