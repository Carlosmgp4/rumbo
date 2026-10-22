#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
motor.py  ·  Los calculos del dashboard de patrimonio
=====================================================
Lee la cartera (productos, movimientos y valores anotados a mano), descarga los
precios de Morningstar, Yahoo Finance y CoinGecko y calcula todo lo que pinta el
panel: series diarias, aportado, plusvalias, TIR, rentabilidad por ano...

Lo llama el servidor (servidor.py); no hace falta ejecutarlo a mano.
"""

import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import datetime as dt
from collections import defaultdict

from . import red

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

CACHE = "cache"      # lo fija construir() dentro de la carpeta de datos
SIN_RED = False      # True: recalcula solo con los precios guardados
SOLO_FALTAN = False  # True: descarga solo las series que no estan en la cache
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

# Paleta validada para daltonismo. Slot -> (modo claro, modo oscuro).
PALETA = {
    1: ("#2a78d6", "#3987e5"),   # azul
    2: ("#eb6834", "#d95926"),   # naranja
    3: ("#1baf7a", "#199e70"),   # aqua
    4: ("#eda100", "#c98500"),   # amarillo
    5: ("#e87ba4", "#d55181"),   # magenta
    6: ("#008300", "#008300"),   # verde
    7: ("#4a3aa7", "#9085e9"),   # violeta
    8: ("#e34948", "#e66767"),   # rojo
    9: ("#0e8fb0", "#2bb0d1"),   # cian
    10: ("#9a6a3a", "#c08a55"),  # marrón
    11: ("#5d6b8a", "#93a1c2"),  # gris azulado
    12: ("#7c9a00", "#9cc21a"),  # oliva
}

AVISOS = []


def aviso(txt):
    AVISOS.append(txt)
    print("  [!] " + txt)


# ---------------------------------------------------------------- utilidades

def hoy():
    return dt.date.today()


def d(s):
    return dt.date.fromisoformat(s)


def rango_fechas(desde, hasta):
    out, x = [], desde
    while x <= hasta:
        out.append(x)
        x += dt.timedelta(days=1)
    return out


def num_es(txt):
    """Convierte '1.399,89' o '3352,6' o '13.25' en float."""
    t = (txt or "").strip().replace(" ", "").replace(" ", "").replace("€", "")
    if not t:
        return 0.0
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")        # "1.000" en castellano es mil, no uno
    try:
        return float(t)
    except ValueError:
        return 0.0


def r2(x):
    return None if x is None else round(float(x), 2)


def r4(x):
    return None if x is None else round(float(x), 4)


# ---------------------------------------------------------------- Yahoo

def descargar_serie(simbolo, anos=None):
    """Devuelve {fecha_iso: cierre} descargando de Yahoo, con cache en disco."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9._-]", "_", simbolo) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return previo

    # Se pide por fechas (period1/period2): con range=max Yahoo devuelve un dato al mes
    # o al trimestre aunque se le pida interval=1d.
    desde = int(time.time()) - anos * 365 * 86400 if anos else 0
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(simbolo)}?period1={desde}&period2={int(time.time())}&interval=1d")
    try:
        with red.abrir(url, UA, timeout=30) as resp:
            bruto = json.loads(resp.read().decode("utf-8", "replace"))
        res = bruto["chart"]["result"][0]
        granularidad = (res.get("meta") or {}).get("dataGranularity", "1d")
        if granularidad != "1d":
            aviso(f"{simbolo}: Yahoo ha devuelto precios cada {granularidad} en vez de diarios; uso la cache.")
            return previo
        cierres = res["indicators"]["quote"][0].get("close", [])
        nuevo = {}
        for ts, c in zip(res.get("timestamp", []), cierres):
            if c is not None:
                nuevo[dt.date.fromtimestamp(ts).isoformat()] = float(c)
        if nuevo:
            # Lo descargado sustituye a lo guardado en ese tramo de fechas: así se limpian
            # los datos mensuales que dejó en la cache la versión 1.1.0.
            previo = {k: v for k, v in previo.items() if k < min(nuevo)}
            previo.update(nuevo)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(previo, f)
            print(f"  OK  {simbolo:16s} {len(nuevo):5d} sesiones  "
                  f"ultimo {sorted(nuevo)[-1]} = {nuevo[sorted(nuevo)[-1]]:.4f}")
        else:
            aviso(f"{simbolo}: Yahoo no devolvio cotizaciones, uso la cache.")
    except Exception as e:
        if previo:
            aviso(f"{simbolo}: sin conexion ({type(e).__name__}), uso la cache guardada.")
        else:
            aviso(f"{simbolo}: sin conexion y sin cache ({type(e).__name__}).")
    return previo


def descargar_morningstar(secid, universo="]2]0]FOESP$$ALL", anos=30):
    """Serie diaria de valores liquidativos de Morningstar, con cache en disco."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, "MS_" + re.sub(r"[^A-Za-z0-9]", "_", secid) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return mover_fin_de_semana(previo)
    hoy_ = dt.date.today()
    q = {"currencyId": "EUR", "idtype": "Morningstar", "frequency": "daily",
         "startDate": (hoy_ - dt.timedelta(days=365 * anos)).isoformat(),
         "endDate": hoy_.isoformat(), "outputType": "COMPACTJSON", "id": secid + universo}
    url = ("https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?"
           + urllib.parse.urlencode(q, safe="]$"))
    try:
        with red.abrir(url, UA, timeout=30) as resp:
            datos = json.loads(resp.read().decode("utf-8", "replace"))
        nuevo = {dt.datetime.fromtimestamp(x[0] / 1000, dt.timezone.utc).date().isoformat(): float(x[1])
                 for x in datos if x and len(x) > 1 and x[1] is not None}
        if nuevo:
            previo.update(nuevo)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(previo, f)
            print(f"  OK  Morningstar {secid:12s} {len(nuevo):5d} VL  "
                  f"ultimo {max(nuevo)} = {nuevo[max(nuevo)]:.4f}")
        else:
            aviso(f"Morningstar {secid}: sin datos, uso la cache.")
    except Exception as e:
        if previo:
            aviso(f"Morningstar {secid}: sin conexion ({type(e).__name__}), uso la cache guardada.")
        else:
            aviso(f"Morningstar {secid}: no disponible ({type(e).__name__}); solo Yahoo.")
    return mover_fin_de_semana(previo)


def mover_fin_de_semana(serie):
    # Lleva al viernes los datos fechados en sabado o domingo, si ese viernes no
    # tiene dato. El monetario aparece en Morningstar con el VL del viernes
    # fechado en domingo, y asi no casaba con las compras hechas en viernes.
    out = {k: v for k, v in serie.items() if dt.date.fromisoformat(k).weekday() < 5}
    for k in sorted(serie):
        d = dt.date.fromisoformat(k)
        if d.weekday() >= 5:
            out.setdefault((d - dt.timedelta(days=d.weekday() - 4)).isoformat(), serie[k])
    return out


def combinar_vl(ms, yahoo, nombre=""):
    """
    Une Morningstar y Yahoo. Yahoo se salta dias (el 31 de diciembre, por ejemplo)
    y va un dia por detras; Morningstar redondea a tres decimales. Donde coinciden
    se queda el dato de Yahoo, que es mas preciso; donde discrepan manda Morningstar;
    los huecos de una los cubre la otra.
    """
    out, discrepan, cubiertos = {}, 0, 0
    for f in set(ms) | set(yahoo):
        m, y = ms.get(f), yahoo.get(f)
        if m and y:
            if abs(m - y) <= 0.0006:
                out[f] = y
            else:
                out[f] = m
                discrepan += 1
        elif m:
            out[f] = m
            cubiertos += 1
        else:
            out[f] = y
    print(f"  ..  {nombre}: {len(out)} VL, {cubiertos} huecos de Yahoo cubiertos por Morningstar"
          + (f", {discrepan} discrepancias resueltas a favor de Morningstar" if discrepan else ""))
    return out


def rellenar(serie, eje):
    """Proyecta {fecha: valor} sobre el eje diario arrastrando el ultimo valor."""
    claves = sorted(serie)
    if not claves:
        return [None] * len(eje)
    out, i, ultimo = [], 0, None
    for f in eje:
        fi = f.isoformat()
        while i < len(claves) and claves[i] <= fi:
            ultimo = serie[claves[i]]
            i += 1
        out.append(ultimo)
    return out


def valor_en(serie, fecha, margen=10):
    """Ultimo valor conocido en o antes de 'fecha'."""
    f = fecha if isinstance(fecha, dt.date) else d(fecha)
    for i in range(margen + 1):
        k = (f - dt.timedelta(days=i)).isoformat()
        if k in serie:
            return serie[k]
    return None


def fecha_en(serie, fecha, margen=10):
    """Fecha del ultimo dato disponible en o antes de 'fecha'."""
    f = fecha if isinstance(fecha, dt.date) else d(fecha)
    for i in range(margen + 1):
        k = (f - dt.timedelta(days=i)).isoformat()
        if k in serie:
            return k
    return None


def a_euros(serie, serie_fx):
    """Convierte cada cierre con el cambio de su mismo dia (o el ultimo anterior)."""
    if serie_fx is None:
        return dict(serie)
    out = {}
    for k, v in serie.items():
        x = valor_en(serie_fx, k, margen=5)
        if x:
            out[k] = v * x
    return out


def lee_cache(ruta):
    if os.path.exists(ruta):
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def guarda_cache(ruta, serie):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(serie, f)


def simbolo_fx(moneda):
    """Par de Yahoo para pasar una moneda a euros, y factor previo (peniques -> libras)."""
    m = (moneda or "EUR").strip()
    if m in ("GBp", "GBX"):
        return "GBPEUR=X", 0.01
    m = m.upper()
    if m == "EUR":
        return None, 1.0
    return f"{m}EUR=X", 1.0


def en_euros(serie, moneda, series):
    """Convierte una serie en 'moneda' a euros con el cambio de cada dia."""
    sim, factor = simbolo_fx(moneda)
    if sim:
        fx = series.get(sim) or {}
        if not fx:
            if serie:
                aviso(f"No tengo el cambio {sim}: no puedo pasar a euros los precios en {moneda}.")
            return {}
        serie = a_euros(serie, fx)
    return {k: v * factor for k, v in serie.items()} if factor != 1 else dict(serie)


_COTIZACIONES = {}


def precio_eur(p, series, tolerancia=0.03):
    """
    Precio diario en euros de un producto, ya limpio, segun su fuente.

    Si el producto tiene una linea de respaldo (p["respaldo"], de Yahoo), se contrasta
    dia a dia con ella. Hace falta porque Yahoo a veces trae historicos basura: la
    linea de Euronext Paris del ETP de bitcoin tiene el precio congelado en 7,465 EUR
    durante todo 2024 y 2025. Donde las dos lineas no coinciden, manda el respaldo.
    """
    if p["id"] in _COTIZACIONES:
        return _COTIZACIONES[p["id"]]

    if p.get("fuente") == "yahoo":
        principal = en_euros(series.get(p.get("codigo"), {}), p.get("moneda"), series)
    elif p.get("fuente") in ("morningstar", "coingecko"):
        principal = dict(series.get(clave_serie(p), {}))
    else:
        principal = {}
    respaldo = (en_euros(series.get(p["respaldo"], {}), p.get("respaldoMoneda"), series)
                if p.get("respaldo") else {})
    if not respaldo:
        _COTIZACIONES[p["id"]] = principal
        return principal

    out, sustituidos, ultimo = {}, 0, None
    for f in sorted(set(principal) | set(respaldo)):
        pr, rs = principal.get(f), respaldo.get(f)
        if pr and rs:
            if abs(pr / rs - 1) <= tolerancia:
                v = pr
            else:
                v, sustituidos = rs, sustituidos + 1
        elif rs:
            v = rs
        else:
            # Solo hay principal ese dia: se acepta si no pega un salto absurdo.
            if ultimo and abs(pr / ultimo - 1) > 0.15:
                sustituidos += 1
                continue
            v = pr
        out[f] = v
        ultimo = v
    if sustituidos:
        print(f"  ..  {p.get('corto')}: {sustituidos} cierres de {p.get('codigo')} no cuadraban "
              f"y se han sustituido por {p['respaldo']}")
    _COTIZACIONES[p["id"]] = out
    return out


# ---------------------------------------------------------------- TIR (XIRR)

def xirr(flujos):
    """flujos = [(fecha, importe)]. Negativo = aportacion, positivo = valor."""
    flujos = [(f, float(v)) for f, v in flujos if v]
    if len(flujos) < 2:
        return None
    if not (any(v < 0 for _, v in flujos) and any(v > 0 for _, v in flujos)):
        return None
    f0 = min(f for f, _ in flujos)

    def van(tasa):
        s = 0.0
        for f, v in flujos:
            t = (f - f0).days / 365.0
            base = 1.0 + tasa
            if base <= 1e-9:
                return float("inf")
            s += v / (base ** t)
        return s

    lo, hi = -0.9999, 10.0
    try:
        vlo, vhi = van(lo), van(hi)
    except Exception:
        return None
    if not (math.isfinite(vlo) and math.isfinite(vhi)) or vlo * vhi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        vm = van(mid)
        if abs(vm) < 1e-7:
            return mid
        if vlo * vm <= 0:
            hi, vhi = mid, vm
        else:
            lo, vlo = mid, vm
    return (lo + hi) / 2


# ---------------------------------------------------------------- CoinGecko

def descargar_coingecko(coin, dias=365):
    """Serie diaria en euros de CoinGecko, con cache en disco. La API gratuita da un ano."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, "CG_" + re.sub(r"[^A-Za-z0-9._-]", "_", coin) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return previo
    url = (f"https://api.coingecko.com/api/v3/coins/{urllib.parse.quote(coin)}/market_chart"
           f"?vs_currency=eur&days={dias}&interval=daily")
    try:
        with red.abrir(url, UA, timeout=30) as resp:
            datos = json.loads(resp.read().decode("utf-8", "replace"))
        nuevo = {dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).date().isoformat(): float(v)
                 for ts, v in datos.get("prices", []) if v is not None}
        if nuevo:
            previo.update(nuevo)
            guarda_cache(ruta, previo)
            print(f"  OK  CoinGecko {coin:14s} {len(nuevo):5d} dias  "
                  f"ultimo {max(nuevo)} = {nuevo[max(nuevo)]:.2f}")
        else:
            aviso(f"CoinGecko {coin}: sin datos, uso los precios guardados.")
    except Exception as e:
        aviso(f"CoinGecko {coin}: no responde ({type(e).__name__}), uso los precios guardados."
              if previo else f"CoinGecko {coin}: no responde y no tengo precios guardados.")
    return previo


