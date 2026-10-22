"""Traspasos que llegan en el CSV de MyInvestor: se pregunta de qué fondo venían y se convierten
en un traspaso de verdad, para que el dinero no cuente dos veces (B-01)."""
import io
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, mov, serie_inventada
from app import almacen, importar, motor, servidor


def fondo(pid, codigo, isin):
    return {"id": pid, "nombre": pid.upper(), "corto": pid.upper(), "tipo": "fondo", "fuente": "morningstar",
            "codigo": codigo, "identificador": isin, "moneda": "EUR", "slot": 1, "largoPlazo": True}


# El fondo B valía 8 en 2020, 10 en 2023-24 (11 el 1-feb-2024) y 12 desde sep-2024 (el día del extracto).
SERIE_B = {**serie_inventada(10, "2023-01-02", "2024-08-30", paso=0), "2020-03-02": 8.0, "2024-02-01": 11.0,
           **serie_inventada(12, "2024-09-02", paso=0)}
SERIE_A = {**serie_inventada(8, "2019-01-02", "2022-12-30", paso=0), **serie_inventada(10, "2023-01-02", paso=0)}
PRECIOS = {"MS:0PB": SERIE_B, "MS:0PA": SERIE_A}

# Extracto de B: un lote que viene de un traspaso (fecha y coste del fondo A: 3.000 € de 2020,
# que hoy son 400 participaciones de B) y dos compras normales.
CSV_B = """Fecha fiscal;Inversión;Valor de mercado;Resultado fiscal
02/03/2020;3000;4800;1800
02/01/2024;1000;1200;200
01/02/2024;550;600;50
"""
ARCHIVO_B = "Plusvalías y minusvalías fondo IE00BBBBBBB2.csv"


