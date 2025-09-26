#!/usr/bin/env node

/**
 * Teste básico de conexão Supabase
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBasicConnection() {
  try {
    console.log('🔍 Teste básico de conexão Supabase...');
    console.log('📍 URL:', supabaseUrl);
    console.log('🔑 Key (primeiros 20 chars):', supabaseKey?.substring(0, 20) + '...');
    
    // Teste mais simples - apenas verificar se consegue fazer uma requisição
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.log('❌ Erro na autenticação:', error.message);
      return false;
    }
    
    console.log('✅ Conexão básica OK');
    console.log('📊 Sessão:', data.session ? 'Ativa' : 'Nenhuma (normal)');
    
    // Agora tentar listar tabelas (se possível)
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .limit(5);
        
      if (tablesError) {
        console.log('⚠️  Não conseguiu listar tabelas (pode ser normal):', tablesError.message);
      } else {
        console.log('✅ Conseguiu acessar metadados');
        console.log('📋 Algumas tabelas:', tables?.map(t => t.table_name) || 'Nenhuma');
      }
    } catch (e) {
      console.log('⚠️  Erro ao listar tabelas:', e.message);
    }
    
    // Tentar acessar tabela indicacoes diretamente
    try {
      const { data: indicacoes, error: indicacoesError } = await supabase
        .from('indicacoes')
        .select('id')
        .limit(1);
        
      if (indicacoesError) {
        console.log('❌ Erro ao acessar tabela indicacoes:', indicacoesError.message);
        console.log('📊 Código do erro:', indicacoesError.code);
        console.log('📊 Detalhes:', indicacoesError.details);
      } else {
        console.log('✅ Tabela indicacoes acessível!');
        console.log('📊 Registros encontrados:', indicacoes?.length || 0);
      }
    } catch (e) {
      console.log('❌ Erro inesperado ao acessar indicacoes:', e.message);
    }
    
    return true;
    
  } catch (err) {
    console.log('❌ Erro inesperado:', err.message);
    return false;
  }
}

testBasicConnection().then(success => {
  console.log('');
  if (success) {
    console.log('🎯 Conexão básica funcionando!');
  } else {
    console.log('🛑 Problemas na conexão básica');
  }
});
