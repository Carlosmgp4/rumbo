# -*- coding: utf-8 -*-
"""
exposicion.py  ·  Qué hay dentro de cada producto
=================================================
Reparto por países y sectores de la parte en bolsa de cada fondo, ETF o plan de
pensiones, y el sector y el país de cada acción, según Morningstar. Con esto el panel
suma tu exposición real: cuánto de tu dinero está en Estados Unidos, en tecnología...

Se guarda en la cache (se consulta como mucho una vez al mes por producto). Si
Morningstar no responde, el panel sigue funcionando: solo falta esta parte.
"""

import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request

from . import red
from .motor import UA, sin_html

CADUCA_DIAS = 30
BUSCA = "https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener?"
DETALLE = ("https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security_details/{}?viewId=MFsnapshot"
           "&idtype=msid&responseViewFormat=json&languageId=es-ES&currencyId=EUR")
SAL = "https://api-global.morningstar.com/sal-service/v1/fund/{}/{}/data"
SAL_QS = "?languageId=es-ES&locale=es-ES&clientId=MDC&benchmarkId=category&component=sal-mip-{}&version=4.69.0"
SAL_CAB = {"apikey": "lstzFDEOhfFNMLikKa0am9mgEKLBl49T", "Origin": "https://www.morningstar.com",
           "Referer": "https://www.morningstar.com/"}
ES_ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")

# Los mismos nombres que la ficha de la cartera de ejemplo.
SECTORES = {"101": "Materiales", "102": "Consumo discrecional", "103": "Financiero", "104": "Inmobiliario",
            "205": "Consumo básico", "206": "Salud", "207": "Utilities", "308": "Comunicaciones",
            "309": "Energía", "310": "Industrial", "311": "Tecnología"}
SECTORES_SAL = {"basicMaterials": "101", "consumerCyclical": "102", "financialServices": "103", "realEstate": "104",
                "consumerDefensive": "205", "healthcare": "206", "utilities": "207",
                "communicationServices": "308", "energy": "309", "industrials": "310", "technology": "311"}
# Sector de una acción, tal como lo da el buscador de Morningstar en castellano.
SECTORES_ES = {"materiales básicos": "101", "productos de consumo cíclicos": "102", "consumo cíclico": "102",
               "servicios financieros": "103", "inmobiliario": "104", "productos de consumo defensivos": "205",
               "consumo defensivo": "205", "salud": "206", "servicios públicos": "207",
               "servicios de comunicación": "308", "comunicaciones": "308", "energía": "309",
               "industria": "310", "industriales": "310", "tecnología": "311"}
PAISES = {
    "USA": "Estados Unidos", "JPN": "Japón", "GBR": "Reino Unido", "CAN": "Canadá", "FRA": "Francia",
    "CHE": "Suiza", "DEU": "Alemania", "AUS": "Australia", "NLD": "Países Bajos", "ESP": "España",
    "ITA": "Italia", "SWE": "Suecia", "DNK": "Dinamarca", "HKG": "Hong Kong", "SGP": "Singapur",
    "BEL": "Bélgica", "FIN": "Finlandia", "NOR": "Noruega", "IRL": "Irlanda", "ISR": "Israel",
    "AUT": "Austria", "PRT": "Portugal", "NZL": "Nueva Zelanda", "LUX": "Luxemburgo", "TWN": "Taiwán",
    "KOR": "Corea del Sur", "CHN": "China", "IND": "India", "BRA": "Brasil", "ZAF": "Sudáfrica",
    "MEX": "México", "SAU": "Arabia Saudí", "IDN": "Indonesia", "THA": "Tailandia", "MYS": "Malasia",
    "ARE": "Emiratos Árabes", "QAT": "Catar", "POL": "Polonia", "CHL": "Chile", "TUR": "Turquía",
    "PHL": "Filipinas", "GRC": "Grecia", "PER": "Perú", "HUN": "Hungría", "KWT": "Kuwait",
    "COL": "Colombia", "CZE": "Chequia", "EGY": "Egipto", "ARG": "Argentina", "RUS": "Rusia",
    "VNM": "Vietnam", "NGA": "Nigeria", "PAK": "Pakistán", "BMU": "Bermudas", "CYM": "Islas Caimán",
    "JEY": "Jersey", "GGY": "Guernsey", "IMN": "Isla de Man", "CUW": "Curazao", "PAN": "Panamá",
    "URY": "Uruguay", "ROU": "Rumanía", "SVN": "Eslovenia", "SVK": "Eslovaquia", "HRV": "Croacia",
    "EST": "Estonia", "LVA": "Letonia", "LTU": "Lituania", "ISL": "Islandia", "MAC": "Macao",
    "KAZ": "Kazajistán", "MAR": "Marruecos", "KEN": "Kenia", "BGR": "Bulgaria", "CYP": "Chipre",
    "MLT": "Malta", "BHR": "Baréin", "OMN": "Omán", "JOR": "Jordania", "LKA": "Sri Lanka",
}
# Nombres en inglés (camelCase) de la otra API de Morningstar -> ISO de tres letras.
PAISES_SAL = {"unitedStates": "USA", "japan": "JPN", "unitedKingdom": "GBR", "canada": "CAN", "france": "FRA",
              "switzerland": "CHE", "germany": "DEU", "australia": "AUS", "netherlands": "NLD", "spain": "ESP",
              "italy": "ITA", "sweden": "SWE", "denmark": "DNK", "hongKong": "HKG", "singapore": "SGP",
              "belgium": "BEL", "finland": "FIN", "norway": "NOR", "ireland": "IRL", "israel": "ISR",
              "austria": "AUT", "portugal": "PRT", "newZealand": "NZL", "luxembourg": "LUX", "taiwan": "TWN",
              "southKorea": "KOR", "china": "CHN", "india": "IND", "brazil": "BRA", "southAfrica": "ZAF",
              "mexico": "MEX", "saudiArabia": "SAU", "indonesia": "IDN", "thailand": "THA", "malaysia": "MYS",
              "unitedArabEmirates": "ARE", "qatar": "QAT", "poland": "POL", "chile": "CHL", "turkey": "TUR",
              "philippines": "PHL", "greece": "GRC", "peru": "PER", "hungary": "HUN", "kuwait": "KWT",
              "colombia": "COL", "czechRepublic": "CZE", "egypt": "EGY", "argentina": "ARG", "russia": "RUS"}


