<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/rumbo-oscuro.png">
    <img src="docs/logo/rumbo-claro.png" alt="Rumbo" width="420">
  </picture>
</p>

<h3 align="center">Tu patrimonio neto en un panel bonito, claro y privado, que funciona en tu propio ordenador.</h3>

Fondos, ETF, acciones, criptomonedas, oro, planes de pensiones, cuentas del banco, un piso… Metes lo que tienes una vez y **Rumbo** descarga los precios solo, calcula cuánto has ganado, tu rentabilidad real (TIR) y te dice si lo estás haciendo mejor o peor que un indexado.

![El panel de patrimonio](docs/capturas/01_panel.png)

Herramienta **gratuita** hecha por **Dani Dominguez Quant**. Si te resulta útil, la mejor forma de apoyarla es [suscribirte al canal de YouTube](https://www.youtube.com/channel/UCiS3qumDoE7QDwzo_ChU6yQ?sub_confirmation=1) ▶, donde cuento cada mes cómo evoluciona la cartera de ejemplo.

> **Aviso.** Es una herramienta informativa. **No es asesoramiento financiero** ni una recomendación de compra o venta. Los precios vienen de servicios públicos gratuitos y pueden tener errores o retrasos: no se garantiza la exactitud de los datos. La cartera de ejemplo que trae es la cartera real del autor, con fines divulgativos.

---

## Novedades de la 2.0

Todo lo que pedisteis en los comentarios del vídeo y en GitHub, por orden de importancia:

- 🔒 **Más segura.** Ninguna otra web abierta en tu navegador puede leer ni cambiar tus datos. **Si usas la 1.x, actualiza.**
- ⇄ **Traspasos** entre fondos y planes de pensiones: el coste y la antigüedad pasan al nuevo, sin contar como venta.
- 👨‍👩‍👧 **Perfiles**: la cartera de tu pareja o de tus hijos, cada una aparte, y **«Todos juntos»** para ver la suma.
- 💱 **Tu patrimonio en otra moneda**: dólares, libras, francos suizos o pesos, al cambio de hoy (los cálculos siguen en euros).
- 🌍 **Dónde está tu dinero de verdad**: tu reparto por países y sectores, sumando todos tus fondos, ETF, planes y acciones.
- 🏦 **Planes de pensiones con precio automático**: búscalos por su nombre.
- 🛟 **Liquidez y fondo de emergencia**: cuánto tienes a mano, cuántos meses te cubre y cuánto te sobra para invertir.
- 🎯 **Tu reparto objetivo**: por tipo de activo o por producto, con un interruptor para dejar fuera lo que no quieras contar, un semáforo cuando te desvías y cómo repartir la próxima aportación sin vender.
- 🏠 **Tu propio objetivo**: la entrada del piso, unas vacaciones… y cuánto te falta.
- 🔧 **Cuadrar participaciones** con tu banco (por ejemplo, tras importar traspasos de MyInvestor).
- 🧾 **Para la Renta**: tus ventas del año con su ganancia o pérdida (FIFO, como Hacienda), dividendos e intereses, y avisos de lo que conviene revisar. Descargable en Excel.
- 📸 **Compartir mi mes**: una imagen de tu mes para redes (cuadrada, vertical o story), con el logo y un QR a Rumbo. Por defecto, solo porcentajes.
- ↻ **Aportaciones periódicas**: la de cada mes a tu fondo, con el precio de cada día, en un minuto (y aviso cuando toca la siguiente).
- 🐳 **Rumbo en Docker**: para tenerla siempre encendida en un NAS, una Raspberry o un servidor de casa.
- Y además: una ventana con las novedades al abrir cada versión, icono en el Escritorio (`Crear acceso directo.bat`), préstamos P2P y crowdfunding como tipo propio (Mintos, Urbanitae…), pisos alquilados con su rentabilidad neta, intereses de cuentas remuneradas (cuentan como dinero cobrado), botón «Todas» para venderlo todo, lo ya cobrado en ventas y dividendos (en el panel y, como «Ganancia total», en la ficha de cada producto), periodo propio en la comparación con un indexado e informe para soporte.

**¿Vienes de la 1.x?** Actualiza sin perder nada siguiendo [estos pasos](#actualizar-a-una-versión-nueva): tus datos sirven tal cual.

| | |
|---|---|
| ![Todos juntos: la suma de todos los perfiles](docs/capturas/12_perfiles.png) | ![Un fondo que viene de un traspaso](docs/capturas/13_traspasos.png) |
| ![Tu patrimonio en dólares](docs/capturas/14_divisas.png) | ![Dónde está tu dinero de verdad](docs/capturas/09_donde_esta.png) |
| ![Mi reparto objetivo](docs/capturas/11_reparto.png) | ![Compartir mi mes](docs/capturas/17_compartir.png) |

---

## Índice

- [Novedades de la 2.0](#novedades-de-la-20)
- [Qué hace](#qué-hace)
- [Instalación en Windows](#instalación-en-windows)
- [Instalación en Mac](#instalación-en-mac)
- [Instalación en Linux](#instalación-en-linux)
- [Rumbo en Docker (NAS, Raspberry Pi o servidor de casa)](#rumbo-en-docker-nas-raspberry-pi-o-servidor-de-casa)
- [Primer uso](#primer-uso)
- [Meter tus datos](#meter-tus-datos)
- [Importar de golpe (MyInvestor, Excel o con una IA)](#importar-de-golpe)
- [El día a día](#el-día-a-día)
- [Tu patrimonio en otra moneda](#tu-patrimonio-en-otra-moneda)
- [Dónde está tu dinero, tu colchón y tu reparto objetivo](#dónde-está-tu-dinero-tu-colchón-y-tu-reparto-objetivo)
- [¿Y si lo hubieras metido todo en un indexado?](#y-si-lo-hubieras-metido-todo-en-un-indexado)
- [Dividendos, cupones e intereses](#dividendos-cupones-e-intereses)
- [Para la Renta](#para-la-renta)
- [Compartir mi mes](#compartir-mi-mes)
- [Copias de seguridad, Excel y cambiar de ordenador](#copias-de-seguridad-excel-y-cambiar-de-ordenador)
- [Publicar tu panel como web](#publicar-tu-panel-como-web)
- [Actualizar a una versión nueva](#actualizar-a-una-versión-nueva)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Privacidad](#privacidad)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Para curiosos: cómo está hecho](#para-curiosos-cómo-está-hecho)
- [Licencia](#licencia)

---

## Qué hace

- **Todo tipo de productos**: fondos, ETF, acciones, cripto, materias primas, bonos, planes de pensiones, cuentas, inmuebles, préstamos P2P y crowdfunding, deudas…
- **Precios automáticos** de Morningstar, Yahoo Finance y CoinGecko, con conversión a euros.
- **Buscador por ISIN, ticker o nombre** que comprueba que el producto tiene precio antes de guardarlo y rellena solo la comisión (TER), el riesgo y la categoría.
- **Cifras honestas**: aportado, plusvalía, **TIR** (la rentabilidad real de tu dinero), rentabilidad por año, peor caída, racha de aportaciones…
- **Comparación con un indexado**: con tus mismas aportaciones, ¿cuánto tendrías en el MSCI World, el S&P 500 o una cartera 60/40?
- **Traspasos entre fondos y planes**: el coste y la antigüedad pasan al nuevo, como hace Hacienda, sin contar como venta.
- **Perfiles**: la cartera de tu pareja o de tus hijos, cada una aparte, y **«Todos juntos»** para ver la suma.
- **Dónde está tu dinero de verdad**: tu reparto por **países y sectores**, sumando todos tus fondos, ETF, planes y acciones.
- **Planes de pensiones con precio automático**: los encuentras por su nombre.
- **Tu reparto objetivo**: un semáforo te avisa cuando te desvías y te dice dónde meter la próxima aportación para volver a cuadrar.
- **Liquidez y fondo de emergencia**: cuánto tienes a mano, cuántos meses de gastos te cubre y cuánto te sobra para invertir.
- **Dividendos, cupones e intereses** (también los de tus cuentas remuneradas): cuánto cobras al año, por producto, y tu rentabilidad por dividendo.
- **Compras en dólares u otra moneda**: escribes lo que pagaste y se pasa a euros con el cambio de ese día.
- **Ver el panel en otra moneda**: dólares, libras, francos suizos o pesos (mexicanos, argentinos, chilenos o colombianos), al cambio de hoy.
- **Importación de golpe**: el CSV de MyInvestor, una plantilla de Excel o el extracto de cualquier banco convertido con una IA gratuita.
- **Nunca tocas un archivo a mano**: todo se hace con formularios, con validación y mensajes en castellano llano.
- **Copias de seguridad automáticas**, tus datos **en Excel** y exportación del panel a una página web (con opción de **ocultar los importes**).
- **Modo vídeo** para grabar tu panel, tema claro u oscuro, y **tus datos nunca salen de tu ordenador**.

| | |
|---|---|
| ![Ficha de un producto](docs/capturas/03_producto.png) | ![Comparación con un indexado](docs/capturas/04_comparador.png) |
| ![Tus datos](docs/capturas/05_mis_datos.png) | ![Importar](docs/capturas/06_importar.png) |

---

## Instalación en Windows

Son unos 5 minutos la primera vez. No hace falta saber programar.

### 1. Descarga la app

1. Arriba en esta página, pulsa el botón verde **«Code»** y luego **«Download ZIP»**. (También puedes descargarla desde **[Releases](../../releases/latest)**.)
2. Ve a tu carpeta de Descargas, haz **clic derecho** sobre el ZIP → **«Extraer todo…»** → **«Extraer»**.
3. Mueve la carpeta que sale a un sitio cómodo, por ejemplo **Documentos**.

### 2. Instala uv (recomendado)

[uv](https://docs.astral.sh/uv/) es un programa gratuito y de código abierto que se encarga de descargar Python y todo lo que necesita la app, sin que tengas que hacer nada más.

1. Pulsa la tecla **Windows**, escribe **terminal** y abre **Terminal** (o **PowerShell**).
2. Copia y pega esto y pulsa **Intro**:

   ```
   winget install astral-sh.uv
   ```

3. Cuando termine, cierra la ventana.

> Si te saltas este paso, no pasa nada: al abrir la app por primera vez te preguntará si quieres que lo instale ella.

### 3. Abre la app

1. Entra en la carpeta de la app y haz **doble clic en `Iniciar.bat`**.
2. Puede que Windows muestre un aviso azul («Windows protegió su PC»). Es normal con cualquier archivo descargado de internet: pulsa **«Más información»** y luego **«Ejecutar de todas formas»**. `Iniciar.bat` es texto plano: si quieres, ábrelo con el Bloc de notas y lee todo lo que hace.
3. La primera vez tarda uno o dos minutos (descarga Python y lo necesario). Después se abre la app **en tu navegador**.
4. **Deja abierta la ventana negra** mientras uses la app. Para cerrarla, cierra esa ventana.

A partir de ahí, cada vez que quieras ver tu patrimonio: doble clic en `Iniciar.bat`.

**¿Lo quieres en el Escritorio con su icono?** Haz doble clic en **`Crear acceso directo.bat`** (en la misma carpeta). Aparece «Rumbo» en tu Escritorio y desde entonces lo abres desde ahí. Si algún día mueves la carpeta de la app, vuelve a hacerlo.

> Si la carpeta está en un sitio donde Windows no deja instalar programas (por ejemplo, sincronizada con OneDrive), la app lo detecta e instala Python en tu carpeta de usuario (`%LOCALAPPDATA%\Rumbo`). No tienes que hacer nada: tus datos siguen en `mis_datos`, dentro de la carpeta de la app.

### Alternativa sin uv: Python de python.org

1. Descarga Python desde [python.org/downloads](https://www.python.org/downloads/) (3.10 o superior).
2. En el instalador, **marca la casilla «Add python.exe to PATH»** antes de pulsar «Install Now».
3. Doble clic en `Iniciar.bat`. La primera vez prepara un entorno dentro de la carpeta de la app.

(Si ya tienes Anaconda, `Iniciar.bat` también lo encuentra.)

---

## Instalación en Mac

1. Descarga y descomprime la app como en Windows (botón **«Code» → «Download ZIP»**; el ZIP se descomprime con doble clic).
2. Instala uv: abre la app **Terminal**, pega esto y pulsa **Intro**:

   ```
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

3. Haz **doble clic en `Iniciar.command`**. La primera vez macOS lo bloqueará por venir de internet: haz **clic derecho** sobre el archivo → **«Abrir»** → **«Abrir»**. Solo hace falta una vez.
4. Si dice que no tienes permiso para abrirlo: abre Terminal, escribe `sh ` (con un espacio detrás), arrastra `Iniciar.command` a la ventana y pulsa **Intro**.
5. **Para tenerlo siempre a mano**, arrastra `Iniciar.command` al **Dock** (a la derecha, junto a la papelera) o, en el Finder, clic derecho → **«Crear alias»** y deja el alias en tu Escritorio.

> La app se ha probado a fondo en Windows. En Mac debería funcionar igual; si algo falla, [abre una incidencia](../../issues) y lo miramos.

---

## Instalación en Linux

1. Descarga y descomprime la app (botón **«Code» → «Download ZIP»**).
2. Abre una terminal en la carpeta de la app y ejecuta:

   ```
   bash Iniciar.sh
   ```

   Si no tienes uv ni Python 3.10 o superior, te ofrece instalar uv con su instalador oficial. En Debian o Ubuntu, si usas el Python del sistema, puede que antes necesites `sudo apt install python3-venv`.
3. Se abre la app en tu navegador. Deja la terminal abierta mientras la uses.
4. **Para abrirla desde el menú de aplicaciones** (y desde el Escritorio, si tienes), ejecuta una vez `bash crear-acceso-directo.sh`. Si mueves la carpeta, vuelve a ejecutarlo.

> `Iniciar.sh` hace lo mismo que el lanzador de Mac, pero todavía no se ha probado en un Linux real. Si algo falla, [abre una incidencia](../../issues).

---

## Rumbo en Docker (NAS, Raspberry Pi o servidor de casa)

Para quien tiene un equipo siempre encendido en casa (un NAS de Synology o QNAP, una Raspberry Pi, un servidor) y
quiere abrir Rumbo desde el navegador de cualquier ordenador de casa sin instalar nada en cada uno. Si no sabes qué es
Docker, no lo necesitas: usa la instalación normal de arriba.

**Imagen oficial:** `ghcr.io/danidm98/rumbo`, para PC y servidores (amd64) y Raspberry Pi (arm64). Cada versión tiene
su etiqueta (`2.0.0`, `2.0`) y `latest` es siempre la última.

1. En el equipo donde la vas a tener, crea una carpeta y descarga dentro [`docker-compose.yml`](docker-compose.yml).
2. Arráncala:

   ```bash
   docker compose up -d
   ```

3. Mira la dirección para abrirla, con tu llave de acceso:

   ```bash
   docker compose logs rumbo
   ```

   Sale algo así: `http://IP-DEL-EQUIPO:8765/?acceso=…`. Cambia `IP-DEL-EQUIPO` por la del NAS o la Raspberry
   (por ejemplo, `192.168.1.50`) y ábrela en el navegador. La llave solo hace falta la primera vez en cada navegador.

4. **Actualizar** a una versión nueva (tus datos no se tocan):

   ```bash
   docker compose pull && docker compose up -d
   ```

**Tus datos** están en el volumen `rumbo_datos` (cartera, copias, perfiles y la llave). Para una copia de todo:
`docker cp rumbo:/data ./copia-rumbo`. También puedes usar **Mis datos → Copias y exportar** como siempre.

**Seguridad:**
- Sin la llave no se ve nada, ni desde otro equipo de tu casa ni desde otra web.
- **No abras el puerto 8765 a internet en tu router.** Rumbo no usa HTTPS: para entrar desde fuera de casa, usa una
  VPN como [Tailscale](https://tailscale.com).
- Solo responde a direcciones de casa (IP privadas, nombres como `nas` o `raspberrypi.local`, Tailscale). Si entras
  con un nombre propio (`rumbo.midominio.com`), añádelo en `PATRIMONIO_HOSTS_PERMITIDOS` dentro de `docker-compose.yml`.

---

## Primer uso

La primera vez verás una **cartera de ejemplo** (la del autor), para que puedas curiosear todo sin miedo.

Cuando quieras usar la tuya, pulsa **«Empezar con mis datos»** y elige:

- **Empezar de cero**: una cartera vacía.
- **Copiar el ejemplo para practicar**: puedes tocar y borrar lo que quieras.

Si más adelante quieres volver a empezar, en **Mis datos** tienes el botón **«Empezar de nuevo…»**. Tu cartera anterior se guarda antes en las copias, por si acaso.

> **Abre siempre Rumbo con su lanzador** (`Iniciar.bat`, `Iniciar.command` o `Iniciar.sh`). Lleva tu llave de acceso: si escribes la dirección a mano en otro navegador, verás un aviso que te pide usar el lanzador. Es lo que impide que cualquier otra web o programa entre en tus datos.

---

## Meter tus datos

Todo está en la pestaña **Mis datos**.

![Mis datos](docs/capturas/05_mis_datos.png)

### Añadir un producto

1. **Productos → «+ Añadir producto»**.
2. En el buscador, escribe el **ISIN** (lo tienes en la ficha del producto en tu banco, como `IE00BYX5NX33`), el **ticker** (`AAPL`, `SAN.MC`) o el **nombre** (`bitcoin`, `oro`).
3. Pulsa el resultado que corresponda. Se rellenan solos el nombre, el tipo, la fuente del precio, la moneda y, en fondos y ETF, la comisión anual (TER), el riesgo y la categoría.
4. **Guardar producto**. Justo después se abre el formulario de **su primera compra**.

Los **planes de pensiones** se buscan por su nombre (`MyInvestor Indexado Global`): si están en Morningstar, salen con su precio y se actualizan solos.

¿No aparece o no tiene precio en internet (un depósito, oro físico, un piso)? Créalo igual y elige **«Valor anotado a mano»** como fuente del precio.

**¿Tenías un plan de pensiones anotado a mano y ahora sale en el buscador?** Puedes dejarlo como está. Para que se actualice solo: crea el plan con el buscador y haz un **traspaso** desde el antiguo (**Movimientos → «⇄ Traspaso»**) con fecha de hoy, marcando «Lo traspaso todo» y poniendo las **participaciones que tienes hoy** en el nuevo. Lo que llevas aportado pasa al plan nuevo, la curva de antes se conserva y nada cuenta dos veces.

### Movimientos: compras, ventas, dividendos y comisiones

**Movimientos → «+ Añadir movimiento»**. Para cada operación:

- **Unidades**: participaciones, acciones, onzas…
- **Importe total**: en una compra, **lo que salió de tu cuenta con las comisiones incluidas**; en una venta o un dividendo, lo que te ingresaron. Si pagaste en **dólares u otra moneda**, elígela en el desplegable que hay junto al importe: se guarda en euros con el cambio de ese día y en la nota queda lo que pagaste.
- **Comisión** (opcional): solo informativa, porque ya va dentro del importe.

Las ventas descuentan el coste por **FIFO** (primero lo más antiguo), como hace Hacienda. Para vender todo de un producto, el botón **«Todas»** rellena las unidades exactas.

### Aportaciones periódicas (la de cada mes)

¿Metes lo mismo cada mes en un fondo? **Movimientos → «↻ Periódica»**: eliges el producto, cuánto, qué día del mes y desde cuándo, y Rumbo prepara una compra por mes con el precio de cierre de ese día (si ese día no hubo cierre, el anterior). Antes de guardar ves la lista; las que ya tengas anotadas se saltan. Son **estimadas**: tu banco puede ejecutarlas otro día o a otro precio, así que puedes corregir cada una después. Rumbo se acuerda de la aportación y, cuando toca la siguiente, te avisa en Movimientos para añadirla con un clic. No se añade nada sin que lo confirmes.

### Traspasos

**Movimientos → «⇄ Traspaso»**: de qué fondo (o plan) sale, a cuál va, la fecha y las participaciones que salen (**«Todas»** si es total). Rumbo rellena el importe y las participaciones que entran con el precio de ese día. No cuenta como venta: lo que pagaste y la fecha de cada compra pasan al destino, y no suma como aportación nueva. Si es un plan valorado a mano, marca **«Lo traspaso todo»** y el antiguo se queda a cero.

Si importas el CSV de MyInvestor, Rumbo **detecta los traspasos solo**: en la vista previa te pregunta de qué fondo venía cada uno (**«Venía de»**) y, si el de origen no está en Rumbo, lo importa como compras. En la ficha del fondo, el traspaso sale marcado en la gráfica con **⇄**.

![Un fondo que viene de un traspaso, con su marca en la gráfica](docs/capturas/13_traspasos.png)

### Cuadrar participaciones con tu banco

Si las participaciones de un fondo no coinciden con las de tu banco (pasa con algunos traspasos importados de MyInvestor), **Movimientos → «Cuadrar participaciones»**: escribe las buenas y Rumbo las fija desde esa fecha sin cambiar lo que pagaste.

### Cuentas, planes de pensiones, pisos… (valores anotados a mano)

![Saldos y valores](docs/capturas/07_saldos.png)

1. Crea el producto. Para una cuenta, el tipo **«Cuenta / efectivo»**; para lo demás, la fuente **«Valor anotado a mano»**.
2. En **Saldos y valores**, anota su valor con la fecha. Si sabes lo que llevas aportado (por ejemplo, a un plan de pensiones), anótalo también y el panel calculará su rentabilidad.
3. Una vez al mes basta: con **«Anotar todos de una vez»** copias todos los saldos de tu banco en un minuto.
4. ¿Tu cuenta remunerada te paga intereses? Con **«+ Intereses»** en su tarjeta los apuntas y salen en **Rendimiento** con el resto de lo que cobras.
5. ¿Tienes un piso alquilado? En su tarjeta, **«+ Alquiler»** para lo que te paga el inquilino y **«+ Gasto»** para comunidad, IBI, seguro o reparaciones. En su ficha (pestaña Productos) verás el alquiler neto de los últimos 12 meses y su rentabilidad bruta y neta sobre lo que vale hoy.
6. ¿Préstamos P2P o crowdfunding (Mintos, Urbanitae…)? Crea el producto con el tipo **«Préstamos P2P / crowdfunding»**: lo que metes, como compras; lo que te pagan, con **«+ Intereses»**; y de vez en cuando, lo que vale tu cuenta en la plataforma.

### Perfiles: la cartera de tu pareja o de tus hijos

Arriba, junto al logo, está el selector de perfiles. **«+ Añadir un perfil»** crea una cartera aparte, con sus productos, movimientos, copias e importaciones. Con dos perfiles con datos aparece **«Todos juntos»**, la suma de todos (solo para mirar): cada producto lleva detrás el nombre de su perfil. Para renombrar o borrar perfiles, **«Gestionar perfiles…»** en el mismo selector. Se guardan en `mis_datos/perfiles`.

![«Todos juntos»: la suma de todos los perfiles](docs/capturas/12_perfiles.png)

---

## Importar de golpe

**Mis datos → Importar**. Hay tres caminos y **siempre verás una vista previa antes de guardar nada**, con los totales para compararlos con tu banco y los errores explicados fila por fila.

![Importar](docs/capturas/06_importar.png)

### MyInvestor (fondos)

1. En la web de MyInvestor, abre **cada uno de tus fondos** → **«Plusvalías y minusvalías»** → descarga el **CSV**. No le cambies el nombre al archivo: lleva el ISIN del fondo.
2. Arrastra todos los CSV a la vez a la app y pulsa **«Revisar antes de importar»**.

Si el fondo no existe todavía, se crea solo. Cada importación **sustituye** lo que importaste antes de ese fondo, así que puedes repetirlo cada mes sin duplicar nada.

**Traspasos entre fondos**: en un traspaso, MyInvestor conserva la fecha y el coste del fondo antiguo, pero no dice de qué fondo venía. Rumbo reconoce esos lotes y, en la vista previa, te pregunta **de qué fondo venían y qué día fue el traspaso**:

- Si ese fondo está en Rumbo, elígelo y pon la fecha de cada lote (cada uno puede haberse traspasado otro día). Rumbo crea un traspaso de verdad y el dinero no cuenta dos veces. Si el extracto de ese fondo ya no trae lo que salió (lo normal: MyInvestor solo enseña lo que queda), Rumbo lo reconstruye en su fecha, así ves cómo entró y salió.
- ¿No sabes la fecha? Está en el historial de órdenes de MyInvestor. Si no la encuentras, marca **«No la sé»**: Rumbo pone el día en que mejor cuadran los precios de los dos fondos y la marca como **estimada** (la ficha del fondo te lo recuerda hasta que la corrijas en Movimientos).
- Si no está en Rumbo, deja «No está en Rumbo»: se importan como compras con su fecha y coste originales.

En la gráfica de cada fondo, una raya marca el día de cada traspaso: «⇄ a World» o «⇄ desde AXA».

Rumbo recuerda tu respuesta para la siguiente importación. Si las participaciones no cuadran con MyInvestor, usa **Movimientos → «Cuadrar participaciones»**.

MyInvestor no permite descargar las órdenes de **ETF o acciones**: haz capturas de pantalla de tus órdenes y usa la opción **«Con ayuda de una IA»**.

### Plantilla de Excel o CSV (cualquier banco)

Descarga la plantilla desde la app (**Excel** o **CSV**). Trae desplegables, una hoja **«Ejemplo»** con filas de muestra y una hoja **«Instrucciones»**. Rellena la hoja **«Movimientos»**, una fila por operación:

| Columna | ¿Obligatoria? | Qué poner |
|---|---|---|
| `fecha` | Sí | Día de la operación: `10/03/2025` o `2025-03-10`. |
| `identificador` | Casi siempre | ISIN o ticker. Vacío solo en cuentas y cosas sin precio en internet. |
| `nombre` | Si no hay identificador | Nombre del producto o de la cuenta. |
| `tipo_producto` | No | `fondo`, `etf`, `accion`, `cripto`, `commodity`, `bono`, `pension`, `efectivo`, `inmueble`, `deuda`, `p2p` u `otro`. |
| `tipo_movimiento` | Sí | `compra`, `venta`, `dividendo`, `comision` o `saldo` (el saldo de una cuenta en esa fecha). |
| `unidades` | Recomendado | Si lo dejas vacío, se calculan con el precio de ese día. |
| `importe` | Sí | Dinero total. Compra: lo que salió de tu cuenta, con comisiones. Venta o dividendo: lo que entró. |
| `moneda` | No | Moneda del importe. Si no es EUR, se convierte con el cambio de ese día. |
| `comision` | No | Comisión de la operación, ya incluida en el importe. |
| `nota` | No | Lo que quieras. |

### Con ayuda de una IA (cualquier extracto)

Una IA gratuita (ChatGPT, Gemini, Copilot…) puede convertir el extracto de tu banco, un PDF o **capturas de pantalla** de tus órdenes a la plantilla.

> ⚠️ **Antes de dárselo a la IA, borra (o tapa en las capturas) tu nombre, DNI, IBAN, números de cuenta y tarjeta, dirección y cualquier dato personal.** Solo hacen falta fechas, productos e importes.

1. En la app, pulsa **«Copiar prompt»** (o cópialo de aquí abajo).
2. Pégalo en la IA y, debajo, tu extracto (o adjunta el PDF o las capturas).
3. Copia la respuesta, pégala en la app y pulsa **«Revisar antes de importar»**.
4. **Compara los totales de la vista previa con tu banco**: una IA puede equivocarse al copiar un número o saltarse una fila.

<details>
<summary><b>Ver el prompt para la IA</b></summary>

```text
Convierte el extracto de mi banco o bróker (el texto que pego al final, o los PDF o capturas de pantalla que adjunto) en una tabla para importarla en mi app de patrimonio. En las capturas de órdenes, lee con cuidado la fecha de ejecución, los títulos, el precio y el importe de cada una.

Devuélveme SOLO un CSV dentro de un bloque de código, sin explicaciones, separado por punto y coma (;) y con esta cabecera exacta:
fecha;identificador;nombre;tipo_producto;tipo_movimiento;unidades;importe;moneda;comision;nota

Reglas para cada columna:
- fecha: la fecha de la operación (o de ejecución), en formato AAAA-MM-DD.
- identificador: el ISIN si aparece (12 caracteres, como IE00BYX5NX33); si no, el ticker (como AAPL). Para cuentas bancarias, déjalo vacío.
- nombre: el nombre del producto o de la cuenta, tal y como aparece.
- tipo_producto: una de estas palabras: fondo, etf, accion, cripto, commodity, bono, pension, efectivo, inmueble, deuda, p2p, otro.
- tipo_movimiento: una de estas palabras: compra, venta, dividendo, comision, saldo. Usa «saldo» solo para el saldo de una cuenta en una fecha.
- unidades: participaciones, acciones o unidades compradas o vendidas, en positivo y con punto decimal. Déjalo vacío si no aparece.
- importe: el dinero total de la operación, en positivo, con punto decimal y sin símbolo de moneda. En una compra, lo que salió de la cuenta con las comisiones incluidas; en una venta o un dividendo, lo que entró.
- moneda: la moneda del importe (EUR, USD…).
- comision: la comisión de esa operación si aparece (ya va incluida en el importe). Si no, vacío.
- nota: vacío, o una nota muy breve.

Importante:
- Una fila por operación, ordenadas por fecha.
- No inventes nada: si un dato no aparece en el extracto, deja esa casilla vacía.
- No incluyas nóminas, recibos, gastos del día a día ni transferencias entre mis propias cuentas.

EXTRACTO:
[Pega aquí tu extracto o adjunta los PDF o capturas. ANTES, BORRA o tapa tu nombre, DNI, IBAN, números de cuenta y tarjeta, dirección y cualquier dato personal: solo hacen falta fechas, productos e importes.]
```

</details>

---

## El día a día

- **Actualizar precios**: la app los actualiza sola al abrirse (si tienen más de 6 horas) y con el botón **«↻ Actualizar precios»**. En la ficha de cada producto verás de dónde sale su precio y de qué día es.
- **Tu rutina mensual**: descarga los CSV de MyInvestor y arrástralos, anota tus compras de bolsa y pulsa **«Anotar todos de una vez»** con los saldos de tus cuentas. Cinco minutos.
- **Lo que ya vendiste del todo** no ocupa sitio en el panel, pero sigue contando en la historia, la TIR y lo que has ganado. Para verlo, pulsa **«Vendidos»** encima del gráfico.
- **Solo largo plazo**: el botón del panel quita lo que no es inversión (tu colchón, las cuentas…) y recalcula todas las cifras. Cada producto tiene su interruptor «Inversión a largo plazo».
- **Modo vídeo** (tecla `V`): esconde los controles y agranda las cifras. Las teclas `1` a `6` cambian de pestaña.
- **Tema claro u oscuro** con el botón **«Tema»**.
- **Ver en otra moneda**: con el desplegable **«€ EUR»** de arriba ves todos los importes en dólares, libras, francos suizos o pesos, al cambio de hoy. Rumbo sigue calculando en euros: la TIR y las rentabilidades son las de tu dinero en euros.
- **Tu objetivo**: en la barra de progreso, **«cambiar»** pone tu propia meta (por ejemplo, la entrada de un piso). Si no eliges ninguna, va al siguiente hito.
- **Dónde está tu dinero de verdad**: en la pestaña Patrimonio, tu reparto por países y sectores con datos de Morningstar (se refrescan una vez al mes). Para un plan que no cotiza, en su ficha avanzada dile a qué fondo se parece.
- **Liquidez y fondo de emergencia**: suma tus cuentas y monetarios (o lo que marques con «Cuenta como liquidez») y, si dices cuántos meses de gastos quieres de colchón, te dice si lo tienes cubierto y cuánto te sobra para invertir.
- **Mi reparto objetivo**: dices qué % quieres en cada tipo de activo o en cada producto (y cuáles cuentan, con su interruptor) y Rumbo te enseña la desviación, un semáforo y cómo repartir tu próxima aportación sin vender. Es una herramienta para pensar, no una recomendación.

---

## Tu patrimonio en otra moneda

Arriba a la derecha, el desplegable **«€ EUR»** cambia todos los importes de la app a **dólares, libras, francos suizos o pesos** (mexicanos, argentinos, chilenos o colombianos), al cambio del día en que actualizas. Un aviso arriba te recuerda en qué moneda lo estás viendo. Lo que cambia es la cifra de tu patrimonio; **la TIR y las rentabilidades se siguen calculando en euros**, que es la moneda de tu dinero, y en **Mis datos** todo sigue en euros. Para volver, elige **«€ Euros»**.

![Tu patrimonio en dólares](docs/capturas/14_divisas.png)

---

## Dónde está tu dinero, tu colchón y tu reparto objetivo

Tres tarjetas de la pestaña **Patrimonio**:

**Dónde está tu dinero de verdad.** Suma el reparto por países y sectores de cada fondo, ETF, plan y acción según lo que vale cada uno. Por ejemplo: «el 59 % de lo que tienes en bolsa está en Estados Unidos». Los datos son de Morningstar, sobre la cartera que publica cada fondo, y se refrescan como mucho una vez al mes. En un plan o una cartera que no cotiza, dile en su ficha (opciones avanzadas) a qué fondo se parece con **«Reparto como el de»**.

![Dónde está tu dinero de verdad](docs/capturas/09_donde_esta.png)

**Liquidez y fondo de emergencia.** Suma lo que tienes disponible en días (cuentas y fondos monetarios, o lo que marques con «Cuenta como liquidez») y, si le dices cuántos meses de gastos quieres de colchón, te enseña si lo tienes cubierto y cuánto te sobra para invertir.

![Liquidez y fondo de emergencia](docs/capturas/10_liquidez.png)

**Mi reparto objetivo.** Rumbo compara lo que tienes con el reparto que tú quieres y te enseña la desviación, un semáforo (OK, vigilar, rebalancear) y, con **«Voy a aportar…»**, cómo repartir la próxima aportación para volver a cuadrar **sin vender nada**. Es una herramienta para pensar, no una recomendación.

![Mi reparto objetivo](docs/capturas/11_reparto.png)

Para ponerlo o cambiarlo, pulsa **«Cambiar»** en la tarjeta:

1. Elige **«Por tipo de activo»** (renta variable, renta fija, monetario, planes de pensiones, cripto…) o **«Por producto»** (por ejemplo, 80 % al fondo del mundo y 20 % al de emergentes).
2. Escribe el porcentaje de cada uno. Tienen que **sumar 100 %**.
3. Con el **interruptor ON/OFF** de cada producto decides si cuenta para el reparto: deja fuera el plan de pensiones o tu colchón, o mete una cuenta si quieres. Debajo de la tabla verás qué se ha quedado fuera («No cuentan para este reparto»).
4. **Guardar.** Solo cambia este reparto: tu patrimonio, tus gráficas y tus totales siguen igual.

![Cambiar el reparto objetivo, con el interruptor de cada producto](docs/capturas/11b_reparto_cambiar.png)

---

## ¿Y si lo hubieras metido todo en un indexado?

En la pestaña **Rendimiento**, la app repite **tus mismas compras y ventas, en las mismas fechas**, pero en otra cartera, y te dice cuánto tendrías hoy:

- **MSCI World** (ETF iShares IWDA, en euros)
- **S&P 500** (ETF iShares SXR8)
- **Cartera 60/40**: 60 % MSCI World y 40 % bonos globales cubiertos a euros (EUNA)
- **Sin riesgo**: un monetario del euro (XEON)

![Comparación con un indexado](docs/capturas/04_comparador.png)

En **«Ver más detalles»** tienes la volatilidad, el Sharpe y la peor caída de cada una.

---

## Dividendos, cupones e intereses

Anota cada cobro en **Mis datos → Movimientos → «+ Añadir movimiento»** con el tipo **«Dividendo o cupón»**. Si eliges una **cuenta de efectivo**, el tipo pasa solo a **intereses** (también puedes usar **«+ Intereses»** en su tarjeta de Saldos). Lo cobrado cuenta como dinero que ya te ha dado tu inversión: suma en la «Ganancia total» del producto y en lo «ya cobrado en ventas, dividendos e intereses» del panel. En **Rendimiento** verás cuánto has cobrado en total y en los últimos 12 meses, cuánto sale al mes, lo cobrado cada año y, por producto, la **rentabilidad por dividendo** sobre lo que vale hoy y sobre lo que pusiste.

![Dividendos, cupones e intereses](docs/capturas/15_dividendos.png)

---

## Para la Renta

En **Rendimiento → «Para la Renta»** eliges el año y tienes lo que hace falta para repasar el borrador de la declaración:

- **Cada venta** con su valor de transmisión (lo que cobraste), su valor de adquisición (lo que te costó, con comisiones), las fechas de las compras de las que sale y la ganancia o pérdida. Se calcula como Hacienda: lo primero que compraste es lo primero que vendes (FIFO), y los traspasos entre fondos conservan el coste y la fecha de compra.
- **Dividendos, cupones e intereses** del año tal y como los anotaste (normalmente, lo que te ingresaron; en la Renta va el bruto y la retención aparte, que vienen en el informe fiscal de tu banco), y las comisiones que pagaste aparte.
- **Avisos** de lo que conviene mirar a mano: pérdidas con una recompra cerca (la regla de los dos meses, o de un año en fondos), traspasos que no son entre fondos y ventas sin coste anotado. Los rescates de planes de pensiones van aparte, porque tributan como rendimiento del trabajo.
- Un botón para **descargarlo en Excel**.

Es orientativo: **no es asesoramiento fiscal**. Rumbo no sabe las retenciones que te hicieron ni tu situación, y Hacienda ya tiene casi todo esto en tus datos fiscales. Se calcula en tu ordenador y no sale en la web publicada ni en el modo vídeo.

![Para la Renta](docs/capturas/16_renta.png)

---

## Compartir mi mes

En la pestaña **El mes**, el botón **«Compartir mi mes»** prepara una imagen para redes con la rentabilidad del mes, cómo vas en el año y la curva, el logo de Rumbo y un QR a la página de Rumbo. Tres formatos:

- **Mini** (cuadrada): un solo dato, para Instagram o WhatsApp.
- **Resumen** (vertical): el mes, el año, la TIR, tu racha de aportaciones y de dónde sale el cambio (lo que pusiste tú y lo que puso el mercado).
- **Story**: para Instagram, TikTok o los estados de WhatsApp.

Cada una en tres temas: **oscuro, claro o azul**. Por defecto **solo salen porcentajes**: nadie sabe cuánto tienes. En el Resumen puedes marcar «Mostrar euros» si quieres. La imagen se hace en tu ordenador: con **«Copiar imagen»** la pegas donde quieras y con **«Descargar imagen»** la guardas. Puedes elegir cualquier mes del desplegable.

![Compartir mi mes](docs/capturas/17_compartir.png)

---

## Copias de seguridad, Excel y cambiar de ordenador

**Mis datos → Copias y exportar**:

- **Copias automáticas**: antes de cada cambio se guarda una copia (las últimas 20). Si te equivocas, pulsa **«Recuperar»** en la de antes del error.
- **Descargar copia**: un archivo `.json` con toda tu cartera. Guárdalo en tu nube o en un USB de vez en cuando.
- **Recuperar desde un archivo**: para pasar tu cartera a otro ordenador. En el nuevo, instala la app, ábrela y sube ahí el archivo.
- **Descargar en Excel**: todos tus movimientos y saldos, y una hoja con la ficha de cada producto. Se abre con Excel, Google Sheets o LibreOffice. La hoja «Movimientos» tiene el formato de la plantilla de importación: puedes cambiarla y volver a importarla.

Tus datos están en la carpeta **`mis_datos`**, dentro de la carpeta de la app. Copiar esa carpeta también vale como copia de seguridad.

---

## Publicar tu panel como web

En **Mis datos → Copias y exportar → Publicar como web** descargas tu panel en **un solo archivo HTML**, de solo lectura. Puedes abrirlo con doble clic, mandarlo por correo o subirlo a internet:

1. Crea una carpeta, mete dentro el archivo y cámbiale el nombre a `index.html`.
2. Entra en [app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta. En unos segundos te da una dirección para compartir.

Con la opción **«Ocultar importes»**, las cantidades en euros **no van dentro del archivo** (ni siquiera escondidas en el código): solo se ven los porcentajes y la forma de las gráficas.

---

## Actualizar a una versión nueva

Cuando haya una versión nueva, la app te lo avisará con un mensaje arriba. Hay dos formas de actualizar **sin perder nada**. Elige una.

**Opción A · con una copia de seguridad** (la más sencilla, sobre todo si usas un solo perfil):

1. En la versión que tienes, **Mis datos → Copias y exportar → «Descargar copia»**. Se descarga un archivo `copia_patrimonio_AAAA-MM-DD.json`.
2. Cierra la app (la ventana negra).
3. Descarga el ZIP de la versión nueva, descomprímelo y ábrela con `Iniciar.bat` (o `Iniciar.command` en Mac, `Iniciar.sh` en Linux).
4. En la nueva, **Mis datos → Copias y exportar**: arrastra el archivo al cuadro **«Recuperar desde un archivo»** (o púlsalo y elígelo) y confirma. Ya tienes todo como estaba.

La copia es del **perfil que tengas seleccionado**: si usas varios perfiles, repítelo con cada uno o usa la opción B.

**Opción B · copiando la carpeta de tus datos** (todo de una vez, con todos los perfiles):

1. Cierra la app (la ventana negra).
2. Descarga el ZIP nuevo y descomprímelo.
3. Copia tu carpeta **`mis_datos`** de la carpeta de la versión antigua a la de la nueva (lleva dentro tus perfiles, tus copias y tu llave de acceso).
4. Abre la nueva con `Iniciar.bat` (o `Iniciar.command` en Mac, `Iniciar.sh` en Linux).

Al abrir la versión nueva por primera vez verás una ventana con **lo que trae de nuevo**.

---

## Preguntas frecuentes

Dentro de la app, la pestaña **Ayuda** tiene las dudas más habituales. Las más importantes:

<details><summary><b>Mi producto no aparece en el buscador</b></summary>

Busca por **ISIN** (es lo más fiable, sobre todo en fondos). Para acciones y ETF, prueba el ticker con la bolsa: `SAN.MC` (Madrid), `IWDA.AS` (Ámsterdam), `EUNL.DE` (Xetra). Para cripto, el nombre en inglés. Si no cotiza en ningún sitio, créalo con **«Valor anotado a mano»**.
</details>

<details><summary><b>El valor no coincide con el de mi banco</b></summary>

Los fondos publican su valor liquidativo con uno o dos días de retraso y cada web lo actualiza a una hora distinta; las acciones se valoran al último cierre. Si la diferencia es grande, revisa las unidades e importes de tus movimientos y que el producto use la bolsa y la moneda correctas (en su ficha, «Fuente del precio»).
</details>

<details><summary><b>¿Qué es la TIR?</b></summary>

La rentabilidad compara lo que vale tu cartera con lo que has metido. La **TIR** tiene en cuenta además **cuándo** entró y salió cada euro y lo expresa como porcentaje anual. Si aportas poco a poco, es la cifra honesta para compararte con otras inversiones.
</details>

<details><summary><b>¿La rentabilidad cuenta los dividendos y lo que ya vendí?</b></summary>

En la ficha de cada producto (pestaña Productos): la **plusvalía** es solo lo que ganas con lo que aún tienes, por el precio. La **ganancia total** suma además lo que ganaste en ventas y los dividendos e intereses, y resta las comisiones que pagaste aparte; debajo verás de dónde sale cada parte. Su % es sobre todo lo que has llegado a invertir en ese producto. La **TIR** lo cuenta todo y también cuándo entró y salió cada euro. Las ventas se calculan como en Hacienda: lo primero que compraste es lo primero que vendes (FIFO).
</details>

<details><summary><b>Hice un traspaso de un fondo a otro</b></summary>

En **Movimientos → «⇄ Traspaso»** (ver [Traspasos](#traspasos)). Si importas el extracto de MyInvestor, Rumbo reconoce las compras que vienen de un traspaso (ver [MyInvestor](#myinvestor-fondos)); en la plantilla, un traspaso son dos filas, `traspaso_salida` y `traspaso_entrada`.
</details>

<details><summary><b>¿Funciona sin internet?</b></summary>

Sí. Rumbo funciona en tu ordenador (`127.0.0.1` es tu propio ordenador, no internet). Solo necesita conexión para instalarse la primera vez, descargar precios, buscar productos nuevos y comprobar si hay una versión nueva. Sin conexión, usa los últimos precios guardados.
</details>

<details><summary><b>La ventana negra se cierra sola o sale un error</b></summary>

Lee el mensaje de la ventana: casi siempre dice qué pasa. Lo más habitual es no tener conexión a internet la primera vez (hace falta para descargar Python). Si no lo consigues, [abre una incidencia](../../issues) con una captura del mensaje.
</details>

---

## Privacidad

- Tus datos se guardan **solo en tu ordenador**, en la carpeta `mis_datos`. No hay cuentas, ni servidores, ni nadie más que los vea.
- **A internet solo salen códigos de producto** (ISIN, ticker o el de Morningstar) para pedir precios y el reparto por países, y lo que escribes en el buscador. **Nunca** cuánto tienes, cuánto has puesto, tus participaciones ni el total de tu patrimonio. Todo pasa por una sola puerta que solo deja pedir datos a Yahoo Finance, Morningstar, CoinGecko y GitHub.
- El servidor de la app solo escucha en tu propio ordenador (`127.0.0.1`): nadie de tu red puede entrar.
- **Llave de acceso** (desde la 2.0): el lanzador abre la app con una llave que solo tiene tu navegador. Ni otra web abierta en tu navegador, ni otro programa, ni otro usuario del ordenador pueden ver ni cambiar tus datos. Por eso, si cierras la pestaña, vuelve a abrirla con el lanzador.
- Todos los detalles, en [docs/SEGURIDAD.md](docs/SEGURIDAD.md).

---

## Limitaciones conocidas

- Los precios vienen de servicios **gratuitos y no oficiales**. Casi siempre van bien, pero pueden fallar o traer algún dato raro. Si una fuente no responde, la app usa el último precio guardado y te avisa.
- Del CSV de MyInvestor solo se conoce la **plusvalía** de lo ya vendido, no la fecha de venta: tu patrimonio de hoy sale bien, pero la curva no refleja cuándo vendiste.
- No calcula **impuestos**.
- Las versiones de **Mac** y **Linux** no se han podido probar en un Mac o un Linux reales.
- El **reparto por países y sectores** es el que publica cada fondo en Morningstar, con su fecha (algunos lo publican cada varios meses). En los fondos mixtos se usa la parte en bolsa.

---

## Para curiosos: cómo está hecho

- **Python + Flask** para el servidor local; el panel es HTML, CSS y JavaScript sin librerías externas (gráficos SVG propios). Sin Node.
- Los datos están en `mis_datos/cartera.json`: productos, movimientos y valores anotados.
- Para arrancarlo a mano: `uv run python -m app`.
- **Tests**: antes de publicar una versión, doble clic en `tests\ejecutar_tests.bat` (o `python -m unittest discover -s tests -b`). Funcionan sin internet, con precios inventados, y nunca tocan `mis_datos`.

```
Iniciar.bat / .command / .sh   lanzadores de Windows, Mac y Linux (texto plano)
app/
  servidor.py    la app local (Flask, solo en 127.0.0.1)
  motor.py       los cálculos: series diarias, TIR, rentabilidades, comparación
  buscar.py      buscador de productos (Morningstar, Yahoo, CoinGecko)
  exposicion.py  reparto por países y sectores (Morningstar)
  importar.py    importadores (MyInvestor, plantilla, texto de la IA)
  almacen.py     validación y guardado, con copias automáticas
  exportar.py    el panel como web estática
  web/           el panel (index.html, app.js, graficos.js, editor.js)
demo/            la cartera de ejemplo
tests/           pruebas automáticas para publicar versiones sin romper nada
mis_datos/       TUS DATOS (se crea al usarla; no se sube a ningún sitio)
```

---

## Licencia

[MIT](LICENSE): puedes usarla, copiarla y modificarla libremente.

Hecha por **Dani Dominguez Quant**. ¿Te ha servido? [Suscríbete al canal](https://www.youtube.com/channel/UCiS3qumDoE7QDwzo_ChU6yQ?sub_confirmation=1) ▶

**Herramienta informativa. No es asesoramiento financiero ni una recomendación de inversión. No se garantiza la exactitud de los datos ni de los precios. Úsala bajo tu propia responsabilidad.**
