# Supabase MCP Integration Setup

## Overview

This project is configured to use Supabase MCP (Model Context Protocol) for enhanced database operations, migrations, and development workflows.

## Setup Instructions

### 1. Environment Configuration

Create a `.env.local` file in your project root with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://sliebietpkyrqihaoexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Supabase MCP Secret (for database operations via MCP)
SUPABASE_SECRET=sb_secret_-BBK0-mRSHBfeqbeTfceBg_gw_ooLRf

# Other configurations
ZAPIER_WEBHOOK_URL=your_webhook_url
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Cursor MCP Configuration

The MCP server configuration is already set up in `.cursorrules` and `mcp-config.json`. 

#### Manual Configuration (if needed)

Add this to your Cursor settings (`settings.json`):

```json
{
  "mcp": {
    "servers": {
      "supabase": {
        "command": "npx",
        "args": ["@supabase/mcp-server"],
        "env": {
          "SUPABASE_SECRET": "sb_secret_-BBK0-mRSHBfeqbeTfceBg_gw_ooLRf"
        }
      }
    }
  }
}
```

### 3. Available MCP Tools

Once configured, you'll have access to these Supabase MCP tools:

#### Database Operations
- `mcp_supabase_list_tables`: List all tables in schemas
- `mcp_supabase_execute_sql`: Execute raw SQL queries
- `mcp_supabase_apply_migration`: Apply database migrations
- `mcp_supabase_generate_typescript_types`: Generate TypeScript types

#### Development & Debugging
- `mcp_supabase_get_logs`: Get service logs for debugging
- `mcp_supabase_get_advisors`: Get security and performance advisories
- `mcp_supabase_list_extensions`: List database extensions
- `mcp_supabase_list_migrations`: List applied migrations

#### Edge Functions
- `mcp_supabase_list_edge_functions`: List Edge Functions
- `mcp_supabase_get_edge_function`: Get Edge Function details
- `mcp_supabase_deploy_edge_function`: Deploy Edge Functions

#### Branch Management
- `mcp_supabase_create_branch`: Create development branches
- `mcp_supabase_list_branches`: List development branches
- `mcp_supabase_merge_branch`: Merge branches to production
- `mcp_supabase_delete_branch`: Delete development branches
- `mcp_supabase_reset_branch`: Reset branch migrations
- `mcp_supabase_rebase_branch`: Rebase branch on production

### 4. Common Usage Examples

#### Check Current Database Schema
```typescript
// Use mcp_supabase_list_tables to see all tables
// Use mcp_supabase_generate_typescript_types to update types
```

#### Execute Custom Queries
```sql
-- List all indicações with user details
SELECT 
  i.*,
  u.nome as vendedor_nome,
  u.email as vendedor_email
FROM indicacoes i
LEFT JOIN users u ON i.user_id = u.id
ORDER BY i.created_at DESC;
```

#### Apply Migrations
```sql
-- Example: Add history tracking
CREATE TABLE IF NOT EXISTS indicacao_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indicacao_id UUID NOT NULL REFERENCES indicacoes(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  observacoes TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. Development Workflow

1. **Development Branch**: Create a branch for testing schema changes
2. **Apply Migrations**: Test migrations on the branch
3. **Validate Changes**: Use advisors to check for issues
4. **Merge to Production**: Merge successful changes

### 6. Monitoring & Debugging

- Use `mcp_supabase_get_logs` to debug issues
- Use `mcp_supabase_get_advisors` for security/performance checks
- Monitor migration status with `mcp_supabase_list_migrations`

## Project Context

### Current Schema
- **users**: User management with roles (vendedor_externo, vendedor_interno, supervisor, adm_mestre, adm_dorata)
- **indicacoes**: Main business entity with PF/PJ types and status workflow

### Integration Points
- Next.js 15 + TypeScript frontend
- Supabase client for real-time operations
- MCP for administrative and development operations
- Existing Zapier integrations maintained

## Security Notes

- The MCP secret provides elevated database access
- Use development branches for schema changes
- Always run advisors after DDL changes
- Monitor logs for security issues

## Troubleshooting

1. **MCP Not Available**: Check Cursor MCP configuration
2. **Permission Denied**: Verify SUPABASE_SECRET is correct
3. **Connection Issues**: Check project URL and network
4. **Type Mismatches**: Regenerate TypeScript types after schema changes