def _get(url, cabeceras=None, timeout=20):
    with red.abrir(url, {**UA, **(cabeceras or {})}, timeout=timeout) as r:
        texto = r.read().decode("utf-8", "replace")
    return json.loads(texto) if texto.strip() else None


def _pais(iso):
    return PAISES.get(iso, iso)


def _lista(pares):
    """[(nombre, %)] -> ordenado, sin ceros, que sume 100 (redondeado a 2 decimales)."""
    acc = {}
    for n, v in pares:
        if v and v > 0:
            acc[n] = acc.get(n, 0.0) + float(v)
    total = sum(acc.values())
    if total <= 0:
        return []
    return [[n, round(v * 100 / total, 2)] for n, v in sorted(acc.items(), key=lambda x: -x[1])]


def _bloque(portafolio, clave, tipo=None):
    """Lista de BreakdownValues 'netos' (SalePosition N) de un apartado del detalle."""
    for b in portafolio.get(clave) or []:
        if b.get("SalePosition") == "N" and (tipo is None or b.get("Type") in (tipo, None)):
            return b.get("BreakdownValues") or []
    return []


# ---------------------------------------------------------------- fuentes

def secids(isin):
    """SecId de Morningstar de un ISIN (fondos, ETF y planes; el de fondo primero)."""
    q = {"page": 1, "pageSize": 10, "outputType": "json", "version": 1, "languageId": "es-ES", "currencyId": "EUR",
         "universeIds": "FOESP$$ALL|ETEUR$$ALL|FOALL$$ALL", "securityDataPoints": "SecId|isin|Universe", "term": isin}
    filas = (_get(BUSCA + urllib.parse.urlencode(q)) or {}).get("rows") or []
    filas = [f for f in filas if (f.get("isin") or "").upper() == isin]
    filas.sort(key=lambda f: not str(f.get("Universe", "")).startswith("FO"))
    vistos = []
    for f in filas:
        if f.get("SecId") and f["SecId"] not in vistos:
            vistos.append(f["SecId"])
    return vistos


def detalle(secid):
    """Países, sectores, parte en bolsa y 10 mayores posiciones del detalle de Morningstar."""
    d = _get(DETALLE.format(urllib.parse.quote(secid)))
    d = (d[0] if d else {}) if isinstance(d, list) else (d or {})
    p = (d.get("Portfolios") or [{}])[0]
    paises = _lista((_pais(x["Type"]), x.get("Value")) for x in _bloque(p, "CountryExposure", "Equity"))
    sectores = _lista((SECTORES.get(x["Type"], "Otros"), x.get("Value")) for x in _bloque(p, "GlobalStockSectorBreakdown"))
    reparto = _bloque(p, "AssetAllocations")
    rv = next((x.get("Value") for x in reparto if x.get("Type") == "1"), None)
    if not paises and not sectores:
        # Un fondo sin acciones (monetario, renta fija): se sabe que su parte en bolsa es cero.
        if rv is not None and rv < 1 and any((x.get("Value") or 0) > 1 for x in reparto):
            return {"paises": [], "sectores": [], "rv": 0.0, "top10": None,
                    "actualizado": (p.get("Date") or "")[:10] or None}
        return None
    top = sorted((h for h in p.get("PortfolioHoldings") or [] if h.get("Weighting")), key=lambda h: -h["Weighting"])[:10]
    return {"paises": paises, "sectores": sectores,
            "rv": round(max(0.0, min(1.0, rv / 100)), 4) if rv is not None else None,
            "top10": [[sin_html(h.get("SecurityName") or h.get("ExternalName") or "?"), round(h["Weighting"], 2)]
                      for h in top] or None,
            "actualizado": (p.get("Date") or "")[:10] or None}


