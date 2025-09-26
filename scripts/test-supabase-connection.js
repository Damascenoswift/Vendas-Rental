#!/usr/bin/env node

/**
 * Script para testar conexão com Supabase antes de executar migrações
 * Uso: node scripts/test-supabase-connection.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseKey === 'sua_chave_aqui') {
  console.log('❌ Credenciais do Supabase não configuradas corretamente');
  console.log('📝 Por favor, atualize o arquivo .env.local com as credenciais corretas');
  console.log('');
  console.log('NEXT_PUBLIC_SUPABASE_URL=' + (supabaseUrl || 'NÃO_DEFINIDA'));
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=' + (supabaseKey ? (supabaseKey === 'sua_chave_aqui' ? 'VALOR_PLACEHOLDER' : 'DEFINIDA') : 'NÃO_DEFINIDA'));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log('🔍 Testando conexão com Supabase...');
    console.log('📍 URL:', supabaseUrl);
    
    // Testar conexão básica
    const { data, error } = await supabase
      .from('indicacoes')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Erro ao conectar:', error.message);
      console.log('📊 Detalhes do erro:', JSON.stringify(error, null, 2));
      console.log('');
      console.log('🔧 Possíveis soluções:');
      console.log('1. Verificar se NEXT_PUBLIC_SUPABASE_ANON_KEY está correto');
      console.log('2. Verificar se a tabela "indicacoes" existe');
      console.log('3. Verificar permissões RLS');
      console.log('4. Verificar se RLS está habilitado na tabela');
      return false;
    }
    
    console.log('✅ Conexão com Supabase estabelecida com sucesso!');
    console.log('📊 Tabela "indicacoes" encontrada');
    console.log('');
    
    // Verificar se coluna marca já existe
    const { data: columns, error: columnsError } = await supabase.rpc('get_table_columns', {
      table_name: 'indicacoes'
    }).catch(() => ({ data: null, error: 'RPC não disponível' }));
    
    if (!columnsError && columns) {
      const hasMarcaColumn = columns.some(col => col.column_name === 'marca');
      console.log('🔍 Coluna "marca":', hasMarcaColumn ? '✅ JÁ EXISTE' : '❌ NÃO EXISTE');
    } else {
      console.log('⚠️  Não foi possível verificar colunas (normal se RPC não estiver configurado)');
    }
    
    return true;
    
  } catch (err) {
    console.log('❌ Erro inesperado:', err.message);
    return false;
  }
}

testConnection().then(success => {
  if (success) {
    console.log('');
    console.log('🚀 Tudo pronto para executar as migrações!');
    console.log('📝 Próximo passo: ./scripts/run-migrations.sh');
  } else {
    console.log('');
    console.log('🛑 Corrija os problemas antes de prosseguir');
  }
  process.exit(success ? 0 : 1);
});
