"""Aportaciones periódicas (F-16): una compra al mes con el precio de cada día, solo si la confirmas."""
import datetime as dt
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov, serie_inventada
from app import almacen, periodicas, servidor

HOY = dt.date(2026, 10, 16)
# 10 € hasta junio de 2026 y 12,5 € desde julio (solo días hábiles: los findes no tienen cierre).
SERIE = {**serie_inventada(10, "2025-01-01", "2026-06-30", paso=0), **serie_inventada(12.5, "2026-07-01", "2026-10-16", paso=0)}


def pide(**extra):
    return {"producto": "a", "importe": "200", "dia": "5", "desde": "2026-01-01", "hasta": "2026-10-16", **extra}


class Fechas(ConCarpeta):
    def test_un_dia_de_cada_mes(self):
        self.assertEqual(periodicas.fechas("2026-01-01", "2026-04-30", 5),
                         ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"])

    def test_meses_cortos_y_bordes(self):
        self.assertEqual(periodicas.fechas("2026-01-31", "2026-04-30", 31),
                         ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])
        self.assertEqual(periodicas.fechas("2026-01-06", "2026-03-04", 5), ["2026-02-05"])   # ni el 5-ene ni el 5-mar
        self.assertEqual(periodicas.fechas("2025-12-01", "2026-01-31", 1), ["2025-12-01", "2026-01-01"])


class Plan(ConCarpeta):
    def test_precio_de_cada_dia_y_participaciones(self):
        pl = periodicas.plan(cartera([etf("a")]), pide(), SERIE, HOY)
        self.assertEqual(len(pl["lineas"]), 10)                                 # de enero a octubre
        self.assertEqual(pl["nuevas"], 10)
        ene, sep = pl["lineas"][0], pl["lineas"][8]
        self.assertEqual((ene["precio"], ene["unidades"]), (10, 20))
        self.assertEqual((sep["precio"], sep["unidades"]), (12.5, 16))
        # El 5 de abril de 2026 es domingo: se usa el cierre del viernes 3.
        abr = pl["lineas"][3]
        self.assertEqual((abr["fecha"], abr["fechaPrecio"]), ("2026-04-05", "2026-04-03"))

    def test_las_que_ya_tienes_se_saltan(self):
        cfg = cartera([etf("a")], [mov("2026-03-04", "a", "compra", 20, 199.5),   # la de marzo, un día antes
                                   mov("2026-05-05", "a", "compra", 50, 500)])    # otra compra, de otro importe
        pl = periodicas.plan(cfg, pide(), SERIE, HOY)
        estados = {x["fecha"]: x["estado"] for x in pl["lineas"]}
        self.assertEqual(estados["2026-03-05"], "repetida")
        self.assertEqual(estados["2026-05-05"], "nueva")
        self.assertEqual(pl["nuevas"], 9)

    def test_sin_precio_ese_dia(self):
        pl = periodicas.plan(cartera([etf("a")]), pide(desde="2024-06-01", hasta="2025-02-28"), SERIE, HOY)
        estados = [x["estado"] for x in pl["lineas"]]
        self.assertEqual(estados.count("sinPrecio"), 7)                         # la serie empieza en 2025
        self.assertEqual(pl["nuevas"], 2)

    def test_sin_ningun_precio_lo_dice(self):
        with self.assertRaises(almacen.ErrorValidacion) as e:
            periodicas.plan(cartera([etf("a")]), pide(), {}, HOY)
        self.assertIn("Actualizar precios", e.exception.errores[0])

    def test_producto_a_mano_sin_participaciones(self):
        pl = periodicas.plan(cartera([manual("plan", tipo="pension")]), pide(producto="plan"), {}, HOY)
        self.assertTrue(pl["aMano"])
        self.assertEqual(pl["nuevas"], 10)
        self.assertIsNone(pl["lineas"][0]["unidades"])

    def test_lo_que_no_vale(self):
        cfg = cartera([etf("a"), manual("cuenta", tipo="efectivo")])
        malos = {"futuro": pide(hasta="2026-12-01"), "al_reves": pide(desde="2026-09-01", hasta="2026-08-01"),
                 "dia_0": pide(dia="0"), "dia_32": pide(dia="32"), "dia_raro": pide(dia="5,5"),
                 "importe_0": pide(importe="0"), "cuenta": pide(producto="cuenta"), "no_existe": pide(producto="zz"),
                 "fecha_mala": pide(desde="2026-02-30"), "demasiadas": pide(desde="1950-01-01")}
        for nombre, datos in malos.items():
            with self.subTest(nombre):
                with self.assertRaises(almacen.ErrorValidacion):
                    periodicas.plan(cfg, datos, SERIE, HOY)


