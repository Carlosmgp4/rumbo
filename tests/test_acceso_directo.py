"""El icono de Rumbo en el escritorio: Windows (acceso directo) y Linux (menú de aplicaciones)."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from comun import RAIZ


@unittest.skipUnless(sys.platform == "win32", "el acceso directo .lnk solo existe en Windows")
class AccesoDirectoWindows(unittest.TestCase):
    def test_crea_el_icono_que_abre_rumbo(self):
        escritorio = tempfile.mkdtemp(prefix="rumbo_escritorio_")
        self.addCleanup(shutil.rmtree, escritorio, True)
        bat = os.path.join(RAIZ, "Crear acceso directo.bat")
        r = subprocess.run(["cmd.exe", "/c", bat], env={**os.environ, "RUMBO_ESCRITORIO": escritorio},
                           capture_output=True, text=True, timeout=120, stdin=subprocess.DEVNULL)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        lnk = os.path.join(escritorio, "Rumbo.lnk")
        self.assertTrue(os.path.exists(lnk), r.stdout + r.stderr)
        leer = ("$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); "
                "$s.TargetPath; $s.WorkingDirectory; $s.IconLocation")
        r = subprocess.run(["powershell", "-NoProfile", "-Command", leer], env={**os.environ, "LNK": lnk},
                           capture_output=True, text=True, timeout=60)
        destino, carpeta, icono = (r.stdout.strip().splitlines() + ["", "", ""])[:3]
        self.assertEqual(os.path.normcase(destino), os.path.normcase(os.path.join(RAIZ, "Iniciar.bat")))
        self.assertEqual(os.path.normcase(os.path.normpath(carpeta)), os.path.normcase(os.path.normpath(RAIZ)))
        self.assertTrue(os.path.normcase(icono).startswith(os.path.normcase(os.path.join(RAIZ, "app", "web", "rumbo.ico"))))


BASH = shutil.which("bash")


@unittest.skipUnless(sys.platform.startswith("linux") and BASH, "el .desktop es de Linux")
class MenuDeLinux(unittest.TestCase):
    def test_crea_la_entrada_del_menu(self):
        casa = tempfile.mkdtemp(prefix="rumbo_casa_")
        self.addCleanup(shutil.rmtree, casa, True)
        os.makedirs(os.path.join(casa, "Desktop"))
        entorno = {**os.environ, "HOME": casa}
        entorno.pop("XDG_DATA_HOME", None)
        r = subprocess.run([BASH, os.path.join(RAIZ, "crear-acceso-directo.sh")], env=entorno,
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        ruta = os.path.join(casa, ".local", "share", "applications", "rumbo.desktop")
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("Name=Rumbo", texto)
        self.assertIn(f'Exec=bash "{RAIZ}/Iniciar.sh"', texto)
        self.assertIn(f"Icon={RAIZ}/app/web/icono-512.png", texto)
        self.assertTrue(os.access(ruta, os.X_OK))
