-- Public 'photos' bucket for point/review/problem images (KB 09/10).
-- Anyone can read; authenticated users upload; owners may delete their own files.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');

create policy "photos authenticated upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

create policy "photos owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and owner = auth.uid());
