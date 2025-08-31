# 🚀 INSTALADOR LIVEKIT SIMPLE - 2 PASOS

## 📋 ARCHIVOS:

- **`1-install-services.sh`** - Instala servicios base (5-8 min)  
- **`2-install-livekit.sh`** - Instala LiveKit server (3-5 min)

## 🚀 INSTRUCCIONES:

### **PASO 1: Conectar al VPS**
```bash
ssh root@5.78.143.204
```

### **PASO 2: Crear archivos**
```bash
# Crear archivo 1
nano 1-install-services.sh
# Pegar contenido, Ctrl+X, Y, Enter

# Crear archivo 2  
nano 2-install-livekit.sh
# Pegar contenido, Ctrl+X, Y, Enter
```

### **PASO 3: Ejecutar en orden**
```bash
# Ejecutar paso 1
chmod +x 1-install-services.sh
./1-install-services.sh

# Ejecutar paso 2
chmod +x 2-install-livekit.sh
./2-install-livekit.sh
```

## ✅ RESULTADO:

**URL de conexión:** `wss://5.78.143.204`

**Credenciales:**
- API Key: `APIwTqW8EBDZ3nk`
- API Secret: `4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM`

**Comandos útiles:**
```bash
cd /opt/livekit-server
./test.sh      # Probar servicios
./start.sh     # Iniciar todo
./stop.sh      # Detener todo
./logs.sh all  # Ver logs
```

## 🎯 QUE INSTALA CADA PASO:

### **Paso 1:**
- Firewall UFW
- Redis Server
- TURN Server
- Nginx
- Certificados SSL

### **Paso 2:**  
- LiveKit Server v1.9.0
- Nginx proxy SSL/WSS
- Scripts de gestión
- Test automático

¡Simple y directo! 🚀