-- iPlay · Stage 1
-- gi_ schema in dryu-ventures (project ref: jlbfoizasfrywrpnlobh)
-- Stores sensor harness sessions and samples from web / RN / iOS harnesses.

create schema if not exists gi_;

-- ----------------------------------------------------------------------------
-- gi_.session: one row per recorded gesture probe
-- ----------------------------------------------------------------------------
create table if not exists gi_.session (
  id              uuid primary key default gen_random_uuid(),
  schema_version  text not null,
  platform        text not null check (platform in ('web', 'rn', 'ios')),
  device_model    text,
  os_version      text,
  gesture_label   text not null,
  requested_hz    numeric,
  measured_hz     numeric,
  duration_ms     numeric,
  sample_count    integer,
  notes           text,
  started_at      timestamptz not null,
  created_at      timestamptz default now()
);

create index if not exists idx_session_gesture on gi_.session (gesture_label);
create index if not exists idx_session_platform on gi_.session (platform);
create index if not exists idx_session_created on gi_.session (created_at desc);

-- ----------------------------------------------------------------------------
-- gi_.sample: time-series sensor samples within a session
-- ----------------------------------------------------------------------------
create table if not exists gi_.sample (
  session_id    uuid not null references gi_.session(id) on delete cascade,
  t_ms          numeric not null,
  accel_x       numeric, accel_y numeric, accel_z numeric,
  user_accel_x  numeric, user_accel_y numeric, user_accel_z numeric,
  gyro_x        numeric, gyro_y numeric, gyro_z numeric,
  roll          numeric, pitch numeric, yaw numeric,
  quat_w        numeric, quat_x numeric, quat_y numeric, quat_z numeric,
  mag_x         numeric, mag_y numeric, mag_z numeric,
  primary key (session_id, t_ms)
);

-- ----------------------------------------------------------------------------
-- gi_.ingest_session: stored proc to ingest one session JSON blob in one call.
-- ----------------------------------------------------------------------------
create or replace function gi_.ingest_session(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = gi_, public
as $$
declare
  new_session_id uuid;
  s jsonb;
begin
  insert into gi_.session (
    schema_version, platform, device_model, os_version,
    gesture_label, requested_hz, measured_hz, duration_ms,
    sample_count, notes, started_at
  )
  values (
    payload->>'schema_version',
    payload->>'platform',
    payload->>'device_model',
    payload->>'os_version',
    payload->>'gesture_label',
    (payload->>'requested_hz')::numeric,
    (payload->>'measured_hz')::numeric,
    (payload->>'duration_ms')::numeric,
    (payload->>'sample_count')::integer,
    payload->>'notes',
    (payload->>'started_at')::timestamptz
  )
  returning id into new_session_id;

  for s in select * from jsonb_array_elements(payload->'samples')
  loop
    insert into gi_.sample (
      session_id, t_ms,
      accel_x, accel_y, accel_z,
      user_accel_x, user_accel_y, user_accel_z,
      gyro_x, gyro_y, gyro_z,
      roll, pitch, yaw,
      quat_w, quat_x, quat_y, quat_z,
      mag_x, mag_y, mag_z
    )
    values (
      new_session_id,
      (s->>'t')::numeric,
      (s->'accel'->>'x')::numeric, (s->'accel'->>'y')::numeric, (s->'accel'->>'z')::numeric,
      (s->'user_accel'->>'x')::numeric, (s->'user_accel'->>'y')::numeric, (s->'user_accel'->>'z')::numeric,
      (s->'gyro'->>'x')::numeric, (s->'gyro'->>'y')::numeric, (s->'gyro'->>'z')::numeric,
      (s->'attitude'->>'roll')::numeric, (s->'attitude'->>'pitch')::numeric, (s->'attitude'->>'yaw')::numeric,
      (s->'quaternion'->>'w')::numeric, (s->'quaternion'->>'x')::numeric, (s->'quaternion'->>'y')::numeric, (s->'quaternion'->>'z')::numeric,
      (s->'magnetometer'->>'x')::numeric, (s->'magnetometer'->>'y')::numeric, (s->'magnetometer'->>'z')::numeric
    );
  end loop;

  return new_session_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- public.gi_ingest_session: PostgREST-callable wrapper.
-- The harness POSTs to /rest/v1/rpc/gi_ingest_session; the gi_ schema stays
-- private (not in API → Exposed schemas).
-- ----------------------------------------------------------------------------
create or replace function public.gi_ingest_session(payload jsonb)
returns uuid
language sql
security definer
set search_path = public, gi_
as $$
  select gi_.ingest_session(payload);
$$;

grant execute on function public.gi_ingest_session(jsonb) to anon;

-- ----------------------------------------------------------------------------
-- RLS: enable, then add a permissive policy for now. Tighten in Stage 2.
-- For Stage 1 the harness is single-user (you) and the data is non-PHI.
-- ----------------------------------------------------------------------------
alter table gi_.session enable row level security;
alter table gi_.sample  enable row level security;

create policy "stage1_anon_insert_session" on gi_.session
  for insert to anon with check (true);

create policy "stage1_anon_insert_sample" on gi_.sample
  for insert to anon with check (true);

create policy "stage1_anon_read_session" on gi_.session
  for select to anon using (true);

create policy "stage1_anon_read_sample" on gi_.sample
  for select to anon using (true);

comment on schema gi_ is 'iPlay (gesture instrument). Stage 1: sensor harness sessions.';
comment on table gi_.session is 'One row per recorded gesture probe across web/RN/iOS harnesses.';
comment on table gi_.sample is 'Time-series sensor samples within a session. ~100 rows per second.';
comment on function public.gi_ingest_session(jsonb) is 'PostgREST-callable wrapper for gi_.ingest_session. Keeps gi_ schema private.';
