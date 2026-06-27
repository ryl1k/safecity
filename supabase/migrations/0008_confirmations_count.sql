-- Keep problems.confirmations in sync with the problem_confirmations rows.
-- SECURITY DEFINER so the count updates even though regular users can't UPDATE problems.
create or replace function sync_problem_confirmations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(NEW.problem_id, OLD.problem_id);
begin
  update problems
    set confirmations = (select count(*) from problem_confirmations where problem_id = pid)
    where id = pid;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_problem_confirmations on problem_confirmations;
create trigger trg_sync_problem_confirmations
  after insert or delete on problem_confirmations
  for each row execute function sync_problem_confirmations();
