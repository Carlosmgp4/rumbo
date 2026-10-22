"""Extractos reales de MyInvestor con traspasos (B-01): tres fondos de una persona que sí
hizo traspasos. Los importes van escalados (no son los suyos); fechas, proporciones y
valores liquidativos de Morningstar son los reales, que es lo que decide la detección."""
import glob
import json
import os

from comun import RAIZ, ConCarpeta, PreciosInventados, cartera
from app import importar

CARPETA = os.path.join(RAIZ, "tests", "datos", "myinvestor_traspasos_reales")


def fixture():
    with open(os.path.join(CARPETA, "fondos_y_precios.json"), encoding="utf-8") as f:
        return json.load(f)


def fondo(pid, codigo, isin):
    return {"id": pid, "nombre": pid, "corto": pid, "tipo": "fondo", "fuente": "morningstar",
            "codigo": codigo, "identificador": isin, "moneda": "EUR", "slot": 1, "largoPlazo": True}


class ExtractosReales(ConCarpeta):
    def setUp(self):
        super().setUp()
        fx = fixture()
        self.nombres = {"FR0000447823": "monetario", "IE00BYX5M476": "emergentes", "IE00BYX5NX33": "world"}
        self.cfg = cartera([fondo(self.nombres[f["isin"]], f["codigo"], f["isin"]) for f in fx["fondos"]])
        self.precios = PreciosInventados(fx["series"])
        self.precios.__enter__()
        archivos = sorted(glob.glob(os.path.join(CARPETA, "*.csv")))
        self.archivos = [(os.path.basename(a), open(a, "rb").read()) for a in archivos]
        self.plan = importar.preparar_myinvestor(self.cfg, self.archivos, self.carpeta)

    def tearDown(self):
        self.precios.__exit__(None, None, None)
        super().tearDown()

    def test_detecta_los_traspasos_y_pregunta(self):
        t = {it["ref"]: it for it in self.plan.traspasos_mi}
        self.assertEqual(set(t), {"emergentes", "world"})            # el monetario no tiene traspasos
        self.assertEqual(t["emergentes"]["lotes"], 2)                # los dos lotes del 12-sep-2024
        self.assertEqual(t["world"]["lotes"], 1)                     # solo uno de los dos de ese día
        marcados = [(m["producto"], m["fecha"]) for m in self.plan.movimientos if m.get("_traspaso")]
        self.assertEqual(sorted(marcados), [("emergentes", "2024-09-12"), ("emergentes", "2024-09-12"),
                                            ("world", "2024-09-12")])

    def test_las_participaciones_dan_el_valor_del_extracto(self):
        # Con o sin traspaso, participaciones x valor liquidativo del extracto = valor de mercado.
        fx = fixture()
        for f in fx["fondos"]:
            ref = self.nombres[f["isin"]]
            with self.subTest(fondo=ref):
                contenido = dict(self.archivos)[f["archivo"]]
                lotes, _ = importar.leer_csv_myinvestor(contenido)
                serie = fx["series"]["MS:" + f["codigo"]]
                vl, _ = importar.vl_del_extracto(lotes, serie)
                compras = [m for m in self.plan.movimientos if m["producto"] == ref]
                self.assertEqual(len(compras), len(lotes))
                for m, (fecha, coste, valor) in zip(sorted(compras, key=lambda m: (m["fecha"], m["importe"])),
                                                    sorted(lotes, key=lambda l: (l[0], l[1]))):
                    self.assertAlmostEqual(m["unidades"] * vl / valor, 1, delta=0.01, msg=f"{ref} {fecha} {coste}")

    def test_sin_contestar_se_importa_como_antes(self):
        inf = importar.aplicar(self.cfg, self.plan, None)
        self.assertEqual(len(inf["traspasosMyInvestor"]), 2)
        self.assertFalse(any(t["hecho"] for t in inf["traspasosMyInvestor"]))
        compras = [m for m in self.cfg["movimientos"] if m["tipo"] == "compra"]
        self.assertEqual(len(compras), 4 + 10 + 22)


