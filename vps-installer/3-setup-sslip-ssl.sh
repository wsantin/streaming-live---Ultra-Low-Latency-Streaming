#!/bin/bash

# ================================================================
# 🆓 3. CONFIGURAR SSL GRATIS CON SSLIP.IO
# IP: 5.78.143.204
# SSL gratuito automático sin dominio
# ================================================================

set -e

VPS_IP="5.78.143.204"
SSLIP_DOMAIN="5.78.143.204.sslip.io"
SSL_DIR="/etc/nginx/ssl"
BASE_DIR="/opt/livekit-server"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}🆓 3. CONFIGURAR SSL GRATIS CON SSLIP.IO${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "${WHITE}IP: ${YELLOW}$VPS_IP${NC}"
echo -e "${WHITE}Dominio sslip.io: ${YELLOW}$SSLIP_DOMAIN${NC}"
echo ""

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# ===============================================
# VERIFICAR DNS PRIMERO
# ===============================================
log "🔍 [1/5] Verificando DNS de sslip.io..."

echo -n "DNS Resolution: "
if nslookup $SSLIP_DOMAIN | grep -q $VPS_IP; then
    echo -e "${GREEN}✅ OK - DNS apunta a $VPS_IP${NC}"
else
    error "❌ sslip.io no apunta a tu IP. Verifica conectividad."
fi

# ===============================================
# INSTALAR CERTBOT (si no existe)
# ===============================================
if ! command -v certbot &> /dev/null; then
    log "📦 [2/5] Instalando Certbot..."
    apt-get update
    apt-get install -y snapd
    snap install core; snap refresh core
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
    log "✅ Certbot instalado"
else
    log "📦 [2/5] Certbot ya instalado"
fi

# ===============================================
# DETENER SERVICIOS TEMPORALMENTE
# ===============================================
log "🛑 [3/5] Deteniendo servicios para certificación..."

systemctl stop nginx || true
systemctl stop livekit || true

# ===============================================
# OBTENER CERTIFICADO SSLIP
# ===============================================
log "🔐 [4/5] Obteniendo certificado SSL de sslip.io..."

# Backup certificado actual
if [ -f "$SSL_DIR/livekit.crt" ]; then
    cp "$SSL_DIR/livekit.crt" "$SSL_DIR/livekit.crt.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$SSL_DIR/livekit.key" "$SSL_DIR/livekit.key.backup.$(date +%Y%m%d_%H%M%S)"
    log "💾 Backup certificado actual creado"
fi

# Abrir puerto 80 temporalmente para validación
ufw allow 80/tcp

# Obtener certificado usando standalone mode
certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email streaming1520@solofertas.com \
    --domains "$SSLIP_DOMAIN" \
    --keep-until-expiring

# Cerrar puerto 80 después de validación
ufw delete allow 80/tcp

# Copiar certificados a directorio nginx
cp "/etc/letsencrypt/live/$SSLIP_DOMAIN/fullchain.pem" "$SSL_DIR/livekit.crt"
cp "/etc/letsencrypt/live/$SSLIP_DOMAIN/privkey.pem" "$SSL_DIR/livekit.key"

# Permisos seguros
chmod 600 "$SSL_DIR/livekit.key"
chmod 644 "$SSL_DIR/livekit.crt"

log "✅ Certificado SSL obtenido y configurado"

# ===============================================
# CONFIGURAR NGINX CON SSLIP
# ===============================================
log "🌐 [5/5] Configurando Nginx con sslip.io SSL..."

cat > /etc/nginx/sites-available/livekit << EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $SSLIP_DOMAIN;

    # Certificados SSL de sslip.io
    ssl_certificate $SSL_DIR/livekit.crt;
    ssl_certificate_key $SSL_DIR/livekit.key;
    
    # Configuración SSL moderna
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:TLS:2m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    
    # Headers de seguridad
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Proxy para LiveKit
    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        
        # Headers para WebSocket
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-Host \$host;
        
        # Timeouts para streaming
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
        
        # Sin buffering para tiempo real
        proxy_buffering off;
        proxy_cache off;
        proxy_buffer_size 4k;
        proxy_buffers 4 4k;
        
        client_max_body_size 100M;
        proxy_redirect off;
        proxy_intercept_errors off;
    }
    
    # Health check
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:7880/health;
    }
    
    # ACME challenge para renovación
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files \$uri =404;
    }
}

# Redirigir HTTP a HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $SSLIP_DOMAIN;
    
    # ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files \$uri =404;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# Redirigir IP a dominio sslip.io
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $VPS_IP _;
    return 301 https://$SSLIP_DOMAIN\$request_uri;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name $VPS_IP _;
    
    ssl_certificate $SSL_DIR/livekit.crt;
    ssl_certificate_key $SSL_DIR/livekit.key;
    
    return 301 https://$SSLIP_DOMAIN\$request_uri;
}
EOF

# Verificar configuración
nginx -t || error "Error en configuración Nginx"

# ===============================================
# CONFIGURAR AUTO-RENOVACIÓN
# ===============================================
log "🔄 Configurando auto-renovación..."

# Script de renovación
cat > /etc/cron.d/certbot-sslip << EOF
# Renovar certificado sslip.io cada 60 días
0 12 * * 0 root certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

