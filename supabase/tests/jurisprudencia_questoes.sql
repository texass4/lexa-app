-- Íntegra — teste das candidatas por QUESTÃO jurídica (migração 0025):
-- `jurisprudence_issue_candidates` exige os grupos obrigatórios (E), marca onde cada
-- grupo aparece, respeita a RLS e não muda a 0022 nem a pesquisa da tela.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/jurisprudencia_questoes.sql
-- Tudo numa transação desfeita no fim (ROLLBACK). Decisões = texto FICTÍCIO de teste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'socia@q.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'semprocesso@q.test');
insert into public.organizations (id, name, status) values ('00000000-0000-0000-0000-00000000000b', 'Escritório Q', 'active');
insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócia', 'socia@q.test'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000000b', 'staff', array['clients.view'], 'Sem processos', 'semprocesso@q.test');

delete from public.jurisprudence;

insert into public.jurisprudence (id, provider, tribunal, external_id, court, judgment_date, subject, ementa, thesis, decision_text, area, content_hash) values
  -- A questão inteira: ICMS + TUSD/TUST.
  ('bbbbbbbb-0000-4000-8000-000000000001', 'stj', 'STJ', 'Q-1', 'PRIMEIRA SEÇÃO', '2024-03-13',
   'TRIBUTÁRIO. ICMS. TUSD E TUST', 'TRIBUTÁRIO. ICMS. TUSD E TUST. As tarifas integram a base de cálculo (texto de teste).', null, null, 'Direito Público', 'q1'),
  -- Só parte da questão: ICMS sem TUSD/TUST (a 0022 devolveria; aqui não).
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stj', 'STJ', 'Q-2', 'SEGUNDA TURMA', '2023-08-22',
   'TRIBUTÁRIO. ICMS. MEDICAMENTOS', 'TRIBUTÁRIO. ICMS. MEDICAMENTOS. Base de cálculo na substituição tributária (texto de teste).', null, null, 'Direito Público', 'q2'),
  -- TUSD só no texto integral (obrigatório vale em qualquer parte; a marcação diz onde).
  ('bbbbbbbb-0000-4000-8000-000000000003', 'stj', 'STJ', 'Q-3', 'PRIMEIRA TURMA', '2022-01-01',
   'TRIBUTÁRIO. ICMS. ENERGIA', 'TRIBUTÁRIO. ICMS. ENERGIA ELÉTRICA (texto de teste).', null, 'Discute-se a TUSD (texto de teste).', 'Direito Público', 'q3');

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

-- Grupo 0 = ICMS; grupo 1 = TUSD/TUST; grupo 2 = fato que só ordena.
create temp table q as select '[["icms"],["tusd","tust"],["energia elétrica"]]'::jsonb as g;
grant select on q to authenticated;

set local role anon;
select pg_temp.check(pg_temp.refused($s$select * from public.jurisprudence_issue_candidates('[["icms"]]', '{0}')$s$), 'anônimo não chama a função');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');

select pg_temp.check(
  (select array_agg(external_id order by external_id) = '{Q-1,Q-3}' from public.jurisprudence_issue_candidates((select g from q), '{0,1}')),
  'grupos obrigatórios em E: decisão com só parte da questão (ICMS sem TUSD/TUST) fica de fora'
);
select pg_temp.check(
  (select groups_a = '{1,2}' and groups_c = '{}' from public.jurisprudence_issue_candidates((select g from q), '{0,1}') where external_id = 'Q-1'),
  'marcação por parte do índice (índices a partir de 1, como na 0022)'
);
select pg_temp.check(
  (select groups_c = '{2}' from public.jurisprudence_issue_candidates((select g from q), '{0,1}') where external_id = 'Q-3'),
  'obrigatório achado só no texto integral fica marcado em C (a aplicação decide se basta)'
);
select pg_temp.check(
  (select external_id = 'Q-1' from public.jurisprudence_issue_candidates((select g from q), '{0,1}') limit 1),
  'mais grupos no assunto/ementa primeiro'
);
select pg_temp.check(
  (select count(*) = 3 from public.jurisprudence_issue_candidates((select g from q), '{}')),
  'sem obrigatórios: qualquer grupo (como a 0022)'
);
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_issue_candidates('[["icms"],["de para com"]]', '{0,1}')),
  'grupo obrigatório vazio (só palavras vazias): nenhuma candidata'
);
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_issue_candidates((select g from q), '{0,1}', '{"area":"Direito Privado"}')),
  'filtros funcionam como na 0022'
);
select pg_temp.check(
  (select count(*) = 3 from public.jurisprudence_ai_candidates((select g from q))),
  'a 0022 continua igual (qualquer grupo)'
);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check(
  (select count(*) = 0 from public.jurisprudence_issue_candidates((select g from q), '{0,1}')),
  'sem processes.view: a RLS não devolve nada'
);
reset role;

select 'jurisprudencia_questoes: OK' as resultado;
rollback;
