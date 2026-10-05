-- Íntegra — Cadastro público protegido contra abuso, bots e enumeração de e-mails.
--
-- Rode no SQL Editor do Supabase depois da 0014. Pode rodar de novo sem erro.
--
-- 1. Limite de tentativas (`auth_rate_hit`) guardado no banco: vale com vários
--    servidores ao mesmo tempo (a memória de uma instância serverless não vale).
--    A chave é um hash (HMAC) da regra + IP/e-mail — o banco nunca guarda o IP nem o
--    e-mail em texto. Também marca desafios anti-bot já usados (uso único).
-- 2. `auth_email_status`: a situação de um e-mail no Auth (sem conta, aguardando
--    confirmação, confirmado). Só o servidor consulta, e a resposta da API é sempre a
--    mesma — é o que permite o cadastro não revelar quem já tem conta.
-- 3. `provision_signup`: cria o escritório e o perfil de Sócio só depois que o e-mail
--    foi confirmado. Antes disso existe apenas o usuário do Auth, que não entra
--    (o Supabase recusa o login de e-mail não confirmado) e não vê nada.
--
-- Depois de rodar: no painel do Supabase, Authentication › Sign In / Providers,
-- desligue "Allow new users to sign up". O cadastro da Íntegra usa a API de
-- administração (service role), que continua funcionando; desligado, ninguém cria
-- conta chamando o Auth do Supabase direto, sem passar por estas proteções.
-- Sem `case ... end` dentro das funções (o SQL Editor do Supabase corta a função).

begin;

-- ---------------------------------------------------------------- 1. limites
create table if not exists public.auth_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;

-- Conta uma tentativa na janela atual (janela fixa). true = ainda dentro do limite.
create or replace function public.auth_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_key is null or length(p_key) = 0 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Parâmetros inválidos.' using errcode = 'invalid_parameter_value';
  end if;

  insert into auth_rate_limits (key, window_start, hits) values (p_key, now(), 0)
  on conflict (key) do nothing;

  select window_start, hits into v_start, v_hits from auth_rate_limits where key = p_key for update;

  if v_start < now() - make_interval(secs => p_window_seconds) then
    v_start := now();
    v_hits := 0;
  end if;
  v_hits := v_hits + 1;

  update auth_rate_limits set window_start = v_start, hits = v_hits where key = p_key;

  -- Limpeza ocasional das janelas vencidas (nenhuma regra passa de 1 dia).
  if random() < 0.01 then
    delete from auth_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end
$$;

-- ------------------------------------------------------- 2. situação do e-mail
create or replace function public.auth_email_status(p_email text)
returns table (user_id uuid, confirmed boolean, has_profile boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email_confirmed_at is not null, exists (select 1 from public.profiles p where p.id = u.id)
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1
$$;

-- --------------------------------------- 3. escritório só com e-mail confirmado
create or replace function public.provision_signup(
  p_user uuid,
  p_email text,
  p_name text,
  p_office text,
  p_cnpj text,
  p_plan text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
begin
  -- Dois cliques no mesmo link não criam dois escritórios.
  perform pg_advisory_xact_lock(hashtext('provision_signup:' || p_user::text));

  select organization_id into v_org from profiles where id = p_user;
  if found then
    return v_org;
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    raise exception 'E-mail ainda não confirmado.' using errcode = 'check_violation';
  end if;
  if p_status not in ('pending', 'active') then
    raise exception 'Situação inválida.' using errcode = 'check_violation';
  end if;

  insert into organizations (name, cnpj, email, plan, status, approved_at)
  values (p_office, nullif(trim(coalesce(p_cnpj, '')), ''), p_email, p_plan, p_status, (select now() where p_status = 'active'))
  returning id into v_org;

  insert into profiles (id, organization_id, role, name, email)
  values (p_user, v_org, 'owner', p_name, p_email);

  return v_org;
end
$$;

revoke execute on function public.auth_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.auth_email_status(text) from public, anon, authenticated;
revoke execute on function public.provision_signup(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.auth_rate_hit(text, integer, integer) to service_role;
grant execute on function public.auth_email_status(text) to service_role;
grant execute on function public.provision_signup(uuid, text, text, text, text, text, text) to service_role;

commit;
