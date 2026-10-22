"""Las cuentas que hace el panel en el navegador (app/web/calculos.js), probadas con Node, y
que dan lo mismo que el motor en Python con la cartera de ejemplo."""
import glob
import json
import os
import shutil
import subprocess
import tempfile
import unittest

from comun import RAIZ, ConCarpeta, PreciosInventados, lee_demo
from app import motor

NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "Node no está instalado: no se pueden probar las cuentas del navegador")
class CalculosDelNavegador(ConCarpeta):
    def test_pruebas_de_node(self):
        archivos = sorted(glob.glob(os.path.join(RAIZ, "tests", "js", "*.test.js")))
        self.assertGreaterEqual(len(archivos), 2)          # calculos y compartir
        r = subprocess.run([NODE, "--test", *archivos],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])

    def test_compartir_mi_mes_da_lo_mismo_que_el_panel(self):
        with PreciosInventados():
            D = motor.construir(lee_demo(), self.carpeta, descargar=False)
        ruta = os.path.join(self.carpeta, "datos.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(D, f, ensure_ascii=False)
        codigo = ("const C = require(process.argv[1]); const D = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));"
                  "console.log(JSON.stringify(C.resumenParaCompartir(D)));")
        r = subprocess.run([NODE, "-e", codigo, os.path.join(RAIZ, "app", "web", "calculos.js"), ruta],
                           capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        d = json.loads(r.stdout)
        ult = D["resumenMensual"][-1]
        self.assertEqual(d["mes"], ult["mes"])
        self.assertAlmostEqual(d["rentMes"], ult["rentabilidad"], places=4)       # la misma cifra que «El mes»
        ra = D["rentabilidadAnual"]
        self.assertEqual(ra["anos"][-1], str(d["ano"]))
        self.assertAlmostEqual(d["anoPct"], ra["cartera"][-1], places=3)         # y que «Rentabilidad por año»
        self.assertAlmostEqual(d["tir"], D["total"]["tir"], places=4)

    def test_el_panel_y_el_motor_dan_las_mismas_cifras(self):
        with PreciosInventados():
            D = motor.construir(lee_demo(), self.carpeta, descargar=False)
        ruta = os.path.join(self.carpeta, "datos.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(D, f, ensure_ascii=False)
        codigo = (
            "const C = require(process.argv[1]); const D = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));"
            "const todos = D.productos.concat(D.otrosActivos || [], D.pasivos || []);"
            "const m = C.metricas(todos, D);"
            "console.log(JSON.stringify({valor: m.valor, aportado: m.aportado, plusvalia: m.plusvalia, tir: m.tir,"
            " ritmo: m.ritmo, racha: m.racha, caida: m.caida, ultimo: m.serie[m.serie.length - 1]}));")
        r = subprocess.run([NODE, "-e", codigo, os.path.join(RAIZ, "app", "web", "calculos.js"), ruta],
                           capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        js = json.loads(r.stdout)
        t = D["total"]
        self.assertAlmostEqual(js["valor"], t["patrimonio"], places=1)
        self.assertAlmostEqual(js["ultimo"], t["patrimonio"], places=1)
        self.assertAlmostEqual(js["aportado"], t["aportado"], places=1)
        self.assertAlmostEqual(js["plusvalia"], t["plusvalia"], places=1)
        self.assertAlmostEqual(js["tir"], t["tir"], places=3)
        self.assertAlmostEqual(js["ritmo"], t["ritmoMensual"], places=1)
        self.assertEqual(js["racha"], t["racha"])
        self.assertAlmostEqual(js["caida"], t["caidaMaxima"], places=3)


class CompartirSoloEnLaApp(ConCarpeta):
    def test_la_app_lo_carga_y_la_web_publicada_no(self):
        from app import exportar
        with open(os.path.join(RAIZ, "app", "web", "index.html"), encoding="utf-8") as f:
            self.assertIn('"compartir.js"', f.read())
        with PreciosInventados():
            D = motor.construir(lee_demo(), self.carpeta, descargar=False)
        html = exportar.pagina(os.path.join(RAIZ, "app", "web"), D)
        self.assertNotIn("raiz.Compartir = M", html)             # el código de compartir.js no va
        self.assertNotIn("QR: descargar Rumbo", html)
