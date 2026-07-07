-- Moderators can remove spam/abuse (KB 08). Reviews already have a mod-delete
-- policy (0007); profiles already have mod-update (role management).

create policy mod_delete_points   on points   for delete to authenticated using (is_moderator());
create policy mod_delete_problems on problems for delete to authenticated using (is_moderator());
