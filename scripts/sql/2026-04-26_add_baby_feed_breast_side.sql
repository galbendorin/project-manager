begin;

alter table public.baby_feed_entries
  add column if not exists breast_side text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'baby_feed_entries_breast_side_check'
      and conrelid = 'public.baby_feed_entries'::regclass
  ) then
    alter table public.baby_feed_entries
      add constraint baby_feed_entries_breast_side_check
      check (breast_side is null or breast_side in ('left', 'right', 'both'));
  end if;
end;
$$;

commit;
