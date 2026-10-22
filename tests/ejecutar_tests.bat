@echo off
rem ==========================================================================
rem  ejecutar_tests.bat  -  Pasa todas las pruebas de Rumbo (doble clic).
rem
rem  Usalo ANTES de publicar una version nueva. Funcionan sin internet, con
rem  precios inventados, y nunca tocan tu carpeta mis_datos.
rem ==========================================================================
setlocal
cd /d "%~dp0.."
title Pruebas de Rumbo
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY if exist ".venv-pip\Scripts\python.exe" set "PY=.venv-pip\Scripts\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Rumbo\entorno\Scripts\python.exe" set "PY=%LOCALAPPDATA%\Rumbo\entorno\Scripts\python.exe"
if not defined PY (
  echo  No encuentro el Python de la app. Abre antes Iniciar.bat una vez para instalarlo.
  pause
  exit /b 1
)
"%PY%" -m unittest discover -s tests -b
if errorlevel 1 (
  echo.
  echo  HAY PRUEBAS QUE FALLAN: no publiques la version hasta arreglarlas.
) else (
  echo.
  echo  Todo correcto: se puede publicar.
)
pause
