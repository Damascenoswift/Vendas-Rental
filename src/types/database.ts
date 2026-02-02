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
          department: Database['public']['Enums']['department_enum'] | null
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
          department?: Database['public']['Enums']['department_enum'] | null
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
          department?: Database['public']['Enums']['department_enum'] | null
        }
        Relationships: []
      },
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
          unidade_consumidora: string | null
          codigo_cliente: string | null
          codigo_instalacao: string | null
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
          unidade_consumidora?: string | null
          codigo_cliente?: string | null
          codigo_instalacao?: string | null
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
          unidade_consumidora?: string | null
          codigo_cliente?: string | null
          codigo_instalacao?: string | null
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
          categoria_energia: 'geradora' | 'acumuladora'
          percentual_alocavel: number
          prazo_expiracao_credito_meses: number
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
          categoria_energia?: 'geradora' | 'acumuladora'
          percentual_alocavel?: number
          prazo_expiracao_credito_meses?: number
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
          categoria_energia?: 'geradora' | 'acumuladora'
          percentual_alocavel?: number
          prazo_expiracao_credito_meses?: number
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
      energia_ucs: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          cliente_id: string | null
          codigo_uc_fatura: string
          codigo_instalacao: string | null
          tipo_uc: string
          atendido_via_consorcio: boolean
          transferida_para_consorcio: boolean
          ativo: boolean
          observacoes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          cliente_id?: string | null
          codigo_uc_fatura: string
          codigo_instalacao?: string | null
          tipo_uc?: string
          atendido_via_consorcio?: boolean
          transferida_para_consorcio?: boolean
          ativo?: boolean
          observacoes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          cliente_id?: string | null
          codigo_uc_fatura?: string
          codigo_instalacao?: string | null
          tipo_uc?: string
          atendido_via_consorcio?: boolean
          transferida_para_consorcio?: boolean
          ativo?: boolean
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energia_ucs_cliente_id_fkey"
            columns: ["cliente_id"]
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          }
        ]
      }
      energia_alocacoes_ucs: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          usina_id: string
          uc_id: string
          percentual_alocado: number | null
          quantidade_kwh_alocado: number | null
          data_inicio: string
          data_fim: string | null
          status: 'ATIVO' | 'INATIVO'
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          usina_id: string
          uc_id: string
          percentual_alocado?: number | null
          quantidade_kwh_alocado?: number | null
          data_inicio?: string
          data_fim?: string | null
          status?: 'ATIVO' | 'INATIVO'
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          usina_id?: string
          uc_id?: string
          percentual_alocado?: number | null
          quantidade_kwh_alocado?: number | null
          data_inicio?: string
          data_fim?: string | null
          status?: 'ATIVO' | 'INATIVO'
        }
        Relationships: [
          {
            foreignKeyName: "energia_alocacoes_ucs_usina_id_fkey"
            columns: ["usina_id"]
            referencedRelation: "usinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energia_alocacoes_ucs_uc_id_fkey"
            columns: ["uc_id"]
            referencedRelation: "energia_ucs"
            referencedColumns: ["id"]
          }
        ]
      }
      energia_credito_transferencias: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          usina_id: string
          uc_id: string
          kwh_enviado: number
          data_envio: string
          expires_at: string | null
          observacoes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          usina_id: string
          uc_id: string
          kwh_enviado: number
          data_envio?: string
          expires_at?: string | null
          observacoes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          usina_id?: string
          uc_id?: string
          kwh_enviado?: number
          data_envio?: string
          expires_at?: string | null
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energia_credito_transferencias_usina_id_fkey"
            columns: ["usina_id"]
            referencedRelation: "usinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energia_credito_transferencias_uc_id_fkey"
            columns: ["uc_id"]
            referencedRelation: "energia_ucs"
            referencedColumns: ["id"]
          }
        ]
      }
      energia_credito_consumos: {
        Row: {
          id: string
          created_at: string
          transferencia_id: string
          competencia: string
          kwh_consumido: number
        }
        Insert: {
          id?: string
          created_at?: string
          transferencia_id: string
          competencia: string
          kwh_consumido?: number
        }
        Update: {
          id?: string
          created_at?: string
          transferencia_id?: string
          competencia?: string
          kwh_consumido?: number
        }
        Relationships: [
          {
            foreignKeyName: "energia_credito_consumos_transferencia_id_fkey"
            columns: ["transferencia_id"]
            referencedRelation: "energia_credito_transferencias"
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
      products: {
        Row: {
          id: string
          name: string
          type: Database['public']['Enums']['product_type_enum']
          category: string | null
          price: number
          cost: number | null
          manufacturer: string | null
          model: string | null
          specs: Json | null
          active: boolean | null
          power: number | null
          technology: string | null
          stock_total: number | null
          stock_reserved: number | null
          stock_withdrawn: number | null
          min_stock: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: Database['public']['Enums']['product_type_enum']
          category?: string | null
          price?: number
          cost?: number | null
          manufacturer?: string | null
          model?: string | null
          specs?: Json | null
          active?: boolean | null
          power?: number | null
          technology?: string | null
          stock_total?: number | null
          stock_reserved?: number | null
          stock_withdrawn?: number | null
          min_stock?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: Database['public']['Enums']['product_type_enum']
          category?: string | null
          price?: number
          cost?: number | null
          manufacturer?: string | null
          model?: string | null
          specs?: Json | null
          active?: boolean | null
          power?: number | null
          technology?: string | null
          stock_total?: number | null
          stock_reserved?: number | null
          stock_withdrawn?: number | null
          min_stock?: number | null
          created_at?: string
          updated_at?: string
        }
        relationships: []
      }
      pricing_rules: {
        Row: {
          id: string
          name: string
          key: string
          value: number
          unit: string | null
          description: string | null
          active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          key: string
          value?: number
          unit?: string | null
          description?: string | null
          active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          key?: string
          value?: number
          unit?: string | null
          description?: string | null
          active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          id: string
          client_id: string | null
          seller_id: string | null
          status: Database['public']['Enums']['proposal_status_enum'] | null
          calculation: Json | null
          total_value: number | null
          labor_cost: number | null
          equipment_cost: number | null
          additional_cost: number | null
          profit_margin: number | null
          total_power: number | null
          valid_until: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          seller_id?: string | null
          status?: Database['public']['Enums']['proposal_status_enum'] | null
          calculation?: Json | null
          total_value?: number | null
          labor_cost?: number | null
          equipment_cost?: number | null
          additional_cost?: number | null
          profit_margin?: number | null
          total_power?: number | null
          valid_until?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          seller_id?: string | null
          status?: Database['public']['Enums']['proposal_status_enum'] | null
          calculation?: Json | null
          total_value?: number | null
          labor_cost?: number | null
          equipment_cost?: number | null
          additional_cost?: number | null
          profit_margin?: number | null
          total_power?: number | null
          valid_until?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_seller_id_fkey"
            columns: ["seller_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      proposal_items: {
        Row: {
          id: string
          proposal_id: string | null
          product_id: string | null
          quantity: number
          unit_price: number
          total_price: number
          created_at: string
        }
        Insert: {
          id?: string
          proposal_id?: string | null
          product_id?: string | null
          quantity?: number
          unit_price: number
          total_price: number
          created_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string | null
          product_id?: string | null
          quantity?: number
          unit_price?: number
          total_price?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_movements: {
        Row: {
          id: string
          product_id: string | null
          type: Database['public']['Enums']['stock_movement_type']
          quantity: number
          reference_id: string | null
          entity_name: string | null
          date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          type: Database['public']['Enums']['stock_movement_type']
          quantity: number
          reference_id?: string | null
          entity_name?: string | null
          date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          type?: Database['public']['Enums']['stock_movement_type']
          quantity?: number
          reference_id?: string | null
          entity_name?: string | null
          date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      consumer_units: {
        Row: {
          id: string
          external_id: string | null
          status: string | null
          active_from: string | null
          active_to: string | null
          is_active_infinite: boolean | null
          code: string | null
          unit_name: string | null
          company_name: string | null
          client_number: string | null
          type: string | null
          is_generator: boolean | null
          uf: string | null
          distributor: string | null
          modality: string | null
          emission_day: number | null
          faturamento_cnpj: string | null
          address: string | null
          number: string | null
          complement: string | null
          city: string | null
          neighborhood: string | null
          zip_code: string | null
          faturamento_emails: string[] | null
          sales_type: string | null
          phone: string | null
          power_generator: number | null
          connection_type: string | null
          is_rural: boolean | null
          association_type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          external_id?: string | null
          status?: string | null
          active_from?: string | null
          active_to?: string | null
          is_active_infinite?: boolean | null
          code?: string | null
          unit_name?: string | null
          company_name?: string | null
          client_number?: string | null
          type?: string | null
          is_generator?: boolean | null
          uf?: string | null
          distributor?: string | null
          modality?: string | null
          emission_day?: number | null
          faturamento_cnpj?: string | null
          address?: string | null
          number?: string | null
          complement?: string | null
          city?: string | null
          neighborhood?: string | null
          zip_code?: string | null
          faturamento_emails?: string[] | null
          sales_type?: string | null
          phone?: string | null
          power_generator?: number | null
          connection_type?: string | null
          is_rural?: boolean | null
          association_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          external_id?: string | null
          status?: string | null
          active_from?: string | null
          active_to?: string | null
          is_active_infinite?: boolean | null
          code?: string | null
          unit_name?: string | null
          company_name?: string | null
          client_number?: string | null
          type?: string | null
          is_generator?: boolean | null
          uf?: string | null
          distributor?: string | null
          modality?: string | null
          emission_day?: number | null
          faturamento_cnpj?: string | null
          address?: string | null
          number?: string | null
          complement?: string | null
          city?: string | null
          neighborhood?: string | null
          zip_code?: string | null
          faturamento_emails?: string[] | null
          sales_type?: string | null
          phone?: string | null
          power_generator?: number | null
          connection_type?: string | null
          is_rural?: boolean | null
          association_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          external_id: string | null
          source: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          email: string | null
          phone: string | null
          mobile: string | null
          whatsapp: string | null
          whatsapp_remote_lid: string | null
          address: string | null
          city: string | null
          state: string | null
          zipcode: string | null
          country: string | null
          timezone: string | null
          preferred_locale: string | null
          cm: string | null
          uc: string | null
          sh_status: string | null
          star_score: number | null
          created_by: string | null
          created_by_name: string | null
          created_by_type: string | null
          updated_by: string | null
          updated_by_name: string | null
          source_created_at: string | null
          source_updated_at: string | null
          imported_by: string | null
          raw_payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          external_id?: string | null
          source?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          mobile?: string | null
          whatsapp?: string | null
          whatsapp_remote_lid?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zipcode?: string | null
          country?: string | null
          timezone?: string | null
          preferred_locale?: string | null
          cm?: string | null
          uc?: string | null
          sh_status?: string | null
          star_score?: number | null
          created_by?: string | null
          created_by_name?: string | null
          created_by_type?: string | null
          updated_by?: string | null
          updated_by_name?: string | null
          source_created_at?: string | null
          source_updated_at?: string | null
          imported_by?: string | null
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          external_id?: string | null
          source?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          mobile?: string | null
          whatsapp?: string | null
          whatsapp_remote_lid?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zipcode?: string | null
          country?: string | null
          timezone?: string | null
          preferred_locale?: string | null
          cm?: string | null
          uc?: string | null
          sh_status?: string | null
          star_score?: number | null
          created_by?: string | null
          created_by_name?: string | null
          created_by_type?: string | null
          updated_by?: string | null
          updated_by_name?: string | null
          source_created_at?: string | null
          source_updated_at?: string | null
          imported_by?: string | null
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      department_enum: 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'outro'
      product_type_enum: 'module' | 'inverter' | 'structure' | 'cable' | 'transformer' | 'other'
      proposal_status_enum: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
      stock_movement_type: 'IN' | 'OUT' | 'RESERVE' | 'RELEASE'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
