-- TAKSHAL CTRL Notification Hub v0.3.0 — trusted source ingress (המחלבה → hub).
--
-- Additive only: the v0.2.0 migration (20260925120000_notification_hub.sql) is not modified.
-- Safe to re-run (every statement is idempotent).
--
--  1. notification_recipients — verified email → TAKSHAL CTRL user. Written only by the hub's
--     authenticated status/subscribe calls, from the email Supabase Auth has verified (never
--     from browser input). Trusted sources address recipients by that email.
--  2. notification_events gains (event_id, status, claimed_at) and a unique (source, event_id):
--     a source event is delivered at most once, even under retries or concurrent duplicates.
--
-- Same access model as v0.2.0: reachable only with the Supabase secret key (role
-- `service_role`); RLS on with no policies, privileges revoked from anon/authenticated.

-- ───────────────────────── notification_recipients ─────────────────────────

create table if not exists public.notification_recipients (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Normalized (trimmed, lowercased), as verified by Supabase Auth.
  email      text not null,
  created_at timestamptz not null default now(),
  -- Last time a verified session confirmed this mapping.
  updated_at timestamptz not null default now(),
  constraint notification_recipients_email_key unique (email),
  constraint notification_recipients_email_normalized
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1)
);

drop trigger if exists notification_recipients_touch on public.notification_recipients;
create trigger notification_recipients_touch
  before update on public.notification_recipients
  for each row execute function public.touch_updated_at();

-- An address belongs to at most one hub user: the latest verified session wins (e.g. an address
-- that moved between accounts). One transaction, so the unique constraint is never violated by
-- the handover itself.
create or replace function public.remember_notification_recipient(p_user_id uuid, p_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.notification_recipients
   where email = p_email and user_id <> p_user_id;

  insert into public.notification_recipients (user_id, email)
  values (p_user_id, p_email)
  on conflict (user_id) do update set email = excluded.email;
end;
$$;

-- ───────────────────────── notification_events: source idempotency ─────────────────────────

alter table public.notification_events
  add column if not exists event_id   text,
  add column if not exists status     text not null default 'completed',
  add column if not exists claimed_at timestamptz;

do $$
begin
  alter table public.notification_events
    add constraint notification_events_event_id_format
    check (event_id is null or event_id ~ '^[A-Za-z0-9._:-]{1,128}$');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_events
    add constraint notification_events_status_check
    check (status in ('processing', 'completed'));
exception when duplicate_object then null;
end $$;

-- Every source event carries its idempotency key. NOT VALID: enforced for new rows without
-- re-checking history (v0.2.0 only ever wrote 'test' events).
do $$
begin
  alter table public.notification_events
    add constraint notification_events_source_event_id_required
    check (kind <> 'source' or event_id is not null) not valid;
exception when duplicate_object then null;
end $$;

-- NULL event ids (test events) never conflict: unique constraints treat NULLs as distinct.
do $$
begin
  alter table public.notification_events
    add constraint notification_events_source_event_key unique (source, event_id);
exception when duplicate_table or duplicate_object then null;
end $$;

-- Claims (source, event_id) for delivery. Returns true for exactly one caller:
--   * first request: inserts the row ('processing') and wins;
--   * retry / concurrent duplicate: the insert conflicts and it loses — unless the earlier claim
--     is still 'processing' after its lease (that attempt crashed), in which case the first
--     caller to re-lock the row takes it over (the row lock + re-checked WHERE serialize this).
create or replace function public.claim_source_notification_event(
  p_source text,
  p_event_id text,
  p_user_id uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.notification_events (user_id, source, kind, event_id, status, claimed_at)
  values (p_user_id, p_source, 'source', p_event_id, 'processing', now())
  on conflict (source, event_id) do nothing;
  if found then
    return true;
  end if;

  update public.notification_events
     set user_id = p_user_id, claimed_at = now()
   where source = p_source
     and event_id = p_event_id
     and status = 'processing'
     and claimed_at < now() - make_interval(secs => p_lease_seconds);
  return found;
end;
$$;

-- ───────────────────────── access control ─────────────────────────

alter table public.notification_recipients enable row level security;

-- No policies on purpose (see v0.2.0): anon/authenticated see nothing.
revoke all on table public.notification_recipients from anon, authenticated;
revoke all on function public.remember_notification_recipient(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_source_notification_event(text, text, uuid, integer) from public, anon, authenticated;

grant select, insert, update, delete on table public.notification_recipients to service_role;
grant update on table public.notification_events to service_role;
grant execute on function public.remember_notification_recipient(uuid, text) to service_role;
grant execute on function public.claim_source_notification_event(text, text, uuid, integer) to service_role;
