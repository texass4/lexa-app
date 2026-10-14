-- Íntegra — teste da recuperação de jurisprudência para a IA (migração 0022):
-- `jurisprudence_ai_candidates` marca ONDE cada conceito aparece, respeita a RLS e não
-- mexe na pesquisa da tela (`search_jurisprudence`).
--
-- Roda num banco com as migrações aplicadas, como superusuário:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/jurisprudencia_relevancia.sql
-- Tudo numa transação desfeita no fim (ROLLBACK). As decisões são DADO DE TESTE (texto
-- fictício) e só existem dentro da transação.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'semprocesso@a.test');
insert into public.organizations (id, name, status) values ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active');
insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'staff', array['clients.view'], 'Sem processos', 'semprocesso@a.test');

delete from public.jurisprudence;

insert into public.jurisprudence (id, provider, tribunal, external_id, court, judgment_date, subject, ementa, thesis, decision_text, area, content_hash) values
  -- Pertinente: atraso na entrega + danos morais (plural) na ementa.
  ('aaaaaaaa-0000-4000-8000-000000000001', 'stj', 'STJ', 'R-1', 'TERCEIRA TURMA', '2020-01-01',
   'CIVIL. CONSUMIDOR. ATRASO NA ENTREGA DE IMÓVEL. DANOS MORAIS',
   'CIVIL. CONSUMIDOR. ATRASO NA ENTREGA DE IMÓVEL. DANOS MORAIS. O descumprimento do contrato não gera, por si, danos morais (texto de teste).',
   null, null, 'Direito Privado', 'r1'),
  -- Termos só no texto integral (o caso que a busca antiga premiava com +1).
  ('aaaaaaaa-0000-4000-8000-000000000002', 'stj', 'STJ', 'R-2', 'PRIMEIRA TURMA', '2026-09-01',
   'PREVIDENCIÁRIO. BENEFÍCIO. TERMO INICIAL',
   'PREVIDENCIÁRIO. BENEFÍCIO. TERMO INICIAL. Parcelas em atraso corrigidas (texto de teste).',
   null, 'Pedido de dano moral pelo atraso afastado; não houve descumprimento do contrato (texto de teste).', 'Direito Público', 'r2'),
  -- Conceito só na tese (peso B).
  ('aaaaaaaa-0000-4000-8000-000000000003', 'stj', 'STJ', 'R-3', 'QUARTA TURMA', '2021-01-01',
   'CIVIL. COMPRA E VENDA',
   'CIVIL. COMPRA E VENDA. Cláusula penal (texto de teste).',
   'Tese de teste: danos morais exigem prova do abalo.', null, 'Direito Privado', 'r3'),
  -- Sem nenhum conceito.
  ('aaaaaaaa-0000-4000-8000-000000000004', 'stj', 'STJ', 'R-4', 'SEXTA TURMA', '2025-01-01',
   'PENAL. ROUBO', 'PENAL. ROUBO. Dosimetria (texto de teste).', null, null, 'Direito Penal', 'r4');

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

create function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- Grupos: 1 = dano moral, 2 = atraso/descumprimento contratual.
create temp table q as select '[["dano moral","danos morais"],["atraso na entrega","descumprimento do contrato","atraso contratual"]]'::jsonb as g;
grant select on q to authenticated;

set local role anon;
select pg_temp.check(pg_temp.refused($s$select * from public.jurisprudence_ai_candidates('[["dano moral"]]')$s$), 'anônimo não chama a função');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

select pg_temp.check(
  (select groups_a = '{1,2}' and groups_c = '{}' from public.jurisprudence_ai_candidates((select g from q)) where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'pertinente: os dois conceitos no assunto/ementa (plural e sinônimo do dicionário encontrados)'
);
select pg_temp.check(
  (select groups_a = '{}' and groups_c = '{1,2}' from public.jurisprudence_ai_candidates((select g from q)) where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'termos só no texto integral ficam marcados como tal (C), não como assunto/ementa'
);
select pg_temp.check(
  (select groups_a = '{}' and groups_b = '{1}' from public.jurisprudence_ai_candidates((select g from q)) where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  'conceito só na tese aparece em B'
);
select pg_temp.check(
  (select id = 'aaaaaaaa-0000-4000-8000-000000000001' from public.jurisprudence_ai_candidates((select g from q)) limit 1),
  'mais conceitos no assunto/ementa primeiro — mesmo sendo a decisão mais antiga'
);
select pg_temp.check(
  (select count(*) = 3 and min(matched_total) = 3 from public.jurisprudence_ai_candidates((select g from q))),
  'decisão sem nenhum conceito não é candidata; total na base informado'
);
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_ai_candidates('[["de para com"]]')),
  'só palavras vazias: nenhuma candidata'
);
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_ai_candidates('{"nao":"lista"}')),
  'entrada que não é lista: nenhuma candidata'
);
select pg_temp.check(
  (select count(*) = 1 from public.jurisprudence_ai_candidates((select g from q), '{"area":"Direito Público"}')),
  'filtros funcionam como na pesquisa da tela'
);
-- A pesquisa da tela continua igual: qualquer termo encontra (OU), inclusive só no texto integral.
select pg_temp.check(
  (select count(*) = 3 from public.search_jurisprudence('dano moral atraso contratual')),
  'search_jurisprudence (tela) inalterada'
);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_ai_candidates((select g from q))),
  'sem processes.view: a RLS não devolve nada'
);
reset role;

select 'jurisprudencia_relevancia: OK' as resultado;
rollback;
