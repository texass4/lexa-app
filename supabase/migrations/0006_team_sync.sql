-- Íntegra — equipe sem perder dados: tempo real e versão de cada registro.
--
-- Rode no SQL Editor do Supabase depois da 0001 (e da 0002, se usar o WhatsApp).
-- Pode rodar de novo sem erro. Não cria nem apaga tabelas e não muda a RLS.
--
-- 1. Versão do registro (`updated_at`). O app só grava uma alteração se o registro
--    ainda está na versão que a pessoa leu: `update ... where id = … and updated_at = …`.
--    Para isso a versão precisa mudar a CADA gravação. O `touch_updated_at` da 0001
--    usa `now()` (início da transação) e é compartilhado com o WhatsApp; aqui as
--    tabelas do escritório passam a usar `bump_row_version`, que garante uma versão
--    sempre maior que a anterior, mesmo com o relógio empatado. O navegador não
--    escolhe a versão: o valor enviado é sempre substituído pelo do banco.
--
-- 2. Tempo real. As tabelas entram na publicação `supabase_realtime`, que já tem as
--    do WhatsApp — a publicação não é recriada; só se acrescenta o que falta. O
--    Realtime respeita a política de SELECT de cada tabela (cada pessoa só recebe o
--    próprio escritório e só os módulos que pode ver).
--
-- Ao final, a consulta mostra as tabelas que estão na publicação.

begin;

-- ---------------------------------------------------------------------------
-- 1. Versão do registro
-- ---------------------------------------------------------------------------

create or replace function public.bump_row_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := clock_timestamp();
  else
    -- Estritamente crescente: duas gravações nunca deixam o registro na mesma versão.
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'processes', 'tasks', 'task_columns', 'appointments',
    'appointment_categories', 'documents', 'invoices', 'activities', 'notifications'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.bump_row_version()',
      t || '_touch', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Publicação do Realtime
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  pub record;
begin
  select * into pub from pg_publication where pubname = 'supabase_realtime';
  if not found then
    raise notice 'Publicação supabase_realtime não existe neste banco: tempo real não configurado.';
    return;
  end if;
  if pub.puballtables then
    -- Publicação "for all tables": as tabelas já estão incluídas.
    return;
  end if;

  foreach t in array array[
    'clients', 'processes', 'tasks', 'task_columns', 'appointments',
    'appointment_categories', 'documents', 'invoices', 'activities', 'notifications'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

commit;

-- Conferência: devem aparecer as 10 tabelas do escritório (e as do WhatsApp, se houver).
select tablename as "tabela no tempo real"
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
