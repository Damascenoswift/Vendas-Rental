-- supabase/migrations/129_proposal_price_approvals.sql

create table public.proposal_price_approvals (
  id                uuid primary key default gen_random_uuid(),
  proposal_id       uuid not null references public.proposals(id) on delete cascade,
  requested_by      uuid not null references public.users(id) on delete cascade,
  approved_by       uuid references public.users(id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  vendedor_note     text,
  original_margin   numeric,
  original_value    numeric,
  adm_min_margin    numeric,
  new_value         numeric,
  adm_note          text,
  requested_at      timestamptz not null default now(),
  resolved_at       timestamptz
);

create index proposal_price_approvals_proposal_id_idx
  on public.proposal_price_approvals(proposal_id, requested_at desc);

create unique index ppa_one_pending_per_proposal
  on public.proposal_price_approvals(proposal_id)
  where status = 'pending';

alter table public.proposal_price_approvals enable row level security;

-- Vendedor: read own proposals' approvals
create policy "ppa_seller_select"
  on public.proposal_price_approvals
  for select
  using (
    proposal_id in (
      select id from public.proposals where seller_id = auth.uid()
    )
  );

-- Vendedor: insert for own proposals only
create policy "ppa_seller_insert"
  on public.proposal_price_approvals
  for insert
  with check (
    requested_by = auth.uid()
    and proposal_id in (
      select id from public.proposals where seller_id = auth.uid()
    )
  );

-- ADM: full access
create policy "ppa_admin_access"
  on public.proposal_price_approvals
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

-- Service role: full access for server actions
grant select, insert, update, delete on public.proposal_price_approvals to service_role;
grant select, insert on public.proposal_price_approvals to authenticated;
