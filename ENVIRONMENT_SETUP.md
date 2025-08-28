# 🌍 Environment Setup Guide - Local & Production

Este sistema ahora soporta tres ambientes completamente automatizados:

## 🏠 **LOCAL Environment (HTTP)**
Para desarrollo local básico con **detección automática de IP**.

### Uso:
```bash
./start-local.bat
```

### Características:
- 🔍 **Detección automática de IP** de la red actual
- ✅ Backend: `http://[IP-DETECTADA]:5001`
- ✅ Admin Frontend: `http://localhost:3000` 
- ✅ Viewer Frontend: `http://localhost:3001`
- ✅ Acceso desde red local: `http://[IP-DETECTADA]:3000`
- ✅ CORS automático para IP detectada
- ❌ **No funciona para móviles** (requiere HTTPS)

---

## 🔒 **LOCAL HTTPS Environment** 
Para desarrollo local con HTTPS y **streaming móvil en red local**.

### Uso:
```bash
./start-local-https.bat
```

### Proceso Automático:
1. **Detecta IP local** automáticamente
2. **Genera certificados SSL** si no existen
3. **Configura HTTPS** en backend y frontends
4. **Actualiza CORS** para HTTP y HTTPS
5. **Inicia servicios** con SSL habilitado

### Características:
- 🔒 **HTTPS/WSS** con certificados autofirmados
- 📱 **Móvil-ready** en red local (cámara y micrófono)
- 🌍 **Acceso local seguro** para dispositivos móviles
- 🔧 **Generación automática** de certificados SSL
- ⚙️ **Configuración dinámica** de IP
- ✅ **URLs**: https://localhost:3000, https://[IP-LOCAL]:3000

---

## 🌐 **PRODUCTION Environment**
Para streaming móvil global con túneles HTTPS.

### Uso:
```bash
./start-prod.bat
```

### Proceso Automático:
1. **Inicia backend** con configuración prod
2. **Crea 3 túneles Cloudflare** automáticamente
3. **Extrae URLs** de los logs de túneles  
4. **Actualiza .env.prod** con URLs reales
5. **Configura CORS** automáticamente
6. **Inicia frontends** con configuración actualizada

### Características:
- 🔒 **HTTPS/WSS** automático
- 📱 **Móvil-ready** (cámara y micrófono)  
- 🌍 **Acceso global** vía Internet
- 🔧 **CORS automático** para túneles
- ⚙️ **Configuración automática**

---

## 📁 **Archivos de Configuración**

### Backend:
```
backend-local/
├── .env.development      # Configuración local
├── .env.production      # Configuración producción (auto-actualizada)
└── config/
    └── constants.js # Lee variables de entorno
```

### Frontend Admin:
```
frontend-admin/
├── .env.development      # URLs locales
├── .env.production      # URLs túneles (auto-actualizada)
├── vite.config.js  # Permite hosts túneles
└── src/config/
    └── constants.js # Lee VITE_ variables
```

### Frontend Viewer:
```
frontend-viewer/
├── .env.development      # URLs locales  
├── .env.production      # URLs túneles (auto-actualizada)
├── vite.config.js  # Permite hosts túneles
└── src/config/
    └── constants.js # Lee VITE_ variables
```


## ⚡ **Quick Start**

### Para desarrollo local HTTP (IP automática):
```bash
./start-local.bat
```
→ **Detecta automáticamente tu IP local**
→ **Admin Panel**: http://localhost:3000 (crear salas con RoomCreator.jsx)
→ **Viewer**: http://localhost:3001 (ver streams con RoomViewer.jsx)  
→ **Acceso desde red local**: http://[TU-IP-LOCAL]:3000

### Para desarrollo local HTTPS (móvil-ready):
```bash
./start-local-https.bat
```
→ **Genera certificados SSL automáticamente**
→ **Admin HTTPS**: https://localhost:3000 (crear salas desde móvil)
→ **Viewer HTTPS**: https://localhost:3001 (ver desde móvil)
→ **Testing móvil local**: https://[TU-IP-LOCAL]:3000

### Solo actualizar IP local:
```bash
./update-local-config.bat
```
→ **Actualiza configuración** sin reiniciar servicios

### Para streaming móvil global:
```bash  
./start-prod.bat
```
→ **Crea túneles Cloudflare automáticamente**
→ **Admin Global**: https://admin-xyz.trycloudflare.com
→ **Viewer Global**: https://viewer-xyz.trycloudflare.com
→ **Funciona desde cualquier lugar del mundo**

### Para detener servicios:
```bash
# Detener solo ambiente local
./stop-local.bat

# Detener solo ambiente producción  
./stop-prod.bat

# Detener todos los servicios (opción global)
./stop-system.bat
```

### 🐛 **Para debugging:**
```bash
# Agregar ?debug=true a cualquier URL del viewer
http://localhost:3001?debug=true
https://viewer-xyz.trycloudflare.com?debug=true
```

---

## 🎯 **Componentes del Sistema**

### ✅ **Componentes Activos:**

**Frontend Admin (puerto 3000/4000):**
- `RoomCreator.jsx` - **Principal** - Crear y manejar salas
- `MultiStreamManager.jsx` - Streaming multi-sala avanzado  
- `MobileStreamHelper.jsx` - Helper para streaming móvil

