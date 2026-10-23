-- SD-205: pricing constraints, per-column privileges and tenant isolation.
begin;
select plan(96);

select ok((select relrowsecurity from pg_class where oid='public.seasons'::regclass), 'seasons has RLS');

select ok((select relrowsecurity from pg_class where oid='public.unit_rates'::regclass), 'unit_rates has RLS');

select ok((select relrowsecurity from pg_class where oid='public.fees'::regclass), 'fees has RLS');

select is((select currency::text from public.properties where id='131583b5-785e-4127-81f0-e097163c5654'), 'USD'::text, 'Existing Saywa is denominated in USD');

select is((select currency::text from public.properties where id='57f914ac-3890-47c1-9d6d-1492782cf712'), 'PEN'::text, 'Other properties default to PEN');

reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select results_eq($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Test season','2028-01-01','2028-02-01',10) returning name$$, $$values ('Test season'::text)$$, 'Member creates season');

update public.seasons set name='Edited season' where name='Test season';

select is((select count(*)::int from public.seasons where name='Edited season'), 1, 'Member edits season');

select results_eq($$insert into public.unit_rates (org_id,property_id,unit_id,season_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001',(select id from public.seasons where name='Edited season'),77700) returning nightly_cents$$, $$values (77700)$$, 'Member creates seasonal rate');

update public.unit_rates set nightly_cents=77800 where nightly_cents=77700;

select is((select count(*)::int from public.unit_rates where nightly_cents=77800), 1, 'Member edits rate');

select results_eq($$insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001','Test fee','per_night',1000) returning name$$, $$values ('Test fee'::text)$$, 'Member creates fee');

update public.fees set name='Edited fee',kind='per_guest',amount_cents=2000 where name='Test fee';

select is((select count(*)::int from public.fees where name='Edited fee' and amount_cents=2000 and kind='per_guest'), 1, 'Member edits fee');

select results_eq($$update public.seasons set name='HACKED' where id='ee205001-0000-4000-8000-000000000002' returning id$$, $$select id from public.seasons where false$$, 'Member cannot update foreign seasons');

select results_eq($$delete from public.seasons where id='ee205001-0000-4000-8000-000000000002' returning id$$, $$select id from public.seasons where false$$, 'Member cannot delete foreign seasons');

select throws_ok($$update public.seasons set id=gen_random_uuid()$$, '42501', null, 'seasons id is immutable');

select throws_ok($$update public.seasons set org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'$$, '42501', null, 'seasons org_id is immutable');

select throws_ok($$update public.seasons set property_id='57f914ac-3890-47c1-9d6d-1492782cf712'$$, '42501', null, 'seasons property_id is immutable');

select throws_ok($$update public.seasons set created_at=now()$$, '42501', null, 'seasons created_at is immutable');

select throws_ok($$update public.seasons set updated_at=now()$$, '42501', null, 'seasons updated_at is immutable');

select results_eq($$update public.unit_rates set nightly_cents=1 where id='ee205002-0000-4000-8000-000000000003' returning id$$, $$select id from public.unit_rates where false$$, 'Member cannot update foreign unit_rates');

select results_eq($$delete from public.unit_rates where id='ee205002-0000-4000-8000-000000000003' returning id$$, $$select id from public.unit_rates where false$$, 'Member cannot delete foreign unit_rates');

select throws_ok($$update public.unit_rates set id=gen_random_uuid()$$, '42501', null, 'unit_rates id is immutable');

select throws_ok($$update public.unit_rates set org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'$$, '42501', null, 'unit_rates org_id is immutable');

select throws_ok($$update public.unit_rates set property_id='57f914ac-3890-47c1-9d6d-1492782cf712'$$, '42501', null, 'unit_rates property_id is immutable');

select throws_ok($$update public.unit_rates set created_at=now()$$, '42501', null, 'unit_rates created_at is immutable');

select throws_ok($$update public.unit_rates set updated_at=now()$$, '42501', null, 'unit_rates updated_at is immutable');

select results_eq($$update public.fees set amount_cents=1 where id='ee205003-0000-4000-8000-000000000001' returning id$$, $$select id from public.fees where false$$, 'Member cannot update foreign fees');

select results_eq($$delete from public.fees where id='ee205003-0000-4000-8000-000000000001' returning id$$, $$select id from public.fees where false$$, 'Member cannot delete foreign fees');

select throws_ok($$update public.fees set id=gen_random_uuid()$$, '42501', null, 'fees id is immutable');

select throws_ok($$update public.fees set org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'$$, '42501', null, 'fees org_id is immutable');

select throws_ok($$update public.fees set property_id='57f914ac-3890-47c1-9d6d-1492782cf712'$$, '42501', null, 'fees property_id is immutable');

select throws_ok($$update public.fees set created_at=now()$$, '42501', null, 'fees created_at is immutable');

select throws_ok($$update public.fees set updated_at=now()$$, '42501', null, 'fees updated_at is immutable');

select throws_ok($$update public.unit_rates set unit_id='ee204001-0000-4000-8000-000000000002'$$, '42501', null, 'Rate unit identity is immutable');

select throws_ok($$update public.fees set unit_id='ee204001-0000-4000-8000-000000000002'$$, '42501', null, 'Fee unit identity is immutable');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('ff24bacc-47d2-40bc-9210-f860e98892fd','57f914ac-3890-47c1-9d6d-1492782cf712','Foreign','2028-01-01','2028-02-01',0)$$, '42501', null, 'Cannot insert season for foreign org');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','57f914ac-3890-47c1-9d6d-1492782cf712','Mixed','2028-01-01','2028-02-01',0)$$, '23503', null, 'Season cannot mix org and foreign property');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Empty','2028-01-01','2028-01-01',0)$$, '23514', null, 'Empty season rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Reversed','2028-02-01','2028-01-01',0)$$, '23514', null, 'Reversed season rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Infinite','-infinity','2028-01-01',0)$$, '23514', null, 'Infinite season rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654',' ','2028-03-01','2028-04-01',0)$$, '23514', null, 'Blank season name rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654',repeat('x',201),'2028-03-01','2028-04-01',0)$$, '23514', null, 'Overlong season name rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Bad priority','2028-03-01','2028-04-01',-1)$$, '23514', null, 'Negative priority rejected');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Ambiguous','2027-07-01','2027-08-01',10)$$, '23P01', null, 'Equal-priority overlapping seasons rejected');

