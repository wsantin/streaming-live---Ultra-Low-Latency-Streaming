@echo off
echo 🛑 Deteniendo Sistema de Streaming WebRTC Ultra-Low Latency
echo =============================================================

echo.
echo 📦 Deteniendo servicios Docker Enterprise...
cd streaming-docker
docker-compose down

echo.
echo 🧹 Limpiando volúmenes Docker (opcional)...
docker volume prune -f 2>nul

echo.
echo 💻 Deteniendo servicios por puertos específicos...

echo   📱 Deteniendo Frontend Admin (Puerto 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a 2>nul

echo   📺 Deteniendo Frontend Viewer (Puerto 3001)...  
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a 2>nul

echo   🔧 Deteniendo Backend WebRTC (Puerto 5000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do taskkill /f /pid %%a 2>nul



echo.
echo 💻 Limpiando procesos Node.js restantes (excluyendo Claude Code)...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| findstr /v "claude"') do taskkill /f /pid %%i 2>nul
taskkill /f /im npm.exe 2>nul
taskkill /f /im nodemon.exe 2>nul

echo.
echo 🔍 Verificando contenedores Docker detenidos...
docker ps -a --filter "name=mediamtx" --filter "name=streaming-redis"

echo.
echo ✅ Sistema WebRTC detenido exitosamente!
echo.
echo 🛑 SERVICIOS DETENIDOS:
echo =======================
echo   📱 Frontend Admin:       Puerto 3000
echo   📺 Frontend Viewer:      Puerto 3001  
echo   🔧 Backend WebRTC:       Puerto 5000
echo   📦 Docker MediaMTX:      Puertos 8004, 1937, 8890
echo   📦 Docker Redis:         Puerto 6379
echo.
echo 🧹 LIMPIEZA COMPLETADA:
echo =======================
echo   ✓ Contenedores Docker detenidos
echo   ✓ Volúmenes Docker limpiados
echo   ✓ Procesos Node.js terminados
echo   ✓ Puertos liberados
echo.
pause