class Crear(ConCarpeta):
    def test_anade_solo_las_nuevas_y_se_acuerda(self):
        cfg = cartera([etf("a")], [mov("2026-03-05", "a", "compra", 20, 200)])
        res = periodicas.crear(cfg, pide(), SERIE, HOY)
        self.assertEqual(res, {"anadidas": 9, "saltadas": 1})
        compras = sorted((m for m in cfg["movimientos"] if m["tipo"] == "compra"), key=lambda m: m["fecha"])
        self.assertEqual(len(compras), 10)
        abr = [m for m in compras if m["fecha"] == "2026-04-05"][0]
        self.assertEqual((abr["importe"], abr["unidades"]), (200, 20))
        self.assertIn("estimada con el cierre del 03/04/2026", abr["nota"])
        self.assertEqual(cfg["periodicas"], [{"producto": "a", "importe": 200, "dia": 5, "ultima": "2026-10-05"}])
        with self.assertRaises(almacen.ErrorValidacion):                       # repetirla no duplica nada
            periodicas.crear(cfg, pide(), SERIE, HOY)
        self.assertEqual(len([m for m in cfg["movimientos"] if m["tipo"] == "compra"]), 10)

    def test_olvidar(self):
        cfg = cartera([etf("a")])
        periodicas.crear(cfg, pide(desde="2026-10-01"), SERIE, HOY)
        periodicas.olvidar(cfg, {"producto": "a", "dia": "5"})
        self.assertEqual(cfg["periodicas"], [])
        self.assertEqual(len(cfg["movimientos"]), 1)                            # la compra se queda
        with self.assertRaises(almacen.ErrorValidacion):
            periodicas.olvidar(cfg, {"producto": "a", "dia": 5})


class EnLaApp(ConCarpeta):
    def setUp(self):
        super().setUp()
        almacen.guarda(os.path.join(self.carpeta, "cartera.json"), cartera([etf("a")]))
        self.parches = [mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados({"TEST.DE": SERIE})]
        for p in self.parches:
            p.__enter__()
        self.web = servidor.app.test_client()

    def tearDown(self):
        for p in reversed(self.parches):
            p.__exit__(None, None, None)
        super().tearDown()

    def lee(self):
        with open(os.path.join(self.carpeta, "cartera.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_ver_no_guarda_y_crear_si(self):
        datos = pide(desde="2026-07-01", hasta="2026-09-30")
        r = self.web.post("/api/periodicas/ver", json=datos)
        j = r.get_json()
        self.assertTrue(j["ok"], j)
        self.assertEqual([x["fecha"] for x in j["plan"]["lineas"]], ["2026-07-05", "2026-08-05", "2026-09-05"])
        self.assertEqual(self.lee()["movimientos"], [])                         # mirar no cambia nada
        j = self.web.post("/api/periodicas/crear", json=datos).get_json()
        self.assertTrue(j["ok"], j)
        self.assertEqual(j["item"]["anadidas"], 3)
        self.assertEqual(len(self.lee()["movimientos"]), 3)
        self.assertEqual(len(j["cartera"]["periodicas"]), 1)
        j = self.web.post("/api/periodicas/olvidar", json={"producto": "a", "dia": 5}).get_json()
        self.assertTrue(j["ok"], j)
        self.assertEqual(self.lee()["periodicas"], [])

    def test_un_error_no_deja_nada_a_medias(self):
        r = self.web.post("/api/periodicas/crear", json=pide(hasta="2030-01-01"))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.lee()["movimientos"], [])

    def test_en_todos_juntos_no(self):
        with mock.patch.object(servidor, "modo", lambda: "todos"):
            self.assertNotEqual(self.web.post("/api/periodicas/ver", json=pide()).status_code, 200)
            self.assertNotEqual(self.web.post("/api/periodicas/crear", json=pide()).status_code, 200)
        self.assertEqual(self.lee()["movimientos"], [])
