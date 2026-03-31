-- supabase/migrations/128_proposal_analyst_conversations.sql

-- 1. Role enum for conversation messages
create type public.analyst_conversation_role_enum as enum ('analyst', 'user');

-- 2. Table
create table public.proposal_analyst_conversations (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references public.proposals(id) on delete cascade,
  user_id          uuid references public.users(id) on delete set null,
  role             public.analyst_conversation_role_enum not null,
  content          text not null,
  status_suggestion public.negotiation_status_enum,
  created_at       timestamptz not null default now()
);

create index proposal_analyst_conversations_proposal_id_idx
  on public.proposal_analyst_conversations(proposal_id, created_at);

-- 3. RLS
alter table public.proposal_analyst_conversations enable row level security;

-- Vendedor: lê e insere mensagens dos seus orçamentos
create policy "pac_seller_access"
  on public.proposal_analyst_conversations
  for all
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = auth.uid()
    )
  )
  with check (
    proposal_id in (
      select id from public.proposals
      where seller_id = auth.uid()
    )
  );

-- Admins: acesso total
create policy "pac_admin_access"
  on public.proposal_analyst_conversations
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  );

-- 4. Service role grants
grant select, insert, update, delete on public.proposal_analyst_conversations to service_role;
grant usage on type public.analyst_conversation_role_enum to service_role, authenticated;
