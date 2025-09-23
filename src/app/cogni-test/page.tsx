// 🔋 PÁGINA DE TESTE COGNI - Totalmente isolada e removível
// SUPER SEGURO: Não afeta outras páginas, pode ser deletada facilmente

import CogniTest from '@/components/cogni-test'

/**
 * Página para testar integração COGNI
 * URL: /cogni-test
 * 
 * SEGURO: Completamente isolada, pode ser removida sem afetar nada
 */
export default function CogniTestPage() {
  return <CogniTest />
}

/**
 * Metadados da página
 */
export const metadata = {
  title: 'Teste COGNI - Rental V2',
  description: 'Página de teste para integração com API COGNI',
}
