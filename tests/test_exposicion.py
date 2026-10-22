"""Países y sectores de cada producto (Morningstar), con respuestas de Morningstar simuladas."""
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, mov
from app import exposicion, motor

DETALLE_WORLD = [{"Portfolios": [{
    "Date": "2026-10-09T00:00:00",
    "AssetAllocations": [{"SalePosition": "N", "BreakdownValues": [{"Type": "1", "Value": 98.7}, {"Type": "3", "Value": 0.0}]}],
    "CountryExposure": [{"SalePosition": "N", "Type": "Equity", "BreakdownValues": [
        {"Type": "USA", "Value": 73.4}, {"Type": "JPN", "Value": 5.8}, {"Type": "XXX", "Value": 20.8}]}],
    "GlobalStockSectorBreakdown": [{"SalePosition": "N", "BreakdownValues": [
        {"Type": "311", "Value": 32.7}, {"Type": "103", "Value": 15.3}, {"Type": "206", "Value": 52.0}]}],
    "PortfolioHoldings": [{"SecurityName": "NVIDIA Corp", "Weighting": 5.6}, {"SecurityName": "<b>Apple</b>", "Weighting": 5.3}],
}]}]
DETALLE_MONETARIO = [{"Portfolios": [{
    "Date": "2026-08-31T00:00:00",
    "AssetAllocations": [{"SalePosition": "N", "BreakdownValues": [{"Type": "1", "Value": 0.0}, {"Type": "3", "Value": 73.4}]}],
    "CountryExposure": [{"SalePosition": "N", "Type": "Bond", "BreakdownValues": [{"Type": "FRA", "Value": 66.4}]}],
    "GlobalStockSectorBreakdown": [],
}]}]


def falso_get(respuestas):
    def _get(url, cabeceras=None, timeout=20):
        for trozo, r in respuestas.items():
            if trozo in url:
                return r
        raise AssertionError("URL inesperada: " + url)
    return _get


class Lectura(ConCarpeta):
    def test_fondo_por_isin(self):
        with mock.patch.object(exposicion, "_get", falso_get({
                "screener": {"rows": [{"SecId": "F00001019E", "isin": "IE00BYX5NX33", "Universe": "FOESP$$ALL"}]},
                "security_details/F00001019E": DETALLE_WORLD})):
            p = {"tipoClave": "fondo", "identificador": "IE00BYX5NX33", "fuente": "morningstar", "codigo": "0P0001CLDK"}
            r = exposicion.de_producto(p, self.carpeta)
        self.assertEqual(r["paises"][0], ["Estados Unidos", 73.4])
        self.assertEqual(r["sectores"][0], ["Salud", 52.0])
        self.assertEqual(r["rv"], 0.987)
        self.assertEqual(r["actualizado"], "2026-10-09")
        self.assertEqual(r["top10"][1][0], "bApple/b")   # sin HTML
        self.assertAlmostEqual(sum(x[1] for x in r["paises"]), 100, places=1)

    def test_monetario_no_tiene_bolsa(self):
        with mock.patch.object(exposicion, "_get", falso_get({
                "screener": {"rows": [{"SecId": "F0GBR04EZP", "isin": "FR0000447823"}]},
                "security_details/F0GBR04EZP": DETALLE_MONETARIO})):
            r = exposicion.de_producto({"tipoClave": "fondo", "identificador": "FR0000447823"}, self.carpeta)
        self.assertEqual((r["rv"], r["paises"], r["sectores"]), (0.0, [], []))

    def test_accion(self):
        with mock.patch.object(exposicion, "_get", falso_get({"screener": {"rows": [
                {"SecId": "0P0000CK1N", "SectorName": "Productos de consumo cíclicos", "Domicile": "ESP"}]}})):
            r = exposicion.de_producto({"tipoClave": "accion", "identificador": "ES0148396007"}, self.carpeta)
        self.assertEqual((r["paises"], r["sectores"]), ([["España", 100.0]], [["Consumo discrecional", 100.0]]))

    def test_que_se_busca_de_cada_producto(self):
        self.assertIsNone(exposicion.clave({"tipoClave": "efectivo"}))
        self.assertIsNone(exposicion.clave({"tipoClave": "fondo", "fuente": "manual"}))
        self.assertEqual(exposicion.clave({"tipoClave": "pension", "fuente": "morningstar", "codigo": "F000016CB6"}),
                         "MS:F000016CB6")
        self.assertEqual(exposicion.clave({"tipoClave": "pension", "fuente": "manual", "expoComo": "ie00byx5nx33"}),
                         "ISIN:IE00BYX5NX33")


