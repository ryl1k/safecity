alter table street_segments
  add column if not exists photos text[] not null default '{}';