class ConvertirTraspaso(ConCarpeta):
    def setUp(self):
        super().setUp()
        # El fondo A se importó antes de MyInvestor (375 participaciones a 8 €) y luego se traspasó entero.
        self.cfg = cartera([fondo("a", "0PA", "IE00AAAAAAA1"), fondo("b", "0PB", "IE00BBBBBBB2")],
                           [mov("2020-03-02", "a", "compra", 375, 3000, mid="m1", origen="myinvestor")])
        self.precios = PreciosInventados(PRECIOS)
        self.precios.__enter__()

    def tearDown(self):
        self.precios.__exit__(None, None, None)
        super().tearDown()

    def importa(self, respuestas=None, cfg=None):
        cfg = cfg or self.cfg
        plan = importar.preparar_myinvestor(cfg, [(ARCHIVO_B, CSV_B.encode())], self.carpeta)
        return plan, importar.aplicar(cfg, plan, respuestas)

    def panel(self):
        return motor.construir(self.cfg, self.carpeta, descargar=False)

    def test_sin_respuesta_se_pregunta_y_queda_como_antes(self):
        _, inf = self.importa()
        t = inf["traspasosMyInvestor"]
        self.assertEqual(len(t), 1)
        self.assertEqual((t[0]["ref"], t[0]["lotes"], t[0]["coste"], t[0]["hecho"]), ("b", 1, 3000, False))
        self.assertAlmostEqual(t[0]["unidades"], 400)
        self.assertIn({"id": "a", "nombre": "A"}, t[0]["origenes"])
        self.assertNotIn("b", [o["id"] for o in t[0]["origenes"]])
        compras_b = [m for m in self.cfg["movimientos"] if m["producto"] == "b"]
        self.assertEqual(len(compras_b), 3)                      # como en la 1.2: el lote entra como compra

    def test_con_respuesta_es_un_traspaso_y_no_cuenta_doble(self):
        _, inf = self.importa({"b": {"origen": "a", "fecha": "2023-06-01"}})
        t = inf["traspasosMyInvestor"][0]
        self.assertTrue(t["hecho"], t)
        self.assertIsNone(t["aviso"])
        traspasos = [m for m in self.cfg["movimientos"] if m["tipo"] == "traspaso"]
        self.assertEqual(len(traspasos), 1)
        tr = traspasos[0]
        self.assertEqual((tr["producto"], tr["destino"], tr["fecha"], tr["origen"]), ("a", "b", "2023-06-01", "myinvestor"))
        self.assertAlmostEqual(tr["unidades"], 375)               # sale todo A
        self.assertAlmostEqual(tr["unidadesDestino"], 400)
        self.assertAlmostEqual(tr["importe"], 4000)               # 400 a 10 € el día del traspaso
        self.assertEqual(len([m for m in self.cfg["movimientos"] if m["producto"] == "b"]), 2)
        D = self.panel()
        a = next(p for p in D["productos"] if p["id"] == "a")
        b = next(p for p in D["productos"] if p["id"] == "b")
        self.assertEqual(a["valor"], 0)
        self.assertAlmostEqual(b["participaciones"], 550)
        self.assertAlmostEqual(b["aportado"], 4550)               # 3.000 heredados + 1.000 + 550
        self.assertAlmostEqual(D["total"]["aportado"], 4550)      # antes contaba 7.550
        self.assertAlmostEqual(D["total"]["patrimonio"], 550 * 12)
        self.assertEqual(D["total"]["realizado"], 0)

    def test_reimportar_recuerda_la_respuesta_y_no_duplica(self):
        self.importa({"b": {"origen": "a", "fecha": "2023-06-01"}})
        plan, inf = self.importa({"b": {"origen": "a", "fecha": "2023-06-01"}})
        self.assertEqual(plan.traspasos_mi[0]["sugerencia"], {"origen": "a", "fecha": "2023-06-01"})
        self.assertEqual(len([m for m in self.cfg["movimientos"] if m["tipo"] == "traspaso"]), 1)
        self.assertEqual(len([m for m in self.cfg["movimientos"] if m["producto"] == "b"]), 2)
        self.assertEqual(inf["sustituidos"], 3)                   # 2 compras + el traspaso anterior

    def test_traspaso_parcial_saca_lo_mas_antiguo(self):
        cfg = cartera([fondo("a", "0PA", "IE00AAAAAAA1"), fondo("b", "0PB", "IE00BBBBBBB2")],
                      [mov("2019-03-01", "a", "compra", 250, 2000, mid="m1"),     # coste 8 €
                       mov("2020-03-02", "a", "compra", 125, 1000, mid="m2"),
                       mov("2021-03-01", "a", "compra", 100, 800, mid="m3")])
        csv = CSV_B.replace("02/03/2020;3000;4800;1800", "01/03/2019;2000;3200;1200")
        plan = importar.preparar_myinvestor(cfg, [(ARCHIVO_B, csv.encode())], self.carpeta)
        importar.aplicar(cfg, plan, {"b": {"origen": "a", "fecha": "2023-06-01"}})
        tr = next(m for m in cfg["movimientos"] if m["tipo"] == "traspaso")
        self.assertAlmostEqual(tr["unidades"], 250)              # solo el lote de 2019 (2.000 €)
        self.assertAlmostEqual(almacen.unidades_a(cfg, "a", "2024-01-01"), 225)

    def test_el_origen_no_tenia_nada_ese_dia(self):
        _, inf = self.importa({"b": {"origen": "a", "fecha": "2019-06-01"}})
        t = inf["traspasosMyInvestor"][0]
        self.assertFalse(t["hecho"])
        self.assertIn("anterior a la compra", t["error"])   # el traspaso no puede ser antes de comprar
        self.assertEqual(len([m for m in self.cfg["movimientos"] if m["producto"] == "b"]), 3)   # no se pierde nada

    def test_avisa_si_el_coste_no_cuadra(self):
        cfg = cartera([fondo("a", "0PA", "IE00AAAAAAA1"), fondo("b", "0PB", "IE00BBBBBBB2")],
                      [mov("2020-03-02", "a", "compra", 250, 2000, mid="m1")])   # en Rumbo solo 2.000 €
        plan = importar.preparar_myinvestor(cfg, [(ARCHIVO_B, CSV_B.encode())], self.carpeta)
        inf = importar.aplicar(cfg, plan, {"b": {"origen": "a", "fecha": "2023-06-01"}})
        self.assertIn("Revisa que esté completo", inf["traspasosMyInvestor"][0]["aviso"])

    def test_no_vale_el_propio_fondo_ni_una_fecha_rara(self):
        _, inf = self.importa({"b": {"origen": "b", "fecha": "2023-06-01"}})
        self.assertIn("distinto", inf["traspasosMyInvestor"][0]["error"])
        _, inf = self.importa({"b": {"origen": "a", "fecha": "ayer"}})
        self.assertFalse(inf["traspasosMyInvestor"][0]["hecho"])
        self.assertIsNone(inf["traspasosMyInvestor"][0]["error"])   # sin fecha válida: sigue preguntando

    def test_la_vista_previa_no_toca_nada(self):
        antes = json.dumps(self.cfg, sort_keys=True)
        plan = importar.preparar_myinvestor(self.cfg, [(ARCHIVO_B, CSV_B.encode())], self.carpeta)
        importar.vista_previa(self.cfg, plan, {"b": {"origen": "a", "fecha": "2023-06-01"}})
        self.assertEqual(json.dumps(self.cfg, sort_keys=True), antes)


