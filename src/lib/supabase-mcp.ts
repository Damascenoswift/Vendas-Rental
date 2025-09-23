/**
 * Supabase MCP (Model Context Protocol) Integration
 * 
 * This file provides utilities for working with Supabase via MCP.
 * The MCP server allows direct database operations, migrations, and more.
 * 
 * Setup:
 * 1. Ensure SUPABASE_SECRET is set in your environment
 * 2. Configure MCP server in your Cursor settings
 * 3. Use the provided helper functions for common operations
 */

export const SUPABASE_MCP_CONFIG = {
  server: 'supabase',
  secret: process.env.SUPABASE_SECRET || 'sb_secret_-BBK0-mRSHBfeqbeTfceBg_gw_ooLRf',
  project_url: 'https://sliebietpkyrqihaoexj.supabase.co'
}

/**
 * Common SQL queries for the rental application
 */
export const COMMON_QUERIES = {
  // Users
  LIST_USERS: `
    SELECT id, email, role, nome, created_at, updated_at 
    FROM users 
    ORDER BY created_at DESC;
  `,
  
  // Indicações
  LIST_INDICACOES: `
    SELECT 
      i.*,
      u.nome as vendedor_nome,
      u.email as vendedor_email
    FROM indicacoes i
    LEFT JOIN users u ON i.user_id = u.id
    ORDER BY i.created_at DESC;
  `,
  
  LIST_INDICACOES_BY_STATUS: (status: string) => `
    SELECT 
      i.*,
      u.nome as vendedor_nome,
      u.email as vendedor_email
    FROM indicacoes i
    LEFT JOIN users u ON i.user_id = u.id
    WHERE i.status = '${status}'
    ORDER BY i.created_at DESC;
  `,
  
  LIST_INDICACOES_BY_USER: (userId: string) => `
    SELECT * FROM indicacoes 
    WHERE user_id = '${userId}'
    ORDER BY created_at DESC;
  `,
  
  // Stats
  INDICACOES_STATS: `
    SELECT 
      status,
      COUNT(*) as count,
      COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
    FROM indicacoes 
    GROUP BY status
    ORDER BY count DESC;
  `,
  
  INDICACOES_BY_TYPE: `
    SELECT 
      tipo,
      COUNT(*) as count,
      COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
    FROM indicacoes 
    GROUP BY tipo;
  `,
  
  MONTHLY_INDICACOES: `
    SELECT 
      DATE_TRUNC('month', created_at) as month,
      COUNT(*) as count
    FROM indicacoes 
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC;
  `
}

/**
 * Common database operations using MCP
 * These are helper functions that can be used with the MCP tools
 */
export const MCP_OPERATIONS = {
  // Table operations
  LIST_TABLES: {
    schemas: ['public']
  },
  
  // Migration templates
  CREATE_INDICACAO_HISTORY_TABLE: `
    CREATE TABLE IF NOT EXISTS indicacao_history (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      indicacao_id UUID NOT NULL REFERENCES indicacoes(id) ON DELETE CASCADE,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      observacoes TEXT,
      changed_by UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_indicacao_history_indicacao_id 
    ON indicacao_history(indicacao_id);
    
    -- Create index for date queries
    CREATE INDEX IF NOT EXISTS idx_indicacao_history_created_at 
    ON indicacao_history(created_at DESC);
  `,
  
  CREATE_INDICACAO_DOCUMENTS_TABLE: `
    CREATE TABLE IF NOT EXISTS indicacao_documents (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      indicacao_id UUID NOT NULL REFERENCES indicacoes(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      content_type TEXT,
      uploaded_by UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_indicacao_documents_indicacao_id 
    ON indicacao_documents(indicacao_id);
  `,
  
  // RLS Policies (Row Level Security)
  ENABLE_RLS_INDICACOES: `
    -- Enable RLS on indicacoes table
    ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;
    
    -- Policy for users to see their own indicacoes
    CREATE POLICY "Users can view their own indicacoes" 
    ON indicacoes FOR SELECT 
    USING (auth.uid() = user_id);
    
    -- Policy for users to insert their own indicacoes
    CREATE POLICY "Users can insert their own indicacoes" 
    ON indicacoes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
    
    -- Policy for users to update their own indicacoes
    CREATE POLICY "Users can update their own indicacoes" 
    ON indicacoes FOR UPDATE 
    USING (auth.uid() = user_id);
    
    -- Policy for supervisors and admins to see all indicacoes
    CREATE POLICY "Supervisors and admins can view all indicacoes" 
    ON indicacoes FOR SELECT 
    USING (
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('supervisor', 'adm_mestre', 'adm_dorata')
      )
    );
  `,
  
  // Functions
  CREATE_UPDATE_INDICACAO_STATUS_FUNCTION: `
    CREATE OR REPLACE FUNCTION update_indicacao_status(
      indicacao_id UUID,
      new_status TEXT,
      observacoes TEXT DEFAULT NULL
    ) RETURNS VOID AS $$
    DECLARE
      old_status TEXT;
    BEGIN
      -- Get current status
      SELECT status INTO old_status FROM indicacoes WHERE id = indicacao_id;
      
      -- Update the indicacao
      UPDATE indicacoes 
      SET 
        status = new_status,
        updated_at = NOW()
      WHERE id = indicacao_id;
      
      -- Insert history record
      INSERT INTO indicacao_history (
        indicacao_id,
        status_anterior,
        status_novo,
        observacoes,
        changed_by
      ) VALUES (
        indicacao_id,
        old_status,
        new_status,
        observacoes,
        auth.uid()
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `
}

/**
 * Type definitions for MCP responses
 */
export interface SupabaseMCPTable {
  table_name: string
  table_schema: string
  table_type: string
}

export interface SupabaseMCPQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  command: string
}

export interface SupabaseMCPLog {
  timestamp: string
  level: string
  message: string
  service: string
}

/**
 * Helper function to format MCP query results for display
 */
export function formatMCPQueryResult(result: SupabaseMCPQueryResult): string {
  if (!result.rows || result.rows.length === 0) {
    return `Query executed successfully. ${result.command}. No rows returned.`
  }
  
  const headers = Object.keys(result.rows[0])
  const maxWidths = headers.map(header => 
    Math.max(header.length, ...result.rows.map(row => 
      String(row[header] || '').length
    ))
  )
  
  let output = ''
  
  // Header row
  output += '| ' + headers.map((header, i) => 
    header.padEnd(maxWidths[i])
  ).join(' | ') + ' |\n'
  
  // Separator row
  output += '| ' + maxWidths.map(width => 
    '-'.repeat(width)
  ).join(' | ') + ' |\n'
  
  // Data rows
  result.rows.forEach(row => {
    output += '| ' + headers.map((header, i) => 
      String(row[header] || '').padEnd(maxWidths[i])
    ).join(' | ') + ' |\n'
  })
  
  output += `\n${result.rowCount} rows returned.`
  
  return output
}

export default SUPABASE_MCP_CONFIG