select lives_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Adjacent','2027-10-01','2027-11-01',10)$$, 'Checkout/start boundary does not overlap');

select lives_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Holiday override','2027-07-28','2027-07-30',20)$$, 'Higher-priority holidays may overlap a season');

select throws_ok($$update public.unit_rates set nightly_cents=-1 where id='ee205002-0000-4000-8000-000000000001'$$, '23514', null, 'Invalid nightly_cents=-1 rejected');

select throws_ok($$update public.unit_rates set weekend_nightly_cents=-1 where id='ee205002-0000-4000-8000-000000000001'$$, '23514', null, 'Invalid weekend_nightly_cents=-1 rejected');

select throws_ok($$update public.unit_rates set extra_guest_cents=-1 where id='ee205002-0000-4000-8000-000000000001'$$, '23514', null, 'Invalid extra_guest_cents=-1 rejected');

select throws_ok($$update public.unit_rates set min_nights=0 where id='ee205002-0000-4000-8000-000000000001'$$, '23514', null, 'Invalid min_nights=0 rejected');

select lives_ok($$update public.unit_rates set nightly_cents=0, weekend_nightly_cents=0, extra_guest_cents=0, min_nights=1 where id='ee205002-0000-4000-8000-000000000001'$$, 'Zero amounts permitted and positive minimum nights accepted');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001',22000)$$, '23505', null, 'Duplicate base rate rejected even with NULL season');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,season_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001','ee205001-0000-4000-8000-000000000001',30000)$$, '23505', null, 'Duplicate unit seasonal rate rejected');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,nightly_cents) values ('ff24bacc-47d2-40bc-9210-f860e98892fd','57f914ac-3890-47c1-9d6d-1492782cf712','ee204001-0000-4000-8000-000000000002',10000)$$, '42501', null, 'Cannot insert a rate into foreign org');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,season_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000002','ee205001-0000-4000-8000-000000000001',10000)$$, '23503', null, 'Rate cannot attach foreign unit to own property');

select throws_ok($$update public.unit_rates set season_id='ee205001-0000-4000-8000-000000000002' where id='ee205002-0000-4000-8000-000000000001'$$, '23503', null, 'Rate cannot reference season of another property');

select throws_ok($$insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000002','Wrong unit','per_stay',1)$$, '23503', null, 'Fee cannot attach foreign unit');

select throws_ok($$insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) values ('ff24bacc-47d2-40bc-9210-f860e98892fd','57f914ac-3890-47c1-9d6d-1492782cf712','ee204001-0000-4000-8000-000000000002','Foreign','per_stay',1)$$, '42501', null, 'Cannot insert fee into foreign org');

select throws_ok($$update public.fees set amount_cents=-1 where name='Edited fee'$$, '23514', null, 'Invalid fee amount_cents=-1 rejected');

select throws_ok($$update public.fees set kind='unknown' where name='Edited fee'$$, '22P02', null, 'Invalid fee kind=unknown rejected');

select throws_ok($$update public.fees set name=' ' where name='Edited fee'$$, '23514', null, 'Invalid fee name=  rejected');

select throws_ok($$update public.fees set name=repeat('x',201) where name='Edited fee'$$, '23514', null, 'Invalid fee name=repeat(x,201) rejected');

select throws_ok($$update public.properties set currency='EUR' where id='131583b5-785e-4127-81f0-e097163c5654'$$, '22P02', null, 'Unsupported currency rejected');

select results_eq($$update public.properties set currency='USD' where id='57f914ac-3890-47c1-9d6d-1492782cf712' returning id$$, $$select id from public.properties where false$$, 'Member cannot alter another property currency');

update public.properties set currency='PEN' where id='131583b5-785e-4127-81f0-e097163c5654';

select is((select currency::text from public.properties where id='131583b5-785e-4127-81f0-e097163c5654'), 'PEN'::text, 'Member may configure own currency');

