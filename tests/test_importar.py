"""Importar: CSV de MyInvestor, plantilla (Excel o CSV) y texto que devuelve la IA."""
import io
import unittest

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, serie_inventada
from app import importar, plantilla

# Mismo formato que el extracto «Plusvalías y minusvalías» real de MyInvestor.
CSV_MYINVESTOR = """Fecha fiscal;Inversión;Valor de mercado;Resultado fiscal
02/01/2024;1000;1200;200
01/02/2024;500,5;590,1;89,6
28/08/2023;0;0;11,26
"""


class LeerMyInvestor(unittest.TestCase):
    def test_lotes_y_reembolsos(self):
        lotes, reembolsos = importar.leer_csv_myinvestor(CSV_MYINVESTOR.encode("utf-8"))
        self.assertEqual(lotes, [["2024-01-02", 1000.0, 1200.0], ["2024-02-01", 500.5, 590.1]])
        self.assertEqual(reembolsos, [["2023-08-28", 11.26]])

    def test_codificacion_de_windows(self):
        lotes, _ = importar.leer_csv_myinvestor(CSV_MYINVESTOR.encode("cp1252"))
        self.assertEqual(len(lotes), 2)

    def test_otro_archivo_no_da_lotes(self):
        lotes, reembolsos = importar.leer_csv_myinvestor("Concepto;Importe\nNómina;1500\n".encode())
        self.assertEqual((lotes, reembolsos), ([], []))

    def test_participaciones_con_el_precio_del_dia(self):
        serie = {"2024-01-02": 10.0, "2024-02-01": 11.0, "2024-09-02": 12.0}
        lotes = [["2024-01-02", 1000.0, 1200.0], ["2024-02-01", 550.0, 600.0]]
        movs, sin_vl, traspasos = importar.myinvestor_a_movimientos("f", lotes, [], serie)
        self.assertEqual((sin_vl, traspasos), (0, 0))
        self.assertAlmostEqual(movs[0]["unidades"], 100)
        self.assertAlmostEqual(movs[1]["unidades"], 50)
        self.assertTrue(all(m["tipo"] == "compra" for m in movs))

    def test_lote_sin_precio_ese_dia_usa_el_del_extracto(self):
        # Un hueco dentro de la historia del fondo (si fuera anterior a toda la historia, sería un traspaso).
        serie = {"2023-01-02": 9.0, "2024-01-02": 10.0, "2024-09-02": 12.0}
        lotes = [["2024-01-02", 1000.0, 1200.0], ["2023-05-05", 100.0, 120.0]]
        movs, sin_vl, _ = importar.myinvestor_a_movimientos("f", sorted(lotes), [], serie)
        self.assertEqual(sin_vl, 1)
        self.assertAlmostEqual(sum(m["unidades"] for m in movs), 110)   # el extracto valora a 12

    def test_traspaso_conserva_fecha_y_coste_del_fondo_de_origen(self):
        # Regresión v1.1.2. El fondo valía 8 en 2020 y 10 el día del traspaso (2023-06-01);
        # se traspasaron 4.000 € (coste original 3.000 €, fecha fiscal 2020) -> 400 participaciones.
        serie = {"2020-03-02": 8.0, "2023-06-01": 10.0, "2024-01-02": 10.0, "2024-02-01": 11.0,
                 "2024-09-02": 12.0, "2024-09-03": 12.1}
        lotes = [["2020-03-02", 3000.0, 400 * 12.0],          # traspaso: 3.000/8 darían 375
                 ["2024-01-02", 1000.0, 1200.0],              # compras normales
                 ["2024-02-01", 550.0, 600.0]]
        movs, sin_vl, traspasos = importar.myinvestor_a_movimientos("f", lotes, [], serie)
        self.assertEqual((sin_vl, traspasos), (0, 1))
        self.assertAlmostEqual(movs[0]["unidades"], 400)
        self.assertIn("traspaso", movs[0]["nota"])
        self.assertEqual(movs[0]["importe"], 3000)              # el coste original no cambia
        self.assertAlmostEqual(movs[1]["unidades"], 100)       # las normales, como siempre
        self.assertAlmostEqual(movs[2]["unidades"], 50)

    def test_vl_del_extracto_es_el_que_cuadra(self):
        serie = {"2024-01-02": 10.0, "2024-02-01": 11.0, "2024-09-02": 12.0, "2024-09-03": 12.04}
        lotes = [["2024-01-02", 1000.0, 1200.0], ["2024-02-01", 550.0, 600.0]]
        self.assertEqual(importar.vl_del_extracto(lotes, serie), (12.0, 2))

    def test_reembolso_es_venta_de_cero_unidades(self):
        movs, _, _ = importar.myinvestor_a_movimientos("f", [], [["2023-08-28", 11.26]], {})
        self.assertEqual((movs[0]["tipo"], movs[0]["unidades"], movs[0]["importe"]), ("venta", 0, 11.26))


