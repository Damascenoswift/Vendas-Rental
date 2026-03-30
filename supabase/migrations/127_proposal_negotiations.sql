-- supabase/migrations/127_proposal_negotiations.sql

-- 1. Enum
create type public.negotiation_status_enum as enum (
  'sem_contato',
  'em_negociacao',
  'followup',
  'parado',
  'perdido',
  'convertido'
);

-- 2. Table
create table public.proposal_negotiations (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  negotiation_status public.negotiation_status_enum not null default 'sem_contato',
  followup_date date,
  client_signal text,
  objections    text,
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint proposal_negotiations_proposal_id_unique unique (proposal_id)
);

-- 3. RLS
alter table public.proposal_negotiations enable row level security;

-- Vendedor: lê negociações dos seus próprios orçamentos
create policy "proposal_negotiations_seller_select"
  on public.proposal_negotiations
  for select
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = auth.uid()
    )
  );

-- Vendedor: insere (não deleta)
create policy "proposal_negotiations_seller_write"
  on public.proposal_negotiations
  for insert
  with check (
    proposal_id in (
      select id from public.proposals
      where seller_id = auth.uid()
    )
  );

create policy "proposal_negotiations_seller_update"
  on public.proposal_negotiations
  for update
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = auth.uid()
    )
  );

-- Admins: acesso total
create policy "proposal_negotiations_admin_access"
  on public.proposal_negotiations
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
grant select, insert, update, delete on public.proposal_negotiations to service_role;
grant usage on type public.negotiation_status_enum to service_role, authenticated;
