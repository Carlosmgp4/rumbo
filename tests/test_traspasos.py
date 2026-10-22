"""Traspasos entre fondos y planes: el coste y la antigüedad pasan al destino y no hay plusvalía."""
import unittest

from comun import ConCarpeta, PreciosInventados, cartera, etf, manual, mov, serie_inventada
from app import almacen, motor


def fondo(pid, codigo):
    return {"id": pid, "nombre": pid.upper(), "corto": pid.upper(), "tipo": "fondo", "fuente": "morningstar",
            "codigo": codigo, "moneda": "EUR", "slot": 1, "largoPlazo": True}


def traspaso(fecha, origen, destino, unidades, importe, unidades_destino, mid="t1", **extra):
    return {"id": mid, "fecha": fecha, "producto": origen, "destino": destino, "tipo": "traspaso",
            "unidades": unidades, "unidadesDestino": unidades_destino, "importe": importe, **extra}


# Precios fijos: A vale 20 desde 2024 (se compró a 10), B vale 50 y C vale 25.
PRECIOS = {"MS:A": serie_inventada(10, "2020-01-01", "2023-12-31", paso=0) | serie_inventada(20, "2024-01-01", paso=0),
           "MS:B": serie_inventada(50, "2020-01-01", paso=0),
           "MS:C": serie_inventada(25, "2020-01-01", paso=0)}


class Fifo(unittest.TestCase):
    P = [fondo("a", "A"), fondo("b", "B")]

    def calcula(self, movs):
        movs_por = {}
        for m in motor.expande_traspasos(movs):
            movs_por.setdefault(m["producto"], []).append(m)
        return motor.aplicar_todos(self.P, movs_por)

    def test_traspaso_total_no_es_una_venta(self):
        r = self.calcula([mov("2020-01-02", "a", "compra", 100, 1000), mov("2021-01-04", "a", "compra", 50, 500),
                          traspaso("2024-03-01", "a", "b", 150, 3000, 60)])
        a, b = r["a"], r["b"]
        self.assertEqual(a["realizado"], 0)                       # Hacienda no cobra: no hay plusvalía
        self.assertAlmostEqual(sum(e[1] for e in a["eventos"]), 0)  # A se queda vacío
        self.assertAlmostEqual(sum(e[2] for e in a["eventos"]), 0)
        self.assertAlmostEqual(sum(e[1] for e in b["eventos"]), 60)
        self.assertAlmostEqual(sum(e[2] for e in b["eventos"]), 1500)   # B hereda el coste, no los 3.000
        self.assertEqual(b["traspasos"][0]["coste"], 1500)
        # Para la TIR es una venta en A y una compra en B por lo que valía ese día: se anulan.
        self.assertIn(("2024-03-01", 3000.0), a["flujos"])
        self.assertIn(("2024-03-01", -3000.0), b["flujos"])

    def test_traspaso_parcial_saca_lo_mas_antiguo(self):
        r = self.calcula([mov("2020-01-02", "a", "compra", 100, 1000), mov("2021-01-04", "a", "compra", 100, 1500),
                          traspaso("2024-03-01", "a", "b", 150, 3000, 60)])
        self.assertAlmostEqual(r["b"]["traspasos"][0]["coste"], 1000 + 750)   # 100 a 10 + 50 a 15
        self.assertAlmostEqual(sum(e[1] for e in r["a"]["eventos"]), 50)
        self.assertAlmostEqual(sum(e[2] for e in r["a"]["eventos"]), 750)

    def test_la_antiguedad_pasa_al_destino(self):
        # B ya tenía una compra de 2022; lo traspasado de 2020 es más antiguo y se vende antes.
        r = self.calcula([mov("2020-01-02", "a", "compra", 100, 1000), mov("2022-01-03", "b", "compra", 10, 400),
                          traspaso("2024-03-01", "a", "b", 100, 2000, 40),
                          mov("2025-01-02", "b", "venta", 40, 2000)])
        self.assertAlmostEqual(r["b"]["realizado"], 2000 - 1000)   # vende los 40 heredados (coste 1.000)
        self.assertAlmostEqual(sum(e[2] for e in r["b"]["eventos"]), 400)   # queda la compra de 2022

    def test_cadena_a_b_c(self):
        P = self.P + [fondo("c", "C")]
        movs = [mov("2020-01-02", "a", "compra", 100, 1000),
                traspaso("2023-01-02", "a", "b", 100, 1500, 30, mid="t1"),
                traspaso("2024-01-02", "b", "c", 30, 1500, 60, mid="t2")]
        movs_por = {}
        for m in motor.expande_traspasos(movs):
            movs_por.setdefault(m["producto"], []).append(m)
        r = motor.aplicar_todos(P, movs_por)
        self.assertAlmostEqual(sum(e[2] for e in r["c"]["eventos"]), 1000)
        self.assertAlmostEqual(sum(e[1] for e in r["c"]["eventos"]), 60)
        self.assertEqual(r["a"]["realizado"] + r["b"]["realizado"] + r["c"]["realizado"], 0)


