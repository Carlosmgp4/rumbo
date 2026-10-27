// Pruebas de las cuentas que hace el panel en el navegador (app/web/calculos.js).
// Se lanzan solas con el resto (tests/test_calculos_js.py) o a mano:  node tests/js/calculos.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const C = require(path.join(__dirname, "..", "..", "app", "web", "calculos.js"));

const cerca = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} no está cerca de ${b}`);

test("leeImporte entiende cómo escribe la gente", () => {
  assert.equal(C.leeImporte("1.900"), 1900);        // mil novecientos
  assert.equal(C.leeImporte("1900,5"), 1900.5);
  assert.equal(C.leeImporte("1.900,50 €"), 1900.5);
  assert.equal(C.leeImporte("1900.5"), 1900.5);     // antes daba 19.005
  assert.equal(C.leeImporte("12.345.678"), 12345678);
  assert.ok(Number.isNaN(C.leeImporte("")));
  assert.ok(Number.isNaN(C.leeImporte("mil")));
});

test("TIR: un 10 % en un año y las pérdidas", () => {
  const t0 = Date.parse("2023-01-01"), t1 = Date.parse("2024-01-01");
  cerca(C.xirr([{ t: t0, v: -100 }, { t: t1, v: 110 }]), 0.10, 0.002);
  cerca(C.xirr([{ t: t0, v: -100 }, { t: t1, v: 80 }]), -0.20, 0.002);
  assert.equal(C.xirr([{ t: t0, v: -100 }]), null);
  assert.equal(C.xirr([{ t: t0, v: 100 }, { t: t1, v: 50 }]), null);   // sin dinero puesto no hay TIR
});

const D = {
  fechas: ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"],
  fechaExtracto: "2024-01-04",
  aportacionesMensuales: { meses: ["2023-11", "2023-12", "2024-01"], porProducto: { a: [100, 0, 200], b: [0, 50, 50] } },
};
const A = { id: "a", valor: 1100, aportado: 1000, realizado: 20, serie: [1000, 1200, 900, 1100], serieAportado: [1000, 1000, 1000, 1000],
  aportaciones: [{ importe: 1000 }], flujos: [["2023-01-04", -1000]] };
const B = { id: "b", valor: 500, aportado: null, serie: [null, 500, 500, 500], serieAportado: [] };

test("métricas: valor, plusvalía, ritmo, racha y peor caída", () => {
  const m = C.metricas([A, B], D);
  assert.equal(m.valor, 1600);
  assert.equal(m.aportado, 1000);
  assert.equal(m.plusvalia, 100);                    // solo de lo que tiene coste
  cerca(m.rentabilidad, 0.1);
  assert.equal(m.realizado, 20);
  assert.equal(m.numAportaciones, 1);
  cerca(m.ritmo, (100 + 50 + 250) / 3);
  assert.equal(m.racha, 3);                          // noviembre, diciembre y enero seguidos
  assert.deepEqual(m.serie, [1000, 1700, 1400, 1600]);
  cerca(m.caida, 1400 / 1700 - 1, 1e-9);
  assert.equal(m.caidaFecha, "2024-01-03");
  cerca(m.tir, 0.10, 0.003);                         // 1.000 → 1.100 en un año
});

test("métricas con el valor en vivo y con la cartera filtrada", () => {
  const vivo = p => (p.id === "a" ? 1210 : p.valor);
  assert.equal(C.metricas([A, B], D, vivo).plusvalia, 210);
  const soloB = C.metricas([B], D);
  assert.equal(soloB.aportado, 0);
  assert.equal(soloB.plusvalia, null);
  assert.equal(soloB.racha, 2);                      // las aportaciones de b: diciembre y enero
});

test("países y sectores: cada producto pesa lo que vale, y solo su parte en bolsa", () => {
  const prods = [
    { valor: 6000, exposicion: { rv: 1, paises: [["Estados Unidos", 70], ["Japón", 30]], sectores: [["Tecnología", 100]] } },
    { valor: 4000, exposicion: { rv: 0.5, paises: [["Japón", 100]], sectores: [["Salud", 100]] } },   // mixto
    { valor: 1000, tipoClave: "efectivo" },                                                           // cuenta
    { valor: 500, tipoClave: "pension", corto: "Plan" },                                              // sin datos
    { valor: 0, exposicion: { paises: [["China", 100]], sectores: [] } },                              // vendido
  ];
  const r = C.agregaExposicion(prods);
  assert.equal(r.enBolsa, 8000);
  assert.equal(r.fuera, 3000);                       // 2.000 de renta fija del mixto + la cuenta
  assert.equal(r.sinDatos, 500);
  assert.deepEqual(r.sinNombre, ["Plan"]);
  assert.deepEqual(r.paises, [["Estados Unidos", 52.5], ["Japón", 47.5]]);
  assert.deepEqual(r.sectores, [["Tecnología", 75], ["Salud", 25]]);
});

test("países: los 9 mayores y el resto en «Otros» (también el «Resto» de las fichas)", () => {
  // 12 países que suman 100 % (como las fichas de Morningstar) y un «Resto» vacío.
  const paises = Array.from({ length: 12 }, (_, i) => ["P" + i, (12 - i) * 100 / 78]).concat([["Resto", 0]]);
  const r = C.agregaExposicion([{ valor: 1000, exposicion: { paises, sectores: [] } }]);
  assert.equal(r.paises.length, 10);
  assert.equal(r.paises[9][0], "Otros");
  cerca(r.paises.reduce((a, x) => a + x[1], 0), 100, 0.3);
  assert.deepEqual(C.agregaExposicion([{ valor: 100, tipoClave: "cripto" }]).paises, []);
});

test("liquidez: cuentas y monetarios, o lo que marques", () => {
  assert.ok(C.esLiquidez({ tipoClave: "efectivo" }));
  assert.ok(C.esLiquidez({ tipoClave: "fondo", clase: "Mercado Monetario Corto Plazo EUR" }));
  assert.ok(!C.esLiquidez({ tipoClave: "fondo", clase: "RV Global" }));
  assert.ok(!C.esLiquidez({ tipoClave: "efectivo", liquidez: false }));   // lo que dice el usuario manda
  assert.ok(C.esLiquidez({ tipoClave: "fondo", liquidez: true }));
  const prods = [{ tipoClave: "efectivo", valor: 2500 }, { tipoClave: "fondo", clase: "Monetario", valor: 7400 },
    { tipoClave: "fondo", valor: 30000 }, { tipoClave: "efectivo", valor: 0 }];
  const r = C.resumenLiquidez(prods, { modo: "meses", meses: 6, gastoMensual: 1500, importe: 9000 });
  assert.equal(r.liquidez, 9900);
  assert.equal(r.productos.length, 2);
  assert.equal(r.productos[0].valor, 7400);           // de mayor a menor
  assert.equal(r.sobra, 900);
  cerca(r.meses, 6.6);
  assert.equal(r.pct, 1);
  const corto = C.resumenLiquidez(prods, { modo: "importe", importe: 20000 });
  assert.equal(corto.sobra, -10100);                  // le falta para completarlo
  assert.equal(corto.meses, null);
  cerca(corto.pct, 0.495);
  assert.equal(C.resumenLiquidez(prods, null).objetivo, null);
});

const RV = "Renta variable", RF = "Renta fija";
const O = { por: "clase", pesos: { [RV]: 80, [RF]: 20 }, vigilar: 3, rebalancear: 5, conEfectivo: false };
const CARTERA = [
  { clase: "RV Global Cap. Grande Blend", valor: 6000, tipoClave: "fondo" },
  { clase: "RV Global Emergente", valor: 2000, tipoClave: "fondo" },
  { valor: 500, tipoClave: "accion", clase: "Renta variable" },
  { clase: "RF Diversificada EUR", valor: 1500, tipoClave: "fondo" },
  { clase: "Efectivo", valor: 5000, tipoClave: "efectivo" },                           // no cuenta: sin %
  { clase: "RV Global", valor: 999, tipoClave: "fondo", largoPlazo: false },           // no cuenta
];

test("reparto objetivo: grupos, desviación y semáforo", () => {
  const grupos = C.gruposReparto(CARTERA, O);
  assert.deepEqual(grupos.map(g => [g.nombre, g.valor]), [[RV, 8500], [RF, 1500]]);   // toda la bolsa junta
  assert.equal(grupos[0].productos.length, 3);
  const { total, filas, peor } = C.filasReparto(grupos, O);
  assert.equal(total, 10000);
  assert.deepEqual(filas.map(f => f.nombre), [RV, RF]);
  cerca(filas[0].desv, 5);
  assert.equal(filas[0].estado, "vigilar");           // 5 puntos: aún «vigilar»
  cerca(filas[1].cuadrar, 500);
  assert.equal(peor.nombre, RV);
  const mucho = C.filasReparto(C.gruposReparto([{ clase: "RV", valor: 9000 }, { clase: "RF", valor: 1000 }], O), O);
  assert.equal(mucho.filas[0].estado, "rebalancear");
  const conCuentas = C.gruposReparto(CARTERA, { ...O, conEfectivo: true });
  assert.ok(conCuentas.some(g => g.nombre === "Efectivo"));
  const falta = C.gruposReparto([{ clase: "RV", valor: 100 }], O);
  assert.deepEqual(falta.map(g => [g.nombre, g.valor]), [[RV, 100], [RF, 0]]);   // el que aún no tienes, a 0
});

test("reparto objetivo: lo que eliges a mano manda sobre la regla general", () => {
  const lista = [
    { id: "w", corto: "World", clase: "RV Global", valor: 800, tipoClave: "fondo" },
    { id: "b", corto: "Bitcoin", valor: 100, tipoClave: "cripto" },
    { id: "m", corto: "Monetario", clase: "Monetario EUR", valor: 300, tipoClave: "fondo", largoPlazo: false },
    { id: "c", corto: "Cuenta", valor: 500, tipoClave: "efectivo" },
    { id: "d", corto: "Hipoteca", valor: 900, tipoClave: "deuda" },
  ];
  const o = { por: "clase", pesos: { [RV]: 90, Monetario: 10 }, vigilar: 3, rebalancear: 5,
    cuenta: { b: false, m: true, d: true } };
  assert.equal(C.cuentaPorDefecto(lista[1], o), true);       // la regla general sí la contaría
  assert.equal(C.cuentaEnReparto(lista[1], o), false);       // pero la has quitado
  assert.equal(C.cuentaEnReparto(lista[2], o), true);        // el monetario a corto plazo, metido a mano
  assert.equal(C.cuentaEnReparto(lista[3], o), false);       // la cuenta: sin % y sin elegirla
  assert.equal(C.cuentaEnReparto(lista[4], o), false);       // las deudas nunca
  assert.deepEqual(C.gruposReparto(lista, o).map(g => [g.nombre, g.valor]), [[RV, 800], ["Monetario", 300]]);
});

test("reparto objetivo: tipos de activo sencillos", () => {
  const t = p => C.tipoReparto(p);
  assert.equal(t({ tipoClave: "fondo", clase: "Mercado Monetario Corto Plazo EUR" }), "Monetario");
  assert.equal(t({ tipoClave: "fondo", clase: "RF Bonos Gobierno EUR" }), RF);
  assert.equal(t({ tipoClave: "fondo", clase: "Mixtos Moderados EUR" }), "Mixtos");
  assert.equal(t({ tipoClave: "etf", clase: "Global Large-Cap Blend Equity" }), RV);
  assert.equal(t({ tipoClave: "etf" }), RV);
  assert.equal(t({ tipoClave: "cripto", clase: "Criptoactivos" }), "Criptoactivos");
  assert.equal(t({ tipoClave: "efectivo", clase: "Efectivo" }), "Efectivo");
  assert.equal(t({ tipoClave: "pension", clase: "Jubilación" }), "Planes de pensiones");
  assert.equal(t({ tipoClave: "pension", clase: "RV Global Cap. Grande Blend" }), RV);
  assert.equal(t({ tipoClave: "fondo", clase: "Fondos" }), "Otros");
});

test("reparto objetivo: uno guardado por categoría se suma en su tipo, y el efectivo con % cuenta", () => {
  const viejo = { por: "clase", vigilar: 3, rebalancear: 5, conEfectivo: false,
    pesos: { "RV Global Cap. Grande Blend": 60, "RV Global Emergente": 20, "Mercado Monetario Corto Plazo EUR": 10, Efectivo: 10 } };
  const o = C.normalizaReparto(viejo);
  assert.deepEqual(o.pesos, { [RV]: 80, Monetario: 10, Efectivo: 10 });
  assert.equal(o.conEfectivo, true);
  const g = C.gruposReparto([...CARTERA, { clase: "Mercado Monetario Corto Plazo EUR", valor: 1000, tipoClave: "fondo" }], viejo);
  assert.deepEqual(g.map(x => [x.nombre, x.valor]).sort(), [["Efectivo", 5000], ["Monetario", 1000], [RF, 1500], [RV, 9499]].sort());
  // Por producto no se toca; y una cuenta con % cuenta, sin % no.
  const porProd = { por: "producto", pesos: { Cuenta: 10, World: 90 }, vigilar: 3, rebalancear: 5 };
  assert.equal(C.normalizaReparto(porProd), porProd);
  const lista = [{ corto: "World", valor: 900, tipoClave: "fondo" }, { corto: "Cuenta", valor: 100, tipoClave: "efectivo" },
    { corto: "Otra", valor: 50, tipoClave: "efectivo" }];
  assert.deepEqual(C.gruposReparto(lista, porProd).map(x => x.nombre).sort(), ["Cuenta", "World"]);
});

test("reparto objetivo: la aportación va a lo que falta, sin vender", () => {
  const grupos = [{ nombre: RV, valor: 8500 }, { nombre: RF, valor: 1500 }];
  // Con 500 €: el objetivo de RF es 20 % de 10.500 = 2.100 → le faltan 600; todo a RF.
  const r = C.repartirAportacion(grupos, O.pesos, 500);
  cerca(r[0], 0); cerca(r[1], 500);
  // Con 5.000 €: total 15.000 → RV 12.000 (faltan 3.500), RF 3.000 (faltan 1.500): justo cuadra.
  const r2 = C.repartirAportacion(grupos, O.pesos, 5000);
  cerca(r2[0], 3500); cerca(r2[1], 1500);
  // Si sobra después de cuadrar, el resto va según el objetivo; siempre suma lo aportado.
  const r3 = C.repartirAportacion([{ nombre: RV, valor: 800 }, { nombre: RF, valor: 200 }], O.pesos, 1000);
  cerca(r3[0], 800); cerca(r3[1], 200);
  for (const a of [1, 333, 1900, 25000]) cerca(C.repartirAportacion(grupos, O.pesos, a).reduce((x, y) => x + y, 0), a);
  assert.deepEqual(C.repartirAportacion(grupos, O.pesos, 0), [0, 0]);
  assert.deepEqual(C.repartirAportacion(grupos, O.pesos, NaN), [0, 0]);
});

test("rentabilidad de un periodo: sin el efecto de cuándo entra el dinero", () => {
  // Compras 1000 el día 0 (cierra en 990), sube un 10 %, metes 1000 más y baja un 5 %.
  const valores = [990, 1089, 2089, 1984.55], aportado = [1000, 1000, 2000, 2000];
  const todo = C.rentabilidadPeriodo(valores, aportado);
  cerca(todo.serie[0], -0.01, 1e-9);                   // el día de la compra: de lo pagado al cierre
  cerca(todo.serie[2], 0.089, 1e-9);                   // los 1000 nuevos no cuentan como subida
  cerca(todo.total, 0.99 * 1.1 * 0.95 - 1, 1e-9);
  cerca(todo.ganado, 1984.55 - 2000, 1e-9);            // en euros: valor menos lo puesto
  cerca(todo.caida, -0.05, 1e-9);
  const desde1 = C.rentabilidadPeriodo(valores, aportado, 1);
  assert.equal(desde1.serie[0], null);
  assert.equal(desde1.serie[1], 0);                     // el periodo empieza en 0
  cerca(desde1.total, 0.95 - 1, 1e-9);
  cerca(desde1.ganado, (1984.55 - 1089) - 1000, 1e-9);  // sin contar los 1000 que metiste
  // El periodo empieza el mismo día de la primera compra.
  const tarde = C.rentabilidadPeriodo([null, 990, 1089], [0, 1000, 1000], 1);
  cerca(tarde.total, 0.99 * 1.1 - 1, 1e-9);
  cerca(tarde.ganado, 89, 1e-9);
});

test("aportaciones periódicas: avisa de las que faltan desde la última", () => {
  const ids = ["a", "b"];
  const lista = [
    { producto: "a", importe: 200, dia: 5, ultima: "2026-08-05" },     // faltan sep y oct
    { producto: "b", importe: 50, dia: 31, ultima: "2026-01-31" },     // meses cortos: el último día
    { producto: "zz", importe: 10, dia: 1, ultima: "2026-01-01" },     // producto borrado: nada
    { producto: "a", importe: 10, dia: 20, ultima: "2026-09-20" },     // la de octubre aún no toca
  ];
  const p = C.periodicasPendientes(lista, ids, "2026-10-16");
  assert.deepEqual(p[0], { producto: "a", importe: 200, dia: 5, desde: "2026-09-05", cuantas: 2 });
  assert.equal(p[1].desde, "2026-02-28");
  assert.equal(p[1].cuantas, 8);                                       // feb a sep (el 31-oct aún no)
  assert.equal(p.length, 2);
  assert.deepEqual(C.periodicasPendientes(undefined, ids, "2026-10-16"), []);
  assert.deepEqual(C.periodicasPendientes([{ producto: "a", dia: 5, ultima: "<script>" }], ids, "2026-10-16"), []);
});

// Un año inventado: índice que sube 1 punto al mes, y un mes de octubre en curso.
function datosDeMeses() {
  const fechas = [], indice = [];
  const dias = ["2025-12-31", "2026-01-31", "2026-02-27", "2026-03-31", "2026-04-30", "2026-05-29", "2026-06-30",
    "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-15"];
  dias.forEach((f, i) => { fechas.push(f); indice.push(100 + i); });
  const resumenMensual = ["2026-08", "2026-09", "2026-10"].map((mes, i) => ({
    mes, inicio: 10000 + i * 500, fin: 10500 + i * 500, aportado: i === 2 ? 0 : 300, mercado: 200, nuevo: 0, rentabilidad: 0.02,
  }));
  return { fechas, indiceCartera: indice, resumenMensual, fechaExtracto: "2026-10-15", total: { tir: 0.091 } };
}

test("compartir mi mes: las cifras del mes, del año y la racha", () => {
  const D = datosDeMeses();
  const d = C.resumenParaCompartir(D);                 // por defecto, el último mes
  assert.equal(d.mes, "2026-10");
  assert.equal(d.etiqueta, "Octubre 2026");
  assert.equal(d.enCurso, true);                       // datos al 15: el mes no ha acabado
  assert.equal(d.rentMes, 0.02);
  assert.ok(Math.abs(d.anoPct - 0.10) < 1e-9);         // de 100 (31-dic) a 110
  assert.deepEqual(d.serieAno, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  assert.equal(d.etqIni, "Enero");
  assert.equal(d.racha, 2);                            // octubre aún sin aportar: cuenta ago y sep
  assert.equal(d.tir, 0.091);
  assert.ok(Math.abs(d.crecimiento - 500 / 11000) < 1e-9);
  const sep = C.resumenParaCompartir(D, 1);            // un mes ya cerrado
  assert.equal(sep.enCurso, false);
  assert.equal(sep.tir, null);                         // la TIR es de hoy, no de septiembre
  assert.ok(Math.abs(sep.anoPct - 0.09) < 1e-9);
  assert.equal(C.resumenParaCompartir({ resumenMensual: [] }), null);
});

test("compartir mi mes: si empezaste este año, la curva sale desde tu primer día", () => {
  const D = datosDeMeses();
  D.fechas = D.fechas.slice(4);                        // empieza el 30 de abril
  D.indiceCartera = D.indiceCartera.slice(4);
  const d = C.resumenParaCompartir(D);
  assert.equal(d.etqIni, "Abril");
  assert.equal(d.serieAno[0], 104);
  assert.ok(Math.abs(d.anoPct - (110 / 104 - 1)) < 1e-9);
});