class TraspasoDesdeElMonetario(ExtractosReales):
    """Ella contestó que los dos traspasos venían del monetario AXA. El extracto del AXA solo trae
    lo que le queda: lo que salió hay que reconstruirlo para que el AXA suba y baje."""
    FECHA = "2025-01-15"

    def contesta(self):
        resp = {it["ref"]: {"origen": "monetario", "fecha": self.FECHA} for it in self.plan.traspasos_mi}
        return importar.aplicar(self.cfg, self.plan, resp)

    def test_crea_los_dos_traspasos_y_reconstruye_el_origen(self):
        inf = self.contesta()
        self.assertTrue(all(t["hecho"] for t in inf["traspasosMyInvestor"]), inf["traspasosMyInvestor"])
        self.assertTrue(all("reconstru" not in (t["error"] or "") for t in inf["traspasosMyInvestor"]))
        rec = [m for m in self.cfg["movimientos"] if m.get("origen") == "myinvestor-traspaso"]
        self.assertEqual(sorted(m["producto"] for m in rec), ["monetario"] * 3)
        self.assertEqual({m["fecha"] for m in rec}, {"2024-09-12"})
        k = fixture()["escala"]
        self.assertEqual(sorted(round(m["importe"] / k) for m in rec), [951, 951, 2864])
        tr = [m for m in self.cfg["movimientos"] if m["tipo"] == "traspaso"]
        self.assertEqual(sorted(m["destino"] for m in tr), ["emergentes", "world"])

    def test_el_monetario_sube_y_baja_y_acaba_como_su_extracto(self):
        from app import almacen
        compras_extracto = sum(m["unidades"] for m in self.plan.movimientos if m["producto"] == "monetario")
        self.contesta()
        antes = almacen.unidades_a(self.cfg, "monetario", "2025-01-14")
        despues = almacen.unidades_a(self.cfg, "monetario", "2025-01-16")
        hoy = almacen.unidades_a(self.cfg, "monetario", "2026-10-19")
        self.assertGreater(antes, despues)                                  # el día del traspaso, baja
        self.assertAlmostEqual(hoy, compras_extracto, places=4)              # y hoy tiene lo del extracto

    def test_reimportar_no_duplica_lo_reconstruido(self):
        self.contesta()
        plan = importar.preparar_myinvestor(self.cfg, self.archivos, self.carpeta)
        resp = {it["ref"]: {"origen": "monetario", "fecha": self.FECHA} for it in plan.traspasos_mi}
        importar.aplicar(self.cfg, plan, resp)
        rec = [m for m in self.cfg["movimientos"] if m.get("origen") == "myinvestor-traspaso"]
        self.assertEqual(len(rec), 3)
        self.assertEqual(len([m for m in self.cfg["movimientos"] if m["tipo"] == "traspaso"]), 2)

    def test_fecha_del_traspaso_anterior_a_la_compra(self):
        resp = {it["ref"]: {"origen": "monetario", "fecha": "2024-09-01"} for it in self.plan.traspasos_mi}
        inf = importar.aplicar(self.cfg, self.plan, resp)
        self.assertTrue(all("anterior a la compra" in (t["error"] or "") for t in inf["traspasosMyInvestor"]))
        self.assertFalse(any(m.get("origen") == "myinvestor-traspaso" for m in self.cfg["movimientos"]))


class FechaPorLote(ExtractosReales):
    """Cada lote puede haberse traspasado otro día, y si no se sabe la fecha, Rumbo la estima."""

    def item(self, ref):
        return next(it for it in self.plan.traspasos_mi if it["ref"] == ref)

    def test_una_fecha_por_lote(self):
        self.assertEqual(len(self.item("emergentes")["detalle"]), 2)
        resp = {"emergentes": {"origen": "monetario", "fechas": ["2026-05-12", "2026-05-29"]},
                "world": {"origen": "monetario", "fechas": ["2026-09-03"]}}
        inf = importar.aplicar(self.cfg, self.plan, resp)
        self.assertTrue(all(t["hecho"] for t in inf["traspasosMyInvestor"]), inf["traspasosMyInvestor"])
        tr = sorted((m["destino"], m["fecha"]) for m in self.cfg["movimientos"] if m["tipo"] == "traspaso")
        self.assertEqual(tr, [("emergentes", "2026-05-12"), ("emergentes", "2026-05-29"), ("world", "2026-09-03")])

    def test_falta_una_fecha_no_vale(self):
        it = self.item("emergentes")
        self.assertIsNone(importar.respuesta_valida(it, {"origen": "monetario", "fechas": ["2026-05-12", ""]}, None))
        r = importar.respuesta_valida(it, {"origen": "monetario", "fecha": "2026-05-12"}, None)   # una sola: para todos
        self.assertEqual(r["fechas"], ["2026-05-12", "2026-05-12"])

    def test_no_la_se_rumbo_la_estima_y_la_marca(self):
        from app import motor
        resp = {"emergentes": {"origen": "monetario", "fechas": ["estimar", "2026-05-29"]},
                "world": {"origen": "monetario", "fechas": ["estimar"]}}
        inf = importar.aplicar(self.cfg, self.plan, resp)
        self.assertTrue(all(t["hecho"] for t in inf["traspasosMyInvestor"]), inf["traspasosMyInvestor"])
        self.assertTrue(any("Fecha estimada" in (t["aviso"] or "") for t in inf["traspasosMyInvestor"]))
        tr = [m for m in self.cfg["movimientos"] if m["tipo"] == "traspaso"]
        self.assertEqual(sum(1 for m in tr if m.get("fechaEstimada")), 2)
        self.assertTrue(all(m["fecha"] >= "2024-09-12" for m in tr))
        est, _, _ = motor.fifo_cartera(self.cfg)
        marcas = [t["estimada"] for t in est["monetario"]["traspasos"]]
        self.assertEqual(sorted(marcas), [False, True, True])      # la ficha sabe cuál es estimada

    def test_estimar_con_precios_inventados(self):
        # Origen a 10 € fijo; el destino vale 20 € hasta el 1-mar y 25 € desde entonces. Un lote de 1.000 €
        # (100 participaciones de origen = 1.000 €) que hoy son 40 participaciones de destino: solo cuadra a 25 €.
        serie_o = {f"2025-{m:02d}-01": 10.0 for m in range(1, 13)}
        serie_d = {**{f"2025-{m:02d}-01": 20.0 for m in (1, 2)}, **{f"2025-{m:02d}-01": 25.0 for m in range(3, 13)}}
        self.assertEqual(importar.estima_fecha(serie_o, serie_d, ["2025-01-01", 1000, 40]), "2025-03-01")
        self.assertIsNone(importar.estima_fecha({}, serie_d, ["2025-01-01", 1000, 40]))
