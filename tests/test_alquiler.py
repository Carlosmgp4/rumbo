"""Inmuebles con alquiler (F-17): lo cobrado y los gastos, su rentabilidad y su sitio en la Renta."""
import datetime as dt

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov
from app import exportar, fiscal, motor


def piso_alquilado(con_etf=True):
    """Un piso alquilado (y un ETF). Sin el ETF, los datos se valoran al 31-12-2025 (su último valor anotado)."""
    rentas = [mov(f"2025-{m:02d}-05", "piso", "dividendo", 0, 800, mid=f"r{m}") for m in range(1, 13)]
    rentas.append(mov("2024-12-05", "piso", "dividendo", 0, 750, mid="r0"))   # el año anterior
    cfg = cartera([manual("piso"), etf("a")], rentas + [
        mov("2025-03-01", "piso", "comision", 0, 600, mid="g1"),                # IBI
        mov("2025-06-01", "piso", "comision", 0, 1200, mid="g2"),               # comunidad del año
        mov("2025-01-02", "a", "compra", 10, 1000, mid="c1"),
        mov("2025-02-03", "a", "dividendo", 0, 12, mid="d1"),
    ], [
        {"id": "v1", "fecha": "2024-01-31", "producto": "piso", "valor": 200000, "aportado": 180000},
        {"id": "v2", "fecha": "2025-12-31", "producto": "piso", "valor": 210000, "aportado": 180000},
    ])
    if not con_etf:
        cfg["productos"] = [x for x in cfg["productos"] if x["id"] != "a"]
        cfg["movimientos"] = [m for m in cfg["movimientos"] if m["producto"] != "a"]
    return cfg


class Alquiler(ConCarpeta):
    def test_cuentas_del_alquiler(self):
        movs = piso_alquilado()["movimientos"]
        al = motor.alquiler([m for m in movs if m["producto"] == "piso"], dt.date(2025, 12, 31))
        self.assertEqual(al, {"cobrado": 10350, "gastos": 1800, "cobrado12": 9600, "gastos12": 1800})
        self.assertIsNone(motor.alquiler([], dt.date(2025, 12, 31)))

    def test_en_la_ficha(self):
        with PreciosInventados():
            D = motor.construir(piso_alquilado(con_etf=False), self.carpeta, descargar=False)
        self.assertEqual(D["fechaExtracto"], "2025-12-31")
        piso = {x["id"]: x for x in D["productos"]}["piso"]
        self.assertEqual(piso["alquiler"]["cobrado12"], 9600)
        self.assertEqual(piso["alquiler"]["gastos12"], 1800)
        self.assertEqual(piso["plusvalia"], 30000)
        self.assertEqual(piso["gananciaTotal"], 30000 + 10350 - 1800)     # valor + rentas - gastos

    def test_los_12_meses_cuentan_hasta_la_fecha_de_los_datos(self):
        with PreciosInventados():   # el ETF tiene precios hasta hoy: los datos se valoran a hoy
            D = motor.construir(piso_alquilado(), self.carpeta, descargar=False)
        p = {x["id"]: x for x in D["productos"]}
        hace_un_ano = (dt.date.fromisoformat(D["fechaExtracto"]) - dt.timedelta(days=365)).isoformat()
        esperado = sum(m["importe"] for m in piso_alquilado()["movimientos"]
                       if m["producto"] == "piso" and m["tipo"] == "dividendo" and m["fecha"] > hace_un_ano)
        self.assertEqual(p["piso"]["alquiler"]["cobrado12"], esperado)
        self.assertNotIn("alquiler", p["a"])                              # solo en inmuebles

    def test_la_web_publicada_escala_el_alquiler(self):
        with PreciosInventados():
            D = motor.construir(piso_alquilado(con_etf=False), self.carpeta, descargar=False)
        piso = {x["id"]: x for x in D["productos"]}["piso"]
        web = {x["id"]: x for x in exportar.sin_importes(D)["productos"]}["piso"]
        k = web["valor"] / piso["valor"]
        self.assertAlmostEqual(web["alquiler"]["cobrado12"], 9600 * k, places=1)
        # la rentabilidad del alquiler (cobrado / valor) es la misma: no delata nada
        self.assertAlmostEqual(web["alquiler"]["cobrado12"] / web["valor"], 9600 / 210000, places=6)


class EnLaRenta(ConCarpeta):
    def test_alquileres_aparte_de_dividendos_y_comisiones(self):
        inf = fiscal.informe(piso_alquilado(), "2025")
        t = inf["totales"]
        self.assertEqual(t["alquileres"], 9600)
        self.assertEqual(t["gastosAlquiler"], 1800)
        self.assertEqual(t["dividendos"], 12)
        self.assertEqual(t["comisiones"], 0)                               # los gastos del piso no son comisiones
        self.assertEqual({x["clase"] for x in inf["cobros"]}, {"Alquileres", "Dividendos y cupones"})
        self.assertTrue(any("capital inmobiliario" in a for a in inf["avisos"]))
        csv = fiscal.csv_texto(inf)
        self.assertIn("Gastos de inmuebles anotados", csv)
        self.assertIn("1800,00", csv)

    def test_solo_alquiler_no_avisa_de_retenciones_de_dividendos(self):
        cfg = piso_alquilado()
        cfg["movimientos"] = [m for m in cfg["movimientos"] if m["producto"] == "piso"]
        avisos = fiscal.informe(cfg, "2025")["avisos"]
        self.assertFalse(any("importe bruto" in a for a in avisos), avisos)


class InteresesDeCuentas(ConCarpeta):
    """Los intereses de una cuenta (movimientos «dividendo» en un producto de efectivo) son dinero ya cobrado."""

    def cuenta_con_intereses(self):
        return cartera([manual("cuenta", tipo="efectivo")], [
            mov("2025-06-30", "cuenta", "dividendo", 0, 40, mid="i1"),
            mov("2025-12-31", "cuenta", "dividendo", 0, 60, mid="i2"),
            mov("2025-12-31", "cuenta", "comision", 0, 5, mid="g1"),
        ], [
            {"id": "v1", "fecha": "2025-01-31", "producto": "cuenta", "valor": 10000},
            {"id": "v2", "fecha": "2025-12-31", "producto": "cuenta", "valor": 10100},
        ])

    def test_cuentan_como_cobrado(self):
        with PreciosInventados():
            D = motor.construir(self.cuenta_con_intereses(), self.carpeta, descargar=False)
        cuenta = {x["id"]: x for x in D["otrosActivos"]}["cuenta"]
        self.assertEqual(cuenta["intereses"]["cobrado12"], 100)
        self.assertEqual(cuenta["realizado"], 95)
        self.assertEqual(D["total"]["realizado"], 95)

    def test_la_web_publicada_los_escala(self):
        with PreciosInventados():
            D = motor.construir(self.cuenta_con_intereses(), self.carpeta, descargar=False)
        web = {x["id"]: x for x in exportar.sin_importes(D)["otrosActivos"]}["cuenta"]
        orig = {x["id"]: x for x in D["otrosActivos"]}["cuenta"]
        k = web["valor"] / orig["valor"]
        self.assertAlmostEqual(web["intereses"]["cobrado12"], 100 * k, places=1)