class EnElPanel(ConCarpeta):
    def construye(self, cfg):
        with PreciosInventados(PRECIOS):
            return motor.construir(cfg, self.carpeta, descargar=False)

    def test_mismo_patrimonio_aportado_y_tir_que_sin_traspaso(self):
        compras = [mov("2020-01-02", "a", "compra", 100, 1000), mov("2021-01-04", "a", "compra", 100, 1000)]
        sin = self.construye(cartera([fondo("a", "A"), fondo("b", "B")], compras))
        con = self.construye(cartera([fondo("a", "A"), fondo("b", "B")],
                                     compras + [traspaso("2024-03-01", "a", "b", 200, 4000, 80)]))
        for k in ("patrimonio", "aportado", "plusvalia", "realizado"):
            self.assertAlmostEqual(sin["total"][k], con["total"][k], places=2, msg=k)
        self.assertAlmostEqual(sin["total"]["tir"], con["total"]["tir"], places=4)
        b = next(p for p in con["productos"] if p["id"] == "b")
        self.assertAlmostEqual(b["aportado"], 2000)
        self.assertAlmostEqual(b["participaciones"], 80)
        self.assertEqual(b["traspasos"][0]["otroNombre"], "A")
        # No cuenta como aportación (ni en el mes ni en el ritmo) ni mueve «lo que pusiste tú».
        self.assertEqual(sum(con["aportacionesMensuales"]["total"]), 2000)
        mes = next(m for m in con["resumenMensual"] if m["mes"] == "2024-03")
        self.assertAlmostEqual(mes["aportado"], 0)
        self.assertEqual(con["avisos"], [])

    def test_plan_a_mano_traspasado_entero(self):
        # Caso del issue #7: un plan de pensiones antiguo, a mano, se traspasa entero a otro.
        cfg = cartera([manual("viejo", tipo="pension"), manual("nuevo", tipo="pension")],
                      [mov("2020-01-02", "viejo", "compra", 0, 5000),
                       traspaso("2024-03-01", "viejo", "nuevo", 0, 6200, 0, total=True)],
                      [{"id": "v1", "producto": "viejo", "fecha": "2023-12-31", "valor": 6000}])
        D = self.construye(cfg)
        viejo = next(p for p in D["productos"] if p["id"] == "viejo")
        nuevo = next(p for p in D["productos"] if p["id"] == "nuevo")
        self.assertEqual(viejo["valor"], 0)
        self.assertEqual(nuevo["valor"], 6200)
        self.assertEqual(nuevo["aportado"], 5000)
        self.assertEqual(D["total"]["patrimonio"], 6200)
        i = D["fechas"].index("2024-02-29")
        self.assertEqual(viejo["serie"][i], 6000)   # el día antes del traspaso sigue valiendo lo mismo


class Guardar(unittest.TestCase):
    def setUp(self):
        self.cfg = cartera([fondo("a", "A"), fondo("b", "B"), manual("cuenta", tipo="efectivo")],
                           [mov("2020-01-02", "a", "compra", 100, 1000, mid="m1")])

    def test_guardar_y_unidades(self):
        m = almacen.guarda_movimiento(self.cfg, {"tipo": "traspaso", "producto": "a", "destino": "b",
                                                 "fecha": "2024-03-01", "unidades": "40", "importe": "800",
                                                 "unidadesDestino": "16"})
        self.assertEqual((m["producto"], m["destino"], m["unidades"], m["unidadesDestino"]), ("a", "b", 40, 16))
        self.assertAlmostEqual(almacen.unidades_a(self.cfg, "a", "2024-03-01"), 60)
        self.assertAlmostEqual(almacen.unidades_a(self.cfg, "b", "2024-03-01"), 16)
        self.assertNotIn("total", m)

    def test_todas_marca_total(self):
        m = almacen.guarda_movimiento(self.cfg, {"tipo": "traspaso", "producto": "a", "destino": "b",
                                                 "fecha": "2024-03-01", "unidades": "100", "importe": "2000",
                                                 "unidadesDestino": "40"})
        self.assertTrue(m["total"])

    def test_errores(self):
        casos = [({"destino": "a"}, "mismo producto"), ({"destino": "cuenta"}, "cuenta"),
                 ({"unidades": "101"}, "solo tenías"), ({"unidadesDestino": ""}, "entran")]
        for cambio, texto in casos:
            with self.subTest(texto=texto):
                datos = {"tipo": "traspaso", "producto": "a", "destino": "b", "fecha": "2024-03-01",
                         "unidades": "40", "importe": "800", "unidadesDestino": "16", **cambio}
                with self.assertRaises(almacen.ErrorValidacion) as e:
                    almacen.guarda_movimiento(self.cfg, datos)
                self.assertIn(texto, " ".join(e.exception.errores))

    def test_vender_despues_lo_traspasado(self):
        almacen.guarda_movimiento(self.cfg, {"tipo": "traspaso", "producto": "a", "destino": "b", "fecha": "2024-03-01",
                                             "unidades": "100", "importe": "2000", "unidadesDestino": "40"})
        almacen.guarda_movimiento(self.cfg, {"tipo": "venta", "producto": "b", "fecha": "2024-05-02",
                                             "unidades": "40", "importe": "2100"})
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(self.cfg, {"tipo": "venta", "producto": "a", "fecha": "2024-05-02",
                                                 "unidades": "1", "importe": "20"})

    def test_borrar_el_destino_borra_el_traspaso(self):
        almacen.guarda_movimiento(self.cfg, {"tipo": "traspaso", "producto": "a", "destino": "b", "fecha": "2024-03-01",
                                             "unidades": "100", "importe": "2000", "unidadesDestino": "40"})
        almacen.borra_producto(self.cfg, "b")
        self.assertEqual([m["tipo"] for m in self.cfg["movimientos"]], ["compra"])


