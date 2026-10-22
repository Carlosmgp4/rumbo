"""La app de verdad (Flask) con una carpeta de datos temporal: demo, empezar, guardar, copias y exportar."""
import io
import json
import os
import unittest
from unittest import mock

from comun import ConCarpeta, PreciosInventados
from app import servidor


class Servidor(ConCarpeta):
    def setUp(self):
        super().setUp()
        self.parches = [mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados()]
        for p in self.parches:
            p.__enter__()
        self.web = servidor.app.test_client()

    def tearDown(self):
        for p in reversed(self.parches):
            p.__exit__(None, None, None)
        super().tearDown()

    def post(self, url, datos=None):
        r = self.web.post(url, json=datos or {})
        return r.status_code, r.get_json()

    def empieza(self):
        self.assertEqual(self.post("/api/empezar", {"desde": "vacia"})[0], 200)

    def test_demo_se_ve_pero_no_se_toca(self):
        self.assertEqual(self.web.get("/").status_code, 200)
        self.assertEqual(self.web.get("/datos.js").status_code, 200)
        self.assertEqual(servidor.modo(), "demo")
        codigo, j = self.post("/api/productos", {"nombre": "X", "tipo": "otro"})
        self.assertEqual(codigo, 403)
        self.assertIn("Empezar con mis datos", j["errores"][0])
        self.assertFalse(os.path.exists(os.path.join(self.carpeta, "cartera.json")))

    def test_demo_se_calcula(self):
        datos = servidor.recalcula(descargar=False)
        self.assertEqual(datos["modo"], "demo")
        self.assertGreater(datos["total"]["patrimonio"], 0)

    def test_empezar_guardar_y_borrar(self):
        self.empieza()
        self.assertEqual(servidor.modo(), "propio")
        codigo, j = self.post("/api/productos", {"nombre": "Piso", "tipo": "inmueble", "fuente": "manual"})
        self.assertEqual(codigo, 200, j)
        pid = j["item"]["id"]
        codigo, j = self.post("/api/valoraciones", {"producto": pid, "fecha": "2025-01-02", "valor": "150.000"})
        self.assertEqual(codigo, 200, j)
        cfg = self.web.get("/api/cartera").get_json()["cartera"]
        self.assertEqual(cfg["valoraciones"][0]["valor"], 150000)
        codigo, j = self.post("/api/movimientos", {"producto": pid, "tipo": "compra", "fecha": "2999-01-01"})
        self.assertEqual(codigo, 400)
        self.assertEqual(self.web.delete(f"/api/productos/{pid}").status_code, 200)
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"], [])

    def test_no_se_puede_empezar_dos_veces(self):
        self.empieza()
        self.assertEqual(self.post("/api/empezar", {"desde": "vacia"})[0], 400)

    def test_copia_de_seguridad_ida_y_vuelta(self):
        self.empieza()
        self.post("/api/productos", {"nombre": "Oro", "tipo": "commodity", "fuente": "manual"})
        copia = self.web.get("/api/copia/descargar").data
        self.post("/api/reiniciar", {"a": "vacia"})
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"], [])
        r = self.web.post("/api/copia/subir", data={"archivo": (io.BytesIO(copia), "copia.json")},
                          content_type="multipart/form-data")
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"][0]["nombre"], "Oro")
        copias = os.listdir(os.path.join(self.carpeta, "copias"))
        self.assertTrue(any(n.startswith("antes_de_reiniciar") for n in copias))

    def test_subir_algo_que_no_es_una_copia(self):
        self.empieza()
        r = self.web.post("/api/copia/subir", data={"archivo": (io.BytesIO(b'{"hola": 1}'), "x.json")},
                          content_type="multipart/form-data")
        self.assertEqual(r.status_code, 400)

    def test_exportar_sin_importes_no_deja_ver_cifras(self):
        self.empieza()
        _, j = self.post("/api/productos", {"nombre": "Piso", "tipo": "inmueble", "fuente": "manual"})
        self.post("/api/valoraciones", {"producto": j["item"]["id"], "fecha": "2025-01-02", "valor": 123456.78})
        normal = self.web.get("/api/exportar-web").data.decode()
        oculto = self.web.get("/api/exportar-web?ocultar=1").data.decode()
        self.assertIn("123456.78", normal)
        self.assertNotIn("123456.78", oculto)
        self.assertNotIn("123.456", oculto)
        self.assertIn("OCULTAR_IMPORTES", oculto)

    def test_version_sin_internet(self):
        servidor._VERSION.clear()
        j = self.web.get("/api/version").get_json()
        self.assertFalse(j["hayNueva"])
        self.assertEqual(j["actual"], servidor.version_actual())

    def test_plantillas_y_prompt(self):
        self.assertEqual(self.web.get("/api/plantilla.xlsx").status_code, 200)
        self.assertTrue(self.web.get("/api/plantilla.csv").data.startswith(b"\xef\xbb\xbffecha;"))
        self.assertIn("BORRA", self.web.get("/api/prompt").get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