class PrepararMyInvestor(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.cfg = cartera([etf("fondo", "0PTEST", fuente="morningstar", tipo="fondo",
                                identificador="IE00BYX5NX33")])
        self.precios = PreciosInventados({"MS:0PTEST": serie_inventada(10, "2023-01-02", paso=0)})

    def test_archivo_sin_isin_en_el_nombre(self):
        with self.precios:
            plan = importar.preparar_myinvestor(self.cfg, [("extracto.csv", CSV_MYINVESTOR.encode())], self.carpeta)
        self.assertIn("ISIN", plan.errores[0]["mensaje"])

    def test_archivo_que_no_es_el_extracto(self):
        with self.precios:
            plan = importar.preparar_myinvestor(
                self.cfg, [("Plusvalías y minusvalías fondo IE00BYX5NX33.csv", b"Concepto;Importe\nA;1\n")],
                self.carpeta)
        self.assertIn("No parece un extracto", plan.errores[0]["mensaje"])

    def test_reimportar_sustituye_lo_anterior(self):
        nombre = "Plusvalías y minusvalías fondo IE00BYX5NX33 (1).csv"
        with self.precios:
            plan = importar.preparar_myinvestor(self.cfg, [(nombre, CSV_MYINVESTOR.encode())], self.carpeta)
            inf1 = importar.aplicar(self.cfg, plan)
            plan = importar.preparar_myinvestor(self.cfg, [(nombre, CSV_MYINVESTOR.encode())], self.carpeta)
            inf2 = importar.aplicar(self.cfg, plan)
        self.assertEqual(inf1["añadidos"], 3)
        self.assertEqual((inf2["añadidos"], inf2["sustituidos"]), (3, 3))
        self.assertEqual(len(self.cfg["movimientos"]), 3)


class LeerTabla(unittest.TestCase):
    CAB = ";".join(importar.COLUMNAS)

    def test_csv_de_la_ia_con_bloque_de_codigo(self):
        texto = f"```csv\n{self.CAB}\n2025-03-10;AAPL;Apple;accion;compra;5;1050;USD;;\n```"
        filas, error = importar.leer_tabla("", texto)
        self.assertIsNone(error)
        self.assertEqual(filas[0][1]["identificador"], "AAPL")

    def test_numero_de_fila_real_con_filas_en_blanco(self):
        texto = f"{self.CAB}\n\n2025-03-10;AAPL;;;compra;1;10;;;\n\n2025-03-11;AAPL;;;compra;1;10;;;"
        filas, _ = importar.leer_tabla("x.csv", texto.encode())
        self.assertEqual([n for n, _ in filas], [3, 5])

    def test_solo_cabecera(self):
        _, error = importar.leer_tabla("x.csv", (self.CAB + "\n").encode())
        self.assertIn("Solo hay cabecera", error)

    def test_cabecera_equivocada(self):
        _, error = importar.leer_tabla("x.csv", "a;b;c\n1;2;3\n".encode())
        self.assertIn("No encuentro las columnas", error)

    def test_sinonimos_de_columnas(self):
        filas, error = importar.leer_tabla("x.csv", "Date;ISIN;Operación;Importe\n10/03/2025;X;buy;5\n".encode())
        self.assertIsNone(error)
        self.assertEqual(filas[0][1]["tipo_movimiento"], "buy")

    def test_plantilla_excel_vacia(self):
        _, error = importar.leer_tabla("plantilla.xlsx", plantilla.excel())
        self.assertIn("«Movimientos» está vacía", error)

    def test_plantilla_excel_rellena(self):
        from openpyxl import load_workbook
        libro = load_workbook(io.BytesIO(plantilla.excel()))
        for fila in plantilla.EJEMPLO:
            libro["Movimientos"].append(list(fila))
        buf = io.BytesIO()
        libro.save(buf)
        filas, error = importar.leer_tabla("mia.xlsx", buf.getvalue())
        self.assertIsNone(error)
        self.assertEqual(len(filas), len(plantilla.EJEMPLO))
        self.assertEqual(importar.lee_fecha(filas[0][1]["fecha"]), "2025-03-10")


class PrepararTabla(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.cfg = cartera([etf(identificador="IE0000000001"), manual("cuenta", "efectivo", nombre="Cuenta del banco")])
        self.precios = PreciosInventados({"TEST.DE": serie_inventada(20, "2024-01-01", paso=0)})

    def prepara(self, texto):
        filas, error = importar.leer_tabla("", ";".join(importar.COLUMNAS) + "\n" + texto)
        self.assertIsNone(error)
        with self.precios:
            return importar.preparar_tabla(self.cfg, filas, self.carpeta)

    def test_unidades_calculadas_y_saldos(self):
        plan = self.prepara("2025-03-10;IE0000000001;;etf;compra;;1000;EUR;;\n"
                            "2025-03-31;;Cuenta del banco;efectivo;saldo;;2.500;EUR;;")
        self.assertEqual(plan.errores, [])
        self.assertAlmostEqual(plan.movimientos[0]["unidades"], 50)
        self.assertIn("unidades calculadas", plan.movimientos[0]["marcas"])
        self.assertEqual(plan.valoraciones[0]["valor"], 2500)

    def test_errores_con_su_fila(self):
        plan = self.prepara("2025-13-45;IE0000000001;;etf;compra;1;10;;;\n"
                            "2025-03-10;IE0000000001;;etf;regalo;1;10;;;\n"
                            "2025-03-10;IE0000000001;;etf;compra;1;;;;\n"
                            "2025-03-10;;;etf;compra;1;10;;;")
        self.assertEqual([e["fila"] for e in plan.errores], [2, 3, 4, 5])
        self.assertIn("no es válida", plan.errores[0]["mensaje"])

    def test_importar_dos_veces_no_duplica(self):
        texto = "2025-03-10;IE0000000001;;etf;compra;2;40;EUR;;"
        importar.aplicar(self.cfg, self.prepara(texto))
        informe = importar.aplicar(self.cfg, self.prepara(texto))
        self.assertEqual((informe["añadidos"], informe["repetidos"]), (0, 1))
        self.assertEqual(len(self.cfg["movimientos"]), 1)

    def test_vista_previa_no_toca_la_cartera(self):
        plan = self.prepara("2025-03-10;IE0000000001;;etf;compra;2;40;EUR;;")
        informe = importar.vista_previa(self.cfg, plan)
        self.assertEqual(informe["añadidos"], 1)
        self.assertEqual(self.cfg["movimientos"], [])

    def test_producto_nuevo_a_mano_por_nombre(self):
        plan = self.prepara("2025-03-31;;Piso de la playa;inmueble;saldo;;200.000;EUR;;")
        informe = importar.aplicar(self.cfg, plan)
        self.assertEqual(informe["productosNuevos"][0]["tipo"], "inmueble")
        self.assertEqual(informe["saldos"], 1)


if __name__ == "__main__":
    unittest.main()
