@echo off
echo 🚀 Starting Ultra-Low Latency WebRTC Streaming System
echo =====================================================

echo.
echo 📦 Starting Docker services (Optional - MediaMTX only)...
cd streaming-docker
docker-compose up -d mediamtx redis 2>nul

echo.
echo ⏳ Waiting for services...
timeout /t 5

echo.
echo 🔍 Checking Docker services...
docker ps --filter "name=mediamtx" --filter "name=streaming-redis"

echo.
echo 🖥️ Starting WebRTC Backend (Port 5001)...
cd ..\backend-local
start cmd /k "npm run dev"

echo.
echo ⏳ Waiting for backend...
timeout /t 5

echo.
echo 📱 Starting Frontend Admin (Streamer)...
cd ..\frontend-admin  
start cmd /k "npm run dev"

echo.
echo 📺 Starting Frontend Viewer...
cd ..\frontend-viewer
start cmd /k "npm run dev"

echo.
echo ✅ WebRTC System started successfully!
echo.
echo 🚀 ULTRA-LOW LATENCY WEBRTC P2P:
echo =====================================
echo 📱 Streamer Panel:      http://localhost:3000
echo 📺 Viewer Panel:        http://localhost:3001  
echo 🔧 Backend API:         http://localhost:5001
echo.
echo ⚡ WEBRTC FEATURES:
echo ===================
echo ✓ 200-500ms latency (TikTok Live level)
echo ✓ P2P direct connection
echo ✓ No server processing
echo ✓ Real-time statistics
echo ✓ STUN/ICE NAT traversal
echo.
echo 📊 API ENDPOINTS:
echo =================
echo Health Check:     http://localhost:5001/health
echo WebRTC Stats:     http://localhost:5001/api/webrtc/stats
echo.
echo 🎯 TO START STREAMING:
echo ======================
echo 1. Open http://localhost:3000
echo 2. Click "🚀 Start Ultra-Low Latency Stream"
echo 3. Allow camera/microphone access
echo 4. Share viewer link: http://localhost:3001
echo.
pause