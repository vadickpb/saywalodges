begin;
select no_plan();
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., owner a3b45db1-..., staff c5d77e30-...; Demo org ff24bacc-..., owner bd6a1c86-...

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.message_templates'::regclass, 'public.message_house_info'::regclass)), 'both tables have RLS');
select ok(not has_table_privilege('authenticated', 'public.message_templates', 'INSERT') and not has_table_privilege('authenticated', 'public.message_templates', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.message_house_info', 'INSERT') and not has_table_privilege('authenticated', 'public.message_house_info', 'UPDATE')
  and not has_table_privilege('anon', 'public.message_templates', 'SELECT') and not has_table_privilege('anon', 'public.message_house_info', 'SELECT'),
  'nobody writes directly; anon reads nothing');
select ok(not has_function_privilege('anon', 'public.save_message_template(uuid,text,text,text,text,text,integer)', 'EXECUTE'), 'anon cannot save');

-- Owner only: staff and another organization's owner are refused.
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'Bienvenida', 'Hola', 'Hi', 'check_in', 0)$$, '42501', 'not allowed', 'staff cannot edit the library');
select throws_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', '14:00', '11:00', null, null, null, null, null, null, null)$$, '42501', 'not allowed', 'staff cannot edit the house data');
select throws_ok($$select public.delete_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome')$$, '42501', 'not allowed', 'staff cannot delete');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'Bienvenida', 'Hola', 'Hi', 'check_in', 0)$$, '42501', 'not allowed', 'the owner of another organization cannot');
reset role;

-- The owner saves; validation.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'Bienvenida', E'{saludo}, bienvenido\nWiFi: {wifi_nombre}', 'Welcome {nombre}', 'check_in', 0)$$, 'the owner saves a message (line breaks allowed)');
select lives_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'Bienvenida 2', 'Hola', 'Hi', null, null)$$, 'and updates it, with no due date');
select is((select count(*) from public.message_templates), 1::bigint, 'upsert, not duplicate');
select lives_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'custom_3', 'Tours y taxis', 'Taxis: ...', 'Taxis: ...', null, null)$$, 'a custom message');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'custom_9', 'x', 'a', 'b', null, null)$$, '22023', 'invalid input', 'only custom_1..6');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', 'a', 'b', 'check_in', null)$$, '22023', 'invalid input', 'anchor and offset go together');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', 'a', 'b', 'noon', 1)$$, '22023', 'invalid input', 'unknown anchor');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', 'a', 'b', 'check_in', 99)$$, '22023', 'invalid input', 'offset out of range');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', '', 'b', null, null)$$, '22023', 'invalid input', 'empty body');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', 'a' || chr(8238) || 'b', 'b', null, null)$$, '22023', 'invalid input', 'text direction override rejected');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome', 'x', repeat('a', 2001), 'b', null, null)$$, '22023', 'invalid input', 'too long');
select throws_ok($$select public.save_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'nope', 'x', 'a', 'b', null, null)$$, '22023', 'invalid input', 'unknown key');

-- House data.
select lives_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', '14:00', '11:00', 'Saywa', 'clave 123', '4821', 'https://maps.app.goo.gl/x', '+51 999 888 777', E'No fiestas\nSilencio 22:00', 'No parties')$$, 'the owner saves the house data');
select throws_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', '25:00', null, null, null, null, null, null, null, null)$$, '22023', 'invalid input', 'bad time');
select throws_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', null, null, null, null, null, 'javascript:alert(1)', null, null, null)$$, '22023', 'invalid input', 'location must be an https link');
select throws_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', null, null, null, null, null, 'http://insecure.example', null, null, null)$$, '22023', 'invalid input', 'http is rejected too');
select throws_ok($$select public.save_message_house_info('bf88f504-051f-4fdc-ab73-4fa12d715817', null, null, null, null, null, null, 'abc', null, null)$$, '22023', 'invalid input', 'bad phone');
select is((select count(*) from public.message_house_info), 1::bigint, 'one house row per organization');
reset role;

-- Members read their own organization only; staff can read (they send the messages).
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*) from public.message_templates), 2::bigint, 'staff reads the library');
select is((select wifi_name from public.message_house_info), 'Saywa', 'and the house data');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*) from public.message_templates) + (select count(*) from public.message_house_info), 0::bigint, 'another organization sees none of it');
reset role;

-- Restore.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.delete_message_template('bf88f504-051f-4fdc-ab73-4fa12d715817', 'welcome')$$, 'restore the built-in text');
reset role;
select is((select count(*) from public.message_templates where key = 'welcome'), 0::bigint, 'the row is gone (the app falls back to its default)');

select * from finish();
rollback;
