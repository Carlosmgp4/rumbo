"""Perfiles: varias carteras (tú, tu pareja, tus hijos) y la vista «Todos juntos»."""
import json
import os
from unittest import mock

from comun import ConCarpeta, PreciosInventados
from app import servidor


class Perfiles(ConCarpeta):
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

    def mi_cartera_con(self, nombre_producto, valor):
        codigo, j = self.post("/api/productos", {"nombre": nombre_producto, "tipo": "inmueble", "fuente": "manual"})
        self.assertEqual(codigo, 200, j)
        codigo, j = self.post("/api/valoraciones", {"producto": j["item"]["id"], "fecha": "2025-01-02", "valor": valor})
        self.assertEqual(codigo, 200, j)

    def test_sin_perfiles_todo_sigue_como_antes(self):
        self.assertEqual(servidor.perfiles()["activo"], "principal")
        self.assertEqual(servidor.carpeta(), self.carpeta)
        self.assertEqual(servidor.modo(), "demo")
        self.assertFalse(os.path.exists(os.path.join(self.carpeta, "perfiles.json")))

    def test_crear_un_perfil_y_cambiar(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.mi_cartera_con("Piso", 200000)
        codigo, j = self.post("/api/perfiles", {"nombre": "Ana"})
        self.assertEqual(codigo, 200, j)
        self.assertEqual(servidor.perfiles()["activo"], "ana")
        self.assertEqual(servidor.modo(), "propio")
        self.assertEqual(self.web.get("/api/cartera").get_json()["cartera"]["productos"], [])   # Ana empieza vacía
        self.mi_cartera_con("Fondo de Ana", 5000)
        self.assertTrue(os.path.exists(os.path.join(self.carpeta, "perfiles", "ana", "cartera.json")))
        # La cartera principal no se ha tocado.
        with open(os.path.join(self.carpeta, "cartera.json"), encoding="utf-8") as f:
            self.assertEqual([p["nombre"] for p in json.load(f)["productos"]], ["Piso"])
        self.assertEqual(self.post("/api/perfiles/activar", {"id": "principal"})[0], 200)
        self.assertEqual([p["nombre"] for p in self.web.get("/api/cartera").get_json()["cartera"]["productos"]], ["Piso"])

    def test_todos_juntos_suma_y_no_deja_tocar(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.mi_cartera_con("Piso", 200000)
        self.post("/api/perfiles", {"nombre": "Ana"})
        self.mi_cartera_con("Piso", 5000)   # mismo nombre en dos perfiles: no se mezclan
        self.assertEqual(self.post("/api/perfiles/activar", {"id": "todos"})[0], 200)
        datos = servidor.recalcula(descargar=False)
        self.assertEqual(datos["total"]["patrimonio"], 205000)
        self.assertEqual(datos["modo"], "todos")
        nombres = sorted(p["nombre"] for p in datos["productos"])
        self.assertEqual(nombres, ["Piso (Ana)", "Piso (Yo)"])
        codigo, j = self.post("/api/productos", {"nombre": "X", "tipo": "otro"})
        self.assertEqual(codigo, 403)
        self.assertIn("Todos juntos", j["errores"][0])
        self.assertEqual(self.post("/api/reiniciar", {"a": "vacia"})[0], 400)
        # «Todos juntos» no escribe su histórico encima del tuyo (están en la misma carpeta).
        with open(os.path.join(self.carpeta, "historico.json"), encoding="utf-8") as f:
            self.assertNotIn(205000, [h["patrimonio"] for h in json.load(f)])

    def test_todos_juntos_necesita_dos_perfiles_con_datos(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.assertEqual(self.post("/api/perfiles/activar", {"id": "todos"})[0], 400)
        self.assertFalse(self.web.get("/api/perfiles").get_json()["todos"])

    def test_renombrar_y_borrar(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.post("/api/perfiles", {"nombre": "Hijo"})
        self.assertEqual(self.post("/api/perfiles/renombrar", {"id": "hijo", "nombre": "Lucas"})[0], 200)
        self.assertEqual(self.post("/api/perfiles/renombrar", {"id": "principal", "nombre": "Dani"})[0], 200)
        nombres = [x["nombre"] for x in self.web.get("/api/perfiles").get_json()["lista"]]
        self.assertEqual(nombres, ["Dani", "Lucas"])
        self.assertEqual(self.post("/api/perfiles/borrar", {"id": "principal"})[0], 400)
        self.assertEqual(self.post("/api/perfiles/borrar", {"id": "hijo"})[0], 200)
        self.assertEqual(servidor.perfiles()["activo"], "principal")
        self.assertFalse(os.path.exists(os.path.join(self.carpeta, "perfiles", "hijo")))
        borrados = [n for n in os.listdir(os.path.join(self.carpeta, "copias")) if n.startswith("perfil_borrado_hijo")]
        self.assertEqual(len(borrados), 1)   # no se pierde: se guarda en copias

    def test_nombres_repetidos_o_vacios(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.assertEqual(self.post("/api/perfiles", {"nombre": ""})[0], 400)
        self.post("/api/perfiles", {"nombre": "Ana"})
        self.assertEqual(self.post("/api/perfiles", {"nombre": "ana"})[0], 400)

    def test_cada_perfil_sus_copias(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.mi_cartera_con("Piso", 1)
        self.post("/api/perfiles", {"nombre": "Ana"})
        self.mi_cartera_con("Coche", 1)
        copia = self.web.get("/api/copia/descargar").data
        self.assertIn(b"Coche", copia)
        self.assertNotIn(b"Piso", copia)

    def test_datos_js_lleva_los_perfiles(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.post("/api/perfiles", {"nombre": "Ana"})
        self.assertIn(b'window.PERFILES = {"activo": "ana"', self.web.get("/datos.js").data)


class PestanasConOtroPerfil(Perfiles):
    """El perfil activo es uno para todo Rumbo: una pestaña que se quedó en otro no guarda nada."""

    def test_una_pestana_vieja_no_guarda_en_el_perfil_equivocado(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.assertEqual(self.post("/api/perfiles", {"nombre": "Irmita"})[0], 200)
        activo = servidor.perfiles()["activo"]
        r = self.web.post("/api/productos", json={"nombre": "Piso", "tipo": "inmueble", "fuente": "manual"},
                          headers={"X-Rumbo-Perfil": "principal" if activo != "principal" else "irmita"})
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.get_json()["perfilCambiado"])
        self.assertIn("Recarga esta página", r.get_json()["errores"][0])
        r = self.web.post("/api/productos", json={"nombre": "Piso", "tipo": "inmueble", "fuente": "manual"},
                          headers={"X-Rumbo-Perfil": activo})
        self.assertEqual(r.status_code, 200)                      # la pestaña buena sí guarda
        r = self.web.post("/api/productos", json={"nombre": "Coche", "tipo": "otro", "fuente": "manual"})
        self.assertEqual(r.status_code, 200)                      # sin cabecera (otras herramientas), como antes

    def test_cambiar_de_perfil_siempre_se_puede(self):
        self.post("/api/empezar", {"desde": "vacia"})
        self.post("/api/perfiles", {"nombre": "Irmita"})
        r = self.web.post("/api/perfiles/activar", json={"id": "principal"}, headers={"X-Rumbo-Perfil": "otro"})
        self.assertEqual(r.status_code, 200)
