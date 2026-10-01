-- Íntegra — Contatos: pessoa cadastrada sem CPF/CNPJ.
--
-- Rode no SQL Editor do Supabase depois da 0004 (clientes). Pode rodar de novo sem erro.
--
-- O CPF/CNPJ deixa de ser obrigatório para cadastrar (status "contato"), mas continua
-- exigido — também aqui no banco, não só na tela — para:
--   * vincular um processo ao cliente (`processes.data.clientId`);
--   * lançar honorários (`invoices.data.clientId`);
--   * anexar um contrato (`documents` com `data.kind = 'Contrato'` e cliente).
-- E um cliente com processo, fatura ou contrato não pode ficar sem o documento.
--
-- A 0004 continua valendo: documento informado precisa ser válido e único no
-- escritório. Nenhuma validação existente é relaxada — a 0004 já aceitava cadastro
-- sem documento no banco; o que muda é que agora o banco exige o documento onde ele
-- é necessário.
--
-- Só vínculos novos ou alterados são conferidos: registros antigos continuam
-- editáveis enquanto o vínculo não muda. O app mostra um aviso próprio (código 23514).
-- Sem `case ... end` dentro das funções (o SQL Editor do Supabase corta a função).

begin;

-- Documento (só dígitos) do cliente, lido sem a RLS: quem lança uma fatura pode não
-- ter permissão de ver Clientes, e a regra precisa valer do mesmo jeito.
create or replace function public.client_document_digits(p_org uuid, p_client text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select regexp_replace(coalesce(c.data ->> 'document', ''), '\D', '', 'g')
    from clients c
   where c.organization_id = p_org and c.id = p_client
$$;

revoke execute on function public.client_document_digits(uuid, text) from public, anon, authenticated;

create or replace function public.require_client_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_id text := nullif(new.data ->> 'clientId', '');
  digits text;
begin
  if client_id is null then
    return new;
  end if;
  -- Documentos: só contratos exigem o CPF/CNPJ do cliente.
  if tg_table_name = 'documents' and coalesce(new.data ->> 'kind', '') <> 'Contrato' then
    return new;
  end if;
  -- Vínculo que já existia: não barra edições de registros antigos.
  if tg_op = 'UPDATE'
     and (old.data ->> 'clientId') is not distinct from (new.data ->> 'clientId')
     and (old.data ->> 'kind') is not distinct from (new.data ->> 'kind') then
    return new;
  end if;

  digits := client_document_digits(new.organization_id, client_id);
  -- Cliente inexistente (excluído no meio-tempo): outras regras cuidam; aqui só falta de documento.
  if digits is not null and digits = '' then
    raise exception 'O cliente precisa de CPF/CNPJ para este vínculo.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

revoke execute on function public.require_client_document() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['processes', 'invoices', 'documents']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_require_client_document', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.require_client_document()',
      t || '_require_client_document', t);
  end loop;
end
$$;

-- Cliente com processo, fatura ou contrato não pode perder o CPF/CNPJ.
create or replace function public.clients_keep_required_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if regexp_replace(coalesce(new.data ->> 'document', ''), '\D', '', 'g') <> ''
     or regexp_replace(coalesce(old.data ->> 'document', ''), '\D', '', 'g') = '' then
    return new;
  end if;
  if exists (select 1 from processes p where p.organization_id = new.organization_id and p.data ->> 'clientId' = new.id)
     or exists (select 1 from invoices i where i.organization_id = new.organization_id and i.data ->> 'clientId' = new.id)
     or exists (
       select 1 from documents d
        where d.organization_id = new.organization_id and d.data ->> 'clientId' = new.id and d.data ->> 'kind' = 'Contrato'
     ) then
    raise exception 'Cliente com processo, fatura ou contrato precisa manter o CPF/CNPJ.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

revoke execute on function public.clients_keep_required_document() from public, anon, authenticated;

drop trigger if exists clients_keep_required_document on public.clients;
create trigger clients_keep_required_document
  before update on public.clients
  for each row execute function public.clients_keep_required_document();

commit;

-- Conferência: vínculos antigos que já estão sem CPF/CNPJ (não são alterados; vazio = tudo certo).
select 'processo' as "vínculo", p.organization_id as "escritório", p.id, c.data ->> 'name' as cliente
  from public.processes p
  join public.clients c on c.organization_id = p.organization_id and c.id = p.data ->> 'clientId'
 where regexp_replace(coalesce(c.data ->> 'document', ''), '\D', '', 'g') = ''
union all
select 'fatura', i.organization_id, i.id, c.data ->> 'name'
  from public.invoices i
  join public.clients c on c.organization_id = i.organization_id and c.id = i.data ->> 'clientId'
 where regexp_replace(coalesce(c.data ->> 'document', ''), '\D', '', 'g') = '';
