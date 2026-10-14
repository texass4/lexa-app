-- Íntegra — teste: o monitoramento automático não seleciona processo em segredo de
-- justiça (migração 0024). Dados FICTÍCIOS, numa transação desfeita no fim.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/monitoramento_sigilo.sql

begin;

create function pg_temp.check(p_ok boolean, p_rule text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_rule; end if;
end $$;

-- Só os processos deste teste disputam a seleção.
update public.process_monitoring set next_check_at = now() + interval '1 day';
insert into public.organizations (id, name, status) values ('00000000-0000-0000-0000-0000000000c0', 'Escritório de teste (monitoramento)', 'active');
insert into public.processes (organization_id, id, data) values
  ('00000000-0000-0000-0000-0000000000c0', 'proc-publico', '{"id":"proc-publico","number":"0000001-00.2024.8.26.0001","cnj":"00000010020248260001","source":{"provider":"datajud"}}'),
  ('00000000-0000-0000-0000-0000000000c0', 'proc-sigiloso', '{"id":"proc-sigiloso","number":"0000002-00.2024.8.26.0001","cnj":"00000020020248260001","secret":true,"source":{"provider":"datajud"}}'),
  ('00000000-0000-0000-0000-0000000000c0', 'proc-nao-sigiloso', '{"id":"proc-nao-sigiloso","number":"0000003-00.2024.8.26.0001","cnj":"00000030020248260001","secret":false,"source":{"provider":"datajud"}}');

create temp table claimed as select * from public.claim_process_monitoring(100, 900);

select pg_temp.check((select count(*) = 1 from claimed where proc_id = 'proc-publico'), 'processo comum é selecionado');
select pg_temp.check((select count(*) = 1 from claimed where proc_id = 'proc-nao-sigiloso'), 'secret=false continua selecionado');
select pg_temp.check((select count(*) = 0 from claimed where proc_id = 'proc-sigiloso'), 'segredo de justiça NÃO é selecionado (nenhuma consulta externa)');
select pg_temp.check(
  (select (data ->> 'secret')::boolean from public.processes where id = 'proc-sigiloso'),
  'o sigilo do processo não é alterado'
);

select 'monitoramento_sigilo: OK' as resultado;
rollback;
