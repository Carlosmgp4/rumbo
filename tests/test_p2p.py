"""Préstamos P2P y crowdfunding (Mintos, Urbanitae…): producto a mano con aportaciones e intereses (F-11)."""
import json
import os
import shutil
import subprocess

from comun import RAIZ, ConCarpeta, PreciosInventados, cartera, manual, mov
from app import almacen, fiscal, importar, motor, plantilla


def plataforma():
    return cartera([manual("mintos", tipo="p2p")], [
        mov("2024-01-02", "mintos", "compra", 0, 1000),          # metes 1.000 €
        mov("2024-06-03", "mintos", "compra", 0, 500),
        mov("2025-03-31", "mintos", "dividendo", 0, 42.5),       # intereses cobrados
    ], [
        {"id": "v1", "fecha": "2024-01-02", "producto": "mintos", "valor": 1000},
        {"id": "v2", "fecha": "2025-06-30", "producto": "mintos", "valor": 1560},
    ])


class TipoP2P(ConCarpeta):
    def test_es_un_tipo_con_su_clase(self):
        self.assertIn("p2p", motor.TIPOS)
        self.assertEqual(motor.CLASE_DEFECTO["p2p"], "P2P y crowdfunding")
        self.assertIn("p2p", plantilla.TIPOS_PRODUCTO)
        p, _ = almacen.guarda_producto(cartera(), {"nombre": "Urbanitae", "tipo": "p2p", "fuente": "manual"})
        self.assertEqual(p["tipo"], "p2p")

    def test_el_importador_lo_reconoce(self):
        for texto in ("p2p", "P2P", "Crowdfunding", "crowdlending", "préstamos P2P"):
            with self.subTest(texto=texto):
                self.assertEqual(importar.TIPO_PROD.get(importar.sin_tildes(texto)), "p2p")
        self.assertEqual(importar.TIPO_PROD.get("prestamo"), "deuda")      # un préstamo tuyo sigue siendo deuda

    def test_en_el_panel(self):
        with PreciosInventados():
            D = motor.construir(plataforma(), self.carpeta, descargar=False)
        [p] = [x for x in D["productos"] if x["id"] == "mintos"]
        self.assertEqual(p["clase"], "P2P y crowdfunding")
        self.assertEqual(p["tipoClave"], "p2p")
        self.assertEqual(p["aportado"], 1500)
        self.assertEqual(p["valor"], 1560)
        self.assertEqual(p["cobros"]["dividendos"], 42.5)
        self.assertEqual(p["gananciaTotal"], 102.5)                         # 60 de valor + 42,5 de intereses

    def test_los_intereses_van_como_intereses_en_la_renta(self):
        inf = fiscal.informe(plataforma(), "2025")
        self.assertEqual(inf["totales"]["intereses"], 42.5)
        self.assertEqual(inf["totales"]["dividendos"], 0)
        self.assertEqual(inf["cobros"][0]["clase"], "Intereses")


NODE = shutil.which("node")


class FueraDeLaBolsa(ConCarpeta):
    def test_no_cuenta_como_bolsa_en_donde_esta_tu_dinero(self):
        if NODE is None:
            self.skipTest("Node no está instalado")
        codigo = ("const C = require(process.argv[1]);"
                  "console.log(JSON.stringify(C.FUERA_DE_BOLSA.includes('p2p')))")
        r = subprocess.run([NODE, "-e", codigo, os.path.join(RAIZ, "app", "web", "calculos.js")],
                           capture_output=True, text=True)
        self.assertEqual(json.loads(r.stdout), True, r.stderr)