# ---------------------------------------------------------------- modelo

TIPOS = {
    "fondo": "Fondo de inversión", "etf": "ETF", "accion": "Acción", "cripto": "Criptomoneda",
    "commodity": "Materia prima", "bono": "Bono", "pension": "Plan de pensiones",
    "efectivo": "Cuenta / efectivo", "inmueble": "Inmueble", "deuda": "Deuda / préstamo",
    "p2p": "Préstamos P2P / crowdfunding", "otro": "Otro",
}
CLASE_DEFECTO = {
    "fondo": "Fondos", "etf": "Renta variable", "accion": "Renta variable",
    "cripto": "Criptoactivos", "commodity": "Materias primas", "bono": "Renta fija",
    "pension": "Jubilación", "efectivo": "Efectivo", "inmueble": "Inmuebles",
    "deuda": "Deudas", "p2p": "P2P y crowdfunding", "otro": "Otros",
}
FUENTES = {"morningstar": "Morningstar", "yahoo": "Yahoo Finance",
           "coingecko": "CoinGecko", "manual": "Valor anotado a mano"}
ORDEN_TIPO = {"compra": 0, "comision": 1, "dividendo": 2, "venta": 3, "traspaso_salida": 4, "traspaso_entrada": 5,
              "ajuste": 6}

# Carteras de referencia para «¿y si lo hubieras metido en un indexado?». Son ETF
# reales que cotizan en euros; las piezas son (ticker de Yahoo, peso).
REFERENCIAS = {
    "mundo": {"nombre": "MSCI World",
              "detalle": "ETF iShares Core MSCI World (IWDA), en euros: unas 1.400 empresas de 23 países desarrollados.",
              "piezas": [("IWDA.AS", 1.0)]},
    "sp500": {"nombre": "S&P 500",
              "detalle": "ETF iShares Core S&P 500 (SXR8), en euros: las 500 mayores empresas de EE. UU.",
              "piezas": [("SXR8.DE", 1.0)]},
    "6040": {"nombre": "Cartera 60/40",
             "detalle": "60 % MSCI World (IWDA) y 40 % bonos globales cubiertos a euros (EUNA), sin rebalancear.",
             "piezas": [("IWDA.AS", 0.6), ("EUNA.DE", 0.4)]},
    "sinriesgo": {"nombre": "Sin riesgo",
                  "detalle": "ETF monetario del euro (XEON): lo que da el dinero aparcado, sin sustos.",
                  "piezas": [("XEON.DE", 1.0)]},
}
# Cómo se llama el precio y las unidades de cada tipo de producto en el panel:
# (precio, unidades, "... lo tuvieras o no").
ETIQUETAS = {
    "fondo": ("Valor liquidativo", "Participaciones", "El valor liquidativo del fondo"),
    "pension": ("Valor liquidativo", "Participaciones", "El valor liquidativo del plan"),
    "etf": ("Precio del ETF", "Participaciones", "El precio del ETF"),
    "accion": ("Precio de la acción", "Acciones", "El precio de la acción"),
    "cripto": ("Precio", "Unidades", "El precio de la criptomoneda"),
    "commodity": ("Precio por unidad", "Unidades", "El precio"),
    "bono": ("Precio del bono", "Títulos", "El precio del bono"),
}


# Textos que escribe el usuario (o que llegan en una copia o un CSV importado) y que el
# panel pinta como HTML: sin < ni > no pueden colar código en la página.
TEXTOS_LIBRES = ("nombre", "corto", "entidad", "clase", "gestora", "tipoDetalle", "papel",
                 "identificador", "codigo", "indice", "indiceDetalle", "politica", "mercado", "isin")


def sin_html(texto):
    return re.sub(r"[<>]", "", texto) if isinstance(texto, str) else texto


def limpia_textos(p):
    for k in TEXTOS_LIBRES:
        if isinstance(p.get(k), str):
            p[k] = sin_html(p[k])
    return p


