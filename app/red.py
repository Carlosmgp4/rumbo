# -*- coding: utf-8 -*-
"""
red.py  ·  La única puerta de Rumbo a internet
==============================================
Todo lo que la app descarga pasa por aquí. Solo se puede hablar con estos sitios, solo
por https y solo para PEDIR datos (GET, sin cuerpo): precios, el reparto de un fondo y
si hay una versión nueva. En esas peticiones va como mucho el código del producto
(ISIN, ticker o el de Morningstar) o lo que escribes en el buscador; nunca cuánto tienes,
cuánto has puesto ni ningún otro dato de tu cartera.
"""

import urllib.parse
import urllib.request

PERMITIDOS = {
    "query1.finance.yahoo.com": "precios de Yahoo Finance",
    "query2.finance.yahoo.com": "buscador de Yahoo Finance",
    "lt.morningstar.com": "precios, buscador y cartera de los fondos (Morningstar)",
    "api-global.morningstar.com": "cartera de los planes de pensiones (Morningstar)",
    "api.coingecko.com": "precios de criptomonedas (CoinGecko)",
    "raw.githubusercontent.com": "comprobar si hay una versión nueva de Rumbo",
}


class SitioNoPermitido(Exception):
    """Algo ha intentado salir a un sitio que no está en la lista."""


def abrir(url, cabeceras=None, timeout=15):
    """urllib.request.urlopen, pero solo GET, solo https y solo a los sitios permitidos."""
    partes = urllib.parse.urlsplit(url)
    if partes.scheme != "https" or partes.hostname not in PERMITIDOS:
        raise SitioNoPermitido(f"Rumbo no sale a {partes.scheme}://{partes.hostname}")
    req = urllib.request.Request(url, headers=dict(cabeceras or {}), method="GET")
    return urllib.request.urlopen(req, timeout=timeout)
