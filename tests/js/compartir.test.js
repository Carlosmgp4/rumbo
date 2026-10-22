// «Compartir mi mes»: cada formato se dibuja sin fallar, también en los casos raros.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Un <canvas> de mentira: apunta lo que se dibuja y mide el texto a ojo.
class Path2D { constructor(d) { this.d = d; } }
global.Path2D = Path2D;
function lienzoFalso() {
  const textos = [];
  const ctx = new Proxy({ font: "", letterSpacing: "0px" }, {
    get(obj, k) {
      if (k in obj) return obj[k];
      if (k === "measureText") return s => ({ width: String(s).length * (parseInt(String(obj.font).split(" ")[1], 10) || 10) * 0.55 });
      if (k === "fillText") return (s, x, y) => { textos.push({ s: String(s), x, y }); };
      return () => {};
    },
    set(obj, k, v) { obj[k] = v; return true; },
  });
  return { ctx, textos };
}

const C = require(path.join(__dirname, "..", "..", "app", "web", "calculos.js"));
const Comp = require(path.join(__dirname, "..", "..", "app", "web", "compartir.js"));

function datos(cambios = {}) {
  return {
    mes: "2026-10", ano: 2026, nombreMes: "octubre", etiqueta: "Octubre 2026", enCurso: false, ultimo: true,
    rentMes: 0.024, anoPct: 0.118, desdeInicio: 0.31, serieAno: [100, 102, 101, 105, 111.8], etqIni: "Enero", etqFin: "Octubre",
    racha: 27, tir: 0.096, patrimonio: 58150, cambioEur: 1912, aportadoEur: 600, mercadoEur: 1312,
    crecimiento: 0.034, porAportado: 0.011, porMercado: 0.023, ...cambios,
  };
}

test("cada formato se dibuja con sus cifras", () => {
  for (const formato of Object.keys(Comp.FORMATOS)) {
    const { ctx, textos } = lienzoFalso();
    Comp.dibuja(ctx, formato, datos(), { qr: "repo" });
    const todo = textos.map(t => t.s).join(" | ");
    assert.match(todo, /\+2,4 %/, formato);
    assert.match(todo, /RUMBO/, formato);
    assert.doesNotMatch(todo, /58\.150|1\.912/, formato + ": sin euros por defecto");
    for (const t of textos) {
      assert.ok(t.x >= 0 && t.x <= Comp.FORMATOS[formato].w, `${formato}: «${t.s}» se sale por el lado`);
      assert.ok(t.y > 0 && t.y <= Comp.FORMATOS[formato].h, `${formato}: «${t.s}» se sale por abajo`);
    }
  }
});

test("los euros solo salen si se piden (y solo en el resumen)", () => {
  const { ctx, textos } = lienzoFalso();
  Comp.dibuja(ctx, "resumen", datos(), { euros: true });
  const todo = textos.map(t => t.s).join(" | ");
  assert.match(todo, /58\.150 €/);
  assert.match(todo, /\+600 €/);
});

test("casos raros: mes en negativo, sin racha, sin curva, primer mes", () => {
  const raros = [
    datos({ rentMes: -0.051, mercadoEur: -800, porMercado: -0.05, crecimiento: -0.02 }),
    datos({ racha: 0, tir: null, ultimo: false }),
    datos({ serieAno: [100], anoPct: null }),
    datos({ crecimiento: null, porAportado: null, porMercado: null, aportadoEur: 0, mercadoEur: 0, desdeInicio: null }),
  ];
  for (const d of raros) for (const formato of Object.keys(Comp.FORMATOS)) {
    const { ctx, textos } = lienzoFalso();
    Comp.dibuja(ctx, formato, d, { qr: "canal" });   // ya no existe: cae en el de Rumbo
    assert.ok(textos.length > 5);
  }
  const { ctx, textos } = lienzoFalso();
  Comp.dibuja(ctx, "resumen", raros[0], {});
  assert.match(textos.map(t => t.s).join(" | "), /−5,1 %/);
  assert.match(textos.map(t => t.s).join(" | "), /Lo restó el mercado/);
});

test("formato de las cifras", () => {
  assert.equal(Comp.pct(0.024), "+2,4 %");
  assert.equal(Comp.pct(-0.0051, 2), "−0,51 %");
  assert.equal(Comp.pct(null), "—");
  assert.equal(Comp.eur(58150), "58.150 €");
  assert.equal(Comp.eur(-800, true), "−800 €");
});

test("los QR están completos", () => {
  for (const [k, q] of Object.entries(Comp.QR)) {
    const filas = new Set([...q.d.matchAll(/M\d+ (\d+)h/g)].map(m => +m[1]));
    assert.equal(filas.size, q.n, k);                  // hay módulos en todas las filas
    assert.ok(q.d.startsWith("M0 0h7"), k);            // y empieza por la esquina de posición
  }
});

test("compartir mi mes con datos del panel de verdad (forma de D)", () => {
  const D = {
    fechas: ["2025-12-31", "2026-01-30"], indiceCartera: [100, 103], fechaExtracto: "2026-01-30", total: { tir: 0.05 },
    resumenMensual: [{ mes: "2026-01", inicio: 1000, fin: 1100, aportado: 70, mercado: 30, nuevo: 0, rentabilidad: 0.03 }],
  };
  const d = C.resumenParaCompartir(D);
  const { ctx, textos } = lienzoFalso();
  Comp.dibuja(ctx, "story", d, {});
  assert.match(textos.map(t => t.s).join(" | "), /Enero 2026/);
});

test("tres temas (oscuro, claro y azul) para las tres imágenes", () => {
  assert.deepEqual(Object.keys(Comp.TEMAS), ["oscuro", "claro", "azul"]);
  for (const tema of Object.keys(Comp.TEMAS)) for (const formato of Object.keys(Comp.FORMATOS)) {
    const fondos = [];
    const { ctx, textos } = lienzoFalso();
    const fill = ctx.fillRect;
    Object.defineProperty(ctx, "fillRect", { value: () => fondos.push(ctx.fillStyle) });
    Comp.dibuja(ctx, formato, datos(), { tema });
    assert.equal(fondos[0], Comp.TEMAS[tema].fondo, `${formato}/${tema}: el fondo es el del tema`);
    assert.match(textos.map(t => t.s).join(" | "), /\+2,4 %/, `${formato}/${tema}`);
    void fill;
  }
  // un tema que no existe no rompe: usa el oscuro
  const { ctx } = lienzoFalso();
  Comp.dibuja(ctx, "mini", datos(), { tema: "rosa" });
});

test("solo hay un QR: el de Rumbo", () => {
  assert.deepEqual(Object.keys(Comp.QR), ["repo"]);
});