# Script manual de renovación
cat > $BASE_DIR/renew-ssl.sh << 'RENEW_EOF'
#!/bin/bash
echo "🔄 Renovando certificado SSL sslip.io..."

# Detener nginx temporalmente
systemctl stop nginx

# Renovar certificado
certbot renew --standalone

# Copiar certificados actualizados
SSL_DIR="/etc/nginx/ssl"
SSLIP_DOMAIN="5.78.143.204.sslip.io"

cp "/etc/letsencrypt/live/$SSLIP_DOMAIN/fullchain.pem" "$SSL_DIR/livekit.crt"
cp "/etc/letsencrypt/live/$SSLIP_DOMAIN/privkey.pem" "$SSL_DIR/livekit.key"

# Permisos
chmod 600 "$SSL_DIR/livekit.key"
chmod 644 "$SSL_DIR/livekit.crt"

# Reiniciar servicios
systemctl start nginx
systemctl reload nginx

echo "✅ Certificado renovado correctamente"
RENEW_EOF

chmod +x $BASE_DIR/renew-ssl.sh

# ===============================================
# REINICIAR SERVICIOS
# ===============================================
log "🚀 Reiniciando servicios..."

systemctl start redis-server
sleep 2
systemctl start coturn  
sleep 2
systemctl start livekit
sleep 3
systemctl start nginx

# Verificar servicios
services=("redis-server" "coturn" "livekit" "nginx")
for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service"; then
        log "✅ $service funcionando"
    else
        error "❌ $service falló"
    fi
done

# ===============================================
# ACTUALIZAR CREDENCIALES
# ===============================================
cat > $BASE_DIR/CREDENCIALES-SSLIP.txt << EOF
# ================================================================
# CREDENCIALES LIVEKIT CON SSLIP.IO SSL
# Fecha: $(date)
# ================================================================

# LiveKit con SSL gratuito
URL_SEGURA=https://$SSLIP_DOMAIN
WSS_URL=wss://$SSLIP_DOMAIN

# LiveKit API (sin cambios)
API_KEY=APIwTqW8EBDZ3nk
API_SECRET=4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM

# Redis
REDIS_PASSWORD=Redis2025UltraSecurePassword123!

# TURN
TURN_SECRET=TurnServer2025SecretKey789

# COMANDOS ÚTILES
cd /opt/livekit-server
./start.sh              # Iniciar servicios
./stop.sh               # Detener servicios  
./test.sh               # Test servicios
./renew-ssl.sh          # Renovar SSL manualmente

# CERTIFICADO
- Proveedor: Let's Encrypt via sslip.io
- Renovación: Automática cada 60 días
- Válido hasta: $(date -d '+90 days')
EOF

chmod 600 $BASE_DIR/CREDENCIALES-SSLIP.txt

# ===============================================
# VERIFICACIÓN FINAL
# ===============================================
echo ""
echo -e "${CYAN}🧪 VERIFICACIÓN FINAL${NC}"
echo "========================"

# Test DNS
echo -n "DNS Resolution: "
if nslookup $SSLIP_DOMAIN | grep -q $VPS_IP; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR - DNS no apunta a $VPS_IP${NC}"
fi

# Test Redis
echo -n "Redis: "
if redis-cli -a "Redis2025UltraSecurePassword123!" ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Test TURN
echo -n "TURN: "
if systemctl is-active --quiet coturn; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Test LiveKit
echo -n "LiveKit: "
if systemctl is-active --quiet livekit; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Test Nginx
echo -n "Nginx: "
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Test LiveKit Local
echo -n "LiveKit Local: "
if curl -s http://127.0.0.1:7880/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Test HTTPS
echo -n "HTTPS/SSL: "
if curl -I -s -k https://$SSLIP_DOMAIN/ | grep -q "HTTP"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ ERROR${NC}"
fi

# Mostrar información del certificado
echo ""
echo -e "${CYAN}📜 CERTIFICADO SSL:${NC}"
if [ -f "$SSL_DIR/livekit.crt" ]; then
    openssl x509 -in "$SSL_DIR/livekit.crt" -noout -subject -issuer -dates
else
    echo -e "${RED}❌ Certificado no encontrado${NC}"
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✅ SSL SSLIP.IO CONFIGURADO CORRECTAMENTE${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "${CYAN}🌐 URL SEGURA:${NC}"
echo -e "   🔒 ${GREEN}https://$SSLIP_DOMAIN${NC}"
echo -e "   🔌 ${GREEN}wss://$SSLIP_DOMAIN${NC}"
echo ""
echo -e "${CYAN}🔐 CARACTERÍSTICAS:${NC}"
echo -e "   • SSL Gratuito (Let's Encrypt)"
echo -e "   • Renovación automática (90 días)"
echo -e "   • Válido en todos los navegadores"
echo -e "   • Compatible con móviles"
echo -e "   • Sin instalar certificados"
echo ""
echo -e "${CYAN}🎯 PARA FRONTEND:${NC}"
echo -e "   Cambiar LIVEKIT_URL a: ${YELLOW}wss://$SSLIP_DOMAIN${NC}"
echo ""
echo -e "${WHITE}💾 Credenciales: ${YELLOW}$BASE_DIR/CREDENCIALES-SSLIP.txt${NC}"
echo ""
echo -e "${GREEN}¡SSL gratuito con sslip.io listo! 🚀${NC}"