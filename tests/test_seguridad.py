"""Seguridad de la app local: solo la propia app puede leer o cambiar tus datos."""
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados, cartera, etf, lee_demo, mov
from app import motor, servidor


class Cerrojo(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.parches = [mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados()]
        for p in self.parches:
            p.__enter__()
        self.web = servidor.app.test_client()
        self.web.post("/api/empezar", json={"desde": "vacia"})

    def tearDown(self):
        for p in reversed(self.parches):
            p.__exit__(None, None, None)
        super().tearDown()

    def test_otra_web_no_puede_leer_tus_datos(self):
        r = self.web.get("/datos.js", headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors"})
        self.assertEqual(r.status_code, 403)
        self.assertNotIn(b"window.DATOS", r.data)

    def test_otra_app_del_mismo_ordenador_tampoco(self):
        # localhost:3000 es «same-site» de 127.0.0.1:8765 para el navegador: tampoco vale.
        r = self.web.get("/api/cartera", headers={"Sec-Fetch-Site": "same-site"})
        self.assertEqual(r.status_code, 403)

    def test_la_propia_app_si(self):
        r = self.web.get("/datos.js", headers={"Sec-Fetch-Site": "same-origin"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.web.get("/api/cartera").status_code, 200)   # sin cabeceras (curl, tests)

    def test_abrir_la_app_desde_un_enlace(self):
        r = self.web.get("/", headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})
        self.assertEqual(r.status_code, 200)
        r = self.web.get("/datos.js", headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})
        self.assertEqual(r.status_code, 403)

    def test_dns_rebinding(self):
        r = self.web.get("/datos.js", headers={"Host": "evil.com:8765"})
        self.assertEqual(r.status_code, 403)
        r = self.web.get("/api/cartera", base_url="http://127.0.0.1:8765")
        self.assertEqual(r.status_code, 200)
        r = self.web.get("/api/cartera", base_url="http://[::1]:8765")
        self.assertEqual(r.status_code, 200)

    def test_formulario_de_otra_web_no_cambia_nada(self):
        for cab in ({"Origin": "https://evil.com"}, {"Referer": "https://evil.com/trampa.html"},
                    {"Sec-Fetch-Site": "cross-site"}):
            with self.subTest(cabecera=cab):
                r = self.web.post("/api/reiniciar", json={"a": "vacia"}, headers=cab)
                self.assertEqual(r.status_code, 403)
                r = self.web.post("/api/productos", json={"nombre": "X", "tipo": "otro"}, headers=cab)
                self.assertEqual(r.status_code, 403)
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"], [])

    def test_formulario_de_la_app_si(self):
        r = self.web.post("/api/productos", json={"nombre": "Oro", "tipo": "commodity", "fuente": "manual"},
                          headers={"Origin": "http://127.0.0.1:8765", "Sec-Fetch-Site": "same-origin"})
        self.assertEqual(r.status_code, 200, r.get_json())

    def test_ping_siempre(self):
        r = self.web.get("/api/ping", headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status_code, 200)

    def test_cabeceras_de_proteccion(self):
        r = self.web.get("/datos.js")
        self.assertEqual(r.headers.get("Cross-Origin-Resource-Policy"), "same-origin")
        self.assertEqual(r.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(r.headers.get("X-Frame-Options"), "DENY")

    def test_hosts_extra_por_variable(self):
        with mock.patch.dict(os.environ, {"PATRIMONIO_HOSTS_PERMITIDOS": "rumbo.casa"}):
            self.assertEqual(self.web.get("/api/cartera", headers={"Host": "rumbo.casa:8765"}).status_code, 200)
        self.assertEqual(self.web.get("/api/cartera", headers={"Host": "rumbo.casa:8765"}).status_code, 403)


class SinCodigoEnLosTextos(ConCarpeta):
    def test_nombre_con_html_no_llega_al_panel(self):
        malo = '<img src=x onerror="fetch(1)">Fondo'
        cfg = cartera([etf("a", nombre=malo, corto=malo)], [mov("2024-01-02", "a", "compra", 10, 100)])
        cfg["titular"] = "<script>alert(1)</script>Yo"
        with PreciosInventados():
            datos = motor.construir(cfg, self.carpeta, descargar=False)
        texto = json.dumps(datos, ensure_ascii=False)
        self.assertNotIn("<img", texto)
        self.assertNotIn("<script", texto)
        self.assertIn("Fondo", datos["productos"][0]["nombre"])

    def test_al_guardar_tambien_se_limpia(self):
        from app import almacen
        cfg = cartera()
        p, _ = almacen.guarda_producto(cfg, {"nombre": "<b>Piso</b>", "tipo": "inmueble", "fuente": "manual"})
        self.assertEqual(p["nombre"], "bPiso/b")

    def test_la_demo_sigue_igual(self):
        with PreciosInventados():
            datos = motor.construir(lee_demo(), self.carpeta, descargar=False)
        self.assertGreater(datos["total"]["patrimonio"], 0)


class Novedades(ConCarpeta):
    def setUp(self):
        super().setUp()
        servidor._NOVEDADES.clear()
        self.web = servidor.app.test_client()

    def tearDown(self):
        servidor._NOVEDADES.clear()
        super().tearDown()

    def test_valida_lo_que_llega_de_github(self):
        n = servidor.valida_novedades({"version": "2.0.0", "titulo": "<b>Rumbo 2.0</b>",
                                       "novedades": ["Traspasos", "<script>x</script>", 7],
                                       "video": "javascript:alert(1)"})
        self.assertEqual(n["titulo"], "bRumbo 2.0/b")
        self.assertEqual(n["novedades"], ["Traspasos", "scriptx/script"])
        self.assertIsNone(n["video"])
        self.assertEqual(servidor.valida_novedades({"version": "2.0.0", "video": "https://youtu.be/abc_12-X"})["video"],
                         "https://youtu.be/abc_12-X")
        self.assertIsNone(servidor.valida_novedades({"version": "dos"}))

    def test_sin_internet_no_falla(self):
        # comun.py corta internet: la consulta a GitHub falla y no pasa nada.
        r = self.web.get("/api/novedades")
        self.assertEqual(r.status_code, 200)
        j = r.get_json()
        self.assertIsNone(j["nueva"])

    def test_version_nueva_en_github(self):
        servidor._NOVEDADES.update(remota={"version": "99.0.0", "titulo": "Rumbo 99", "novedades": ["X"],
                                           "video": "https://youtu.be/abc"},
                                   cuando=servidor.dt.datetime.now())
        j = self.web.get("/api/novedades").get_json()
        self.assertEqual(j["nueva"]["version"], "99.0.0")
        self.assertEqual(j["nueva"]["video"], "https://youtu.be/abc")


class InformeDeSoporte(ConCarpeta):
    def test_no_lleva_datos_de_la_cartera(self):
        with mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados():
            web = servidor.app.test_client()
            web.post("/api/empezar", json={"desde": "vacia"})
            web.post("/api/productos", json={"nombre": "Mi piso secreto", "tipo": "inmueble", "fuente": "manual"})
            j = web.get("/api/diagnostico").get_json()
        self.assertIn("Rumbo ", j["texto"])
        self.assertIn("productos: 1", j["texto"])
        self.assertNotIn("secreto", j["texto"])