select results_eq($$delete from public.fees where name='Edited fee' returning name$$, $$values ('Edited fee'::text)$$, 'Member deletes own fees');

select results_eq($$delete from public.unit_rates where nightly_cents=77800 returning nightly_cents$$, $$values (77800)$$, 'Member deletes own unit_rates');

select results_eq($$delete from public.seasons where name='Edited season' returning name$$, $$values ('Edited season'::text)$$, 'Member deletes own seasons');

reset role; update public.properties set published=false where id='57f914ac-3890-47c1-9d6d-1492782cf712';

reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date,priority) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','57f914ac-3890-47c1-9d6d-1492782cf712','Foreign overlap probe','2027-07-28','2027-07-29',20)$$, '23503', null, 'Cross-org overlap probe fails FK without revealing foreign seasons');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000002',1)$$, '23503', null, 'Cross-org base probe fails FK without revealing foreign rate');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,season_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000002','ee205001-0000-4000-8000-000000000002',1)$$, '23503', null, 'Cross-org seasonal probe fails FK without revealing foreign rate');

delete from public.seasons where id='ee205001-0000-4000-8000-000000000001';

select is((select count(*)::int from public.unit_rates where season_id='ee205001-0000-4000-8000-000000000001'), 0, 'Deleting a season cascades its rates');

select is((select count(*)::int from public.unit_rates where unit_id='ee204001-0000-4000-8000-000000000001' and season_id is null), 1, 'Deleting a season preserves the base rate');

insert into public.units (org_id,property_id,name,kind,max_guests,included_guests) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Cascade unit','room',2,1);

insert into public.unit_rates (org_id,property_id,unit_id,nightly_cents) select 'bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654',id,77777 from public.units where name='Cascade unit';

insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) select 'bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654',id,'Cascade fee','per_stay',0 from public.units where name='Cascade unit';

delete from public.units where name='Cascade unit';

select is((select count(*)::int from public.unit_rates where nightly_cents=77777), 0, 'Deleting a unit cascades its base rates');

select is((select count(*)::int from public.fees where name='Cascade fee'), 0, 'Deleting a unit cascades its fees');

reset role;
update public.properties set published=false where id='57f914ac-3890-47c1-9d6d-1492782cf712';

reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select is((select count(*)::int from public.seasons where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Foreign unpublished seasons hidden');

select is((select count(*)::int from public.unit_rates where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Foreign unpublished unit_rates hidden');

select is((select count(*)::int from public.fees where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Foreign unpublished fees hidden');

reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;

select ok((select count(*) from public.seasons where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd')>0, 'Owner sees own unpublished seasons');

select ok((select count(*) from public.unit_rates where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd')>0, 'Owner sees own unpublished unit_rates');

select ok((select count(*) from public.fees where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd')>0, 'Owner sees own unpublished fees');

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is((select count(*)::int from public.seasons where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Anon cannot read unpublished seasons');

select throws_ok($$delete from public.seasons$$, '42501', null, 'Anon cannot delete seasons');

select throws_ok($$update public.seasons set name='HACKED'$$, '42501', null, 'Anon cannot update seasons');

select is((select count(*)::int from public.unit_rates where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Anon cannot read unpublished unit_rates');

select throws_ok($$delete from public.unit_rates$$, '42501', null, 'Anon cannot delete unit_rates');

select throws_ok($$update public.unit_rates set nightly_cents=1$$, '42501', null, 'Anon cannot update unit_rates');

select is((select count(*)::int from public.fees where org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'), 0, 'Anon cannot read unpublished fees');

select throws_ok($$delete from public.fees$$, '42501', null, 'Anon cannot delete fees');

select throws_ok($$update public.fees set amount_cents=1$$, '42501', null, 'Anon cannot update fees');

select ok((select count(*) from public.unit_rates where org_id='bf88f504-051f-4fdc-ab73-4fa12d715817')>0, 'Anon reads rates of an active published unit');

select throws_ok($$insert into public.seasons (org_id,property_id,name,start_date,end_date) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Anon','2029-01-01','2029-02-01')$$, '42501', null, 'Anon cannot insert season');

select throws_ok($$insert into public.unit_rates (org_id,property_id,unit_id,nightly_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001',1)$$, '42501', null, 'Anon cannot insert rate');

select throws_ok($$insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001','Anon','per_stay',1)$$, '42501', null, 'Anon cannot insert fee');

reset role;
update public.units set active=false where id='ee204001-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is((select count(*)::int from public.unit_rates where unit_id='ee204001-0000-4000-8000-000000000001'), 0, 'Anon cannot read rates of inactive units');

reset role;
insert into public.fees (org_id,property_id,unit_id,name,kind,amount_cents) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001','Inactive unit fee','per_stay',0);

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is((select count(*)::int from public.fees where unit_id='ee204001-0000-4000-8000-000000000001'), 0, 'Anon cannot read fees of inactive units');

reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select is((select count(*)::int from public.fees where unit_id='ee204001-0000-4000-8000-000000000001'), 1, 'Member still sees fees of own inactive unit');

select * from finish();
rollback;
