"""Arreglos de la 2.0 pedidos en los comentarios: objetivo, vender todo, intereses de cuentas y pérdidas vendidas."""
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov, serie_inventada
from app import almacen, motor, servidor


class Objetivo(ConCarpeta):
    def test_cartera_nueva_sin_objetivo_de_100k(self):
        self.assertFalse(almacen.CARTERA_VACIA["objetivo"]["activo"])
        self.assertIsNone(motor.objetivo_propio(cartera()))

    def test_los_100k_de_fabrica_de_carteras_viejas_no_cuentan(self):
        cfg = cartera()
        cfg["objetivo"] = {"activo": True, "importe": 100000, "etiqueta": "Próximo objetivo"}
        self.assertIsNone(motor.objetivo_propio(cfg))
        cfg["objetivo"] = {"activo": True, "importe": 30000, "etiqueta": "Próximo objetivo"}
        self.assertEqual(motor.objetivo_propio(cfg)["importe"], 30000)

    def test_elegir_tu_objetivo(self):
        cfg = cartera()
        almacen.guarda_objetivo(cfg, {"activo": True, "importe": "100.000", "etiqueta": "Libertad"})
        o = motor.objetivo_propio(cfg)
        self.assertEqual((o["importe"], o["etiqueta"]), (100000, "Libertad"))   # elegido: sí cuenta
        almacen.guarda_objetivo(cfg, {"activo": False})
        self.assertIsNone(motor.objetivo_propio(cfg))
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_objetivo(cfg, {"activo": True, "importe": ""})


class VenderTodo(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.cfg = cartera([etf("a")], [mov("2024-01-02", "a", "compra", 12.3456789, 1000)])

    def test_ultimos_decimales_no_impiden_venderlo_todo(self):
        m = almacen.guarda_movimiento(self.cfg, {"producto": "a", "tipo": "venta", "fecha": "2024-06-03",
                                                 "unidades": "12,3457", "importe": "1100"})
        self.assertAlmostEqual(m["unidades"], 12.3456789, places=8)
        self.assertAlmostEqual(almacen.unidades_a(self.cfg, "a", "2024-06-03"), 0.0, places=9)

    def test_vender_de_mas_sigue_siendo_error(self):
        with self.assertRaises(almacen.ErrorValidacion) as e:
            almacen.guarda_movimiento(self.cfg, {"producto": "a", "tipo": "venta", "fecha": "2024-06-03",
                                                 "unidades": "12,4", "importe": "1100"})
        self.assertIn("12,3456789", e.exception.errores[0])
        self.assertIn("Todas", e.exception.errores[0])

    def test_api_de_unidades(self):
        with mock.patch.object(servidor, "DATOS", self.carpeta):
            almacen.guarda(f"{self.carpeta}/cartera.json", self.cfg)
            web = servidor.app.test_client()
            j = web.get("/api/unidades?producto=a&fecha=2024-03-01").get_json()
            self.assertAlmostEqual(j["unidades"], 12.3456789)
            self.assertEqual(web.get("/api/unidades?producto=zz&fecha=2024-03-01").status_code, 404)


class InteresesDeCuentas(ConCarpeta):
    def test_una_cuenta_admite_intereses_y_nada_mas(self):
        cfg = cartera([manual("cuenta", tipo="efectivo")])
        m = almacen.guarda_movimiento(cfg, {"producto": "cuenta", "tipo": "dividendo", "fecha": "2025-01-31",
                                            "importe": "12,50"})
        self.assertEqual(m["importe"], 12.5)
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {"producto": "cuenta", "tipo": "compra", "fecha": "2025-01-31",
                                            "importe": "100"})

    def test_los_intereses_salen_en_rendimiento_sin_tocar_el_saldo(self):
        cfg = cartera([manual("cuenta", tipo="efectivo")],
                      [mov("2025-01-31", "cuenta", "dividendo", 0, 12.5), mov("2025-02-28", "cuenta", "dividendo", 0, 11)],
                      [{"id": "v1", "producto": "cuenta", "fecha": "2025-01-01", "valor": 5000},
                       {"id": "v2", "producto": "cuenta", "fecha": "2025-03-01", "valor": 5023.5}])
        with PreciosInventados():
            datos = motor.construir(cfg, self.carpeta, descargar=False)
        self.assertEqual(datos["total"]["patrimonio"], 5023.5)
        self.assertEqual(datos["dividendos"]["total"], 23.5)
        self.assertEqual(datos["dividendos"]["porProducto"][0]["id"], "cuenta")

    def test_deuda_sigue_sin_movimientos(self):
        cfg = cartera([manual("hipoteca", tipo="deuda")])
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {"producto": "hipoteca", "tipo": "dividendo", "fecha": "2025-01-31",
                                            "importe": "10"})


class PerdidaVendida(ConCarpeta):
    def test_la_minusvalia_de_lo_vendido_cuenta_en_el_total(self):
        # Compras en marzo y vendes en septiembre con pérdida (caso de JuanGarcia).
        precios = {"TEST.DE": {**serie_inventada(10, "2025-01-01", "2025-06-30", paso=0),
                               **serie_inventada(8, "2025-07-01", paso=0)}}
        cfg = cartera([etf("a")], [mov("2025-03-03", "a", "compra", 100, 1000),
                                   mov("2025-09-01", "a", "venta", 100, 800)])
        with PreciosInventados(precios):
            datos = motor.construir(cfg, self.carpeta, descargar=False)
        self.assertEqual(datos["productos"][0]["realizado"], -200)
        self.assertEqual(datos["total"]["realizado"], -200)
        self.assertLess(datos["total"]["tir"], 0)


