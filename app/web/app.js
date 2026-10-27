/* ============================================================
   app.js  ·  Dashboard de patrimonio
   ============================================================ */
(function () {
  "use strict";

  const D = window.DATOS;
  const C = window.Calculos;   // las cuentas (calculos.js): aquí solo se dibujan
  const $ = s => document.querySelector(s);
  const raiz = document.documentElement;

  const recuerda = {
    lee(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    guarda(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* da igual */ } },
  };

  // ?tab=rendimiento&tema=claro abre directamente esa pestaña con ese tema.
  const qs = new URLSearchParams(location.search);
  if (qs.get("tab")) recuerda.guarda("patrimonio.tab", qs.get("tab"));
  if (qs.get("tema")) recuerda.guarda("patrimonio.tema", qs.get("tema"));
  if (qs.get("moneda")) recuerda.guarda("patrimonio.moneda", qs.get("moneda").toUpperCase());

  // El tema (claro u oscuro) se aplica siempre, también con la cartera vacía.
  const temaGuardado = recuerda.lee("patrimonio.tema");
  if (temaGuardado) raiz.dataset.tema = temaGuardado;
  const cambiaTema = () => {
    raiz.dataset.tema = raiz.dataset.tema === "claro" ? "oscuro" : "claro";
    recuerda.guarda("patrimonio.tema", raiz.dataset.tema);
  };

  /* ---------------------------------------------- perfiles */
  // Selector arriba: tu cartera, la de tu pareja, la de tus hijos… y «Todos juntos».
  (function montaPerfiles() {
    const P = window.PERFILES, sel = $("#selPerfil");
    if (!P || !sel) return;
    if (D && D.modo === "demo" && P.lista.length < 2) return;   // en la demo todavía no pinta nada
    sel.innerHTML = "";
    P.lista.forEach(x => sel.add(new Option(x.nombre, x.id)));
    if (P.todos) sel.add(new Option("Todos juntos", "todos"));
    sel.add(new Option(P.lista.length > 1 ? "Gestionar perfiles…" : "+ Añadir un perfil (pareja, hijos…)", "__gestionar"));
    sel.value = P.activo;
    sel.hidden = false;
    sel.onchange = async () => {
      const v = sel.value;
      if (v === "__gestionar") {
        sel.value = P.activo;
        if (window.Editor && window.Editor.perfiles) window.Editor.perfiles();
        return;
      }
      sel.disabled = true;
      try {
        const r = await fetch("api/perfiles/activar", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: v }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error((j.errores || ["No he podido cambiar de perfil."]).join("\n"));
        location.reload();
      } catch (e) { alert(e.message); sel.value = P.activo; sel.disabled = false; }
    };
    if (P.activo === "todos") {
      const nombres = P.lista.filter(x => x.conDatos).map(x => x.nombre);
      $("#bannerTodosTexto").innerHTML = "<b>Todos juntos:</b> la suma de " +
        nombres.map(n => `<b>${String(n).replace(/[<>&]/g, "")}</b>`).join(", ").replace(/, ([^,]*)$/, " y $1") +
        ". Solo sirve para mirar: para cambiar datos, elige un perfil en el selector de arriba.";
      $("#bannerTodos").hidden = false;
    }
    if (!D) {
      const yo = P.lista.find(x => x.id === P.activo);
      if (yo) $("#marcaTexto").textContent = yo.nombre;
    }
  })();

  if (!D) {
    $("#btnTema").onclick = cambiaTema;
    // Cartera vacía: solo se enseña «Mis datos», para empezar a meter productos.
    document.body.classList.add("sinDatos");
    document.querySelectorAll("#tabs button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.tab === "datos")));
    document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== "tab-datos"; });
    document.querySelectorAll(".aviso-legal, #bannerDemo").forEach(el => { el.hidden = true; });
    document.querySelectorAll("#tabs button").forEach(b => {
      b.onclick = () => {
        document.querySelectorAll("#tabs button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
        document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== "tab-" + b.dataset.tab; });
      };
    });
    return;
  }

  const estado = {
    tab: "patrimonio",
    rango: "todo",
    vista: "apilado",
    dist: "clase",
    fondo: null,
    serieDetalle: "posicion",
    mes: (D.resumenMensual || []).length - 1,
    anual: "mia",
    tablaFiltro: "todos",
    ordenTabla: { col: "fecha", desc: true },
    btcVivo: null,
    compRef: recuerda.lee("patrimonio.compRef") || "mundo",
    verVendidos: recuerda.lee("patrimonio.vendidos") === "1",
    moneda: recuerda.lee("patrimonio.moneda") || "EUR",
    rangoFondo: "todo",
    rangoComp: "todo",
    compModo: recuerda.lee("patrimonio.compModo") === "pct" ? "pct" : "eur",
    ocultos: new Set(),
  };

  /* ---------------------------------------------- ¿y si lo hubieras metido en un indexado? */
  function pintaComparacion() {
    const C = D.comparacion, sec = $("#seccionComparar");
    if (!sec) return;
    if (!C || !C.referencias.length) {
      // Sin el campo, los datos los calculó una versión anterior de la app (que sigue abierta).
      $("#compTitular").innerHTML = "comparacion" in D
        ? '<p class="vacio">Aparecerá cuando tengas compras anotadas.</p>'
        : '<p class="vacio">Cierra la ventana negra de la app y vuelve a abrirla para calcular esta sección.</p>';
      $("#compRef").innerHTML = "";
      if ($("#compRango")) $("#compRango").innerHTML = "";
      $("#grafComparacion").innerHTML = "";
      return;
    }
    if (!C.referencias.some(r => r.id === estado.compRef)) estado.compRef = C.referencias[0].id;
    const r = C.referencias.find(x => x.id === estado.compRef);
    const segm = $("#compRef");
    segm.innerHTML = "";
    C.referencias.forEach(x => {
      const b = document.createElement("button");
      b.textContent = x.nombre;
      b.setAttribute("aria-pressed", String(x.id === r.id));
      b.onclick = () => { estado.compRef = x.id; recuerda.guarda("patrimonio.compRef", x.id); pintaComparacion(); };
      segm.appendChild(b);
    });
    const dif = C.tuValor - r.valor;
    const pct = r.valor ? dif / r.valor : 0;
    const igual = Math.abs(pct) < 0.005;
    const veredicto = igual ? `Vas prácticamente igual que el ${r.nombre}.`
      : dif > 0 ? `Vas ${G.fmtEur(Math.abs(dif), 0)} por delante del ${r.nombre} (${G.fmtPctSigno(pct, 1)}).`
      : `Con el ${r.nombre} tendrías ${G.fmtEur(Math.abs(dif), 0)} más (${G.fmtPctSigno(-dif / C.tuValor, 1)}).`;
    const caja = (et, v, extra, cls = "") => `<div class="compCaja ${cls}"><span>${et}</span><b>${v}</b>${extra ? `<small>${extra}</small>` : ""}</div>`;
    pintaSegm($("#compRango"), RANGOS, estado.rangoComp, id => { estado.rangoComp = id; pintaComparacion(); });
    pintaSegm($("#compModo"), [{ id: "eur", et: "€" }, { id: "pct", et: "%" }], estado.compModo, id => {
      estado.compModo = id; recuerda.guarda("patrimonio.compModo", id); pintaComparacion();
    });
    const i0 = desdeIdx(estado.rangoComp), cortaC = arr => (arr || []).slice(i0);
    const enPct = estado.compModo === "pct", todo = estado.rangoComp === "todo";
    // Lo de cada periodo, limpio del efecto de cuándo metiste el dinero (calculos.js).
    const Calc = window.Calculos;
    const tuP = Calc.rentabilidadPeriodo(C.tuya, C.aportado, i0), refP = Calc.rentabilidadPeriodo(r.serie, C.aportado, i0);
    const ultimo = C.aportado[C.aportado.length - 1];
    const puesto = i0 > 0 && C.tuya[i0 - 1] > 1 ? ultimo - C.aportado[i0] : ultimo - (C.aportado[i0 - 1] || 0);
    if (todo && !enPct) {
      $("#compTitular").innerHTML =
        caja("Tú tienes hoy", G.fmtEur(C.tuValor, 0), `TIR ${G.fmtPctSigno(C.tuTir, 1)}`) +
        caja(`Con el ${r.nombre} tendrías`, G.fmtEur(r.valor, 0), `TIR ${G.fmtPctSigno(r.tir, 1)}`) +
        caja("Has puesto de tu bolsillo", G.fmtEur(ultimo, 0), "compras menos ventas") +
        caja("Veredicto", veredicto, "", "veredicto");
    } else {
      const cuando = todo ? "desde el principio" : "en este periodo";
      const parejos = `${todo ? "Desde el principio" : "En este periodo"} vas prácticamente igual que el ${r.nombre}.`;
      const pts = (tuP.total - refP.total) * 100;
      const difEur = tuP.ganado - refP.ganado;
      const verP = Math.abs(pts) < 0.5 ? parejos
        : pts > 0 ? `Vas ${pts.toFixed(1).replace(".", ",")} puntos por delante del ${r.nombre} ${cuando}.`
        : `El ${r.nombre} ha ido ${Math.abs(pts).toFixed(1).replace(".", ",")} puntos mejor ${cuando}.`;
      const verE = Math.abs(difEur) < 1 ? parejos
        : difEur > 0 ? `Has ganado ${G.fmtEur(difEur, 0)} más que con el ${r.nombre} ${cuando}.`
        : `Con el ${r.nombre} habrías ganado ${G.fmtEur(-difEur, 0)} más ${cuando}.`;
      const eurS = v => (v >= 0 ? "+" : "−") + G.fmtEur(Math.abs(v), 0);
      const cifra = p => enPct ? G.fmtPctSigno(p.total, 1) : eurS(p.ganado);
      const otra = p => (enPct ? eurS(p.ganado) : G.fmtPctSigno(p.total, 1)) + ` · peor caída ${G.fmtPct(p.caida, 1)}`;
      $("#compTitular").innerHTML =
        caja(`Tu cartera ${cuando}`, cifra(tuP), otra(tuP)) +
        caja(`El ${r.nombre} ${cuando}`, cifra(refP), otra(refP)) +
        caja(`Has puesto ${cuando}`, G.fmtEur(puesto, 0), "compras menos ventas") +
        caja("Veredicto", enPct ? verP : verE, "", "veredicto");
    }
    G.multiLinea($("#grafComparacion"), enPct ? {
      fechas: cortaC(D.fechas), alto: 300,
      series: [
        { nombre: "Tu cartera", valores: cortaC(tuP.serie), color: G.css("--s1"), destacado: true },
        { nombre: "El " + r.nombre, valores: cortaC(refP.serie), color: G.css("--s2") },
      ],
      formatoY: v => G.fmtPct(v, 0),
      formatoValor: v => G.fmtPctSigno(v, 1),
    } : {
      fechas: cortaC(D.fechas), alto: 300,
      series: [
        { nombre: "Tu cartera", valores: cortaC(C.tuya), color: G.css("--s1"), destacado: true },
        { nombre: "Con el " + r.nombre, valores: cortaC(r.serie), color: G.css("--s2") },
        { nombre: "Tu dinero puesto", valores: cortaC(C.aportado), color: G.css("--tinta3") },
      ],
      formatoY: G.fmtEurCorto,
      formatoValor: v => G.fmtEur(v, 0),
      desdeCero: true,
    });
    const ley = (c, t) => `<span class="leyItem"><i style="background:${G.css(c)}"></i>${t}</span>`;
    $("#compNota").innerHTML = `<span class="leyComp">${ley("--s1", "Tu cartera")}${ley("--s2", (enPct ? "El " : "Con el ") + r.nombre)}${enPct ? "" : ley("--tinta3", "Tu dinero puesto")}</span>
      ${enPct ? `En %: cuánto ha subido o bajado tu dinero ${todo ? "desde el principio" : "en el periodo"}, sin contar cuándo
      metiste o sacaste dinero (rentabilidad ponderada por tiempo, la de «Ver más detalles»). Por eso no coincide con tu
      ganancia sobre lo aportado. ` : ""}${r.detalle} Solo cuenta los productos con compras anotadas (no las cuentas ni lo
      que valoras a mano sin movimientos), desde el ${G.fmtFecha(C.desde)}. Sin impuestos ni comisiones de compra.
      ${r.aviso ? "<br>" + r.aviso : ""}`;
  }

  /* ---------------------------------------------- tema y colores */
  function temaOscuro() { return raiz.dataset.tema !== "claro"; }
  function color(p) {
    const c = p.slotColor || p.color || ["#2a78d6", "#3987e5"];
    return temaOscuro() ? c[1] : c[0];
  }
  function hex2rgb(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mezcla(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  /** Tres tonos del propio color del producto: pequeña, habitual, extraordinaria. */
  function tonos(base) {
    return temaOscuro()
      ? [mezcla(base, "#1a1a19", 0.52), base, mezcla(base, "#ffffff", 0.42)]
      : [mezcla(base, "#fcfcfb", 0.58), base, mezcla(base, "#000000", 0.32)];
  }

  const TODOS = () => D.productos.concat(D.otrosActivos || [], D.pasivos || []);
  const visibles = () => TODOS().filter(p => !estado.ocultos.has(p.id));
  const filtrando = () => estado.ocultos.size > 0;
  const buscaProd = id => TODOS().find(p => p.id === id);
  // Lo que ya vendiste del todo: sigue contando en la historia, la TIR y lo ganado,
  // pero en el panel no ocupa sitio con 0 € salvo que pidas verlo.
  const vendido = p => Math.abs(p.valor || 0) < 0.005 && (p.serie || []).some(v => v);
  const enPanel = () => TODOS().filter(p => estado.verVendidos || !vendido(p));

  /* ---------------------------------------------- precio en vivo */
  function precioVivo() {
    const v = D.vivo;
    if (!v || !estado.btcVivo) return null;
    return { id: v.productoId, titulos: v.titulos, precio: v.precioRef * (estado.btcVivo / v.btcRef) };
  }
  function valorDe(p) {
    const pv = precioVivo();
    if (pv && p.id === pv.id) return pv.titulos * pv.precio;
    return p.valor || 0;
  }

  /** Plusvalía calculada con el mismo valor que se enseña (en vivo si lo hay),
      para que valor, plusvalía y porcentaje siempre sumen entre sí. */
  function plusvaliaDe(p) {
    if (p.aportado == null || !(p.aportado > 0)) return null;
    const eur = valorDe(p) - p.aportado;
    return { eur, pct: eur / p.aportado };
  }

  /* Métricas de un conjunto de componentes (calculos.js): al apagar series, cada cifra
     del panel se recalcula y sigue cuadrando. */
  function metricas(lista) {
    return C.metricas(lista, D, valorDe);
  }

  function agrupa(lista, campo) {
    const acc = new Map();
    lista.forEach(p => {
      const k = p[campo] || "Otros";
      const g = acc.get(k) || { nombre: k, valor: 0, color: color(p) };
      g.valor += valorDe(p);
      acc.set(k, g);
    });
    return [...acc.values()].filter(g => g.valor > 0).sort((a, b) => b.valor - a.valor);
  }

  /* ---------------------------------------------- rango temporal */
  const RANGOS = [
    { id: "1m", et: "1M", dias: 30 }, { id: "3m", et: "3M", dias: 91 },
    { id: "6m", et: "6M", dias: 182 }, { id: "ytd", et: "YTD", dias: null },
    { id: "1a", et: "1A", dias: 365 }, { id: "todo", et: "Todo", dias: null },
  ];
  function desdeIdx(rango = estado.rango) {
    const n = D.fechas.length;
    const r = RANGOS.find(x => x.id === rango);
    if (!r || r.id === "todo") return 0;
    if (r.id === "ytd") {
      const ini = D.fechaExtracto.slice(0, 4) + "-01-01";
      const i = D.fechas.findIndex(f => f >= ini);
      return i < 0 ? 0 : i;
    }
    return Math.max(0, n - 1 - r.dias);
  }
  const corta = arr => (arr || []).slice(desdeIdx());

  function pintaSegm(cont, opciones, activo, alPulsar) {
    if (!cont) return;
    cont.innerHTML = "";
    opciones.forEach(o => {
      const b = document.createElement("button");
      b.textContent = o.et;
      b.setAttribute("aria-pressed", String(o.id === activo));
      b.onclick = () => alPulsar(o.id);
      cont.appendChild(b);
    });
  }

  /* ================================================================
     PESTAÑA 1 · PATRIMONIO
     ================================================================ */
  const idsCorto = () => TODOS().filter(p => p.largoPlazo === false).map(p => p.id);

  function pintaFiltros() {
    const cont = $("#filtros");
    cont.innerHTML = "";
    enPanel().forEach(p => {
      const on = !estado.ocultos.has(p.id);
      const b = document.createElement("button");
      b.className = "filtro";
      b.style.setProperty("--c", color(p));
      b.setAttribute("aria-pressed", String(on));
      b.title = on ? "Quitar del gráfico y de las métricas" : "Volver a incluirlo";
      b.innerHTML = `<i></i>${p.corto || p.nombre}<span class="im">${G.fmtEurCorto(valorDe(p))}</span>`;
      b.onclick = () => {
        if (on) { if (visibles().length <= 1) return; estado.ocultos.add(p.id); }
        else estado.ocultos.delete(p.id);
        pintaPatrimonio();
      };
      cont.appendChild(b);
    });
    const sep = document.createElement("span");
    sep.className = "filtroSep";
    cont.appendChild(sep);

    const cortos = idsCorto();
    const esLargo = cortos.length > 0 && cortos.length === estado.ocultos.size &&
      cortos.every(id => estado.ocultos.has(id));
    [
      { id: "todo", et: "Ver todo", act: !filtrando(), fn: () => estado.ocultos.clear() },
      { id: "largo", et: "Solo largo plazo", act: esLargo, fn: () => { estado.ocultos = new Set(cortos); } },
      { id: "vendidos", et: `Vendidos (${TODOS().filter(vendido).length})`, act: estado.verVendidos,
        fn: () => { estado.verVendidos = !estado.verVendidos;
          recuerda.guarda("patrimonio.vendidos", estado.verVendidos ? "1" : "0"); } },
    ].forEach(pr => {
      if (pr.id === "largo" && !cortos.length) return;
      if (pr.id === "vendidos" && !TODOS().some(vendido)) return;
      const b = document.createElement("button");
      b.className = "filtro preset";
      b.setAttribute("aria-pressed", String(pr.act));
      b.textContent = pr.et;
      b.title = pr.id === "largo"
        ? "Deja fuera el colchón y el efectivo: solo lo que tienes invertido a largo plazo"
        : pr.id === "vendidos"
          ? "Productos que ya vendiste del todo. Aunque no se vean, siguen contando en la historia, la TIR y lo que has ganado"
          : "Vuelve a mostrar todos los componentes";
      b.onclick = () => { pr.fn(); pintaPatrimonio(); };
      cont.appendChild(b);
    });
  }

  function pintaHero(mVis, mTodo) {
    const filtro = filtrando();
    const m = filtro ? mVis : mTodo;
    $("#heroEtq").textContent = filtro ? "Vista filtrada" : "Patrimonio neto";
    $("#heroCifra").textContent = G.fmtEur(m.valor);

    const partes = [];
    if (m.plusvalia !== null) {
      const cl = m.plusvalia >= 0 ? "pos" : "neg";
      partes.push(`<span class="${cl} fuerte">${G.fmtEurSigno(m.plusvalia)}</span>
        <span class="${cl}">(${G.fmtPctSigno(m.rentabilidad)})</span> sobre lo aportado`);
    }
    // Lo ya cobrado (o perdido) al vender y en dividendos: no está en la plusvalía de lo que tienes.
    if (Math.abs(m.realizado) >= 1) {
      partes.push(`<span class="${m.realizado >= 0 ? "pos" : "neg"} fuerte">${G.fmtEurSigno(m.realizado)}</span>
        ${m.realizado >= 0 ? "ya cobrados" : "ya perdidos"} en ventas, dividendos e intereses`);
    }
    if (m.tir !== null) partes.push(`TIR anualizada <span class="fuerte">${G.fmtPctSigno(m.tir)}</span>`);

    const pv = precioVivo();
    if (pv) {
      const p = D.productos.find(x => x.id === pv.id);
      if (p && !estado.ocultos.has(p.id)) {
        const delta = pv.titulos * pv.precio - p.valor;
        partes.push(`<span class="pill vivo"><span class="latido"></span>Bitcoin en vivo
          <span class="${delta >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(delta)}</span></span>`);
      }
    } else if (D.vivo) {
      partes.push(`<span class="pill">Cotización a cierre del ${G.fmtFechaCorta(D.fechaExtracto)}</span>`);
    }
    if (filtro) {
      partes.push(`<button class="pill reset" id="btnReset" title="Volver a mostrarlo todo">
        de ${G.fmtEur(mTodo.valor, 0)} totales · ver todo</button>`);
    }
    $("#heroSub").innerHTML = partes.join('<span style="color:var(--tinta3)">·</span>');
    const reset = $("#btnReset");
    if (reset) reset.onclick = () => { estado.ocultos.clear(); pintaPatrimonio(); };

    if (filtro) { $("#progEnv").hidden = true; return; }

    // Progreso medido desde cero, que es como se lee de forma natural.
    const propio = (D.objetivo && D.objetivo.activo) ? D.objetivo.importe : null;
    const siguienteHito = (D.total.hitos.find(h => h.importe > m.valor) || {}).importe;
    const sig = (propio && propio > m.valor) ? propio : siguienteHito;
    if (!sig) { $("#progEnv").hidden = true; return; }
    const pct = Math.max(0, Math.min(1, m.valor / sig));
    $("#progEnv").hidden = false;
    $("#progRelleno").style.width = (pct * 100).toFixed(1) + "%";
    const meta = (propio && propio > m.valor && D.objetivo.etiqueta) ? `${D.objetivo.etiqueta} (${G.fmtEurCorto(sig)})` : G.fmtEurCorto(sig);
    const editable = window.Editor && window.Editor.objetivo && D.modo === "propio";
    $("#progIzq").innerHTML =
      `<b style="color:var(--tinta)">${G.fmtPct(pct, 1)}</b> del camino hacia ${meta}` +
      (editable ? '<button class="editar" id="btnObjetivo" title="Elegir tu propio objetivo">cambiar</button>' : "");
    $("#progDer").textContent = "Faltan " + G.fmtEur(sig - m.valor, 0);
    if (editable) $("#btnObjetivo").onclick = () => window.Editor.objetivo();
  }

  function pintaKPIs(m) {
    const kpis = [
      { e: "Aportado", v: G.fmtEur(m.aportado, 0), n: `${m.numAportaciones} aportaciones` },
      {
        e: "Plusvalía latente", v: G.fmtEurSigno(m.plusvalia),
        n: m.rentabilidad != null ? G.fmtPctSigno(m.rentabilidad) + " sobre el coste" : "sin coste registrado",
        cl: m.plusvalia >= 0 ? "pos" : "neg"
      },
      { e: "TIR anualizada", v: G.fmtPctSigno(m.tir), n: "rentabilidad real del dinero", cl: m.tir >= 0 ? "pos" : "neg" },
      { e: "Ritmo mensual", v: G.fmtEur(m.ritmo, 0), n: "media de los últimos 12 meses" },
      { e: "Racha", v: m.racha + (m.racha === 1 ? " mes" : " meses"), n: "aportando sin fallar" },
      { e: "Peor caída", v: G.fmtPctSigno(m.caida), n: m.caidaFecha ? "del patrimonio, el " + G.fmtFecha(m.caidaFecha) : "", cl: "neg" },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      `<div class="kpi"><div class="e">${k.e}</div>
       <div class="v ${k.cl || ""}">${k.v}</div><div class="n">${k.n}</div></div>`).join("");
    $("#kpisNota").textContent = filtrando()
      ? `Métricas de los ${visibles().length} componentes activos, no del patrimonio completo.` : "";
  }

  function pintaPrincipal(m) {
    const fechas = corta(D.fechas);
    const prods = visibles().filter(p => (p.serie || []).some(v => v));
    const cont = $("#grafPrincipal");
    let nota = "";

    if (estado.vista === "total") {
      G.lineaConEventos(cont, {
        fechas, valores: corta(m.serie), color: G.css("--s1"), alto: 330,
        overlay: { nombre: "Aportado", valores: corta(m.serieAportado) },
      });
    } else if (estado.vista === "dinero") {
      // Lo que pusiste tú contra lo que ha puesto el mercado.
      const tuyo = m.serie.map((v, i) => Math.min(m.serieAportado[i], v));
      const mercado = m.serie.map((v, i) => Math.max(0, v - m.serieAportado[i]));
      const bajoCoste = m.serie.some((v, i) => v > 0 && v < m.serieAportado[i] - 0.01);
      G.areaApilada(cont, {
        fechas, alto: 330,
        series: [
          { nombre: "Lo que pusiste tú", color: G.css("--tinta3"), valores: corta(tuyo) },
          { nombre: "Lo que puso el mercado", color: G.css("--s3"), valores: corta(mercado) },
        ],
      });
      nota = bajoCoste
        ? "Hubo días por debajo de lo aportado: ahí la banda verde desaparece."
        : "La banda verde es rentabilidad, no dinero tuyo.";
    } else if (estado.vista === "reparto") {
      const series = prods.map(p => ({ id: p.id, nombre: p.corto || p.nombre, color: color(p), valores: corta(p.serie) }));
      const tot = fechas.map((_, i) => series.reduce((a, s) => a + (s.valores[i] || 0), 0));
      series.forEach(s => { s.valores = s.valores.map((v, i) => tot[i] ? (v || 0) / tot[i] * 100 : 0); });
      G.areaApilada(cont, {
        fechas, series, alto: 330, maxForzado: 100,
        formatoY: v => Math.round(v) + " %",
        formatoValor: v => v.toFixed(1) + " %",
      });
    } else {
      G.areaApilada(cont, {
        fechas, alto: 330,
        series: prods.map(p => ({ id: p.id, nombre: p.corto || p.nombre, color: color(p), valores: corta(p.serie) })),
        overlay: { nombre: "Aportado", valores: corta(m.serieAportado) },
      });
      const tardios = visibles().filter(p => p.desde && p.desde > D.fechas[0] && p.aportado == null);
      if (tardios.length) {
        nota = tardios.map(p => p.corto).join(", ") + (tardios.length > 1 ? " entran" : " entra") +
          " en el seguimiento el " + G.fmtFecha(tardios[0].desde);
      }
    }
    $("#evolNota").textContent = nota;
  }

  function pintaChips() {
    const cont = $("#chips");
    cont.innerHTML = "";
    enPanel().forEach(p => {
      const oculto = estado.ocultos.has(p.id);
      const b = document.createElement("button");
      b.className = "chip" + (oculto ? " apagado" : "");
      b.style.setProperty("--c", color(p));
      const plTarjeta = plusvaliaDe(p);
      const rent = plTarjeta ? plTarjeta.pct : null;
      b.innerHTML = `<span class="barra"></span>
        <div class="nm"><i></i>${p.corto || p.nombre}</div>
        <div class="vl">${G.fmtEur(valorDe(p))}</div>
        <div class="pi"><span>${oculto ? "fuera del gráfico" : G.fmtPct(p.peso, 1) + " del total"}</span>
          <span class="${rent == null ? "" : rent >= 0 ? "pos" : "neg"}">${rent == null ? "—" : G.fmtPctSigno(rent, 1)}</span></div>
        <div class="sp"></div>`;
      b.onclick = () => { estado.fondo = p.id; irA("fondos"); };
      cont.appendChild(b);
      G.mini(b.querySelector(".sp"), corta(p.serie), color(p));
    });
  }

  function pintaDistribucion() {
    const lista = visibles();
    const datos = estado.dist === "producto"
      ? lista.filter(p => valorDe(p) > 0)
        .map(p => ({ nombre: p.corto || p.nombre, valor: valorDe(p), color: color(p), id: p.id }))
        .sort((a, b) => b.valor - a.valor)
      : agrupa(lista, estado.dist);
    const total = datos.reduce((a, x) => a + x.valor, 0);
    G.donut($("#grafDonut"), {
      datos, alto: 236, tituloCentro: filtrando() ? "Filtrado" : "Total",
      valorCentro: G.fmtEurCorto(total),
      onClick: d => { if (d.id) { estado.fondo = d.id; irA("fondos"); } }
    });
    $("#leyendaDist").innerHTML = datos.map(d =>
      `<tr><td><i style="background:${d.color}"></i>${d.nombre}</td>
       <td>${G.fmtEur(d.valor)}</td><td>${G.fmtPct(d.valor / total, 1)}</td></tr>`).join("");
  }

  function pintaBarras() {
    const am = D.aportacionesMensuales;
    const desde = D.fechas[desdeIdx()].slice(0, 7);
    const idx = am.meses.findIndex(m => m >= desde);
    const i0 = idx < 0 ? am.meses.length : idx;
    const meses = am.meses.slice(i0);
    const series = visibles()
      .filter(p => (am.porProducto[p.id] || []).some(v => v))
      .map(p => ({ nombre: p.corto || p.nombre, color: color(p), valores: am.porProducto[p.id].slice(i0) }));
    G.barrasApiladas($("#grafBarras"), { categorias: meses, alto: 236, series });
    const suma = meses.reduce((a, _, i) => a + series.reduce((b, s) => b + (s.valores[i] || 0), 0), 0);
    $("#notaAport").textContent = meses.length
      ? `${G.fmtEur(suma, 0)} en ${meses.length} ${meses.length === 1 ? "mes" : "meses"}` : "";
  }

  /* Países y sectores de todo lo que tienes en bolsa: cada producto pesa lo que vale. */
  function pintaExpoTotal() {
    const sec = $("#seccionExpo");
    if (!sec) return;
    const { enBolsa, fuera, sinDatos, sinNombre, paises: lp, sectores: ls } = C.agregaExposicion(visibles(), valorDe);
    sec.hidden = !(enBolsa > 0);
    if (sec.hidden) return;
    const total = enBolsa + fuera + sinDatos;
    $("#expoTotNota").textContent = `De lo que tienes en bolsa: ${G.fmtEur(enBolsa, 0)} (${G.fmtPct(enBolsa / total, 0)} de tu patrimonio)`;
    $("#expoTotTitular").innerHTML = lp.length
      ? `<b>${G.fmtPct(lp[0][1] / 100, 0)}</b> de lo que tienes en bolsa está en <b>${lp[0][0]}</b>` +
        (ls.length ? `, y el <b>${G.fmtPct(ls[0][1] / 100, 0)}</b> es ${ls[0][0].toLowerCase()}.` : ".")
      : "";
    G.barrasHorizontales($("#expoTotPaises"), { datos: lp, color: G.css("--s1") });
    G.barrasHorizontales($("#expoTotSectores"), { datos: ls, color: G.css("--s3") });
    const pie = [];
    if (fuera > 1) pie.push(`Fuera de bolsa (renta fija, liquidez, cripto…): ${G.fmtEur(fuera, 0)}.`);
    if (sinDatos > 1) {
      pie.push(`Sin reparto: ${G.fmtEur(sinDatos, 0)} (${sinNombre.slice(0, 4).join(", ")}${sinNombre.length > 4 ? "…" : ""}).
        Si es un plan o una cartera que no cotiza, en su ficha (Mis datos → Productos → opciones avanzadas) puedes
        decir a qué fondo se parece y Rumbo usará su reparto.`);
    }
    pie.push("Datos de Morningstar sobre la cartera de cada fondo, con la fecha de su última publicación. Se actualizan como mucho una vez al mes.");
    $("#expoTotPie").innerHTML = pie.join(" ");
  }

  /* ---------------------------------------------- liquidez y fondo de emergencia */
  // Liquidez: lo que puedes tener en el banco en días (cuentas y monetarios, o lo que marques).

  function pintaLiquidez() {
    const sec = $("#seccionLiquidez");
    if (!sec) return;
    const c = D.colchon;
    const R = C.resumenLiquidez(TODOS(), c, valorDe);
    const lista = R.productos, liquidez = R.liquidez;
    const editable = window.Editor && window.Editor.colchon && D.modo === "propio";
    sec.hidden = !lista.length && !c;
    if (sec.hidden) return;
    const btn = $("#btnColchon");
    btn.hidden = !editable || !c;
    btn.onclick = () => window.Editor.colchon();
    const total = metricas(TODOS()).valor;
    $("#liqNota").textContent = `${G.fmtEur(liquidez, 0)} disponibles en días · ${G.fmtPct(total ? liquidez / total : 0, 0)} de tu patrimonio`;
    const tabla = `<div class="tablaEnv" style="margin-top:14px"><table class="dt"><tbody>${lista.map(p =>
      `<tr><td><i class="pt" style="background:${color(p)}"></i>${p.corto || p.nombre}</td><td>${G.fmtEur(valorDe(p), 0)}</td>
       <td class="subt">${G.fmtPct(liquidez ? valorDe(p) / liquidez : 0, 0)}</td></tr>`).join("")}</tbody></table></div>`;
    const queCuenta = '<p class="subt" style="margin:10px 0 0">Cuentan las cuentas y los fondos monetarios. Para cambiar qué cuenta, en la ficha del producto: «Cuenta como liquidez».</p>';
    if (!c) {
      $("#liqCuerpo").innerHTML = `<p class="subt" style="margin:0 0 12px">¿Cuánto quieres tener siempre a mano por si
        pasa algo? Dilo en meses de gastos (lo habitual es entre 3 y 6) y Rumbo te dirá si lo tienes cubierto y cuánto te
        sobra para invertir.</p>${editable ? '<button class="btn prim" id="btnColchonNuevo">Definir mi fondo de emergencia</button>' : ""}${tabla}${queCuenta}`;
      if (editable) $("#btnColchonNuevo").onclick = () => window.Editor.colchon();
      return;
    }
    const { objetivo, cubierto, sobra, meses, pct } = R;
    $("#liqCuerpo").innerHTML = `
      <div class="cifras">
        <div class="cifra"><span>Fondo de emergencia</span><b>${G.fmtEur(objetivo, 0)}</b>
          <small>${c.modo === "meses" ? `${String(c.meses).replace(".", ",")} meses de ${G.fmtEur(c.gastoMensual, 0)}` : "importe fijo"}</small></div>
        <div class="cifra"><span>Tienes en liquidez</span><b>${G.fmtEur(liquidez, 0)}</b>
          <small>${meses != null ? `te cubre ${meses.toLocaleString("es-ES", { maximumFractionDigits: 1 })} meses de gastos` : "cuentas y monetarios"}</small></div>
        <div class="cifra"><span>${sobra >= 0 ? "Disponible para invertir" : "Te falta para completarlo"}</span>
          <b class="${sobra >= 0 ? "pos" : "neg"}">${G.fmtEur(Math.abs(sobra), 0)}</b>
          <small>${sobra >= 0 ? "lo que pasa del colchón" : "antes de invertir más"}</small></div>
      </div>
      <div class="prog" style="margin-top:18px;max-width:none">
        <div class="progBarra"><div class="progRelleno" style="width:${(pct * 100).toFixed(1)}%"></div></div>
        <div class="progPie"><span><b style="color:var(--tinta)">${G.fmtPct(pct, 0)}</b> del fondo de emergencia cubierto</span>
          <span>${G.fmtEur(cubierto, 0)} de ${G.fmtEur(objetivo, 0)}</span></div></div>
      ${tabla}${queCuenta}`;
  }

  /* ---------------------------------------------- reparto objetivo y rebalanceo */
  function pintaReparto() {
    const sec = $("#seccionReparto");
    if (!sec) return;
    const o = C.normalizaReparto(D.objetivoReparto);
    // En la cartera de ejemplo también: se prueba sin guardar.
    const editable = window.Editor && window.Editor.reparto && (D.modo === "propio" || D.modo === "demo");
    const btn = $("#btnReparto");
    btn.hidden = !editable || !o;
    btn.onclick = () => window.Editor.reparto();
    if (!o) {
      sec.hidden = !editable;
      $("#repartoNota").textContent = "";
      $("#repartoCuerpo").innerHTML = `<p class="subt" style="margin:0 0 12px">Di qué porcentaje quieres en cada tipo de
        activo (por ejemplo, 80 % renta variable y 20 % renta fija) y Rumbo te avisará cuando te desvíes y te dirá dónde
        meter tu próxima aportación para volver a cuadrar, sin vender nada.</p>
        <button class="btn prim" id="btnRepartoNuevo">Definir mi reparto objetivo</button>`;
      if (editable) $("#btnRepartoNuevo").onclick = () => window.Editor.reparto();
      return;
    }
    sec.hidden = false;
    const grupos = C.gruposReparto(TODOS(), o, valorDe, p => p ? color(p) : G.css("--tinta3"));
    const { filas, peor } = C.filasReparto(grupos, o);
    const fuera = TODOS().filter(p => valorDe(p) > 0 && p.tipoClave !== "deuda" && !C.cuentaEnReparto(p, o))
      .map(p => p.corto || p.nombre);
    const ET = { ok: "OK", vigilar: "Vigilar", rebalancear: "Rebalancear" };
    $("#repartoNota").textContent = `${o.por === "producto" ? "Por producto" : "Por tipo de activo"} · ` +
      `OK hasta ${o.vigilar} puntos de desviación, rebalancear desde ${o.rebalancear}`;
    $("#repartoCuerpo").innerHTML = `
      <div class="tablaEnv"><table class="dt"><thead><tr><th>${o.por === "producto" ? "Producto" : "Tipo de activo"}</th><th>Ahora</th>
        <th>Objetivo</th><th>Desviación</th><th>Estado</th><th title="Lo que habría que comprar (+) o vender (−) para cuadrarlo hoy">Para cuadrar</th></tr></thead>
        <tbody>${filas.map(f => `<tr><td><i class="pt" style="background:${f.color}"></i>${escH(f.nombre)}${o.por !== "producto" && f.productos.length
          ? `<small class="repDe">${escH(f.productos.slice(0, 3).join(" · ") + (f.productos.length > 3 ? ` y ${f.productos.length - 3} más` : ""))}</small>` : ""}</td>
          <td>${G.fmtPct(f.ahora / 100, 1)}</td><td>${G.fmtPct(f.obj / 100, 1)}</td>
          <td class="${Math.abs(f.desv) < 0.05 ? "" : f.desv > 0 ? "pos" : "neg"}">${(f.desv >= 0 ? "+" : "−") + Math.abs(f.desv).toLocaleString("es-ES", { maximumFractionDigits: 1 })} pts</td>
          <td><span class="estadoRep ${f.estado}">${ET[f.estado]}</span></td>
          <td>${Math.abs(f.cuadrar) < 1 ? "—" : (f.cuadrar > 0 ? "+" : "−") + G.fmtEur(Math.abs(f.cuadrar), 0)}</td></tr>`).join("")}</tbody></table></div>
      <div class="calcAporte">Voy a aportar <input id="repAporte" inputmode="decimal" value="${Math.round((D.total.ritmoMensual || 500) / 50) * 50 || 500}"> €
        <span class="subt">→ así lo repartiría para acercarme al objetivo sin vender:</span></div>
      <div id="repCalc"></div>
      ${fuera.length ? `<p class="subt" style="margin:12px 0 0">No cuentan para este reparto: ${escH(fuera.join(" · "))}.</p>` : ""}
      <p class="subt" style="margin:12px 0 0">${peor && peor.estado !== "ok"
        ? `Lo que más se ha desviado: <b>${peor.nombre}</b> (${(peor.desv >= 0 ? "+" : "−") + Math.abs(peor.desv).toFixed(1).replace(".", ",")} puntos).`
        : "Todo dentro del margen: no hace falta tocar nada."} Es una herramienta para pensar, no una recomendación de inversión.</p>`;
    const calcula = () => {
      const a = C.leeImporte($("#repAporte").value) || 0;
      const reparto = C.repartirAportacion(filas, o.pesos, a);
      $("#repCalc").innerHTML = a > 0 ? `<div class="tablaEnv"><table class="dt"><tbody>${filas.map((f, i) => reparto[i] >= 1
        ? `<tr><td><i class="pt" style="background:${f.color}"></i>${f.nombre}</td><td>${G.fmtEur(reparto[i], 0)}</td>
           <td class="subt">${G.fmtPct(reparto[i] / a, 0)} de la aportación</td></tr>` : "").join("")}</tbody></table></div>` : "";
    };
    $("#repAporte").oninput = calcula;
    calcula();
  }

  function pintaHitos(mTodo) {
    // En la web con importes ocultos no hay hitos (delatarían cifras).
    $("#hitos").closest("section").hidden = !D.total.hitos.length;
    $("#hitos").innerHTML = D.total.hitos.map(h => {
      const hecho = !!h.fecha;
      return `<div class="hito ${hecho ? "hecho" : ""}">
        <div class="im">${G.fmtEurCorto(h.importe)}</div>
        <div class="fe">${hecho ? "✓ " + G.fmtFecha(h.fecha) : "faltan " + G.fmtEurCorto(h.importe - mTodo.valor)}</div>
      </div>`;
    }).join("");
  }

  function pintaProyeccion() {
    const anos = +$("#rAnos").value, rent = +$("#rRent").value / 100, apor = +$("#rApor").value;
    $("#vAnos").textContent = anos;
    $("#vRent").textContent = $("#rRent").value.replace(".", ",") + " %";
    $("#vApor").textContent = G.fmtEur(apor, 0);

    const m = metricas(visibles());
    const rm = rent / 12, n = anos * 12;
    const fechas = [], valores = [], aportado = [];
    const base = new Date(D.fechaExtracto);
    let v = m.valor, ap = m.aportado;
    for (let i = 0; i <= n; i++) {
      const f = new Date(base.getFullYear(), base.getMonth() + i, 1);
      fechas.push(f.toISOString().slice(0, 10));
      valores.push(Math.round(v));
      aportado.push(Math.round(ap));
      v = v * (1 + rm) + apor;
      ap += apor;
    }
    G.lineaConEventos($("#grafProy"), {
      fechas, valores, color: G.css("--s3"), alto: 250,
      overlay: { nombre: "Habré aportado", valores: aportado },
    });
    const fin = valores[valores.length - 1], apFin = aportado[aportado.length - 1];
    $("#proyResumen").innerHTML =
      `Partiendo de ${G.fmtEur(m.valor, 0)}${filtrando() ? " (vista filtrada)" : ""},
       en <b class="fuerte">${anos} años</b> tendrías <b class="fuerte">${G.fmtEur(fin, 0)}</b>
       <span style="color:var(--tinta3)">·</span> habrías aportado ${G.fmtEur(apFin, 0)}
       <span style="color:var(--tinta3)">·</span> el mercado pondría
       <span class="pos fuerte">${G.fmtEur(fin - apFin, 0)}</span>`;
  }

  function pintaTabla() {
    const filas = [];
    D.productos.forEach(p => (p.aportaciones || []).forEach(a => {
      if (!a.importe) return;
      filas.push({
        fecha: a.fecha, producto: p.corto || p.nombre, color: color(p), id: p.id,
        importe: a.importe, valor: a.valor,
        pl: a.valor != null ? a.valor - a.importe : null,
        rent: a.valor != null && a.importe ? (a.valor - a.importe) / a.importe : null,
      });
    }));
    const f = estado.tablaFiltro === "todos" ? filas : filas.filter(x => x.id === estado.tablaFiltro);
    const o = estado.ordenTabla;
    f.sort((a, b) => {
      const va = a[o.col], vb = b[o.col];
      const c = va == null ? -1 : vb == null ? 1 : va > vb ? 1 : va < vb ? -1 : 0;
      return o.desc ? -c : c;
    });
    const cols = [["fecha", "Fecha"], ["producto", "Producto"], ["importe", "Aportado"],
    ["valor", "Vale hoy"], ["pl", "Plusvalía"], ["rent", "Rentabilidad"]];
    $("#tablaMov").innerHTML =
      `<thead><tr>${cols.map(c => `<th class="orden" data-c="${c[0]}">${c[1]}${o.col === c[0] ? (o.desc ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
       <tbody>${f.map(r => `<tr>
        <td>${G.fmtFecha(r.fecha)}</td>
        <td><i class="pt" style="background:${r.color}"></i>${r.producto}</td>
        <td>${G.fmtEur(r.importe)}</td>
        <td>${r.valor != null ? G.fmtEur(r.valor) : "—"}</td>
        <td class="${r.pl >= 0 ? "pos" : "neg"}">${r.pl != null ? G.fmtEurSigno(r.pl) : "—"}</td>
        <td class="${r.rent >= 0 ? "pos" : "neg"}">${r.rent != null ? G.fmtPctSigno(r.rent, 1) : "—"}</td>
      </tr>`).join("")}</tbody>`;
    $("#tablaMov").querySelectorAll("th.orden").forEach(th => {
      th.onclick = () => {
        const c = th.dataset.c;
        estado.ordenTabla = { col: c, desc: o.col === c ? !o.desc : true };
        pintaTabla();
      };
    });
    $("#notaTabla").textContent =
      `${f.length} movimientos · ${G.fmtEur(f.reduce((a, r) => a + r.importe, 0), 0)}`;
  }

  // Los botones para cambiar el objetivo, el colchón o el reparto dependen del editor, que llega después.
  document.addEventListener("rumbo:editor", () => { if (D) pintaPatrimonio(); });

  function pintaPatrimonio() {
    const mTodo = metricas(TODOS());
    const mVis = filtrando() ? metricas(visibles()) : mTodo;
    pintaFiltros();
    pintaHero(mVis, mTodo);
    pintaKPIs(mVis);
    pintaPrincipal(mVis);
    pintaChips();
    pintaDistribucion();
    pintaBarras();
    pintaExpoTotal();
    pintaLiquidez();
    pintaReparto();
    pintaHitos(mTodo);
    pintaProyeccion();
    pintaTabla();
    pintaSegm($("#segRango"), RANGOS, estado.rango, id => { estado.rango = id; pintaPatrimonio(); });
    pintaSegm($("#segVista"), [
      { id: "apilado", et: "Por producto" }, { id: "total", et: "Total" },
      { id: "dinero", et: "Tu dinero vs mercado" }, { id: "reparto", et: "Reparto %" }
    ], estado.vista, id => { estado.vista = id; pintaPatrimonio(); });
    pintaSegm($("#segDist"), [
      { id: "clase", et: "Activo" }, { id: "producto", et: "Producto" },
      { id: "entidad", et: "Entidad" }, { id: "tipo", et: "Tipo" }
    ], estado.dist, id => { estado.dist = id; pintaDistribucion(); });
    pintaSegm($("#segTabla"), [{ id: "todos", et: "Todos" }].concat(
      D.productos.filter(p => (p.aportaciones || []).some(a => a.importe))
        .map(p => ({ id: p.id, et: p.corto || p.nombre }))),
      estado.tablaFiltro, id => { estado.tablaFiltro = id; pintaTabla(); });
  }

  /* ================================================================
     PESTAÑA 2 · EL MES
     ================================================================ */
  function pintaMes() {
    const rm = D.resumenMensual || [];
    if (!rm.length) { $("#mesCifra").textContent = "—"; return; }
    if (estado.mes == null || estado.mes < 0 || estado.mes >= rm.length) estado.mes = rm.length - 1;
    const r = rm[estado.mes];

    const sel = $("#mesSel");
    if (sel.options.length !== rm.length) {
      sel.innerHTML = rm.map((x, i) => `<option value="${i}">${G.fmtMes(x.mes)}</option>`).join("");
    }
    sel.value = String(estado.mes);
    $("#mesPrev").disabled = estado.mes === 0;
    $("#mesNext").disabled = estado.mes === rm.length - 1;

    const cambio = r.fin - r.inicio;
    // El titular es el cambio REAL: lo que aportaste mas lo que hizo el mercado.
    // Incorporar una cuenta al panel mueve el saldo pero no es dinero ganado,
    // asi que va aparte y no infla la cifra grande.
    const real = r.aportado + r.mercado;
    const ultimo = estado.mes === rm.length - 1;
    $("#mesEtq").textContent = ultimo ? "Cambio en lo que va de mes" : "Cambio del mes";
    $("#mesCifra").textContent = G.fmtEurSigno(real);
    $("#mesCifra").className = "hCifra " + (real >= 0 ? "pos" : "neg");
    $("#mesNota").textContent = ultimo
      ? "Mes en curso, con datos hasta el " + G.fmtFecha(D.fechaExtracto) : "";
    const trozos = [`De <span class="fuerte">${G.fmtEur(r.inicio)}</span> a <span class="fuerte">${G.fmtEur(r.fin)}</span>`];
    if (r.rentabilidad != null) {
      trozos.push(`rentabilidad de la cartera
        <span class="${r.rentabilidad >= 0 ? "pos" : "neg"} fuerte">${G.fmtPctSigno(r.rentabilidad)}</span>`);
    }
    if (r.nuevo) {
      trozos.push(`<span class="pill">de la diferencia, ${G.fmtEur(r.nuevo, 0)} son cuentas que entran al panel</span>`);
    }
    $("#mesSub").innerHTML = trozos.join('<span style="color:var(--tinta3)">·</span>');

    const tarjetas = [
      { e: "Lo pusiste tú", v: G.fmtEur(r.aportado, 0), n: "aportaciones del mes", c: G.css("--s1") },
      {
        e: "Lo puso el mercado", v: G.fmtEurSigno(r.mercado), n: "revalorización, sin tocar nada",
        c: G.css("--s3"), cl: r.mercado >= 0 ? "pos" : "neg"
      },
    ];
    if (r.nuevo) tarjetas.push({
      e: "Nuevo en el panel", v: G.fmtEur(r.nuevo, 0),
      n: "no es dinero nuevo: es que empiezas a seguirlo", c: G.css("--s7")
    });
    $("#mesTarjetas").innerHTML = tarjetas.map(t =>
      `<div class="mesT" style="--c:${t.c}"><span class="barra"></span>
        <div class="e">${t.e}</div><div class="v ${t.cl || ""}">${t.v}</div><div class="n">${t.n}</div></div>`).join("");

    // tabla por componente
    const filas = TODOS().map(p => ({ p, d: r.porProducto[p.id] })).filter(x => x.d);
    const hayNuevo = filas.some(x => x.d.nuevo);
    const colNuevo = hayNuevo ? "<th>Entra al panel</th>" : "";
    $("#mesTabla").innerHTML =
      `<thead><tr><th>Componente</th><th>Al empezar</th><th>Aportaste</th>
        <th>Mercado</th>${colNuevo}<th>Al cerrar</th><th>Variación</th></tr></thead>
       <tbody>${filas.map(({ p, d }) => {
        const var_ = d.fin - d.inicio;
        return `<tr>
          <td><i class="pt" style="background:${color(p)}"></i>${p.corto || p.nombre}</td>
          <td>${G.fmtEur(d.inicio)}</td>
          <td>${d.aportado ? G.fmtEur(d.aportado) : "—"}</td>
          <td class="${d.mercado >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(d.mercado)}</td>
          ${hayNuevo ? `<td>${d.nuevo ? G.fmtEur(d.nuevo) : "—"}</td>` : ""}
          <td>${G.fmtEur(d.fin)}</td>
          <td class="${var_ >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(var_)}</td></tr>`;
      }).join("")}</tbody>
       <tfoot><tr><td>Total</td><td>${G.fmtEur(r.inicio)}</td><td>${G.fmtEur(r.aportado)}</td>
        <td class="${r.mercado >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(r.mercado)}</td>
        ${hayNuevo ? `<td>${G.fmtEur(r.nuevo)}</td>` : ""}
        <td>${G.fmtEur(r.fin)}</td>
        <td class="${cambio >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(cambio)}</td></tr></tfoot>`;
    $("#mesTablaNota").textContent = r.nuevo
      ? `Incluye ${G.fmtEur(r.nuevo, 0)} que entran al seguimiento este mes.` : "";

    // histórico de esfuerzo vs mercado
    const ult = rm.slice(-18);
    G.barrasAgrupadas($("#grafMesHist"), {
      categorias: ult.map(x => x.mes), alto: 250,
      formatoCat: G.fmtMes,
      series: [
        { nombre: "Lo pusiste tú", color: G.css("--s1"), valores: ult.map(x => x.aportado) },
        { nombre: "Lo puso el mercado", color: G.css("--s3"), valores: ult.map(x => x.mercado) },
      ],
    });
  }

  /* ================================================================
     PESTAÑA 3 · FONDOS
     ================================================================ */
  function pintaFondos() {
    const lista = TODOS().filter(p => !vendido(p)).concat(TODOS().filter(vendido));
    if (!estado.fondo || !buscaProd(estado.fondo)) estado.fondo = lista[0].id;
    const p = buscaProd(estado.fondo);

    $("#selFondo").innerHTML = "";
    lista.forEach(x => {
      const b = document.createElement("button");
      b.style.setProperty("--c", color(x));
      b.setAttribute("aria-pressed", String(x.id === estado.fondo));
      b.innerHTML = `<i></i>${x.corto || x.nombre}`;
      if (vendido(x)) { b.classList.add("vendido"); b.title = "Ya lo vendiste del todo"; }
      b.onclick = () => { estado.fondo = x.id; pintaFondos(); };
      $("#selFondo").appendChild(b);
    });

    pintaFichaFondo(p);
    pintaExposicion(p);
    pintaTablaFondo(p);
  }

  // «Ganancia total = precio + ventas + dividendos − comisiones», con las partes que tenga.
  function desgloseGanancia(p) {
    const c = p.cobros || {};
    const partes = [];
    if (p.plusvalia) partes.push(`${G.fmtEurSigno(p.plusvalia)} de lo que aún tienes`);
    if (c.ventas) partes.push(`${G.fmtEurSigno(c.ventas)} en ventas`);
    const piso = p.tipoClave === "inmueble";
    if (c.dividendos) partes.push(`${G.fmtEurSigno(c.dividendos)} en ${piso ? "alquileres" : "dividendos e intereses"}`);
    if (c.gastos) partes.push(`${G.fmtEurSigno(-c.gastos)} en ${piso ? "gastos" : "comisiones aparte"}`);
    const base = (p.aportado || 0) + (p.costeVendido || 0);
    return `<p class="subt desglose">Ganancia total: ${partes.join(" · ")}.` +
      (base > 0 ? ` El % es sobre todo lo que has llegado a invertir en él (${G.fmtEur(base)}).` : "") + `</p>`;
  }

  // Rentabilidad del alquiler de un inmueble: bruta (lo cobrado) y neta (menos gastos), sobre lo que vale hoy.
  function desgloseAlquiler(p) {
    const al = p.alquiler;
    if (al.cobrado12 || al.gastos12) {
      const sobre = v => p.valor > 0 ? G.fmtPct(v / p.valor, 2) : "—";
      return `<p class="subt desglose">Alquiler en los últimos 12 meses: ${G.fmtEur(al.cobrado12)} cobrados y
        ${G.fmtEur(al.gastos12)} de gastos. Rentabilidad bruta ${sobre(al.cobrado12)} y neta
        ${sobre(al.cobrado12 - al.gastos12)} sobre lo que vale hoy (${G.fmtEur(p.valor)}).</p>`;
    }
    return `<p class="subt desglose">Alquiler desde el principio: ${G.fmtEur(al.cobrado)} cobrados y ${G.fmtEur(al.gastos)}
      de gastos (nada en los últimos 12 meses).</p>`;
  }

  function pintaFichaFondo(p) {
    const sec = $("#fondoFicha");
    sec.style.setProperty("--c", color(p));
    const campos = [
      ["Tipo", p.tipo], ["ISIN", p.isin], ["Índice que replica", p.indice],
      ["Comisión anual (TER)", p.ter != null ? G.fmtPct(p.ter, 2) : null],
      ["Entidad", p.entidad], ["Gestora", p.gestora],
      ["Política", p.politica], ["Mercado", p.mercado],
      [p.origen ? "Primera aportación" : "Primer dato anotado", p.desde ? G.fmtFecha(p.desde) : null],
      [p.etqUnidades || "Participaciones",
        p.titulos != null ? G.nfNum.format(p.titulos)
          : p.participaciones != null ? G.nfNum.format(p.participaciones) : null],
      ["Precio medio de compra", p.precioMedio != null ? G.fmtEur(p.precioMedio) : null],
      [p.etqPrecio || "Valor liquidativo",
        p.nav != null ? G.fmtEur(p.nav) + (p.navFecha ? " · cierre del " + G.fmtFechaCorta(p.navFecha) : "") : null],
      ["Fuente del precio", p.fuenteTexto || p.fuentePrecio],
      ["Peso en el patrimonio", p.peso != null ? G.fmtPct(p.peso, 1) : null],
    ].filter(c => c[0] && c[1]);

    const hayVL = !!(p.navSerie && p.navSerie.some(v => v));
    const etqVL = p.etqPrecio || "Valor liquidativo";
    const pocos = (p.serie || []).filter(v => v != null).length < 5;

    sec.innerHTML = `
      <header>
        <h2><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color(p)};margin-right:9px"></span>${p.nombre}</h2>
        <div class="sep"></div>
        <div class="segm" id="segRangoFondo"></div>
        ${hayVL ? '<div class="segm" id="segSerie"></div>' : ""}
      </header>
      ${p.papel ? `<div class="papel">${p.papel}</div>` : ""}
      ${(p.traspasos || []).filter(t => t.estimada).map(t => `<div class="av"><span>⚠</span><span>La fecha del traspaso
        ${t.tipo === "salida" ? "a" : "desde"} «${escH(t.otroNombre || t.otro)}» (${G.fmtFecha(t.fecha)}) es estimada. Compruébala en el
        historial de órdenes de MyInvestor y corrígela en Mis datos → Movimientos.</span></div>`).join("")}
      ${p.indiceDetalle ? `<p style="color:var(--tinta2);font-size:13.5px;margin:0 0 16px">${p.indiceDetalle}</p>` : ""}
      <div class="ficha">${campos.map(c => `<div><dt>${c[0]}</dt><dd>${c[1]}</dd></div>`).join("")}</div>
      <div id="ventanas"></div>
      ${pocos ? '<p class="subt" style="margin:0 0 12px">Solo hay un valor anotado, así que aún no hay curva. Anota más en «Mis datos → Saldos y valores».</p>' : ""}
      <div class="envGraf" id="grafFondo"></div>
      <div class="tramos" id="tramosLey"></div>`;

    // "Al cierre" es la cifra comparable con MyInvestor, que fuera de horario
    // se queda en el último cierre. "En vivo" sigue al bitcoin a cualquier hora.
    const vivoAqui = !!(precioVivo() && precioVivo().id === p.id);
    const plCierre = p.aportado > 0 ? { eur: p.valor - p.aportado, pct: (p.valor - p.aportado) / p.aportado } : null;
    const res = [
      ["Aportado", p.aportado != null ? G.fmtEur(p.aportado) : "—"],
      [vivoAqui ? "Valor al cierre" : "Valor hoy", G.fmtEur(p.valor)],
      [vivoAqui ? "Plusvalía al cierre" : "Plusvalía",
        plCierre ? `${G.fmtEurSigno(plCierre.eur)} · ${G.fmtPctSigno(plCierre.pct, 2)}` : "—"],
    ];
    if (vivoAqui) {
      const plv = plusvaliaDe(p);
      res.push(["En vivo ahora", `${G.fmtEur(valorDe(p))} · ${G.fmtPctSigno(plv.pct, 2)}`]);
    }
    const conCobros = p.gananciaTotal != null && Math.abs(p.realizado || 0) >= 0.01;
    if (conCobros) {
      res.push(["Ganancia total", `<span class="${p.gananciaTotal >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(p.gananciaTotal)}</span>` +
        (p.rentabilidadTotal != null ? ` · ${G.fmtPctSigno(p.rentabilidadTotal, 2)}` : "")]);
    }
    const al = p.alquiler;
    const alq12 = al && (al.cobrado12 || al.gastos12);
    if (alq12) {
      const neto = al.cobrado12 - al.gastos12;
      res.push(["Alquiler neto, 12 meses", `<span class="${neto >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(neto)}</span>` +
        (p.valor > 0 ? ` · ${G.fmtPctSigno(neto / p.valor, 2)}` : "")]);
    }
    // Intereses de una cuenta: lo cobrado en los últimos 12 meses, sobre lo que hay hoy.
    const it = p.intereses;
    if (it && (it.cobrado12 || it.gastos12)) {
      const neto = it.cobrado12 - it.gastos12;
      res.push(["Intereses, 12 meses", `<span class="${neto >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(neto)}</span>` +
        (p.valor > 0 ? ` · ${G.fmtPctSigno(neto / p.valor, 2)}` : "")]);
    }
    res.push(["TIR", p.tir != null ? G.fmtPctSigno(p.tir) : "—"]);
    // Tu posición y el comportamiento del producto van en filas separadas:
    // el "1 año" del bitcoin es del precio, no de tu dinero.
    let html = `<div class="ventanas"><span class="grupoEtq">Tu posición</span>` +
      res.map(r => `<div class="ventana"><div class="e">${r[0]}</div><div class="v">${r[1]}</div></div>`).join("") +
      `</div>` + (conCobros ? desgloseGanancia(p) : "") + (al ? desgloseAlquiler(p) : "");
    if (p.ventanas) {
      const et = { "1m": "1 mes", "3m": "3 meses", "6m": "6 meses", ytd: "En el año", "1a": "1 año" };
      const celdas = ["1m", "3m", "6m", "ytd", "1a"].filter(k => p.ventanas[k] != null)
        .map(k => `<div class="ventana"><div class="e">${et[k]}</div>
          <div class="v ${p.ventanas[k] >= 0 ? "pos" : "neg"}">${G.fmtPctSigno(p.ventanas[k], 1)}</div></div>`).join("");
      if (celdas) {
        html += `<div class="ventanas"><span class="grupoEtq">${p.etqVentanas || "El precio"}, lo tuvieras o no</span>${celdas}</div>`;
      }
    }
    $("#ventanas").innerHTML = html;

    if (hayVL) {
      pintaSegm($("#segSerie"),
        [{ id: "posicion", et: "Mi posición" }, { id: "vl", et: etqVL }],
        estado.serieDetalle, id => { estado.serieDetalle = id; pintaFichaFondo(p); });
    }

    // Periodo propio de esta gráfica: por defecto todo el histórico del producto.
    pintaSegm($("#segRangoFondo"), RANGOS, estado.rangoFondo,
      id => { estado.rangoFondo = id; pintaFichaFondo(p); });
    // Empieza donde empieza el fondo: sin un tramo vacío al principio si llegó más tarde que el resto.
    const primerDato = Math.max(0, (p.serie || []).findIndex(v => v != null && v > 0));
    const i0 = Math.max(desdeIdx(estado.rangoFondo), estado.serieDetalle === "vl" ? 0 : primerDato);
    const cortaF = arr => (arr || []).slice(i0);

    const verVL = hayVL && estado.serieDetalle === "vl";
    const paleta = tonos(color(p));
    const fechas = cortaF(D.fechas);
    const eventos = (p.aportaciones || []).filter(a => a.importe).map(a => {
      const niv = a.nivel == null ? 1 : a.nivel;
      return {
        fecha: a.fecha, color: paleta[niv], aro: niv === 2, r: 5,
        texto: `${["Aportación pequeña", "Aportación habitual", "Aportación extraordinaria"][niv]}: ${G.fmtEur(a.importe)}`,
      };
    });
    // Los traspasos, marcados en su día: «⇄ a World» o «⇄ desde AXA».
    const marcas = (p.traspasos || []).map(t => {
      const sale = t.tipo === "salida", otro = escH(t.otroNombre || t.otro);
      const fila = (a, b) => b == null ? "" : `<tr><td>${a}</td><td>${b}</td></tr>`;
      return {
        fecha: t.fecha, aviso: t.estimada,
        titulo: `Traspaso ${sale ? "a" : "desde"} ${t.otroNombre || t.otro}, ${G.fmtFecha(t.fecha)}`,
        texto: `⇄ Traspaso ${sale ? "a" : "desde"} ${otro}`,
        html: `<b>${sale ? "Traspaso de salida" : "Traspaso de entrada"}</b>
          <div class="ttTotal">${sale ? "→" : "←"} ${otro}</div>
          <table>${fila("Fecha", G.fmtFecha(t.fecha) + (t.estimada ? " <span class=\"ttEstimada\">estimada</span>" : ""))}
            ${fila("Valor traspasado", G.fmtEur(t.importe))}
            ${fila("Participaciones", t.unidades != null ? G.nfNum.format(t.unidades) : null)}
            ${fila("Coste que pasa", G.fmtEur(t.coste))}</table>
          <div class="ttNota">${sale ? "Sale con su coste y su fecha de compra" : "Llega con el coste y la fecha de compra del fondo de origen"}:
            no cuenta como venta.${t.estimada ? " Comprueba la fecha en MyInvestor y corrígela en Movimientos." : ""}</div>`,
      };
    });
    G.lineaConEventos($("#grafFondo"), {
      fechas,
      valores: cortaF(verVL ? p.navSerie : p.serie),
      color: color(p), alto: 280, eventos, marcas, desdeCero: !verVL,
      overlay: verVL ? null : ((p.serieAportado || []).some(v => v)
        ? { nombre: "Aportado", valores: cortaF(p.serieAportado) } : null),
      formatoY: verVL ? G.dinero(v => G.fmtEur(v, v > 500 ? 0 : 2)) : null,
      referencia: (verVL && p.precioMedio)
        ? { valor: p.precioMedio, etiqueta: "tu precio medio · " + G.fmtEur(p.precioMedio) } : null,
    });

    // leyenda de los tramos, con los importes reales de este producto
    const t = p.tramos;
    if (t && eventos.length) {
      const cuenta = [0, 0, 0];
      (p.aportaciones || []).forEach(a => { if (a.nivel != null) cuenta[a.nivel]++; });
      const medio = t.p33 != null && t.p67 != null
        ? (t.p33 === t.p67 ? G.fmtEur(t.p33, 0) : `${G.fmtEur(t.p33, 0)} – ${G.fmtEur(t.p67, 0)}`)
        : "";
      const et = t.p33 == null
        ? [["Aportaciones", ""]]
        : [["Pequeña", "menos de " + G.fmtEur(t.p33, 0)],
           ["Habitual", medio],
           ["Extraordinaria", "más de " + G.fmtEur(t.p67, 0)]];
      $("#tramosLey").innerHTML =
        `<span style="color:var(--tinta3)">Tamaño de cada aportación, medido con tu propio historial en este producto:</span>` +
        et.map((e, i) => `<span><i class="${i === 2 ? "aro" : ""}" style="background:${paleta[i]};color:${paleta[i]}"></i>
          ${e[0]} <span style="color:var(--tinta3)">${e[1]}${cuenta[i] ? " · " + cuenta[i] : ""}</span></span>`).join("");
    } else $("#tramosLey").innerHTML = "";
  }

  function pintaExposicion(p) {
    const sec = $("#fondoExpo");
    const e = p.exposicion;
    if (!e || (!(e.paises || []).length && !(e.sectores || []).length)) { sec.hidden = true; return; }
    sec.hidden = false;
    const meses = (Date.parse(D.fechaExtracto) - Date.parse(e.actualizado)) / (30.44 * 864e5);
    const viejo = meses > 6;
    sec.innerHTML = `
      <header>
        <h2>Qué hay dentro</h2>
        <div class="sep"></div>
        <span class="expoNota ${viejo ? "viejo" : ""}">${viejo ? "⚠ " : ""}Datos a ${G.fmtFecha(e.actualizado)}${viejo ? " · conviene refrescarlos" : ""}</span>
      </header>
      <p class="subt" style="margin:0 0 18px">${e.constituyentes ? e.constituyentes.toLocaleString("es-ES") + " empresas. " : ""}${e.fuente || ""}.
        ${e.empresa ? "Es una sola empresa: todo está en su país y su sector." : "Datos a la fecha indicada."}
        ${e.rv != null && e.rv < 0.97 && !e.empresa ? ` Es el reparto de su parte en bolsa, que es el ${G.fmtPct(e.rv, 0)} del producto.` : ""}</p>
      <div class="expo">
        <div><h3>Por país</h3><div class="envGraf" id="expoPaises"></div></div>
        <div><h3>Por sector</h3><div class="envGraf" id="expoSectores"></div></div>
      </div>
      ${e.top10 ? `<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--tinta3);margin:24px 0 10px">
        Las 10 mayores posiciones · ${e.top10.reduce((a, x) => a + x[1], 0).toFixed(1)} % del fondo</h3>
        <div class="tablaEnv"><table class="dt"><tbody>${e.top10.map(x =>
          `<tr><td>${x[0]}</td><td>${x[1].toLocaleString("es-ES", { minimumFractionDigits: 2 })} %</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    G.barrasHorizontales($("#expoPaises"), { datos: e.paises, color: color(p) });
    G.barrasHorizontales($("#expoSectores"), { datos: e.sectores, color: color(p) });
  }

  function tablaTraspasos(p) {
    const t = (p.traspasos || []).slice().reverse();
    if (!t.length) return "";
    return `<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--tinta3);margin:22px 0 10px">Traspasos</h3>
      <div class="tablaEnv"><table class="dt"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Importe</th>
        <th>${p.etqUnidades || "Participaciones"}</th><th title="Lo que habías pagado por lo traspasado: pasa al destino">Coste que pasa</th></tr></thead>
      <tbody>${t.map(x => `<tr><td>${G.fmtFecha(x.fecha)}</td>
        <td>${x.tipo === "entrada" ? "Entra desde " : "Sale hacia "}${x.otroNombre}${x.total ? " (todo)" : ""}</td>
        <td>${G.fmtEur(x.importe)}</td><td>${x.unidades != null ? (x.tipo === "entrada" ? "+" : "−") + G.nfNum.format(x.unidades) : "—"}</td>
        <td>${G.fmtEur(x.coste)}</td></tr>`).join("")}</tbody></table></div>
      <p class="subt" style="margin:8px 0 0">Un traspaso no es una venta: lo que habías pagado y la fecha de cada compra pasan al
        producto de destino, y no cuenta como dinero nuevo en tus aportaciones.</p>`;
  }

  function pintaTablaFondo(p) {
    const sec = $("#fondoTabla");
    const filas = (p.aportaciones || []).filter(a => a.importe).slice().reverse();
    if (!filas.length) {
      sec.innerHTML = `<header><h2>${(p.traspasos || []).length ? "Movimientos" : "Aportaciones"}</h2></header>
        ${(p.traspasos || []).length ? "" : '<p class="vacio">Este componente no tiene aportaciones registradas: solo anotas su valor.</p>'}
        ${tablaTraspasos(p)}`;
      return;
    }
    const esFondo = p.tipoClave === "fondo" || p.tipoClave === "pension";
    const paleta = tonos(color(p));
    const hoy = new Date(D.fechaExtracto);
    const cab = ["Fecha", "Aportado", p.etqUnidades || "Participaciones",
      esFondo ? "VL de compra" : "Precio de compra", "Vale hoy", "Plusvalía", "Rent.", "Días"];
    sec.innerHTML = `<header><h2>Aportaciones a este producto</h2>
        <span class="subt">${filas.length} en total · ${G.fmtEur(p.aportado, 0)}</span></header>
      <div class="tablaEnv alto"><table class="dt">
        <thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${filas.map(a => {
          const pl = a.valor != null ? a.valor - a.importe : null;
          const rt = pl != null && a.importe ? pl / a.importe : null;
          const dias = Math.round((hoy - new Date(a.fecha)) / 864e5);
          const niv = a.nivel == null ? 1 : a.nivel;
          return `<tr><td>${G.fmtFecha(a.fecha)}</td>
            <td><i class="pt" style="background:${paleta[niv]}"></i>${G.fmtEur(a.importe)}</td>
            <td>${G.nfNum.format(a.participaciones || 0)}</td>
            <td>${a.precio != null ? G.fmtEur(a.precio) : "—"}</td>
            <td>${a.valor != null ? G.fmtEur(a.valor) : "—"}</td>
            <td class="${pl >= 0 ? "pos" : "neg"}">${pl != null ? G.fmtEurSigno(pl) : "—"}</td>
            <td class="${rt >= 0 ? "pos" : "neg"}">${rt != null ? G.fmtPctSigno(rt, 1) : "—"}</td>
            <td>${dias}</td></tr>`;
        }).join("")}</tbody></table></div>${tablaTraspasos(p)}`;
  }

  /* ================================================================
     PESTAÑA 4 · RENDIMIENTO
     ================================================================ */
  function pintaRendimiento() {
    const ra = D.rentabilidadAnual;
    if (ra && ra.anos.length) {
      G.barrasSimples($("#grafAnual"), {
        categorias: ra.anos.map((a, i) => a + (ra.parcial[i] ? " *" : "")),
        valores: ra.cartera, alto: 240,
        color: G.css("--s1"),
        colores: ra.cartera.map(v => v >= 0 ? G.css("--s1") : G.css("--s2")),
      });
      $("#notaAnual").textContent =
        "Tu cartera completa, limpia del efecto de cuándo metiste el dinero. * año incompleto.";

      // Solo TU rentabilidad, por producto y año.
      $("#notaTablaAnual").textContent =
        "Tu rentabilidad en cada producto y año, desde el precio real al que compraste y con comisiones. "
        + "En un año completo coincide con la rentabilidad publicada del producto; el primer año cuenta desde tu primera compra.";
      const verProducto = false;
      const tabla = ra.porProducto;
      const desde = ra.desde || {};
      const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      const corto = iso => { const q = iso.split("-"); return `${+q[2]} ${MES[+q[1] - 1]}`; };
      const celda = (v, d, vendido) => v == null
        ? `<td class="subt">${verProducto ? "—" : vendido ? "ya lo habías vendido" : "aún no lo tenías"}</td>`
        : `<td class="${v >= 0 ? "pos" : "neg"}">${G.fmtPctSigno(v, 1)}` +
          `${d ? `<span class="subt" style="font-weight:400"> · desde ${corto(d)}</span>` : ""}</td>`;
      const prods = D.productos.filter(p => tabla[p.id]);
      $("#tablaAnual").innerHTML =
        `<thead><tr><th>Producto</th>${ra.anos.map((a, i) =>
          `<th>${a}${ra.parcial[i] ? " *" : ""}</th>`).join("")}</tr></thead>
         <tbody>${prods.map(p => `<tr>
           <td><i class="pt" style="background:${color(p)}"></i>${p.corto}</td>
           ${tabla[p.id].map((v, i) => celda(v, (desde[p.id] || [])[i], ((ra.vendido || {})[p.id] || [])[i])).join("")}
         </tr>`).join("")}</tbody>` +
        (verProducto ? "" : `<tfoot><tr><td>Tu cartera</td>${ra.cartera.map(v =>
          `<td class="${v == null ? "" : v >= 0 ? "pos" : "neg"}">${G.fmtPctSigno(v, 1)}</td>`).join("")}</tr></tfoot>`);
    }

    pintaComparacion();
    pintaDividendos();
    pintaFiscal();

    const comp = D.comparador || [];
    const detalles = $("#compDetalles");
    // Los detalles solo se dibujan al abrirlos: un SVG dentro de algo cerrado no tiene ancho.
    if (detalles && !detalles.dataset.conectado) {
      detalles.dataset.conectado = "1";
      detalles.addEventListener("toggle", () => { if (detalles.open) pintaRendimiento(); });
    }
    if (comp.length && (!detalles || detalles.open)) {
      const met0 = comp[0].metricas;
      const paleta = [G.css("--s1"), G.css("--s2"), G.css("--s3"), G.css("--s4"), G.css("--s5"), G.css("--s7"), G.css("--s6")];
      const series = comp.map((c, i) => ({
        nombre: c.nombre, valores: c.indice, destacado: c.real,
        color: c.real ? G.css("--tinta") : paleta[(i + 1) % paleta.length],
      }));
      G.multiLinea($("#grafComparador"), {
        fechas: D.fechas, series, alto: 320,
        formatoY: v => Math.round(v),
        formatoValor: v => v.toFixed(1),
      });
      $("#notaComparador").textContent =
        `Base 100 desde el ${G.fmtFecha(met0.desde)}. Las alternativas son comprar y mantener con pesos fijos.`;
      $("#tablaComparador").innerHTML =
        `<thead><tr><th>Cartera</th><th>Rentabilidad</th><th>Anualizada</th>
          <th>Volatilidad</th><th>Sharpe</th><th>Máx. caída</th></tr></thead>
         <tbody>${comp.map((c, i) => {
          const m = c.metricas;
          return `<tr class="${c.real ? "destacada" : ""}">
            <td><i class="pt" style="background:${series[i].color}"></i>${c.nombre}</td>
            <td class="${m.rentTotal >= 0 ? "pos" : "neg"}">${G.fmtPctSigno(m.rentTotal, 1)}</td>
            <td class="${m.cagr >= 0 ? "pos" : "neg"}">${G.fmtPctSigno(m.cagr, 1)}</td>
            <td>${G.fmtPct(m.vol, 1)}</td>
            <td>${m.sharpe == null ? "—" : m.sharpe.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="neg">${G.fmtPct(m.maxDD, 1)}</td></tr>`;
        }).join("")}</tbody>`;
      $("#notaRiesgo").innerHTML =
        `<b>Cómo leerlo.</b> La volatilidad mide cuánto se mueve la cartera; el Sharpe, cuánta rentabilidad
         sacas por cada unidad de ese meneo (más alto, mejor). El tipo sin riesgo sale de tu fondo
         monetario, si tienes uno. Ojo: son solo
         ${((Date.parse(met0.hasta) - Date.parse(met0.desde)) / 3.1536e10).toFixed(1)} años de datos,
         así que valen para comparar entre ellas, no como pronóstico. Tu cartera real cambia de pesos
         con el tiempo y cada producto solo cuenta desde que lo compraste; las alternativas son
         hipotéticas y llevan sus pesos fijos desde el primer día.`;
    }

    const c = D.comisiones;
    if (c && c.lineas.length) {
      $("#notaComisiones").textContent =
        `${G.fmtEur(c.anual)} al año · ${G.fmtPct(c.terPonderado, 3)} de lo invertido`;
      $("#tablaComisiones").innerHTML =
        `<thead><tr><th>Producto</th><th>Comisión</th><th>Sobre</th><th>Al año</th><th>Al mes</th></tr></thead>
         <tbody>${c.lineas.map(l => `<tr>
            <td><i class="pt" style="background:${temaOscuro() ? l.color[1] : l.color[0]}"></i>${l.nombre}</td>
            <td>${G.fmtPct(l.ter, 2)}</td><td>${G.fmtEur(l.valor, 0)}</td>
            <td>${G.fmtEur(l.anual)}</td><td>${G.fmtEur(l.anual / 12)}</td></tr>`).join("")}</tbody>
         <tfoot><tr><td>Total</td><td>${G.fmtPct(c.terPonderado, 3)}</td>
           <td>${G.fmtEur(c.base, 0)}</td><td>${G.fmtEur(c.anual)}</td>
           <td>${G.fmtEur(c.anual / 12)}</td></tr></tfoot>`;
    }
  }

  /* ---------------------------------------------- dividendos */
  function pintaDividendos() {
    const cont = $("#dividendos");
    if (!cont) return;
    const dv = D.dividendos;
    if (!dv || !dv.porProducto.length) {
      $("#notaDividendos").textContent = "";
      cont.innerHTML = `<p class="vacio" style="text-align:left;padding:4px 0">Cuando anotes un dividendo,
        un cupón o unos intereses (en «Mis datos → Movimientos», tipo «Dividendo o cupón»), aquí verás
        cuánto te pagan tus inversiones cada año sin vender nada.</p>`;
      return;
    }
    $("#notaDividendos").textContent = "Lo que te han pagado tus inversiones sin vender nada.";
    const conAlquiler = TODOS().some(p => p.alquiler && p.alquiler.cobrado);
    $("#seccionDividendos h2").textContent = conAlquiler ? "Dividendos, cupones, intereses y alquileres"
      : "Dividendos, cupones e intereses";
    const kpis = [
      { e: "Cobrado en total", v: G.fmtEur(dv.total), n: `${dv.porProducto.reduce((a, l) => a + l.cobros, 0)} cobros` },
      { e: "Últimos 12 meses", v: G.fmtEur(dv.ultimos12), n: "lo que te pagan en un año" },
      { e: "Al mes, de media", v: G.fmtEur(dv.ultimos12 / 12), n: "como un pequeño sueldo extra" },
      { e: "Rentabilidad por dividendo", v: dv.rentabilidad != null ? G.fmtPct(dv.rentabilidad, 2) : "—",
        n: "12 meses, sobre lo que vale hoy" },
    ];
    cont.innerHTML =
      `<div class="kpis" style="margin:6px 0 24px">${kpis.map(k =>
        `<div class="kpi"><div class="e">${k.e}</div><div class="v">${k.v}</div><div class="n">${k.n}</div></div>`).join("")}</div>
       <div class="envGraf" id="grafDividendos"></div>
       <div class="tablaEnv" style="margin-top:16px"><table class="dt" id="tablaDividendos"></table></div>`;
    const anoActual = D.fechaExtracto.slice(0, 4);
    G.barrasSimples($("#grafDividendos"), {
      categorias: dv.porAno.map(([a]) => a + (a === anoActual ? " *" : "")),
      valores: dv.porAno.map(([, v]) => v), alto: 220, color: G.css("--s3"),
      formatoY: G.fmtEurCorto, formatoValor: v => G.fmtEur(v, 0),
    });
    const pct = v => v != null ? G.fmtPct(v, 2) : "—";
    $("#tablaDividendos").innerHTML =
      `<thead><tr><th>Producto</th><th>Cobrado en total</th><th>Últimos 12 meses</th>
        <th title="Lo cobrado en 12 meses entre lo que vale hoy">Sobre lo que vale</th>
        <th title="Lo cobrado en 12 meses entre lo que pusiste (yield on cost)">Sobre lo que pusiste</th>
        <th>Último cobro</th></tr></thead>
       <tbody>${dv.porProducto.map(l => {
        const p = buscaProd(l.id) || { corto: l.id };
        return `<tr><td><i class="pt" style="background:${color(p)}"></i>${p.corto || p.nombre}</td>
          <td>${G.fmtEur(l.total)}</td><td>${G.fmtEur(l.ultimos12)}</td>
          <td>${pct(l.sobreValor)}</td><td>${pct(l.sobreCoste)}</td><td>${G.fmtFecha(l.ultimo)}</td></tr>`;
      }).join("")}</tbody>`;
  }

  /* ---------------------------------------------- para la Renta (solo con la app abierta) */
  const FISCAL = { ano: null, pidiendo: 0 };
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function pintaFiscal() {
    const sec = $("#seccionFiscal");
    if (!sec) return;
    // En la web publicada no hay servidor (ni debe salir esto): solo en la app.
    sec.hidden = !window.Editor;
    if (sec.hidden) return;
    const cont = $("#fiscal");
    const n = ++FISCAL.pidiendo;
    let j = {};
    try {
      const r = await fetch("api/fiscal" + (FISCAL.ano ? "?ano=" + encodeURIComponent(FISCAL.ano) : ""));
      j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error((j.errores || ["No he podido prepararlo."]).join(" "));
    } catch (e) {
      if (n !== FISCAL.pidiendo) return;
      $("#fiscalAnos").innerHTML = "";
      cont.innerHTML = `<p class="vacio" style="text-align:left;padding:4px 0">${escH(e.message)}</p>`;
      return;
    }
    if (n !== FISCAL.pidiendo) return;   // ya se pidió otro año
    FISCAL.ano = j.ano;
    pintaSegm($("#fiscalAnos"), (j.anos.length ? j.anos : [j.ano]).slice(0, 6).map(a => ({ id: a, et: a })),
      j.ano, id => { FISCAL.ano = id; pintaFiscal(); });
    const t = j.totales;
    const signo = v => `<span class="${v >= 0 ? "pos" : "neg"}">${G.fmtEurSigno(v)}</span>`;
    const aviso = `<div class="fiscalAviso"><b>Orientativo, para repasar el borrador: no es asesoramiento fiscal.</b>
      Ventas como Hacienda (FIFO; los traspasos entre fondos conservan coste y fecha). Rumbo no sabe tus retenciones ni tu
      situación: compáralo con los datos fiscales de tu banco.</div>`;
    if (!j.ventas.length && !j.cobros.length && !j.rescates.length && !j.comisiones.length && !j.gastosAlquiler.length) {
      cont.innerHTML = aviso + `<p class="vacio" style="text-align:left;padding:4px 0">En ${escH(j.ano)} no anotaste
        ventas, dividendos, intereses ni alquileres: no hay nada que declarar de tus inversiones ese año.</p>` +
        j.avisos.map(a => `<div class="av"><span>⚠</span><span>${escH(a)}</span></div>`).join("");
      return;
    }
    const nv = j.ventas.length;
    const kpis = [{
      e: "Ganancias y pérdidas", v: nv ? signo(t.saldo) : "—",
      n: !nv ? "no vendiste nada este año"
        : t.ganancias && t.perdidas ? `${G.fmtEurSigno(t.ganancias)} y ${G.fmtEurSigno(t.perdidas)}, en ${nv} ${nv === 1 ? "venta" : "ventas"}`
          : `en ${nv} ${nv === 1 ? "venta" : "ventas"}`
    }];
    if (t.dividendos) kpis.push({ e: "Dividendos y cupones", v: G.fmtEur(t.dividendos), n: "como los anotaste (lo cobrado)" });
    if (t.intereses) kpis.push({ e: "Intereses", v: G.fmtEur(t.intereses), n: "de cuentas y préstamos P2P, como los anotaste" });
    if (t.alquileres || t.gastosAlquiler) kpis.push({ e: "Alquileres", v: G.fmtEur(t.alquileres),
      n: t.gastosAlquiler ? `cobrados; ${G.fmtEur(t.gastosAlquiler)} de gastos anotados` : "cobrados, como los anotaste" });
    if (t.comisiones) kpis.push({ e: "Comisiones aparte", v: G.fmtEur(t.comisiones), n: "custodia y otras, sin compra ni venta" });
    const fechasCompra = v => {
      const fs = [...new Set(v.compras.map(c => c.fecha))].sort();
      if (!fs.length) return "—";
      return fs.length === 1 ? G.fmtFecha(fs[0]) : `${G.fmtFecha(fs[0])} a ${G.fmtFecha(fs[fs.length - 1])} (${fs.length} compras)`;
    };
    const tablaVentas = j.ventas.length ? `<h3>Ventas</h3>
      <div class="tablaEnv"><table class="dt"><thead><tr><th>Producto</th><th>Vendido el</th><th>Comprado el</th>
        <th>Transmisión</th><th>Adquisición</th><th>Ganancia o pérdida</th></tr></thead>
       <tbody>${j.ventas.map(v => `<tr>
          <td>${escH(v.nombre)}<span class="fiscalRevisar">${v.isin ? escH(v.isin) + " · " : ""}${escH(v.tipo)}</span>
            ${v.avisos.map(a => `<span class="fiscalRevisar">⚠ ${escH(a)}</span>`).join("")}</td>
          <td>${G.fmtFecha(v.fecha)}</td><td>${fechasCompra(v)}</td>
          <td>${G.fmtEur(v.transmision)}</td><td>${v.adquisicion != null ? G.fmtEur(v.adquisicion) : "—"}</td>
          <td>${signo(v.ganancia)}</td></tr>`).join("")}</tbody>
       <tfoot><tr><td>Total</td><td></td><td></td><td>${G.fmtEur(t.transmision)}</td><td>${G.fmtEur(t.adquisicion)}</td>
         <td>${signo(t.saldo)}</td></tr></tfoot></table></div>` : "";
    const tablaCobros = j.cobros.length ? `<h3>${j.cobros.some(x => x.clase === "Alquileres")
      ? "Dividendos, cupones, intereses y alquileres" : "Dividendos, cupones e intereses"}</h3>
      <div class="tablaEnv"><table class="dt"><thead><tr><th>Producto</th><th>Qué es</th><th>Cobros</th><th>Importe anotado</th></tr></thead>
       <tbody>${j.cobros.map(x => `<tr><td>${escH(x.nombre)}</td><td>${escH(x.clase)}</td><td>${x.cobros}</td>
         <td>${G.fmtEur(x.importe)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const tablaRescates = j.rescates.length ? `<h3>Rescates de planes de pensiones</h3>
      <div class="tablaEnv"><table class="dt"><thead><tr><th>Plan</th><th>Fecha</th><th>Rescatado</th></tr></thead>
       <tbody>${j.rescates.map(v => `<tr><td>${escH(v.nombre)}</td><td>${G.fmtFecha(v.fecha)}</td>
         <td>${G.fmtEur(v.transmision)}</td></tr>`).join("")}</tbody></table></div>` : "";
    cont.innerHTML = aviso +
      `<div class="kpis" style="margin:6px 0 8px">${kpis.map(k =>
        `<div class="kpi"><div class="e">${k.e}</div><div class="v">${k.v}</div><div class="n">${k.n}</div></div>`).join("")}</div>` +
      j.avisos.map(a => `<div class="av"><span>⚠</span><span>${escH(a)}</span></div>`).join("") +
      tablaVentas + tablaCobros + tablaRescates +
      `<p style="margin:18px 0 0"><a class="btn" id="fiscalBajar">Descargar en Excel (CSV)</a></p>`;
    const bajar = $("#fiscalBajar");
    bajar.href = URL.createObjectURL(new Blob(["\ufeff" + j.csv], { type: "text/csv;charset=utf-8" }));
    bajar.download = `rumbo_renta_${j.ano}.csv`;
  }

  /* ---------------------------------------------- avisos y pie */
  function pintaComun() {
    $("#avisos").innerHTML = (D.avisos || [])
      .map(a => `<div class="av"><span>⚠</span><span>${a}</span></div>`).join("");
    const pa = D.preciosActualizados;
    const fuentes = [...new Set(D.productos.map(p => p.fuentePrecio).filter(Boolean))];
    $("#pie").innerHTML =
      `${pa ? `Precios actualizados el ${G.fmtFecha(pa.slice(0, 10))} a las ${pa.slice(11, 16)}` : "Precios sin actualizar"} ·
       datos valorados a ${G.fmtFecha(D.fechaExtracto)} ·
       ${D.total.diasInvertido} días invertido.<br>
       Fuentes de precios: ${fuentes.join(", ") || "ninguna"}. En la pestaña Productos verás la de cada uno.<br>
       <b>Aviso:</b> herramienta informativa. No es asesoramiento financiero ni una recomendación de compra o venta.
       Los precios vienen de servicios públicos gratuitos y pueden tener errores o retrasos: no se garantiza su exactitud.`;
    if ($("#bannerDemo")) $("#bannerDemo").hidden = D.modo !== "demo";
    const K = window.CANAL;
    if (K) {
      $("#pie").insertAdjacentHTML("beforeend", `<span class="creditoCanal">Herramienta gratuita hecha por
        ${K.autor} · ¿Te resulta útil? <a href="${K.suscribir}" target="_blank" rel="noopener">Suscríbete al canal ▶</a></span>`);
      document.querySelectorAll(".autorCanal").forEach(el => { el.textContent = K.autor; });
      document.querySelectorAll(".enlaceCanal").forEach(el => { el.href = K.canal; });
      document.querySelectorAll(".enlaceSuscribir").forEach(el => { el.href = K.suscribir; });
    }
  }

  /* ---------------------------------------------- bitcoin en vivo */
  async function traeBtc() {
    const coin = D.vivo.coin || "bitcoin";
    const fuentes = [
      [`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=eur`, j => j[coin] && j[coin].eur],
    ];
    if (coin === "bitcoin") fuentes.push(["https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR", j => parseFloat(j.price)]);
    for (const [url, extrae] of fuentes) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const v = extrae(await r.json());
        if (v && isFinite(v)) return v;
      } catch (e) { /* probamos la siguiente */ }
    }
    return null;
  }
  async function actualizaVivo() {
    if (!D.vivo) return;
    const v = await traeBtc();
    if (!v) return;
    estado.btcVivo = v;
    pintarTab();
  }

  /* ---------------------------------------------- pestañas */
  function irA(tab) {
    // Si has cambiado datos en «Mis datos», el panel se recarga con las cifras nuevas.
    if (window.EDITOR_SUCIO && tab !== "datos") {
      recuerda.guarda("patrimonio.tab", tab);
      location.reload();
      return;
    }
    estado.tab = tab;
    document.querySelectorAll("#tabs button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== "tab-" + tab; });
    recuerda.guarda("patrimonio.tab", tab);
    pintarTab();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pintarTab() {
    // Cada pestaña se dibuja al mostrarse: un SVG dentro de un panel oculto
    // no tiene ancho, y saldria del tamano equivocado.
    if (estado.tab === "patrimonio") pintaPatrimonio();
    else if (estado.tab === "mes") pintaMes();
    else if (estado.tab === "fondos") pintaFondos();
    else if (estado.tab === "rendimiento") pintaRendimiento();
    else if (estado.tab === "datos" && window.Editor) window.Editor.mostrar();
  }
  function pintar() { pintaComun(); pintarTab(); }

  /* ---------------------------------------------- arranque */
  document.title = "Rumbo · " + (D.titular || "Mi patrimonio");
  $("#marcaTexto").textContent = D.titular || "Mi patrimonio";
  $("#metaFecha").textContent = "Datos a " + G.fmtFecha(D.fechaExtracto);

  $("#btnTema").onclick = () => { cambiaTema(); pintar(); };

  // Moneda en la que se ven los importes del panel (en «Mis datos» todo va en euros).
  const MONEDAS = D.monedas || {};
  function aplicaMoneda() {
    const m = MONEDAS[estado.moneda];
    G.ponMoneda(m ? estado.moneda : "EUR", m ? m.porEuro : 1);
    // Pesos chilenos o colombianos: cifras de muchos dígitos, un punto más pequeñas.
    document.body.classList.toggle("monedaLarga", !!m && m.porEuro > 100);
    const nota = $("#notaMoneda");
    nota.hidden = !m;
    if (m) {
      nota.textContent = `Estás viendo los importes en ${m.nombre.toLowerCase()} (${estado.moneda}) al cambio del ` +
        `${G.fmtFecha(m.fecha)}: 1 € = ${m.porEuro.toLocaleString("es-ES", { maximumFractionDigits: 4 })} ${G.moneda.simbolo}. ` +
        "Rumbo calcula en euros: la TIR y las rentabilidades son las de tu dinero en euros, y en «Mis datos» todo va en euros.";
    }
  }
  const selMoneda = $("#selMoneda");
  if (selMoneda && Object.keys(MONEDAS).length) {
    selMoneda.innerHTML = ["EUR", ...Object.keys(MONEDAS)].map(c => {
      const s = G.simboloMoneda(c);
      return `<option value="${c}" title="${c === "EUR" ? "Euros" : MONEDAS[c].nombre}">${s.length === 1 ? s + " " + c : c}</option>`;
    }).join("");
    if (!MONEDAS[estado.moneda]) estado.moneda = "EUR";
    selMoneda.value = estado.moneda;
    selMoneda.hidden = false;
    selMoneda.onchange = () => {
      estado.moneda = selMoneda.value;
      recuerda.guarda("patrimonio.moneda", estado.moneda);
      aplicaMoneda();
      pintar();
    };
  }
  aplicaMoneda();

  if ($("#btnPrecios")) $("#btnPrecios").onclick = async () => {
    const b = $("#btnPrecios");
    b.disabled = true;
    b.textContent = "↻ Actualizando…";
    try {
      const r = await fetch("api/actualizar", { method: "POST",
        headers: window.PERFILES && window.PERFILES.activo ? { "X-Rumbo-Perfil": window.PERFILES.activo } : {} });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      location.reload();
    } catch (e) {
      alert(e.message || "No he podido actualizar los precios. ¿Tienes conexión a internet?");
      b.disabled = false;
      b.textContent = "↻ Actualizar precios";
    }
  };
  if (location.protocol === "file:" && $("#btnPrecios")) $("#btnPrecios").hidden = true;
  $("#btnVideo").onclick = () => {
    document.body.classList.toggle("video");
    $("#btnVideo").classList.toggle("act");
    setTimeout(pintarTab, 60);
  };
  document.querySelectorAll("#tabs button").forEach(b => { b.onclick = () => irA(b.dataset.tab); });
  $("#mesSel").onchange = e => { estado.mes = +e.target.value; pintaMes(); };
  $("#mesPrev").onclick = () => { estado.mes = Math.max(0, estado.mes - 1); pintaMes(); };
  $("#mesNext").onclick = () => { estado.mes = Math.min(D.resumenMensual.length - 1, estado.mes + 1); pintaMes(); };
  ["rAnos", "rRent", "rApor"].forEach(id => $("#" + id).addEventListener("input", pintaProyeccion));
  $("#rApor").value = Math.min(3000, Math.max(0, Math.round((D.total.ritmoMensual || 500) / 50) * 50));

  document.addEventListener("keydown", e => {
    // Solo se ignoran los atajos mientras escribes en un campo. Si el guardia
    // fuese "el foco esta en el body", dejarian de funcionar en cuanto pulsas
    // cualquier boton, que es justo cuando los quieres.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.key === "Escape" && filtrando()) { estado.ocultos.clear(); pintaPatrimonio(); }
    if (e.key === "v" && !e.metaKey && !e.ctrlKey) $("#btnVideo").click();
    if (e.key === "l" && !e.metaKey && !e.ctrlKey && estado.tab === "patrimonio") {
      estado.ocultos = filtrando() ? new Set() : new Set(idsCorto());
      pintaPatrimonio();
    }
    const n = "123456".indexOf(e.key);
    const tab = ["patrimonio", "mes", "fondos", "rendimiento", "datos", "ayuda"][n];
    if (n >= 0 && document.getElementById("tab-" + tab)) irA(tab);
  });

  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(pintarTab, 140); });

  const tabGuardada = recuerda.lee("patrimonio.tab");
  if (tabGuardada && document.getElementById("tab-" + tabGuardada)) {
    estado.tab = tabGuardada;
    document.querySelectorAll("#tabs button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.tab === estado.tab)));
    document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== "tab-" + estado.tab; });
  }

  try {
    pintar();
  } catch (e) {
    console.error(e);
    document.querySelector(".env").insertAdjacentHTML("afterbegin",
      '<div class="av" style="margin:20px 0"><span>⚠</span><span><b>Algo ha fallado al pintar el panel.</b> ' +
      String(e && e.message || e) + '<br>Cierra la app y vuelve a abrirla con «Iniciar»; si sigue igual, pulsa F12 y mira la consola del navegador.</span></div>');
  }
  // ?ir=seccionComparar pone esa sección la primera de su pestaña (para capturas y enlaces).
  const irA_ = qs.get("ir") && document.getElementById(qs.get("ir"));
  if (irA_) {
    irA_.parentNode.prepend(irA_);
    irA_.style.marginTop = "24px";
    pintarTab();
  }
  actualizaVivo();
  setInterval(actualizaVivo, 60000);
})();