def detalle_sal(secid):
    """La otra API de Morningstar (la de su web), que sí tiene los planes de pensiones."""
    def pide(ruta, componente):
        return _get(SAL.format(ruta, urllib.parse.quote(secid)) + SAL_QS.format(componente), SAL_CAB) or {}
    c = pide("portfolio/regionalSectorIncludeCountries", "sector-exposure")
    fp = c.get("fundPortfolio") or {}
    paises = _lista((_pais(PAISES_SAL.get(x.get("name"), x.get("name"))), x.get("percent")) for x in fp.get("countries") or [])
    s = (pide("portfolio/v2/sector", "sector-exposure").get("EQUITY") or {}).get("fundPortfolio") or {}
    sectores = _lista((SECTORES.get(SECTORES_SAL.get(k, ""), "Otros"), v) for k, v in s.items()
                      if k in SECTORES_SAL and isinstance(v, (int, float)))
    if not paises and not sectores:
        return None
    a = pide("process/asset/v2", "asset-allocation").get("allocationMap") or {}
    rv = None
    try:
        rv = sum(float(v.get("netAllocation") or 0) for k, v in a.items() if "Equity" in k) / 100 if a else None
    except (TypeError, ValueError):
        rv = None
    return {"paises": paises, "sectores": sectores,
            "rv": round(max(0.0, min(1.0, rv)), 4) if rv is not None else None, "top10": None,
            "actualizado": (fp.get("portfolioDate") or s.get("portfolioDate") or "")[:10] or None}


def accion(p):
    """Sector y país de una acción (una empresa: el 100 % en su país y su sector)."""
    ident = (p.get("identificador") or "").strip().upper()
    termino = ident if ES_ISIN.match(ident) else (p.get("codigo") or ident).split(".")[0]
    if not termino:
        return None
    q = {"page": 1, "pageSize": 5, "outputType": "json", "version": 1, "languageId": "es-ES", "currencyId": "EUR",
         "universeIds": "E0WWE$$ALL", "securityDataPoints": "SecId|Name|isin|Ticker|SectorName|Domicile", "term": termino}
    filas = (_get(BUSCA + urllib.parse.urlencode(q)) or {}).get("rows") or []
    f = next((f for f in filas if f.get("SectorName") and f.get("Domicile")), None)
    if not f:
        return None
    sector = SECTORES.get(SECTORES_ES.get(f["SectorName"].strip().lower(), ""), sin_html(f["SectorName"]))
    return {"paises": [[_pais(f["Domicile"]), 100.0]], "sectores": [[sector, 100.0]], "rv": 1.0, "top10": None,
            "actualizado": dt.date.today().isoformat(), "empresa": True}


# ---------------------------------------------------------------- lo que usa el motor

def clave(p):
    """Con qué se busca el reparto de un producto (o None si no tiene sentido buscarlo)."""
    como = (p.get("expoComo") or "").strip().upper()
    if como:
        return "ISIN:" + como
    tipo = p.get("tipoClave") or p.get("tipo")
    ident = (p.get("identificador") or "").strip().upper()
    if tipo == "accion":
        return "ACCION:" + (ident or (p.get("codigo") or "").upper()) if (ident or p.get("codigo")) else None
    if tipo not in ("fondo", "etf", "pension", "otro", "bono"):
        return None
    if ES_ISIN.match(ident):
        return "ISIN:" + ident
    codigo = (p.get("codigo") or "").strip()
    if p.get("fuente") == "morningstar" and re.match(r"^(F0|0P)[A-Z0-9]{6,10}$", codigo):
        return "MS:" + codigo
    return None


def consulta(k, p):
    """Reparto según Morningstar para una clave de clave(). Lanza excepción si no hay conexión."""
    tipo, valor = k.split(":", 1)
    if tipo == "ACCION":
        return accion(p)
    ids = secids(valor) if tipo == "ISIN" else [valor]
    for sid in ids:
        r = detalle(sid) or detalle_sal(sid)
        if r:
            r["fuente"] = "Morningstar · cartera " + ("del fondo de referencia" if p.get("expoComo") else "del producto")
            return r
    return None


def de_producto(p, cache, red=True, solo_si_falta=False):
    """Reparto de un producto: de la cache si es reciente; si no (y red=True), de Morningstar.
    Con solo_si_falta, lo guardado vale aunque sea viejo (al guardar un cambio no se espera a internet)."""
    k = clave(p)
    if not k:
        return None
    ruta = os.path.join(cache, "EXPO_" + re.sub(r"[^A-Za-z0-9]", "_", k) + ".json")
    guardado = None
    try:
        with open(ruta, encoding="utf-8") as f:
            guardado = json.load(f)
    except (OSError, ValueError):
        pass
    fresco = guardado and (dt.date.today() - dt.date.fromisoformat(guardado["consulta"])).days < CADUCA_DIAS
    if fresco or not red or (solo_si_falta and guardado):
        return (guardado or {}).get("datos")
    try:
        datos = consulta(k, p)
    except Exception:
        return (guardado or {}).get("datos")   # sin conexión: lo último que había
    os.makedirs(cache, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"consulta": dt.date.today().isoformat(), "datos": datos}, f, ensure_ascii=False)
    return datos