class EnLaApp(ConCarpeta):
    def test_previsualizar_revisar_y_confirmar(self):
        cfg = cartera([fondo("a", "0PA", "IE00AAAAAAA1"), fondo("b", "0PB", "IE00BBBBBBB2")],
                      [mov("2020-03-02", "a", "compra", 375, 3000, mid="m1")])
        with mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados(PRECIOS):
            almacen.guarda(os.path.join(self.carpeta, "cartera.json"), cfg)
            web = servidor.app.test_client()
            r = web.post("/api/importar/previsualizar", content_type="multipart/form-data",
                         data={"origen": "myinvestor", "archivos": (io.BytesIO(CSV_B.encode()), ARCHIVO_B)})
            j = r.get_json()
            self.assertTrue(j["ok"], j)
            self.assertFalse(j["informe"]["traspasosMyInvestor"][0]["hecho"])
            resp = {"b": {"origen": "a", "fecha": "2023-06-01"}}
            j2 = web.post("/api/importar/revisar", json={"token": j["token"], "respuestas": resp}).get_json()
            self.assertTrue(j2["informe"]["traspasosMyInvestor"][0]["hecho"])
            self.assertEqual(web.get("/api/cartera").get_json()["cartera"]["movimientos"][0]["tipo"], "compra")  # aún nada
            j3 = web.post("/api/importar/confirmar", json={"token": j["token"], "respuestas": resp}).get_json()
            self.assertTrue(j3["ok"], j3)
            self.assertEqual(j3["informe"]["traspasos"], 1)
            tipos = sorted(m["tipo"] for m in web.get("/api/cartera").get_json()["cartera"]["movimientos"])
            self.assertEqual(tipos, ["compra", "compra", "compra", "traspaso"])


class Deteccion(ConCarpeta):
    def test_lote_anterior_a_la_historia_del_fondo_es_un_traspaso(self):
        # Un fondo no se puede comprar antes de existir: ese lote viene de otro fondo.
        serie = {"2022-01-03": 10.0, "2024-01-02": 10.0, "2024-09-02": 12.0}
        lotes = [["2019-05-06", 2000.0, 3000.0], ["2024-01-02", 1000.0, 1200.0]]
        movs, sin_vl, traspasos = importar.myinvestor_a_movimientos("f", lotes, [], serie)
        self.assertEqual((sin_vl, traspasos), (0, 1))
        self.assertTrue(movs[0]["_traspaso"])
        self.assertAlmostEqual(movs[0]["unidades"], 250)          # valor de mercado / VL del extracto

    def test_hueco_de_precios_no_es_traspaso(self):
        serie = {"2022-01-03": 10.0, "2024-01-02": 10.0, "2024-09-02": 12.0}
        lotes = [["2023-05-05", 100.0, 120.0], ["2024-01-02", 1000.0, 1200.0]]
        _, sin_vl, traspasos = importar.myinvestor_a_movimientos("f", lotes, [], serie)
        self.assertEqual((sin_vl, traspasos), (1, 0))