class Importar(ConCarpeta):
    def cfg(self):
        return cartera([fondo("a", "A") | {"identificador": "IE00AAAAAAA1"}, fondo("b", "B") | {"identificador": "IE00BBBBBBB2"}],
                       [mov("2020-01-02", "a", "compra", 100, 1000, mid="m1")])

    def test_dos_filas_son_un_traspaso(self):
        from app import importar
        texto = ("fecha;identificador;nombre;tipo_producto;tipo_movimiento;unidades;importe;moneda;comision;nota\n"
                 "2024-03-01;IE00AAAAAAA1;A;fondo;traspaso_salida;100;2000;EUR;;\n"
                 "2024-03-01;IE00BBBBBBB2;B;fondo;traspaso_entrada;40;2000;EUR;;\n")
        filas, error = importar.leer_tabla("pegado.csv", texto)
        self.assertIsNone(error)
        cfg = self.cfg()
        plan = importar.preparar_tabla(cfg, filas, self.carpeta)
        informe = importar.aplicar(cfg, plan)
        self.assertEqual(informe["errores"], [])
        t = [m for m in cfg["movimientos"] if m["tipo"] == "traspaso"]
        self.assertEqual(len(t), 1)
        self.assertEqual((t[0]["producto"], t[0]["destino"], t[0]["unidades"], t[0]["unidadesDestino"]), ("a", "b", 100, 40))
        # Importar otra vez el mismo archivo no lo duplica.
        informe = importar.aplicar(cfg, importar.preparar_tabla(cfg, filas, self.carpeta))
        self.assertEqual(informe["añadidos"], 0)

    def test_salida_sin_entrada_es_error(self):
        from app import importar
        texto = ("fecha;identificador;nombre;tipo_producto;tipo_movimiento;unidades;importe\n"
                 "2024-03-01;IE00AAAAAAA1;A;fondo;traspaso_salida;100;2000\n")
        filas, _ = importar.leer_tabla("pegado.csv", texto)
        plan = importar.preparar_tabla(self.cfg(), filas, self.carpeta)
        self.assertIn("sin su entrada", plan.errores[0]["mensaje"])

    def test_excel_ida_y_vuelta(self):
        from app import importar, plantilla
        cfg = self.cfg()
        almacen.guarda_movimiento(cfg, {"tipo": "traspaso", "producto": "a", "destino": "b", "fecha": "2024-03-01",
                                        "unidades": "100", "importe": "2000", "unidadesDestino": "40"})
        filas, error = importar.leer_tabla("mis_datos.xlsx", plantilla.mis_datos(cfg))
        self.assertIsNone(error)
        limpia = self.cfg()
        limpia["movimientos"] = []
        informe = importar.aplicar(limpia, importar.preparar_tabla(limpia, filas, self.carpeta))
        self.assertEqual(informe["errores"], [])
        self.assertEqual(sorted(m["tipo"] for m in limpia["movimientos"]), ["compra", "traspaso"])


