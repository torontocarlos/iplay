-- iPlay · Stage 1
-- Add a `tracks` column to gi_.session capturing Spotify playback during
-- the session. Populated by the harness from /me/player/recently-played
-- + /me/player/currently-playing at STOP.
--
-- Shape (jsonb array):
-- [
--   { "played_at": "2026-05-21T22:15:00Z",
--     "track_id": "spotify:track:abc",
--     "name": "Song",
--     "artists": ["Artist"],
--     "duration_ms": 200000,
--     "source": "recently_played" | "currently_playing" }
-- ]

alter table gi_.session add column if not exists tracks jsonb;
comment on column gi_.session.tracks is
  'Spotify tracks that played during this session, from /me/player/recently-played and /currently-playing. Audio features fetched in the analysis notebook from track_id.';

-- Update ingest_session to persist tracks from payload->''tracks''.
create or replace function gi_.ingest_session(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = gi_, public
as $$
declare
  new_session_id uuid;
begin
  insert into gi_.session (
    schema_version, platform, device_model, os_version,
    gesture_label, requested_hz, measured_hz, duration_ms,
    sample_count, notes, started_at, tracks
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
    (payload->>'started_at')::timestamptz,
    payload->'tracks'
  )
  returning id into new_session_id;

  insert into gi_.sample (
    session_id, t_ms,
    accel_x, accel_y, accel_z,
    user_accel_x, user_accel_y, user_accel_z,
    gyro_x, gyro_y, gyro_z,
    roll, pitch, yaw,
    quat_w, quat_x, quat_y, quat_z,
    mag_x, mag_y, mag_z
  )
  select
    new_session_id,
    (s->>'t')::numeric,
    (s->'accel'->>'x')::numeric, (s->'accel'->>'y')::numeric, (s->'accel'->>'z')::numeric,
    (s->'user_accel'->>'x')::numeric, (s->'user_accel'->>'y')::numeric, (s->'user_accel'->>'z')::numeric,
    (s->'gyro'->>'x')::numeric, (s->'gyro'->>'y')::numeric, (s->'gyro'->>'z')::numeric,
    (s->'attitude'->>'roll')::numeric, (s->'attitude'->>'pitch')::numeric, (s->'attitude'->>'yaw')::numeric,
    (s->'quaternion'->>'w')::numeric, (s->'quaternion'->>'x')::numeric, (s->'quaternion'->>'y')::numeric, (s->'quaternion'->>'z')::numeric,
    (s->'magnetometer'->>'x')::numeric, (s->'magnetometer'->>'y')::numeric, (s->'magnetometer'->>'z')::numeric
  from jsonb_array_elements(payload->'samples') s;

  return new_session_id;
end;
$$;
