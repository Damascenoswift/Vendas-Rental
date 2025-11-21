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
          role: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome: string | null
          allowed_brands: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          role?: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome?: string | null
          allowed_brands?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
          nome?: string | null
          allowed_brands?: string[] | null
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
        Relationships: [
          {
            foreignKeyName: "indicacoes_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
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
      user_role: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
      indicacao_marca: 'dorata' | 'rental'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
