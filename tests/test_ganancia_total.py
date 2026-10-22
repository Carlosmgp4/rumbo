"""Ganancia total de cada producto: precio + ventas + dividendos − comisiones (F-10)."""
from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov, serie_inventada
from app import exportar, motor
from test_traspasos import traspaso

# 10 € hasta mayo de 2025 y 12 € desde junio.
PRECIOS = {"TEST.DE": {**serie_inventada(10, "2024-12-02", "2025-05-31", paso=0),
                       **serie_inventada(12, "2025-06-01", paso=0)}}


class GananciaTotal(ConCarpeta):
    def construye(self, productos, movimientos, valoraciones=()):
        with PreciosInventados(PRECIOS):
            D = motor.construir(cartera(productos, movimientos, valoraciones), self.carpeta, descargar=False)
        return D, {p["id"]: p for p in D["productos"]}

    def test_venta_parcial_dividendo_y_comision(self):
        D, p = self.construye([etf("a")], [
            mov("2025-01-02", "a", "compra", 100, 1000),
            mov("2025-03-03", "a", "compra", 50, 500),
            mov("2025-07-01", "a", "venta", 60, 720),      # FIFO: 60 de los primeros, a 10 -> +120
            mov("2025-08-01", "a", "dividendo", 0, 30),
            mov("2025-09-01", "a", "comision", 0, 5),      # custodia, aparte de una compra
        ])
        a = p["a"]
        self.assertEqual(a["aportado"], 900)               # 40 + 50 que quedan, a 10
        self.assertEqual(a["valor"], 1080)                 # 90 a 12
        self.assertEqual(a["plusvalia"], 180)              # solo el precio
        self.assertEqual(a["cobros"], {"ventas": 120, "dividendos": 30, "gastos": 5})
        self.assertEqual(a["realizado"], 145)
        self.assertEqual(a["costeVendido"], 600)
        self.assertEqual(a["gananciaTotal"], 325)          # 180 + 120 + 30 - 5
        self.assertAlmostEqual(a["rentabilidadTotal"], 325 / 1500, places=4)   # sobre 900 + 600
        # Lo mismo que lo que entra y sale de tu cuenta: 720 + 30 - 5 + 1080 - (1000 + 500)
        self.assertAlmostEqual(a["gananciaTotal"], sum(v for _, v in a["flujos"]) + a["valor"], places=2)
        self.assertEqual(D["total"]["realizado"], 145)

    def test_ya_vendido_del_todo(self):
        _, p = self.construye([etf("a")], [
            mov("2025-01-02", "a", "compra", 100, 1000),
            mov("2025-02-03", "a", "dividendo", 0, 50),
            mov("2025-07-01", "a", "venta", 100, 1200),
        ])
        a = p["a"]
        self.assertIsNone(a["plusvalia"])                  # ya no tienes nada
        self.assertEqual(a["gananciaTotal"], 250)          # pero ganaste 200 + 50
        self.assertAlmostEqual(a["rentabilidadTotal"], 0.25, places=4)

    def test_sin_cobros_es_la_plusvalia(self):
        _, p = self.construye([etf("a")], [mov("2025-01-02", "a", "compra", 100, 1000)])
        a = p["a"]
        self.assertEqual(a["gananciaTotal"], a["plusvalia"])
        self.assertEqual(a["rentabilidadTotal"], a["rentabilidad"])
        self.assertEqual(a["cobros"], {"ventas": 0, "dividendos": 0, "gastos": 0})

    def test_sin_saber_lo_aportado_no_se_inventa(self):
        _, p = self.construye([manual("piso")], [], [{"fecha": "2025-01-31", "producto": "piso", "valor": 200000}])
        self.assertIsNone(p["piso"]["gananciaTotal"])
        self.assertIsNone(p["piso"]["rentabilidadTotal"])

    def test_un_traspaso_no_cuenta_dos_veces(self):
        _, p = self.construye([etf("a"), etf("b", "OTRO.DE")], [
            mov("2025-01-02", "a", "compra", 100, 1000),
            traspaso("2025-03-03", "a", "b", 100, 1000, 40, total=True),
        ])
        self.assertIsNone(p["a"]["gananciaTotal"])          # lo que ganes ahora está en el destino
        self.assertEqual(p["b"]["costeVendido"], 0)
        self.assertEqual(p["b"]["gananciaTotal"], p["b"]["plusvalia"])
        self.assertEqual(p["b"]["aportado"], 1000)          # el coste viaja con el traspaso

    def test_la_web_publicada_no_lleva_los_euros(self):
        D, p = self.construye([etf("a")], [
            mov("2025-01-02", "a", "compra", 100, 1000),
            mov("2025-07-01", "a", "venta", 60, 720),
            mov("2025-08-01", "a", "dividendo", 0, 30),
        ])
        web = {x["id"]: x for x in exportar.sin_importes(D)["productos"]}["a"]
        k = web["valor"] / p["a"]["valor"]
        self.assertNotAlmostEqual(k, 1.0, places=3)
        for campo in ("gananciaTotal", "costeVendido"):
            self.assertAlmostEqual(web[campo], p["a"][campo] * k, places=1)
        self.assertAlmostEqual(web["cobros"]["dividendos"], 30 * k, places=1)
        self.assertEqual(web["rentabilidadTotal"], p["a"]["rentabilidadTotal"])   # el % no delata nada
