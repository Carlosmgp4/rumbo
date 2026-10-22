# Seguridad y privacidad de Rumbo

Rumbo funciona entero en tu ordenador. Este documento explica qué hace para que **nadie más que tú** pueda ver o
cambiar tus datos, y qué sale exactamente a internet. Si encuentras un fallo de seguridad, cuéntalo en un
[issue](https://github.com/danidm98/rumbo/issues) (sin poner datos tuyos).

## Dónde están tus datos

En la carpeta `mis_datos`, dentro de la carpeta de la app. No hay cuentas, ni servidores, ni nube.
Las copias que descargas (`.json`, Excel o la web exportada) llevan tus datos: guárdalas donde guardarías tu extracto del banco.

## Quién puede entrar en la app

Rumbo es una pequeña web que solo vive en tu ordenador. Desde la 2.0 tiene varias capas:

1. **Solo escucha en `127.0.0.1`**: nadie de tu wifi ni de internet puede conectarse.
2. **Llave de acceso.** La primera vez se crea un número aleatorio en `mis_datos/.acceso`. El lanzador
   (`Iniciar.bat`, `Iniciar.command` o `Iniciar.sh`) abre la app con esa llave y el navegador la guarda en una cookie
   que solo envía a la propia app (`HttpOnly`, `SameSite=Strict`). Sin la llave no se ve ni se cambia nada: ni otra web
   abierta en tu navegador, ni otro programa, ni otro usuario de este ordenador. Si abres la dirección sin pasar por el
   lanzador, verás una página que te dice que lo uses.
3. **Solo responde a su dirección** (`127.0.0.1` o `localhost`): una web con un dominio que apunte a tu ordenador
   (*DNS rebinding*) no puede hacerse pasar por ella.
4. **Rechaza lo que viene de otras webs**: comprueba quién hace cada petición (`Sec-Fetch-Site`, `Origin`) y el
   navegador no deja que otra página lea sus respuestas (`Cross-Origin-Resource-Policy`).
5. **La página no puede cargar código ajeno ni mandar tus datos a ningún sitio** (*Content Security Policy*): solo
   ejecuta sus propios archivos y solo puede hablar con la app y con CoinGecko/Binance para el precio del bitcoin en vivo.
   Tampoco se puede meter dentro de otra web (contra el *clickjacking*).
6. **Lo que entra se comprueba**: los nombres que escribes o importas no pueden colar código en la página, las copias
   de seguridad se revisan pieza a pieza antes de aceptarlas y los archivos que subes tienen un tamaño máximo.

Hay pruebas automáticas de todo esto (`tests/test_seguridad.py` y `tests/test_privacidad.py`), además de un ataque de
prueba desde otra web real en el navegador: no consigue leer nada ni borrar nada.

## Qué sale a internet

Todo pasa por una sola puerta (`app/red.py`), que solo deja **pedir** datos (nunca enviar), solo por `https` y solo a:

| Sitio | Para qué | Qué se envía |
|---|---|---|
| `query1/query2.finance.yahoo.com` | Precios, tipos de cambio y buscador | El ticker (`IWDA.AS`), el par de monedas (`USDEUR=X`) o lo que escribes en el buscador |
| `lt.morningstar.com` | Precios, buscador y reparto por países y sectores de los fondos | El ISIN o el código de Morningstar, o lo que escribes en el buscador |
| `api-global.morningstar.com` | Reparto por países y sectores de los planes de pensiones | El código de Morningstar del plan |
| `api.coingecko.com` | Precio de criptomonedas | El nombre de la moneda (`bitcoin`) |
| `raw.githubusercontent.com` | Saber si hay una versión nueva | Nada |

**Nunca sale** cuánto tienes, cuánto has puesto, cuántas participaciones, tus fechas de compra, el total de tu
patrimonio ni los nombres que pones a tus productos. Hay una prueba automática que recorre la app con una cartera
inventada y comprueba que ninguna de sus cifras aparece en lo que sale a internet.

Lo que sí ven esos servicios, como cualquier web que visitas: tu dirección IP y qué productos consultas
(por ejemplo, que alguien pidió el precio de `IE00BYX5NX33`), no cuánto tienes de ellos.

## Lo que Rumbo no puede evitar

- Un virus o un programa espía en tu ordenador, o alguien que use tu sesión de Windows o Mac, puede leer tus archivos.
  Rumbo no puede protegerte de eso: mantén el ordenador actualizado.
- Una extensión del navegador con permiso para «leer todos los sitios» puede ver cualquier página, también esta.
- Si descomprimes la app en una carpeta compartida con otros usuarios, ellos podrían leer `mis_datos`. Lo normal
  (Escritorio, Descargas o Documentos) es privado para tu usuario.
