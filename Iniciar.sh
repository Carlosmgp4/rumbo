#!/bin/bash
# ==========================================================================
#  Iniciar.sh  -  Abre Rumbo, la app de tu patrimonio, en Linux
#
#  Desde una terminal en esta carpeta:   ./Iniciar.sh   (o: bash Iniciar.sh)
#
#  Este archivo es texto plano: puedes leer todo lo que hace. No instala nada
#  sin preguntarte. Pasos:
#    1. Busca uv (el gestor de Python recomendado). Si está, lo usa.
#    2. Si no, busca un Python 3.10 o superior ya instalado.
#    3. Si no hay ninguno, te ofrece instalar uv con su instalador oficial.
#  La primera vez instala lo necesario dentro de esta carpeta; después
#  actualiza los precios y abre la app en tu navegador.
# ==========================================================================
cd "$(dirname "$0")" || exit 1
if [ ! -f app/__main__.py ]; then
  echo "Parece que estás abriendo Rumbo sin descomprimir la carpeta."
  echo "Descomprime el ZIP de Rumbo y ejecuta Iniciar.sh desde la carpeta que se crea."
  exit 1
fi
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# --- 1. uv --------------------------------------------------------------------
if command -v uv >/dev/null 2>&1; then
  echo "Preparando la app con uv. La primera vez tarda un poco: descarga Python y lo necesario."
  # Si no se puede crear .venv aquí (carpeta de solo lectura o sincronizada), el
  # entorno de Python va a tu carpeta de usuario. Tus datos siguen en mis_datos.
  FUERA="${XDG_DATA_HOME:-$HOME/.local/share}/Rumbo/entorno"
  if [ ! -d .venv ] && [ -f "$FUERA/pyvenv.cfg" ]; then
    export UV_PROJECT_ENVIRONMENT="$FUERA"
  elif ! uv run --quiet python -c "import flask" >/dev/null 2>&1; then
    echo "No puedo instalar Python dentro de esta carpeta. Lo instalo en tu carpeta de usuario."
    export UV_PROJECT_ENVIRONMENT="$FUERA"
  fi
  exec uv run --quiet python -m app
fi

# --- 2. Un Python ya instalado ---------------------------------------------------
for PY in python3.13 python3.12 python3.11 python3.10 python3; do
  RUTA=$(command -v "$PY" 2>/dev/null) || continue
  "$RUTA" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null || continue
  if [ ! -x .venv-pip/bin/python ]; then
    echo "Primera vez: preparando un entorno de Python solo para esta app..."
    if ! "$RUTA" -m venv .venv-pip; then
      echo "No he podido crear el entorno. En Debian o Ubuntu suele faltar un paquete:"
      echo "    sudo apt install python3-venv"
      rm -rf .venv-pip
      exit 1
    fi
  fi
  .venv-pip/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt || exit 1
  exec .venv-pip/bin/python -m app
done

# --- 3. No hay nada: ofrecer instalar uv -------------------------------------------
echo
echo "No encuentro Python 3.10 o superior ni uv en este ordenador."
echo "Puedo instalar uv (gratuito y de código abierto, de la empresa Astral) con su"
echo "instalador oficial. uv se encarga de descargar Python."
echo
read -r -p "¿Quieres que lo instale ahora? (s/n) " RESP
if [[ "$RESP" =~ ^[sS] ]]; then
  if command -v curl >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh && exec "$0"
  else
    wget -qO- https://astral.sh/uv/install.sh | sh && exec "$0"
  fi
  echo "No he podido instalar uv."
else
  echo "Sin problema. En el archivo README tienes cómo instalar uv o Python paso a paso."
fi
exit 1
