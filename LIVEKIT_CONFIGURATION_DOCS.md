# Documentación de Configuración LiveKit Nativo

## Documentación para configuración de LiveKit SFU Nativo

⚠️ **ADVERTENCIA IMPORTANTE SOBRE PROCESOS**:
Nunca ejecutes `taskkill /f /im node.exe` sin filtros específicos, ya que esto matará TODOS los procesos Node.js incluyendo Claude Code.
Siempre usa comandos más específicos o excluye los procesos de Claude Code al detener servicios.
Por ejemplo, usa `taskkill /f /pid [PID_ESPECÍFICO]` o detiene servicios por nombre específico.

## 🚀 **Configuración Actual: LiveKit Nativo (Simplificada)**

**LiveKit Nativo NO requiere TURN server** para localhost. La configuración actual está optimizada para:
- ✅ **Conexiones directas localhost**
- ✅ **STUN servers públicos** para NAT básico
- ✅ **Host candidates** para máximo rendimiento
- ❌ **NO usa TURN server** (innecesario para localhost)

### Métodos de Configuración

LiveKit soporta dos formas principales de pasar configuración:
1. **Config file**: usando flag `--config`
2. **Environment variable**: usando `LIVEKIT_CONFIG` con el body YAML completo

### Variables de Entorno Principales

#### Core LiveKit Server Variables
- **LIVEKIT_CONFIG**: Contiene la configuración YAML completa como variable de entorno
- **LIVEKIT_API_KEY**: API key para autenticación del servidor LiveKit
- **LIVEKIT_API_SECRET**: API secret para autenticación del servidor LiveKit
- **LIVEKIT_URL**: URL del servidor LiveKit para conexiones de clientes

### Configuración Redis Docker (Solo)

```yaml
# Redis Only - Docker Compose Configuration
# LiveKit ahora se ejecuta nativo con livekit-server.exe

services:
  # Redis para cache y sessions
  redis:
    image: redis:6-alpine
    container_name: streaming-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
    command: redis-server --bind 0.0.0.0 --port 6379 --protected-mode no --maxmemory 800mb --maxmemory-policy allkeys-lru
```

### 📋 **Configuración YAML Actual (livekit-native-config.yaml)**

```yaml
# Configuración optimizada para LiveKit Nativo localhost
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50010
  use_external_ip: false  # ✅ localhost optimizado
keys:
  devkey1000: ultralowlatency2025secretkeyforlivekitsfuserver
room:
  auto_create: true
  max_participants: 1000
redis:
  address: localhost:6379
logging:
  level: info
  json: false
```

### 🚫 **Configuración TURN NO UTILIZADA** 

**IMPORTANTE**: La configuración anterior con TURN server ha sido **removida** porque:
- ❌ LiveKit nativo no necesita TURN para localhost
- ❌ TURN server aumenta latencia innecesariamente
- ❌ Configuración TURN incorrecta causaba problemas de conectividad
- ✅ Host candidates (conexión directa) son más eficientes

### Comando LiveKit Nativo

```bash
# Ejecutar LiveKit nativo con archivo de configuración
cd livekit-native
./livekit-server.exe --config=../livekit-native-config.yaml

# O desde raíz del proyecto
./livekit-native/livekit-server.exe --config=livekit-native-config.yaml
```

### Consideraciones Importantes para LiveKit Nativo

1. **Configuración YAML**: Usar archivo `livekit-native-config.yaml` para configurar el servidor
2. **Port ranges**: Usar rangos UDP (50000-50010) para conexiones WebRTC
3. **Redis**: Solo Redis en Docker para cache y sessions
4. **Ejecutable nativo**: Mayor rendimiento que Docker en Windows
5. **TURN**: LiveKit incluye servidor TURN integrado

### 🔧 **Configuración Frontend (Simplificada)**

**Admin y Viewer** ahora usan configuración ICE simplificada:

```javascript
// Configuración WebRTC para Admin y Viewer
rtcConfig: {
  iceServers: [
    // ✅ STUN servers públicos (gratuitos)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceTransportPolicy: 'all' // ✅ Permite host candidates (localhost)
}
```

### Configuración Backend Integration

En el backend, la configuración se lee desde constants.js:

```javascript
// backend-local/config/constants.js
LIVEKIT: {
  HOST: 'ws://localhost:7880',
  API_KEY: 'devkey1000',
  SECRET: 'ultralowlatency2025secretkeyforlivekitsfuserver'
}
```

### Solución de Problemas Comunes

1. **"one of key-file or keys must be provided"**: 
   - Asegurar formato correcto de keys en YAML
   - Usar LIVEKIT_CONFIG en lugar de variables individuales

2. **Conexión rechazada**:
   - Verificar que el contenedor esté ejecutándose
   - Comprobar puertos disponibles
   - Usar `network_mode: "host"`

3. **Problemas de rendimiento**:
   - Usar host networking
   - Configurar rangos de puertos adecuados
   - Optimizar configuración de Redis

### Optimizaciones de Rendimiento para 1000+ Espectadores

```yaml
# En livekit-native-config.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100  # Más puertos para escalabilidad
  use_external_ip: false
keys:
  devkey1000: ultralowlatency2025secretkeyforlivekitsfuserver
room:
  auto_create: true
  max_participants: 1000
  empty_timeout: 10m
redis:
  address: localhost:6379
logging:
  level: warn  # Balance entre logs y performance
  json: false
```

Esta documentación contiene toda la información necesaria para configurar LiveKit correctamente con Docker y optimizar para 1000+ espectadores simultáneos.