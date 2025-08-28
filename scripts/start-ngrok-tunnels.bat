@echo off
echo 🚀 Iniciando túneles ngrok...
echo.

REM Verificar si ngrok está instalado
where ngrok >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ ngrok no está instalado
    echo Ejecuta: winget install ngrok.ngrok
    pause
    exit /b 1
)

echo 📡 Creando túnel para LiveKit (puerto 7880)...
start "LiveKit Tunnel" cmd /k "ngrok http 7880"

timeout /t 3 >nul

echo 🖥️ Creando túnel para Backend (puerto 6001)...
start "Backend Tunnel" cmd /k "ngrok http 6001"

echo.
echo ✅ Túneles ngrok iniciados
echo 💡 Ve a http://127.0.0.1:4040 para ver las URLs públicas
echo.
pause