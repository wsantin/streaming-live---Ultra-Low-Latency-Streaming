#!/bin/bash

# ================================================================
# 🚀 2. INSTALACIÓN LIVEKIT SERVER
# IP: 5.78.143.204
# Instala: LiveKit Server, Nginx proxy, Scripts
# ================================================================

set -e

# Variables globales
VPS_IP="5.78.143.204"
REDIS_PASSWORD="Redis2025UltraSecurePassword123!"
LIVEKIT_API_KEY="APIwTqW8EBDZ3nk"
LIVEKIT_API_SECRET="4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM"
TURN_SECRET="TurnServer2025SecretKey789"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Directorio base
BASE_DIR="/opt/livekit-server"
SSL_DIR="/etc/nginx/ssl"

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}🚀 2. INSTALACIÓN LIVEKIT SERVER${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "${WHITE}IP: ${YELLOW}$VPS_IP${NC}"
echo ""

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Verificar paso 1
if [ ! -f "$BASE_DIR/CREDENCIALES-PASO1.txt" ]; then
    error "Paso 1 no completado. Ejecuta: ./1-install-services.sh"
fi

# ===============================================
# DESCARGAR LIVEKIT SERVER
# ===============================================
log "📥 [1/4] Descargando LiveKit Server..."

mkdir -p $BASE_DIR/{config,logs,data,bin}
cd $BASE_DIR/bin

LIVEKIT_VERSION="1.9.0"
wget --timeout=30 --tries=3 --progress=bar:force \
    "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz"

tar -xzf "livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz"
rm "livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz"
chmod +x livekit-server

log "✅ LiveKit Server descargado"

# ===============================================
# CONFIGURAR LIVEKIT
# ===============================================
log "⚙️ [2/4] Configurando LiveKit Server..."

cat > $BASE_DIR/config/livekit.yaml << EOF
port: 7880
bind_addresses:
  - "127.0.0.1"

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  node_ip: "$VPS_IP"
  enable_loopback_candidate: true
  
  # Configuración optimizada para 4K
  packet_buffer_size_video: 1500
  packet_buffer_size_audio: 500
  
  stun_servers:
    - stun.l.google.com:19302
    - stun1.l.google.com:19302
  
  turn_servers:
    - host: "$VPS_IP"
      port: 3478
      protocol: "udp"
      username: "livekit"
      credential: "$TURN_SECRET"
  
keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET

room:
  empty_timeout: 300
  max_participants: 1000
  enable_remote_unmute: true
  auto_create: true
  # Configuración para 4K
  enabled_codecs:
    - mime: video/vp8
    - mime: video/h264
    - mime: video/vp9
    - mime: audio/opus

redis:
  address: "127.0.0.1:6379"
  password: "$REDIS_PASSWORD"
  db: 0
  use_tls: false
  pool_size: 10

logging:
  level: info
  json: false

development: false
EOF

# Crear servicio systemd
cat > /etc/systemd/system/livekit.service << EOF
[Unit]
Description=LiveKit Server
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=$BASE_DIR
ExecStart=$BASE_DIR/bin/livekit-server --config=$BASE_DIR/config/livekit.yaml
Restart=always
RestartSec=10
StandardOutput=append:$BASE_DIR/logs/livekit.log
StandardError=append:$BASE_DIR/logs/livekit.error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable livekit
systemctl start livekit

log "✅ LiveKit Server configurado"

# ===============================================
# CONFIGURAR NGINX PROXY
# ===============================================
log "🔐 [3/4] Configurando Nginx proxy SSL..."

cat > /etc/nginx/sites-available/livekit << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name VPS_IP_PLACEHOLDER;

    ssl_certificate /etc/nginx/ssl/livekit.crt;
    ssl_certificate_key /etc/nginx/ssl/livekit.key;
    ssl_dhparam /etc/nginx/ssl/dhparam.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:TLS:2m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    
    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
        
        proxy_buffering off;
        proxy_cache off;
        proxy_buffer_size 4k;
        proxy_buffers 4 4k;
        
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Forwarded-Host $host;
        
        client_max_body_size 100M;
        proxy_redirect off;
        proxy_intercept_errors off;
    }
    
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:7880/health;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name VPS_IP_PLACEHOLDER;
    return 301 https://$server_name$request_uri;
}
EOF

sed -i "s/VPS_IP_PLACEHOLDER/$VPS_IP/g" /etc/nginx/sites-available/livekit

