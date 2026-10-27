/* ============================================================
   calculos.js  ·  Las cuentas que hace el panel en el navegador
   ------------------------------------------------------------
   Sin dibujar nada: solo números. Así se pueden probar solas
   (tests/js/calculos.test.js, con Node) y app.js las usa tal cual.
   ============================================================ */
(function (raiz, fabrica) {
  "use strict";
  const C = fabrica();
  if (typeof module === "object" && module.exports) module.exports = C;
  else raiz.Calculos = C;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const valorPorDefecto = p => p.valor || 0;

  /* ---------------------------------------------- importes que escribe la gente */
  /** "1.900" (mil novecientos), "1900,5", "1.900,50" o "1900.5" -> número (NaN si no lo es). */
  function leeImporte(texto) {
    let t = String(texto == null ? "" : texto).replace(/[€\s]/g, "");
    if (!t) return NaN;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  }

  /* ---------------------------------------------- TIR (XIRR) */
  /** flujos = [{t: milisegundos, v: euros}], negativo lo que sale de tu bolsillo. */
  function xirr(flujos) {
    const f = flujos.filter(x => x.v);
    if (f.length < 2) return null;
    if (!(f.some(x => x.v < 0) && f.some(x => x.v > 0))) return null;
    const t0 = Math.min.apply(null, f.map(x => x.t));
    const ANO = 365 * 24 * 3600 * 1000;
    const van = tasa => {
      let s = 0;
      const base = 1 + tasa;
      if (base <= 1e-9) return Infinity;
      for (const x of f) s += x.v / Math.pow(base, (x.t - t0) / ANO);
      return s;
    };
    let lo = -0.9999, hi = 10, vlo = van(lo), vhi = van(hi);
    if (!isFinite(vlo) || !isFinite(vhi) || vlo * vhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, vm = van(mid);
      if (Math.abs(vm) < 1e-7) return mid;
      if (vlo * vm <= 0) hi = mid; else { lo = mid; vlo = vm; }
    }
    return (lo + hi) / 2;
  }

  /* ---------------------------------------------- las cifras del panel */
  /**
   * Métricas de un conjunto de componentes. Se recalcula todo para que, al apagar
   * series, cada cifra del panel siga cuadrando. D lleva fechas, fechaExtracto y
   * aportacionesMensuales; valorDe da el valor de cada producto (en vivo si lo hay).
   */
  function metricas(lista, D, valorDe = valorPorDefecto) {
    const n = D.fechas.length;
    const serie = new Array(n).fill(0);
    const serieAp = new Array(n).fill(0);
    let valor = 0, aportado = 0, valorConCoste = 0, valorTir = 0, nAp = 0, realizado = 0;
    const flujos = [];

    lista.forEach(p => {
      const s = p.serie || [], sa = p.serieAportado || [];
      for (let i = 0; i < n; i++) {
        if (s[i] != null) serie[i] += s[i];
        if (sa[i] != null) serieAp[i] += sa[i];
      }
      valor += valorDe(p);
      realizado += p.realizado || 0;
      if (p.aportado != null && p.aportado > 0) {
        aportado += p.aportado;
        valorConCoste += valorDe(p);
        nAp += (p.aportaciones || []).filter(a => a.importe).length;
      }
      // La TIR usa todo el dinero que entró y salió (compras, ventas, dividendos y
      // comisiones), y solo el valor de los productos que tienen esos movimientos.
      if (p.flujos && p.flujos.length) {
        p.flujos.forEach(([f, v]) => flujos.push({ t: Date.parse(f), v }));
        valorTir += valorDe(p);
      }
    });

    const plusvalia = aportado ? valorConCoste - aportado : null;
    const tir = flujos.length
      ? xirr(flujos.concat([{ t: Date.parse(D.fechaExtracto), v: valorTir }]))
      : null;

    const am = D.aportacionesMensuales || { meses: [], porProducto: {} };
    const ids = new Set(lista.map(p => p.id));
    const porMes = am.meses.map((_, i) => Object.keys(am.porProducto)
      .reduce((a, id) => a + (ids.has(id) ? (am.porProducto[id][i] || 0) : 0), 0));
    const mesesConAp = am.meses.filter((m, i) => porMes[i] > 0);
    const ult12 = porMes.slice(-12);
    const ritmo = ult12.length ? ult12.reduce((a, b) => a + b, 0) / ult12.length : 0;

    let racha = 0;
    if (mesesConAp.length) {
      const set = new Set(mesesConAp);
      const ult = mesesConAp[mesesConAp.length - 1].split("-");
      let y = +ult[0], mo = +ult[1];
      while (set.has(y + "-" + String(mo).padStart(2, "0"))) {
        racha++; mo--; if (mo === 0) { mo = 12; y--; }
      }
    }

    let pico = 0, caida = 0, caidaFecha = null;
    for (let i = 0; i < n; i++) {
      pico = Math.max(pico, serie[i]);
      if (pico > 0) {
        const c = serie[i] / pico - 1;
        if (c < caida) { caida = c; caidaFecha = D.fechas[i]; }
      }
    }

    return {
      valor, aportado, valorConCoste, plusvalia, realizado,
      rentabilidad: aportado ? plusvalia / aportado : null,
      tir, numAportaciones: nAp, ritmo, racha, caida, caidaFecha,
      serie, serieAportado: serieAp,
    };
  }

  /* ---------------------------------------------- dónde está tu dinero: países y sectores */
  const FUERA_DE_BOLSA = ["efectivo", "cripto", "commodity", "inmueble", "bono", "p2p"];

  /**
   * Suma el reparto por países y sectores de cada producto según lo que vale. Solo la
   * parte en bolsa de cada uno (rv); lo demás va a «fuera», y lo que no tiene datos a
   * «sinDatos». Devuelve los 9 mayores y «Otros», en % de lo que tienes en bolsa.
   */
  function agregaExposicion(lista, valorDe = valorPorDefecto) {
    let enBolsa = 0, fuera = 0, sinDatos = 0;
    const paises = new Map(), sectores = new Map(), sinNombre = [];
    const suma = (m, n, v) => m.set(n, (m.get(n) || 0) + v);
    lista.forEach(p => {
      const v = valorDe(p);
      if (!(v > 0)) return;
      const e = p.exposicion;
      // Cuentas, cripto, oro, pisos…: no están en bolsa aunque no tengan ficha.
      if (!e && FUERA_DE_BOLSA.includes(p.tipoClave)) { fuera += v; return; }
      if (!e) { sinDatos += v; sinNombre.push(p.corto || p.nombre); return; }
      const rv = e.rv == null ? 1 : e.rv, vb = v * rv;
      enBolsa += vb;
      fuera += v - vb;
      (e.paises || []).forEach(([n, pct]) => suma(paises, n === "Resto" ? "Otros" : n, vb * pct / 100));
      (e.sectores || []).forEach(([n, pct]) => suma(sectores, n === "Resto" ? "Otros" : n, vb * pct / 100));
    });
    const ordena = m => {
      if (!(enBolsa > 0)) return [];
      const filas = [...m.entries()].filter(([n]) => n !== "Otros").sort((a, b) => b[1] - a[1]);
      const otros = (m.get("Otros") || 0) + filas.slice(9).reduce((a, x) => a + x[1], 0);
      return filas.slice(0, 9).concat(otros > 0 ? [["Otros", otros]] : []).map(([n, v]) => [n, +(v / enBolsa * 100).toFixed(1)]);
    };
    return { enBolsa, fuera, sinDatos, sinNombre, paises: ordena(paises), sectores: ordena(sectores) };
  }

  /* ---------------------------------------------- liquidez y fondo de emergencia */
  /** Liquidez: lo que puedes tener en el banco en días (cuentas y monetarios, o lo que marques). */
  const esLiquidez = p => p.liquidez != null ? !!p.liquidez
    : p.tipoClave === "efectivo" || /monetari/i.test([p.clase, p.nombre, p.tipo].join(" "));

  function resumenLiquidez(lista, colchon, valorDe = valorPorDefecto) {
    const productos = lista.filter(p => esLiquidez(p) && valorDe(p) > 0).sort((a, b) => valorDe(b) - valorDe(a));
    const liquidez = productos.reduce((a, p) => a + valorDe(p), 0);
    const r = { productos, liquidez, objetivo: null, cubierto: null, sobra: null, meses: null, pct: null };
    if (!colchon || !(colchon.importe > 0)) return r;
    r.objetivo = colchon.importe;
    r.cubierto = Math.min(liquidez, colchon.importe);
    r.sobra = liquidez - colchon.importe;
    r.meses = colchon.modo === "meses" && colchon.gastoMensual ? liquidez / colchon.gastoMensual : null;
    r.pct = Math.min(1, liquidez / colchon.importe);
    return r;
  }

  /* ---------------------------------------------- reparto objetivo y rebalanceo */
  // Por tipo de activo, pocos cubos y claros: la categoría de Morningstar («RV Global Emergente»,
  // «Mercado Monetario Corto Plazo EUR»…) es demasiado fina y parte la bolsa en trozos.
  const TIPOS_REPARTO = ["Renta variable", "Renta fija", "Mixtos", "Monetario", "Efectivo", "Criptoactivos",
    "Materias primas", "Inmuebles", "P2P y crowdfunding", "Planes de pensiones", "Otros"];
  const POR_TEXTO = [
    [/monetari|money market|liquidez/i, "Monetario"],
    [/mixt|allocation|multiactivo/i, "Mixtos"],
    [/^rf\b|renta fija|bond|bonos|fixed income|deuda/i, "Renta fija"],
    [/^rv\b|renta variable|equity|acciones|bolsa|stock/i, "Renta variable"],
    [/inmobiliari|property|real estate|inmueble/i, "Inmuebles"],
    [/commodit|materias primas|metales|oro\b|gold/i, "Materias primas"],
    [/cripto|crypto/i, "Criptoactivos"],
    [/efectivo|^cuentas?\b/i, "Efectivo"],
    [/p2p|crowdfunding/i, "P2P y crowdfunding"],
    [/jubilaci|pensi/i, "Planes de pensiones"],
  ];
  const tipoDeTexto = t => (TIPOS_REPARTO.includes(t) ? t : (POR_TEXTO.find(([re]) => re.test(t || "")) || [])[1]) || null;
  const POR_TIPO = { cripto: "Criptoactivos", efectivo: "Efectivo", inmueble: "Inmuebles", p2p: "P2P y crowdfunding",
    commodity: "Materias primas", bono: "Renta fija", accion: "Renta variable" };
  /** El cubo de un producto: por su tipo, si lo dice todo; si no, por su categoría. */
  function tipoReparto(p) {
    return POR_TIPO[p.tipoClave] || tipoDeTexto(p.clase) || tipoDeTexto(p.tipo) ||
      { etf: "Renta variable", pension: "Planes de pensiones" }[p.tipoClave] || "Otros";
  }

  /** El reparto guardado, al día: uno antiguo por categoría («RV Global Emergente»: 20) se suma en su
      cubo («Renta variable»). Poner un % en el efectivo ya es pedir que cuenten las cuentas. */
  function normalizaReparto(o) {
    if (!o || o.por === "producto") return o;
    const pesos = {};
    Object.entries(o.pesos || {}).forEach(([k, v]) => {
      const t = tipoDeTexto(k) || "Otros";
      pesos[t] = Math.round(((pesos[t] || 0) + Number(v || 0)) * 100) / 100;
    });
    return { ...o, por: "clase", pesos, conEfectivo: !!o.conEfectivo || pesos.Efectivo > 0 };
  }

  const grupoReparto = (p, o) => (o.por === "producto" ? (p.corto || p.nombre) : tipoReparto(p));
  /** Si un producto cuenta para el reparto según la regla general: lo invertido a largo plazo, sí;
      las cuentas, solo si su grupo tiene un % (o si se pide contarlo todo); las deudas, nunca. */
  function cuentaPorDefecto(p, o) {
    o = normalizaReparto(o);
    if (p.tipoClave === "deuda") return false;
    if (o.conEfectivo) return true;
    if (p.tipoClave === "efectivo") return o.pesos[grupoReparto(p, o)] > 0;
    return p.largoPlazo !== false;
  }
  /** Lo mismo, pero mandando lo que el usuario ha elegido a mano para ese producto («cuenta»). */
  function cuentaEnReparto(p, o) {
    if (p.tipoClave === "deuda") return false;
    const elegido = o && o.cuenta && p.id != null && Object.prototype.hasOwnProperty.call(o.cuenta, p.id) ? o.cuenta[p.id] : null;
    return elegido == null ? cuentaPorDefecto(p, o) : !!elegido;
  }

  /** Lo que tienes, agrupado como tu reparto objetivo (por tipo de activo o por producto),
      con solo los productos que cuentan (ver cuentaEnReparto). */
  function gruposReparto(lista, o, valorDe = valorPorDefecto, colorDe = () => null) {
    o = normalizaReparto(o);
    const acc = new Map();
    lista.forEach(p => {
      const v = valorDe(p);
      if (!(v > 0) || !cuentaEnReparto(p, o)) return;
      const k = grupoReparto(p, o);
      const g = acc.get(k) || { nombre: k, valor: 0, color: colorDe(p), productos: [] };
      g.valor += v;
      g.productos.push(p.corto || p.nombre);
      acc.set(k, g);
    });
    Object.keys(o.pesos).forEach(k => { if (!acc.has(k)) acc.set(k, { nombre: k, valor: 0, color: colorDe(null), productos: [] }); });
    return [...acc.values()];
  }

  /** Cada grupo con su % de ahora, su objetivo, la desviación en puntos, el semáforo y lo
      que habría que comprar (+) o vender (−) para cuadrarlo hoy. Ordenado por objetivo. */
  function filasReparto(grupos, o) {
    const total = grupos.reduce((a, g) => a + g.valor, 0);
    const filas = grupos.map(g => {
      const ahora = total ? g.valor / total * 100 : 0, obj = o.pesos[g.nombre] || 0, desv = ahora - obj;
      const estado = Math.abs(desv) <= o.vigilar ? "ok" : Math.abs(desv) <= o.rebalancear ? "vigilar" : "rebalancear";
      return { ...g, ahora, obj, desv, estado, cuadrar: obj / 100 * total - g.valor };
    }).sort((a, b) => b.obj - a.obj || b.valor - a.valor);
    const peor = filas.length ? filas.reduce((a, f) => Math.abs(f.desv) > Math.abs(a.desv) ? f : a, filas[0]) : null;
    return { total, filas, peor };
  }

  /** Reparte una aportación entre lo que va por debajo de su objetivo, sin vender nada.
      Si sobra después de cuadrar, el resto se reparte según el objetivo. */
  function repartirAportacion(grupos, pesos, aporte) {
    if (!(aporte > 0)) return grupos.map(() => 0);
    const total = grupos.reduce((a, g) => a + g.valor, 0) + aporte;
    const falta = grupos.map(g => Math.max(0, (pesos[g.nombre] || 0) / 100 * total - g.valor));
    const sumaFalta = falta.reduce((a, b) => a + b, 0);
    if (sumaFalta <= aporte) {
      const sobra = aporte - sumaFalta;
      const sumaPesos = grupos.reduce((a, g) => a + (pesos[g.nombre] || 0), 0) || 1;
      return grupos.map((g, i) => falta[i] + sobra * (pesos[g.nombre] || 0) / sumaPesos);
    }
    return falta.map(f => aporte * f / sumaFalta);
  }

  /** La rentabilidad de un periodo, limpia del efecto de cuándo entra o sale el dinero: la misma
      cuenta que el índice de «Ver más detalles» (motor.py, indice_twr), pero empezando en 0 el
      día «i0». «valores» es el valor de cada día y «aportado», lo puesto acumulado (compras menos
      ventas), los dos día a día. Devuelve la serie (null antes de i0), la rentabilidad final,
      lo ganado en euros en el periodo y la peor caída desde un máximo dentro de él. */
  function rentabilidadPeriodo(valores, aportado, i0 = 0) {
    const n = valores.length, serie = new Array(n).fill(null);
    const ap = i => (i >= 0 && aportado[i] != null ? aportado[i] : 0);
    // El primer día del periodo es la base, salvo que sea el de la primera compra: entonces
    // cuenta lo que va de lo pagado al cierre, como en el índice del servidor.
    const conCompra = !(valores[i0 - 1] > 1);
    let nivel = 1, ant = null, pico = 1, caida = 0;
    for (let i = i0; i < n; i++) {
      const v = valores[i];
      if (v != null) {
        const f = i > i0 || conCompra ? ap(i) - ap(i - 1) : 0;
        if (ant == null || ant <= 1) { if (i > i0 || f > 0) nivel *= f > 0 ? Math.max(v / f, 0.05) : 1; }
        else nivel *= 1 + Math.max((v - f) / ant - 1, -0.95);
        ant = v;
      }
      serie[i] = nivel - 1;
      pico = Math.max(pico, nivel);
      caida = Math.min(caida, nivel / pico - 1);
    }
    const u = n - 1, base = conCompra ? [0, ap(i0 - 1)] : [valores[i0] || 0, ap(i0)];
    const ganado = n ? ((valores[u] || 0) - base[0]) - (ap(u) - base[1]) : 0;
    return { serie, total: n ? serie[u] : null, ganado, caida };
  }

  // Aportaciones periódicas que toca anotar: las que caen después de la última añadida y
  // hasta hoy (el día elegido de cada mes; en meses más cortos, el último día).
  function periodicasPendientes(periodicas, idsProductos, hoy) {
    const dos = n => String(n).padStart(2, "0");
    const out = [];
    (Array.isArray(periodicas) ? periodicas : []).forEach(r => {
      if (!r || !idsProductos.includes(r.producto) || !/^\d{4}-\d{2}-\d{2}$/.test(r.ultima || "")) return;
      const dia = Math.min(Math.max(parseInt(r.dia, 10) || 1, 1), 31);
      let [a, m] = r.ultima.split("-").map(Number);
      let primera = null, cuantas = 0;
      for (let i = 0; i < 600; i++) {
        m += 1;
        if (m > 12) { m = 1; a += 1; }
        const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
        const f = `${a}-${dos(m)}-${dos(Math.min(dia, ultimoDia))}`;
        if (f > hoy) break;
        primera = primera || f;
        cuantas += 1;
      }
      if (cuantas) out.push({ producto: r.producto, importe: Number(r.importe) || 0, dia, desde: primera, cuantas });
    });
    return out;
  }

  // «Compartir mi mes»: las cifras de un mes (i, posición en D.resumenMensual) para la imagen.
  // La rentabilidad sale del índice de la cartera, que no cuenta lo que aportas.
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];
  function resumenParaCompartir(D, i) {
    const rm = (D && D.resumenMensual) || [];
    if (!rm.length) return null;
    if (i == null || !(i >= 0 && i < rm.length)) i = rm.length - 1;
    const r = rm[i];
    const [ano, mes] = r.mes.split("-").map(Number);
    const finDe = (a, m) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    const ultimo = i === rm.length - 1;
    const enCurso = ultimo && String(D.fechaExtracto || "") < finDe(ano, mes);
    const F = D.fechas || [], I = D.indiceCartera || [];
    const indiceHasta = lim => {
      let v = null;
      for (let k = 0; k < F.length && F[k] <= lim; k++) if (I[k] != null) v = I[k];
      return v;
    };
    let base = indiceHasta(`${ano - 1}-12-31`), desde = 1;
    if (base == null) {   // empezaste este año: desde tu primer día
      const k = F.findIndex((f, j) => f >= `${ano}-01-01` && I[j] != null);
      base = k >= 0 ? I[k] : null;
      desde = k >= 0 ? +F[k].slice(5, 7) : mes;
    }
    const serie = base == null ? [] : [base];
    for (let m = desde; m <= mes; m++) {
      const v = indiceHasta(finDe(ano, m));
      if (v != null) serie.push(v);
    }
    const primero = I.find(v => v != null);
    const fin = serie.length ? serie[serie.length - 1] : null;
    let k = i, racha = 0;
    if (enCurso && !(rm[k].aportado > 0)) k--;   // el mes en curso aún puede llegar
    while (k >= 0 && rm[k].aportado > 0) { racha++; k--; }
    const nuevo = r.nuevo || 0;
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      mes: r.mes, ano, nombreMes: MESES[mes - 1], etiqueta: `${cap(MESES[mes - 1])} ${ano}`,
      enCurso, ultimo,
      rentMes: r.rentabilidad,
      anoPct: base && fin ? fin / base - 1 : null,
      desdeInicio: primero && fin ? fin / primero - 1 : null,
      serieAno: serie, etqIni: cap(MESES[desde - 1]), etqFin: cap(MESES[mes - 1]),
      racha,
      tir: ultimo && D.total ? D.total.tir : null,
      patrimonio: r.fin, cambioEur: r.fin - r.inicio - nuevo,
      aportadoEur: r.aportado, mercadoEur: r.mercado,
      crecimiento: r.inicio > 0 ? (r.fin - r.inicio - nuevo) / r.inicio : null,
      porAportado: r.inicio > 0 ? r.aportado / r.inicio : null,
      porMercado: r.inicio > 0 ? r.mercado / r.inicio : null,
    };
  }

  return {
    leeImporte, xirr, metricas, agregaExposicion, esLiquidez, resumenLiquidez,
    gruposReparto, filasReparto, repartirAportacion, rentabilidadPeriodo, normalizaReparto, tipoReparto, TIPOS_REPARTO,
    cuentaPorDefecto, cuentaEnReparto, FUERA_DE_BOLSA, periodicasPendientes,
    resumenParaCompartir,
  };
});
