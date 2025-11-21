#!/usr/bin/env node

/**
 * Script para executar diagnóstico completo do banco de dados
 * Execute: node scripts/run-diagnostic.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://zqilrsijdatoxesdryyt.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDM5MywiZXhwIjoyMDc2MDc2MzkzfQ.q82p0a4l7l-zvFfFnSHa6zcFaFbp2tD1R0UjYbSmOFk'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       DIAGNÓSTICO COMPLETO DO BANCO DE DADOS              ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

async function runDiagnostic() {
  const results = []

  // 1. Valores distintos em marca
  console.log('📊 1. Valores de MARCA...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('marca')
    
    if (error) throw error
    
    const marcas = {}
    data.forEach(row => {
      marcas[row.marca] = (marcas[row.marca] || 0) + 1
    })
    
    console.log('   Valores encontrados:', Object.keys(marcas).length > 0 ? '' : 'nenhum')
    Object.entries(marcas).forEach(([marca, count]) => {
      const isValid = ['rental', 'dorata'].includes(marca)
      const status = isValid ? '✅' : '❌ INVÁLIDO'
      console.log(`   ${status} "${marca}": ${count} registros`)
    })
    
    results.push({ test: 'marca', data: marcas })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'marca', error: err.message })
  }
  console.log('')

  // 2. Valores distintos em status
  console.log('📊 2. Valores de STATUS...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('status')
    
    if (error) throw error
    
    const statuses = {}
    data.forEach(row => {
      statuses[row.status] = (statuses[row.status] || 0) + 1
    })
    
    console.log('   Valores encontrados:', Object.keys(statuses).length > 0 ? '' : 'nenhum')
    Object.entries(statuses).forEach(([status, count]) => {
      const isValid = ['EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA'].includes(status)
      const statusIcon = isValid ? '✅' : '❌ INVÁLIDO'
      console.log(`   ${statusIcon} "${status}": ${count} registros`)
    })
    
    results.push({ test: 'status', data: statuses })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'status', error: err.message })
  }
  console.log('')

  // 3. Valores distintos em tipo
  console.log('📊 3. Valores de TIPO...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('tipo')
    
    if (error) throw error
    
    const tipos = {}
    data.forEach(row => {
      tipos[row.tipo] = (tipos[row.tipo] || 0) + 1
    })
    
    console.log('   Valores encontrados:', Object.keys(tipos).length > 0 ? '' : 'nenhum')
    Object.entries(tipos).forEach(([tipo, count]) => {
      const isValid = ['PF', 'PJ'].includes(tipo)
      const status = isValid ? '✅' : '❌ INVÁLIDO'
      console.log(`   ${status} "${tipo}": ${count} registros`)
    })
    
    results.push({ test: 'tipo', data: tipos })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'tipo', error: err.message })
  }
  console.log('')

  // 4. Estrutura da tabela indicacoes
  console.log('🏗️  4. Verificando coluna MARCA na tabela indicacoes...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('marca')
      .limit(1)
    
    if (error) {
      if (error.message.includes('column') && error.message.includes('marca')) {
        console.log('   ❌ ERRO: Coluna "marca" NÃO EXISTE!')
        console.log('   📝 Você precisa executar: sql/fix-schema-complete.sql')
      } else {
        throw error
      }
    } else {
      console.log('   ✅ Coluna "marca" existe')
    }
    
    results.push({ test: 'marca_column', exists: !error })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'marca_column', error: err.message })
  }
  console.log('')

  // 5. Total de registros
  console.log('📈 5. Contagens totais...')
  try {
    const { count: indicacoesCount, error: indicacoesError } = await supabase
      .from('indicacoes')
      .select('*', { count: 'exact', head: true })
    
    if (indicacoesError) throw indicacoesError
    
    const { count: usersCount, error: usersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
    
    if (usersError) throw usersError
    
    console.log(`   📊 Indicações: ${indicacoesCount} registros`)
    console.log(`   👥 Users: ${usersCount} registros`)
    
    results.push({ test: 'counts', indicacoes: indicacoesCount, users: usersCount })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'counts', error: err.message })
  }
  console.log('')

  // 6. Amostras recentes
  console.log('📋 6. Amostras recentes (últimas 5 indicações)...')
  try {
    const { data, error } = await supabase
      .from('indicacoes')
      .select('id, marca, status, tipo, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (error) throw error
    
    if (data.length === 0) {
      console.log('   ℹ️  Nenhuma indicação encontrada')
    } else {
      data.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ID: ${row.id.substring(0, 8)}...`)
        console.log(`      Marca: ${row.marca} | Status: ${row.status} | Tipo: ${row.tipo}`)
        console.log(`      Criada: ${new Date(row.created_at).toLocaleString('pt-BR')}`)
      })
    }
    
    results.push({ test: 'samples', data: data })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'samples', error: err.message })
  }
  console.log('')

  // 7. Verificar users.allowed_brands
  console.log('👥 7. Verificando ALLOWED_BRANDS em users...')
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, role, allowed_brands')
      .limit(10)
    
    if (error) throw error
    
    if (data.length === 0) {
      console.log('   ℹ️  Nenhum usuário encontrado')
    } else {
      const hasColumn = data[0].hasOwnProperty('allowed_brands')
      if (!hasColumn) {
        console.log('   ❌ ERRO: Coluna "allowed_brands" NÃO EXISTE!')
        console.log('   📝 Você precisa executar: sql/fix-schema-complete.sql')
      } else {
        console.log(`   ✅ Coluna "allowed_brands" existe`)
        
        let usersWithNullBrands = 0
        let usersWithEmptyBrands = 0
        let usersWithValidBrands = 0
        
        data.forEach(user => {
          if (!user.allowed_brands) {
            usersWithNullBrands++
          } else if (user.allowed_brands.length === 0) {
            usersWithEmptyBrands++
          } else {
            usersWithValidBrands++
          }
        })
        
        console.log(`   📊 Usuários com brands válidas: ${usersWithValidBrands}`)
        if (usersWithNullBrands > 0) {
          console.log(`   ⚠️  Usuários com brands NULL: ${usersWithNullBrands}`)
        }
        if (usersWithEmptyBrands > 0) {
          console.log(`   ⚠️  Usuários com brands vazias: ${usersWithEmptyBrands}`)
        }
      }
    }
    
    results.push({ test: 'allowed_brands', data: data })
  } catch (err) {
    console.log('   ❌ Erro:', err.message)
    results.push({ test: 'allowed_brands', error: err.message })
  }
  console.log('')

  // Resumo
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║                    RESUMO DO DIAGNÓSTICO                  ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  const errors = results.filter(r => r.error).length
  const warnings = results.filter(r => r.data && Object.keys(r.data).some(k => {
    const val = k
    if (r.test === 'marca') return !['rental', 'dorata'].includes(val)
    if (r.test === 'status') return !['EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA'].includes(val)
    if (r.test === 'tipo') return !['PF', 'PJ'].includes(val)
    return false
  })).length

  if (errors > 0) {
    console.log(`❌ ERROS CRÍTICOS: ${errors}`)
    console.log('   Você precisa executar: sql/fix-schema-complete.sql\n')
  }

  if (warnings > 0) {
    console.log(`⚠️  AVISOS: Valores inválidos encontrados`)
    console.log('   Execute sql/fix-schema-complete.sql para normalizar\n')
  }

  if (errors === 0 && warnings === 0) {
    console.log('✅ Banco de dados está OK!')
    console.log('   Todos os valores estão no formato correto\n')
  }

  console.log('📝 Próximos passos:')
  if (errors > 0 || warnings > 0) {
    console.log('   1. Execute: sql/fix-schema-complete.sql')
    console.log('   2. Execute este diagnóstico novamente')
    console.log('   3. Teste a aplicação: npm run dev\n')
  } else {
    console.log('   1. Teste a aplicação: npm run dev')
    console.log('   2. Verifique se tudo funciona corretamente\n')
  }

  // Salvar resultados
  const outputPath = path.join(__dirname, '..', 'diagnostic-results.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`💾 Resultados salvos em: diagnostic-results.json\n`)
}

runDiagnostic()
  .then(() => {
    console.log('✅ Diagnóstico completo!\n')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Erro fatal:', error.message)
    process.exit(1)
  })

