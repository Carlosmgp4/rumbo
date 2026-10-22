/* ============================================================
   editor.js  ·  Pestaña «Mis datos»: productos, movimientos y
   saldos. Todo se guarda en mis_datos a través del servidor.
   ============================================================ */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const D = window.DATOS;
  const SOLO_SALDO = ["efectivo", "deuda"];
  const E = { cfg: null, modo: "demo", tipos: {}, fuentes: {}, tiposMov: {}, vista: "productos", filtro: "todos" };

  /* ---------------------------------------------- utilidades */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = v => v == null ? "—" : Number(v).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const num = (v, d = 4) => v == null ? "—" : Number(v).toLocaleString("es-ES", { maximumFractionDigits: d });
  const fecha = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
  const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const leeNum = t => {
    t = String(t || "").replace(/[€\s]/g, "");
    // "1.234,56" y "1.000" (mil) en castellano; "1234.5" también vale.
    if (t.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    return parseFloat(t);
  };
  const nombre = p => p ? (p.corto || p.nombre) : "¿?";
  const prod = id => E.cfg.productos.find(p => p.id === id);
  const soloSaldo = p => SOLO_SALDO.includes(p.tipo);
  // Productos a los que se les pueden anotar movimientos. A una cuenta, solo sus intereses.
  const conMovimientos = p => !soloSaldo(p) || p.tipo === "efectivo";
  const manual = p => p.fuente === "manual" || soloSaldo(p);
  const opciones = (obj, sel) => Object.entries(obj)
    .map(([k, v]) => `<option value="${esc(k)}"${k === sel ? " selected" : ""}>${esc(v)}</option>`).join("");
  const recuerda = {
    lee(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    guarda(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* da igual */ } },
  };
  E.vista = new URLSearchParams(location.search).get("vista") || recuerda.lee("patrimonio.editor") || "productos";

  // El perfil de esta página va en cada cambio: si en otra pestaña se cambió de perfil, el servidor no guarda.
  const cabeceraPerfil = () => (window.PERFILES && window.PERFILES.activo ? { "X-Rumbo-Perfil": window.PERFILES.activo } : {});
  // Al volver a esta pestaña, si el perfil activo ya no es el suyo, se recarga con el bueno.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !window.PERFILES) return;
    try {
      const r = await fetch("api/perfiles", { cache: "no-store" });
      const j = await r.json();
      if (j && j.activo && j.activo !== window.PERFILES.activo) location.reload();
    } catch (e) { /* sin conexión: ya avisará al guardar */ }
  });

  async function api(metodo, url, cuerpo) {
    const r = await fetch(url, {
      method: metodo, headers: { "Content-Type": "application/json", ...cabeceraPerfil() },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let j = {};
    try { j = await r.json(); } catch (e) { /* respuesta vacía */ }
    if (r.status === 409 && j.perfilCambiado) { alert(j.errores.join("\n")); location.reload(); throw new Error(j.errores[0]); }
    if (!r.ok || j.ok === false) throw new Error((j.errores || [j.error || "Algo ha fallado. ¿Sigue abierta la ventana negra de la app?"]).join("\n"));
    return j;
  }
  async function carga() {
    const j = await api("GET", "api/cartera");
    Object.assign(E, { cfg: j.cartera, modo: j.modo, tipos: j.tipos, fuentes: j.fuentes, tiposMov: j.tiposMovimiento });
  }
  async function guarda(coleccion, datos) {
    const j = await api("POST", "api/" + coleccion, datos);
    E.cfg = j.cartera;
    COP.lista = null;   // hay una copia automática nueva
    window.EDITOR_SUCIO = true;
    avisa(j.avisos);
    return j.item;
  }
  async function borra(coleccion, id) {
    const j = await api("DELETE", `api/${coleccion}/${encodeURIComponent(id)}`);
    E.cfg = j.cartera;
    COP.lista = null;
    window.EDITOR_SUCIO = true;
  }
  function avisa(avisos) {
    const el = $("#edAvisos");
    if (el) el.innerHTML = (avisos || []).map(a => `<div class="av"><span>⚠</span><span>${esc(a)}</span></div>`).join("");
  }

  /* ---------------------------------------------- ventana modal */
  function abreModal(titulo, cuerpo, alGuardar, textoBoton = "Guardar") {
    const dlg = $("#modal");
    dlg.innerHTML = `<form class="mForm" novalidate>
      <header><h2>${titulo}</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="mCuerpo">${cuerpo}</div>
      <div class="mErr" hidden></div>
      <footer><button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn prim">${textoBoton}</button></footer></form>`;
    const f = dlg.querySelector("form");
    dlg.querySelectorAll("[data-cerrar]").forEach(b => { b.onclick = () => dlg.close(); });
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector("[type=submit]"), err = f.querySelector(".mErr");
      btn.disabled = true;
      err.hidden = true;
      try {
        const siguiente = await alGuardar(f);
        dlg.close();
        pinta();
        if (typeof siguiente === "function") siguiente();
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
      } finally { btn.disabled = false; }
    };
    dlg.showModal();
    return f;
  }
  const campos = f => Object.fromEntries(new FormData(f).entries());
  function rellena(f, obj) {
    Object.entries(obj).forEach(([k, v]) => {
      const el = f.elements[k];
      if (!el || v == null) return;
      if (el.type === "checkbox") el.checked = !!v;
      else if (el instanceof RadioNodeList) el.value = String(v);
      else el.value = v;
    });
  }

  /* ---------------------------------------------- empezar con mis datos */
  function empezar() {
    const f = abreModal("Empezar con mis datos", `
      <p>Ahora estás viendo una cartera de ejemplo. ¿Cómo quieres empezar la tuya?</p>
      <label class="opcion"><input type="radio" name="desde" value="vacia" checked>
        <span><b>Empezar de cero</b><br>Una cartera vacía para meter lo tuyo.</span></label>
      <label class="opcion"><input type="radio" name="desde" value="ejemplo">
        <span><b>Copiar el ejemplo para practicar</b><br>Puedes tocar, añadir y borrar sin miedo.
        Cuando quieras empezar de verdad, borra sus productos.</span></label>
      <p class="ayuda">Tus datos se guardan solo en tu ordenador, en la carpeta <code>mis_datos</code>.</p>`,
    async f => {
      await api("POST", "api/empezar", { desde: campos(f).desde });
      recuerda.guarda("patrimonio.tab", "datos");
      location.reload();
    }, "Empezar");
    return f;
  }
  function reiniciar() {
    abreModal("Empezar de nuevo", `
      <p>¿Qué quieres hacer con la cartera que tienes ahora?</p>
      <label class="opcion"><input type="radio" name="a" value="vacia" checked>
        <span><b>Empezar de cero</b><br>Una cartera vacía para meter lo tuyo.</span></label>
      <label class="opcion"><input type="radio" name="a" value="demo">
        <span><b>Volver a ver la cartera de ejemplo</b><br>Luego podrás empezar otra vez con «Empezar con mis datos».</span></label>
      <p class="ayuda">No se pierde nada: tu cartera actual se guarda en <code>mis_datos/copias</code> por si quieres recuperarla.</p>`,
    async f => {
      await api("POST", "api/reiniciar", { a: campos(f).a });
      recuerda.guarda("patrimonio.tab", "datos");
      location.reload();
    }, "Continuar");
  }
  function soloPropio(fn) {
    return (...a) => (E.modo === "demo" ? empezar()
      : E.modo === "todos" ? alert("Estás viendo «Todos juntos», que solo sirve para mirar. Elige un perfil en el selector de arriba para cambiar sus datos.")
      : fn(...a));
  }

  /* ---------------------------------------------- perfiles */
  async function perfiles() {
    let P;
    try { P = await api("GET", "api/perfiles"); } catch (x) { alert(x.message); return; }
    if (E.modo === "demo" && P.lista.length < 2) {
      alert("Primero empieza tu propia cartera con «Empezar con mis datos». Luego podrás añadir la de tu pareja o tus hijos.");
      return;
    }
    const filas = P.lista.map(x => `<div class="perfilFila">
        ${campo(x.id === "principal" ? "Tu perfil (el principal)" : "Perfil", `<input name="n_${esc(x.id)}" value="${esc(x.nombre)}" maxlength="40">`)}
        ${x.id === "principal" ? "<span></span>" : `<button type="button" class="btn" data-borrar="${esc(x.id)}" style="margin-top:22px">Borrar</button>`}
      </div>`).join("");
    const f = abreModal("Perfiles", `
      <p>Cada perfil es una cartera aparte: la tuya, la de tu pareja, la de tus hijos… Arriba eliges cuál ver, y con
        «Todos juntos» ves la suma de todas.</p>
      <div style="margin-top:10px">${filas}</div>
      ${seccion("Añadir un perfil")}
      ${campo("Nombre", '<input name="nuevo" maxlength="40" placeholder="Por ejemplo: Ana, o Cuenta de Lucas">', "opcional")}
      <p class="ayuda">El perfil nuevo empieza vacío. Sus datos se guardan en <code>mis_datos/perfiles</code>.</p>`,
    async f => {
      const d = campos(f);
      for (const x of P.lista) {
        const nuevo = (d["n_" + x.id] || "").trim();
        if (nuevo && nuevo !== x.nombre) await api("POST", "api/perfiles/renombrar", { id: x.id, nombre: nuevo });
      }
      if ((d.nuevo || "").trim()) {
        await api("POST", "api/perfiles", { nombre: d.nuevo.trim() });
        recuerda.guarda("patrimonio.tab", "datos");
        recuerda.guarda("patrimonio.editor", "productos");
      }
      location.reload();
      return null;
    }, "Guardar");
    f.querySelectorAll("[data-borrar]").forEach(b => {
      b.onclick = async () => {
        const x = P.lista.find(y => y.id === b.dataset.borrar);
        if (!confirm(`¿Borrar el perfil «${x.nombre}» y toda su cartera?\n\nNo se pierde del todo: su carpeta se guarda en mis_datos/copias por si te arrepientes.`)) return;
        try { await api("POST", "api/perfiles/borrar", { id: x.id }); location.reload(); } catch (e) { alert(e.message); }
      };
    });
    if (P.lista.length < 2) f.elements.nuevo.focus();
  }

  /* ---------------------------------------------- pintado general */
  function pinta() {
    const cont = $("#editor");
    if (!cont) return;
    if (!E.cfg) { cont.innerHTML = '<p class="subt" style="margin-top:24px">Cargando tus datos…</p>'; return; }
    let html = "";
    if (E.modo === "todos") {
      cont.innerHTML = `<section class="tarjeta bienvenida"><h2>Todos juntos</h2>
        <p class="subt">Esta vista suma las carteras de todos los perfiles y solo sirve para mirar. Para añadir o cambiar
        datos, elige un perfil en el selector de arriba.</p></section>`;
      return;
    }
    // En la demo ya se ve arriba el aviso con el botón «Empezar con mis datos».
    if (E.modo !== "demo" && !E.cfg.productos.length) {
      html += `<section class="tarjeta bienvenida"><h2>Tu cartera está vacía</h2><ol>
        <li><b>Añade tus productos</b>: fondos, acciones, cripto, tu cuenta del banco, tu plan de pensiones…
          Usa el buscador para encontrarlos por ISIN o ticker.</li>
        <li><b>Anota tus compras</b> en «Movimientos», o <b>los saldos</b> de tus cuentas en «Saldos y valores».
          ¿Tienes muchas? Tráelas de golpe desde <b>«Importar»</b>: MyInvestor, una hoja de Excel o con ayuda de una IA.</li>
        <li>Vuelve a la pestaña <b>Patrimonio</b> y mira tu panel.</li></ol>
        <button class="btn prim" data-acc="nuevoProducto">+ Añadir mi primer producto</button></section>`;
    }
    html += `<div class="edBarra"><div class="segm" id="edVistas"></div><span class="sp"></span>
      ${!D && E.cfg.productos.length ? '<button class="btn" data-acc="verPanel">Ver mi panel →</button>' : ""}
      ${E.modo === "propio" ? '<button class="btn" data-acc="objetivo" title="El objetivo de la barra de progreso del panel">Mi objetivo</button>' : ""}
      ${E.modo === "propio" ? '<button class="btn" data-acc="reiniciar">Empezar de nuevo…</button>' : ""}</div>
      <div id="edAvisos" class="avisos"></div><div id="edCuerpo"></div>`;
    cont.innerHTML = html;

    const vistas = [["productos", "Productos"], ["movimientos", "Movimientos"], ["saldos", "Saldos y valores"], ["importar", "Importar"], ["copias", "Copias y exportar"]];
    const seg = $("#edVistas");
    vistas.forEach(([id, et]) => {
      const b = document.createElement("button");
      b.textContent = et;
      b.setAttribute("aria-pressed", String(id === E.vista));
      b.onclick = () => { E.vista = id; recuerda.guarda("patrimonio.editor", id); pinta(); };
      seg.appendChild(b);
    });
    $("#edCuerpo").innerHTML = ({ productos: vistaProductos, movimientos: vistaMovimientos, saldos: vistaSaldos,
      importar: vistaImportar, copias: vistaCopias }[E.vista] || vistaProductos)();
    if (E.vista === "importar" || E.vista === "copias") conectaImportar();
    const filtro = $("#edFiltro");
    if (filtro) filtro.onchange = e => { E.filtro = e.target.value; pinta(); };
  }

  /* ---------------------------------------------- productos */
  function precioDe(p) {
    if (manual(p)) {
      const v = E.cfg.valoraciones.filter(x => x.producto === p.id).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
      return v ? `${eur(v.valor)} <small>${fecha(v.fecha)}</small>` : '<span class="neg">sin valor anotado</span>';
    }
    const c = D && (D.productos || []).find(x => x.id === p.id);
    return c && c.nav ? `${num(c.nav)} € <small>${fecha(c.navFecha)}</small>` : '<small>tras guardar</small>';
  }
  function vistaProductos() {
    const filas = E.cfg.productos.map(p => {
      const n = soloSaldo(p) || manual(p)
        ? E.cfg.valoraciones.filter(v => v.producto === p.id).length + " valores"
        : E.cfg.movimientos.filter(m => m.producto === p.id).length + " movs.";
      return `<tr><td><i class="pt" style="background:var(--s${p.slot || 1})"></i>${esc(nombre(p))}
          ${p.identificador ? `<small class="idp">${esc(p.identificador)}</small>` : ""}</td>
        <td>${esc(E.tipos[p.tipo] || p.tipo)}</td><td>${precioDe(p)}</td>
        <td>${esc(E.fuentes[p.fuente] || "")}${p.codigo ? ` <small>${esc(p.codigo)}</small>` : ""}</td>
        <td>${n}</td>
        <td class="acc"><button data-acc="editarProducto" data-id="${esc(p.id)}">Editar</button>
          <button data-acc="borrarProducto" data-id="${esc(p.id)}">Borrar</button></td></tr>`;
    }).join("");
    return `<section class="tarjeta"><header><h2>Productos</h2>
        <span class="subt">Todo lo que tienes: fondos, acciones, cripto, cuentas, planes, inmuebles…</span>
        <span class="sp"></span>${E.cfg.productos.length > 1 ? '<button class="btn" data-acc="repartirColores" title="Da a cada producto un color distinto">Repartir colores</button>' : ""}
        <button class="btn prim" data-acc="nuevoProducto">+ Añadir producto</button></header>
      ${filas ? `<div class="tablaEnv"><table class="dt"><thead><tr><th>Producto</th><th>Tipo</th><th>Último precio</th>
        <th>Fuente del precio</th><th>Datos</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<p class="subt">Todavía no has añadido ningún producto.</p>'}</section>`;
  }

  function siguienteColor() {
    const usos = Array(13).fill(0);
    E.cfg.productos.forEach(p => { usos[p.slot || 1]++; });
    let mejor = 1;
    for (let i = 1; i <= 12; i++) if (usos[i] < usos[mejor]) mejor = i;
    return mejor;
  }

  /* Piezas de formulario: todas las cajas iguales, con su etiqueta encima. */
  const campo = (et, control, pista = "", clase = "") =>
    `<label class="campo ${clase}"><span class="et">${et}${pista ? ` <em>${pista}</em>` : ""}</span>${control}</label>`;
  const seccion = t => `<div class="secc">${t}</div>`;
  const LUPA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  const COLOR_FUENTE = { morningstar: "var(--s3)", yahoo: "var(--s7)", coingecko: "var(--s4)" };
  const decimal = v => v == null || v === "" ? "" : String(v).replace(".", ",");

  function formProducto(p) {
    const nuevo = !p;
    p = p || { tipo: "fondo", fuente: "morningstar", moneda: "EUR", largoPlazo: true, slot: siguienteColor() };
    const clases = [...new Set(E.cfg.productos.map(x => x.clase).filter(Boolean))];
    const colores = Array.from({ length: 12 }, (_, i) =>
      `<label class="color" style="--c:var(--s${i + 1})" title="Color ${i + 1}"><input type="radio" name="slot" value="${i + 1}"><i></i></label>`).join("");
    const f = abreModal(nuevo ? "Añadir producto" : "Editar " + esc(nombre(p)), `
      <div class="buscador">
        <div class="tit">Busca tu producto</div>
        <div class="sub">Por ISIN, ticker o nombre. Comprobamos que tiene precio antes de proponerlo.</div>
        <div class="fila"><div class="caja">${LUPA}<input id="bq" placeholder="IE00BYX5NX33, AAPL, bitcoin, oro…" autocomplete="off"></div>
          <button type="button" class="btn prim" id="bBuscar">Buscar</button></div>
        <div id="bRes" class="bRes"></div>
        <p class="ayuda">¿No aparece o no tiene precio en internet (un piso, oro físico, un plan de pensiones)?
          Rellénalo abajo y elige <b>«Valor anotado a mano»</b> como fuente del precio.</p>
      </div>

      ${seccion("El producto")}
      <div class="rejilla">
        ${campo("Nombre", '<input name="nombre" required>', "", "ancho")}
        ${campo("Nombre corto", '<input name="corto" maxlength="24">', "para los gráficos")}
        ${campo("Tipo", `<select name="tipo">${opciones(E.tipos, p.tipo)}</select>`)}
        ${campo("ISIN o ticker", '<input name="identificador">', "opcional")}
        ${campo("Banco o bróker", '<input name="entidad">', "opcional")}
      </div>

      <div class="siCotiza">${seccion("De dónde sale el precio")}
      <div class="rejilla tres">
        ${campo("Fuente", `<select name="fuente">${opciones(E.fuentes, p.fuente)}</select>`)}
        ${campo("Código", '<input name="codigo">', "", "siOnline")}
        ${campo("Moneda", '<input name="moneda" maxlength="3">', "", "siOnline")}
      </div></div>

      ${seccion("Cómo se muestra")}
      <div class="rejilla">
        ${campo("Clase de activo", `<input name="clase" list="edClases" placeholder="Renta variable global">
          <datalist id="edClases">${clases.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`, "opcional")}
        ${campo("Color en los gráficos", `<div class="colores">${colores}</div>`)}
        <label class="interruptor ancho"><input type="checkbox" name="largoPlazo"><span class="pista"></span>
          <span><b>Inversión a largo plazo</b><small>El botón «Solo largo plazo» del panel quita lo que no lo es: colchón, cuentas…</small></span></label>
        <label class="interruptor ancho"><input type="checkbox" name="liquidez"><span class="pista"></span>
          <span><b>Cuenta como liquidez</b><small>Dinero que puedes tener en el banco en unos días (cuentas, monetarios…). Se suma en «Liquidez y fondo de emergencia».</small></span></label>
      </div>
      <p class="relleno" id="bRelleno" hidden></p>

      <details class="avanzado"><summary>Ficha y opciones avanzadas</summary>
        <div class="rejilla tres">
          ${campo("Comisión anual", '<input name="ter" inputmode="decimal" placeholder="0,12">', "TER, %")}
          ${campo("Riesgo", '<input name="riesgo" inputmode="numeric" placeholder="1 a 7">', "de 1 a 7")}
          ${campo("Gestora", '<input name="gestora">')}
          ${campo("Línea de respaldo", '<input name="respaldo" placeholder="BTCW.SW">', "Yahoo")}
          ${campo("Moneda respaldo", '<input name="respaldoMoneda" maxlength="3" placeholder="CHF">')}
          ${campo("Precio en vivo", '<input name="vivo" placeholder="bitcoin">', "id CoinGecko")}
          ${campo("Reparto como el de", '<input name="expoComo" placeholder="IE00BYX5NX33">', "ISIN de un fondo parecido", "ancho")}
          ${campo("Descripción", '<textarea name="papel" rows="2" placeholder="Para qué tienes este producto"></textarea>', "opcional", "ancho")}
        </div>
        <p class="ayuda">El <b>respaldo</b> contrasta cada día el precio con otra línea del mismo producto y usa esa
          cuando no coinciden. El <b>precio en vivo</b> mueve el valor minuto a minuto con una criptomoneda.
          <b>Reparto como el de</b>: para un plan o una cartera que no cotiza, el ISIN de un fondo que invierta en lo mismo
          (por ejemplo, el de un indexado al MSCI World): sus países y sectores se usan en «Dónde está tu dinero».</p>
      </details>`,
    async f => {
      const d = campos(f);
      d.largoPlazo = f.elements.largoPlazo.checked;
      d.liquidez = f.elements.liquidez.checked;
      if (!nuevo) d.id = p.id;
      const item = await guarda("productos", d);
      if (!nuevo) return null;
      // Siguiente paso natural: su primer dato.
      return manual(item) ? () => formValor(null, item.id) : () => formMovimiento(null, item.id);
    }, nuevo ? "Guardar producto" : "Guardar cambios");

    // Por defecto son liquidez las cuentas y los fondos monetarios.
    const liquidezDefecto = () => f.elements.tipo.value === "efectivo" ||
      /monetari/i.test([f.elements.nombre.value, f.elements.clase.value].join(" "));
    rellena(f, { ...p, ter: p.ter != null ? decimal(+(p.ter * 100).toFixed(4)) : "" });
    f.elements.liquidez.checked = p.liquidez != null ? !!p.liquidez : liquidezDefecto();
    let liquidezTocada = p.liquidez != null;
    f.elements.liquidez.addEventListener("change", () => { liquidezTocada = true; });
    f.addEventListener("change", e => { if (!liquidezTocada && e.target.name !== "liquidez") f.elements.liquidez.checked = liquidezDefecto(); });
    const ajusta = () => {
      const saldo = SOLO_SALDO.includes(f.elements.tipo.value);
      const online = !saldo && f.elements.fuente.value !== "manual";
      f.querySelector(".siCotiza").hidden = saldo;
      f.querySelectorAll(".siOnline").forEach(el => { el.hidden = !online; });
      f.querySelector(".rejilla.tres").classList.toggle("una", !online);
      f.querySelector(".buscador").hidden = saldo;
    };
    f.elements.tipo.onchange = ajusta;
    f.elements.fuente.onchange = ajusta;
    ajusta();

    const buscar = async () => {
      const q = $("#bq").value.trim();
      const res = $("#bRes");
      if (!q) return;
      res.innerHTML = '<p class="cargando">Buscando y comprobando precios…</p>';
      try {
        const j = await api("GET", "api/buscar?q=" + encodeURIComponent(q));
        if (!j.resultados.length && j.sinConexion) {
          res.innerHTML = `<p class="neg">No he podido conectar con internet (o Yahoo/Morningstar no han
            respondido). Comprueba tu conexión e inténtalo otra vez.</p>`;
          return;
        }
        if (!j.resultados.length) {
          res.innerHTML = `<p class="neg">No encuentro «${esc(q)}» con precio en internet. Prueba con el ISIN
            (viene en la ficha del producto en tu banco) o elige «Valor anotado a mano».</p>`;
          return;
        }
        res.innerHTML = j.resultados.map((r, i) => `<button type="button" class="bItem" data-i="${i}" style="--c:${COLOR_FUENTE[r.fuente]}">
          <span class="franja"></span>
          <span><span class="nm">${esc(r.nombre || r.codigo)}</span>
            <span class="meta"><span>${esc(r.codigo)}</span>${r.mercado && r.mercado !== E.fuentes[r.fuente] ? `<span>${esc(r.mercado)}</span>` : ""}<span>${esc(E.fuentes[r.fuente])}</span></span></span>
          <span class="pre">${num(r.precio)} ${esc(r.moneda)}<small>${fecha(r.fecha)}</small></span></button>`).join("");
        res.querySelectorAll(".bItem").forEach(b => {
          b.onclick = () => {
            const r = j.resultados[+b.dataset.i];
            const n = r.nombre || r.codigo;
            const fi = r.ficha || {};
            rellena(f, {
              nombre: n, corto: n.slice(0, 24).trim(), tipo: r.tipo, identificador: r.identificador,
              fuente: r.fuente, codigo: r.codigo, moneda: r.moneda || "EUR", vivo: r.vivo || "",
              ter: decimal(fi.ter), riesgo: fi.riesgo || "", gestora: fi.gestora || "",
            });
            if (fi.clase) f.elements.clase.value = fi.clase;
            const rell = [fi.ter != null && `comisión ${decimal(fi.ter)} %`, fi.riesgo && `riesgo ${fi.riesgo}/7`,
              fi.clase && "categoría", fi.gestora && "gestora"].filter(Boolean);
            const aviso = $("#bRelleno");
            aviso.hidden = !rell.length;
            aviso.textContent = rell.length ? `✓ Ficha rellenada desde Morningstar: ${rell.join(", ")}.` : "";
            res.querySelectorAll(".bItem").forEach(x => x.classList.toggle("sel", x === b));
            ajusta();
          };
        });
      } catch (x) { res.innerHTML = `<p class="neg">${esc(x.message)}</p>`; }
    };
    $("#bBuscar").onclick = buscar;
    $("#bq").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
    if (nuevo) $("#bq").focus();
  }

  async function borrarProducto(id) {
    const p = prod(id);
    const nm = E.cfg.movimientos.filter(m => m.producto === id || m.destino === id).length;
    const nv = E.cfg.valoraciones.filter(v => v.producto === id).length;
    const extra = nm || nv ? `\n\nSe borrarán también sus ${nm} movimientos y ${nv} valores anotados.` : "";
    if (!confirm(`¿Borrar «${nombre(p)}»?${extra}\n\nSi te equivocas, hay copias automáticas en mis_datos/copias.`)) return;
    try { await borra("productos", id); pinta(); } catch (x) { alert(x.message); }
  }

  /* ---------------------------------------------- movimientos */
  function vistaMovimientos() {
    const cotizables = E.cfg.productos.filter(conMovimientos);
    const movs = E.cfg.movimientos
      .filter(m => E.filtro === "todos" || m.producto === E.filtro || m.destino === E.filtro)
      .sort((a, b) => a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
    const filas = movs.map(m => {
      const p = prod(m.producto);
      if (m.tipo === "ajuste") {
        return `<tr><td>${fecha(m.fecha)}</td><td style="text-align:left">${p ? `<i class="pt" style="background:var(--s${p.slot || 1})"></i>` : ""}${esc(nombre(p))}</td>
          <td style="text-align:left">Ajuste</td><td>= ${num(m.unidades)}</td><td>—</td><td>—</td>
          <td class="nota" title="${esc(m.nota)}">${esc(m.nota || "")}</td>
          <td class="acc"><button data-acc="editarMov" data-id="${esc(m.id)}">Editar</button>
            <button data-acc="borrarMov" data-id="${esc(m.id)}">Borrar</button></td></tr>`;
      }
      if (m.tipo === "traspaso") {
        const d = prod(m.destino);
        return `<tr><td>${fecha(m.fecha)}</td><td style="text-align:left">${p ? `<i class="pt" style="background:var(--s${p.slot || 1})"></i>` : ""}${esc(nombre(p))}
            → ${d ? `<i class="pt" style="background:var(--s${d.slot || 1});margin-left:4px"></i>` : ""}${esc(nombre(d))}</td>
          <td style="text-align:left">Traspaso${m.total ? " total" : ""}</td>
          <td>${m.unidades ? "−" + num(m.unidades) : "—"}${m.unidadesDestino ? ` <small>/ +${num(m.unidadesDestino)}</small>` : ""}</td>
          <td>${eur(m.importe)}</td><td>—</td>
          <td class="nota" title="${esc(m.nota)}">${esc(m.nota || "")}</td>
          <td class="acc"><button data-acc="editarMov" data-id="${esc(m.id)}">Editar</button>
            <button data-acc="borrarMov" data-id="${esc(m.id)}">Borrar</button></td></tr>`;
      }
      const precio = m.unidades ? (m.importe - (m.comision || 0)) / m.unidades : null;
      return `<tr><td>${fecha(m.fecha)}</td><td style="text-align:left">${p ? `<i class="pt" style="background:var(--s${p.slot || 1})"></i>` : ""}${esc(nombre(p))}</td>
        <td style="text-align:left">${esc(E.tiposMov[m.tipo] || m.tipo)}</td>
        <td>${m.unidades ? num(m.unidades) : "—"}</td>
        <td class="${m.tipo === "compra" || m.tipo === "comision" ? "" : "pos"}">${eur(m.importe)}</td>
        <td>${precio ? num(precio) + " €" : "—"}</td>
        <td class="nota" title="${esc(m.nota)}">${esc(m.nota || "")}</td>
        <td class="acc"><button data-acc="editarMov" data-id="${esc(m.id)}">Editar</button>
          <button data-acc="borrarMov" data-id="${esc(m.id)}">Borrar</button></td></tr>`;
    }).join("");
    return `<section class="tarjeta"><header><h2>Movimientos</h2>
        <span class="subt">Compras, ventas, traspasos, dividendos y comisiones</span><span class="sp"></span>
        <select id="edFiltro" aria-label="Filtrar por producto"><option value="todos">Todos los productos</option>
          ${cotizables.map(p => `<option value="${esc(p.id)}"${p.id === E.filtro ? " selected" : ""}>${esc(nombre(p))}</option>`).join("")}</select>
        <button class="btn" data-acc="nuevoAjuste" title="Si las participaciones no coinciden con las de tu banco">Cuadrar participaciones</button>
        <button class="btn" data-acc="nuevoTraspaso" title="De un fondo o plan a otro, sin vender">⇄ Traspaso</button>
        <button class="btn" data-acc="periodica" title="La aportación de cada mes: Rumbo la rellena con el precio de cada día">↻ Periódica</button>
        <button class="btn prim" data-acc="nuevoMov">+ Añadir movimiento</button></header>
      ${avisoPeriodicas()}
      ${filas ? `<div class="tablaEnv alto"><table class="dt"><thead><tr><th>Fecha</th><th style="text-align:left">Producto</th>
        <th style="text-align:left">Tipo</th><th>Unidades</th><th>Importe</th><th>Precio por unidad</th>
        <th style="text-align:left">Nota</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
        <p class="subt" style="margin-top:10px">${movs.length} movimientos.</p>`
        : '<p class="subt">No hay movimientos todavía.</p>'}</section>`;
  }

  const AYUDA_IMPORTE = {
    compra: "Lo que salió de tu cuenta, con las comisiones incluidas.",
    venta: "Lo que te ingresaron, ya descontadas las comisiones.",
    dividendo: "Lo que te ingresaron por el dividendo o el cupón.",
    comision: "Comisiones sueltas, como la de custodia. Las de compra y venta ya van dentro de su importe.",
  };
  const AYUDA_INMUEBLE = {
    dividendo: "Lo que te ha pagado el inquilino. Puedes anotarlo cada mes o sumado por año. No cambia el valor del " +
      "inmueble (ese lo anotas en «Saldos y valores»): sirve para ver lo que te rinde.",
    comision: "Gastos del inmueble: comunidad, IBI, seguro, reparaciones, gestoría… Se restan de lo que te rinde.",
  };
  const AYUDA_INTERESES = "Los intereses que te ha pagado la cuenta, ya descontada la retención. No cambian el saldo " +
    "(ese lo anotas en «Saldos y valores»): sirven para ver cuánto te rinde en «Rendimiento».";

  // Monedas en las que se puede escribir el importe de un movimiento (se guarda en euros).
  const SIMBOLO = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", JPY: "¥", CAD: "CAD", AUD: "AUD" };
  const monedasDe = p => {
    const propia = p && p.moneda ? (/^GB[pX]$/.test(p.moneda) ? "GBP" : p.moneda.toUpperCase()) : "EUR";
    return [...new Set(["EUR", propia, "USD"])];
  };
  const CAMBIOS = {};
  async function cambio(moneda, fecha) {
    const k = moneda + fecha;
    if (!(k in CAMBIOS)) {
      CAMBIOS[k] = api("GET", `api/cambio?moneda=${moneda}&fecha=${fecha}`).then(j => j.ok ? j.cambio : null).catch(() => null);
    }
    return CAMBIOS[k];
  }

  function formMovimiento(m, productoId, tipo) {
    const cotizables = E.cfg.productos.filter(conMovimientos);
    if (!cotizables.length) { alert("Primero añade un producto en «Productos»."); return; }
    const nuevo = !m;
    m = m || { fecha: hoy(), tipo: tipo || "compra", producto: productoId || (E.filtro !== "todos" ? E.filtro : cotizables[0].id) };
    if (nuevo && prod(m.producto) && prod(m.producto).tipo === "efectivo") m.tipo = "dividendo";
    if (m && m.tipo === "traspaso") return formTraspaso(m);
    if (m && m.tipo === "ajuste") return formAjuste(m);
    const pildoras = Object.entries(E.tiposMov).filter(([k]) => k !== "traspaso" && k !== "ajuste").map(([k, v]) =>
      `<label><input type="radio" name="tipo" value="${esc(k)}"><span>${esc(k === "dividendo" ? "Dividendo" : v)}</span></label>`).join("");
    const f = abreModal(nuevo ? "Añadir movimiento" : "Editar movimiento", `
      <div class="pildoras">${pildoras}</div>
      <div class="rejilla" style="margin-top:18px">
        ${campo("Producto", `<select name="producto">${cotizables.map(p =>
          `<option value="${esc(p.id)}">${esc(nombre(p))}</option>`).join("")}</select>`, "", "ancho")}
        ${campo("Fecha", `<input type="date" name="fecha" max="${hoy()}">`)}
        ${campo("Unidades", `<div class="conBoton"><input name="unidades" inputmode="decimal" placeholder="0">
          <button type="button" class="btn" id="mTodas" title="Rellena las unidades exactas que tenías ese día">Todas</button></div>`, "participaciones, acciones…", "siUnid")}
        ${campo("Importe total", `<div class="conSufijo conMoneda"><input name="importe" inputmode="decimal" placeholder="0,00">
          <select name="moneda" aria-label="Moneda del importe" title="¿Pagaste en otra moneda? Elígela y se pasa a euros con el cambio de ese día"></select></div>`)}
        ${campo("Comisión", '<div class="conSufijo"><input name="comision" inputmode="decimal" placeholder="0,00"><span id="mSufCom">€</span></div>', "ya incluida en el importe", "siCom")}
        ${campo("Nota", '<input name="nota" maxlength="200" placeholder="Por ejemplo: aportación mensual">', "opcional", "ancho")}
      </div>
      <div class="resumen"><span id="mAyuda"></span><b id="mPrecio"></b></div>`,
    async f => {
      const d = campos(f);
      if (!nuevo) d.id = m.id;
      await guarda("movimientos", d);
      E.vista = "movimientos";
      recuerda.guarda("patrimonio.editor", "movimientos");
      return null;
    }, nuevo ? "Guardar movimiento" : "Guardar cambios");
    rellena(f, { ...m, unidades: decimal(m.unidades || ""), importe: decimal(m.importe), comision: decimal(m.comision) });
    const selMoneda = f.elements.moneda;
    const ponMonedas = () => {
      const antes = selMoneda.value || "EUR";
      const lista = monedasDe(prod(f.elements.producto.value));
      selMoneda.innerHTML = lista.map(c => `<option value="${c}">${SIMBOLO[c] && SIMBOLO[c] !== c ? `${SIMBOLO[c]} ${c}` : c}</option>`).join("");
      selMoneda.value = lista.includes(antes) ? antes : "EUR";
    };
    ponMonedas();
    f.elements.producto.addEventListener("change", ponMonedas);
    const ajusta = () => {
      const p = prod(f.elements.producto.value);
      // Una cuenta solo admite intereses: el resto de pestañas desaparecen.
      const cuenta = !!(p && p.tipo === "efectivo");
      const piso = !!(p && p.tipo === "inmueble");
      f.querySelectorAll(".pildoras label").forEach(l => {
        const v = l.querySelector("input").value;
        l.hidden = cuenta && v !== "dividendo";
        l.querySelector("span").textContent = v === "dividendo" ? (cuenta ? "Intereses" : piso ? "Alquiler" : "Dividendo")
          : v === "comision" && piso ? "Gasto" : E.tiposMov[v];
      });
      f.querySelector(".pildoras").classList.toggle("una", cuenta);
      if (cuenta && f.elements.tipo.value !== "dividendo") f.elements.tipo.value = "dividendo";
      const t = f.elements.tipo.value;
      const mon = selMoneda.value || "EUR", sim = SIMBOLO[mon] || mon;
      $("#mSufCom").textContent = sim;
      const conUnid = t === "compra" || t === "venta";
      f.querySelector(".siUnid").hidden = !conUnid;
      f.querySelector(".siCom").hidden = !conUnid;
      // Con la caja de unidades oculta, la del importe ocupa su hueco sin descuadrar la rejilla.
      $("#mTodas").hidden = t !== "venta";
      $("#mAyuda").textContent = (cuenta ? AYUDA_INTERESES : piso && AYUDA_INMUEBLE[t] || AYUDA_IMPORTE[t]) + (p && manual(p) && t === "compra"
        ? " Como este producto se valora a mano, las unidades son opcionales." : "");
      const u = leeNum(f.elements.unidades.value), imp = leeNum(f.elements.importe.value);
      const com = leeNum(f.elements.comision.value) || 0;
      $("#mPrecio").textContent = conUnid && u > 0 && imp > 0 ? `${num((imp - com) / u)} ${sim} / unidad` : "";
      // En otra moneda: cuántos euros son, con el cambio de ese día (es lo que se guarda).
      if (mon !== "EUR") {
        const fe = f.elements.fecha.value;
        const pedido = mon + fe + imp;
        f.dataset.pedido = pedido;
        cambio(mon, fe).then(fx => {
          if (f.dataset.pedido !== pedido) return;
          $("#mAyuda").textContent = AYUDA_IMPORTE[t] + (fx
            ? ` Se guarda en euros: ${imp > 0 ? `≈ ${eur(imp * fx)}` : `1 ${mon} = ${num(fx)} €`} con el cambio del ${fecha(fe)}.`
            : ` No encuentro el cambio de ${mon} de ese día: revisa tu conexión o escribe el importe en euros.`);
        });
      }
    };
    f.oninput = ajusta;
    f.onchange = ajusta;
    $("#mTodas").onclick = async () => {
      try {
        const q = new URLSearchParams({ producto: f.elements.producto.value, fecha: f.elements.fecha.value || hoy() });
        if (!nuevo) q.set("excluir", m.id);
        const j = await api("GET", "api/unidades?" + q);
        f.elements.unidades.value = decimal(+j.unidades.toFixed(8));
        ajusta();
      } catch (x) { alert(x.message); }
    };
    ajusta();
  }

  /* ---------------------------------------------- objetivo de patrimonio */
  function formObjetivo() {
    const o = E.cfg.objetivo || {};
    const propio = !!(o.activo && o.importe && (o.elegido || o.importe !== 100000));
    const f = abreModal("Mi objetivo de patrimonio", `
      <label class="interruptor"><input type="checkbox" name="activo"><span class="pista"></span>
        <span><b>Usar mi propio objetivo</b><small>Si lo apagas, la barra del panel va al siguiente hito:
          10.000 €, 25.000 €, 50.000 €, 100.000 €…</small></span></label>
      <div class="rejilla siObjetivo" style="margin-top:16px">
        ${campo("Importe", '<div class="conSufijo"><input name="importe" inputmode="decimal" placeholder="30.000"><span>€</span></div>')}
        ${campo("Nombre", '<input name="etiqueta" maxlength="60" placeholder="Entrada del piso">', "opcional")}
      </div>`,
    async f => {
      const d = campos(f);
      d.activo = f.elements.activo.checked;
      const j = await api("POST", "api/objetivo", d);
      E.cfg = j.cartera;
      window.EDITOR_SUCIO = true;
      return null;
    });
    rellena(f, { activo: propio, importe: propio ? decimal(o.importe) : "", etiqueta: propio ? o.etiqueta : "" });
    const ajusta = () => { f.querySelector(".siObjetivo").hidden = !f.elements.activo.checked; };
    f.elements.activo.onchange = ajusta;
    ajusta();
  }

  /* ---------------------------------------------- traspasos */
  // De un fondo (o plan) a otro sin vender: el coste y la antigüedad pasan al destino.
  const PRECIOS = {};
  async function precio(pid, f) {
    const k = pid + f;
    if (!(k in PRECIOS)) {
      PRECIOS[k] = api("GET", `api/precio?producto=${encodeURIComponent(pid)}&fecha=${f}`)
        .then(j => j.ok ? j.precio : null).catch(() => null);
    }
    return PRECIOS[k];
  }

  function formTraspaso(m) {
    const traspasables = E.cfg.productos.filter(p => !soloSaldo(p));
    if (traspasables.length < 2) { alert("Para un traspaso necesitas al menos dos productos: el de origen y el de destino. Añade el nuevo en «Productos»."); return; }
    const nuevo = !m;
    m = m || { fecha: hoy(), producto: E.filtro !== "todos" && prod(E.filtro) && !soloSaldo(prod(E.filtro)) ? E.filtro : traspasables[0].id };
    if (!m.destino) m.destino = (traspasables.find(p => p.id !== m.producto) || {}).id;
    const ops = traspasables.map(p => `<option value="${esc(p.id)}">${esc(nombre(p))}</option>`).join("");
    const f = abreModal(nuevo ? "Traspaso entre productos" : "Editar traspaso", `
      <div class="rejilla">
        ${campo("Sale de", `<select name="producto">${ops}</select>`)}
        ${campo("Va a", `<select name="destino">${ops}</select>`)}
        ${campo("Fecha", `<input type="date" name="fecha" max="${hoy()}">`)}
        ${campo("Importe traspasado", '<div class="conSufijo"><input name="importe" inputmode="decimal" placeholder="0,00"><span>€</span></div>', "lo que valía ese día")}
        ${campo("Participaciones que salen", `<div class="conBoton"><input name="unidades" inputmode="decimal" placeholder="0">
          <button type="button" class="btn" id="tTodas" title="Todas las que tenías ese día">Todas</button></div>`, "", "siUnidO")}
        ${campo("Participaciones que entran", '<input name="unidadesDestino" inputmode="decimal" placeholder="0">', "en el destino", "siUnidD")}
        <label class="interruptor ancho siTotal"><input type="checkbox" name="total"><span class="pista"></span>
          <span><b>Lo traspaso todo</b><small>El producto de origen se queda a cero ese día.</small></span></label>
        ${campo("Nota", '<input name="nota" maxlength="200" placeholder="Por ejemplo: traspaso a un indexado más barato">', "opcional", "ancho")}
      </div>
      <div class="resumen"><span id="tResumen"></span><b id="tPrecios"></b></div>`,
    async f => {
      const d = { ...campos(f), tipo: "traspaso", total: f.elements.total.checked };
      if (!nuevo) d.id = m.id;
      await guarda("movimientos", d);
      E.vista = "movimientos";
      recuerda.guarda("patrimonio.editor", "movimientos");
      return null;
    }, nuevo ? "Guardar traspaso" : "Guardar cambios");
    rellena(f, { ...m, unidades: decimal(m.unidades || ""), unidadesDestino: decimal(m.unidadesDestino || ""),
      importe: decimal(m.importe), total: !!m.total });

    // Lo que no ha tocado el usuario se rellena solo con el precio de ese día.
    const tocado = { importe: !nuevo, unidadesDestino: !nuevo };
    ["importe", "unidadesDestino"].forEach(k => f.elements[k].addEventListener("input", () => { tocado[k] = true; }));
    const ajusta = async () => {
      const o = prod(f.elements.producto.value), dd = prod(f.elements.destino.value), fe = f.elements.fecha.value || hoy();
      f.querySelector(".siUnidO").hidden = manual(o);
      f.querySelector(".siUnidD").hidden = manual(dd);
      f.querySelector(".siTotal").hidden = !manual(o);
      const yaImportado = dd && E.cfg.movimientos.some(x => x.producto === dd.id && x.tipo === "compra"
        && /MyInvestor · traspaso/.test(x.nota || ""));
      $("#tResumen").innerHTML = (o && dd && o.id !== dd.id
        ? `No es una venta: lo que llevabas metido en «${esc(nombre(o))}» y la fecha de cada compra pasan a «${esc(nombre(dd))}». Hacienda no cobra nada hasta que vendas.`
        : "Elige dos productos distintos.") + (yaImportado
        ? `<span class="alerta">Ojo: «${esc(nombre(dd))}» ya trae lotes de un traspaso importados de MyInvestor. Si es este mismo traspaso, no lo anotes otra vez: vuelve a importar su CSV y, en la vista previa, di de qué fondo venía.</span>` : "");
      const pedido = [o && o.id, dd && dd.id, fe, f.elements.unidades.value, f.elements.importe.value].join("|");
      f.dataset.pedido = pedido;
      const [po, pd] = await Promise.all([o && !manual(o) ? precio(o.id, fe) : null, dd && !manual(dd) ? precio(dd.id, fe) : null]);
      if (f.dataset.pedido !== pedido) return;
      const u = leeNum(f.elements.unidades.value);
      if (!tocado.importe && po && u > 0) f.elements.importe.value = decimal((u * po).toFixed(2));
      const imp = leeNum(f.elements.importe.value);
      if (!tocado.unidadesDestino && pd && imp > 0) f.elements.unidadesDestino.value = decimal(+(imp / pd).toFixed(6));
      $("#tPrecios").textContent = [po && `${num(po)} €`, pd && `${num(pd)} €`].filter(Boolean).join(" → ");
    };
    f.oninput = ajusta;
    f.onchange = ajusta;
    $("#tTodas").onclick = async () => {
      try {
        const q = new URLSearchParams({ producto: f.elements.producto.value, fecha: f.elements.fecha.value || hoy() });
        if (!nuevo) q.set("excluir", m.id);
        const j = await api("GET", "api/unidades?" + q);
        f.elements.unidades.value = decimal(+j.unidades.toFixed(8));
        ajusta();
      } catch (x) { alert(x.message); }
    };
    ajusta();
  }

  /* ---------------------------------------------- cuadrar participaciones */
  // Si tu banco dice que tienes otras participaciones (pasa con traspasos importados de
  // MyInvestor), se fija la cifra buena sin tocar lo que pagaste.
  function formAjuste(m) {
    const cotizan = E.cfg.productos.filter(p => !manual(p));
    if (!cotizan.length) { alert("Ningún producto con precio en internet: no hay participaciones que cuadrar."); return; }
    const nuevo = !m;
    m = m || { fecha: hoy(), producto: E.filtro !== "todos" && cotizan.some(p => p.id === E.filtro) ? E.filtro : cotizan[0].id };
    const f = abreModal("Cuadrar participaciones con tu banco", `
      <p>Si las participaciones de un fondo no coinciden con las que ves en tu banco (pasa, por ejemplo, con algunos
        traspasos importados de MyInvestor), escribe aquí las buenas. Lo que pagaste no cambia: solo cuántas tienes.</p>
      <div class="rejilla" style="margin-top:14px">
        ${campo("Producto", `<select name="producto">${cotizan.map(p => `<option value="${esc(p.id)}">${esc(nombre(p))}</option>`).join("")}</select>`, "", "ancho")}
        ${campo("Fecha", `<input type="date" name="fecha" max="${hoy()}">`, "la del dato de tu banco")}
        ${campo("Participaciones según tu banco", '<input name="unidades" inputmode="decimal" placeholder="0">')}
      </div>
      <div class="resumen"><span id="aResumen">Calculando…</span></div>`,
    async f => {
      const d = { ...campos(f), tipo: "ajuste" };
      if (!nuevo) d.id = m.id;
      await guarda("movimientos", d);
      E.vista = "movimientos";
      return null;
    }, nuevo ? "Cuadrar" : "Guardar cambios");
    rellena(f, { ...m, unidades: decimal(m.unidades || "") });
    const ajusta = async () => {
      const q = new URLSearchParams({ producto: f.elements.producto.value, fecha: f.elements.fecha.value || hoy() });
      if (!nuevo) q.set("excluir", m.id);
      try {
        const j = await api("GET", "api/unidades?" + q);
        const real = leeNum(f.elements.unidades.value);
        $("#aResumen").innerHTML = `Rumbo calcula <b>${num(j.unidades, 6)}</b> participaciones ese día.` +
          (real >= 0 && !isNaN(real) ? ` Con tu cifra, ${real >= j.unidades ? "+" : "−"}${num(Math.abs(real - j.unidades), 6)}.` : "");
      } catch (x) { $("#aResumen").textContent = x.message; }
    };
    f.oninput = ajusta;
    f.onchange = ajusta;
    ajusta();
  }

  /* ---------------------------------------------- fondo de emergencia */
  function formColchon() {
    const c = E.cfg.colchon || { modo: "meses", meses: 6 };
    const f = abreModal("Mi fondo de emergencia", `
      <p>Lo que quieres tener siempre a mano por si pasa algo (una avería, quedarte sin trabajo…). Lo habitual es entre
        3 y 6 meses de gastos. Rumbo lo compara con tu liquidez y te dice cuánto te sobra para invertir.</p>
      <div class="pildoras" style="grid-template-columns:repeat(2,1fr);margin-top:12px">
        <label><input type="radio" name="modo" value="meses"><span>En meses de gastos</span></label>
        <label><input type="radio" name="modo" value="importe"><span>Un importe fijo</span></label></div>
      <div class="rejilla siMeses" style="margin-top:16px">
        ${campo("Meses", '<input name="meses" inputmode="decimal" placeholder="6">')}
        ${campo("Lo que gastas al mes", '<div class="conSufijo"><input name="gastoMensual" inputmode="decimal" placeholder="2.000"><span>€</span></div>')}
      </div>
      <div class="rejilla siImporte" style="margin-top:16px">
        ${campo("Importe", '<div class="conSufijo"><input name="importe" inputmode="decimal" placeholder="12.000"><span>€</span></div>')}
      </div>
      <div class="resumen"><span id="cResumen"></span></div>
      ${E.cfg.colchon ? '<p class="ayuda"><button type="button" class="btn" id="cBorrar">Quitar mi fondo de emergencia</button></p>' : ""}`,
    async f => {
      const j = await api("POST", "api/colchon", campos(f));
      E.cfg = j.cartera;
      window.EDITOR_SUCIO = true;
      return () => { recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); };
    });
    rellena(f, { modo: c.modo, meses: decimal(c.meses), gastoMensual: decimal(c.gastoMensual), importe: decimal(c.importe) });
    const ajusta = () => {
      const m = f.elements.modo.value;
      f.querySelector(".siMeses").hidden = m !== "meses";
      f.querySelector(".siImporte").hidden = m !== "importe";
      const total = m === "meses" ? leeNum(f.elements.meses.value) * leeNum(f.elements.gastoMensual.value) : leeNum(f.elements.importe.value);
      $("#cResumen").textContent = total > 0 ? `Tu fondo de emergencia: ${eur(total)}.` : "Rellena las cifras.";
    };
    f.oninput = ajusta;
    f.onchange = ajusta;
    ajusta();
    const borrar = $("#cBorrar");
    if (borrar) borrar.onclick = async () => {
      if (!confirm("¿Quitar tu fondo de emergencia?")) return;
      try { await api("POST", "api/colchon", { borrar: true }); recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); }
      catch (x) { alert(x.message); }
    };
  }

  /* ---------------------------------------------- reparto objetivo */
  // En la cartera de ejemplo el reparto se puede probar: se ve al momento, pero no se guarda.
  function pruebaDemo(d, pesos, conEfectivo, cuenta) {
    const n = {};
    Object.entries(pesos).forEach(([k, v]) => { const x = leeNum(v); if (x > 0) n[k] = x; });
    const total = Object.values(n).reduce((a, b) => a + b, 0);
    if (!Object.keys(n).length) throw new Error("Pon el % que quieres en al menos un grupo.");
    if (Math.abs(total - 100) > 0.5) throw new Error(`Los porcentajes suman ${num(total, 2)} %: tienen que sumar 100 %.`);
    const vigilar = leeNum(d.vigilar) || 3, rebalancear = leeNum(d.rebalancear) || 5;
    if (rebalancear < vigilar) throw new Error("El margen para rebalancear tiene que ser mayor que el de vigilar.");
    return aplicaDemo({ por: d.por === "producto" ? "producto" : "clase", pesos: n, vigilar, rebalancear, conEfectivo, cuenta });
  }
  function aplicaDemo(o) {
    E.cfg.objetivoReparto = o;
    if (D) D.objetivoReparto = o;
    return () => document.dispatchEvent(new Event("rumbo:editor"));
  }

  function formReparto() {
    const demo = E.modo === "demo";
    const o = window.Calculos.normalizaReparto(E.cfg.objetivoReparto) || { por: "clase", pesos: {}, vigilar: 3, rebalancear: 5 };
    const datos = (D && D.productos ? D.productos.concat(D.otrosActivos || []) : []);
    // Cada grupo con lo que tiene dentro, para que se entienda qué es cada uno.
    const grupos = por => {
      const m = new Map();
      datos.filter(p => p.valor > 0 && p.tipoClave !== "deuda").forEach(p => {
        const k = por === "producto" ? (p.corto || p.nombre) : window.Calculos.tipoReparto(p);
        m.set(k, (m.get(k) || []).concat(p));
      });
      Object.keys(o.por === por ? o.pesos : {}).forEach(k => { if (!m.has(k)) m.set(k, []); });
      const orden = por === "producto" ? [] : window.Calculos.TIPOS_REPARTO;
      return [...m.entries()].sort((a, b) => (orden.indexOf(a[0]) + 1 || 99) - (orden.indexOf(b[0]) + 1 || 99))
        .map(([nombre, de]) => ({ nombre, de }));
    };
    const f = abreModal("Mi reparto objetivo", `
      <p>¿Qué parte de tu dinero quieres en cada sitio? Rumbo compara con lo que tienes y te dice dónde meter
        la próxima aportación para volver a cuadrar, sin vender nada.</p>
      <div class="pildoras" style="grid-template-columns:repeat(2,1fr);margin-top:12px">
        <label><input type="radio" name="por" value="clase"><span>Por tipo de activo</span></label>
        <label><input type="radio" name="por" value="producto"><span>Por producto</span></label></div>
      <p class="ayuda" id="repQueEs"></p>
      <div class="listaValores" id="repGrupos"></div>
      <div class="resumen"><span>Tienen que sumar 100 %. Las cuentas solo cuentan si les pones un %.</span><b class="sumaRep" id="repSuma"></b></div>
      <p class="ayuda">Con el interruptor de cada producto decides si cuenta para este reparto (por ejemplo, deja fuera
        el plan de pensiones o mete una cuenta). Solo cambia el reparto: sigue en tu patrimonio, tus gráficas y tus totales.</p>
      <details class="avanzado"><summary>Márgenes y efectivo</summary>
        <div class="rejilla">
          ${campo("OK hasta", '<div class="conSufijo"><input name="vigilar" inputmode="decimal"><span>pts</span></div>', "de desviación")}
          ${campo("Rebalancear desde", '<div class="conSufijo"><input name="rebalancear" inputmode="decimal"><span>pts</span></div>')}
          <label class="interruptor ancho"><input type="checkbox" name="conEfectivo"><span class="pista"></span>
            <span><b>Contarlo todo</b><small>También las cuentas y lo que no es a largo plazo, aunque no les pongas %.</small></span></label>
        </div></details>
      ${E.cfg.objetivoReparto ? '<p class="ayuda"><button type="button" class="btn" id="repBorrar">Quitar mi reparto objetivo</button></p>' : ""}
      ${demo ? '<p class="ayuda">Es la cartera de ejemplo: el cambio se ve al momento, pero no se guarda.</p>' : ""}`,
    async f => {
      const d = campos(f);
      const pesos = {};
      Object.keys(d).filter(k => k.startsWith("g_")).forEach(k => { if (String(d[k]).trim()) pesos[f.elements[k].dataset.grupo] = d[k]; });
      const cuenta = eleccionCuenta();
      if (demo) return pruebaDemo(d, pesos, f.elements.conEfectivo.checked, cuenta);
      const j = await api("POST", "api/reparto", { por: d.por, pesos, vigilar: d.vigilar, rebalancear: d.rebalancear,
        conEfectivo: f.elements.conEfectivo.checked, cuenta });
      E.cfg = j.cartera;
      window.EDITOR_SUCIO = true;
      return () => { recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); };
    });
    rellena(f, { por: o.por, vigilar: decimal(o.vigilar), rebalancear: decimal(o.rebalancear), conEfectivo: !!o.conEfectivo });

    // Qué productos cuentan: cada interruptor sigue la regla general hasta que lo tocas; lo que eliges a mano manda.
    const Cal = window.Calculos;
    const candidatos = datos.filter(p => p.valor > 0 && p.tipoClave !== "deuda" && p.id != null);
    const porId = Object.fromEntries(candidatos.map(p => [String(p.id), p]));
    const borrador = () => {
      const pesos = {};
      f.querySelectorAll("[data-grupo]").forEach(i => { const x = leeNum(i.value); if (x > 0) pesos[i.dataset.grupo] = x; });
      return { por: f.elements.por.value, pesos, conEfectivo: f.elements.conEfectivo.checked };
    };
    const elegidos = { ...(o.cuenta || {}) };
    const eleccionCuenta = () => {
      const b = borrador(), out = {};
      candidatos.forEach(p => {
        if (Object.prototype.hasOwnProperty.call(elegidos, p.id) && elegidos[p.id] !== Cal.cuentaPorDefecto(p, b)) out[p.id] = elegidos[p.id];
      });
      return out;
    };
    const interruptor = (p, conNombre) => `<label class="onoff" title="Cuenta para este reparto"><input type="checkbox" data-prod="${esc(p.id)}">
      <span class="pista"></span>${conNombre ? `<span class="nmP">${esc(p.corto || p.nombre)}</span>` : '<span class="est"></span>'}</label>`;
    const actualizaInterruptores = () => {
      const b = { ...borrador(), cuenta: elegidos };
      f.querySelectorAll("[data-prod]").forEach(c => {
        const p = porId[c.dataset.prod];
        if (!p) return;
        c.checked = Cal.cuentaEnReparto(p, b);
        c.closest(".onoff").classList.toggle("fuera", !c.checked);
        const fila = c.closest(".filaRep");
        if (fila && b.por === "producto") fila.classList.toggle("apagado", !c.checked);
      });
    };
    const pintaGrupos = () => {
      const por = f.elements.por.value;
      $("#repQueEs").textContent = por === "producto"
        ? "Cada fondo, acción o cuenta por separado: por ejemplo, 80 % al fondo del mundo y 20 % al de emergentes."
        : "Grupos grandes: toda la bolsa junta, la renta fija, el monetario… Para repartir entre fondos concretos, elige «Por producto».";
      $("#repGrupos").innerHTML = grupos(por).map((g, i) => `<div class="filaValor filaRep"><span class="nm">${esc(g.nombre)}${
          por === "producto"
            ? (g.de[0] && g.de[0].id != null ? `<span class="onoffs">${interruptor(g.de[0], false)}</span>` : "")
            : (g.de.length ? `<span class="onoffs">${g.de.filter(p => p.id != null).map(p => interruptor(p, true)).join("")}</span>` : "")}</span>
        <span class="conSufijo"><input name="g_${i}" data-grupo="${esc(g.nombre)}" inputmode="decimal" placeholder="0"
          value="${o.por === por && o.pesos[g.nombre] != null ? decimal(o.pesos[g.nombre]) : ""}"><span>%</span></span></div>`).join("")
        || '<p class="subt">Primero añade productos con valor.</p>';
      actualizaInterruptores();
      suma();
    };
    $("#repGrupos").onchange = e => {
      const c = e.target.closest("[data-prod]");
      if (!c) return;
      elegidos[c.dataset.prod] = c.checked;
      actualizaInterruptores();
    };
    const suma = () => {
      const t = [...f.querySelectorAll("[data-grupo]")].reduce((a, i) => a + (leeNum(i.value) || 0), 0);
      const el = $("#repSuma");
      el.textContent = `Suma: ${num(t, 2)} %`;
      el.classList.toggle("mal", Math.abs(t - 100) > 0.5);
    };
    f.querySelectorAll('[name="por"]').forEach(r => { r.onchange = pintaGrupos; });
    f.oninput = e => { suma(); if (!e.target.closest("[data-prod]")) actualizaInterruptores(); };
    pintaGrupos();
    const borrar = $("#repBorrar");
    if (borrar) borrar.onclick = async () => {
      if (!confirm("¿Quitar tu reparto objetivo?")) return;
      if (demo) { $("#modal").close(); aplicaDemo(null)(); return; }
      try { await api("POST", "api/reparto", { borrar: true }); recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); }
      catch (x) { alert(x.message); }
    };
  }

  async function borrarMov(id) {
    const m = E.cfg.movimientos.find(x => x.id === id);
    const donde = m.tipo === "traspaso" ? `de «${nombre(prod(m.producto))}» a «${nombre(prod(m.destino))}»` : `en «${nombre(prod(m.producto))}»`;
    if (!confirm(`¿Borrar ${(E.tiposMov[m.tipo] || "").toLowerCase()} de ${eur(m.importe)} del ${fecha(m.fecha)} ${donde}?`)) return;
    try { await borra("movimientos", id); pinta(); } catch (x) { alert(x.message); }
  }

  /* ---------------------------------------------- saldos y valores anotados */
  const etiquetaValor = p => p.tipo === "efectivo" ? "Saldo" : p.tipo === "deuda" ? "Lo que queda por pagar" : "Valor";

  function vistaSaldos() {
    const lista = E.cfg.productos.filter(manual);
    if (!lista.length) {
      return `<section class="tarjeta"><header><h2>Saldos y valores</h2></header>
        <p class="subt">Aquí aparecen tus cuentas, deudas, planes de pensiones y todo lo que no tiene precio en
        internet. Añádelos en «Productos» (tipo «Cuenta / efectivo», o fuente del precio «Valor anotado a mano»).</p></section>`;
    }
    const tarjetas = lista.map(p => {
      const vals = E.cfg.valoraciones.filter(v => v.producto === p.id).sort((a, b) => a.fecha < b.fecha ? 1 : -1);
      const conAportado = !soloSaldo(p);
      const filas = vals.map(v => `<tr><td>${fecha(v.fecha)}</td><td>${eur(v.valor)}</td>
        ${conAportado ? `<td>${v.aportado != null ? eur(v.aportado) : "—"}</td>` : ""}
        <td class="acc"><button data-acc="editarValor" data-id="${esc(v.id)}">Editar</button>
          <button data-acc="borrarValor" data-id="${esc(v.id)}">Borrar</button></td></tr>`).join("");
      return `<section class="tarjeta saldo"><header><h2><i class="pt" style="background:var(--s${p.slot || 1})"></i>${esc(nombre(p))}</h2>
          <span class="subt">${esc(E.tipos[p.tipo] || "")}${p.entidad ? " · " + esc(p.entidad) : ""}</span><span class="sp"></span>
          ${p.tipo === "efectivo" || p.tipo === "p2p" ? `<button class="btn" data-acc="nuevoInteres" data-id="${esc(p.id)}" title="Intereses que te han pagado">+ Intereses</button>` : ""}
          ${p.tipo === "inmueble" ? `<button class="btn" data-acc="nuevoInteres" data-id="${esc(p.id)}" title="Lo que te ha pagado el inquilino">+ Alquiler</button>
            <button class="btn" data-acc="nuevoGasto" data-id="${esc(p.id)}" title="Comunidad, IBI, seguro, reparaciones…">+ Gasto</button>` : ""}
          <button class="btn" data-acc="nuevoValor" data-id="${esc(p.id)}">+ Anotar</button></header>
        ${filas ? `<div class="tablaEnv"><table class="dt"><thead><tr><th>Fecha</th><th>${etiquetaValor(p)}</th>
          ${conAportado ? "<th>Aportado</th>" : ""}<th></th></tr></thead><tbody>${filas}</tbody></table></div>`
          : '<p class="neg">Todavía no tiene ningún valor anotado.</p>'}</section>`;
    }).join("");
    return `<section class="tarjeta"><header><h2>Saldos y valores</h2>
        <span class="subt">Lo que no tiene precio en internet. Cuanto más a menudo lo anotes (una vez al mes basta),
        mejor sale su curva.</span><span class="sp"></span>
        <button class="btn prim" data-acc="todosValores">Anotar todos de una vez</button></header></section>
      <div class="saldos">${tarjetas}</div>`;
  }

  function formValor(v, productoId) {
    const nuevo = !v;
    const p = prod(v ? v.producto : productoId);
    const conAportado = !soloSaldo(p);
    const f = abreModal(`${nuevo ? "Anotar" : "Editar"} ${etiquetaValor(p).toLowerCase()} · ${esc(nombre(p))}`, `
      <div class="rejilla">
        ${campo("Fecha", `<input type="date" name="fecha" max="${hoy()}">`)}
        ${campo(etiquetaValor(p), '<div class="conSufijo"><input name="valor" inputmode="decimal" placeholder="0,00"><span>€</span></div>')}
        ${conAportado ? campo("Aportado hasta esa fecha", '<div class="conSufijo"><input name="aportado" inputmode="decimal" placeholder="0,00"><span>€</span></div>', "opcional", "ancho") : ""}
      </div>
      <div class="resumen"><span>${conAportado
        ? "Lo aportado es el dinero que llevas metido en total. Si lo anotas, el panel calcula su rentabilidad."
        : "Copia el saldo que ves hoy en tu banco."} Si ya había un valor ese mismo día, se sustituye.</span></div>`,
    async f => {
      const d = { ...campos(f), producto: p.id };
      if (!nuevo) d.id = v.id;
      await guarda("valoraciones", d);
      E.vista = "saldos";
      recuerda.guarda("patrimonio.editor", "saldos");
      return null;
    });
    rellena(f, v ? { ...v, valor: decimal(v.valor), aportado: decimal(v.aportado) } : { fecha: hoy() });
    f.elements.valor.focus();
  }

  function todosValores() {
    const lista = E.cfg.productos.filter(manual);
    const ultimo = id => E.cfg.valoraciones.filter(v => v.producto === id).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
    abreModal("Anotar todos los saldos", `
      <div class="rejilla">${campo("Fecha", `<input type="date" name="fecha" max="${hoy()}" value="${hoy()}">`)}</div>
      <div class="listaValores">${lista.map(p => {
        const u = ultimo(p.id);
        return `<label class="filaValor"><span><span class="nm"><i class="pt" style="background:var(--s${p.slot || 1})"></i>${esc(nombre(p))}</span>
          <small>${u ? `Último: ${eur(u.valor)} el ${fecha(u.fecha)}` : "Sin valores todavía"}</small></span>
          <span class="conSufijo"><input name="v_${esc(p.id)}" inputmode="decimal" placeholder="${u ? decimal(u.valor) : "0,00"}"><span>€</span></span></label>`;
      }).join("")}</div>
      <div class="resumen"><span>Deja en blanco los que no quieras tocar. Es el gesto de cada mes: abre tu banco y copia los saldos.</span></div>`,
    async f => {
      const d = campos(f);
      const pendientes = lista.filter(p => String(d["v_" + p.id] || "").trim());
      if (!pendientes.length) throw new Error("No has escrito ningún valor.");
      for (const p of pendientes) {
        try { await guarda("valoraciones", { producto: p.id, fecha: d.fecha, valor: d["v_" + p.id] }); }
        catch (x) { throw new Error(`${nombre(p)}: ${x.message}`); }
      }
      E.vista = "saldos";
      return null;
    }, "Guardar todos");
  }

  async function borrarValor(id) {
    const v = E.cfg.valoraciones.find(x => x.id === id);
    if (!confirm(`¿Borrar el valor de ${eur(v.valor)} del ${fecha(v.fecha)} de «${nombre(prod(v.producto))}»?`)) return;
    try { await borra("valoraciones", id); pinta(); } catch (x) { alert(x.message); }
  }

  /* ---------------------------------------------- importar */
  const IMP = { origen: "myinvestor", informe: null, token: null, hecho: null, prompt: null, archivos: [], respuestas: {} };
  const ICONOS = {
    myinvestor: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg>',
    plantilla: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
    ia: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/></svg>',
  };

  function zona(acepta, varios, texto) {
    return `<label class="zona" id="imZona"><input type="file" id="imArchivos" accept="${acepta}"${varios ? " multiple" : ""}>
      <span class="zIc">↥</span><b>${texto}</b><small>o pulsa aquí para elegir${varios ? "los" : "lo"}</small>
      <span class="zNom" id="imNombres"></span></label>`;
  }

  function vistaImportar() {
    if (IMP.informe) return vistaPrevia();
    const exito = IMP.hecho ? `<div class="exito"><b>✓ ${esc(IMP.hecho)}</b>
      <button class="btn" data-acc="verPanelDatos">Ver mi panel →</button></div>` : "";
    const op = (id, titulo, texto) => `<button class="imOp${IMP.origen === id ? " sel" : ""}" data-acc="imOrigen" data-id="${id}">
      <span class="ic">${ICONOS[id]}</span><b>${titulo}</b><small>${texto}</small></button>`;
    let paso;
    if (IMP.origen === "myinvestor") {
      paso = `<ol class="pasos">
          <li>Entra en MyInvestor desde el ordenador y abre <b>cada uno de tus fondos</b>.</li>
          <li>Pulsa <b>«Plusvalías y minusvalías»</b> y descarga el <b>CSV</b>. No le cambies el nombre: lleva el ISIN del fondo.</li>
          <li>Arrastra aquí todos los archivos a la vez.</li></ol>
        ${zona(".csv", true, "Arrastra aquí los CSV de MyInvestor")}
        <p class="ayuda">Cada importación sustituye lo que importaste antes de ese mismo fondo: repítela cada mes sin miedo a duplicar.
          MyInvestor no permite descargar las órdenes de ETF o acciones: haz capturas y usa la opción «Con ayuda de una IA».</p>`;
    } else if (IMP.origen === "plantilla") {
      paso = `<ol class="pasos">
          <li>Descarga la plantilla: <a class="btn" href="api/plantilla.xlsx" download>Excel</a>
            <a class="btn" href="api/plantilla.csv" download>CSV</a></li>
          <li>Rellena una fila por operación. En la hoja «Ejemplo» tienes cinco filas de muestra.</li>
          <li>Guárdala y arrástrala aquí.</li></ol>
        ${zona(".xlsx,.csv,.txt", false, "Arrastra aquí tu plantilla")}`;
    } else {
      paso = `<ol class="pasos">
          <li><b>Copia el prompt</b>: <button class="btn" data-acc="imCopiar" id="imCopiarBtn">Copiar prompt</button>
            <details class="verPrompt"><summary>Ver el prompt</summary><pre id="imPrompt">${esc(IMP.prompt || "Cargando…")}</pre></details></li>
          <li>Abre ChatGPT, Gemini o la IA que uses. Pega el prompt y, debajo, tu extracto, o adjunta el PDF o
            <b>capturas de pantalla</b> de tus órdenes (así se importan, por ejemplo, las compras de ETF o acciones de MyInvestor).
            <span class="alerta">Antes, borra (o tapa en las capturas) tu nombre, DNI, IBAN, números de cuenta y cualquier dato personal.</span></li>
          <li>Copia su respuesta y pégala aquí:</li></ol>
        <textarea id="imTexto" class="imTexto" rows="8" spellcheck="false"
          placeholder="fecha;identificador;nombre;tipo_producto;tipo_movimiento;unidades;importe;moneda;comision;nota"></textarea>`;
    }
    return `${exito}<section class="tarjeta"><header><h2>Importar datos</h2>
        <span class="subt">Trae tus movimientos de golpe. Antes de guardar nada verás una vista previa.</span></header>
      <div class="imOps">
        ${op("myinvestor", "MyInvestor", "El CSV de cada fondo")}
        ${op("plantilla", "Plantilla", "Excel o CSV, para cualquier banco")}
        ${op("ia", "Con ayuda de una IA", "Convierte el extracto de tu banco")}
      </div>
      <p class="ayuda" style="margin-top:14px">¿Tu banco o bróker no está (Trade Republic, Bankinter, Indexa…)?
        Usa la plantilla o la opción «Con ayuda de una IA».</p>
      <div class="imPaso">${paso}
        <div class="imErr" id="imFallo" hidden></div>
        <div class="imAcc"><span class="sp"></span>
          <button class="btn prim" data-acc="imRevisar" id="imRevisarBtn">Revisar antes de importar</button></div>
      </div></section>`;
  }

  function conectaImportar() {
    const inp = $("#imArchivos"), z = $("#imZona");
    if (inp) {
      const muestra = () => {
        IMP.archivos = [...inp.files];
        $("#imNombres").textContent = IMP.archivos.map(f => f.name).join(" · ");
        z.classList.toggle("lleno", IMP.archivos.length > 0);
      };
      inp.onchange = muestra;
      z.ondragover = e => { e.preventDefault(); z.classList.add("encima"); };
      z.ondragleave = () => z.classList.remove("encima");
      z.ondrop = e => {
        e.preventDefault();
        z.classList.remove("encima");
        inp.files = e.dataTransfer.files;
        muestra();
      };
    }
    if (IMP.origen === "ia" && !IMP.prompt) {
      api("GET", "api/prompt").then(j => { IMP.prompt = j.texto; const pre = $("#imPrompt"); if (pre) pre.textContent = j.texto; });
    }
  }

  async function imRevisar() {
    const fd = new FormData();
    fd.append("origen", IMP.origen);
    const inp = $("#imArchivos");
    if (inp) [...inp.files].forEach(f => fd.append("archivos", f));
    const txt = $("#imTexto");
    if (txt) fd.append("texto", txt.value);
    const b = $("#imRevisarBtn"), fallo = $("#imFallo");
    fallo.hidden = true;
    b.disabled = true;
    b.textContent = "Revisando y buscando precios…";
    try {
      const r = await fetch("api/importar/previsualizar", { method: "POST", body: fd, headers: cabeceraPerfil() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error((j.errores || ["Algo ha fallado al leerlo."]).join("\n"));
      IMP.informe = j.informe;
      IMP.token = j.token;
      IMP.hecho = null;
      pinta();
    } catch (x) {
      fallo.textContent = x.message;
      fallo.hidden = false;
      b.disabled = false;
      b.textContent = "Revisar antes de importar";
    }
  }

  function vistaPrevia() {
    const inf = IMP.informe, t = inf.totales;
    const n = inf.añadidos + inf.saldos;
    const cifra = (et, v, extra = "") => `<div class="cifra"><span>${et}</span><b>${v}</b>${extra ? `<small>${extra}</small>` : ""}</div>`;
    const errores = inf.errores.length ? `<div class="imErr"><b>${inf.errores.length} ${inf.errores.length === 1 ? "fila tiene" : "filas tienen"} problemas y no se importará${inf.errores.length === 1 ? "" : "n"}:</b>
      <ul>${inf.errores.map(e => `<li><span class="fila">${typeof e.fila === "number" ? "Fila " + e.fila : esc(e.fila)}</span>${esc(e.mensaje)}</li>`).join("")}</ul></div>` : "";
    const avisos = inf.avisos.map(a => `<div class="av"><span>⚠</span><span>${esc(a)}</span></div>`).join("");
    const nuevos = inf.productosNuevos.length ? `<div class="imNuevos"><div class="secc">Productos nuevos que se crearán</div>
      ${inf.productosNuevos.map(p => `<div class="imProd"><b>${esc(p.nombre)}</b>
        <span class="meta"><span>${esc(E.tipos[p.tipo] || p.tipo)}</span><span>${esc(p.codigo || "valor a mano")}</span>
        <span>${esc(E.fuentes[p.fuente])}</span>${p.precio ? `<span>${num(p.precio)} ${esc(p.monedaPrecio)} · ${fecha(p.fechaPrecio)}</span>` : ""}</span></div>`).join("")}</div>` : "";
    const traspasos = (inf.traspasosMyInvestor || []).map((t, i) => {
      const r = t.respuesta || t.sugerencia || {};
      const origen = r.origen || "ninguno";
      const lotes = (t.detalle && t.detalle.length) ? t.detalle : [[null, t.coste]];
      const fechaDe = k => (r.fechas && r.fechas[k] != null) ? r.fechas[k] : (r.fecha || "");
      const sinFecha = origen !== "ninguno" && lotes.some((l, k) => !fechaDe(k));
      const estado = t.hecho
        ? `<p class="relleno">✓ Se creará un traspaso desde «${esc((t.origenes.find(o => o.id === origen) || {}).nombre || origen)}»: no contará dos veces ni como venta.</p>`
        : t.error ? `<div class="imErr">${esc(t.error)}</div>`
        : sinFecha ? `<div class="imErr">Falta la fecha del traspaso. Sin ella no se puede crear: ponla para seguir.</div>` : "";
      return `<div class="bloque traspasoMI" style="margin-top:12px" data-ref="${esc(t.ref)}">
        <b>«${esc(t.nombre)}»: ${t.lotes} ${t.lotes === 1 ? "lote viene" : "lotes vienen"} de un traspaso</b>
        <p class="ayuda">${eur(t.coste)} de coste, ≈ ${num(t.unidades, 4)} participaciones. MyInvestor no dice de qué fondo
          venían. Si ese fondo está en Rumbo, elígelo y pon la fecha del traspaso: Rumbo hará un traspaso de verdad, el dinero
          no contará dos veces y verás cómo salió de él, aunque su extracto ya no traiga lo que se traspasó.</p>
        <div class="rejilla" style="margin-top:10px">
          ${campo("Venía de", `<select name="tmi_origen_${i}" data-i="${i}"><option value="ninguno">No está en Rumbo: importar como compras</option>
            ${t.origenes.map(o => `<option value="${esc(o.id)}"${o.id === origen ? " selected" : ""}>${esc(o.nombre)}</option>`).join("")}</select>`)}
        </div>
        <div class="lotesTraspaso">${lotes.map((l, k) => {
          const f = fechaDe(k), estimar = f === "estimar";
          return `<div class="loteTraspaso">
            <span class="loteEtq">${lotes.length > 1 ? `Lote ${k + 1}: ` : ""}${eur(l[1])}${l[0] ? ` · comprado el ${fecha(l[0])}` : ""}</span>
            <label class="campo"><span>Fecha del traspaso</span>
              <input type="date" name="tmi_fecha_${i}_${k}" max="${hoy()}" value="${estimar ? "" : esc(f)}"${estimar ? " disabled" : ""}></label>
            <label class="noSe"><input type="checkbox" name="tmi_estimar_${i}_${k}"${estimar ? " checked" : ""}> No la sé: que Rumbo la estime</label>
          </div>`;
        }).join("")}
          <p class="ayuda">La fecha está en el historial de órdenes de MyInvestor. Si no la encuentras, Rumbo la estima con los
            precios de los dos fondos y la marca como estimada.</p></div>${estado}${t.aviso ? `<div class="comprueba">${esc(t.aviso)}</div>` : ""}</div>`;
    }).join("");
    const ESTADO = { nuevo: "Nuevo", repetido: "Ya estaba", error: "Con error" };
    const filas = inf.filas.map(f => `<tr class="est-${f.estado}"><td>${fecha(f.fecha)}</td>
      <td style="text-align:left">${esc(f.productoNombre)}</td><td style="text-align:left">${esc(E.tiposMov[f.tipo] || "Saldo")}</td>
      <td>${f.unidades ? num(f.unidades) : "—"}</td><td>${eur(f.importe)}</td>
      <td style="text-align:left">${f.marcas.map(m => `<span class="etqImp">${esc(m)}</span>`).join("")}</td>
      <td><span class="estado">${ESTADO[f.estado]}</span></td></tr>`).join("");
    return `<section class="tarjeta"><header><h2>Vista previa</h2>
        <span class="subt">Todavía no se ha guardado nada.</span></header>
      <div class="cifras">
        ${cifra("Movimientos nuevos", inf.añadidos, t.numCompras ? `${t.numCompras} compras` : "")}
        ${cifra("Invertido en compras", eur(t.compras))}
        ${cifra("Ventas y dividendos", eur(t.ventas + t.dividendos))}
        ${inf.saldos ? cifra("Saldos anotados", inf.saldos) : ""}
        ${inf.repetidos ? cifra("Ya estaban", inf.repetidos, "se omiten") : ""}
        ${inf.sustituidos ? cifra("Sustituyen a", inf.sustituidos, "importados antes") : ""}
      </div>
      <div class="comprueba"><b>Compara estas cifras con tu banco antes de confirmar.</b>
        ${IMP.origen === "ia" ? "Una IA puede equivocarse al copiar números o saltarse alguna fila: revisa sobre todo el total invertido." : ""}</div>
      ${avisos}${errores}${traspasos ? `<div class="imNuevos"><div class="secc">Traspasos</div>${traspasos}</div>` : ""}${nuevos}
      ${filas ? `<div class="tablaEnv alto" style="margin-top:16px"><table class="dt"><thead><tr><th>Fecha</th>
        <th style="text-align:left">Producto</th><th style="text-align:left">Tipo</th><th>Unidades</th><th>Importe</th>
        <th style="text-align:left"></th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>` : ""}
      <div class="imAcc"><button class="btn" data-acc="imCancelar">Cancelar</button><span class="sp"></span>
        <button class="btn prim" data-acc="imConfirmar" id="imConfirmarBtn"${n ? "" : " disabled"}>
          ${n ? `Importar ${n} ${n === 1 ? "dato" : "datos"}` : "No hay nada nuevo que importar"}</button></div></section>`;
  }

  function leeRespuestas() {
    const inf = IMP.informe;
    const out = {};
    (inf && inf.traspasosMyInvestor || []).forEach((t, i) => {
      const o = document.querySelector(`[name="tmi_origen_${i}"]`);
      if (!o) return;
      const n = (t.detalle && t.detalle.length) || 1, fechas = [];
      for (let k = 0; k < n; k++) {
        const est = document.querySelector(`[name="tmi_estimar_${i}_${k}"]`), f = document.querySelector(`[name="tmi_fecha_${i}_${k}"]`);
        fechas.push(est && est.checked ? "estimar" : (f ? f.value : ""));
      }
      out[t.ref] = { origen: o.value, fechas, fecha: fechas[0] };
    });
    return out;
  }
  async function imRevisarTraspasos() {
    const respuestas = leeRespuestas();
    try {
      const j = await api("POST", "api/importar/revisar", { token: IMP.token, respuestas });
      IMP.informe = j.informe;
      IMP.respuestas = respuestas;
      pinta();
    } catch (x) { alert(x.message); }
  }
  document.addEventListener("change", e => {
    if (e.target.closest && e.target.closest(".traspasoMI") && E.vista === "importar" && IMP.informe) imRevisarTraspasos();
  });

  async function imConfirmar() {
    const b = $("#imConfirmarBtn");
    const faltan = Object.values(leeRespuestas()).filter(r => r.origen && r.origen !== "ninguno" && r.fechas.some(f => !f)).length;
    if (faltan) {
      alert(faltan === 1 ? "Falta la fecha de un traspaso. Ponla, o elige «No está en Rumbo», antes de importar."
        : `Faltan las fechas de ${faltan} traspasos. Ponlas, o elige «No está en Rumbo», antes de importar.`);
      return;
    }
    b.disabled = true;
    b.textContent = "Importando…";
    try {
      const j = await api("POST", "api/importar/confirmar", { token: IMP.token, respuestas: leeRespuestas() });
      E.cfg = j.cartera;
      window.EDITOR_SUCIO = true;
      const i = j.informe;
      const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
      IMP.hecho = "Importado: " + [i.añadidos && pl(i.añadidos, "movimiento", "movimientos"),
        i.saldos && pl(i.saldos, "saldo", "saldos")].filter(Boolean).join(" y ") +
        ((n => n ? ` (${pl(n, "traspaso", "traspasos")} desde otro fondo)` : "")((i.traspasosMyInvestor || []).filter(t => t.hecho).length)) +
        (i.repetidos ? `. ${pl(i.repetidos, "ya estaba y se ha omitido", "ya estaban y se han omitido")}` : "") + ".";
      IMP.informe = null;
      IMP.token = null;
      pinta();
      avisa(j.avisos);
    } catch (x) {
      alert(x.message);
      b.disabled = false;
    }
  }

  /* ---------------------------------------------- aportaciones periódicas */
  const pendientesPeriodicas = () => window.Calculos && E.cfg
    ? window.Calculos.periodicasPendientes(E.cfg.periodicas, E.cfg.productos.map(p => p.id), hoy()) : [];

  function avisoPeriodicas() {
    return pendientesPeriodicas().map(x => {
      const clave = esc(x.producto + "|" + x.dia);
      return `<div class="av"><span>↻</span><span>Aportación periódica de ${eur(x.importe)} a ${esc(nombre(prod(x.producto)))}
        (día ${x.dia}): ${x.cuantas === 1 ? `toca anotar la del ${fecha(x.desde)}` : `faltan ${x.cuantas}, desde el ${fecha(x.desde)}`}.
        <button class="btn" data-acc="periodicaPendiente" data-id="${clave}" style="margin-left:6px">Revisar y añadir</button>
        <button class="btn" data-acc="periodicaOlvidar" data-id="${clave}">No me lo recuerdes</button></span></div>`;
    }).join("");
  }

  function formPeriodica(pre) {
    const lista = E.cfg.productos.filter(p => !soloSaldo(p));
    if (!lista.length) { alert("Primero añade un producto en «Productos»."); return; }
    const filtro = prod(E.filtro);
    const d = pre || { producto: filtro && !soloSaldo(filtro) ? filtro.id : lista[0].id, dia: 1, hasta: hoy() };
    const f = abreModal("Aportación periódica", `
      <p>¿Aportas lo mismo cada mes a un fondo, un ETF o un plan? Dile a Rumbo cuánto, qué día y desde cuándo, y prepara
        una compra por mes con el precio de cierre de ese día.</p>
      <div class="rejilla">
        ${campo("Producto", `<select name="producto">${lista.map(p =>
          `<option value="${esc(p.id)}">${esc(nombre(p))}</option>`).join("")}</select>`, "", "ancho")}
        ${campo("Cuánto cada mes", '<div class="conSufijo"><input name="importe" inputmode="decimal" placeholder="200,00"><span>€</span></div>')}
        ${campo("Qué día del mes", '<input name="dia" inputmode="numeric" placeholder="1">', "si ese día no hay cierre, el anterior")}
        ${campo("Desde", `<input type="date" name="desde" max="${hoy()}">`)}
        ${campo("Hasta", `<input type="date" name="hasta" max="${hoy()}">`)}
      </div>
      <p class="ayuda">Son <b>estimadas</b>: tu banco puede ejecutarlas otro día o a otro precio. Antes de guardar verás la
        lista; después puedes corregir cada una con lo que diga tu banco. Las que ya tengas anotadas se saltan.</p>`,
    async f => {
      const datos = campos(f);
      const j = await api("POST", "api/periodicas/ver", datos);
      return () => revisaPeriodica(datos, j.plan);
    }, "Ver las aportaciones");
    rellena(f, { ...d, importe: d.importe != null ? decimal(d.importe) : "" });
  }

  function revisaPeriodica(datos, pl) {
    const etq = { nueva: "Se añade", repetida: "Ya la tienes", sinPrecio: "Sin precio ese día" };
    const filas = pl.lineas.map(x => `<tr${x.estado === "nueva" ? "" : ' class="subt"'}><td>${fecha(x.fecha)}</td>
      <td>${eur(x.importe)}</td><td>${x.precio ? num(x.precio) + " €" : "—"}</td>
      <td>${x.unidades ? num(x.unidades) : "—"}</td><td style="text-align:left">${etq[x.estado]}</td></tr>`).join("");
    const n = pl.nuevas;
    const f = abreModal("Revisa las aportaciones", `
      <p><b>${esc(pl.nombre)}</b>: ${pl.lineas.length} ${pl.lineas.length === 1 ? "aportación" : "aportaciones"} de
        ${eur(pl.importe)}, el día ${pl.dia} de cada mes. Se ${n === 1 ? "añade" : "añaden"} <b>${n}</b>${n < pl.lineas.length ? "; el resto se salta" : ""}.</p>
      <div class="tablaEnv alto"><table class="dt"><thead><tr><th>Fecha</th><th>Importe</th><th>Precio de cierre</th>
        <th>Participaciones</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="ayuda">Cada una se guarda como una compra con la nota «Aportación periódica (estimada…)». Rumbo se acuerda de
        esta aportación y, cuando toque la siguiente, te avisará aquí, en Movimientos.</p>`,
    async () => {
      const j = await api("POST", "api/periodicas/crear", datos);
      E.cfg = j.cartera;
      COP.lista = null;
      window.EDITOR_SUCIO = true;
      avisa(j.avisos);
      E.vista = "movimientos";
      recuerda.guarda("patrimonio.editor", "movimientos");
      return null;
    }, n ? `Añadir ${n} ${n === 1 ? "aportación" : "aportaciones"}` : "Nada que añadir");
    if (!n) f.querySelector("[type=submit]").disabled = true;
  }

  /* ---------------------------------------------- copias y web */
  const COP = { lista: null };

  function vistaCopias() {
    if (COP.lista === null) {
      api("GET", "api/copias").then(j => { COP.lista = j.copias; if (E.vista === "copias") pinta(); });
    }
    const propio = E.modo === "propio";
    const filas = (COP.lista || []).map(c => `<tr><td>${fecha(c.fecha.slice(0, 10))} <small>${c.fecha.slice(11, 16)}</small></td>
      <td style="text-align:left">${esc(c.motivo)}</td><td>${c.productos}</td><td>${c.movimientos}</td>
      <td class="acc"><button data-acc="recuperarCopia" data-id="${esc(c.archivo)}">Recuperar</button></td></tr>`).join("");
    return `<section class="tarjeta"><header><h2>Copia de seguridad</h2>
        <span class="subt">Un archivo con toda tu cartera, para guardarlo donde quieras o pasarlo a otro ordenador.</span></header>
      <div class="dosCol">
        <div class="bloque"><b>Guardar una copia</b>
          <p class="ayuda">Descarga un archivo <code>.json</code> con todos tus productos, movimientos y saldos.
            Guárdalo en tu nube o en un USB de vez en cuando.</p>
          ${propio ? '<a class="btn prim" href="api/copia/descargar" download>Descargar copia</a>'
            : '<span class="subt">Disponible cuando empieces tu propia cartera.</span>'}</div>
        <div class="bloque"><b>Recuperar desde un archivo</b>
          <p class="ayuda">Sube una copia que descargaste antes. Sustituye la cartera actual (que se guarda antes, por si acaso).</p>
          ${zona(".json", false, "Arrastra aquí tu copia")}
          <div class="imErr" id="copFallo" hidden></div>
          <div class="imAcc"><span class="sp"></span><button class="btn prim" data-acc="subirCopia" id="copSubirBtn">Recuperar esta copia</button></div></div>
      </div></section>

      <section class="tarjeta"><header><h2>Tus datos en Excel</h2>
        <span class="subt">Para revisarlos, hacer tus propias cuentas o llevártelos a otra app.</span></header>
      <p class="ayuda" style="margin-top:0">Un archivo <code>.xlsx</code> (se abre con Excel, Google Sheets o LibreOffice) con
        todos tus movimientos y saldos, y una hoja con la ficha de cada producto. La hoja «Movimientos» tiene el mismo
        formato que la plantilla de importación: puedes cambiarla y volver a importarla.</p>
      <a class="btn prim" href="api/exportar-excel" download>Descargar en Excel</a></section>

      <section class="tarjeta"><header><h2>Copias automáticas</h2>
        <span class="subt">Antes de cada cambio se guarda una copia (las últimas 20). Si te equivocas, vuelve a una anterior.</span></header>
      ${COP.lista === null ? '<p class="cargando">Cargando…</p>' : filas
        ? `<div class="tablaEnv alto"><table class="dt"><thead><tr><th>Fecha</th><th style="text-align:left">Motivo</th>
          <th>Productos</th><th>Movimientos</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<p class="subt">Todavía no hay copias: se crean solas en cuanto cambias algo.</p>'}</section>

      <section class="tarjeta"><header><h2>Publicar como web</h2>
        <span class="subt">Tu panel en un solo archivo, de solo lectura, para enseñarlo o subirlo a internet.</span></header>
      <label class="interruptor"><input type="checkbox" id="webOcultar"><span class="pista"></span>
        <span><b>Ocultar importes</b><small>Solo se ven porcentajes y la forma de las gráficas. Las cantidades reales no
          van dentro del archivo, ni siquiera escondidas.</small></span></label>
      <ol class="pasos" style="margin-top:18px">
        <li><button class="btn prim" data-acc="exportarWeb">Descargar la web</button>
          Puedes abrirla con doble clic o mandarla por correo.</li>
        <li>Para tener un enlace: crea una carpeta, mete dentro el archivo, cámbiale el nombre a <code>index.html</code>
          y arrastra la carpeta a <a href="https://app.netlify.com/drop" target="_blank" rel="noopener">app.netlify.com/drop</a>.
          En unos segundos te da una dirección para compartir.</li>
      </ol>
      <p class="ayuda">La web lleva la fecha de hoy: cuando actualices tus datos, vuelve a descargarla y súbela otra vez.</p></section>`;
  }

  async function subirCopia() {
    const inp = $("#imArchivos"), fallo = $("#copFallo");
    fallo.hidden = true;
    if (!inp.files.length) { fallo.textContent = "Elige primero el archivo de la copia."; fallo.hidden = false; return; }
    if (E.modo === "propio" && !confirm("Esto sustituye tu cartera actual por la de la copia. Tu cartera actual se guarda antes en «Copias automáticas». ¿Seguir?")) return;
    const fd = new FormData();
    fd.append("archivo", inp.files[0]);
    const r = await fetch("api/copia/subir", { method: "POST", body: fd, headers: cabeceraPerfil() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { fallo.textContent = (j.errores || ["No he podido leer la copia."]).join("\n"); fallo.hidden = false; return; }
    recuerda.guarda("patrimonio.tab", "datos");
    recuerda.guarda("patrimonio.editor", "productos");
    location.reload();
  }

  async function recuperarCopia(archivo) {
    const c = COP.lista.find(x => x.archivo === archivo);
    if (!confirm(`¿Volver a la copia del ${fecha(c.fecha.slice(0, 10))} a las ${c.fecha.slice(11, 16)} (${c.productos} productos, ${c.movimientos} movimientos)?\n\nTu cartera actual se guarda antes, así que puedes deshacerlo.`)) return;
    try {
      await api("POST", "api/copia/recuperar", { archivo });
      recuerda.guarda("patrimonio.tab", "datos");
      location.reload();
    } catch (x) { alert(x.message); }
  }

  /* ---------------------------------------------- aviso de versión nueva */
  api("GET", "api/version").then(v => {
    const pie = $("#ayudaVersion");
    if (pie) pie.innerHTML = `Versión ${esc(v.actual)}. ¿Otra duda o un fallo? Cuéntalo en la
      <a href="${esc(v.repo)}" target="_blank" rel="noopener">página del proyecto en GitHub</a>.`;
    if (!v.hayNueva) return;
    $("#bannerVersionTexto").innerHTML = v.docker
      ? `<b>Hay una versión nueva (${esc(v.ultima)}).</b> Para actualizar, en el equipo donde tienes Rumbo:
        <code>docker compose pull &amp;&amp; docker compose up -d</code>. Tus datos se quedan donde están.`
      : `<b>Hay una versión nueva (${esc(v.ultima)}).</b> Descárgala en
      <a href="${esc(v.repo)}" target="_blank" rel="noopener">GitHub</a> y copia tu carpeta <code>mis_datos</code> a la
      nueva: así no pierdes nada. Los pasos están en la pestaña Ayuda.`;
    $("#bannerVersion").hidden = false;
  }).catch(() => { /* sin internet: no pasa nada */ });

  /* ---------------------------------------------- ventana de novedades */
  // Una sola vez por versión: «hay una nueva» (con su vídeo) o, recién actualizada,
  // «esto es lo nuevo de tu versión». Solo a quien ya usa Rumbo con sus datos.
  setTimeout(() => api("GET", "api/novedades").then(n => {
    const vista = recuerda.lee("rumbo.novedades") || "";
    // ?novedades=1 la vuelve a enseñar aunque ya se viera, también con la cartera de ejemplo (para un vídeo).
    const forzar = new URLSearchParams(location.search).has("novedades");
    let caso = null, clave = "";
    if (n.nueva) { caso = n.nueva; clave = "nueva:" + n.nueva.version + (n.nueva.video ? ":v" : ""); }
    else if (n.tuya && (n.tuya.novedades.length || n.tuya.video) && D && (D.modo !== "demo" || forzar)) {
      caso = n.tuya; clave = "tuya:" + n.tuya.version + (n.tuya.video ? ":v" : "");
    }
    if (!caso || (vista === clave && !forzar) || $("#modal").open || document.body.classList.contains("video")) return;
    recuerda.guarda("rumbo.novedades", clave);
    const lista = caso.novedades.length ? `<ul class="listaNovedades">${caso.novedades.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    // Arriba del todo: quien prefiera el vídeo lo tiene a un clic (petición de Dani, 22-oct).
    const video = caso.video ? `<div class="verEnVideo"><b>¿Prefieres verlo en vídeo?</b>
       <a class="btn prim" href="${esc(caso.video)}" target="_blank" rel="noopener">▶ Ver las novedades en YouTube</a></div>` : "";
    const f = abreModal(n.nueva ? `Hay una versión nueva: ${esc(caso.titulo || caso.version)}` : `Novedades de ${esc(caso.titulo || "Rumbo " + caso.version)}`,
      `${video}${n.nueva ? `<p>Tienes la ${esc(n.actual)}. Esto es lo que trae la ${esc(caso.version)}:</p>` : "<p>Esto es lo que ha cambiado desde tu versión anterior:</p>"}
       ${lista}<div class="imAcc">${n.nueva ? `<a class="btn" href="${esc(n.repo)}" target="_blank" rel="noopener">Descargar en GitHub</a>` : ""}</div>
       ${n.nueva ? (n.docker ? '<p class="ayuda">Para actualizar: <code>docker compose pull &amp;&amp; docker compose up -d</code>. Tus datos no se tocan.</p>'
         : '<p class="ayuda">Para actualizar sin perder nada, sigue los pasos de Ayuda → «¿Cómo actualizo a una versión nueva?».</p>') : ""}`,
      async () => null, "Entendido");
    f.querySelector("footer [data-cerrar]").hidden = true;
  }).catch(() => { /* sin internet: no pasa nada */ }), 2500);

  /* ---------------------------------------------- acciones */
  const ACC = {
    empezar,
    reiniciar,
    verPanel() { recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); },
    nuevoProducto: soloPropio(() => formProducto(null)),
    editarProducto: soloPropio(id => formProducto(prod(id))),
    borrarProducto: soloPropio(borrarProducto),
    nuevoMov: soloPropio(() => formMovimiento(null)),
    nuevoInteres: soloPropio(id => formMovimiento(null, id, "dividendo")),
    nuevoGasto: soloPropio(id => formMovimiento(null, id, "comision")),
    periodica: soloPropio(() => formPeriodica()),
    periodicaPendiente: soloPropio(clave => {
      const x = pendientesPeriodicas().find(r => r.producto + "|" + r.dia === clave);
      if (x) formPeriodica({ producto: x.producto, importe: x.importe, dia: x.dia, desde: x.desde, hasta: hoy() });
    }),
    periodicaOlvidar: soloPropio(async clave => {
      const x = pendientesPeriodicas().find(r => r.producto + "|" + r.dia === clave);
      if (!x || !confirm("¿Dejo de recordarte esta aportación periódica? Las compras que ya anotaste no se tocan.")) return;
      try {
        const j = await api("POST", "api/periodicas/olvidar", { producto: x.producto, dia: x.dia });
        E.cfg = j.cartera;
        pinta();
      } catch (e) { alert(e.message); }
    }),
    nuevoTraspaso: soloPropio(() => formTraspaso(null)),
    nuevoAjuste: soloPropio(() => formAjuste(null)),
    objetivo: soloPropio(() => formObjetivo()),
    reparto: (...a) => (E.modo === "demo" ? formReparto() : soloPropio(() => formReparto())(...a)),
    colchon: soloPropio(() => formColchon()),
    editarMov: soloPropio(id => formMovimiento(E.cfg.movimientos.find(m => m.id === id))),
    borrarMov: soloPropio(borrarMov),
    nuevoValor: soloPropio(id => formValor(null, id)),
    editarValor: soloPropio(id => formValor(E.cfg.valoraciones.find(v => v.id === id))),
    borrarValor: soloPropio(borrarValor),
    todosValores: soloPropio(todosValores),
    repartirColores: soloPropio(async () => {
      try {
        const j = await api("POST", "api/repartir-colores");
        E.cfg = j.cartera;
        window.EDITOR_SUCIO = true;
        pinta();
      } catch (x) { alert(x.message); }
    }),
    imOrigen(id) { IMP.origen = id; IMP.hecho = null; pinta(); },
    imRevisar: soloPropio(imRevisar),
    imCancelar() { IMP.informe = null; IMP.token = null; pinta(); },
    imConfirmar,
    subirCopia,
    recuperarCopia,
    exportarWeb() { location.href = "api/exportar-web?ocultar=" + ($("#webOcultar").checked ? "1" : "0"); },
    verPanelDatos() { recuerda.guarda("patrimonio.tab", "patrimonio"); location.reload(); },
    async imCopiar() {
      const txt = IMP.prompt || (await api("GET", "api/prompt")).texto;
      IMP.prompt = txt;
      try { await navigator.clipboard.writeText(txt); } catch (e) {
        const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      const b = $("#imCopiarBtn");
      if (b) { b.textContent = "✓ Copiado"; setTimeout(() => { b.textContent = "Copiar prompt"; }, 2000); }
    },
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-acc]");
    if (b && ACC[b.dataset.acc]) ACC[b.dataset.acc](b.dataset.id);
  });
  const btnDiag = $("#btnDiagnostico");
  if (btnDiag) btnDiag.onclick = async () => {
    try {
      const j = await api("GET", "api/diagnostico");
      try { await navigator.clipboard.writeText(j.texto); } catch (e) {
        const ta = document.createElement("textarea"); ta.value = j.texto; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      btnDiag.textContent = "✓ Copiado: pégalo en el issue";
      setTimeout(() => { btnDiag.textContent = "Copiar informe para soporte"; }, 3000);
    } catch (x) { alert(x.message); }
  };
  const btnEmpezar = $("#btnEmpezar");
  if (btnEmpezar) btnEmpezar.onclick = empezar;

  /* ---------------------------------------------- el canal del autor */
  // Una tarjeta pequeña, la primera vez que ves tu propio panel con datos. Si pulsas
  // «Ahora no», vuelve como mucho una vez más al cabo de un mes; luego, nunca.
  (function canal() {
    const K = window.CANAL;
    if (!K) return;
    document.querySelectorAll(".autorCanal").forEach(el => { el.textContent = K.autor; });
    document.querySelectorAll(".enlaceCanal").forEach(el => { el.href = K.canal; });
    document.querySelectorAll(".enlaceSuscribir").forEach(el => { el.href = K.suscribir; });
    const tut = $("#ayudaTutorial");
    if (tut) tut.href = K.tutorial || K.canal + "/videos";
    const nov = $("#ayudaNovedades");
    if (nov && K.novedades) { nov.href = K.novedades; nov.hidden = false; }

    if (!D || D.modo !== "propio" || !(D.productos || []).length) return;
    let est = {};
    try { est = JSON.parse(recuerda.lee("patrimonio.canal") || "{}"); } catch (e) { est = {}; }
    const MES = 30 * 24 * 3600 * 1000;
    if (est.hecho || (est.veces || 0) >= 2 || (est.veces === 1 && Date.now() - (est.ultima || 0) < MES)) return;
    const guarda = cambios => recuerda.guarda("patrimonio.canal", JSON.stringify({ ...est, ...cambios }));

    setTimeout(() => {
      if (document.body.classList.contains("video") || $("#modal").open) return;
      const t = document.createElement("div");
      t.className = "tarjetaCanal";
      t.setAttribute("role", "dialog");
      t.innerHTML = `<button class="x" aria-label="Cerrar">×</button>
        <b>¿Te está siendo útil?</b>
        <p>Esta herramienta es gratis. La hago para mi canal de YouTube, donde cuento cómo invierto:
          suscribirte es la mejor forma de apoyarla. — ${esc(K.autor)}</p>
        <div class="botones"><a class="btn prim" href="${esc(K.suscribir)}" target="_blank" rel="noopener">▶ Suscribirme</a>
          <button class="ahoraNo">Ahora no</button></div>`;
      const cierra = () => { t.remove(); guarda({ veces: (est.veces || 0) + 1, ultima: Date.now() }); };
      t.querySelector(".x").onclick = cierra;
      t.querySelector(".ahoraNo").onclick = cierra;
      t.querySelector("a").onclick = () => { guarda({ hecho: true }); setTimeout(() => t.remove(), 300); };
      document.body.appendChild(t);
    }, 6000);
  })();

  window.Editor = { mostrar: pinta, objetivo: () => ACC.objetivo(), reparto: () => ACC.reparto(),
    colchon: () => ACC.colchon(), perfiles };
  // El panel pudo pintarse antes de que llegara el editor: que vuelva a pintar sus botones de «Cambiar».
  document.dispatchEvent(new Event("rumbo:editor"));
  carga().then(pinta).catch(x => {
    const cont = $("#editor");
    if (cont) cont.innerHTML = `<div class="av"><span>⚠</span><span>${esc(x.message)}</span></div>`;
  });
})();
