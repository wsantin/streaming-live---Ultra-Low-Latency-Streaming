#!/bin/bash

# ================================================================
# 🚀 1. INSTALACIÓN DE SERVICIOS BASE
# IP: 5.78.143.204
# Instala: Redis, TURN, Nginx, SSL
# ================================================================

set -e

# Variables globales
VPS_IP="5.78.143.204"
REDIS_PASSWORD="Redis2025UltraSecurePassword123!"
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
echo -e "${CYAN}🚀 1. INSTALACIÓN SERVICIOS BASE${NC}"
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

# ===============================================
# CONFIGURAR FIREWALL
# ===============================================
log "🛡️ [1/5] Configurando Firewall..."
ufw --force disable

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 443/tcp comment 'HTTPS/WSS'
ufw allow 50000:60000/udp comment 'WebRTC Media'
ufw allow 3478/udp comment 'TURN UDP'
ufw allow 3478/tcp comment 'TURN TCP'
ufw allow 5349/tcp comment 'TURN TLS'

ufw --force enable
log "✅ Firewall configurado"

# ===============================================
# INSTALAR Y CONFIGURAR REDIS
# ===============================================
log "🗄️ [2/5] Instalando Redis..."

apt-get install -y redis-server

cat > /etc/redis/redis.conf << EOF
bind 127.0.0.1
port 6379
requirepass $REDIS_PASSWORD
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
dir /var/lib/redis
logfile /var/log/redis/redis-server.log
supervised systemd
tcp-keepalive 300
timeout 0
tcp-backlog 511
maxclients 10000
databases 16
loglevel notice
syslog-enabled no
EOF

systemctl enable redis-server
systemctl restart redis-server

sleep 2
redis-cli -a $REDIS_PASSWORD ping || error "Redis no funciona"
log "✅ Redis funcionando"

# ===============================================
# CONFIGURAR TURN SERVER
# ===============================================
log "🔄 [3/5] Configurando TURN Server..."

apt-get install -y coturn

cat > /etc/turnserver.conf << EOF
listening-port=3478
tls-listening-port=5349
listening-ip=$VPS_IP
external-ip=$VPS_IP
listening-ip=0.0.0.0

fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET

min-port=50000
max-port=60000

denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
no-tcp-relay

realm=$VPS_IP
server-name=$VPS_IP

stale-nonce=600
no-multicast-peers
no-loopback-peers
user-quota=12
total-quota=1200

verbose
max-bps=100000
bps-capacity=0
EOF

echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn
systemctl enable coturn
systemctl restart coturn
log "✅ TURN Server funcionando"

# ===============================================
# INSTALAR NGINX
# ===============================================
log "🌐 [4/5] Instalando Nginx..."

apt-get install -y nginx
mkdir -p $SSL_DIR
systemctl enable nginx
log "✅ Nginx instalado"

# ===============================================
# GENERAR CERTIFICADOS SSL
# ===============================================
log "🔒 [5/5] Generando certificados SSL..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout $SSL_DIR/livekit.key \
    -out $SSL_DIR/livekit.crt \
    -subj "/C=US/ST=CA/L=San Francisco/O=LiveKit/OU=Streaming/CN=$VPS_IP" \
    -addext "subjectAltName=IP:$VPS_IP"

openssl dhparam -out $SSL_DIR/dhparam.pem 2048

chmod 600 $SSL_DIR/*.key
chmod 644 $SSL_DIR/*.crt
chmod 644 $SSL_DIR/dhparam.pem

log "✅ Certificados SSL generados"

# ===============================================
# GUARDAR CREDENCIALES
# ===============================================
mkdir -p $BASE_DIR
cat > $BASE_DIR/CREDENCIALES-PASO1.txt << EOF
# ================================================================
# CREDENCIALES - PASO 1 COMPLETADO
# Fecha: $(date)
# ================================================================

IP: $VPS_IP
REDIS_PASSWORD=$REDIS_PASSWORD
TURN_SECRET=$TURN_SECRET

# SERVICIOS INSTALADOS:
✅ Firewall UFW configurado
✅ Redis Server funcionando
✅ TURN Server activo
✅ Nginx instalado
✅ Certificados SSL generados

# SIGUIENTE:
Ejecutar: ./2-install-livekit.sh
EOF

chmod 600 $BASE_DIR/CREDENCIALES-PASO1.txt

clear
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✅ PASO 1 COMPLETADO${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "${CYAN}✅ SERVICIOS INSTALADOS:${NC}"
echo -e "   • Firewall UFW"
echo -e "   • Redis Server"
echo -e "   • TURN Server (coturn)"
echo -e "   • Nginx"
echo -e "   • Certificados SSL"
echo ""
echo -e "${CYAN}📋 SIGUIENTE PASO:${NC}"
echo -e "${GREEN}./2-install-livekit.sh${NC}"
echo ""
echo -e "${WHITE}💾 Credenciales: ${YELLOW}$BASE_DIR/CREDENCIALES-PASO1.txt${NC}"