ln -sf /etc/nginx/sites-available/livekit /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t || error "Error en configuración Nginx"
systemctl restart nginx

log "✅ Nginx proxy configurado"

# ===============================================
# CREAR SCRIPTS DE GESTIÓN
# ===============================================
log "📝 [4/4] Creando scripts de gestión..."

cd $BASE_DIR

# Script de inicio
cat > start.sh << 'EOF'
#!/bin/bash
echo "🚀 Iniciando LiveKit Server..."
systemctl start redis-server
systemctl start coturn
systemctl start livekit
systemctl start nginx
echo "✅ Todos los servicios iniciados"
echo ""
echo "📡 URL de conexión:"
echo "   🔒 WSS: wss://VPS_IP_PLACEHOLDER"
EOF

# Script de parada
cat > stop.sh << 'EOF'
#!/bin/bash
echo "🛑 Deteniendo servicios..."
systemctl stop nginx
systemctl stop livekit
systemctl stop coturn
systemctl stop redis-server
echo "✅ Servicios detenidos"
EOF

# Script de test
cat > test.sh << EOF
#!/bin/bash
echo "🧪 TESTING LIVEKIT SERVER"
echo "========================"

echo -n "Redis: "
if redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo -n "TURN: "
if systemctl is-active --quiet coturn; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo -n "LiveKit: "
if systemctl is-active --quiet livekit; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo -n "Nginx: "
if systemctl is-active --quiet nginx; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo -n "LiveKit Local: "
if curl -s http://127.0.0.1:7880/ > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo -n "HTTPS/WSS: "
if curl -k -s https://$VPS_IP/ > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ ERROR"
fi

echo ""
echo "📡 URL de conexión:"
echo "   🔒 WSS: wss://$VPS_IP"
EOF

# Script de logs
cat > logs.sh << 'EOF'
#!/bin/bash
case $1 in
    redis) journalctl -f -u redis-server ;;
    livekit) tail -f /opt/livekit-server/logs/livekit.log ;;
    turn) journalctl -f -u coturn ;;
    nginx) tail -f /var/log/nginx/access.log /var/log/nginx/error.log ;;
    all) tail -f /opt/livekit-server/logs/livekit.log /var/log/nginx/error.log ;;
    *) echo "Uso: ./logs.sh [redis|livekit|turn|nginx|all]" ;;
esac
EOF

sed -i "s/VPS_IP_PLACEHOLDER/$VPS_IP/g" *.sh
chmod +x *.sh

# ===============================================
# CREDENCIALES FINALES
# ===============================================
cat > CREDENCIALES.txt << EOF
# ================================================================
# CREDENCIALES LIVEKIT SERVER
# Fecha: $(date)
# ================================================================

IP: $VPS_IP

# LiveKit API
API_KEY=$LIVEKIT_API_KEY
API_SECRET=$LIVEKIT_API_SECRET

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# TURN
TURN_SECRET=$TURN_SECRET

# URL DE CONEXIÓN
WSS=wss://$VPS_IP

# COMANDOS ÚTILES
cd /opt/livekit-server
./start.sh     # Iniciar
./stop.sh      # Detener
./test.sh      # Test
./logs.sh all  # Logs
EOF

chmod 600 CREDENCIALES.txt
rm -f CREDENCIALES-PASO1.txt

clear
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✅ INSTALACIÓN COMPLETADA${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "${CYAN}🔑 CREDENCIALES:${NC}"
echo -e "   ${YELLOW}API Key:${NC} $LIVEKIT_API_KEY"
echo -e "   ${YELLOW}API Secret:${NC} $LIVEKIT_API_SECRET"
echo ""
echo -e "${CYAN}📡 URL DE CONEXIÓN:${NC}"
echo -e "   🔒 ${GREEN}wss://$VPS_IP${NC}"
echo ""
echo -e "${CYAN}🚀 COMANDOS:${NC}"
echo -e "   ${WHITE}cd /opt/livekit-server${NC}"
echo -e "   ${WHITE}./test.sh${NC}      - Verificar servicios"
echo -e "   ${WHITE}./start.sh${NC}     - Iniciar todo"
echo -e "   ${WHITE}./stop.sh${NC}      - Detener todo"
echo ""
echo -e "${WHITE}💾 Credenciales: ${YELLOW}/opt/livekit-server/CREDENCIALES.txt${NC}"
echo ""
echo -e "${GREEN}¡Servidor listo! 🚀${NC}"

# Test automático
./test.sh