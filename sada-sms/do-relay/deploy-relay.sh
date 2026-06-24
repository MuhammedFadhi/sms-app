#!/bin/bash
# ================================================================
#  SA'DA H2O — DigitalOcean Relay v2 — Deploy Script
#  Run as root:  chmod +x deploy-relay.sh && ./deploy-relay.sh
# ================================================================
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }

echo ""
echo "==========================================="
echo "  SA'DA H2O Relay v2 — Deploy"
echo "==========================================="
echo ""

[ "$EUID" -ne 0 ] && echo "Run as root" && exit 1

APP_DIR="/root/sms-relay"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "Copying relay server..."
cp "$SCRIPT_DIR/server.js" "$APP_DIR/server.js"
success "server.js updated"

# Write/update .env if it doesn't exist
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Creating .env ..."
  RELAY_SECRET=$(openssl rand -hex 24)
  cat > "$ENV_FILE" << ENV
# SA'DA H2O Relay v2 -- Environment

TAQNYAT_TOKEN=91a952e3a8a20842b6ac9c139bf04a38

# Sender for marketing campaigns (from Vercel platform)
TAQNYAT_SENDER=SADA.Co-AD

# Sender for legacy /send relay (existing apps -- DO NOT CHANGE)
RELAY_SENDER=SADA.co

# Supabase -- used to write send logs and update campaign status
# Get these from Supabase dashboard > Settings > API
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_KEY_HERE

# Shared secret -- must match DO_RELAY_SECRET in Vercel env vars
RELAY_SECRET=${RELAY_SECRET}

SSL_KEY=/root/sms-relay/key.pem
SSL_CERT=/root/sms-relay/cert.pem
ENV
  chmod 600 "$ENV_FILE"
  success ".env created — EDIT IT with your Supabase credentials before starting"
else
  warn ".env exists — not overwriting. Add SUPABASE_URL, SUPABASE_SERVICE_KEY, RELAY_SECRET manually if missing."
fi

info "Restarting relay with PM2..."
pm2 restart sms-relay 2>/dev/null || pm2 start "$APP_DIR/server.js" --name sms-relay --env-file "$ENV_FILE"
pm2 save
success "sms-relay restarted"

sleep 2
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost/health 2>/dev/null || echo "000")
[ "$HTTP" = "200" ] && success "Health check passed" || warn "Health check: HTTP $HTTP — check: pm2 logs sms-relay"

echo ""
echo "==========================================="
echo -e "${GREEN}  Relay v2 deployed!${NC}"
echo "==========================================="
echo ""
echo "  NEXT: Edit /root/sms-relay/.env"
echo "  Add your Supabase URL and service key,"
echo "  then: pm2 restart sms-relay"
echo ""
echo "  Add to Vercel env vars:"
echo "    DO_RELAY_URL=https://$(curl -s ifconfig.me 2>/dev/null)/campaign"
echo "    DO_RELAY_SECRET=<value of RELAY_SECRET in .env>"
echo ""
