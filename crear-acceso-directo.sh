#!/bin/bash
# ==========================================================================
#  crear-acceso-directo.sh  -  Pone Rumbo en el menú de aplicaciones (Linux)
#
#  Desde una terminal en esta carpeta:   bash crear-acceso-directo.sh
#  Crea ~/.local/share/applications/rumbo.desktop (y una copia en tu
#  Escritorio, si existe) que abre Iniciar.sh con el icono de la app.
#  No instala nada. Si mueves la carpeta de Rumbo, vuelve a ejecutarlo.
# ==========================================================================
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
if [ ! -f "$DIR/Iniciar.sh" ]; then
  echo "No encuentro Iniciar.sh en esta carpeta."
  exit 1
fi
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
cat > "$APPS/rumbo.desktop" <<FIN
[Desktop Entry]
Type=Application
Name=Rumbo
Comment=Tu patrimonio, en tu ordenador
Exec=bash "$DIR/Iniciar.sh"
Path=$DIR
Icon=$DIR/app/web/icono-512.png
Terminal=true
Categories=Office;Finance;
FIN
chmod +x "$APPS/rumbo.desktop"
ESCRITORIO="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
TAMBIEN=""
if [ -d "$ESCRITORIO" ] && [ "$ESCRITORIO" != "$HOME" ]; then
  cp "$APPS/rumbo.desktop" "$ESCRITORIO/rumbo.desktop" && chmod +x "$ESCRITORIO/rumbo.desktop" && TAMBIEN=" y en tu Escritorio"
  # GNOME pide marcarlo como de confianza para que se abra con doble clic.
  gio set "$ESCRITORIO/rumbo.desktop" metadata::trusted true 2>/dev/null || true
fi
echo "Listo: Rumbo está en tu menú de aplicaciones$TAMBIEN."
