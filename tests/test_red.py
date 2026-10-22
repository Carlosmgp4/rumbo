"""Internet simulado: descargas de Yahoo, reintentos y mensajes cuando falla la conexión."""
import io
import json
import os
import time
import unittest
import urllib.error
from unittest import mock

from comun import ConCarpeta, cartera
from app import buscar, importar, motor


class RespuestaFalsa(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def yahoo(fechas_cierres, granularidad="1d"):
    ts = [int(time.mktime(time.strptime(f, "%Y-%m-%d"))) + 12 * 3600 for f, _ in fechas_cierres]
    cuerpo = {"chart": {"result": [{"meta": {"dataGranularity": granularidad}, "timestamp": ts,
                                    "indicators": {"quote": [{"close": [c for _, c in fechas_cierres]}]}}]}}
    return RespuestaFalsa(json.dumps(cuerpo).encode())


class DescargaYahoo(ConCarpeta):
    def setUp(self):
        super().setUp()
        motor.CACHE = os.path.join(self.carpeta, "cache")
        motor.SIN_RED, motor.SOLO_FALTAN = False, False
        self.urls = []

    def descarga(self, respuesta, simbolo="AAPL"):
        def falso(req, timeout=None):
            self.urls.append(req.full_url)
            return respuesta
        with mock.patch("urllib.request.urlopen", falso):
            return motor.descargar_serie(simbolo)

    def test_pide_precios_diarios_por_fechas(self):
        # Regresión v1.1.2: con range=max Yahoo devolvía un precio al mes o al trimestre.
        self.descarga(yahoo([("2025-01-02", 10.0)]))
        self.assertIn("interval=1d", self.urls[0])
        self.assertIn("period1=", self.urls[0])
        self.assertNotIn("range=max", self.urls[0])

    def test_rechaza_precios_mensuales(self):
        serie = self.descarga(yahoo([("2025-01-01", 10.0), ("2025-02-01", 11.0)], granularidad="1mo"))
        self.assertEqual(serie, {})
        self.assertTrue(any("1mo" in a for a in motor.AVISOS))

    def test_limpia_la_cache_estropeada(self):
        os.makedirs(motor.CACHE)
        with open(os.path.join(motor.CACHE, "AAPL.json"), "w") as f:
            json.dump({"1999-01-04": 1.0, "2025-02-01": 999.0}, f)   # 2025-02-01 es sábado: dato mensual
        serie = self.descarga(yahoo([("2025-01-02", 10.0), ("2025-02-03", 11.0)]))
        self.assertEqual(serie, {"1999-01-04": 1.0, "2025-01-02": 10.0, "2025-02-03": 11.0})

    def test_sin_conexion_usa_la_cache(self):
        os.makedirs(motor.CACHE)
        with open(os.path.join(motor.CACHE, "AAPL.json"), "w") as f:
            json.dump({"2025-01-02": 10.0}, f)
        def caido(*a, **k):
            raise urllib.error.URLError("sin red")
        with mock.patch("urllib.request.urlopen", caido):
            serie = motor.descargar_serie("AAPL")
        self.assertEqual(serie, {"2025-01-02": 10.0})
        self.assertTrue(any("sin conexion" in a for a in motor.AVISOS))

    def test_solo_faltan_no_descarga_si_hay_cache(self):
        os.makedirs(motor.CACHE)
        with open(os.path.join(motor.CACHE, "AAPL.json"), "w") as f:
            json.dump({"2025-01-02": 10.0}, f)
        motor.SOLO_FALTAN = True
        self.assertEqual(self.descarga(yahoo([("2025-01-03", 11.0)])), {"2025-01-02": 10.0})
        self.assertEqual(self.urls, [])


class Reintentos(unittest.TestCase):
    def setUp(self):
        self.dormir = mock.patch("time.sleep", lambda s: None)
        self.dormir.start()

    def tearDown(self):
        self.dormir.stop()

    def test_tres_intentos_y_queda_registrado(self):
        llamadas = []
        def caido(*a, **k):
            llamadas.append(1)
            raise urllib.error.URLError("timeout")
        n = len(buscar.FALLOS)
        with mock.patch("urllib.request.urlopen", caido), self.assertRaises(urllib.error.URLError):
            buscar._get("https://query2.finance.yahoo.com/v1/finance/search?q=x")
        self.assertEqual(len(llamadas), 3)
        self.assertIn("query2.finance.yahoo.com", buscar.hubo_fallos_desde(n))

    def test_un_404_no_se_reintenta(self):
        llamadas = []
        def no_existe(req, timeout=None):
            llamadas.append(1)
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, None)
        with mock.patch("urllib.request.urlopen", no_existe), self.assertRaises(urllib.error.HTTPError):
            buscar._get("https://query1.finance.yahoo.com/v8/finance/chart/NOEXISTE")
        self.assertEqual(len(llamadas), 1)

    def test_demasiadas_peticiones_si_se_reintenta(self):
        respuestas = [urllib.error.HTTPError("u", 429, "Too Many", {}, None), RespuestaFalsa(b'{"ok": 1}')]
        def a_veces(req, timeout=None):
            r = respuestas.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        with mock.patch("urllib.request.urlopen", a_veces):
            self.assertEqual(buscar._get("https://query2.finance.yahoo.com/x"), {"ok": 1})


class MensajesDelImportador(ConCarpeta):
    def resolver(self, simula):
        plan = importar.Plan()
        with mock.patch.object(buscar, "buscar", simula):
            importar.Resolutor(cartera(), plan, self.carpeta).producto(7, "IE00BYX5NX33", "", "fondo")
        return plan.errores[0]["mensaje"]

    def test_sin_conexion_no_dice_que_no_existe(self):
        def caido(texto):
            buscar.FALLOS.append("lt.morningstar.com: timeout")
            return []
        self.assertIn("No he podido consultar", self.resolver(caido))

    def test_no_existe_de_verdad(self):
        self.assertIn("No encuentro «IE00BYX5NX33»", self.resolver(lambda texto: []))


if __name__ == "__main__":
    unittest.main()
