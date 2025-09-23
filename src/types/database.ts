// Tipos baseados no schema existente do Supabase (sua estratégia de reutilização)
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          role?: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome?: string
          created_at?: string
          updated_at?: string
        }
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
          marca: 'dorata' | 'rental'
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
          marca: 'dorata' | 'rental'
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
          marca?: 'dorata' | 'rental'
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
      indicacao_marca: 'dorata' | 'rental'
    }
  }
}