class Cache(ConCarpeta):
    P = {"tipoClave": "fondo", "identificador": "IE00BYX5NX33"}
    RESP = {"screener": {"rows": [{"SecId": "F1", "isin": "IE00BYX5NX33"}]}, "security_details/F1": DETALLE_WORLD}

    def test_se_guarda_y_sin_red_se_usa(self):
        with mock.patch.object(exposicion, "_get", falso_get(self.RESP)):
            exposicion.de_producto(self.P, self.carpeta)
        with mock.patch.object(exposicion, "_get", side_effect=AssertionError("no debía salir a internet")):
            self.assertIsNotNone(exposicion.de_producto(self.P, self.carpeta))              # reciente
            self.assertIsNotNone(exposicion.de_producto(self.P, self.carpeta, red=False))

    def test_sin_conexion_se_queda_lo_ultimo(self):
        with mock.patch.object(exposicion, "_get", falso_get(self.RESP)):
            exposicion.de_producto(self.P, self.carpeta)
        ruta = os.path.join(self.carpeta, "EXPO_ISIN_IE00BYX5NX33.json")
        with open(ruta, encoding="utf-8") as f:
            viejo = json.load(f)
        viejo["consulta"] = "2020-01-01"
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(viejo, f)
        with mock.patch.object(exposicion, "_get", side_effect=OSError("sin red")):
            r = exposicion.de_producto(self.P, self.carpeta)
        self.assertEqual(r["paises"][0][0], "Estados Unidos")

    def test_el_motor_lo_pega_a_cada_producto(self):
        with mock.patch.object(exposicion, "_get", falso_get(self.RESP)):
            exposicion.de_producto(self.P, os.path.join(self.carpeta, "cache"))
        cfg = cartera([{"id": "w", "nombre": "World", "tipo": "fondo", "fuente": "morningstar", "codigo": "0P0001CLDK",
                        "identificador": "IE00BYX5NX33", "slot": 1}], [mov("2024-01-02", "w", "compra", 10, 100)])
        with PreciosInventados():
            D = motor.construir(cfg, self.carpeta, descargar=False)
        self.assertEqual(D["productos"][0]["exposicion"]["paises"][0][0], "Estados Unidos")


class EnSegundoPlano(ConCarpeta):
    """Regresión: el hilo que completa el reparto escribía en la carpeta de datos que
    hubiera al terminar (en los tests, la real) en vez de en la suya."""

    def test_el_hilo_trabaja_en_su_carpeta(self):
        from app import servidor
        otra = os.path.join(self.carpeta, "otra")
        os.makedirs(otra)
        cfg = cartera([{"id": "w", "nombre": "World", "tipo": "fondo", "fuente": "morningstar", "codigo": "0P0001CLDK",
                        "identificador": "IE00BYX5NX33", "slot": 1}], [mov("2024-01-02", "w", "compra", 10, 100)])
        with open(os.path.join(self.carpeta, "cartera.json"), "w", encoding="utf-8") as f:
            json.dump(cfg, f)
        hilo = {}
        with mock.patch.object(servidor, "DATOS", self.carpeta), \
                mock.patch.object(servidor.threading, "Thread", lambda target, daemon: hilo.setdefault("t", target) and mock.Mock()):
            servidor.completa_exposiciones()
        # Cuando el hilo arranca, la app ya apunta a otra carpeta: no puede tocarla.
        with mock.patch.object(servidor, "DATOS", otra), \
                mock.patch.object(exposicion, "_get", falso_get(Cache.RESP)), PreciosInventados():
            hilo["t"]()
        self.assertTrue(os.path.exists(os.path.join(self.carpeta, "cache", "EXPO_ISIN_IE00BYX5NX33.json")))
        self.assertEqual(os.listdir(otra), [])
