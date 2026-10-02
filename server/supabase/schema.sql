-- Run in your own Supabase project's SQL editor. This does not deploy a database.
begin;
create table if not exists public.buddy_subscribers (
  email text primary key check (length(email) <= 254),
  consent_version text not null default 'email-updates-v1',
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  confirmation_hash text,
  confirmation_expires_at timestamptz
);
create table if not exists public.buddy_unsubscribe_tokens (
  token_hash text primary key,
  email text not null references public.buddy_subscribers(email) on delete cascade,
  created_at timestamptz not null default now()
);
-- Additive research fields: confirmed_at remains marketing consent only.
alter table public.buddy_subscribers add column if not exists confirmation_kind text not null default 'email_updates';
alter table public.buddy_subscribers add column if not exists pending_research jsonb;
alter table public.buddy_subscribers add column if not exists role_id text;
alter table public.buddy_subscribers add column if not exists custom_role text check (length(custom_role) <= 120);
alter table public.buddy_subscribers add column if not exists applications text[] not null default '{}' check (cardinality(applications) <= 20);
alter table public.buddy_subscribers add column if not exists research_confirmed_at timestamptz;
alter table public.buddy_subscribers add column if not exists research_consent_version text;
create table if not exists public.buddy_feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(message) <= 2000),
  reply_email text check (length(reply_email) <= 254),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create table if not exists public.buddy_contact_limits (
  bucket text primary key,
  hits integer not null,
  created_at timestamptz not null default now()
);
alter table public.buddy_subscribers enable row level security;
alter table public.buddy_feedback enable row level security;
alter table public.buddy_contact_limits enable row level security;
alter table public.buddy_unsubscribe_tokens enable row level security;
-- No public/authenticated policies. Desktop users cannot read, write or enumerate email addresses.
revoke all on public.buddy_subscribers, public.buddy_feedback, public.buddy_contact_limits, public.buddy_unsubscribe_tokens from anon, authenticated;
grant select, insert, update, delete on public.buddy_subscribers, public.buddy_feedback, public.buddy_contact_limits, public.buddy_unsubscribe_tokens to service_role;

create or replace function public.buddy_contact_take_slot(p_bucket text, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare accepted integer;
begin
  if p_limit < 1 or p_limit > 100 or length(p_bucket) > 200 then return false; end if;
  insert into public.buddy_contact_limits as limits(bucket, hits) values(p_bucket, 1)
    on conflict(bucket) do update set hits = limits.hits + 1 where limits.hits < p_limit
    returning hits into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.buddy_contact_take_slot(text, integer) from public, anon, authenticated;
grant execute on function public.buddy_contact_take_slot(text, integer) to service_role;
commit;

-- Private owner export (SQL editor only):
-- select email, confirmed_at, consent_version from public.buddy_subscribers
-- where confirmed_at is not null and unsubscribed_at is null;
-- Periodically delete limit buckets older than 48 hours and expired unconfirmed subscribers.
-- Verified role research (not a marketing list):
-- select email, role_id, custom_role, applications from public.buddy_subscribers
-- where research_confirmed_at is not null;
