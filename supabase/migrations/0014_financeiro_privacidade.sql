-- Íntegra — Financeiro só para quem tem permissão de Financeiro.
--
-- Rode no SQL Editor do Supabase depois da 0013. Pode rodar de novo sem erro.
--
-- Os lançamentos (`invoices`) já exigiam `finance.view` para leitura desde a 0001.
-- O vazamento estava nas atividades: o registro de um pagamento, de uma cobrança ou
-- de uma edição de lançamento grava descrição e valor (`"Honorários · R$ 8.500,00"`)
-- na tabela `activities`, que qualquer membro do escritório lia — e por ela no
-- painel ("Atividade recente"), nas linhas do tempo de cliente e processo, na
-- Íntegra IA (resumo do cliente) e no Realtime.
--
-- Agora, no próprio banco:
--   * atividade financeira (`data.type = 'payment'`) só é lida com `finance.view`.
--     A API REST e o Realtime aplicam a mesma política de leitura, então quem não
--     tem o Financeiro deixa de receber essas linhas por qualquer caminho;
--   * só quem tem `finance.edit` registra uma atividade financeira (ninguém mais
--     consegue forjar um "pagamento recebido").
-- As outras atividades continuam como antes: qualquer membro ativo lê e registra.
--
-- A regra é a mesma de `lib/financeiro/access.ts` (`FINANCIAL_ACTIVITY_TYPES`).
-- Teste: `supabase/tests/financeiro_privacidade.sql`.

begin;

-- Atividade que carrega dados do Financeiro. Um lugar só para a regra.
create or replace function public.is_financial_activity(p_data jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_data ->> 'type', '') = 'payment'
$$;

revoke execute on function public.is_financial_activity(jsonb) from public, anon;
grant execute on function public.is_financial_activity(jsonb) to authenticated, service_role;

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (not public.is_financial_activity(data) or (select public.has_perm('finance.view')))
  );

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and (not public.is_financial_activity(data) or (select public.has_perm('finance.edit')))
  );

commit;

-- Conferência: as duas políticas com a regra do Financeiro.
select policyname as "política", cmd as "operação"
  from pg_policies
 where schemaname = 'public' and tablename = 'activities'
 order by policyname;
