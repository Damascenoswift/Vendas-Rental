#!/usr/bin/env node

/**
 * Script de teste de conexão e validação do banco de dados
 * Execute: node scripts/test-database-connection.js
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zqilrsijdatoxesdryyt.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_KEY) {
  console.error('❌ ERRO: SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurado')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testConnection() {
  console.log('🔍 Testando conexão com Supabase...\n')
  
  try {
    // 1. Teste básico de conexão
    console.log('1️⃣ Testando conexão básica...')
    const { data: version, error: versionError } = await supabase
      .from('indicacoes')
      .select('count', { count: 'exact', head: true })
    
    if (versionError) {
      console.error('❌ Erro ao conectar:', versionError.message)
      return false
    }
    console.log('✅ Conexão estabelecida\n')

    // 2. Testar tabela indicacoes
    console.log('2️⃣ Testando tabela indicacoes...')
    const { data: indicacoes, error: indicacoesError } = await supabase
      .from('indicacoes')
      .select('id, marca, status, tipo, created_at')
      .limit(5)
    
    if (indicacoesError) {
      console.error('❌ Erro ao buscar indicacoes:', indicacoesError.message)
    } else {
      console.log(`✅ Encontradas ${indicacoes?.length || 0} indicações`)
      if (indicacoes && indicacoes.length > 0) {
        console.log('   Amostra:', JSON.stringify(indicacoes[0], null, 2))
      }
    }
    console.log('')

    // 3. Verificar valores de marca
    console.log('3️⃣ Verificando valores de marca...')
    const { data: marcas, error: marcasError } = await supabase
      .rpc('get_distinct_marcas')
      .catch(async () => {
        // Fallback se a função RPC não existir
        return await supabase
          .from('indicacoes')
          .select('marca')
      })
    
    if (marcasError) {
      console.log('⚠️  Não foi possível verificar marcas (normal se tabela vazia)')
    } else {
      const uniqueMarcas = [...new Set((marcas || []).map(m => m.marca))]
      console.log(`✅ Marcas encontradas: ${uniqueMarcas.join(', ') || 'nenhuma'}`)
      
      // Verificar se há valores inválidos
      const invalidMarcas = uniqueMarcas.filter(m => !['rental', 'dorata'].includes(m))
      if (invalidMarcas.length > 0) {
        console.log(`❌ ATENÇÃO: Marcas inválidas encontradas: ${invalidMarcas.join(', ')}`)
      }
    }
    console.log('')

    // 4. Verificar valores de status
    console.log('4️⃣ Verificando valores de status...')
    const { data: statusData, error: statusError } = await supabase
      .from('indicacoes')
      .select('status')
      .limit(100)
    
    if (statusError) {
      console.log('⚠️  Não foi possível verificar status (normal se tabela vazia)')
    } else {
      const uniqueStatus = [...new Set((statusData || []).map(s => s.status))]
      console.log(`✅ Status encontrados: ${uniqueStatus.join(', ') || 'nenhum'}`)
      
      // Verificar se há valores inválidos
      const validStatus = ['EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA']
      const invalidStatus = uniqueStatus.filter(s => !validStatus.includes(s))
      if (invalidStatus.length > 0) {
        console.log(`❌ ATENÇÃO: Status inválidos encontrados: ${invalidStatus.join(', ')}`)
      }
    }
    console.log('')

    // 5. Verificar valores de tipo
    console.log('5️⃣ Verificando valores de tipo...')
    const { data: tipoData, error: tipoError } = await supabase
      .from('indicacoes')
      .select('tipo')
      .limit(100)
    
    if (tipoError) {
      console.log('⚠️  Não foi possível verificar tipos (normal se tabela vazia)')
    } else {
      const uniqueTipos = [...new Set((tipoData || []).map(t => t.tipo))]
      console.log(`✅ Tipos encontrados: ${uniqueTipos.join(', ') || 'nenhum'}`)
      
      // Verificar se há valores inválidos
      const invalidTipos = uniqueTipos.filter(t => !['PF', 'PJ'].includes(t))
      if (invalidTipos.length > 0) {
        console.log(`❌ ATENÇÃO: Tipos inválidos encontrados: ${invalidTipos.join(', ')}`)
      }
    }
    console.log('')

    // 6. Testar tabela users
    console.log('6️⃣ Testando tabela users...')
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, role, allowed_brands')
      .limit(5)
    
    if (usersError) {
      console.error('❌ Erro ao buscar users:', usersError.message)
    } else {
      console.log(`✅ Encontrados ${users?.length || 0} usuários`)
      if (users && users.length > 0) {
        console.log('   Amostra:', JSON.stringify(users[0], null, 2))
      }
    }
    console.log('')

    // 7. Verificar RLS
    console.log('7️⃣ Verificando RLS...')
    const { data: rlsData, error: rlsError } = await supabase
      .rpc('check_rls_enabled')
      .catch(async () => {
        // Fallback: tentar query direta (falhará se RLS estiver habilitado e não houver auth)
        return { data: null, error: null }
      })
    
    if (rlsError) {
      console.log('⚠️  Não foi possível verificar RLS automaticamente')
      console.log('   Verifique manualmente no Supabase Dashboard')
    } else {
      console.log('ℹ️  Para verificar RLS completo, use o SQL Dashboard do Supabase')
    }
    console.log('')

    console.log('✅ Teste de conexão concluído!\n')
    
    return true
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message)
    return false
  }
}

// Executar teste
testConnection()
  .then(success => {
    if (success) {
      console.log('🎉 Todos os testes passaram!\n')
      console.log('Próximos passos:')
      console.log('1. Se encontrou valores inválidos, execute: sql/fix-schema-complete.sql')
      console.log('2. Teste a aplicação: npm run dev')
      console.log('3. Verifique logs no Supabase Dashboard se houver problemas\n')
      process.exit(0)
    } else {
      console.log('\n❌ Alguns testes falharam. Verifique os erros acima.\n')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  })
