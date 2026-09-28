-- LEXA — Clientes: CPF/CNPJ único e válido também no banco.
--
-- Rode depois de 0001_lexa_auth.sql, no SQL Editor do Supabase.
--
-- O formulário já valida, mas duas pessoas do escritório podem cadastrar o mesmo
-- documento ao mesmo tempo (ou alguém pode gravar direto pela API). Aqui:
--   * `clients_document_unique`: um CPF/CNPJ (só dígitos) por escritório;
--   * `clients_validate_document`: recusa CPF/CNPJ com dígito verificador errado
--     quando o documento é cadastrado ou alterado (cadastros antigos continuam
--     editáveis enquanto o documento não muda).
-- O app mostra um aviso próprio para esses erros (códigos 23505 e 23514).
-- Sem `case ... end` dentro das funções: o SQL Editor do Supabase confunde esse
-- `end;` com o fim do bloco e corta a função no meio.
-- Tudo numa transação: se houver duplicados, nada é aplicado.

begin;

-- ---------------------------------------------------------------------------
-- Validação de CPF/CNPJ (mesma regra de `lib/clients.ts`)
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_br_document(p_doc text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  w1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s int;
  r int;
begin
  if length(d) = 11 then
    if d = repeat(substr(d, 1, 1), 11) then
      return false;
    end if;
    s := 0;
    for i in 1..9 loop
      s := s + substr(d, i, 1)::int * (11 - i);
    end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then
      return false;
    end if;
    s := 0;
    for i in 1..10 loop
      s := s + substr(d, i, 1)::int * (12 - i);
    end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  end if;

  if length(d) = 14 then
    if d = repeat(substr(d, 1, 1), 14) then
      return false;
    end if;
    s := 0;
    for i in 1..12 loop
      s := s + substr(d, i, 1)::int * w1[i];
    end loop;
    r := s % 11;
    if r < 2 then r := 0; else r := 11 - r; end if;
    if r <> substr(d, 13, 1)::int then
      return false;
    end if;
    s := 0;
    for i in 1..13 loop
      s := s + substr(d, i, 1)::int * w2[i];
    end loop;
    r := s % 11;
    if r < 2 then r := 0; else r := 11 - r; end if;
    return r = substr(d, 14, 1)::int;
  end if;

  return false;
end
$$;

create or replace function public.clients_validate_document()
returns trigger
language plpgsql
as $$
declare
  d text := regexp_replace(coalesce(new.data ->> 'document', ''), '\D', '', 'g');
  previous text;
begin
  -- O app grava com upsert: o INSERT chega antes do ON CONFLICT. Compara com a
  -- linha que já existe para não barrar cadastros antigos cujo documento não mudou.
  if tg_op = 'UPDATE' then
    previous := regexp_replace(coalesce(old.data ->> 'document', ''), '\D', '', 'g');
  else
    select regexp_replace(coalesce(c.data ->> 'document', ''), '\D', '', 'g')
      into previous
      from public.clients c
     where c.organization_id = new.organization_id and c.id = new.id;
  end if;

  if d = '' or d = previous then
    return new;
  end if;

  if not public.is_valid_br_document(d) then
    raise exception 'CPF/CNPJ inválido: %', new.data ->> 'document' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists clients_validate_document on public.clients;
create trigger clients_validate_document
  before insert or update on public.clients
  for each row execute function public.clients_validate_document();

-- ---------------------------------------------------------------------------
-- Um CPF/CNPJ por escritório
-- ---------------------------------------------------------------------------

-- Se já houver duplicados, a criação do índice falharia com uma mensagem genérica.
-- Aqui a migração para antes e lista quais são, para que o escritório resolva.
do $$
declare
  dup record;
  msg text := '';
begin
  for dup in
    select organization_id, regexp_replace(data ->> 'document', '\D', '', 'g') as doc, string_agg(data ->> 'name', ', ') as names
      from public.clients
     where regexp_replace(coalesce(data ->> 'document', ''), '\D', '', 'g') <> ''
     group by 1, 2
    having count(*) > 1
  loop
    msg := msg || format(E'\n  escritório %s · documento %s · %s', dup.organization_id, dup.doc, dup.names);
  end loop;
  if msg <> '' then
    raise exception 'Há clientes com o mesmo CPF/CNPJ no mesmo escritório. Una ou corrija os cadastros e rode de novo:%', msg;
  end if;
end
$$;

create unique index if not exists clients_document_unique
  on public.clients (organization_id, (regexp_replace(data ->> 'document', '\D', '', 'g')))
  where regexp_replace(coalesce(data ->> 'document', ''), '\D', '', 'g') <> '';

commit;
