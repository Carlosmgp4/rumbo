"""Resumen para la Renta (F-18): ventas con FIFO, traspasos, dividendos y lo que hay que revisar."""
import datetime as dt
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov
from app import almacen, exportar, fiscal, motor, servidor
from test_traspasos import traspaso


def fondo(pid, **extra):
    return etf(pid, "MS" + pid.upper(), tipo="fondo", isin="ES0000000" + pid[:3].upper().ljust(3, "X"), **extra)


class Ventas(ConCarpeta):
    def test_fifo_con_fechas_y_costes_de_cada_compra(self):
        cfg = cartera([etf("a")], [
            mov("2023-01-10", "a", "compra", 100, 1000),
            mov("2024-03-01", "a", "compra", 100, 1200),
            mov("2025-05-05", "a", "venta", 150, 2100),
        ])
        inf = fiscal.informe(cfg, "2025")
        [v] = inf["ventas"]
        self.assertEqual((v["transmision"], v["adquisicion"], v["ganancia"]), (2100, 1600, 500))   # 1000 + 50 a 12
        self.assertEqual([c["fecha"] for c in v["compras"]], ["2023-01-10", "2024-03-01"])
        self.assertEqual(v["avisos"], [])
        self.assertEqual(inf["totales"]["saldo"], 500)
        self.assertEqual(v["isin"], "")
        self.assertEqual(fiscal.isin_de({"identificador": "ie00byx5nx33"}), "IE00BYX5NX33")   # el de MyInvestor
        self.assertEqual(fiscal.isin_de({"identificador": "0P0001CLDK"}), "")
        self.assertEqual(fiscal.informe(cfg, "2024")["ventas"], [])                # otro año: nada

    def test_un_traspaso_entre_fondos_conserva_coste_y_fecha(self):
        cfg = cartera([fondo("a"), fondo("b")], [
            mov("2022-02-01", "a", "compra", 100, 1000),
            traspaso("2023-06-01", "a", "b", 100, 1150, 50, total=True),
            mov("2025-03-03", "b", "venta", 50, 1300),
        ])
        inf = fiscal.informe(cfg, "2025")
        [v] = inf["ventas"]
        self.assertEqual(v["producto"], "b")
        self.assertEqual((v["adquisicion"], v["ganancia"]), (1000, 300))           # el coste del fondo de origen
        self.assertEqual([c["fecha"] for c in v["compras"]], ["2022-02-01"])        # y su fecha de compra
        self.assertEqual(fiscal.informe(cfg, "2023")["avisos"], [])                 # fondo a fondo: bien

    def test_traspaso_que_no_es_entre_fondos_avisa(self):
        cfg = cartera([etf("a"), etf("b", "OTRO.DE")], [
            mov("2024-01-02", "a", "compra", 10, 1000),
            traspaso("2025-02-03", "a", "b", 10, 1100, 20, total=True),
        ])
        avisos = fiscal.informe(cfg, "2025")["avisos"]
        self.assertTrue(any("solo se puede traspasar entre fondos" in a for a in avisos), avisos)

    def test_regla_de_los_dos_meses(self):
        def con_recompra(tipo, fecha_recompra):
            p = etf("a", tipo=tipo)
            cfg = cartera([p], [mov("2024-01-02", "a", "compra", 10, 1000),
                                mov("2025-05-05", "a", "venta", 10, 800),
                                mov(fecha_recompra, "a", "compra", 1, 80)])
            return fiscal.informe(cfg, "2025")["ventas"][0]["avisos"]
        self.assertTrue(any("dos meses" in a for a in con_recompra("etf", "2025-06-20")))
        self.assertTrue(any("dos meses" in a for a in con_recompra("accion", "2025-03-10")))
        self.assertEqual(con_recompra("etf", "2025-08-01"), [])                       # más de dos meses: nada
        self.assertTrue(any("un año" in a for a in con_recompra("fondo", "2026-01-15")))   # fondos: un año
        self.assertEqual(con_recompra("cripto", "2025-05-20"), [])                    # no se mira

    def test_con_ganancia_no_hay_regla(self):
        cfg = cartera([etf("a")], [mov("2024-01-02", "a", "compra", 10, 1000),
                                   mov("2025-05-05", "a", "venta", 10, 1200),
                                   mov("2025-05-20", "a", "compra", 1, 120)])
        self.assertEqual(fiscal.informe(cfg, "2025")["ventas"][0]["avisos"], [])

    def test_venta_sin_compras_anotadas(self):
        # MyInvestor a veces solo da la plusvalía de un reembolso (venta con 0 participaciones).
        cfg = cartera([fondo("a")], [mov("2024-01-02", "a", "compra", 10, 1000),
                                     mov("2025-01-10", "a", "venta", 0, 110.65)])
        [v] = fiscal.informe(cfg, "2025")["ventas"]
        self.assertIsNone(v["adquisicion"])
        self.assertEqual(v["ganancia"], 110.65)
        self.assertIn("Solo está anotada la ganancia", v["avisos"][0])
        cfg = cartera([etf("b")], [mov("2025-01-10", "b", "venta", 5, 300)])          # vende sin haber comprado
        [v] = fiscal.informe(cfg, "2025")["ventas"]
        self.assertIn("No hay compras anotadas", v["avisos"][0])

    def test_rescate_de_un_plan_va_aparte(self):
        cfg = cartera([etf("plan", "MSPLAN", tipo="pension"), etf("a")], [
            mov("2020-01-02", "plan", "compra", 100, 1000),
            mov("2025-06-02", "plan", "venta", 100, 1500),
            mov("2024-01-02", "a", "compra", 10, 1000),
            mov("2025-06-02", "a", "venta", 10, 1100),
        ])
        inf = fiscal.informe(cfg, "2025")
        self.assertEqual([v["producto"] for v in inf["ventas"]], ["a"])
        self.assertEqual([v["producto"] for v in inf["rescates"]], ["plan"])
        self.assertEqual(inf["totales"]["saldo"], 100)                              # el plan no suma aquí
        self.assertEqual(inf["totales"]["rescates"], 1500)
        self.assertTrue(any("rendimiento del trabajo" in a for a in inf["avisos"]))


