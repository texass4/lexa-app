-- Íntegra — código interno do processo (#103000, #103001…) gerado pelo banco.
--
-- Rode no SQL Editor do Supabase depois da 0001. Pode rodar de novo sem erro.
--
-- Antes, o navegador calculava "maior código + 1": duas pessoas cadastrando ao
-- mesmo tempo recebiam o mesmo código. Agora:
--   * `process_code_counters` guarda o último código de cada escritório;
--   * no INSERT de um processo, o banco trava a linha do contador do escritório,
--     soma 1 e grava o código em `data.code` — dois cadastros simultâneos esperam
--     um pelo outro e recebem códigos diferentes. Se o cadastro falhar (RLS, rede),
--     a transação desfaz o incremento: não sobra buraco na numeração;
--   * o código enviado pelo navegador é ignorado, e depois de criado não muda;
--   * `processes_code_unique`: um código por escritório.
--
-- Processos existentes não mudam. O contador de cada escritório começa no maior
-- código já cadastrado (o primeiro processo de um escritório novo é #103000, como antes).
--
-- Se já houver códigos repetidos no mesmo escritório, NADA é apagado nem
-- renumerado: a restrição de unicidade não é criada, um aviso lista os casos e a
-- consulta final também. Corrija os cadastros aqui no SQL Editor, por exemplo:
--   update public.processes set data = jsonb_set(data, '{code}', '"#NOVO"')
--    where organization_id = '…' and id = '…';
-- e rode esta migração de novo.

begin;

create table if not exists public.process_code_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_value bigint not null
);

-- Só o banco mexe no contador (pela função abaixo).
alter table public.process_code_counters enable row level security;
revoke all on public.process_code_counters from anon, authenticated;

-- Número do código (`#103000` → 103000); null se não for um código válido.
create or replace function public.process_code_number(p_code text)
returns bigint
language sql
immutable
as $$
  select nullif(left(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 15), '')::bigint
$$;

-- Contador começa no maior código já usado por escritório (nunca abaixo de #102999).
insert into public.process_code_counters as c (organization_id, last_value)
select organization_id, greatest(102999, coalesce(max(public.process_code_number(data ->> 'code')), 0))
from public.processes
group by organization_id
on conflict (organization_id) do update set last_value = greatest(c.last_value, excluded.last_value);

create or replace function public.processes_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  if tg_op = 'UPDATE' then
    -- O código é do banco e não muda depois de criado — pelo app. O SQL Editor
    -- (sem sessão de usuário) pode corrigir códigos repetidos antigos.
    if old.data ? 'code' and coalesce(auth.role(), '') in ('authenticated', 'anon') then
      new.data := jsonb_set(new.data, '{code}', old.data -> 'code');
    end if;
    return new;
  end if;

  update process_code_counters
     set last_value = last_value + 1
   where organization_id = new.organization_id
  returning last_value into next_value;

  if not found then
    -- Primeiro processo do escritório. Se outro cadastro criar o contador ao mesmo
    -- tempo, o ON CONFLICT espera por ele e soma 1 ao valor que ele gravou.
    insert into process_code_counters as c (organization_id, last_value)
    values (
      new.organization_id,
      greatest(102999, coalesce((
        select max(process_code_number(p.data ->> 'code')) from processes p where p.organization_id = new.organization_id
      ), 0)) + 1
    )
    on conflict (organization_id) do update set last_value = c.last_value + 1
    returning last_value into next_value;
  end if;

  new.data := jsonb_set(new.data, '{code}', to_jsonb('#' || next_value::text));
  return new;
end
$$;

revoke execute on function public.processes_assign_code() from public, anon, authenticated;

drop trigger if exists processes_assign_code on public.processes;
create trigger processes_assign_code
  before insert or update on public.processes
  for each row execute function public.processes_assign_code();

-- Unicidade: só se não houver repetidos (nada é apagado ou renumerado).
do $$
declare
  dup record;
  msg text := '';
begin
  for dup in
    select organization_id, data ->> 'code' as code, count(*) as total
      from public.processes
     where data ? 'code'
     group by 1, 2
    having count(*) > 1
  loop
    msg := msg || format(E'\n  escritório %s · código %s · %s processos', dup.organization_id, dup.code, dup.total);
  end loop;

  if msg <> '' then
    raise warning 'Há processos com o mesmo código interno no mesmo escritório. A restrição de unicidade NÃO foi criada; os novos códigos já vêm do banco e não repetem. Corrija estes cadastros e rode a migração de novo:%', msg;
  else
    create unique index if not exists processes_code_unique
      on public.processes (organization_id, (data ->> 'code'))
      where data ? 'code';
  end if;
end
$$;

commit;

-- Conferência: códigos repetidos por escritório (vazio = tudo certo).
select organization_id as "escritório", data ->> 'code' as "código repetido", count(*) as processos
from public.processes
where data ? 'code'
group by 1, 2
having count(*) > 1;
