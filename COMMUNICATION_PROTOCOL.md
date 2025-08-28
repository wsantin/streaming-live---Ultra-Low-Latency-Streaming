# 🔄 PROTOCOLO DE COMUNICACIÓN - STREAMING SYSTEM

## 📡 EVENTOS SOCKET.IO

### 🎬 **ADMIN → BACKEND**

#### `stream:start`
```json
{
  "roomName": "mi-sala",
  "streamerName": "admin-123"
}
```
**Respuesta**: `stream:started` o `stream:error`

#### `stream:stop`
```json
{
  "roomName": "mi-sala"
}
```
**Respuesta**: `stream:stopped` o `stream:error`

#### `stream:get-status`
```json
{}
```
**Respuesta**: `stream:status`

---

### 👁️ **VIEWER → BACKEND**

#### `rooms:list`
```json
{}
```
**Respuesta**: `rooms:update`

#### `room:join`
```json
{
  "roomName": "mi-sala",
  "viewerName": "viewer-456"
}
```
**Respuesta**: `room:joined` o `room:error`

#### `room:leave`
```json
{
  "roomName": "mi-sala"
}
```
**Respuesta**: `room:left`

---

### 📢 **BACKEND → TODOS (BROADCAST)**

#### `rooms:update`
```json
{
  "rooms": [
    {
      "name": "mi-sala",
      "participants": 5,
      "createdAt": "2025-01-XX",
      "isActive": true,
      "streamerName": "admin-123"
    }
  ],
  "total": 1
}
```

#### `room:viewer-joined`
```json
{
  "roomName": "mi-sala",
  "viewerName": "viewer-456",
  "totalViewers": 6
}
```

#### `room:viewer-left`
```json
{
  "roomName": "mi-sala", 
  "viewerName": "viewer-456",
  "totalViewers": 5
}
```

---

## 🎯 **RESPUESTAS ESPECÍFICAS**

### **Admin Responses**

#### `stream:started`
```json
{
  "success": true,
  "roomName": "mi-sala",
  "livekitToken": "eyJ...",
  "livekitUrl": "ws://localhost:7880"
}
```

#### `stream:error`
```json
{
  "success": false,
  "error": "Room already exists",
  "code": "ROOM_EXISTS"
}
```

#### `stream:stopped`
```json
{
  "success": true,
  "roomName": "mi-sala"
}
```

#### `stream:status`
```json
{
  "isStreaming": true,
  "roomName": "mi-sala",
  "viewers": 5,
  "startedAt": "2025-01-XX",
  "duration": 120000
}
```

### **Viewer Responses**

#### `room:joined`
```json
{
  "success": true,
  "roomName": "mi-sala",
  "livekitToken": "eyJ...",
  "livekitUrl": "ws://localhost:7880",
  "streamerName": "admin-123"
}
```

#### `room:error`
```json
{
  "success": false,
  "error": "Room not found",
  "code": "ROOM_NOT_FOUND"
}
```

#### `room:left`
```json
{
  "success": true,
  "roomName": "mi-sala"
}
```

---

## 💾 **PERSISTENCIA (localStorage)**

### **Admin**
```json
{
  "sessionId": "admin-123",
  "currentStream": {
    "roomName": "mi-sala",
    "startedAt": "2025-01-XX",
    "isActive": true
  }
}
```

### **Viewer**
```json
{
  "sessionId": "viewer-456", 
  "currentRoom": "mi-sala",
  "joinedAt": "2025-01-XX"
}
```

---

## 🔄 **FLUJOS DE TRABAJO**

### **Iniciar Stream (Admin)**
1. Admin: `stream:start` → Backend
2. Backend: Crear sala en LiveKit
3. Backend: `stream:started` → Admin
4. Backend: `rooms:update` → Todos (broadcast)
5. Admin: Guardar sesión en localStorage

### **Ver Stream (Viewer)**
1. Viewer: `rooms:list` → Backend
2. Backend: `rooms:update` → Viewer
3. Viewer: Mostrar lista de salas
4. Usuario: Click en sala
5. Viewer: `room:join` → Backend
6. Backend: `room:joined` → Viewer
7. Backend: `room:viewer-joined` → Todos (broadcast)
8. Viewer: Conectar a LiveKit con token

### **Terminar Stream (Admin)**
1. Admin: `stream:stop` → Backend
2. Backend: Eliminar sala de LiveKit
3. Backend: `stream:stopped` → Admin
4. Backend: `rooms:update` → Todos (broadcast)
5. Admin: Limpiar localStorage

---

## 🛡️ **MANEJO DE ERRORES**

### **Códigos de Error**
- `ROOM_EXISTS`: Sala ya existe
- `ROOM_NOT_FOUND`: Sala no encontrada
- `LIVEKIT_ERROR`: Error del servidor LiveKit
- `INVALID_TOKEN`: Token inválido
- `CONNECTION_FAILED`: Fallo de conexión

### **Reconexión Automática**
- Admin: Verificar localStorage al iniciar
- Si hay sesión activa: Intentar reconectar
- Viewer: Solo solicitar lista de salas actualizada