class Cobros(ConCarpeta):
    def test_dividendos_intereses_y_comisiones_del_ano(self):
        cfg = cartera([etf("a"), manual("cuenta", tipo="efectivo")], [
            mov("2024-01-02", "a", "compra", 10, 1000),
            mov("2024-12-30", "a", "dividendo", 0, 99),        # otro año
            mov("2025-03-01", "a", "dividendo", 0, 10),
            mov("2025-09-01", "a", "dividendo", 0, 12.5),
            mov("2025-12-31", "cuenta", "dividendo", 0, 40),
            mov("2025-06-30", "a", "comision", 0, 3),
        ])
        inf = fiscal.informe(cfg, "2025")
        self.assertEqual(inf["totales"]["dividendos"], 22.5)
        self.assertEqual(inf["totales"]["intereses"], 40)
        self.assertEqual(inf["totales"]["comisiones"], 3)
        self.assertEqual({x["producto"]: x["cobros"] for x in inf["cobros"]}, {"a": 2, "cuenta": 1})
        # Se anotan como se cobraron (sin retención): avisa de que en la Renta va el bruto.
        self.assertTrue(any("importe bruto" in a for a in inf["avisos"]), inf["avisos"])
        self.assertIn("Importe anotado", fiscal.csv_texto(inf))

    def test_cuadra_con_lo_ya_cobrado_del_panel(self):
        cfg = cartera([etf("a")], [
            mov("2023-01-02", "a", "compra", 100, 1000),
            mov("2024-02-01", "a", "venta", 30, 400),
            mov("2024-06-01", "a", "dividendo", 0, 15),
            mov("2025-02-03", "a", "venta", 20, 180),
            mov("2025-03-03", "a", "comision", 0, 2),
        ])
        suma = 0
        for ano in ("2024", "2025"):
            inf = fiscal.informe(cfg, ano)
            t = inf["totales"]
            suma += t["saldo"] + t["dividendos"] + t["intereses"] - t["comisiones"]
        with PreciosInventados():
            D = motor.construir(cfg, self.carpeta, descargar=False)
        self.assertAlmostEqual(suma, D["productos"][0]["realizado"], places=2)