class CuadrarParticipaciones(ConCarpeta):
    """B-01: tras importar traspasos de MyInvestor, las participaciones no cuadraban con el banco."""

    def test_el_ajuste_fija_las_participaciones_sin_tocar_el_coste(self):
        cfg = cartera([fondo("a", "A")], [mov("2020-01-02", "a", "compra", 100, 1000, mid="m1"),
                                          mov("2021-01-04", "a", "compra", 100, 1500, mid="m2")])
        almacen.guarda_movimiento(cfg, {"tipo": "ajuste", "producto": "a", "fecha": "2024-01-02", "unidades": "180"})
        self.assertAlmostEqual(almacen.unidades_a(cfg, "a", "2024-01-02"), 180)
        self.assertAlmostEqual(almacen.unidades_a(cfg, "a", "2023-12-29"), 200)
        with PreciosInventados(PRECIOS):
            D = motor.construir(cfg, self.carpeta, descargar=False)
        a = D["productos"][0]
        self.assertAlmostEqual(a["participaciones"], 180)
        self.assertAlmostEqual(a["aportado"], 2500)        # lo pagado no cambia
        self.assertAlmostEqual(a["valor"], 180 * 20)
        self.assertEqual(a["ajustes"][0]["antes"], 200)
        self.assertIn("Rumbo calculaba 200", cfg["movimientos"][-1]["nota"])

    def test_venta_despues_del_ajuste(self):
        cfg = cartera([fondo("a", "A")], [mov("2020-01-02", "a", "compra", 100, 1000, mid="m1")])
        almacen.guarda_movimiento(cfg, {"tipo": "ajuste", "producto": "a", "fecha": "2023-01-02", "unidades": "90"})
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {"tipo": "venta", "producto": "a", "fecha": "2024-01-02",
                                            "unidades": "95", "importe": "1900"})
        almacen.guarda_movimiento(cfg, {"tipo": "venta", "producto": "a", "fecha": "2024-01-02",
                                        "unidades": "90", "importe": "1800"})
        with PreciosInventados(PRECIOS):
            D = motor.construir(cfg, self.carpeta, descargar=False)
        self.assertAlmostEqual(D["productos"][0]["realizado"], 800)   # 1.800 - 1.000 pagados

    def test_a_mano_no_se_cuadra(self):
        cfg = cartera([manual("piso")])
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {"tipo": "ajuste", "producto": "piso", "fecha": "2024-01-02", "unidades": "1"})


class PlanAManoConLoAportado(ConCarpeta):
    """Issue #7: un plan de pensiones llevado a mano (su valor y lo aportado en «Saldos y valores»,
    sin compras) se traspasa a otro. El destino tiene que heredar lo aportado, no 0 €."""

    VALORES = [{"id": "v1", "producto": "viejo", "fecha": "2022-12-30", "valor": 5200, "aportado": 4800},
               {"id": "v2", "producto": "viejo", "fecha": "2023-12-29", "valor": 6000, "aportado": 5000}]

    def construye(self, productos, movimientos):
        with PreciosInventados(PRECIOS):
            return motor.construir(cartera(productos, movimientos, self.VALORES), self.carpeta, descargar=False)

    def test_entero_a_un_plan_con_precio_automatico(self):
        D = self.construye([manual("viejo", tipo="pension"), fondo("nuevo", "C") | {"tipo": "pension"}],
                           [traspaso("2024-03-01", "viejo", "nuevo", 0, 6200, 248, total=True)])
        viejo = next(p for p in D["productos"] if p["id"] == "viejo")
        nuevo = next(p for p in D["productos"] if p["id"] == "nuevo")
        self.assertEqual(viejo["valor"], 0)
        self.assertIsNone(viejo["aportado"])
        self.assertAlmostEqual(nuevo["aportado"], 5000)           # hereda lo aportado
        self.assertAlmostEqual(nuevo["participaciones"], 248)
        self.assertAlmostEqual(D["total"]["aportado"], 5000)
        self.assertEqual(D["total"]["realizado"], 0)
        i = D["fechas"].index("2024-02-29")
        self.assertEqual(viejo["serie"][i], 6000)                 # hasta la víspera, su valor de siempre

    def test_entero_a_otro_plan_a_mano(self):
        D = self.construye([manual("viejo", tipo="pension"), manual("nuevo", tipo="pension")],
                           [traspaso("2024-03-01", "viejo", "nuevo", 0, 6200, 0, total=True)])
        nuevo = next(p for p in D["productos"] if p["id"] == "nuevo")
        self.assertAlmostEqual(nuevo["aportado"], 5000)
        self.assertAlmostEqual(nuevo["valor"], 6200)
        self.assertAlmostEqual(D["total"]["patrimonio"], 6200)

    def test_la_mitad(self):
        D = self.construye([manual("viejo", tipo="pension"), manual("nuevo", tipo="pension")],
                           [traspaso("2024-03-01", "viejo", "nuevo", 0, 3000, 0)])
        viejo = next(p for p in D["productos"] if p["id"] == "viejo")
        nuevo = next(p for p in D["productos"] if p["id"] == "nuevo")
        self.assertAlmostEqual(viejo["valor"], 3000)
        self.assertAlmostEqual(viejo["aportado"], 2500)           # la mitad de lo aportado se queda
        self.assertAlmostEqual(nuevo["aportado"], 2500)           # y la otra mitad se va
        self.assertAlmostEqual(D["total"]["aportado"], 5000)
