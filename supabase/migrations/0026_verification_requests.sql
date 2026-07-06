-- Owner-initiated verification requests. A point owner can flag a point for a
-- moderator to review; the moderator approves via the existing
-- POST /admin/points/{id}/verify. This is a lightweight signal (a timestamp) that
-- surfaces the point higher in the existing unverified moderation list — not a
-- separate queue table. "Verified" (moderator-confirmed data) stays distinct from
-- the accessibility "level" (how accessible the place actually is).

alter table points add column if not exists verification_requested_at timestamptz;

-- request_point_verification: the point's owner asks for moderator review.
-- SECURITY DEFINER with an explicit owner check (mirrors delete_point). Only
-- unverified points are affected; an already-verified point is a no-op.
-- SQLSTATE 'PT404' (not owned) → store.ErrNotFound.
create or replace function request_point_verification(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from points where id = p_id and created_by = auth.uid()) then
    raise exception 'point not owned by caller' using errcode = 'PT404';
  end if;
  update points set verification_requested_at = now()
  where id = p_id and verify_status = 'unverified';
end;
$$;
grant execute on function request_point_verification(uuid) to authenticated;
