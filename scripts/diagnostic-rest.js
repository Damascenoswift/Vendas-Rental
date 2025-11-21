#!/usr/bin/env node

/**
 * Diagnóstico via API REST do Supabase
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://zqilrsijdatoxesdryyt.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDM5MywiZXhwIjoyMDc2MDc2MzkzfQ.q82p0a4l7l-zvFfFnSHa6zcFaFbp2tD1R0UjYbSmOFk'

// Usar service role para bypass RLS
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       DIAGNÓSTICO COMPLETO - API REST SUPABASE           ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

async function diagnostic() {
  let hasErrors = false
  let hasWarnings = false

  // 1. Testar conexão básica
  console.log('🔌 1. Testando conexão...')
  try {
    const { data, error } = await supabase.from('indicacoes').select('count', { count: 'exact', head: true })
    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('   ❌ ERRO CRÍTICO: Tabela "indicacoes" NÃO EXISTE!')
        console.log('   📝 Você precisa criar a tabela primeiro\n')
        hasErrors = true
        return
      }
      throw error
    }
    console.log('   ✅ Conexão OK\n')
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
    hasErrors = true
    return
  }

  // 2. Verificar contagens
  console.log('📊 2. Contagens totais...')
  try {
    const { count: indicacoesCount } = await supabase.from('indicacoes').select('*', { count: 'exact', head: true })
    const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true })
    
    console.log(`   📈 Indicações: ${indicacoesCount || 0}`)
    console.log(`   👥 Users: ${usersCount || 0}\n`)
  } catch (err) {
    console.log('   ⚠️  Erro:', err.message, '\n')
  }

  // 3. Verificar valores de marca
  console.log('🏷️  3. Valores de MARCA...')
  try {
    const { data, error } = await supabase.from('indicacoes').select('marca')
    
    if (error) {
      if (error.message.includes('column') && error.message.includes('marca')) {
        console.log('   ❌ ERRO: Coluna "marca" NÃO EXISTE!')
        console.log('   📝 Execute: sql/fix-schema-complete.sql\n')
        hasErrors = true
      } else {
        throw error
      }
    } else {
      const marcas = {}
      data.forEach(row => {
        const val = row.marca || 'NULL'
        marcas[val] = (marcas[val] || 0) + 1
      })
      
      const keys = Object.keys(marcas)
      if (keys.length === 0) {
        console.log('   ℹ️  Nenhum registro encontrado\n')
      } else {
        console.log('   Valores encontrados:')
        Object.entries(marcas).forEach(([marca, count]) => {
          const isValid = ['rental', 'dorata'].includes(marca)
          const icon = isValid ? '✅' : '❌'
          console.log(`   ${icon} "${marca}": ${count} registros`)
          if (!isValid) hasWarnings = true
        })
        console.log('')
      }
    }
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
  }

  // 4. Verificar valores de status
  console.log('📋 4. Valores de STATUS...')
  try {
    const { data, error } = await supabase.from('indicacoes').select('status')
    
    if (error) throw error
    
    const statuses = {}
    data.forEach(row => {
      const val = row.status || 'NULL'
      statuses[val] = (statuses[val] || 0) + 1
    })
    
    const keys = Object.keys(statuses)
    if (keys.length === 0) {
      console.log('   ℹ️  Nenhum registro encontrado\n')
    } else {
      console.log('   Valores encontrados:')
      Object.entries(statuses).forEach(([status, count]) => {
        const isValid = ['EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA'].includes(status)
        const icon = isValid ? '✅' : '❌'
        console.log(`   ${icon} "${status}": ${count} registros`)
        if (!isValid) hasWarnings = true
      })
      console.log('')
    }
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
  }

  // 5. Verificar valores de tipo
  console.log('📝 5. Valores de TIPO...')
  try {
    const { data, error } = await supabase.from('indicacoes').select('tipo')
    
    if (error) throw error
    
    const tipos = {}
    data.forEach(row => {
      const val = row.tipo || 'NULL'
      tipos[val] = (tipos[val] || 0) + 1
    })
    
    const keys = Object.keys(tipos)
    if (keys.length === 0) {
      console.log('   ℹ️  Nenhum registro encontrado\n')
    } else {
      console.log('   Valores encontrados:')
      Object.entries(tipos).forEach(([tipo, count]) => {
        const isValid = ['PF', 'PJ'].includes(tipo)
        const icon = isValid ? '✅' : '❌'
        console.log(`   ${icon} "${tipo}": ${count} registros`)
        if (!isValid) hasWarnings = true
      })
      console.log('')
    }
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
  }

  // 6. Verificar users.allowed_brands
  console.log('👤 6. Verificando ALLOWED_BRANDS em users...')
  try {
    const { data, error } = await supabase.from('users').select('id, allowed_brands').limit(10)
    
    if (error) throw error
    
    if (data.length === 0) {
      console.log('   ℹ️  Nenhum usuário encontrado\n')
    } else {
      const hasColumn = data[0].hasOwnProperty('allowed_brands')
      
      if (!hasColumn) {
        console.log('   ❌ ERRO: Coluna "allowed_brands" NÃO EXISTE!')
        console.log('   📝 Execute: sql/fix-schema-complete.sql\n')
        hasErrors = true
      } else {
        let nullCount = 0
        let emptyCount = 0
        let validCount = 0
        
        data.forEach(user => {
          if (user.allowed_brands === null) {
            nullCount++
          } else if (user.allowed_brands.length === 0) {
            emptyCount++
          } else {
            validCount++
          }
        })
        
        console.log(`   ✅ Coluna existe`)
        console.log(`   📊 Com brands válidas: ${validCount}`)
        if (nullCount > 0) {
          console.log(`   ⚠️  Com brands NULL: ${nullCount}`)
          hasWarnings = true
        }
        if (emptyCount > 0) {
          console.log(`   ⚠️  Com brands vazias: ${emptyCount}`)
          hasWarnings = true
        }
        console.log('')
      }
    }
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
  }

  // 7. Amostras recentes
  console.log('🔍 7. Amostras recentes (últimas 3)...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('id, marca, status, tipo, created_at')
      .order('created_at', { ascending: false })
      .limit(3)
    
    if (error) throw error
    
    if (data.length === 0) {
      console.log('   ℹ️  Nenhuma indicação encontrada\n')
    } else {
      data.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.id.substring(0, 8)}... | ${row.marca} | ${row.status} | ${row.tipo}`)
      })
      console.log('')
    }
  } catch (err) {
    console.log('   ❌ Erro:', err.message, '\n')
  }

  // RESUMO FINAL
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║                        RESUMO                             ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  if (hasErrors) {
    console.log('❌ ERROS CRÍTICOS ENCONTRADOS!')
    console.log('   Ação necessária: Execute sql/fix-schema-complete.sql\n')
  } else if (hasWarnings) {
    console.log('⚠️  AVISOS ENCONTRADOS - Valores inválidos detectados')
    console.log('   Recomendação: Execute sql/fix-schema-complete.sql\n')
  } else {
    console.log('✅ TUDO OK! Banco de dados está consistente\n')
  }

  console.log('📝 Próximos passos:')
  if (hasErrors || hasWarnings) {
    console.log('   1. Execute: sql/fix-schema-complete.sql (via Supabase Dashboard)')
    console.log('   2. Execute este diagnóstico novamente')
    console.log('   3. Teste: npm run dev\n')
  } else {
    console.log('   1. Teste a aplicação: npm run dev')
    console.log('   2. Verifique todas as funcionalidades\n')
  }
}

diagnostic()
  .then(() => {
    console.log('✅ Diagnóstico concluído!\n')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Erro fatal:', err.message)
    console.error(err)
    process.exit(1)
  })
