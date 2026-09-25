-- TAKSHAL CTRL Notification Hub — push subscriptions and notification events.
--
-- Access model: these tables are reachable ONLY through the hub's server-side API, which uses
-- the service role key. RLS is enabled with no policies, and table privileges are revoked from
-- the public `anon` and `authenticated` roles, so the browser (anon/publishable key) can never
-- read or write them — push endpoints and keys are delivery capabilities and must stay private.

create extension if not exists pgcrypto;

-- ───────────────────────── push_subscriptions ─────────────────────────

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  expiration_time timestamptz,
  -- Optional coarse, user-visible label ("iPhone · Home Screen"). No raw user agent is stored.
  device_label    text check (device_label is null or char_length(device_label) <= 64),
  enabled         boolean not null default true,
  failure_count   integer not null default 0 check (failure_count >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 2048)
);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id)
  where enabled;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

-- Atomic failure accounting: disables a subscription after N consecutive failures so dead
-- endpoints are not retried forever. (Permanent 404/410 responses delete the row outright.)
create or replace function public.push_subscription_record_failure(subscription_id uuid, disable_after integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.push_subscriptions
     set failure_count   = failure_count + 1,
         last_failure_at = now(),
         enabled         = case when failure_count + 1 >= disable_after then false else enabled end
   where id = subscription_id;
$$;

-- ───────────────────────── notification_events ─────────────────────────
-- Minimal delivery audit, also used for rate limiting. Holds no notification content.

create table if not exists public.notification_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  source     text not null check (source in ('avaria', 'machlava', 'system')),
  kind       text not null check (kind in ('test', 'source')),
  delivered  integer not null default 0,
  failed     integer not null default 0,
  removed    integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_rate_idx
  on public.notification_events (user_id, kind, created_at desc);

-- ───────────────────────── access control ─────────────────────────

alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;

-- No policies on purpose: with RLS enabled and no policies, anon/authenticated see nothing.
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.notification_events from anon, authenticated;
revoke all on function public.push_subscription_record_failure(uuid, integer) from public, anon, authenticated;

grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert on table public.notification_events to service_role;
grant usage on sequence public.notification_events_id_seq to service_role;
grant execute on function public.push_subscription_record_failure(uuid, integer) to service_role;
