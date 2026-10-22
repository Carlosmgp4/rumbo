# Rumbo en Docker: para tenerlo siempre encendido en un NAS, una Raspberry Pi o un servidor
# de casa, y abrirlo desde el navegador de cualquier ordenador de tu red.
# Instrucciones en el README («Rumbo en Docker»). La imagen oficial se publica sola en
# ghcr.io con cada versión: no hace falta construirla a mano.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATRIMONIO_DATOS=/data \
    PATRIMONIO_PUERTO=8765 \
    PATRIMONIO_HOST=0.0.0.0 \
    PATRIMONIO_NO_ABRIR=1 \
    PATRIMONIO_DOCKER=1 \
    TZ=Europe/Madrid

# Zona horaria (para que «hoy» sea el día de España) y un usuario sin privilegios.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 rumbo \
    && mkdir -p /data \
    && chown rumbo:rumbo /data

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY demo ./demo

USER rumbo
# Tus datos (cartera, copias, perfiles y la llave de acceso): sobreviven a las actualizaciones.
VOLUME ["/data"]
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/ping', timeout=3)"

CMD ["python", "-m", "app"]
