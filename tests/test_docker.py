"""Rumbo en Docker: abierta a la red de casa, pero solo con la llave y solo por direcciones de casa.
(La imagen de verdad la arranca y la prueba GitHub en cada versión: .github/workflows/docker.yml.)"""
import os
import re
from unittest import mock

from flask.testing import FlaskClient

from comun import RAIZ, ConCarpeta, PreciosInventados
from app import servidor


def lee(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8") as f:
        return f.read()


class ModoRed(ConCarpeta):
    """Como dentro del contenedor: PATRIMONIO_HOST=0.0.0.0."""

    def setUp(self):
        super().setUp()
        self.parches = [mock.patch.object(servidor, "DATOS", self.carpeta), PreciosInventados(),
                        mock.patch.dict(os.environ, {"PATRIMONIO_HOST": "0.0.0.0", "PATRIMONIO_DOCKER": "1"})]
        for p in self.parches:
            p.__enter__()
        servidor._LLAVES.clear()
        self.web = servidor.app.test_client()
        self.extrano = FlaskClient(servidor.app)

    def tearDown(self):
        for p in reversed(self.parches):
            p.__exit__(None, None, None)
        servidor._LLAVES.clear()
        super().tearDown()

    def test_direcciones_de_casa_si(self):
        for host in ("192.168.1.50:8765", "10.0.0.7:8765", "172.20.1.2:8765", "100.101.102.103:8765",
                     "nas:8765", "raspberrypi.local:8765", "rumbo.lan:8765", "minas.tail1234.ts.net:8765",
                     "[fd00::1]:8765", "localhost:8765"):
            with self.subTest(host=host):
                self.assertTrue(servidor.host_valido(host))
                if not host.startswith("["):   # el cliente de pruebas no guarda cookies para IPv6
                    self.assertEqual(self.web.get("/api/cartera", headers={"Host": host}).status_code, 200)

    def test_dominios_de_internet_no(self):
        for host in ("evil.com", "rumbo.evil.com:8765", "8.8.8.8:8765", "nas.example.org"):
            with self.subTest(host=host):
                self.assertFalse(servidor.host_valido(host))
                self.assertEqual(self.web.get("/api/cartera", headers={"Host": host}).status_code, 403)

    def test_un_nombre_propio_se_puede_permitir(self):
        with mock.patch.dict(os.environ, {"PATRIMONIO_HOSTS_PERMITIDOS": "rumbo.midominio.com"}):
            self.assertTrue(servidor.host_valido("rumbo.midominio.com:8765"))

    def test_en_red_sigue_haciendo_falta_la_llave(self):
        cab = {"Host": "192.168.1.50:8765"}
        self.assertEqual(self.extrano.get("/api/cartera", headers=cab).status_code, 403)
        self.assertEqual(self.extrano.post("/api/reiniciar", json={"a": "vacia"}, headers=cab).status_code, 403)
        r = self.extrano.get("/?acceso=" + servidor.token_acceso(), headers=cab)
        self.assertEqual(r.status_code, 302)

    def test_formulario_desde_otro_equipo_de_casa(self):
        cab = {"Host": "192.168.1.50:8765", "Origin": "http://192.168.1.50:8765", "Sec-Fetch-Site": "same-origin"}
        self.assertEqual(self.web.post("/api/empezar", json={"desde": "vacia"}, headers=cab).status_code, 200)
        cab_mala = {"Host": "192.168.1.50:8765", "Origin": "https://evil.com"}
        self.assertEqual(self.web.post("/api/reiniciar", json={"a": "vacia"}, headers=cab_mala).status_code, 403)

    def test_el_aviso_de_version_habla_de_docker(self):
        self.assertTrue(self.web.get("/api/version").get_json()["docker"])


class FueraDeDocker(ConCarpeta):
    def test_en_tu_ordenador_solo_127(self):
        with mock.patch.dict(os.environ, {"PATRIMONIO_HOST": ""}):
            self.assertFalse(servidor.en_red())
            self.assertFalse(servidor.host_valido("192.168.1.50:8765"))
            self.assertFalse(servidor.host_valido("nas:8765"))
            self.assertTrue(servidor.host_valido("127.0.0.1:8765"))


class ArchivosDeDocker(ConCarpeta):
    def test_dockerfile(self):
        d = lee("Dockerfile")
        for trozo in ("PATRIMONIO_DATOS=/data", "PATRIMONIO_HOST=0.0.0.0", "PATRIMONIO_NO_ABRIR=1",
                      "PATRIMONIO_DOCKER=1", 'VOLUME ["/data"]', "EXPOSE 8765", "HEALTHCHECK", "/api/ping",
                      "requirements.txt", "COPY app ./app", "COPY demo ./demo"):
            self.assertIn(trozo, d)
        self.assertRegex(d, r"\nUSER rumbo\n")                     # no corre como administrador
        self.assertLess(d.index("USER rumbo"), d.index("CMD"))

    def test_compose(self):
        c = lee("docker-compose.yml")
        self.assertIn("8765:8765", c)
        self.assertRegex(c, r"rumbo_datos:/data")
        self.assertIn("restart: unless-stopped", c)

    def test_la_imagen_no_lleva_tus_datos(self):
        ignora = lee(".dockerignore").split()
        for x in ("mis_datos", ".venv", ".git", "tests"):
            self.assertIn(x, ignora)

    def test_github_prueba_antes_de_publicar(self):
        w = lee(os.path.join(".github", "workflows", "docker.yml"))
        self.assertIn("needs: pruebas", w)
        self.assertIn("linux/amd64,linux/arm64", w)
        self.assertLess(w.index("Arrancarla y comprobar"), w.index("Publicar para amd64 y arm64"))
        p = lee(os.path.join(".github", "workflows", "pruebas.yml"))
        self.assertIn("unittest discover -s tests", p)

    def test_misma_version_de_python_y_puerto(self):
        self.assertRegex(lee("Dockerfile"), r"FROM python:3\.1[0-9]")
        self.assertEqual(int(re.search(r"PATRIMONIO_PUERTO=(\d+)", lee("Dockerfile")).group(1)), 8765)