class Anos(ConCarpeta):
    def test_ano_por_defecto_es_el_ultimo_cerrado(self):
        self.assertEqual(fiscal.ano_por_defecto(["2026", "2025", "2023"], dt.date(2026, 4, 1)), "2025")
        self.assertEqual(fiscal.ano_por_defecto(["2026"], dt.date(2026, 4, 1)), "2026")
        self.assertEqual(fiscal.ano_por_defecto([], dt.date(2026, 4, 1)), "2026")

    def test_suma_meses(self):
        self.assertEqual(fiscal.suma_meses("2025-03-31", -1), "2025-02-28")
        self.assertEqual(fiscal.suma_meses("2025-12-31", 2), "2026-02-28")
        self.assertEqual(fiscal.suma_meses("2024-01-15", -12), "2023-01-15")


class EnLaApp(ConCarpeta):
    def setUp(self):
        super().setUp()
        cfg = cartera([etf("a", nombre="Fondo <b>raro</b>")], [
            mov("2024-01-02", "a", "compra", 10, 1000.5),
            mov("2025-05-05", "a", "venta", 5, 600.25),
        ])
        almacen.guarda(os.path.join(self.carpeta, "cartera.json"), cfg)
        self.parche = mock.patch.object(servidor, "DATOS", self.carpeta)
        self.parche.start()
        self.web = servidor.app.test_client()

    def tearDown(self):
        self.parche.stop()
        super().tearDown()

    def test_endpoint_y_csv(self):
        j = self.web.get("/api/fiscal?ano=2025").get_json()
        self.assertTrue(j["ok"], j)
        self.assertEqual(j["ano"], "2025")
        self.assertEqual(j["ventas"][0]["ganancia"], 100)
        self.assertNotIn("<", j["ventas"][0]["nombre"])
        self.assertIn("Valor de transmisión", j["csv"])
        self.assertIn("600,25", j["csv"])                     # decimales con coma, para Excel en español
        self.assertEqual(self.web.get("/api/fiscal?ano=20x5").status_code, 400)

    def test_todos_juntos_no(self):
        with mock.patch.object(servidor, "modo", lambda: "todos"):
            r = self.web.get("/api/fiscal")
        self.assertEqual(r.status_code, 400)
        self.assertIn("cada persona", r.get_json()["errores"][0])

    def test_no_sale_nada_a_internet(self):
        with mock.patch("app.red.abrir", side_effect=AssertionError("no debería salir a internet")):
            self.assertTrue(self.web.get("/api/fiscal").get_json()["ok"])


class FueraDeLaWebPublicada(ConCarpeta):
    def test_la_web_publicada_no_lo_trae(self):
        with PreciosInventados():
            D = motor.construir(cartera([etf("a")], [mov("2024-01-02", "a", "compra", 10, 1000),
                                                     mov("2025-05-05", "a", "venta", 5, 600)]),
                                self.carpeta, descargar=False)
        html = exportar.pagina(os.path.join(servidor.RAIZ, "app", "web"), D)
        self.assertIn('id="seccionFiscal" hidden', html)    # oculta: sin el editor no se enseña
        self.assertNotIn("window.Editor = {", html)          # el editor (y su servidor) no van en la web
        self.assertNotIn("ventasDetalle", json.dumps(D))     # los datos del panel no llevan el detalle de ventas
