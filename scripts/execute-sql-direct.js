#!/usr/bin/env node

/**
 * Script para executar SQL diretamente via API REST do Supabase
 */

const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.log('❌ Credenciais não configuradas');
  process.exit(1);
}

async function executeSQLDirect(sqlContent) {
  try {
    console.log('🚀 Executando SQL via API REST...');
    console.log('📄 SQL:');
    console.log('---');
    console.log(sqlContent);
    console.log('---');

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      },
      body: JSON.stringify({
        sql: sqlContent
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Erro HTTP:', response.status, response.statusText);
      console.log('📊 Resposta:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('✅ SQL executado com sucesso!');
    console.log('📊 Resultado:', result);
    return true;

  } catch (err) {
    console.log('❌ Erro inesperado:', err.message);
    return false;
  }
}

// Função alternativa usando psql se disponível
async function executeSQLWithPsql(sqlFile) {
  console.log('🔄 Tentando executar com psql...');

  // Extrair dados da connection string
  const url = new URL(supabaseUrl.replace('https://', 'postgresql://'));
  url.username = 'postgres';
  url.password = serviceRoleKey.split('.')[1]; // Isso não vai funcionar, mas é uma tentativa
  url.port = '5432';

  console.log('⚠️  psql não é viável sem a senha do banco');
  return false;
}

// Tentar executar usando o cliente Supabase com query raw
async function executeSQLWithSupabaseClient(sqlContent) {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    console.log('🔄 Tentando executar SQL statement por statement...');

    // Dividir SQL em statements individuais
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`📝 Executando statement ${i + 1}/${statements.length}:`);
      console.log(statement);

      // Para ALTER TABLE, vamos tentar usar uma abordagem diferente
      if (statement.includes('ALTER TABLE')) {
        console.log('⚠️  ALTER TABLE requer execução direta no banco');
        console.log('💡 Sugestão: Execute este SQL manualmente no dashboard do Supabase');
        console.log('🔗 Vá em: SQL Editor > New Query > Cole o SQL > Run');
        return false;
      }
    }

    return true;

  } catch (err) {
    console.log('❌ Erro:', err.message);
    return false;
  }
}

const sqlFile = process.argv[2];

if (!sqlFile) {
  console.log('❌ Uso: node execute-sql-direct.js <arquivo.sql>');
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.log(`❌ Arquivo não encontrado: ${sqlFile}`);
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlFile, 'utf8');

// Tentar diferentes abordagens
// Tentar diferentes abordagens
executeSQLDirect(sqlContent).then(success => {
  if (!success) {
    console.log('');
    console.log('🎯 SOLUÇÃO RECOMENDADA:');
    console.log('1. Vá para o dashboard do Supabase');
    console.log('2. Clique em "SQL Editor"');
    console.log('3. Clique em "New Query"');
    console.log('4. Cole o SQL do arquivo:', sqlFile);
    console.log('5. Clique em "Run"');
    console.log('');
    console.log('📄 SQL para copiar:');
    console.log('---');
    console.log(sqlContent);
    console.log('---');
  }

  process.exit(success ? 0 : 1);
});
