export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: Database['public']['Enums']['user_role_enum']
          allowed_brands: Database['public']['Enums']['brand_enum'][] | null
          name: string | null
          phone: string | null
          status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          role?: Database['public']['Enums']['user_role_enum']
          allowed_brands?: Database['public']['Enums']['brand_enum'][] | null
          name?: string | null
          phone?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: Database['public']['Enums']['user_role_enum']
          allowed_brands?: Database['public']['Enums']['brand_enum'][] | null
          name?: string | null
          phone?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      indicacoes: {
        Row: {
          id: string
          tipo: 'PF' | 'PJ'
          nome: string
          email: string
          telefone: string
          status: 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA'
          created_at: string
          updated_at: string
          user_id: string
          marca: Database['public']['Enums']['brand_enum']
          documento: string | null
          assinada_em: string | null
          compensada_em: string | null
          valor: number | null
        }
        Insert: {
          id?: string
          tipo: 'PF' | 'PJ'
          nome: string
          email: string
          telefone: string
          status?: 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA'
          created_at?: string
          updated_at?: string
          user_id: string
          marca: Database['public']['Enums']['brand_enum']
          documento?: string | null
          assinada_em?: string | null
          compensada_em?: string | null
          valor?: number | null
        }
        Update: {
          id?: string
          tipo?: 'PF' | 'PJ'
          nome?: string
          email?: string
          telefone?: string
          status?: 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA'
          created_at?: string
          updated_at?: string
          user_id?: string
          marca?: Database['public']['Enums']['brand_enum']
          documento?: string | null
          assinada_em?: string | null
          compensada_em?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      orcamentos: {
        Row: {
          id: string
          created_at: string
          user_id: string
          cliente_nome: string
          cliente_gasto_mensal: number | null
          is_b_optante: boolean | null
          conta_energia_url: string | null
          status: 'PENDENTE' | 'VISUALIZADO' | 'RESPONDIDO'
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          cliente_nome: string
          cliente_gasto_mensal?: number | null
          is_b_optante?: boolean | null
          conta_energia_url?: string | null
          status?: 'PENDENTE' | 'VISUALIZADO' | 'RESPONDIDO'
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          cliente_nome?: string
          cliente_gasto_mensal?: number | null
          is_b_optante?: boolean | null
          conta_energia_url?: string | null
          status?: 'PENDENTE' | 'VISUALIZADO' | 'RESPONDIDO'
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      usinas: {
        Row: {
          id: string
          created_at: string
          nome: string
          capacidade_total: number
          tipo: 'rental' | 'parceiro'
          investidor_user_id: string | null
          modelo_negocio: string | null
          status: 'ATIVA' | 'MANUTENCAO' | 'INATIVA'
        }
        Insert: {
          id?: string
          created_at?: string
          nome: string
          capacidade_total?: number
          tipo?: 'rental' | 'parceiro'
          investidor_user_id?: string | null
          modelo_negocio?: string | null
          status?: 'ATIVA' | 'MANUTENCAO' | 'INATIVA'
        }
        Update: {
          id?: string
          created_at?: string
          nome?: string
          capacidade_total?: number
          tipo?: 'rental' | 'parceiro'
          investidor_user_id?: string | null
          modelo_negocio?: string | null
          status?: 'ATIVA' | 'MANUTENCAO' | 'INATIVA'
        }
        Relationships: [
          {
            foreignKeyName: "usinas_investidor_user_id_fkey"
            columns: ["investidor_user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      alocacoes_clientes: {
        Row: {
          id: string
          created_at: string
          usina_id: string
          cliente_id: string
          percentual_alocado: number | null
          quantidade_kwh_alocado: number | null
          data_inicio: string
          data_fim: string | null
          status: 'ATIVO' | 'INATIVO'
        }
        Insert: {
          id?: string
          created_at?: string
          usina_id: string
          cliente_id: string
          percentual_alocado?: number | null
          quantidade_kwh_alocado?: number | null
          data_inicio?: string
          data_fim?: string | null
          status?: 'ATIVO' | 'INATIVO'
        }
        Update: {
          id?: string
          created_at?: string
          usina_id?: string
          cliente_id?: string
          percentual_alocado?: number | null
          quantidade_kwh_alocado?: number | null
          data_inicio?: string
          data_fim?: string | null
          status?: 'ATIVO' | 'INATIVO'
        }
        Relationships: [
          {
            foreignKeyName: "alocacoes_clientes_usina_id_fkey"
            columns: ["usina_id"]
            referencedRelation: "usinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacoes_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          }
        ]
      }
      historico_producao: {
        Row: {
          id: string
          created_at: string
          usina_id: string
          mes_ano: string
          kwh_gerado: number
        }
        Insert: {
          id?: string
          created_at?: string
          usina_id: string
          mes_ano: string
          kwh_gerado?: number
        }
        Update: {
          id?: string
          created_at?: string
          usina_id?: string
          mes_ano?: string
          kwh_gerado?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_producao_usina_id_fkey"
            columns: ["usina_id"]
            referencedRelation: "usinas"
            referencedColumns: ["id"]
          }
        ]
      }
      faturas_conciliacao: {
        Row: {
          id: string
          created_at: string
          usina_id: string
          cliente_id: string
          mes_ano: string
          valor_fatura: number | null
          kwh_compensado: number | null
          status_pagamento: 'ABERTO' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
          observacoes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          usina_id: string
          cliente_id: string
          mes_ano: string
          valor_fatura?: number | null
          kwh_compensado?: number | null
          status_pagamento?: 'ABERTO' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
          observacoes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          usina_id?: string
          cliente_id?: string
          mes_ano?: string
          valor_fatura?: number | null
          kwh_compensado?: number | null
          status_pagamento?: 'ABERTO' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_conciliacao_usina_id_fkey"
            columns: ["usina_id"]
            referencedRelation: "usinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_conciliacao_cliente_id_fkey"
            columns: ["cliente_id"]
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role_enum: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata' | 'suporte_tecnico' | 'suporte_limitado' | 'investidor' | 'funcionario_n1' | 'funcionario_n2'
      brand_enum: 'dorata' | 'rental'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
