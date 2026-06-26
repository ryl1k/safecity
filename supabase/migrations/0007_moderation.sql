-- Auto-create a profile row for every new auth user, + moderator role check + policies.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'moderator');
$$;
grant execute on function is_moderator() to authenticated;

-- Moderators can curate.
create policy mod_update_points   on points   for update to authenticated using (is_moderator());
create policy mod_update_problems on problems for update to authenticated using (is_moderator());
create policy mod_delete_reviews  on reviews  for delete to authenticated using (is_moderator());
create policy mod_update_profiles on profiles for update to authenticated using (is_moderator());
