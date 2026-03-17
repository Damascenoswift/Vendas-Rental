#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erro: arquivo de ambiente não encontrado: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_vars=(
  WHATSAPP_ZAPI_INSTANCE_ID
  WHATSAPP_ZAPI_INSTANCE_TOKEN
  WHATSAPP_ZAPI_CLIENT_TOKEN
  WHATSAPP_ZAPI_WEBHOOK_TOKEN
)

missing=()
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing+=("$var_name")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Erro: variáveis faltando no $ENV_FILE:"
  for item in "${missing[@]}"; do
    echo "- $item"
  done
  exit 1
fi

# Permite definir URL pública do webhook sem mexer no NEXT_PUBLIC_APP_URL local.
webhook_base_url="${WHATSAPP_WEBHOOK_BASE_URL:-${NEXT_PUBLIC_APP_URL:-}}"

if [[ -z "$webhook_base_url" ]]; then
  echo "Erro: defina NEXT_PUBLIC_APP_URL ou WHATSAPP_WEBHOOK_BASE_URL no $ENV_FILE"
  exit 1
fi

if [[ "$webhook_base_url" != https://* ]]; then
  echo "Erro: URL do webhook precisa começar com https://"
  echo "Defina WHATSAPP_WEBHOOK_BASE_URL com sua URL pública (ngrok/cloudflared/domínio)."
  echo "Valor atual: $webhook_base_url"
  exit 1
fi

webhook_url="${webhook_base_url%/}/api/whatsapp/webhook?zapi_token=$WHATSAPP_ZAPI_WEBHOOK_TOKEN"
api_url="https://api.z-api.io/instances/$WHATSAPP_ZAPI_INSTANCE_ID/token/$WHATSAPP_ZAPI_INSTANCE_TOKEN/update-every-webhooks"

payload=$(cat <<JSON
{"value":"$webhook_url","notifySentByMe":false}
JSON
)

echo "Configurando webhooks Z-API para: $webhook_url"

response_file="$(mktemp)"
http_code=$(curl -sS -o "$response_file" -w '%{http_code}' \
  -X PUT "$api_url" \
  -H "Content-Type: application/json" \
  -H "Client-Token: $WHATSAPP_ZAPI_CLIENT_TOKEN" \
  -d "$payload")

echo "HTTP: $http_code"
echo "Resposta:"
cat "$response_file"

echo
if [[ "$http_code" == "200" ]]; then
  echo "Webhook atualizado com sucesso."
else
  echo "Falha ao atualizar webhook. Verifique os tokens e a URL pública HTTPS."
  exit 1
fi
