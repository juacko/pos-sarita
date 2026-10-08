#!/usr/bin/env bash
# ==============================================================================
# POS Sarita — Script de aprovisionamiento en Oracle Cloud (Ubuntu 22.04 / 24.04)
# ==============================================================================
set -e

echo "=========================================================="
echo "🚀 Iniciando configuración de POS Sarita Sync en Oracle VM"
echo "=========================================================="

# 1. Actualización de paquetes
echo "📦 Actualizando repositorios del sistema..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw

# 2. Instalar Docker si no está instalado
if ! command -v docker &> /dev/null; then
    echo "🐳 Instalando Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    sudo usermod -aG docker $USER
    echo "✅ Docker instalado correctamente."
else
    echo "✅ Docker ya está instalado."
fi

# 3. Configurar firewall en Oracle Linux / Ubuntu
echo "🛡️ Configurando firewall de la máquina virtual (Puerto 4000)..."
# Oracle Cloud Ubuntu incluye reglas de iptables por defecto que bloquean tráfico
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 4000 -j ACCEPT || true
sudo netfilter-persistent save || true

# 4. Generar .env si no existe
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    echo "🔐 Generando archivo .env con credenciales seguras..."
    DB_PASS=$(openssl rand -hex 16)
    SYNC_KEY=$(openssl rand -hex 24)

    cat <<EOF > .env
PORT=4000
DB_HOST=postgres
DB_PORT=5432
DB_NAME=pos_sarita
DB_USER=pos_user
DB_PASSWORD=${DB_PASS}
SYNC_API_KEY=${SYNC_KEY}
CORS_ORIGIN=*
EOF
    echo "✅ Archivo .env generado."
else
    echo "ℹ️  Archivo .env existente detectado. Manteniendo credenciales."
fi

# 5. Levantar servicios con Docker Compose
echo "🚀 Levantando PostgreSQL y Sync API..."
sudo docker compose up -d --build

# 6. Mostrar resumen
IP_PUBLICA=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
API_KEY_ACTUAL=$(grep SYNC_API_KEY .env | cut -d '=' -f2)

echo ""
echo "=========================================================="
echo "🎉 ¡SERVICIOS ACTIVOS EN ORACLE CLOUD!"
echo "=========================================================="
echo "URL de la Sync API:  http://${IP_PUBLICA}:4000"
echo "Health Check:        http://${IP_PUBLICA}:4000/api/sync/health"
echo "SYNC_API_KEY:        ${API_KEY_ACTUAL}"
echo "=========================================================="
echo "Configura en tus PCs locales (archivo .env):"
echo "SYNC_ENABLED=true"
echo "SYNC_SERVER_URL=http://${IP_PUBLICA}:4000"
echo "SYNC_API_KEY=${API_KEY_ACTUAL}"
echo "=========================================================="
echo "⚠️ NOTA: Asegúrate de que en la consola de Oracle Cloud,"
echo "en la 'Ingress Rule' de la VCN, el puerto 4000 esté abierto (TCP 0.0.0.0/0)."
echo "=========================================================="
