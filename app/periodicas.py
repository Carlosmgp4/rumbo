# -*- coding: utf-8 -*-
"""
periodicas.py  ·  Aportaciones periódicas (la de cada mes a tu fondo)
=====================================================================
Dices el producto, cuánto, qué día del mes y desde cuándo, y Rumbo prepara una compra
por mes con el precio de cierre de ese día (o del último día con precio, como mucho una
semana antes) y las participaciones que salen.

Son ESTIMADAS: tu banco puede ejecutarlas otro día o a otro precio. Por eso nada se
guarda solo: primero se enseña la lista y solo se añaden si las confirmas; después se
pueden editar una a una con lo que diga tu banco. Las que ya tengas anotadas (una compra
del mismo producto y de un importe parecido a pocos días) se saltan.
"""

import calendar
import datetime as dt
import re

from . import almacen, motor

FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_APORTACIONES = 600          # 50 años, una al mes
DIAS_REPETIDA = 5               # una compra a menos de estos días cuenta como la misma
NOTA = "Aportación periódica (estimada con el cierre del {})"


def fechas(desde, hasta, dia):
    """El día 'dia' de cada mes entre 'desde' y 'hasta' (incluidos). En meses más cortos, el último día."""
    d0, d1 = dt.date.fromisoformat(desde), dt.date.fromisoformat(hasta)
    out, ano, mes = [], d0.year, d0.month
    while (ano, mes) <= (d1.year, d1.month):
        f = dt.date(ano, mes, min(dia, calendar.monthrange(ano, mes)[1]))
        if d0 <= f <= d1:
            out.append(f.isoformat())
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return out


def lee_peticion(cfg, datos, hoy=None):
    """Valida lo que manda el formulario. Devuelve (producto, importe, dia, desde, hasta)."""
    hoy = hoy or dt.date.today()
    errores = []
    p = almacen.producto(cfg, str(datos.get("producto") or ""))
    if not p or p.get("tipo") in almacen.SOLO_SALDO:
        errores.append("Elige un producto de los tuyos (un fondo, un ETF, un plan…).")
    importe = almacen.numero(datos.get("importe"), "cuánto aportas cada vez", errores, mayor_que=0)
    dia = almacen.numero(datos.get("dia"), "qué día del mes", errores, minimo=1)
    if dia is not None and (dia != int(dia) or not 1 <= dia <= 31):
        errores.append("El día del mes tiene que ser un número del 1 al 31.")
    desde, hasta = str(datos.get("desde") or ""), str(datos.get("hasta") or hoy.isoformat())
    for nombre, f in (("desde", desde), ("hasta", hasta)):
        try:
            if not FECHA.match(f):
                raise ValueError
            dt.date.fromisoformat(f)
        except ValueError:
            errores.append(f"La fecha «{nombre}» no es válida.")
    if not errores:
        if hasta > hoy.isoformat():
            errores.append("Solo se pueden añadir aportaciones que ya han pasado.")
        elif desde > hasta:
            errores.append("La fecha de inicio es posterior a la de fin.")
    if errores:
        raise almacen.ErrorValidacion(errores)
    return p, round(importe, 2), int(dia), desde, hasta


def plan(cfg, datos, serie=None, hoy=None):
    """Las aportaciones que se añadirían, sin guardar nada.
    'serie' es el precio diario en euros del producto ({} o None si se valora a mano)."""
    p, importe, dia, desde, hasta = lee_peticion(cfg, datos, hoy)
    lista = fechas(desde, hasta, dia)
    if not lista:
        raise almacen.ErrorValidacion(["En esas fechas no cae ninguna aportación."])
    if len(lista) > MAX_APORTACIONES:
        raise almacen.ErrorValidacion([f"Son {len(lista)} aportaciones: como mucho {MAX_APORTACIONES} de una vez."])
    a_mano = p.get("fuente") == "manual"
    if not a_mano and not serie:
        raise almacen.ErrorValidacion([f"No encuentro los precios de «{motor.sin_html(p.get('corto') or p['nombre'])}». "
                                       "Pulsa «Actualizar precios» y vuelve a probar."])
    compras = [(dt.date.fromisoformat(m["fecha"]), float(m.get("importe") or 0)) for m in cfg.get("movimientos", [])
               if m.get("producto") == p["id"] and m.get("tipo") == "compra"]
    lineas = []
    for f in lista:
        df = dt.date.fromisoformat(f)
        repetida = any(abs((df - cf).days) <= DIAS_REPETIDA and abs(ci - importe) <= max(1.0, importe * 0.02)
                       for cf, ci in compras)
        linea = {"fecha": f, "importe": importe, "precio": None, "fechaPrecio": None, "unidades": None,
                 "estado": "repetida" if repetida else "nueva"}
        if not a_mano:
            precio = motor.valor_en(serie or {}, f, margen=7)
            if precio:
                linea.update(precio=round(precio, 6), fechaPrecio=motor.fecha_en(serie, f, margen=7),
                             unidades=round(importe / precio, 6))
            elif not repetida:
                linea["estado"] = "sinPrecio"
        lineas.append(linea)
    return {"producto": p["id"], "nombre": motor.sin_html(p.get("nombre") or p["id"]), "aMano": a_mano,
            "importe": importe, "dia": dia, "desde": desde, "hasta": hasta, "lineas": lineas,
            "nuevas": sum(1 for x in lineas if x["estado"] == "nueva")}


def crear(cfg, datos, serie=None, hoy=None):
    """Añade las aportaciones nuevas del plan (recalculado aquí, sin fiarse del navegador) y
    recuerda la periódica para avisar de las siguientes. Devuelve cuántas ha añadido."""
    pl = plan(cfg, datos, serie, hoy)
    nuevas = [x for x in pl["lineas"] if x["estado"] == "nueva"]
    if not nuevas:
        raise almacen.ErrorValidacion(["No hay ninguna aportación nueva que añadir: ya las tienes anotadas."])
    for x in nuevas:
        almacen.guarda_movimiento(cfg, {
            "producto": pl["producto"], "tipo": "compra", "fecha": x["fecha"], "importe": x["importe"],
            "unidades": x["unidades"] or "",
            "nota": NOTA.format(motor.fmt_fecha_es(x["fechaPrecio"])) if x["fechaPrecio"] else "Aportación periódica",
        })
    lista = [r for r in cfg.get("periodicas", []) if isinstance(r, dict)
             and not (r.get("producto") == pl["producto"] and r.get("dia") == pl["dia"])]
    lista.append({"producto": pl["producto"], "importe": pl["importe"], "dia": pl["dia"],
                  "ultima": max(x["fecha"] for x in pl["lineas"])})
    cfg["periodicas"] = lista
    return {"anadidas": len(nuevas), "saltadas": len(pl["lineas"]) - len(nuevas)}


def olvidar(cfg, datos):
    """Deja de recordar una aportación periódica (no borra las compras ya anotadas)."""
    pid = str(datos.get("producto") or "")
    try:
        dia = int(datos.get("dia"))
    except (TypeError, ValueError):
        dia = None
    antes = len(cfg.get("periodicas", []))
    cfg["periodicas"] = [r for r in cfg.get("periodicas", []) if isinstance(r, dict)
                         and not (r.get("producto") == pid and r.get("dia") == dia)]
    if len(cfg["periodicas"]) == antes:
        raise almacen.ErrorValidacion(["Esa aportación periódica ya no estaba."])
    return None
