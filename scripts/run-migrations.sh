#!/bin/bash

# Script para executar migrações do Supabase
# Uso: ./scripts/run-migrations.sh

echo "🚀 Executando migrações do Supabase..."

# Verificar se supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado. Instale com: npm install -g supabase"
    exit 1
fi

# Verificar se está logado
echo "🔐 Verificando autenticação..."
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Não está logado. Execute: supabase login"
    read -p "Deseja fazer login agora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        supabase login
    else
        echo "❌ Login necessário para continuar"
        exit 1
    fi
fi

echo "📊 Executando migração 1: Adicionar coluna marca..."
supabase db query < supabase/migrations/001_add_marca_column.sql

if [ $? -eq 0 ]; then
    echo "✅ Migração 1 concluída"
else
    echo "❌ Erro na migração 1"
    exit 1
fi

echo "🔄 Executando migração 2: Atualizar registros existentes..."
supabase db query < supabase/migrations/002_update_existing_records.sql

if [ $? -eq 0 ]; then
    echo "✅ Migração 2 concluída"
else
    echo "❌ Erro na migração 2"
    exit 1
fi

echo "🔒 Executando migração 3: Configurar policies RLS..."
supabase db query < supabase/migrations/003_rls_policies_marca.sql

if [ $? -eq 0 ]; then
    echo "✅ Migração 3 concluída"
else
    echo "❌ Erro na migração 3"
    exit 1
fi

echo "🎉 Todas as migrações foram executadas com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Atualizar user_metadata dos usuários com allowed_brands"
echo "2. Testar as policies no dashboard"
echo "3. Verificar se os filtros por marca estão funcionando"
echo ""
echo "💡 Exemplo para atualizar usuário:"
echo "supabase auth update USER_ID --user-metadata '{\"role\": \"vendedor_interno\", \"company_name\": \"Empresa X\", \"allowed_brands\": [\"rental\"]}'"
