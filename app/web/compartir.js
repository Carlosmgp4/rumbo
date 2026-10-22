/* ============================================================
   compartir.js  ·  «Compartir mi mes»: tu mes en una imagen
   ------------------------------------------------------------
   Dibuja en el navegador (sin salir a internet) una imagen para
   redes con la rentabilidad del mes, el año y la curva, el logo
   de Rumbo y un QR. Tres formatos: Mini (1080×1080), Resumen
   (1080×1350) y Story (1080×1920). Por defecto, solo porcentajes:
   los euros salen únicamente si marcas «Mostrar euros».
   Solo va en la app; la web publicada no lo lleva.
   ============================================================ */
(function (raiz, fabrica) {
  const M = fabrica();
  if (typeof module === "object" && module.exports) module.exports = M;
  else raiz.Compartir = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMATOS = {
    mini: { w: 1080, h: 1080, nombre: "Mini" },
    resumen: { w: 1080, h: 1350, nombre: "Resumen" },
    story: { w: 1080, h: 1920, nombre: "Story" },
  };
  // Tres temas para las tres imágenes. «T» es el del dibujo en curso (lo fija dibuja()).
  const TEMAS = {
    oscuro: {
      nombre: "Oscuro", fondo: "#0e0e0d", tinta: "#ffffff", sub: "#a8a69c", linea: "#2c2c29", caja: "#181816",
      pista: "#232320", sube: "#3fcf7e", baja: "#f28b82", curva: "#3fcf7e", aporte: "#3987e5", aporteTxt: "#6aa6f0",
      logoFondo: "#2a78d6", logoTinta: "#ffffff", borde: null,
    },
    claro: {
      nombre: "Claro", fondo: "#f7f6f1", tinta: "#121211", sub: "#5b5a55", linea: "#dedcd3", caja: "#ffffff",
      pista: "#e8e6de", sube: "#0b7a3b", baja: "#c43d35", curva: "#0b7a3b", aporte: "#2a78d6", aporteTxt: "#1d5fb4",
      logoFondo: "#2a78d6", logoTinta: "#ffffff", borde: "#dedcd3",
    },
    azul: {
      nombre: "Azul", fondo: "#1d5fb4", tinta: "#ffffff", sub: "#dbe7f7", linea: "rgba(255,255,255,0.28)",
      caja: "rgba(255,255,255,0.10)", pista: "rgba(255,255,255,0.18)", sube: "#ffffff", baja: "#ffd0cc",
      curva: "#ffffff", aporte: "#ffd166", aporteTxt: "#ffd166", logoFondo: "#ffffff", logoTinta: "#1d5fb4", borde: null,
    },
  };
  let T = TEMAS.oscuro;
  const LETRA = '"Segoe UI Variable Display", "Segoe UI", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
  const MONO = '"Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", ui-monospace, monospace';

  // El QR (a la página de Rumbo) va ya calculado (segno, corrección M): no hace falta ninguna librería ni internet.
  // Si cambia el enlace, se generan de nuevo y se pegan aquí.
  const QR = {
    repo: { n: 29, texto: "Descárgala", d: "M0 0h7v1h-7zM10 0h4v1h-4zM16 0h4v1h-4zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h2v1h-2zM13 1h3v1h-3zM17 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM9 2h1v1h-1zM12 2h2v1h-2zM16 2h2v1h-2zM19 2h2v1h-2zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM11 3h1v1h-1zM13 3h3v1h-3zM18 3h1v1h-1zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM9 4h1v1h-1zM12 4h3v1h-3zM16 4h1v1h-1zM18 4h1v1h-1zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h1v1h-1zM10 5h2v1h-2zM13 5h2v1h-2zM18 5h2v1h-2zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM10 7h1v1h-1zM12 7h1v1h-1zM14 7h1v1h-1zM17 7h1v1h-1zM0 8h1v1h-1zM3 8h1v1h-1zM5 8h2v1h-2zM8 8h1v1h-1zM11 8h2v1h-2zM15 8h2v1h-2zM21 8h1v1h-1zM23 8h1v1h-1zM2 9h4v1h-4zM7 9h5v1h-5zM14 9h2v1h-2zM20 9h1v1h-1zM22 9h1v1h-1zM25 9h1v1h-1zM28 9h1v1h-1zM3 10h2v1h-2zM6 10h3v1h-3zM19 10h3v1h-3zM24 10h4v1h-4zM0 11h1v1h-1zM2 11h2v1h-2zM10 11h3v1h-3zM14 11h2v1h-2zM18 11h2v1h-2zM24 11h1v1h-1zM26 11h2v1h-2zM0 12h1v1h-1zM4 12h4v1h-4zM9 12h3v1h-3zM16 12h3v1h-3zM20 12h3v1h-3zM25 12h1v1h-1zM27 12h2v1h-2zM1 13h5v1h-5zM8 13h4v1h-4zM15 13h2v1h-2zM18 13h4v1h-4zM0 14h3v1h-3zM4 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM11 14h2v1h-2zM17 14h2v1h-2zM20 14h1v1h-1zM22 14h7v1h-7zM1 15h2v1h-2zM4 15h2v1h-2zM7 15h1v1h-1zM12 15h3v1h-3zM16 15h3v1h-3zM20 15h3v1h-3zM25 15h1v1h-1zM27 15h1v1h-1zM0 16h2v1h-2zM3 16h2v1h-2zM6 16h2v1h-2zM9 16h2v1h-2zM13 16h3v1h-3zM17 16h2v1h-2zM20 16h1v1h-1zM23 16h1v1h-1zM27 16h1v1h-1zM1 17h1v1h-1zM4 17h1v1h-1zM8 17h1v1h-1zM10 17h1v1h-1zM16 17h3v1h-3zM20 17h4v1h-4zM25 17h1v1h-1zM28 17h1v1h-1zM0 18h1v1h-1zM5 18h3v1h-3zM13 18h1v1h-1zM16 18h1v1h-1zM18 18h1v1h-1zM21 18h1v1h-1zM23 18h2v1h-2zM27 18h2v1h-2zM4 19h2v1h-2zM9 19h1v1h-1zM13 19h1v1h-1zM16 19h2v1h-2zM20 19h2v1h-2zM23 19h2v1h-2zM27 19h2v1h-2zM0 20h1v1h-1zM3 20h2v1h-2zM6 20h4v1h-4zM12 20h1v1h-1zM14 20h1v1h-1zM16 20h1v1h-1zM18 20h7v1h-7zM26 20h1v1h-1zM8 21h6v1h-6zM16 21h1v1h-1zM19 21h2v1h-2zM24 21h1v1h-1zM26 21h3v1h-3zM0 22h7v1h-7zM9 22h3v1h-3zM13 22h2v1h-2zM16 22h2v1h-2zM20 22h1v1h-1zM22 22h1v1h-1zM24 22h1v1h-1zM27 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM11 23h3v1h-3zM15 23h2v1h-2zM18 23h1v1h-1zM20 23h1v1h-1zM24 23h3v1h-3zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM9 24h1v1h-1zM14 24h4v1h-4zM20 24h5v1h-5zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h1v1h-1zM10 25h5v1h-5zM17 25h4v1h-4zM22 25h6v1h-6zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM9 26h1v1h-1zM14 26h1v1h-1zM18 26h3v1h-3zM24 26h3v1h-3zM28 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM12 27h2v1h-2zM15 27h3v1h-3zM19 27h3v1h-3zM24 27h1v1h-1zM27 27h1v1h-1zM0 28h7v1h-7zM8 28h1v1h-1zM10 28h1v1h-1zM12 28h1v1h-1zM16 28h2v1h-2zM20 28h6v1h-6zM27 28h1v1h-1z" },
  };

  /* ---------------------------------------------- formato de las cifras */
  const pct = (v, dec = 1) => v == null ? "—"
    : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(dec).replace(".", ",") + " %";
  const eur = (v, signo = false) => v == null ? "—"
    : (signo && v > 0 ? "+" : v < 0 ? "−" : "") +
      Math.abs(Math.round(v)).toLocaleString("es-ES", { maximumFractionDigits: 0, useGrouping: true }) + " €";
  const color = v => v != null && v < 0 ? T.baja : T.sube;

  /* ---------------------------------------------- piezas de dibujo */
  function texto(ctx, s, x, y, o) {
    ctx.save();
    ctx.font = `${o.peso || 400} ${o.tam}px ${o.mono ? MONO : LETRA}`;
    ctx.fillStyle = o.color || T.tinta;
    ctx.textAlign = o.alin || "left";
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = (o.esp || 0) + "px";
    let tam = o.tam;
    if (o.max) {   // si no cabe, más pequeño
      while (tam > 10 && ctx.measureText(s).width > o.max) {
        tam = Math.floor(tam * 0.94);
        ctx.font = `${o.peso || 400} ${tam}px ${o.mono ? MONO : LETRA}`;
      }
    }
    ctx.fillText(s, x, y);
    const ancho = ctx.measureText(s).width;
    ctx.restore();
    return ancho;
  }

  function caja(ctx, x, y, w, h, r, relleno, borde, grosor) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = grosor || 2; ctx.stroke(); }
  }

  function raya(ctx, x1, y1, x2, y2, col, grosor) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = col;
    ctx.lineWidth = grosor || 2;
    ctx.stroke();
  }

  // El logo: brújula sobre un cuadrado redondeado (fondo y tinta intercambiables).
  function logo(ctx, x, y, tam, fondo, tinta) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(tam / 512, tam / 512);
    caja(ctx, 0, 0, 512, 512, 112, fondo);
    ctx.beginPath();
    ctx.arc(256, 256, 132, 0, Math.PI * 2);
    ctx.strokeStyle = tinta;
    ctx.lineWidth = 34;
    ctx.stroke();
    ctx.fillStyle = tinta;
    ctx.fill(new Path2D("M256 78l22 40h-44z M256 434l22-40h-44z M78 256l40-22v44z M434 256l-40-22v44z"));
    ctx.fill(new Path2D("M176 336L236 236L336 176L276 276Z"));
    ctx.beginPath();
    ctx.arc(256, 256, 17, 0, Math.PI * 2);
    ctx.fillStyle = fondo;
    ctx.fill();
    ctx.restore();
  }

  // QR sobre una baldosa blanca de lado 'tam' (con margen para que se lea bien).
  function qr(ctx, x, y, tam, cual, tinta, borde) {
    const q = QR[cual] || QR.repo;
    caja(ctx, x, y, tam, tam, tam * 0.11, "#ffffff", borde, 2);
    const margen = tam * 0.09, paso = (tam - 2 * margen) / q.n;
    ctx.save();
    ctx.translate(x + margen, y + margen);
    ctx.scale(paso, paso);
    ctx.fillStyle = tinta || "#0e0e0d";
    ctx.fill(new Path2D(q.d));
    ctx.restore();
  }

  // La curva del año (índice de la cartera, sin contar aportaciones), con su área.
  function curva(ctx, vals, x, y, w, h, col, grosor) {
    if (!vals || vals.length < 2) return;
    const min = Math.min(...vals), max = Math.max(...vals), pad = grosor * 2;
    const px = i => x + pad + i * (w - 2 * pad) / (vals.length - 1);
    const py = v => y + pad + (h - 2 * pad) * (1 - (v - min) / ((max - min) || 1));
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.save();
    ctx.lineTo(px(vals.length - 1), y + h);
    ctx.lineTo(px(0), y + h);
    ctx.closePath();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = col;
    ctx.lineWidth = grosor;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(vals.length - 1), py(vals[vals.length - 1]), grosor * 2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }

  function candado(ctx, x, y, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    caja(ctx, x, y + 16, 30, 22, 4, null, col, 3);
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 16);
    ctx.lineTo(x + 7, y + 10);
    ctx.arc(x + 15, y + 10, 8, Math.PI, 0);
    ctx.lineTo(x + 23, y + 16);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------- textos que dependen del mes */
  const etiquetaMes = d => d.enCurso ? "EN LO QUE VA DE MES" : "MI CARTERA ESTE MES";
  const lineaAno = d => d.anoPct == null ? "" : d.ultimo
    ? `${pct(d.anoPct)} en lo que va de ${d.ano}`
    : `${pct(d.anoPct)} en ${d.ano}, hasta ${d.nombreMes}`;

  function cabecera(ctx, x, y, tamLogo) {
    logo(ctx, x, y, tamLogo, T.logoFondo, T.logoTinta);
    texto(ctx, "RUMBO", x + tamLogo + 20, y + tamLogo / 2 + tamLogo * 0.17,
      { tam: Math.round(tamLogo * 0.48), peso: 800, esp: 3, color: T.tinta });
  }

  /* ---------------------------------------------- 1 · Mini (1080×1080) */
  function mini(ctx, d, o) {
    ctx.fillStyle = T.fondo;
    ctx.fillRect(0, 0, 1080, 1080);
    cabecera(ctx, 96, 88, 72);
    ctx.save();
    ctx.font = `500 26px ${MONO}`;
    const wPill = ctx.measureText(d.etiqueta).width + 48;
    ctx.restore();
    caja(ctx, 984 - wPill, 96, wPill, 56, 28, null, T.linea, 2);
    texto(ctx, d.etiqueta, 984 - wPill / 2, 133, { tam: 26, peso: 500, mono: true, color: T.sub, alin: "center" });

    texto(ctx, etiquetaMes(d), 96, 330, { tam: 28, peso: 500, mono: true, esp: 4, color: T.sub });
    texto(ctx, pct(d.rentMes), 92, 560, { tam: 268, peso: 800, esp: -10, color: color(d.rentMes), max: 888 });
    curva(ctx, d.serieAno, 96, 600, 888, 140, T.curva, 5);
    texto(ctx, lineaAno(d), 96, 800, { tam: 38, peso: 500, max: 888 });

    raya(ctx, 96, 850, 984, 850, T.linea, 2);
    texto(ctx, "Hecho con Rumbo", 96, 920, { tam: 36, peso: 700 });
    texto(ctx, "Gratis y de código abierto.", 96, 966, { tam: 23, mono: true, color: T.sub });
    texto(ctx, "Tus datos no salen de tu ordenador.", 96, 998, { tam: 23, mono: true, color: T.sub });
    qr(ctx, 834, 868, 150, o.qr, null, T.borde);
    texto(ctx, (QR[o.qr] || QR.repo).texto, 909, 1050, { tam: 20, mono: true, color: T.sub, alin: "center" });
  }

  /* ---------------------------------------------- 2 · Resumen (1080×1350) */
  function resumen(ctx, d, o) {
    ctx.fillStyle = T.fondo;
    ctx.fillRect(0, 0, 1080, 1350);
    cabecera(ctx, 80, 80, 60);
    texto(ctx, "Mi mes · " + d.etiqueta, 1000, 119, { tam: 24, peso: 500, mono: true, color: T.sub, alin: "right" });

    texto(ctx, d.enCurso ? "EN LO QUE VA DE MES" : "ESTE MES", 80, 230, { tam: 24, peso: 500, mono: true, esp: 4, color: T.sub });
    texto(ctx, pct(d.rentMes), 76, 400, { tam: 196, peso: 800, esp: -8, color: color(d.rentMes), max: o.euros ? 560 : 640 });
    texto(ctx, "Rentabilidad de la cartera, sin contar lo que aporté", 80, 444, { tam: 20, mono: true, color: T.sub });
    if (o.euros) {
      texto(ctx, "Patrimonio", 1000, 280, { tam: 22, mono: true, color: T.sub, alin: "right" });
      texto(ctx, eur(d.patrimonio), 1000, 350, { tam: 64, peso: 700, alin: "right", max: 380 });
      texto(ctx, eur(d.cambioEur, true) + " este mes", 1000, 392, { tam: 26, color: color(d.cambioEur), alin: "right" });
    } else {
      candado(ctx, 970, 270, T.sub);
      texto(ctx, "Importes ocultos", 1000, 352, { tam: 28, peso: 700, alin: "right" });
      texto(ctx, "Comparto cómo voy,", 1000, 386, { tam: 20, mono: true, color: T.sub, alin: "right" });
      texto(ctx, "no cuánto tengo.", 1000, 412, { tam: 20, mono: true, color: T.sub, alin: "right" });
    }

    texto(ctx, "Mi año, mes a mes", 80, 510, { tam: 22, peso: 500, mono: true, color: T.sub });
    curva(ctx, d.serieAno, 80, 525, 920, 180, T.curva, 5);
    raya(ctx, 80, 706, 1000, 706, T.linea, 2);
    texto(ctx, d.etqIni, 80, 740, { tam: 20, mono: true, color: T.sub });
    texto(ctx, d.etqFin, 1000, 740, { tam: 20, mono: true, color: T.sub, alin: "right" });

    const kpis = [
      ["En el año", pct(d.anoPct), color(d.anoPct)],
      d.tir != null ? ["TIR anual", pct(d.tir), T.tinta] : ["Desde el inicio", pct(d.desdeInicio), T.tinta],
      d.racha >= 1 ? ["Aportando", d.racha + (d.racha === 1 ? " mes" : " meses"), T.tinta] : ["Desde el inicio", pct(d.desdeInicio), T.tinta],
      ["Mi patrimonio", pct(d.crecimiento), color(d.crecimiento)],
    ];
    if (kpis[1][0] === kpis[2][0]) kpis[2] = ["Este mes", pct(d.rentMes), color(d.rentMes)];
    kpis.forEach(([etq, valor, col], i) => {
      const x = 80 + i * 234;
      caja(ctx, x, 775, 218, 140, 22, T.caja, T.linea, 2);
      texto(ctx, etq, x + 22, 822, { tam: 19, mono: true, color: T.sub, max: 180 });
      texto(ctx, valor, x + 22, 884, { tam: 42, peso: 700, color: col, max: 176 });
    });

    texto(ctx, "De dónde sale el cambio del mes", 80, 975, { tam: 22, peso: 500, mono: true, color: T.sub });
    const a = Math.abs(d.aportadoEur || 0), m = Math.abs(d.mercadoEur || 0), total = a + m;
    caja(ctx, 80, 995, 920, 30, 15, T.pista);
    if (total > 0) {
      const wa = 920 * a / total;
      if (wa > 1) caja(ctx, 80, 995, Math.max(wa - 2, 30), 30, 15, T.aporte);
      if (920 - wa > 1) caja(ctx, 80 + wa + 2, 995, Math.max(920 - wa - 2, 30), 30, 15, color(d.mercadoEur));
    }
    const vA = o.euros ? eur(d.aportadoEur, true) : pct(d.porAportado);
    const vM = o.euros ? eur(d.mercadoEur, true) : pct(d.porMercado);
    const wA = texto(ctx, "Lo pusiste tú", 80, 1065, { tam: 27, peso: 700, color: T.aporteTxt });
    texto(ctx, " · " + vA, 80 + wA, 1065, { tam: 27 });
    ctx.save();
    ctx.font = `400 27px ${LETRA}`;
    const wVM = ctx.measureText(" · " + vM).width;
    ctx.restore();
    texto(ctx, " · " + vM, 1000, 1065, { tam: 27, alin: "right" });
    texto(ctx, d.mercadoEur < 0 ? "Lo restó el mercado" : "Lo puso el mercado", 1000 - wVM, 1065,
      { tam: 27, peso: 700, color: color(d.mercadoEur), alin: "right" });

    raya(ctx, 80, 1105, 1000, 1105, T.linea, 2);
    texto(ctx, "¿Quieres el tuyo? Hazte tu Rumbo", 80, 1170, { tam: 34, peso: 700, max: 740 });
    texto(ctx, "Gratis y de código abierto.", 80, 1210, { tam: 21, mono: true, color: T.sub });
    texto(ctx, "Tus datos no salen de tu ordenador.", 80, 1240, { tam: 21, mono: true, color: T.sub });
    qr(ctx, 860, 1125, 140, o.qr, null, T.borde);
  }

  /* ---------------------------------------------- 3 · Story (1080×1920) */
  function story(ctx, d, o) {
    ctx.fillStyle = T.fondo;
    ctx.fillRect(0, 0, 1080, 1920);
    cabecera(ctx, 80, 150, 76);
    texto(ctx, d.etiqueta, 1000, 198, { tam: 28, peso: 500, mono: true, color: T.sub, alin: "right" });

    texto(ctx, etiquetaMes(d), 80, 420, { tam: 32, peso: 500, mono: true, esp: 4, color: T.sub });
    texto(ctx, pct(d.rentMes), 72, 700, { tam: 330, peso: 800, esp: -14, max: 930, color: color(d.rentMes) });
    curva(ctx, d.serieAno, 80, 760, 920, 260, T.curva, 7);

    const filas = [];
    if (d.anoPct != null) filas.push([pct(d.anoPct), d.ultimo ? "en lo que va de año" : `en ${d.ano}, hasta ${d.nombreMes}`]);
    if (d.racha >= 2) filas.push([String(d.racha), "meses seguidos invirtiendo"]);
    else if (d.desdeInicio != null) filas.push([pct(d.desdeInicio), "desde que empecé"]);
    filas.slice(0, 2).forEach(([grande, peque], i) => {
      const y = 1110 + i * 130;
      raya(ctx, 80, y, 1000, y, T.linea, 3);
      const w = texto(ctx, grande, 80, y + 90, { tam: 76, peso: 800 });
      texto(ctx, peque, 80 + w + 24, y + 90, { tam: 38, peso: 500, color: T.sub, max: 920 - w - 24 });
    });

    caja(ctx, 80, 1420, 920, 330, 40, "#ffffff", T.borde, 2);
    qr(ctx, 110, 1460, 250, o.qr, "#121211");
    texto(ctx, "¿Quieres el tuyo?", 392, 1530, { tam: 48, peso: 800, color: "#121211", max: 580 });
    texto(ctx, "Rumbo es gratis y de código", 392, 1585, { tam: 30, color: "#3f3e3a" });
    texto(ctx, "abierto. Escanea y llévatelo.", 392, 1625, { tam: 30, color: "#3f3e3a" });
    texto(ctx, "Tus datos no salen de tu ordenador.", 392, 1690, { tam: 22, mono: true, color: "#5b5a55", max: 580 });
  }

  const DIBUJO = { mini, resumen, story };

  // Dibuja el formato en el contexto de un <canvas> ya del tamaño de FORMATOS[formato].
  function dibuja(ctx, formato, datos, opciones) {
    const o = { euros: false, qr: "repo", tema: "oscuro", ...(opciones || {}) };
    T = TEMAS[o.tema] || TEMAS.oscuro;
    (DIBUJO[formato] || mini)(ctx, datos, o);
  }

  /* ---------------------------------------------- la ventana (solo en el navegador) */
  function abrir() {
    const D = window.DATOS, C = window.Calculos;
    const rm = (D && D.resumenMensual) || [];
    if (!rm.length || !C) { alert("Todavía no hay ningún mes que compartir."); return; }
    const lee = (k, def) => { try { return localStorage.getItem(k) || def; } catch (e) { return def; } };
    const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* da igual */ } };
    const sel = document.getElementById("mesSel");
    const op = {
      formato: lee("rumbo.compartir.formato", "resumen"),
      qr: "repo",
      tema: lee("rumbo.compartir.tema", "oscuro"),
      euros: false,
      mes: sel && sel.value !== "" ? +sel.value : rm.length - 1,
    };
    if (!FORMATOS[op.formato]) op.formato = "resumen";
    if (!TEMAS[op.tema]) op.tema = "oscuro";
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const meses = rm.map((r, i) => ({ i, etq: C.resumenParaCompartir(D, i).etiqueta })).reverse().slice(0, 36);
    const dlg = document.getElementById("modal");
    dlg.innerHTML = `<form class="mForm cmpForm" novalidate>
      <header><h2>Compartir mi mes</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="mCuerpo">
        <div class="cmpOpciones">
          <div class="segm" id="cmpFormato" role="group" aria-label="Formato de la imagen">
            ${Object.entries(FORMATOS).map(([k, f]) => `<button type="button" data-f="${k}">${f.nombre}</button>`).join("")}
          </div>
          <div class="segm" id="cmpTema" role="group" aria-label="Tema de la imagen">
            ${Object.entries(TEMAS).map(([k, t]) => `<button type="button" data-t="${k}">${t.nombre}</button>`).join("")}
          </div>
          <select id="cmpMes" aria-label="Mes">${meses.map(m => `<option value="${m.i}">${esc(m.etq)}</option>`).join("")}</select>
          <label class="cmpEuros"><input type="checkbox" id="cmpEuros"> Mostrar euros</label>
        </div>
        <canvas id="cmpLienzo" class="cmpLienzo" role="img" aria-label="Vista previa de la imagen"></canvas>
        <p class="ayuda" id="cmpNota"></p>
      </div>
      <footer><button type="button" class="btn" id="cmpCopiar">Copiar imagen</button>
        <button type="button" class="btn prim" id="cmpBajar">Descargar imagen</button></footer></form>`;
    const $ = s => dlg.querySelector(s);
    dlg.querySelectorAll("[data-cerrar]").forEach(b => { b.onclick = () => dlg.close(); });
    const lienzo = $("#cmpLienzo");
    const pinta = () => {
      const f = FORMATOS[op.formato];
      lienzo.width = f.w;
      lienzo.height = f.h;
      const datos = C.resumenParaCompartir(D, op.mes);
      dibuja(lienzo.getContext("2d"), op.formato, datos, op);
      dlg.querySelectorAll("#cmpFormato button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === op.formato)));
      dlg.querySelectorAll("#cmpTema button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === op.tema)));
      $(".cmpEuros").hidden = op.formato !== "resumen";
      $("#cmpNota").textContent = op.formato === "resumen" && op.euros
        ? "Con euros: se ve tu patrimonio y cuánto has aportado. Revísala antes de publicarla."
        : "Solo porcentajes: nadie sabe cuánto tienes. El QR lleva a la página de Rumbo para descargarlo.";
    };
    $("#cmpMes").value = String(op.mes);
    dlg.querySelectorAll("#cmpFormato button").forEach(b => {
      b.onclick = () => { op.formato = b.dataset.f; guarda("rumbo.compartir.formato", op.formato); pinta(); };
    });
    dlg.querySelectorAll("#cmpTema button").forEach(b => {
      b.onclick = () => { op.tema = b.dataset.t; guarda("rumbo.compartir.tema", op.tema); pinta(); };
    });
    $("#cmpMes").onchange = e => { op.mes = +e.target.value; pinta(); };
    $("#cmpEuros").onchange = e => { op.euros = e.target.checked; pinta(); };
    const nombre = () => `rumbo-${rm[op.mes].mes}-${op.formato}-${op.tema}.png`;
    $("#cmpBajar").onclick = () => lienzo.toBlob(b => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = nombre();
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }, "image/png");
    $("#cmpCopiar").onclick = () => lienzo.toBlob(async b => {
      const boton = $("#cmpCopiar");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        boton.textContent = "¡Copiada!";
        setTimeout(() => { boton.textContent = "Copiar imagen"; }, 1800);
      } catch (e) {
        alert("Tu navegador no deja copiar imágenes. Descárgala con «Descargar imagen».");
      }
    }, "image/png");
    pinta();
    dlg.classList.add("cmpModal");   // un poco más ancha que las demás ventanas
    dlg.addEventListener("close", () => dlg.classList.remove("cmpModal"), { once: true });
    dlg.showModal();
  }

  // El botón va junto al selector de mes, en la pestaña «El mes» (no en la cartera de ejemplo).
  function monta() {
    if (typeof document === "undefined") return;
    const barra = document.querySelector("#tab-mes .mesBarra");
    if (!barra || document.getElementById("btnCompartir")) return;
    const D = window.DATOS;
    if (!D || D.modo === "demo" || !(D.resumenMensual || []).length) return;
    const b = document.createElement("button");
    b.className = "btn prim";
    b.id = "btnCompartir";
    b.type = "button";
    b.textContent = "Compartir mi mes";
    b.title = "Una imagen de tu mes para redes, con solo porcentajes";
    b.onclick = abrir;
    barra.appendChild(b);
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", monta);
    else monta();
  }

  return { FORMATOS, TEMAS, QR, dibuja, abrir, pct, eur };
});
