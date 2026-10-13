-- Íntegra — WhatsApp oficial (WhatsApp Business Cloud API, da Meta).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois do 0020. Pode rodar de
-- novo sem problema (tudo é "if not exists"/recriado) e não apaga nem reescreve nada:
-- conversas, mensagens e a conexão antiga (Z-API) continuam como estão.
--
-- Reaproveita as tabelas do 0002 (instâncias, contatos, conversas, mensagens, status):
--   * `whatsapp_instances` ganha o provedor `meta`. Para ele, `external_id` é o
--     Phone Number ID e `business_account_id` o WABA ID — ids públicos da Meta.
--     `unique (provider, external_id)` (do 0002) impede que dois escritórios
--     vinculem o mesmo número.
--   * O token de acesso de cada escritório fica em `whatsapp_credentials`, cifrado pelo
--     servidor (AES-256-GCM, chave fora do banco). A tabela não tem política de RLS
--     nem permissão para o navegador: só a service role lê.
--   * Estado `error`: a conexão foi configurada mas a última verificação falhou —
--     "conectado" só depois de a Meta confirmar o número e o token.

-- ---------------------------------------------------------------------------
-- Instâncias: provedor `meta`, estado `error` e dados públicos do número
-- ---------------------------------------------------------------------------

alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_provider_check;
alter table public.whatsapp_instances
  add constraint whatsapp_instances_provider_check check (provider in ('zapi', 'meta'));

alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_status_check;
alter table public.whatsapp_instances
  add constraint whatsapp_instances_status_check check (status in ('unknown', 'connected', 'disconnected', 'error'));

alter table public.whatsapp_instances
  -- WABA ID (conta do WhatsApp Business na Meta).
  add column if not exists business_account_id text,
  -- Nome exibido aprovado pela Meta e qualidade do número (GREEN, YELLOW, RED…).
  add column if not exists verified_name text,
  add column if not exists quality_rating text,
  -- Última verificação do número e do token na Meta (com ou sem sucesso).
  add column if not exists last_checked_at timestamptz;

alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_meta_ids;
alter table public.whatsapp_instances
  add constraint whatsapp_instances_meta_ids check (
    provider <> 'meta'
    or (external_id ~ '^[0-9]{5,30}$' and business_account_id ~ '^[0-9]{5,30}$')
  );

-- Um número oficial por escritório nesta etapa (trocar de número é feito pelo suporte,
-- para não misturar o histórico de dois números numa conversa só).
create unique index if not exists whatsapp_instances_meta_org_idx
  on public.whatsapp_instances (organization_id)
  where provider = 'meta';

-- ---------------------------------------------------------------------------
-- Credenciais por escritório (só o servidor)
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_credentials (
  instance_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- "v1:<iv>:<tag>:<cifra>" (base64). A instância entra como dado autenticado: a cifra
  -- copiada para outra instância não abre.
  access_token_encrypted text not null check (access_token_encrypted like 'v1:%'),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, instance_id) references public.whatsapp_instances (organization_id, id) on delete cascade
);

drop trigger if exists whatsapp_credentials_touch on public.whatsapp_credentials;
create trigger whatsapp_credentials_touch before update on public.whatsapp_credentials
  for each row execute function public.touch_updated_at();

-- RLS ligada e nenhuma política: invisível para o navegador (anon e authenticated).
alter table public.whatsapp_credentials enable row level security;
revoke all on public.whatsapp_credentials from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mensagens: código do erro devolvido pelo provedor (ex.: 131047 = fora da janela de
-- 24 h), para a tela explicar e para o diagnóstico. O texto do erro continua em `error`.
-- ---------------------------------------------------------------------------

alter table public.whatsapp_messages add column if not exists provider_error_code text;

-- Webhooks: de qual provedor veio (diagnóstico).
alter table public.whatsapp_webhook_events add column if not exists provider text;
