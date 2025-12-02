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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role_enum: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'
      brand_enum: 'dorata' | 'rental'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
