#!/usr/bin/env node

/**
 * Script para executar migrações SQL usando service_role key
 * ATENÇÃO: Precisa da service_role key para DDL operations
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Precisamos desta chave

if (!supabaseUrl || !serviceRoleKey) {
  console.log('❌ Credenciais não configuradas');
  console.log('📝 Você precisa da SUPABASE_SERVICE_ROLE_KEY no .env.local');
  console.log('🔑 Esta é a chave "service_role" (secreta) do dashboard do Supabase');
  console.log('');
  console.log('Adicione no .env.local:');
  console.log('SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeMigration(migrationFile) {
  try {
    console.log(`🚀 Executando migração: ${migrationFile}`);
    
    const sqlContent = fs.readFileSync(migrationFile, 'utf8');
    console.log('📄 SQL a ser executado:');
    console.log('---');
    console.log(sqlContent);
    console.log('---');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sqlContent
    });
    
    if (error) {
      console.log('❌ Erro ao executar migração:', error.message);
      console.log('📊 Detalhes:', error);
      return false;
    }
    
    console.log('✅ Migração executada com sucesso!');
    console.log('📊 Resultado:', data);
    return true;
    
  } catch (err) {
    console.log('❌ Erro inesperado:', err.message);
    return false;
  }
}

// Executar as 3 migrações em sequência
async function runAllMigrations() {
  const migrations = [
    'supabase/migrations/001_add_marca_column.sql',
    'supabase/migrations/002_update_existing_records.sql',
    'supabase/migrations/003_rls_policies_marca.sql'
  ];
  
  for (const migration of migrations) {
    if (!fs.existsSync(migration)) {
      console.log(`❌ Arquivo não encontrado: ${migration}`);
      return false;
    }
    
    const success = await executeMigration(migration);
    if (!success) {
      console.log(`🛑 Parando na migração: ${migration}`);
      return false;
    }
    
    console.log('');
  }
  
  console.log('🎉 Todas as migrações executadas com sucesso!');
  return true;
}

const migrationFile = process.argv[2];

if (migrationFile) {
  // Executar migração específica
  executeMigration(migrationFile).then(success => {
    process.exit(success ? 0 : 1);
  });
} else {
  // Executar todas as migrações
  runAllMigrations().then(success => {
    process.exit(success ? 0 : 1);
  });
}
