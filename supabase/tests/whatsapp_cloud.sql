-- Íntegra — teste do WhatsApp oficial (migração 0021) sobre as tabelas do 0002:
-- isolamento entre escritórios, credenciais invisíveis, número de um escritório só,
-- mensagens sem duplicata e status só para frente.
--
-- Roda num banco com as migrações aplicadas, como superusuário:
-- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/whatsapp_cloud.sql`.
-- Tudo numa transação desfeita no fim (ROLLBACK). Falhou uma regra → "FALHOU: …".

begin;

-- ------------------------------------------------------------------- cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'semwhats@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'staff', array['clients.view'], 'Sem WhatsApp', 'semwhats@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

-- Gravação pelo servidor (service role = superusuário aqui).
insert into public.whatsapp_instances (id, organization_id, provider, external_id, business_account_id, phone, status) values
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'meta', '111111111111111', '911111111111111', '5511999990001', 'connected'),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'meta', '222222222222222', '922222222222222', '5511999990002', 'error');

insert into public.whatsapp_credentials (instance_id, organization_id, access_token_encrypted) values
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'v1:aXY=:dGFn:Y2lmcmE='),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'v1:aXY=:dGFn:Y2lmcmE=');

insert into public.whatsapp_contacts (id, organization_id, phone, push_name) values
  ('a1000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000a', '5511988887777', 'Cliente de A'),
  ('b1000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000b', '5511988887777', 'Mesmo telefone em B');

insert into public.whatsapp_conversations (id, organization_id, instance_id, contact_id) values
  ('a2000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a'),
  ('b2000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b');

insert into public.whatsapp_messages (id, organization_id, conversation_id, direction, type, body, status, provider_message_id) values
  ('a3000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'inbound', 'text', 'Olá, sou de A', 'received', 'wamid.A1'),
  ('a3000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'outbound', 'text', 'Resposta de A', 'sent', 'wamid.A2'),
  ('b3000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'b2000000-0000-4000-8000-00000000000b', 'inbound', 'text', 'Olá, sou de B', 'received', 'wamid.B1');

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.check(p_ok boolean, p_rule text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_rule; end if;
end $$;

-- Executa um comando que DEVE ser recusado (permissão, RLS, regra ou chave).
create function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation or foreign_key_violation or unique_violation then
  return true;
end $$;

select pg_temp.check(not pg_temp.refused('select 1'), 'controle do teste: comando permitido não é recusa');

-- ----------------------------------------------------------------- servidor
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_instances (organization_id, provider, external_id, business_account_id) values ('00000000-0000-0000-0000-00000000000b', 'meta', '111111111111111', '933333333333333')$q$),
  'o mesmo número (Phone Number ID) não pode ser de dois escritórios'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_instances (organization_id, provider, external_id, business_account_id) values ('00000000-0000-0000-0000-00000000000a', 'meta', '333333333333333', '911111111111111')$q$),
  'um número oficial por escritório'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_instances (organization_id, provider, external_id, business_account_id) values ('00000000-0000-0000-0000-00000000000a', 'meta', 'abc', 'def')$q$),
  'ids da Meta só com dígitos'
);
select pg_temp.check(
  pg_temp.refused($q$update public.whatsapp_instances set status = 'inventado' where id = 'a0000000-0000-4000-8000-00000000000a'$q$),
  'estado de conexão fora da lista é recusado'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_credentials (instance_id, organization_id, access_token_encrypted) values ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'v1:x')$q$),
  'credencial de A não pode ser gravada como de B'
);
select pg_temp.check(
  pg_temp.refused($q$update public.whatsapp_credentials set access_token_encrypted = 'EAAG-token-em-texto' where instance_id = 'a0000000-0000-4000-8000-00000000000a'$q$),
  'token só cifrado (nunca em texto puro)'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_messages (organization_id, conversation_id, direction, type, body, status, provider_message_id) values ('00000000-0000-0000-0000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'inbound', 'text', 'repetida', 'received', 'wamid.A1')$q$),
  'a mesma mensagem do WhatsApp não entra duas vezes na conversa'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_messages (organization_id, conversation_id, direction, type, body, status) values ('00000000-0000-0000-0000-00000000000b', 'a2000000-0000-4000-8000-00000000000a', 'inbound', 'text', 'cruzada', 'received')$q$),
  'mensagem de B não entra em conversa de A'
);

-- Status só para frente: "lida" não volta para "entregue"; B não mexe nas mensagens de A.
select public.whatsapp_apply_status('00000000-0000-0000-0000-00000000000a', array['wamid.A2'], 'read', now());
select public.whatsapp_apply_status('00000000-0000-0000-0000-00000000000a', array['wamid.A2'], 'delivered', now());
select pg_temp.check((select status = 'read' and read_at is not null from public.whatsapp_messages where provider_message_id = 'wamid.A2'), 'status só avança (lida não volta para entregue)');
select pg_temp.check(
  (select public.whatsapp_apply_status('00000000-0000-0000-0000-00000000000b', array['wamid.A2'], 'failed', now()) = 0),
  'status com o escritório errado não altera nada'
);

-- -------------------------------------------------------------------- anônimo
set local role anon;
select pg_temp.check(pg_temp.refused('select id from public.whatsapp_messages'), 'anônimo não lê mensagens');
select pg_temp.check(pg_temp.refused('select instance_id from public.whatsapp_credentials'), 'anônimo não lê credenciais');
reset role;

-- ------------------------------------------------------- sócia do escritório A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) = 1 from public.whatsapp_instances), 'A vê só a própria conexão');
select pg_temp.check((select count(*) = 1 from public.whatsapp_conversations), 'A vê só as próprias conversas');
select pg_temp.check((select count(*) = 2 and bool_and(organization_id = '00000000-0000-0000-0000-00000000000a') from public.whatsapp_messages), 'A vê só as próprias mensagens');
select pg_temp.check((select count(*) = 1 from public.whatsapp_contacts), 'mesmo telefone em B não aparece para A');
select pg_temp.check(pg_temp.refused('select access_token_encrypted from public.whatsapp_credentials'), 'nem a sócia lê o token cifrado pela API');
select pg_temp.check(
  pg_temp.refused($q$insert into public.whatsapp_messages (organization_id, conversation_id, direction, type, body, status) values ('00000000-0000-0000-0000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'outbound', 'text', 'pelo navegador', 'sent')$q$),
  'ninguém grava mensagem direto pela API (só o servidor)'
);
select pg_temp.check(pg_temp.refused($q$update public.whatsapp_instances set status = 'connected'$q$), 'ninguém marca a conexão como conectada pela API');
select pg_temp.check(pg_temp.refused($q$update public.whatsapp_contacts set client_id = null$q$), 'vínculo com cliente só pelo servidor');
reset role;

-- --------------------------------------------------- membro sem whatsapp.view
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) = 0 from public.whatsapp_messages), 'sem whatsapp.view não lê mensagens');
select pg_temp.check((select count(*) = 0 from public.whatsapp_conversations), 'sem whatsapp.view não lê conversas');
reset role;

-- ------------------------------------------------------------- escritório B
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(
  (select count(*) = 1 and min(body) = 'Olá, sou de B' from public.whatsapp_messages),
  'B não vê as mensagens de A'
);
select pg_temp.check((select count(*) = 0 from public.whatsapp_conversations where id = 'a2000000-0000-4000-8000-00000000000a'), 'B não abre a conversa de A pelo id');
reset role;

select 'whatsapp oficial: OK' as resultado;
rollback;
