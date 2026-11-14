-- SD-213: a season can be flagged as a SPECIAL DATE (New Year, Easter, national holidays) with a public name. The public site lists
-- the upcoming ones with each house's availability and price; the price still comes from the season's own rates (pricing engine),
-- so there is no second price to keep in sync. Plain columns on seasons: no new table, no new policy (anon already reads seasons of
-- published properties); only the column grants are widened.
-- Rollback: alter table public.seasons drop column is_special, drop column public_name_es, drop column public_name_en;
-- then restore the previous column grants on public.seasons.
begin;

alter table public.seasons
  add column is_special boolean not null default false,
  add column public_name_es text not null default '' check (char_length(public_name_es) <= 120),
  add column public_name_en text not null default '' check (char_length(public_name_en) <= 120),
  -- A special date shown to guests needs a name to show.
  add constraint seasons_special_named check (not is_special or char_length(btrim(public_name_es)) > 0 or char_length(btrim(public_name_en)) > 0);

grant insert (org_id, property_id, name, start_date, end_date, priority, is_special, public_name_es, public_name_en) on public.seasons to authenticated;
grant update (name, start_date, end_date, priority, is_special, public_name_es, public_name_en) on public.seasons to authenticated;

commit;
