import { z } from 'zod'

// Schemas Zod baseados no IndicacaoModel existente (sua estratégia de reutilização)
export const indicacaoBaseSchema = z.object({
  tipo: z.enum(['PF', 'PJ']),
  nome: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(10, 'Telefone deve ter pelo menos 10 dígitos'),
  marca: z.enum(['dorata', 'rental']).default('rental'),
})

// Schema específico para Pessoa Física
export const indicacaoPFSchema = indicacaoBaseSchema.extend({
  tipo: z.literal('PF'),
  cpf: z.string().min(11, 'CPF deve ter 11 dígitos'),
  rg: z.string().min(1, 'RG é obrigatório'),
  endereco: z.string().min(1, 'Endereço é obrigatório'),
  cep: z.string().min(8, 'CEP deve ter 8 dígitos'),
  cidade: z.string().min(1, 'Cidade é obrigatória'),
  estado: z.string().min(2, 'Estado é obrigatório'),
})

// Schema específico para Pessoa Jurídica
export const indicacaoPJSchema = indicacaoBaseSchema.extend({
  tipo: z.literal('PJ'),
  cnpj: z.string().min(14, 'CNPJ deve ter 14 dígitos'),
  razao_social: z.string().min(1, 'Razão social é obrigatória'),
  nome_fantasia: z.string().optional(),
  endereco: z.string().min(1, 'Endereço é obrigatório'),
  cep: z.string().min(8, 'CEP deve ter 8 dígitos'),
  cidade: z.string().min(1, 'Cidade é obrigatória'),
  estado: z.string().min(2, 'Estado é obrigatório'),
  responsavel: z.string().min(1, 'Responsável é obrigatório'),
})

// Schema dinâmico baseado no tipo
export const indicacaoSchema = z.discriminatedUnion('tipo', [
  indicacaoPFSchema,
  indicacaoPJSchema,
])

// Tipos TypeScript derivados dos schemas
export type IndicacaoBase = z.infer<typeof indicacaoBaseSchema>
export type IndicacaoPF = z.infer<typeof indicacaoPFSchema>
export type IndicacaoPJ = z.infer<typeof indicacaoPJSchema>
export type Indicacao = z.infer<typeof indicacaoSchema>
