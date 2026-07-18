-- Allow moderators to delete any street_segment (mirrors mod_delete_points in 0011).
create policy mod_delete_segments
  on street_segments for delete
  to authenticated
  using (is_moderator());