**Frontend Viewer (puerto 3001/4001):**
- `RoomViewer.jsx` - **Principal** - Visualizar streams por sala

**Backend (puerto 5001/6001):**
- `server.js` - Servidor principal con soporte multi-sala
- `webrtc-signaling.js` - Lógica de señalización WebRTC
- `generate-cert.js` - Generador de certificados SSL

### ❌ **Componentes Deprecados:**
- `WebRTCStreamer.jsx` - Versión simple del admin (reemplazado por RoomCreator)
- `WebRTCViewer.jsx` - Versión simple del viewer (reemplazado por RoomViewer)

### 🔄 **Scripts de Automatización:**
- `start-local.bat` - Desarrollo local HTTP
- `start-local-https.bat` - Desarrollo local HTTPS  
- `start-prod.bat` - Producción con túneles
- `stop-local.bat` - Parar ambiente local
- `stop-prod.bat` - Parar ambiente producción
- `stop-system.bat` - Parar todo (emergencia)

---

## 🔧 **Variables de Entorno**


---

## 📊 **URLs de Ejemplo**

### LOCAL:
- 📱 **Streamer**: http://localhost:3000
- 📺 **Viewer**: http://localhost:3001
- ⚙️ **API**: http://192.168.1.37:5001

### PRODUCTION (Auto-generadas):
- 📱 **Mobile Streamer**: https://admin-random.trycloudflare.com
- 📺 **Mobile Viewer**: https://viewer-random.trycloudflare.com  
- ⚙️ **Backend API**: https://backend-random.trycloudflare.com

---

## 🚨 **Notas Importantes**

### Para LOCAL (HTTP):
- ✅ Perfecto para desarrollo rápido
- ✅ Acceso desde dispositivos en la misma red
- ❌ No funciona para móviles (requiere HTTPS)

### Para LOCAL HTTPS:
- ✅ **Desarrollo con móviles** en red local
- ✅ Testing completo de funcionalidad móvil
- ✅ Certificados SSL automáticos
- ✅ No requiere Internet ni túneles
- ⚠️ Advertencias de certificado autofirmado

### Para PRODUCTION:
- ✅ Streaming móvil completo global
- ✅ Acceso via Internet desde cualquier lugar
- ✅ HTTPS/WSS automático con túneles
- ⚠️ URLs cambian cada vez que se ejecuta
- ⚠️ Mantener la consola abierta para conservar túneles

---

## 🔄 **Migración Automática**

El sistema detecta automáticamente el ambiente:
- `NODE_ENV=local` → Usa `.env.development`
- `NODE_ENV=prod` → Usa `.env.prod`

Los archivos `constants.js` leen las variables de entorno correspondientes automáticamente.

---

## ✅ **Verificación**

### LOCAL:
```bash
curl http://192.168.1.37:5001/health
```

### PRODUCTION:
```bash
curl https://backend-xyz.trycloudflare.com/health
```

---

## 🌐 **Casos de Uso por Ambiente**

### 🏠 LOCAL HTTP Environment - Perfecto para:
- ✅ **Desarrollo rápido** sin certificados
- ✅ **Testing básico** en desktop/laptops
- ✅ **Demos locales** para equipo técnico
- ✅ **Debugging** en navegadores de escritorio
- ❌ **NO para móviles** (requiere HTTPS)

### 🔒 LOCAL HTTPS Environment - Perfecto para:
- ✅ **Desarrollo móvil completo** en red local
- ✅ **Testing de cámara/micrófono** móvil
- ✅ **Demos móviles** sin Internet
- ✅ **Desarrollo cross-device** seguro
- ✅ **Testing WebRTC** completo offline
- ✅ **Cambio de ubicaciones** (oficina, casa, café)

### 🌍 PRODUCTION Environment - Perfecto para:
- ✅ **Streaming móvil global** via Internet
- ✅ **Demos remotos** para clientes
- ✅ **Testing desde cualquier ubicación**
- ✅ **Presentaciones en línea** globales
- ✅ **Desarrollo móvil** con acceso público

---

## 🔄 **Detección de IP - Casos Especiales**

### Si cambias de WiFi:
```bash
# El sistema detecta automáticamente la nueva IP
./start-local.bat
# O solo actualizar sin iniciar servicios
./update-local-config.bat
```

### Si tienes múltiples interfaces de red:
- El sistema prioriza WiFi > Ethernet > otras interfaces
- Detecta automáticamente la interfaz activa más apropiada


---

## 🔄 **Migration Guide (Scripts Deprecated)**

### ⚠️ **Deprecated Scripts:**
- ~~`start-system.bat`~~ → **Use `start-local.bat`** (redirects automatically)
- ~~`verify-system.bat`~~ → **REMOVED** (no longer needed)


### 🔄 **Migration Commands:**
```bash
# OLD WAY (deprecated)
./start-system.bat

# NEW WAY (recommended)
./start-local.bat    # For local development
./start-prod.bat     # For mobile streaming
```

---

**🎉 ¡Sistema inteligente listo para streaming ultra-low latency en cualquier red!**