def fmt_fecha_es(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if iso else ""


def precios_de_operaciones(movs):
    """{fecha: precio por unidad} de tus compras y ventas (lo pagado o cobrado, sin comisión)."""
    out = {}
    for m in sorted(movs, key=lambda m: m["fecha"]):
        u = float(m.get("unidades") or 0)
        if m.get("tipo") not in ("compra", "venta") or u <= 0:
            continue
        imp, com = float(m.get("importe") or 0), float(m.get("comision") or 0)
        neto = imp - com if m.get("tipo") == "compra" else imp + com
        if neto > 0:
            out[m["fecha"]] = neto / u
    return out


def alquiler(movs, fecha_extracto):
    """Lo cobrado de alquiler (movimientos «dividendo» de un inmueble) y lo gastado («comision»):
    en total y en los últimos 12 meses. None si no hay nada anotado."""
    hace_un_ano = (fecha_extracto - dt.timedelta(days=365)).isoformat()
    out, hay = {"cobrado": 0.0, "gastos": 0.0, "cobrado12": 0.0, "gastos12": 0.0}, False
    for m in movs:
        if m.get("tipo") not in ("dividendo", "comision"):
            continue
        hay = True
        k = "cobrado" if m["tipo"] == "dividendo" else "gastos"
        imp = float(m.get("importe") or 0)
        out[k] += imp
        if m["fecha"] > hace_un_ano:
            out[k + "12"] += imp
    return {k: r2(v) for k, v in out.items()} if hay else None


def objetivo_propio(cfg):
    """El objetivo que ha elegido el usuario, o None para usar el siguiente hito.
    Hasta la 1.2 toda cartera nueva traía 100.000 € activados sin haberlos elegido nadie:
    ese valor de fábrica se trata como «sin objetivo propio»."""
    o = cfg.get("objetivo")
    if not isinstance(o, dict) or not o.get("activo") or not o.get("importe"):
        return None
    if not o.get("elegido") and float(o["importe"]) == 100000:
        return None
    return {"activo": True, "importe": float(o["importe"]),
            "etiqueta": sin_html(o.get("etiqueta") or "Mi objetivo")}


def colchon(cfg):
    """El fondo de emergencia elegido (en euros) o None."""
    c = cfg.get("colchon")
    if not isinstance(c, dict):
        return None
    try:
        if c.get("modo") == "importe":
            return {"modo": "importe", "importe": float(c["importe"])}
        return {"modo": "meses", "meses": float(c["meses"]), "gastoMensual": float(c["gastoMensual"]),
                "importe": round(float(c["meses"]) * float(c["gastoMensual"]), 2)}
    except (KeyError, TypeError, ValueError):
        return None


def reparto_objetivo(cfg):
    o = cfg.get("objetivoReparto")
    if not isinstance(o, dict) or not o.get("pesos"):
        return None
    return {"por": "producto" if o.get("por") == "producto" else "clase",
            "pesos": {sin_html(str(k)): float(v) for k, v in o["pesos"].items() if isinstance(v, (int, float))},
            "vigilar": float(o.get("vigilar") or 3), "rebalancear": float(o.get("rebalancear") or 5),
            "conEfectivo": bool(o.get("conEfectivo")),
            "cuenta": {sin_html(str(k)): bool(v) for k, v in (o.get("cuenta") or {}).items()}
            if isinstance(o.get("cuenta"), dict) else {}}


def clave_serie(p):
    return {"morningstar": "MS:", "coingecko": "CG:"}.get(p.get("fuente"), "") + (p.get("codigo") or "")


def expande_traspasos(movimientos):
    """Un traspaso se guarda como un solo movimiento (del producto de origen al de destino).
    Aquí se parte en su salida (en el origen) y su entrada (en el destino), unidas por su id."""
    out = []
    for m in movimientos:
        if m.get("tipo") != "traspaso":
            out.append(m)
            continue
        out.append({**m, "tipo": "traspaso_salida", "_tid": m.get("id")})
        out.append({**m, "tipo": "traspaso_entrada", "producto": m.get("destino"), "origen": m.get("producto"),
                    "unidades": m.get("unidadesDestino"), "_tid": m.get("id")})
    return out


def _saca_fifo(lotes, unidades):
    """Saca 'unidades' de los lotes, primero los más antiguos. Devuelve (trozos, lo que faltaba).
    Cada trozo es [unidades, coste, ref, fecha de compra]."""
    quedan, trozos = unidades, []
    while quedan > 1e-9 and lotes:
        lu, lc, ref, lf = lotes[0]
        toma = min(lu, quedan)
        parte = lc * toma / lu if lu else 0.0
        trozos.append([toma, parte, ref, lf])
        quedan -= toma
        lotes[0] = [lu - toma, lc - parte, ref, lf]
        if lotes[0][0] <= 1e-9:
            lotes.pop(0)
    return trozos, quedan


def _saca_proporcion(lotes, fraccion):
    """Saca la misma fracción de cada lote (productos a mano, sin unidades)."""
    trozos = []
    for lote in lotes:
        lu, lc, ref, lf = lote
        trozos.append([lu * fraccion, lc * fraccion, ref, lf])
        lote[0], lote[1] = lu * (1 - fraccion), lc * (1 - fraccion)
    lotes[:] = [l for l in lotes if l[1] > 1e-9 or l[0] > 1e-9]
    return trozos


def aplicar_todos(productos, movs_por, valor_a_mano=None, conservar_lotes=False, aportado_a_mano=None):
    """
    Recorre por fecha los movimientos de todos los productos a la vez. Las ventas descuentan
    el coste por FIFO (primero lo mas antiguo), como hace Hacienda: el coste de lo vendido
    sale de "aportado" y la diferencia con lo cobrado es plusvalia realizada.

    Un traspaso no es una venta: los lotes que salen del origen (con su coste y su fecha de
    compra) pasan al destino, sin plusvalia. Para la TIR de cada producto cuenta como una
    venta y una compra a su valor de ese dia, que en el total se anulan.

    valor_a_mano(pid, fecha) da el valor anotado de un producto sin cotizacion: con el se
    reparte el coste en los traspasos parciales de productos sin unidades. aportado_a_mano(pid,
    fecha) da lo aportado que anotaste: es el coste que pasa al destino si no hay compras.

    Devuelve, por producto, eventos (fecha, +-unidades, +-aportado) para las series
    diarias y flujos (fecha, importe) para la TIR, en negativo lo que sale de tu cuenta.
    """
    est = {p["id"]: {"eventos": [], "flujos": [], "realizado": 0.0, "comisiones": 0.0, "vendidas": set(),
                     "lotes": [], "traspasos": [], "ajustes": [],
                     # lo realizado, por partes: ventas (cobrado - coste FIFO), dividendos e
                     # intereses, comisiones que no van en una compra; y el coste de lo vendido
                     "ventas": 0.0, "dividendos": 0.0, "gastos": 0.0, "costeVendido": 0.0,
                     # cada venta con las compras de las que salen (para el resumen de la Renta)
                     "ventasDetalle": []}
           for p in productos}
    nombre = {p["id"]: p.get("corto") or p.get("nombre") or p["id"] for p in productos}
    todos = [m for pid, movs in movs_por.items() if pid in est for m in movs
             if m.get("tipo") != "traspaso_entrada"]   # la entrada se hace junto con su salida
    for m in sorted(todos, key=lambda x: (x["fecha"], ORDEN_TIPO.get(x.get("tipo"), 9))):
        pid, f, t = m["producto"], m["fecha"], m.get("tipo")
        e = est[pid]
        u, imp = float(m.get("unidades") or 0), float(m.get("importe") or 0)
        if t == "compra":
            e["lotes"].append([u, imp, id(m), f])
            e["eventos"].append((f, u, imp))
            e["flujos"].append((f, -imp))
            e["comisiones"] += float(m.get("comision") or 0)
        elif t == "venta":
            trozos, quedan = _saca_fifo(e["lotes"], u)
            coste = sum(x[1] for x in trozos)
            e["vendidas"].update(x[2] for x in trozos)
            if quedan > 1e-6:
                aviso(f"{nombre[pid]}: el {f} vendes más unidades de las que tienes. Revisa sus movimientos.")
            e["realizado"] += imp - coste
            e["ventas"] += imp - coste
            e["costeVendido"] += coste
            e["ventasDetalle"].append({"fecha": f, "unidades": u - quedan, "importe": imp, "coste": coste,
                                       "compras": [[x[3], x[0], x[1]] for x in trozos],
                                       "faltan": quedan if quedan > 1e-6 else 0.0})
            e["eventos"].append((f, -(u - quedan), -coste))
            e["flujos"].append((f, imp))
        elif t == "dividendo":
            e["realizado"] += imp
            e["dividendos"] += imp
            e["flujos"].append((f, imp))
        elif t == "comision":
            e["realizado"] -= imp
            e["gastos"] += imp
            e["comisiones"] += imp
            e["flujos"].append((f, -imp))
        elif t == "ajuste":
            # «Tengo X participaciones según mi banco»: se reparten entre los lotes que hay
            # en proporción, sin cambiar lo que pagaste (ni su fecha).
            tenias = sum(l[0] for l in e["lotes"])
            if tenias > 1e-12:
                factor = u / tenias
                for l in e["lotes"]:
                    l[0] *= factor
            elif u > 0:
                e["lotes"].append([u, 0.0, id(m), f])
            e["eventos"].append((f, u - tenias, 0.0))
            e["ajustes"].append({"fecha": f, "antes": r4(tenias), "despues": r4(u)})
        elif t == "traspaso_salida":
            dest = m.get("destino")
            ud = float(m.get("unidadesDestino") or 0)
            tiene_unidades = u > 0 and any(l[0] > 1e-9 for l in e["lotes"])
            if tiene_unidades:
                trozos, quedan = _saca_fifo(e["lotes"], u)
                if quedan > 1e-6:
                    aviso(f"{nombre[pid]}: el {f} traspasas más participaciones de las que tienes. "
                          "Revisa sus movimientos.")
                salen = u - quedan
            else:
                # Sin unidades (un plan anotado a mano): sale todo o la parte que es el importe
                # de lo que valía ese día.
                coste_total = sum(l[1] for l in e["lotes"])
                if coste_total <= 1e-9 and aportado_a_mano:
                    # Sin compras anotadas: el coste es lo aportado que apuntaste en sus valores.
                    ap = aportado_a_mano(pid, f)
                    if ap and ap > 0:
                        e["lotes"] = [[0.0, float(ap), ("aportado", pid), f]]
                        coste_total = float(ap)
                valor = valor_a_mano(pid, f) if valor_a_mano else None
                if m.get("total"):
                    fraccion = 1.0
                elif valor:
                    fraccion = min(1.0, imp / valor)
                else:
                    fraccion = min(1.0, imp / coste_total) if coste_total else 1.0
                trozos, salen = _saca_proporcion(e["lotes"], fraccion), 0.0
            coste = sum(x[1] for x in trozos)
            e["vendidas"].update(x[2] for x in trozos)
            e["eventos"].append((f, -salen, -coste))
            e["flujos"].append((f, imp))
            e["traspasos"].append({"fecha": f, "tipo": "salida", "otro": dest, "importe": r2(imp),
                                   "unidades": r4(salen) if tiene_unidades else None, "coste": r2(coste),
                                   "total": bool(m.get("total")), "estimada": bool(m.get("fechaEstimada"))})
            d_ = est.get(dest)
            if d_ is None:
                aviso(f"{nombre[pid]}: el traspaso del {f} va a un producto que ya no existe o es una cuenta.")
                continue
            # Los lotes llegan al destino con su coste y su fecha de compra (por eso se
            # colocan por fecha entre los que ya tenía) y con las participaciones nuevas.
            base = salen if tiene_unidades and salen > 1e-12 else coste
            for tu, tc, ref, lf in trozos:
                peso = (tu if tiene_unidades and salen > 1e-12 else tc) / base if base else 1.0 / len(trozos)
                nuevo = [ud * peso, tc, ("t", m.get("_tid"), ref), lf]
                i = len(d_["lotes"])
                while i > 0 and d_["lotes"][i - 1][3] > lf:
                    i -= 1
                d_["lotes"].insert(i, nuevo)
            if not trozos and ud:
                d_["lotes"].append([ud, 0.0, ("t", m.get("_tid")), f])
            d_["eventos"].append((f, ud, coste))
            d_["flujos"].append((f, -imp))
            d_["traspasos"].append({"fecha": f, "tipo": "entrada", "otro": pid, "importe": r2(imp),
                                    "unidades": r4(ud) if ud else None, "coste": r2(coste),
                                    "total": bool(m.get("total")), "estimada": bool(m.get("fechaEstimada"))})
    if not conservar_lotes:
        for e in est.values():
            e.pop("lotes")
    return est


def lotes_vivos(cfg, pid, fecha):
    """Lotes que quedan de un producto al final de 'fecha' (FIFO, con los traspasos):
    [[unidades, coste, ref, fecha de compra]], del más antiguo al más nuevo."""
    productos = [p for p in cfg.get("productos", []) if p.get("tipo") not in ("efectivo", "deuda")]
    movs_por = defaultdict(list)
    for m in expande_traspasos(m for m in cfg.get("movimientos", []) if m.get("fecha", "") <= fecha):
        movs_por[m.get("producto")].append(m)
    est = aplicar_todos(productos, movs_por, conservar_lotes=True)
    return [l for l in (est.get(pid) or {}).get("lotes", []) if l[0] > 1e-9 or l[1] > 1e-9]


def interpola(snaps, fecha):
    """Valor en 'fecha' de unos valores anotados [(fecha, valor)], en línea recta entre ellos.
    None si es anterior al primero."""
    previo = None
    for f, v in snaps:
        if f == fecha:
            return v
        if f > fecha:
            if previo is None:
                return None
            f0, v0 = previo
            t = (d(fecha) - d(f0)).days / max((d(f) - d(f0)).days, 1)
            return v0 + (v - v0) * t
        previo = (f, v)
    return previo[1] if previo else None


def snaps_con_traspasos(snaps, traspasos):
    """
    En un producto que se valora a mano, el traspaso cambia su valor ese día aunque no
    hayas anotado nada: sale el importe (o todo, si es total) o entra. Se añade ese punto
    y el del día anterior (para que la línea no baje poco a poco desde el último valor),
    salvo que ya hayas anotado tú el valor de ese día.
    """
    snaps = [list(s) for s in snaps]
    for t in sorted(traspasos, key=lambda t: t["fecha"]):
        f = t["fecha"]
        if any(s[0] == f for s in snaps):
            continue
        antes = interpola([(s[0], s[1]) for s in snaps], f)
        ap_antes = interpola([(s[0], float(s[2])) for s in snaps if s[2] is not None], f)
        coste = t.get("coste") or 0.0
        if t["tipo"] == "salida":
            nuevo = 0.0 if t.get("total") else max(0.0, (antes or 0.0) - (t["importe"] or 0.0))
            ap_nuevo = None if ap_antes is None else (0.0 if t.get("total") else max(0.0, ap_antes - coste))
        else:
            nuevo = (antes or 0.0) + (t["importe"] or 0.0)
            ap_nuevo = None if ap_antes is None else ap_antes + coste
        vispera = (d(f) - dt.timedelta(days=1)).isoformat()
        if antes is not None and not any(s[0] == vispera for s in snaps):
            snaps.append([vispera, round(antes, 2), None if ap_antes is None else round(ap_antes, 2)])
        snaps.append([f, round(nuevo, 2), None if ap_nuevo is None else round(ap_nuevo, 2)])
        snaps.sort(key=lambda s: s[0])
    return snaps


def aplicar_movimientos(p, movs):
    """Los movimientos de un solo producto (ver aplicar_todos)."""
    return aplicar_todos([p], {p["id"]: movs})[p["id"]]


def resumen_dividendos(movimientos, productos, fecha_extracto):
    """
    Dividendos, cupones e intereses cobrados: por año, por producto y en los últimos
    12 meses. La rentabilidad por dividendo se da sobre lo que vale hoy el producto
    y sobre lo que te costó (lo que pusiste y sigue invertido).
    """
    por_id = {p["id"]: p for p in productos}
    hace_un_ano = (fecha_extracto - dt.timedelta(days=365)).isoformat()
    cobros = sorted((m["fecha"], m["producto"], float(m.get("importe") or 0))
                    for m in movimientos if m.get("tipo") == "dividendo" and m.get("producto") in por_id)
    por_ano, por_prod = defaultdict(float), {}
    for f, pid, imp in cobros:
        por_ano[f[:4]] += imp
        x = por_prod.setdefault(pid, {"id": pid, "total": 0.0, "ultimos12": 0.0, "cobros": 0, "ultimo": None})
        x["total"] += imp
        x["cobros"] += 1
        x["ultimo"] = f
        if f > hace_un_ano:
            x["ultimos12"] += imp
    lineas = []
    for x in sorted(por_prod.values(), key=lambda x: -x["total"]):
        p = por_id[x["id"]]
        lineas.append({**x, "total": r2(x["total"]), "ultimos12": r2(x["ultimos12"]),
                       "sobreValor": r4(x["ultimos12"] / p["valor"]) if p.get("valor") else None,
                       "sobreCoste": r4(x["ultimos12"] / p["aportado"]) if p.get("aportado") else None})
    ultimos12 = sum(x["ultimos12"] for x in por_prod.values())
    valor_pagadores = sum(por_id[x["id"]].get("valor") or 0 for x in por_prod.values() if x["ultimos12"])
    anos = [str(a) for a in range(int(min(por_ano)), fecha_extracto.year + 1)] if por_ano else []
    return {"total": r2(sum(por_ano.values())), "ultimos12": r2(ultimos12),
            "rentabilidad": r4(ultimos12 / valor_pagadores) if valor_pagadores else None,
            "porAno": [[a, r2(por_ano.get(a, 0.0))] for a in anos],
            "porProducto": lineas,
            "ultimos": [{"fecha": f, "producto": pid, "importe": r2(imp)} for f, pid, imp in reversed(cobros[-12:])]}


# Monedas en las que se puede VER el panel (todo se calcula en euros).
MONEDAS_VISTA = {"USD": "Dólares", "GBP": "Libras", "CHF": "Francos suizos", "MXN": "Pesos mexicanos",
                 "ARS": "Pesos argentinos", "CLP": "Pesos chilenos", "COP": "Pesos colombianos"}


def tipos_de_cambio(series):
    """Cuántas unidades de cada moneda da 1 euro según el último cambio conocido."""
    out = {}
    for codigo, nombre in MONEDAS_VISTA.items():
        sim = simbolo_fx(codigo)[0]
        s = series.get(sim) or descargar_serie(sim, anos=1)
        validos = {k: v for k, v in s.items() if v}
        if validos:
            fecha = max(validos)
            out[codigo] = {"nombre": nombre, "porEuro": round(1 / validos[fecha], 6), "fecha": fecha}
    return out


def descarga_series(productos_cfg, series=None):
    """Descarga (o lee de la cache) las series que necesitan esos productos.
    Devuelve el diccionario de series que usa precio_eur()."""
    series = {} if series is None else series

    def pide(clave, fn, *args):
        if clave and clave not in series:
            series[clave] = fn(*args)

    def pide_fx(moneda):
        sim = simbolo_fx(moneda)[0]
        pide(sim, descargar_serie, sim)

    for p in productos_cfg:
        f, cod = p.get("fuente"), p.get("codigo")
        if cod and f == "yahoo":
            pide(cod, descargar_serie, cod)
            pide_fx(p.get("moneda"))
        elif cod and f == "morningstar" and "MS:" + cod not in series:
            ms = descargar_morningstar(cod)
            # Los codigos 0P... de Morningstar existen tambien en Yahoo con ".F": sirven
            # para cubrir huecos y, donde coinciden, dan un decimal mas.
            yh = descargar_serie(cod + ".F") if cod.startswith("0P") else {}
            series["MS:" + cod] = combinar_vl(ms, yh, p.get("corto", cod)) if ms else yh
        elif cod and f == "coingecko":
            pide("CG:" + cod, descargar_coingecko, cod)
        if p.get("respaldo"):
            pide(p["respaldo"], descargar_serie, p["respaldo"])
            pide_fx(p.get("respaldoMoneda"))
        if p.get("vivo"):
            pide("CG:" + p["vivo"], descargar_coingecko, p["vivo"])
    return series


def serie_producto(p, carpeta, fresca=False):
    """Precio diario en euros de un producto suelto. Usa los precios guardados en la
    cache (descargando solo lo que falte) o, con fresca=True, los baja de nuevo."""
    global CACHE, SIN_RED, SOLO_FALTAN
    CACHE, SIN_RED, SOLO_FALTAN = os.path.join(carpeta, "cache"), False, not fresca
    _COTIZACIONES.pop(p.get("id"), None)
    p = dict(p, id=p.get("id") or "_suelto")
    s = precio_eur(p, descarga_series([p]))
    _COTIZACIONES.pop(p["id"], None)
    return s


def serie_cambio(moneda, carpeta, fresca=False):
    """Cambio diario de 'moneda' a euros ({} si es EUR), con cache (o recién bajado con fresca=True)."""
    global CACHE, SIN_RED, SOLO_FALTAN
    CACHE, SIN_RED, SOLO_FALTAN = os.path.join(carpeta, "cache"), False, not fresca
    sim = simbolo_fx(moneda)[0]
    return descargar_serie(sim) if sim else {}


# ---------------------------------------------------------------- construccion

def fifo_cartera(cfg, productos_cfg=None):
    """FIFO de todos los productos a la vez (los traspasos pasan lotes de uno a otro).
    Devuelve (resultado de aplicar_todos, movimientos por producto, valores anotados por producto)."""
    if productos_cfg is None:
        productos_cfg = cfg.get("productos", [])
    movs_por, vals_por = defaultdict(list), defaultdict(list)
    for m in expande_traspasos(cfg.get("movimientos", [])):
        movs_por[m.get("producto")].append(m)
    for v in cfg.get("valoraciones", []):
        vals_por[v.get("producto")].append(v)

    def valor_a_mano(pid, fecha):
        snaps = [(v["fecha"], float(v["valor"])) for v in sorted(vals_por.get(pid, []), key=lambda v: v["fecha"])]
        return interpola(snaps, fecha)

    def aportado_a_mano(pid, fecha):
        snaps = [(v["fecha"], float(v["aportado"])) for v in sorted(vals_por.get(pid, []), key=lambda v: v["fecha"])
                 if v.get("aportado") is not None]
        return interpola(snaps, fecha)
    con_movs = [p for p in productos_cfg if p.get("tipo") not in ("efectivo", "deuda")]
    return aplicar_todos(con_movs, movs_por, valor_a_mano, aportado_a_mano=aportado_a_mano), movs_por, vals_por


def construir(cfg, carpeta, descargar=True, cache=None, historico=True):
    """
    Calcula todo lo que pinta el panel a partir de la cartera (productos, movimientos
    y valoraciones) y devuelve el diccionario DATOS. Con descargar=False no sale a
    internet: recalcula con los precios guardados en la cache. Con descargar="faltan"
    solo descarga los precios de productos nuevos.
    """
    global CACHE, SIN_RED, SOLO_FALTAN
    CACHE = cache or os.path.join(carpeta, "cache")
    SIN_RED = not descargar
    SOLO_FALTAN = descargar == "faltan"
    AVISOS.clear()
    _COTIZACIONES.clear()

    productos_cfg = [dict(p) for p in cfg.get("productos", [])]
    for p in productos_cfg:
        limpia_textos(p)
        p.setdefault("fuente", "manual")
        p.setdefault("corto", (p.get("nombre") or p["id"])[:24])

    print("\n=== 1. Precios ===" if descargar is True else "\n=== 1. Precios guardados ===")
    series = descarga_series(productos_cfg)
    if cfg.get("movimientos"):
        for sim in {s for r in REFERENCIAS.values() for s, _ in r["piezas"]}:
            if sim not in series:
                series[sim] = descargar_serie(sim)

    movimientos_de, movs_por, vals_por = fifo_cartera(cfg, productos_cfg)

    # Fecha de valoracion: el ultimo precio o valor anotado que haya, sin pasar de hoy.
    ultimas = [v["fecha"] for v in cfg.get("valoraciones", [])]
    # Un traspaso entre productos a mano cambia su valor ese día aunque no se haya anotado nada.
    ultimas += [m["fecha"] for m in cfg.get("movimientos", []) if m.get("tipo") == "traspaso"]
    for p in productos_cfg:
        s = precio_eur(p, series) if p["fuente"] != "manual" else {}
        if s and movs_por.get(p["id"]):
            ultimas.append(max(s))
    fecha_extracto = min(d(max(ultimas)), hoy()) if ultimas else hoy()
    print(f"  Datos valorados a {fecha_extracto}")

    # ---- primera pasada: movimientos, precio actual y fechas ----
    productos, otros, pasivos, primera = [], [], [], None

    for p in productos_cfg:
        clave = p.get("tipo") if p.get("tipo") in TIPOS else "otro"
        p["tipoClave"] = clave
        p["tipo"] = p.get("tipoDetalle") or TIPOS[clave]
        p.setdefault("clase", CLASE_DEFECTO[clave])
        p["fuentePrecio"] = FUENTES.get(p["fuente"], p["fuente"])
        etq = ETIQUETAS.get(clave, ("Precio", "Unidades", "El precio"))
        if "ETP" in (p.get("tipoDetalle") or "").upper():
            etq = ("Precio del ETP", "Títulos", "El precio del ETP")
        p["etqPrecio"], p["etqUnidades"], p["etqVentanas"] = etq
        p["fuenteTexto"] = " · ".join(x for x in (
            p["fuentePrecio"], p.get("codigo"),
            f"convertido de {p.get('moneda')}" if p["fuente"] == "yahoo" and
            (p.get("moneda") or "EUR").upper() != "EUR" else None) if x)
        p["aportaciones"] = []
        movs = movs_por.get(p["id"], [])
        snaps = [[v["fecha"], float(v["valor"]), v.get("aportado")]
                 for v in sorted(vals_por.get(p["id"], []), key=lambda v: v["fecha"])]
        fechas_p = [m["fecha"] for m in movs] + [s[0] for s in snaps]

        if clave in ("efectivo", "deuda"):
            if not snaps:
                aviso(f"{p['corto']}: todavía no tiene ningún saldo anotado.")
                continue
            p["snapshots"] = snaps
            (otros if clave == "efectivo" else pasivos).append(p)
            primera = d(snaps[0][0]) if primera is None else min(primera, d(snaps[0][0]))
            continue

        mv = movimientos_de[p["id"]]
        nombres = {x["id"]: x.get("corto") or x.get("nombre") for x in productos_cfg}
        p["traspasos"] = [{**t, "otroNombre": nombres.get(t["otro"], t["otro"])} for t in mv["traspasos"]]
        p["ajustes"] = mv["ajustes"]
        if mv["traspasos"]:
            snaps = snaps_con_traspasos(snaps, mv["traspasos"])
        p["realizado"] = round(mv["realizado"], 2)
        p["cobros"] = {k: round(mv[k], 2) for k in ("ventas", "dividendos", "gastos")}
        p["costeVendido"] = round(mv["costeVendido"], 2)
        p["_mv"] = mv
        cotiza = p["fuente"] != "manual"
        serie = precio_eur(p, series) if cotiza else {}
        if cotiza:
            # Sin precio de mercado en las fechas de tus operaciones (un ticker sin histórico, o
            # con histórico solo desde hace poco): ahí se usa el precio al que compraste o vendiste.
            ops = precios_de_operaciones(movs)
            inicio = min(serie) if serie else None
            huecos = {f: v for f, v in ops.items() if inicio is None or f < inicio}
            if huecos and (serie or not snaps):
                if serie:
                    aviso(f"{p['corto']}: {p['fuentePrecio']} no tiene precios antes del {fmt_fecha_es(inicio)}; "
                          "hasta entonces lo valoro al precio de tus compras y ventas. Comprueba su código si no cuadra.")
                else:
                    aviso(f"{p['corto']}: no encuentro su precio en {p['fuentePrecio']}; lo valoro al precio de tus "
                          "compras y ventas. Comprueba el identificador o anota su valor a mano.")
                serie = {**huecos, **serie}
                _COTIZACIONES[p["id"]] = serie
                p["preciosDeOperaciones"] = True
        if cotiza and not serie:
            if snaps:
                aviso(f"{p['corto']}: no encuentro su precio en {p['fuentePrecio']}; "
                      "uso los valores que has anotado a mano.")
                cotiza = False
            else:
                aviso(f"{p['corto']}: no encuentro su precio en {p['fuentePrecio']}. "
                      "Comprueba el identificador o mete su valor a mano.")
                continue

        if cotiza:
            if not mv["eventos"]:
                aviso(f"{p['corto']}: no tiene compras anotadas, lo dejo fuera.")
                continue
            # El panel distingue fondos (valor liquidativo) del resto (cotizacion).
            p["origen"] = "csv" if clave in ("fondo", "pension") else "ordenes"
            nav_hoy = valor_en(serie, fecha_extracto, margen=3650) or 0.0
            p["nav"] = nav_hoy
            p["navFecha"] = fecha_en(serie, fecha_extracto, 3650)
            if p["navFecha"] and (fecha_extracto - d(p["navFecha"])).days > 7:
                aviso(f"{p['corto']}: el último precio que tengo es del {p['navFecha']}.")
            for m in sorted(movs, key=lambda x: x["fecha"]):
                if m.get("tipo") != "compra":
                    continue
                u, imp = float(m.get("unidades") or 0), float(m.get("importe") or 0)
                com = float(m.get("comision") or 0)
                p["aportaciones"].append({
                    "fecha": m["fecha"], "importe": round(imp, 2),
                    "participaciones": round(u, 6), "precio": r4((imp - com) / u) if u else None,
                    "comision": com, "tipoOrden": sin_html(m.get("nota")) or None,
                    # De una compra ya vendida (toda o en parte) no se enseña "cuánto vale hoy".
                    "valor": None if id(m) in mv["vendidas"] else round(u * nav_hoy, 2),
                })
        else:
            p["origen"] = "manual"
            if not snaps:
                aviso(f"{p['corto']}: todavía no tiene ningún valor anotado.")
                continue
            p["snapshots"] = snaps
            for m in movs:
                if m.get("tipo") == "compra":
                    p["aportaciones"].append({"fecha": m["fecha"], "importe": round(float(m.get("importe") or 0), 2)})

        pf = d(min(fechas_p))
        primera = pf if primera is None else min(primera, pf)
        productos.append(p)

    if not (productos or otros or pasivos):
        print("\nLa cartera está vacía: todavía no hay nada que calcular.")
        return None

    if primera is None or primera > fecha_extracto:
        primera = fecha_extracto
    eje = rango_fechas(primera, fecha_extracto)
    eje_iso = [f.isoformat() for f in eje]
    n = len(eje)
    print(f"\n=== 2. Serie diaria: {eje_iso[0]} -> {eje_iso[-1]} ({n} dias) ===")

    # ---- segunda pasada: series de valor diarias ----
    for p in productos:
        origen = p.get("origen", "manual")
        p["slotColor"] = PALETA.get(p.get("slot", 1), PALETA[1])

        if origen in ("csv", "ordenes"):
            nav_diario = rellenar(precio_eur(p, series), eje)
            part_acum, ap_acum = [0.0] * n, [0.0] * n
            idx = {f: i for i, f in enumerate(eje_iso)}
            for f, du, dap in p["_mv"]["eventos"]:
                i = idx.get(f)
                if i is None:
                    i = 0 if f < eje_iso[0] else n - 1
                part_acum[i] += du
                ap_acum[i] += dap
            for i in range(1, n):
                part_acum[i] += part_acum[i - 1]
                ap_acum[i] += ap_acum[i - 1]

            ultimo = None
            serie_valor = []
            for i in range(n):
                nv = nav_diario[i] or ultimo
                ultimo = nv or ultimo
                serie_valor.append(round(part_acum[i] * nv, 2) if nv else None)

            # Antes de la primera aportacion el producto no existia: en vez de
            # una linea plana en cero, no dibujamos nada.
            i0 = next((i for i, v in enumerate(part_acum) if v > 1e-9), 0)
            serie_ap = [round(x, 2) for x in ap_acum]
            for i in range(i0):
                serie_valor[i] = None
                serie_ap[i] = None
            p["serie"] = serie_valor
            p["serieAportado"] = serie_ap
            p["navSerie"] = [r4(v) for v in nav_diario]
            p["participaciones"] = round(part_acum[-1], 6)
            p["valor"] = serie_valor[-1] or 0.0
            p["aportado"] = round(ap_acum[-1], 2)
            p["desde"] = min(e[0] for e in p["_mv"]["eventos"])
            if origen == "ordenes":
                p["titulos"] = round(part_acum[-1], 4)
                p["precioMedio"] = r4(p["aportado"] / part_acum[-1]) if part_acum[-1] else None
                p["precioActual"] = r4(p["nav"])

        else:  # manual: interpola entre snapshots
            snaps = [(d(s[0]), float(s[1]), (s[2] if len(s) > 2 else None))
                     for s in p["snapshots"]]
            serie, serie_ap = [], []
            for f in eje:
                if f < snaps[0][0]:
                    serie.append(None)
                    serie_ap.append(None)
                    continue
                v = ap = None
                for j in range(len(snaps)):
                    if j == len(snaps) - 1 or f <= snaps[j + 1][0]:
                        if j == len(snaps) - 1 or f == snaps[j][0]:
                            v, ap = snaps[j][1], snaps[j][2]
                        else:
                            f0, v0, a0 = snaps[j]
                            f1, v1, a1 = snaps[j + 1]
                            t = (f - f0).days / max((f1 - f0).days, 1)
                            v = v0 + (v1 - v0) * t
                            ap = (a0 + (a1 - a0) * t) if (a0 is not None and a1 is not None) else a0
                        break
                serie.append(r2(v))
                serie_ap.append(r2(ap))
            p["serie"] = serie
            p["serieAportado"] = serie_ap
            p["navSerie"] = None
            p["valor"] = snaps[-1][1]
            p["aportado"] = snaps[-1][2]
            p["desde"] = snaps[0][0].isoformat()
            # Si tiene aportaciones anotadas como movimientos, el aportado sale de ahi. Si no
            # tiene compras pero sí lo aportado anotado en sus valores, manda lo anotado (los
            # traspasos ya lo ajustan en snaps_con_traspasos).
            eventos = p["_mv"]["eventos"]
            sin_compras = not any(m.get("tipo") == "compra" for m in movs)
            if eventos and not (sin_compras and any(s[2] is not None for s in snaps)):
                acum, serie_ap = 0.0, []
                pend = sorted(eventos)
                for f in eje_iso:
                    while pend and pend[0][0] <= f:
                        acum += pend.pop(0)[2]
                    serie_ap.append(r2(acum))
                p["serieAportado"] = serie_ap
                p["aportado"] = round(acum + sum(e[2] for e in pend), 2)
                p["desde"] = min(p["desde"], min(e[0] for e in eventos))
            for f, v, a in snaps:
                p["aportaciones"].append({"fecha": f.isoformat(), "importe": None,
                                          "valor": v, "tipo": "snapshot"})

    # ---- qué hay dentro de cada producto: países y sectores (Morningstar) ----
    from . import exposicion   # aquí y no arriba: exposicion usa utilidades de este módulo
    pendientes = [p for p in productos if not p.get("exposicion") and exposicion.clave(p)]
    if pendientes:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=6) as ex:
            # Solo al actualizar precios se sale a internet (tarda unos segundos por fondo);
            # al guardar un cambio, lo que haya en la cache (el servidor completa lo que falte aparte).
            repartos = list(ex.map(lambda p: exposicion.de_producto(p, CACHE, red=descargar is True), pendientes))
        for p, r in zip(pendientes, repartos):
            if r:
                p["exposicion"] = r

    # ---- metricas por producto ----
    print("\n=== 4. Metricas ===")
    flujos_globales, valor_conocido, valor_tir = [], 0.0, 0.0

    for p in productos:
        val, ap = p.get("valor") or 0.0, p.get("aportado")
        p["valor"] = round(val, 2)
        flujos = [(d(f), v) for f, v in p["_mv"]["flujos"]]
        p["flujos"] = [[f, round(v, 2)] for f, v in p["_mv"]["flujos"]]   # para la TIR del panel
        if flujos:
            flujos_globales.extend(flujos)
            valor_tir += val
        if ap is not None and ap > 0:
            p["aportado"] = round(ap, 2)
            p["plusvalia"] = round(val - ap, 2)
            p["rentabilidad"] = r4((val - ap) / ap)
            p["tir"] = r4(xirr(flujos + [(fecha_extracto, val)])) if flujos else None
            valor_conocido += val
        else:
            p["aportado"] = None
            p["plusvalia"] = None
            p["rentabilidad"] = None
            p["tir"] = None
        # Ganancia total: lo que ganas con lo que aún tienes (precio) más lo ya cobrado en
        # ventas y dividendos, menos comisiones. El % es sobre todo lo que llegaste a invertir
        # en él (lo que tienes más lo que vendiste, a su coste).
        base = (p["aportado"] or 0) + p["costeVendido"]
        if p["plusvalia"] is not None or p["costeVendido"] > 0:
            p["gananciaTotal"] = round((p["plusvalia"] or 0) + p["realizado"], 2)
            p["rentabilidadTotal"] = r4(p["gananciaTotal"] / base) if base > 0 else None
        else:
            p["gananciaTotal"] = p["rentabilidadTotal"] = None
        if p["tipoClave"] == "inmueble":
            p["alquiler"] = alquiler(movs_por.get(p["id"], []), fecha_extracto)

        # rendimiento del subyacente en varias ventanas
        if p.get("navSerie"):
            nav = p["navSerie"]
            ventanas = {"1m": 30, "3m": 91, "6m": 182, "1a": 365}
            p["ventanas"] = {}
            ult = next((v for v in reversed(nav) if v), None)
            for k, dias in ventanas.items():
                i = n - 1 - dias
                base = next((nav[j] for j in range(max(i, 0), n) if nav[j]), None) if i >= 0 else None
                p["ventanas"][k] = r4(ult / base - 1) if (base and ult) else None
            ini_ano = f"{fecha_extracto.year}-01-01"
            iy = next((i for i, f in enumerate(eje_iso) if f >= ini_ano), None)
            base = next((nav[j] for j in range(iy, n) if nav[j]), None) if iy is not None else None
            p["ventanas"]["ytd"] = r4(ult / base - 1) if (base and ult) else None

        etq = p["corto"]
        rr = f"{p['rentabilidad']*100:+6.2f}%" if p.get("rentabilidad") is not None else "    n/d"
        tt = f"{p['tir']*100:+6.2f}%" if p.get("tir") is not None else "    n/d"
        print(f"  {etq:22s} valor {p['valor']:10,.2f}  aportado "
              f"{(p['aportado'] or 0):10,.2f}  rent {rr}  TIR {tt}")

    # ---- totales ----

    def suma_manual(lista, signo):
        total = 0.0
        series_extra = []
        for it in lista:
            snaps = sorted(it.get("snapshots", []), key=lambda s: s[0])
            if not snaps:
                continue
            total += signo * float(snaps[-1][1])
            serie = []
            for f in eje:
                v = None
                for j in range(len(snaps)):
                    if f >= d(snaps[j][0]):
                        v = float(snaps[j][1])
                serie.append(r2(signo * v) if v is not None else None)
            series_extra.append({**it, "serie": serie,
                                 "serieAportado": [None] * len(eje),
                                 "aportaciones": [],
                                 "valor": round(signo * float(snaps[-1][1]), 2),
                                 "aportado": None, "plusvalia": None,
                                 "rentabilidad": None, "tir": None,
                                 "desde": snaps[0][0],
                                 "slotColor": PALETA.get(it.get("slot", 8), PALETA[8])})
        return total, series_extra

    tot_otros, ser_otros = suma_manual(otros, 1)
    # Los intereses de las cuentas (movimientos «dividendo», menos sus gastos) también son dinero ya cobrado.
    for e in ser_otros:
        c = alquiler(movs_por.get(e["id"], []), fecha_extracto)
        if c:
            e["intereses"] = c
            e["realizado"] = round(c["cobrado"] - c["gastos"], 2)
    tot_pasivos, ser_pasivos = suma_manual(pasivos, -1)

    serie_total, serie_ap_total = [], []
    for i in range(n):
        s = sum((p["serie"][i] or 0) for p in productos)
        for e in ser_otros + ser_pasivos:
            s += e["serie"][i] or 0
        serie_total.append(round(s, 2))
        serie_ap_total.append(round(sum((p["serieAportado"][i] or 0) for p in productos), 2))

    patrimonio = round(serie_total[-1], 2)
    aportado_total = round(sum(p["aportado"] or 0 for p in productos), 2)
    plusvalia_total = round(valor_conocido - aportado_total, 2)
    flujos_globales.append((fecha_extracto, valor_tir))
    tir_total = r4(xirr(flujos_globales))
    realizado_total = round(sum(p.get("realizado") or 0 for p in productos + ser_otros), 2)

    for p in productos + ser_otros + ser_pasivos:
        p["peso"] = r4(p["valor"] / patrimonio) if patrimonio else 0

    # agregados
    def agrupar(campo):
        acc = defaultdict(float)
        slot = {}
        for p in productos:
            k = p.get(campo) or "Otros"
            acc[k] += p["valor"]
            slot.setdefault(k, p.get("slot", 8))
        for e in ser_otros:
            k = e.get(campo) or "Otros"
            acc[k] += e["valor"]
            slot.setdefault(k, e.get("slot", 8))
        return [{"nombre": k, "valor": round(v, 2),
                 "peso": r4(v / patrimonio) if patrimonio else 0,
                 "color": PALETA.get(slot[k], PALETA[8])}
                for k, v in sorted(acc.items(), key=lambda x: -x[1])]

    # aportaciones mensuales
    meses = sorted({a["fecha"][:7] for p in productos for a in p["aportaciones"]
                    if a.get("importe")})
    por_producto = {}
    for p in productos:
        acc = defaultdict(float)
        for a in p["aportaciones"]:
            if a.get("importe"):
                acc[a["fecha"][:7]] += a["importe"]
        por_producto[p["id"]] = [round(acc.get(m, 0), 2) for m in meses]
    total_mes = [round(sum(por_producto[p["id"]][i] for p in productos), 2)
                 for i in range(len(meses))]

    # hitos
    hitos = []
    for h in cfg.get("hitos", []):
        idx = next((i for i, v in enumerate(serie_total) if v >= h), None)
        hitos.append({"importe": h, "fecha": eje_iso[idx] if idx is not None else None})

    # racha y ritmo
    racha = 0
    if meses:
        ref = dt.date(int(meses[-1][:4]), int(meses[-1][5:7]), 1)
        vistos = set(meses)
        while True:
            k = f"{ref.year:04d}-{ref.month:02d}"
            if k in vistos:
                racha += 1
                ref = (ref.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
            else:
                break
    ult12 = total_mes[-12:] if len(total_mes) >= 12 else total_mes
    ritmo = round(sum(ult12) / max(len(ult12), 1), 2)

    # maxima caida del patrimonio
    pico, dd_max, dd_fecha = 0.0, 0.0, None
    for i, v in enumerate(serie_total):
        pico = max(pico, v)
        if pico > 0:
            caida = v / pico - 1
            if caida < dd_max:
                dd_max, dd_fecha = caida, eje_iso[i]


    # ================================================================
    #  Analitica ampliada: tramos de aportacion, precio medio,
    #  comisiones, rentabilidad por ano, resumen mensual y comparador.
    # ================================================================
    todos_p = productos + ser_otros + ser_pasivos
    inv = [p for p in productos if p.get("origen") in ("csv", "ordenes")]
    idx_fecha = {f: i for i, f in enumerate(eje_iso)}

    # --- tramos de aportacion, con la estadistica de CADA producto ---
    for p in productos:
        imp = sorted(x["importe"] for x in p["aportaciones"] if x.get("importe"))
        if not imp:
            continue
        q1 = imp[len(imp) // 3] if len(imp) >= 6 else None
        q2 = imp[2 * len(imp) // 3] if len(imp) >= 6 else None
        p["tramos"] = {"p33": r2(q1), "p67": r2(q2), "min": r2(imp[0]),
                       "max": r2(imp[-1]), "mediana": r2(imp[len(imp) // 2]),
                       "n": len(imp)}
        for x in p["aportaciones"]:
            if x.get("importe") is None:
                continue
            if q1 is None:
                x["nivel"] = 1
            else:
                # El tramo alto es ESTRICTAMENTE mayor que el p67. Si no, cuando
                # repites mucho un mismo importe (tus 900 EUR al World) ese importe
                # se cuela en "extraordinaria" y el tramo normal se queda vacio.
                x["nivel"] = 0 if x["importe"] < q1 else (2 if x["importe"] > q2 else 1)
        if p.get("origen") == "csv" and p.get("participaciones"):
            p["precioMedio"] = r4(p["aportado"] / p["participaciones"])

    # --- comisiones ---
    lineas_com, base_com = [], 0.0
    for p in productos:
        if p.get("ter") and p.get("valor"):
            lineas_com.append({"id": p["id"], "nombre": p["corto"], "ter": p["ter"],
                               "valor": p["valor"], "anual": r2(p["valor"] * p["ter"]),
                               "color": p["slotColor"]})
            base_com += p["valor"]
    total_com = round(sum(c["anual"] for c in lineas_com), 2)
    pagadas = round(sum(p["_mv"]["comisiones"] for p in productos), 2)
    comisiones = {"lineas": lineas_com, "anual": total_com,
                  "base": round(base_com, 2),
                  "terPonderado": r4(total_com / base_com) if base_com else None,
                  "compraventaPagada": pagadas}

    # --- flujos diarios ---
    flujo_dia = [0.0] * n
    flujo_prod = {p["id"]: [0.0] * n for p in productos}
    flujo_inv = [0.0] * n
    ids_inv = {p["id"] for p in inv}
    for p in productos:
        # Dinero que entra en el producto: compras y comisiones suman; ventas y
        # dividendos cobrados restan (es dinero que sale de la cartera).
        for f, v in p["_mv"]["flujos"]:
            i = idx_fecha.get(f)
            if i is None:
                continue
            flujo_dia[i] -= v
            flujo_prod[p["id"]][i] -= v
            if p["id"] in ids_inv:
                flujo_inv[i] -= v

    serie_inv = [0.0] * n
    for p in inv:
        for i in range(n):
            v = p["serie"][i]
            if v is not None:
                serie_inv[i] += v

    def indice_twr(valores, flujos):
        """
        Rentabilidad encadenada, limpia del efecto de cuando entra el dinero.
        El dia que empieza la posicion cuenta la diferencia entre lo que pagaste
        (comisiones incluidas) y el cierre de ese dia.
        """
        out, ant, nivel = [], None, 100.0
        for i in range(len(valores)):
            v = valores[i]
            f = flujos[i] if i < len(flujos) else 0.0
            if v is None:
                out.append(nivel)
                continue
            if ant is None or ant <= 1:
                if f > 0:
                    nivel *= max(v / f, 0.05)
            else:
                nivel *= 1.0 + max((v - f) / ant - 1.0, -0.95)
            out.append(nivel)
            ant = v
        return out

    idx_cartera = indice_twr(serie_inv, flujo_inv)

    def indice_pesos(pesos):
        """Compra y mantener con pesos fijos, base 100."""
        tot = sum(pesos.values())
        if not tot:
            return None
        navs = {}
        for pid in pesos:
            p = next((x for x in productos if x["id"] == pid), None)
            if not p or not p.get("navSerie"):
                return None
            navs[pid] = p["navSerie"]
        i0 = next((i for i in range(n) if all(navs[k][i] for k in navs)), None)
        if i0 is None:
            return None
        out = [None] * n
        ult = {k: navs[k][i0] for k in navs}
        for i in range(i0, n):
            s = 0.0
            for k, peso in pesos.items():
                v = navs[k][i] or ult[k]
                ult[k] = v
                s += (peso / tot) * v / navs[k][i0]
            out[i] = round(s * 100, 4)
        return out

    def metricas_indice(idx, rf=None):
        pts = [i for i, v in enumerate(idx) if v]
        if len(pts) < 30:
            return None
        i0, i1 = pts[0], pts[-1]
        anos = (d(eje_iso[i1]) - d(eje_iso[i0])).days / 365.25
        rent = idx[i1] / idx[i0] - 1
        cagr = (idx[i1] / idx[i0]) ** (1 / anos) - 1 if anos > 0.15 else None
        rs, ant = [], None
        for i in range(i0, i1 + 1):
            if d(eje_iso[i]).weekday() >= 5 or not idx[i]:
                continue
            if ant:
                rs.append(idx[i] / ant - 1)
            ant = idx[i]
        vol = None
        if len(rs) > 20:
            mu = sum(rs) / len(rs)
            vol = math.sqrt(sum((x - mu) ** 2 for x in rs) / (len(rs) - 1)) * math.sqrt(252)
        pico, dd, ddf = 0.0, 0.0, None
        for i in range(i0, i1 + 1):
            if not idx[i]:
                continue
            pico = max(pico, idx[i])
            c = idx[i] / pico - 1
            if c < dd:
                dd, ddf = c, eje_iso[i]
        return {"rentTotal": r4(rent), "cagr": r4(cagr), "vol": r4(vol),
                "sharpe": r4((cagr - rf) / vol) if (cagr is not None and vol and rf is not None) else None,
                "maxDD": r4(dd), "maxDDFecha": ddf, "desde": eje_iso[i0], "hasta": eje_iso[i1]}

    # El tipo sin riesgo sale de tu propio fondo monetario, si tienes uno, no de una
    # tabla externa. Sin monetario, el comparador no calcula el ratio de Sharpe.
    sin_riesgo = next((p["id"] for p in productos if p.get("navSerie") and "monetari" in
                       " ".join(str(p.get(k, "")) for k in ("tipo", "clase", "nombre")).lower()), None)
    idx_mon = indice_pesos({sin_riesgo: 1}) if sin_riesgo else None
    m_mon = metricas_indice(idx_mon) if idx_mon else None
    rf = m_mon["cagr"] if m_mon else None

    comparador = []
    for c in cfg.get("comparador", []):
        idx = idx_cartera if c.get("real") else indice_pesos(c.get("pesos", {}))
        if not idx:
            aviso("Comparador: no puedo construir '%s'." % c.get("nombre"))
            continue
        met = metricas_indice(idx, rf)
        if not met:
            continue
        comparador.append({"id": c["id"], "nombre": sin_html(c["nombre"]), "real": bool(c.get("real")),
                           "pesos": c.get("pesos"), "indice": [r2(v) for v in idx],
                           "metricas": met})

    # --- rentabilidad por ano natural ---
    # TU rentabilidad en cada producto y ano: la de tu posicion, encadenada desde el
    # precio real que pagaste (con comisiones) y sin que cuente cuando metiste cada
    # euro. En un ano completo coincide con la publicada del fondo; el primer ano
    # cuenta desde tu primera compra.
    idx_prod = {p["id"]: indice_twr(p["serie"], flujo_prod[p["id"]]) for p in inv}
    anos_nat = sorted({f[:4] for f in eje_iso})
    rent_anual = {"anos": anos_nat, "cartera": [], "parcial": [],
                  "porProducto": {p["id"]: [] for p in inv},
                  "desde": {p["id"]: [] for p in inv},
                  "vendido": {p["id"]: [] for p in inv}}
    primer_dia = {p["id"]: next((i for i, v in enumerate(p["serie"]) if v is not None), None)
                  for p in inv}
    for ano in anos_nat:
        ini = next(i for i, f in enumerate(eje_iso) if f[:4] == ano)
        fin = max(i for i, f in enumerate(eje_iso) if f[:4] == ano)
        base_ano = ini - 1 if ini > 0 else None
        b = idx_cartera[base_ano] if base_ano is not None else 100.0
        rent_anual["cartera"].append(r4(idx_cartera[fin] / b - 1) if b else None)
        rent_anual["parcial"].append(ano in (anos_nat[0], anos_nat[-1]))
        for p in inv:
            i0 = primer_dia[p["id"]]
            if i0 is None or i0 > fin:
                rent_anual["porProducto"][p["id"]].append(None)
                rent_anual["desde"][p["id"]].append(None)
                rent_anual["vendido"][p["id"]].append(False)
                continue
            # Todo el año sin nada (ya vendido antes) y sin movimientos: no hay rentabilidad que dar.
            sin_nada = all(not (p["serie"][i] or 0) for i in range(ini, fin + 1)) \
                and not any(flujo_prod[p["id"]][i] for i in range(ini, fin + 1))
            if sin_nada and i0 < ini:
                rent_anual["porProducto"][p["id"]].append(None)
                rent_anual["desde"][p["id"]].append(None)
                rent_anual["vendido"][p["id"]].append(True)
                continue
            rent_anual["vendido"][p["id"]].append(False)
            ix = idx_prod[p["id"]]
            empieza_aqui = base_ano is None or i0 > base_ano
            bb = 100.0 if empieza_aqui else ix[base_ano]
            rent_anual["porProducto"][p["id"]].append(r4(ix[fin] / bb - 1))
            rent_anual["desde"][p["id"]].append(eje_iso[i0] if empieza_aqui else None)

    # --- resumen mes a mes ---
    meses_nat = sorted({f[:7] for f in eje_iso})
    resumen_mensual = []
    for mes in meses_nat:
        idxs = [i for i, f in enumerate(eje_iso) if f[:7] == mes]
        i_ini, i_fin, ant = idxs[0], idxs[-1], idxs[0] - 1

        def suma(i):
            return sum((p["serie"][i] or 0) for p in todos_p) if i >= 0 else 0.0

        v0, v1 = suma(ant), suma(i_fin)
        ap = sum(flujo_dia[i] for i in idxs)
        nuevos, detalle = 0.0, {}
        for p in todos_p:
            s = p["serie"]
            pv0 = (s[ant] or 0) if ant >= 0 else 0.0
            pv1 = s[i_fin] or 0.0
            pap = sum(flujo_prod.get(p["id"], [0.0] * n)[i] for i in idxs)
            # Un producto sin coste registrado (efectivo, pensiones) que aparece
            # a mitad de mes no es "el mercado subiendo": es que entra al panel.
            estrena = (ant < 0 or s[ant] is None) and s[i_fin] is not None
            pnuevo = pv1 if (estrena and p.get("aportado") is None) else 0.0
            nuevos += pnuevo
            if pv1 or pv0 or pap:
                detalle[p["id"]] = {"inicio": r2(pv0), "fin": r2(pv1), "aportado": r2(pap),
                                    "nuevo": r2(pnuevo), "mercado": r2(pv1 - pv0 - pap - pnuevo)}
        b = idx_cartera[ant] if ant >= 0 else idx_cartera[i_ini]
        resumen_mensual.append({
            "mes": mes, "inicio": r2(v0), "fin": r2(v1), "aportado": r2(ap),
            "nuevo": r2(nuevos), "mercado": r2(v1 - v0 - ap - nuevos),
            "rentabilidad": r4(idx_cartera[i_fin] / b - 1) if b else None,
            "porProducto": detalle,
        })

    # ---- ¿y si lo hubieras metido todo en un indexado? ----
    # Las mismas entradas y salidas de dinero que tú, en los mismos días, pero en una
    # cartera de referencia. Se compara con lo que valen hoy tus productos con movimientos.
    con_flujos = [p for p in productos if p["_mv"]["flujos"]]
    comparacion = None
    if con_flujos and any(flujo_dia):
        tuya = [round(sum((p["serie"][i] or 0) for p in con_flujos), 2) for i in range(n)]
        i0 = next(i for i in range(n) if flujo_dia[i] or tuya[i])
        acum, aportado_c = 0.0, []
        for i in range(n):
            acum += flujo_dia[i]
            aportado_c.append(round(acum, 2) if i >= i0 else None)
        flujos_c = [(d(eje_iso[i]), -flujo_dia[i]) for i in range(n) if flujo_dia[i]]

        refs = []
        for rid, ref in REFERENCIAS.items():
            precios = [rellenar(series.get(sim, {}), eje) for sim, _ in ref["piezas"]]
            primeros = [next((v for v in pr if v), None) for pr in precios]
            if not all(primeros):
                continue
            unidades, serie_r, antes = [0.0] * len(precios), [], False
            for i in range(n):
                pr_hoy = [precios[k][i] or primeros[k] for k in range(len(precios))]
                if flujo_dia[i]:
                    antes = antes or any(precios[k][i] is None for k in range(len(precios)))
                    for k, (_, peso) in enumerate(ref["piezas"]):
                        unidades[k] += flujo_dia[i] * peso / pr_hoy[k]
                valor_r = sum(unidades[k] * pr_hoy[k] for k in range(len(precios)))
                serie_r.append(round(valor_r, 2) if i >= i0 else None)
            refs.append({"id": rid, "nombre": ref["nombre"], "detalle": ref["detalle"],
                         "serie": serie_r, "valor": serie_r[-1],
                         "tir": r4(xirr(flujos_c + [(fecha_extracto, serie_r[-1])])),
                         "aviso": ("Tienes aportaciones anteriores a los precios de esta referencia: "
                                   "para esas se usa su primer precio conocido.") if antes else None})
        if refs:
            comparacion = {"desde": eje_iso[i0], "tuya": [v if i >= i0 else None for i, v in enumerate(tuya)],
                           "aportado": aportado_c, "tuValor": tuya[-1],
                           "tuTir": r4(xirr(flujos_c + [(fecha_extracto, tuya[-1])])),
                           "referencias": refs}

    # ---- datos para el ticker en vivo ----
    # Una cripto (o un ETP que la replica, con "vivo": id de CoinGecko) se mueve
    # minuto a minuto en el panel en proporcion al precio de la cripto.
    prod_v = next((p for p in productos if p.get("participaciones") and
                   (p.get("vivo") or p.get("fuente") == "coingecko")), None)
    vivo = None
    if prod_v:
        coin = prod_v.get("vivo") or prod_v.get("codigo")
        ref = valor_en(series.get("CG:" + coin, {}), prod_v.get("navFecha") or fecha_extracto)
        if ref:
            vivo = {"productoId": prod_v["id"], "coin": coin, "titulos": prod_v["participaciones"],
                    "precioRef": r4(prod_v["nav"]), "btcRef": r2(ref),
                    "fechaRef": prod_v.get("navFecha") or fecha_extracto.isoformat()}

    datos = {
        "generado": dt.datetime.now().replace(microsecond=0).isoformat(),
        "titular": sin_html(cfg.get("titular", "Mi patrimonio")),
        "moneda": cfg.get("moneda", "EUR"),
        "fechaExtracto": fecha_extracto.isoformat(),
        "fechas": eje_iso,
        "productos": productos,
        "otrosActivos": ser_otros,
        "pasivos": ser_pasivos,
        "total": {
            "patrimonio": patrimonio,
            "aportado": aportado_total,
            "valorConCoste": round(valor_conocido, 2),
            "plusvalia": plusvalia_total,
            "rentabilidad": r4(plusvalia_total / aportado_total) if aportado_total else None,
            "tir": tir_total,
            "realizado": realizado_total,
            "serie": serie_total,
            "serieAportado": serie_ap_total,
            "porClase": agrupar("clase"),
            "porEntidad": agrupar("entidad"),
            "porTipo": agrupar("tipo"),
            "hitos": hitos,
            "racha": racha,
            "ritmoMensual": ritmo,
            "numAportaciones": sum(1 for p in productos for a in p["aportaciones"]
                                   if a.get("importe")),
            "diasInvertido": (fecha_extracto - primera).days,
            "caidaMaxima": r4(dd_max),
            "caidaMaximaFecha": dd_fecha,
        },
        "aportacionesMensuales": {"meses": meses, "porProducto": por_producto,
                                  "total": total_mes},
        "objetivo": objetivo_propio(cfg),
        "objetivoReparto": reparto_objetivo(cfg),
        "colchon": colchon(cfg),
        "comisiones": comisiones,
        "rentabilidadAnual": rent_anual,
        "dividendos": resumen_dividendos(cfg.get("movimientos", []), productos + ser_otros, fecha_extracto),
        "monedas": tipos_de_cambio(series),
        "resumenMensual": resumen_mensual,
        "comparador": comparador,
        "comparacion": comparacion,
        "indiceCartera": [r2(v) for v in idx_cartera],
        "vivo": vivo,
        "avisos": [sin_html(a) for a in AVISOS],
    }

    for p in productos + otros + pasivos + ser_otros + ser_pasivos:
        for k in [k for k in p if k.startswith("_")]:
            p.pop(k)

    # historico: un resumen por cada fecha calculada, para no perder el rastro
    if not historico:
        return datos
    hist_ruta = os.path.join(carpeta, "historico.json")
    hist = lee_cache(hist_ruta) or []
    hist = [h for h in hist if h.get("fecha") != fecha_extracto.isoformat()]
    hist.append({"fecha": fecha_extracto.isoformat(), "patrimonio": patrimonio,
                 "aportado": aportado_total, "plusvalia": plusvalia_total,
                 "porProducto": {p["id"]: p["valor"] for p in productos}})
    hist.sort(key=lambda h: h["fecha"])
    with open(hist_ruta, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)

    print()
    print("=" * 62)
    print(f"  PATRIMONIO NETO      {patrimonio:14,.2f} EUR")
    print(f"  Aportado             {aportado_total:14,.2f} EUR")
    print(f"  Plusvalia latente    {plusvalia_total:14,.2f} EUR  "
          f"({(plusvalia_total/aportado_total*100 if aportado_total else 0):+.2f}%)")
    if tir_total is not None:
        print(f"  TIR anualizada       {tir_total*100:13.2f} %")
    print("=" * 62)
    return datos
