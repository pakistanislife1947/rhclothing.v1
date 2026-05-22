-- ============================================================
-- migration.sql — Supabase PostgreSQL schema
-- Run once against your Supabase project via the SQL editor
-- or the Supabase CLI: supabase db push
-- ============================================================

-- ── Enum ─────────────────────────────────────────────────────

create type order_status as enum (
  'Pending',
  'Confirmed',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Returned'
);

-- ── Orders table ─────────────────────────────────────────────

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid        not null,
  status      order_status not null default 'Pending',
  metadata    jsonb,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

-- Fast lookups for the pipeline query (active orders by age)
create index if not exists idx_orders_status_created
  on orders (status, created_at asc);

-- ── Audit log table ───────────────────────────────────────────

create table if not exists order_audit_logs (
  id               bigint primary key generated always as identity,
  order_id         uuid         not null references orders(id) on delete cascade,
  from_status      order_status not null,
  to_status        order_status not null,
  transitioned_at  timestamptz  not null default now(),
  reason           text
);

create index if not exists idx_audit_order_id
  on order_audit_logs (order_id, transitioned_at desc);

-- ── Auto-update trigger for orders.updated_at ────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ── Row Level Security (enable, then add policies as needed) ──

alter table orders          enable row level security;
alter table order_audit_logs enable row level security;

-- Service-role key bypasses RLS automatically.
-- Add customer-scoped policies here if you also expose these
-- tables to authenticated end-users via the anon/user key.
