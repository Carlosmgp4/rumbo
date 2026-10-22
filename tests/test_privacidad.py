"""Auditoría de seguridad: la llave de acceso, la política de la página, las copias y lo que sale a internet."""
import base64
import hashlib
import io
import json
import os
import re
import urllib.error
import urllib.parse
from unittest import mock

from flask.testing import FlaskClient

from comun import ConCarpeta, PreciosInventados, cartera, mov
from app import buscar, exposicion, motor, red, servidor


class ConServidor(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.parches = [mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados()]
        for p in self.parches:
            p.__enter__()
        servidor._LLAVES.clear()
        self.web = servidor.app.test_client()            # con la llave (como el navegador del lanzador)
        self.extrano = FlaskClient(servidor.app)          # sin llave: otro programa u otro usuario
        self.web.post("/api/empezar", json={"desde": "vacia"})

    def tearDown(self):
        for p in reversed(self.parches):
            p.__exit__(None, None, None)
        servidor._LLAVES.clear()
        super().tearDown()


class LlaveDeAcceso(ConServidor):
    def test_sin_llave_no_se_ve_ni_se_cambia_nada(self):
        for url in ("/", "/datos.js", "/api/cartera", "/api/copia/descargar", "/api/exportar-web",
                    "/api/exportar-excel", "/api/diagnostico", "/app.js"):
            with self.subTest(url=url):
                self.assertEqual(self.extrano.get(url).status_code, 403)
        for url, datos in (("/api/productos", {"nombre": "X", "tipo": "otro"}), ("/api/reiniciar", {"a": "vacia"}),
                           ("/api/perfiles", {"nombre": "Intruso"})):
            with self.subTest(url=url):
                self.assertEqual(self.extrano.post(url, json=datos).status_code, 403)
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"], [])

    def test_todas_las_rutas_piden_la_llave_y_no_aceptan_otras_webs(self):
        # Recorre TODAS las rutas de la app: una ruta nueva queda cubierta sin tener que acordarse.
        antes = json.dumps(self.web.get("/api/cartera").get_json()["cartera"], sort_keys=True)
        rutas = 0
        for regla in servidor.app.url_map.iter_rules():
            if regla.endpoint == "static" or regla.rule == "/api/ping":
                continue
            url = re.sub(r"<(?:[^:>]+:)?([^>]+)>", lambda m: "x" + m.group(1), regla.rule)
            for metodo in sorted(regla.methods - {"HEAD", "OPTIONS"}):
                rutas += 1
                with self.subTest(ruta=f"{metodo} {regla.rule}"):
                    r = self.extrano.open(url, method=metodo, json={})
                    self.assertEqual(r.status_code, 403, "sin llave")
                    if metodo != "GET":
                        r = self.web.open(url, method=metodo, json={},
                                          headers={"Origin": "https://evil.com", "Sec-Fetch-Site": "cross-site"})
                        self.assertEqual(r.status_code, 403, "desde otra web")
        self.assertGreater(rutas, 40)
        self.assertEqual(json.dumps(self.web.get("/api/cartera").get_json()["cartera"], sort_keys=True), antes)

    def test_la_pagina_sin_llave_explica_que_hacer(self):
        r = self.extrano.get("/")
        self.assertIn("Abre Rumbo con su lanzador", r.get_data(as_text=True))
        self.assertNotIn("window.DATOS", r.get_data(as_text=True))

    def test_el_lanzador_abre_con_la_llave(self):
        url = servidor.url_con_llave(8765)
        llave = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["acceso"][0]
        r = self.extrano.get(f"/?acceso={llave}")
        self.assertEqual(r.status_code, 302)
        self.assertEqual(urllib.parse.urlsplit(r.headers["Location"]).query, "")   # la llave no se queda a la vista
        cookie = r.headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertEqual(self.extrano.get("/api/cartera").status_code, 200)     # ya tiene la cookie

    def test_llave_falsa(self):
        self.assertEqual(self.extrano.get("/?acceso=" + "x" * 43).status_code, 403)
        self.extrano.set_cookie(servidor.COOKIE, "y" * 43)
        self.assertEqual(self.extrano.get("/api/cartera").status_code, 403)

    def test_la_llave_se_guarda_y_se_rehace_si_se_estropea(self):
        llave = servidor.token_acceso()
        self.assertGreaterEqual(len(llave), 40)
        ruta = os.path.join(self.carpeta, ".acceso")
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(f.read(), llave)
        servidor._LLAVES.clear()
        self.assertEqual(servidor.token_acceso(), llave)          # se reutiliza: los marcadores siguen valiendo
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("corta")
        servidor._LLAVES.clear()
        self.assertNotEqual(servidor.token_acceso(), "corta")

    def test_ping_sin_llave_y_sin_datos(self):
        r = self.extrano.get("/api/ping")
        self.assertEqual(r.get_json(), {"app": "patrimonio"})


class PoliticaDeLaPagina(ConServidor):
    def test_csp(self):
        csp = self.web.get("/").headers["Content-Security-Policy"]
        for trozo in ("default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'",
                      "img-src 'self' data:"):
            self.assertIn(trozo, csp)
        self.assertNotIn("unsafe-eval", csp)
        script = re.search(r"script-src ([^;]+)", csp).group(1)
        self.assertNotIn("unsafe-inline", script)
        # El cargador de index.html es el único script en línea, y su huella está permitida.
        with open(os.path.join(servidor.WEB, "index.html"), encoding="utf-8") as f:
            codigo = re.findall(r"<script>(.*?)</script>", f.read(), flags=re.S)
        self.assertEqual(len(codigo), 1)
        huella = base64.b64encode(hashlib.sha256(codigo[0].encode()).digest()).decode()
        self.assertIn(f"'sha256-{huella}'", script)

    def test_ningun_manejador_en_linea_en_la_web(self):
        # Con la CSP, un onclick="..." no funcionaría: que no haya ninguno.
        for nombre in os.listdir(servidor.WEB):
            if nombre.endswith((".js", ".html")):
                with open(os.path.join(servidor.WEB, nombre), encoding="utf-8") as f:
                    texto = f.read()
                with self.subTest(archivo=nombre):
                    self.assertIsNone(re.search(r"\son[a-z]+=[\"']", texto))
                    self.assertNotIn("javascript:", texto)
                    self.assertNotIn("eval(", texto)

    def test_cabeceras(self):
        r = self.web.get("/datos.js")
        for k, v in (("X-Frame-Options", "DENY"), ("X-Content-Type-Options", "nosniff"),
                     ("Referrer-Policy", "no-referrer"), ("Cross-Origin-Resource-Policy", "same-origin"),
                     ("Cross-Origin-Opener-Policy", "same-origin")):
            self.assertEqual(r.headers.get(k), v)


class ArchivosQueSuben(ConServidor):
    def sube_copia(self, cfg):
        datos = json.dumps(cfg).encode()
        return self.web.post("/api/copia/subir", data={"archivo": (io.BytesIO(datos), "copia.json")},
                             content_type="multipart/form-data")

    def test_copia_manipulada(self):
        buena = cartera([{"id": "a", "nombre": "A", "tipo": "otro", "fuente": "manual"}])
        malas = [
            {**buena, "productos": [{"id": 'a" onmouseover="x', "nombre": "A"}]},
            {**buena, "movimientos": [{"fecha": "2024-01-02", "producto": "otro", "tipo": "compra", "importe": 1}]},
            {**buena, "movimientos": [{"fecha": "2024-01-02", "producto": "a", "tipo": "compra", "importe": "1e9"}]},
            {**buena, "valoraciones": [{"fecha": "ayer", "producto": "a", "valor": 1}]},
            {**buena, "productos": ["no soy un producto"]},
        ]
        for mala in malas:
            with self.subTest(mala=json.dumps(mala)[:80]):
                self.assertEqual(self.sube_copia(mala).status_code, 400)
        self.assertEqual(self.sube_copia(buena).status_code, 200)

    def test_archivo_enorme(self):
        grande = io.BytesIO(b"x" * (servidor.LIMITE_SUBIDA + 1))
        r = self.web.post("/api/copia/subir", data={"archivo": (grande, "copia.json")}, content_type="multipart/form-data")
        self.assertEqual(r.status_code, 413)

    def test_perfil_con_id_raro_se_ignora(self):
        with open(os.path.join(self.carpeta, "perfiles.json"), "w", encoding="utf-8") as f:
            json.dump({"activo": "../../fuera", "lista": [{"id": "../../fuera", "nombre": "X"}]}, f)
        self.assertEqual(servidor.perfiles()["activo"], "principal")
        self.assertEqual([x["id"] for x in servidor.perfiles()["lista"]], ["principal"])


class LoQueSaleAInternet(ConCarpeta):
    """A internet solo salen códigos de producto (ISIN, ticker, el de Morningstar) o lo que
    escribes en el buscador. Nunca importes, participaciones ni el tamaño de tu cartera."""

    IMPORTE, UNIDADES, VALOR = 73519.37, 98.7654, 41267.83

    def setUp(self):
        super().setUp()
        self.salidas = []

        def apunta(req, timeout=None, *a, **k):
            self.salidas.append({"url": req.full_url, "metodo": req.get_method(), "cuerpo": req.data,
                                 "cabeceras": dict(req.header_items())})
            raise urllib.error.URLError("sin red en los tests")
        self.parches = [mock.patch("urllib.request.urlopen", apunta), mock.patch.object(buscar.time, "sleep")]
        for p in self.parches:
            p.start()

    def tearDown(self):
        for p in self.parches:
            p.stop()
        super().tearDown()

    def test_solo_codigos_a_sitios_permitidos(self):
        cfg = cartera(
            [{"id": "w", "nombre": "Mi fondo World", "tipo": "fondo", "fuente": "morningstar", "codigo": "0P0001CLDK",
              "identificador": "IE00BYX5NX33", "slot": 1},
             {"id": "e", "nombre": "Mi ETF", "tipo": "etf", "fuente": "yahoo", "codigo": "IWDA.AS", "moneda": "USD",
              "identificador": "IE00B4L5Y983", "slot": 2},
             {"id": "b", "nombre": "Bitcoin", "tipo": "cripto", "fuente": "coingecko", "codigo": "bitcoin", "slot": 3},
             {"id": "p", "nombre": "Plan", "tipo": "pension", "fuente": "morningstar", "codigo": "F000016CB6", "slot": 4},
             {"id": "c", "nombre": "Cuenta", "tipo": "efectivo", "fuente": "manual", "slot": 5}],
            [mov("2024-01-02", "w", "compra", self.UNIDADES, self.IMPORTE), mov("2024-01-02", "e", "compra", 3, 999.11),
             mov("2024-01-02", "b", "compra", 0.123456, 5555.55), mov("2024-01-02", "p", "compra", 12, 3333.33)],
            [{"id": "v1", "producto": "c", "fecha": "2024-06-03", "valor": self.VALOR}])
        motor.construir(cfg, self.carpeta, descargar=True)
        for p in cfg["productos"]:
            exposicion.de_producto({**p, "tipoClave": p["tipo"]}, os.path.join(self.carpeta, "cache"))
        buscar.buscar("IE00BYX5NX33")
        buscar.buscar("MyInvestor Indexado Global")
        with mock.patch.object(servidor, "DATOS", self.carpeta):
            servidor._VERSION.clear()
            servidor._NOVEDADES.clear()
            web = servidor.app.test_client()
            web.get("/api/version")
            web.get("/api/novedades")

        self.assertGreater(len(self.salidas), 10)
        hosts = {urllib.parse.urlsplit(s["url"]).hostname for s in self.salidas}
        self.assertLessEqual(hosts, set(red.PERMITIDOS), hosts - set(red.PERMITIDOS))
        cifras = ("73519", "7351937", "98.7654", "98,7654", "41267", "5555", "3333", "999.11", "0.123456")
        for s in self.salidas:
            with self.subTest(url=s["url"]):
                self.assertTrue(s["url"].startswith("https://"))
                self.assertEqual(s["metodo"], "GET")
                self.assertIsNone(s["cuerpo"])
                self.assertNotIn("Cookie", s["cabeceras"])
                for c in cifras:
                    self.assertNotIn(c, s["url"])
                for nombre in ("Mi fondo World", "Mi ETF", "Mi+fondo", "Mi%20fondo"):
                    self.assertNotIn(nombre, s["url"])   # ni siquiera los nombres que tú pones

    def test_la_puerta_no_deja_salir_a_otro_sitio(self):
        for url in ("http://lt.morningstar.com/x", "https://evil.com/robar?datos=1", "ftp://raw.githubusercontent.com/x",
                    "https://lt.morningstar.com.evil.com/x"):
            with self.subTest(url=url), self.assertRaises(red.SitioNoPermitido):
                red.abrir(url)
        self.assertEqual(self.salidas, [])
