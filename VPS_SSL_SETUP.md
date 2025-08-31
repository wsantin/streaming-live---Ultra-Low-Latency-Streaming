# 🔒 Configuración SSL para LiveKit VPS
# =====================================

## 📋 Prerrequisitos
- VPS con IP: 5.78.143.204
- LiveKit instalado y funcionando
- Acceso SSH al servidor

## 🛠️ Opción 1: Certificado Auto-firmado Seguro (1 año)
```bash
# Conectar al VPS
ssh root@5.78.143.204

# Crear directorio para certificados
mkdir -p /etc/livekit/certs
cd /etc/livekit/certs

# Generar clave privada RSA 4096 bits (más segura)
openssl genrsa -out livekit.key 4096

# Crear archivo de configuración para el certificado
cat > livekit.conf <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = LiveKit Streaming
OU = Streaming Department
CN = 5.78.143.204

[v3_req]
keyUsage = critical, digitalSignature, keyAgreement
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1 = 5.78.143.204
DNS.1 = localhost
EOF

# Generar certificado auto-firmado válido por 365 días
openssl req -new -x509 -sha256 -key livekit.key -out livekit.crt -days 365 -config livekit.conf

# Verificar certificado
openssl x509 -in livekit.crt -text -noout

# Establecer permisos seguros
chmod 600 livekit.key
chmod 644 livekit.crt
```

## 🔧 Configurar LiveKit con SSL

### 1. Editar configuración de LiveKit
```bash
nano /etc/livekit/livekit.yaml
```

### 2. Añadir configuración SSL:
```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

# Configuración SSL
tls:
  cert: /etc/livekit/certs/livekit.crt
  key: /etc/livekit/certs/livekit.key
  # Habilitar solo protocolos seguros
  min_version: 1.2

# Configuración de WebRTC
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  # IP pública del VPS
  external_ip: 5.78.143.204

# TURN server con SSL
turn:
  enabled: true
  domain: 5.78.143.204
  tls_port: 5349
  udp_port: 3478
  external_tls: true
  cert: /etc/livekit/certs/livekit.crt
  key: /etc/livekit/certs/livekit.key
```

## 🚀 Reiniciar LiveKit con SSL
```bash
# Detener LiveKit
systemctl stop livekit

# O si usas el binario directamente
pkill -f livekit-server

# Iniciar con nueva configuración
./livekit-server --config=/etc/livekit/livekit.yaml

# O como servicio
systemctl start livekit
systemctl status livekit
```

## ✅ Verificar SSL
```bash
# Test conexión SSL
openssl s_client -connect 5.78.143.204:7880 -servername 5.78.143.204

# Verificar certificado
echo | openssl s_client -connect 5.78.143.204:7880 2>/dev/null | openssl x509 -noout -dates
```

## 🌐 Configuración Frontend para SSL Auto-firmado

### En los navegadores de desarrollo:
1. Visitar https://5.78.143.204:7880
2. Aceptar el certificado auto-firmado
3. El navegador recordará la excepción

### Para producción móvil:
```javascript
// frontend-admin/src/config/constants.js
export const LIVEKIT_URL = 'wss://5.78.143.204:7880'

// Configuración adicional para WebRTC
export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turns:5.78.143.204:5349',
      username: 'livekit',
      credential: 'TurnServer2025SecretKey789'
    }
  ],
  // Importante para certificados auto-firmados
  iceTransportPolicy: 'all'
}
```

## 🔐 Opción 2: Let's Encrypt (Si tienes dominio)
```bash
# Instalar certbot
apt-get update
apt-get install certbot

# Generar certificado (necesitas un dominio apuntando al VPS)
certbot certonly --standalone -d tudominio.com

# Los certificados estarán en:
# /etc/letsencrypt/live/tudominio.com/fullchain.pem
# /etc/letsencrypt/live/tudominio.com/privkey.pem

# Actualizar livekit.yaml
tls:
  cert: /etc/letsencrypt/live/tudominio.com/fullchain.pem
  key: /etc/letsencrypt/live/tudominio.com/privkey.pem

# Auto-renovación
crontab -e
# Añadir:
0 0 * * * certbot renew --quiet && systemctl restart livekit
```

## 🛡️ Firewall para SSL
```bash
# Abrir puertos necesarios
ufw allow 7880/tcp   # LiveKit HTTPS/WSS
ufw allow 7881/tcp   # LiveKit TCP
ufw allow 3478/udp   # TURN UDP
ufw allow 5349/tcp   # TURN TLS
ufw allow 50000:60000/udp # WebRTC media

# Verificar
ufw status
```

## 📱 Solución para Móviles

### Android:
1. Exportar certificado:
```bash
cat /etc/livekit/certs/livekit.crt
```
2. Enviar por email e instalar en Settings > Security > Install certificates

### iOS:
1. Crear perfil de configuración con el certificado
2. Instalar vía Safari o MDM

### Alternativa Universal:
Usar un servicio proxy inverso con SSL válido:
- Cloudflare Tunnel (recomendado)
- Nginx con Let's Encrypt
- Traefik con auto-SSL

## 🔍 Debugging SSL
```bash
# Ver logs de LiveKit
tail -f /var/log/livekit.log

# Test WebSocket con SSL
wscat -c wss://5.78.143.204:7880

# Verificar puertos abiertos
netstat -tlnp | grep livekit
```

## ⚡ Script de Instalación Automática
```bash
#!/bin/bash
# setup-ssl.sh

# Variables
LIVEKIT_DIR="/etc/livekit"
CERT_DIR="$LIVEKIT_DIR/certs"
VPS_IP="5.78.143.204"

# Crear directorios
mkdir -p $CERT_DIR
cd $CERT_DIR

# Generar certificados
openssl genrsa -out livekit.key 4096
openssl req -new -x509 -sha256 -key livekit.key -out livekit.crt -days 365 \
  -subj "/C=US/ST=State/L=City/O=LiveKit/CN=$VPS_IP" \
  -addext "subjectAltName=IP:$VPS_IP,DNS:localhost"

# Permisos
chmod 600 livekit.key
chmod 644 livekit.crt

echo "✅ SSL configurado correctamente"
echo "📁 Certificados en: $CERT_DIR"
echo "🔐 Clave: livekit.key"
echo "📜 Certificado: livekit.crt"
```

## 📝 Notas Importantes
1. **Certificados auto-firmados** funcionan bien para desarrollo y producción interna
2. **Para producción pública**, considera Let's Encrypt o un certificado comercial
3. **WebRTC requiere HTTPS/WSS** en producción (no HTTP/WS)
4. **Los navegadores modernos** requieren aceptar explícitamente certificados auto-firmados
5. **LiveKit con SSL** mejora seguridad y compatibilidad con navegadores

## 🚨 Troubleshooting
- **Error: "certificate verify failed"**: Normal con auto-firmado, aceptar en navegador
- **WebSocket connection failed**: Verificar firewall y puertos
- **TURN connection failed**: Verificar credenciales y puertos UDP
- **Mobile no conecta**: Instalar certificado en dispositivo o usar proxy con SSL válido