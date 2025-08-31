# 🚀 Guía de Uso - Sistema de Streaming LiveKit

## 📦 Comandos Principales

### ⚡ Inicio Rápido
```bash
# Iniciar todo el sistema con IP automática
npm run dev
# o
npm run start
```

### 🛑 Detener Sistema
```bash
npm run stop
```

### 🔍 Solo Detectar IP
```bash
npm run ip
```

---

## 🌐 URLs de Acceso

Después de ejecutar `npm run start`, el sistema te mostrará las URLs:

### 💻 Desde tu PC (localhost)
- **Admin**: http://localhost:3000
- **Viewer**: http://localhost:3001

### 📱 Desde otros dispositivos en la misma red WiFi  
- **Admin**: http://192.168.x.x:3000
- **Viewer**: http://192.168.x.x:3001

*(La IP exacta se muestra al iniciar el sistema)*

---

## 🎯 Flujo de Uso

### 1. **Iniciación del Streamer (Admin)**
1. Ve a la URL del Admin
2. Permite permisos de cámara y micrófono
3. Configura nombre de sala (opcional)
4. Click "Iniciar Streaming"
5. ¡Ya estás transmitiendo!

### 2. **Visualización (Viewer)**
1. Ve a la URL del Viewer (desde cualquier dispositivo)
2. Aparecerán las salas activas
3. Click en la sala que quieras ver
4. ¡Ya estás viendo el stream!

---

## 📂 Estructura del Proyecto

```
server-streaming/
├── scripts/               # Todos los comandos .bat
│   ├── dev.bat            # Ejecutor principal
│   ├── start-dev.bat      # Inicio con detección IP
│   ├── stop-dev.bat       # Parada limpia
│   ├── detect-local-ip.bat # Detección automática IP
│   └── check-livekit.bat  # Verificar LiveKit
├── frontend-admin/        # Interfaz de control de streaming
├── frontend-viewer/       # Interfaz de visualización
├── backend-local/         # API y Socket.IO
├── vps-installer/         # Scripts de instalación VPS
└── streaming-docker/      # Redis (solo)
```

---

## 🔧 Configuración Automática

El sistema detecta automáticamente tu IP local y configura:

- ✅ **CORS** para permitir conexiones desde red local
- ✅ **Variables de entorno** con la IP detectada
- ✅ **URLs** para acceso desde dispositivos móviles
- ✅ **LiveKit** configurado con la IP correcta

---

## ⚠️ Requisitos

### Obligatorios
- **Node.js** 18+
- **Docker** (para Redis)
- **LiveKit VPS** (servidor dedicado en 5.78.143.204)

### Verificación
```bash
# Verificar LiveKit
npm run check-livekit

# Verificar IP local
npm run ip
```

---

## 🐛 Solución de Problemas

### ❌ "No conecta con LiveKit VPS"
- Verificar conexión a Internet
- LiveKit VPS siempre disponible en: wss://5.78.143.204

### ❌ "Redis no se conecta"
- Verificar que Docker esté ejecutándose
- Ejecutar: `docker-compose up -d` en `/streaming-docker/`

### ❌ "No se detecta IP local"
- Verificar conexión WiFi
- El sistema priorizará IPs 192.168.x.x

### ❌ "Dispositivos móviles no conectan"
- Usar las URLs con IP mostradas (no localhost)
- Verificar que estén en la misma red WiFi
- Desactivar firewall temporalmente si es necesario

---

## 🌟 Características

- **Ultra-baja latencia**: 20-50ms
- **Escalable**: 1000+ viewers concurrentes  
- **Plug & Play**: Detección automática de IP
- **Multi-dispositivo**: PC, móvil, tablet
- **Sin configuración**: Todo automático
- **Fácil desarrollo**: Un comando para todo

---

## 📊 Rendimiento

- **Resolución**: Hasta 1080p@30fps
- **Codec**: VP8/VP9 (WebRTC optimizado)
- **Latencia**: 20-50ms (LiveKit VPS profesional)
- **Bandwidth**: Adaptativo según conexión
- **Concurrencia**: 1000+ espectadores simultáneos

---

**¡Listo para usar!** 🎉