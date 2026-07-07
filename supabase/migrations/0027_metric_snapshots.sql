-- Forward-only daily snapshots of the running view/search totals, so the business
-- dashboard can graph views/searches over time. There is NO history before this
-- migration — view_count/search_appearances are running integers — so these graphs
-- are labelled "since <first snapshot>". Reviews are graphed directly from
-- reviews.created_at and need no snapshot.

create table if not exists point_metric_snapshots (
  point_id           uuid not null references points(id) on delete cascade,
  day                date not null default current_date,
  view_count         integer not null default 0,
  search_appearances integer not null default 0,
  primary key (point_id, day)
);

alter table point_metric_snapshots enable row level security;
-- Only the point's owner can read their own metric history.
drop policy if exists owner_read on point_metric_snapshots;
create policy owner_read on point_metric_snapshots for select to authenticated
  using (exists (select 1 from points p where p.id = point_id and p.created_by = auth.uid()));

-- snapshot_my_point_metrics: upsert today's totals for every point the caller owns.
-- Called on each analytics load ("snapshot on read") so history accrues with zero
-- extra infra. SECURITY DEFINER so it can write the snapshot table; rows stay
-- owner-scoped via auth.uid(). Today's row is overwritten with the latest total.
create or replace function snapshot_my_point_metrics() returns void
language sql
security definer
set search_path = public
as $$
  insert into point_metric_snapshots (point_id, day, view_count, search_appearances)
  select p.id, current_date, p.view_count, p.search_appearances
  from points p
  where p.created_by = auth.uid()
  on conflict (point_id, day) do update
    set view_count = excluded.view_count,
        search_appearances = excluded.search_appearances;
$$;
grant execute on function snapshot_my_point_metrics() to authenticated;
