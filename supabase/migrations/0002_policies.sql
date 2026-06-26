-- RLS + grants. Reads are public (guest-first, KB 03); writes require an account
-- (KB 08). The server uses the secret key, which bypasses RLS for imports/moderation.

-- Grant base privileges to the API roles (RLS still gates row access).
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

alter table profiles               enable row level security;
alter table accessibility_features enable row level security;
alter table points                 enable row level security;
alter table point_feature_values   enable row level security;
alter table reviews                enable row level security;
alter table problems               enable row level security;
alter table problem_confirmations  enable row level security;
alter table petitions              enable row level security;
alter table petition_signatures    enable row level security;

-- Public read everywhere (guest-first browse).
create policy read_all on accessibility_features for select using (true);
create policy read_all on points                 for select using (true);
create policy read_all on point_feature_values   for select using (true);
create policy read_all on reviews                for select using (true);
create policy read_all on problems               for select using (true);
create policy read_all on problem_confirmations  for select using (true);
create policy read_all on petitions              for select using (true);
create policy read_all on petition_signatures    for select using (true);
create policy read_all on profiles               for select using (true);

-- Profiles: a user manages only their own row.
create policy self_insert on profiles for insert to authenticated with check (auth.uid() = id);
create policy self_update on profiles for update to authenticated using (auth.uid() = id);

-- Contributions: authenticated users create rows owned by them.
create policy own_insert on points               for insert to authenticated with check (auth.uid() = created_by);
create policy own_insert on point_feature_values for insert to authenticated with check (auth.uid() = reported_by);
create policy own_insert on reviews              for insert to authenticated with check (auth.uid() = user_id);
create policy own_insert on problems             for insert to authenticated with check (auth.uid() = created_by);
create policy own_insert on petitions            for insert to authenticated with check (auth.uid() = created_by);
create policy own_insert on problem_confirmations for insert to authenticated with check (auth.uid() = user_id);
create policy own_insert on petition_signatures  for insert to authenticated with check (auth.uid() = user_id);

-- Users may edit/delete their own reviews; one confirmation/signature per user.
create policy own_update on reviews for update to authenticated using (auth.uid() = user_id);
create policy own_delete on reviews for delete to authenticated using (auth.uid() = user_id);
create policy own_delete on problem_confirmations for delete to authenticated using (auth.uid() = user_id);
create policy own_delete on petition_signatures  for delete to authenticated using (auth.uid() = user_id);