class RepartoObjetivo(ConCarpeta):
    def test_guardar_y_validar(self):
        cfg = cartera()
        o = almacen.guarda_reparto(cfg, {"por": "clase", "pesos": {"Renta variable": "80", "Renta fija": "20,0", "Oro": ""}})
        self.assertEqual(o["pesos"], {"Renta variable": 80, "Renta fija": 20})
        self.assertEqual((o["vigilar"], o["rebalancear"]), (3, 5))
        self.assertEqual(motor.reparto_objetivo(cfg)["pesos"]["Renta fija"], 20)
        with self.assertRaises(almacen.ErrorValidacion) as e:
            almacen.guarda_reparto(cfg, {"pesos": {"A": "70", "B": "20"}})
        self.assertIn("suman 90", e.exception.errores[0])
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_reparto(cfg, {"pesos": {"A": "100"}, "vigilar": "6", "rebalancear": "4"})
        almacen.guarda_reparto(cfg, {"borrar": True})
        self.assertIsNone(motor.reparto_objetivo(cfg))

    def test_productos_que_cuentan_a_mano(self):
        cfg = cartera()
        o = almacen.guarda_reparto(cfg, {"pesos": {"Renta variable": "100"}, "cuenta": {"bitcoin": False, "cuenta": 1}})
        self.assertEqual(o["cuenta"], {"bitcoin": False, "cuenta": True})
        self.assertEqual(motor.reparto_objetivo(cfg)["cuenta"], {"bitcoin": False, "cuenta": True})
        o = almacen.guarda_reparto(cfg, {"pesos": {"Renta variable": "100"}, "cuenta": "basura"})
        self.assertNotIn("cuenta", o)
        self.assertEqual(motor.reparto_objetivo(cfg)["cuenta"], {})


class FondoDeEmergencia(ConCarpeta):
    def test_en_meses_o_importe_fijo(self):
        cfg = cartera()
        almacen.guarda_colchon(cfg, {"modo": "meses", "meses": "6", "gastoMensual": "2.000"})
        self.assertEqual(motor.colchon(cfg), {"modo": "meses", "meses": 6, "gastoMensual": 2000, "importe": 12000})
        almacen.guarda_colchon(cfg, {"modo": "importe", "importe": "10.000"})
        self.assertEqual(motor.colchon(cfg)["importe"], 10000)
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_colchon(cfg, {"modo": "meses", "meses": "", "gastoMensual": "2000"})
        almacen.guarda_colchon(cfg, {"borrar": True})
        self.assertIsNone(motor.colchon(cfg))

    def test_marcar_un_producto_como_liquidez(self):
        cfg = cartera()
        p, _ = almacen.guarda_producto(cfg, {"nombre": "Monetario", "tipo": "fondo", "fuente": "manual", "liquidez": True})
        self.assertIs(p["liquidez"], True)
        p, _ = almacen.guarda_producto(cfg, {"id": p["id"], "nombre": "Monetario", "tipo": "fondo", "fuente": "manual",
                                             "liquidez": False})
        self.assertIs(p["liquidez"], False)

    def test_la_web_sin_importes_no_lleva_tu_gasto(self):
        from app import exportar
        datos = {"total": {"hitos": []}, "colchon": {"modo": "meses", "meses": 6, "gastoMensual": 2000, "importe": 12000}}
        out = exportar.sin_importes(datos)
        self.assertNotEqual(out["colchon"]["gastoMensual"], 2000)
        self.assertEqual(out["colchon"]["meses"], 6)


class Issue6SinPrecioDeMercado(ConCarpeta):
    """Issue #6: una acción comprada y vendida en 2025 cuyos precios en Yahoo empiezan en oct-2026.
    Decía «aún no lo tenías» en 2025 y «en cartera desde el 1 oct» en 2026."""

    def construye(self, precios):
        cfg = cartera([etf("app", "APP", tipo="accion")],
                      [mov("2025-03-03", "app", "compra", 100, 1000, mid="m1"), mov("2025-09-01", "app", "venta", 100, 1200, mid="m2")])
        with PreciosInventados(precios):
            return motor.construir(cfg, self.carpeta, descargar=False)

    def test_con_precios_solo_despues(self):
        D = self.construye({"APP": serie_inventada(50, "2026-10-01", paso=0)})
        ra = D["rentabilidadAnual"]
        fila = dict(zip(ra["anos"], ra["porProducto"]["app"]))
        vendido = dict(zip(ra["anos"], ra["vendido"]["app"]))
        self.assertAlmostEqual(fila["2025"], 0.20, places=2)       # de 10 a 12: lo que ganaste ese año
        self.assertIsNone(fila["2026"])
        self.assertTrue(vendido["2026"])                          # «ya lo habías vendido», no «en cartera»
        p = D["productos"][0]
        self.assertEqual(p["realizado"], 200)
        self.assertEqual(p["valor"], 0)
        self.assertTrue(any("no tiene precios antes del 01/10/2026" in a for a in D["avisos"]))

    def test_sin_ningun_precio_ya_no_desaparece(self):
        D = self.construye({"APP": {}})
        self.assertEqual([p["id"] for p in D["productos"]], ["app"])   # antes se quedaba fuera (y su ganancia)
        self.assertEqual(D["total"]["realizado"], 200)
        self.assertTrue(any("lo valoro al precio de tus compras y ventas" in a for a in D["avisos"]))

    def test_con_precios_normales_no_cambia_nada(self):
        D = self.construye({"APP": serie_inventada(10, "2024-01-02", paso=0)})
        self.assertEqual(D["avisos"], [])
        self.assertNotIn("preciosDeOperaciones", D["productos"][0])
