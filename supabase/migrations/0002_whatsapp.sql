-- LEXA — Central de Atendimento (WhatsApp via Z-API).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois do 0001.
--
-- Regras de segurança:
--   * Toda tabela tem `organization_id`. As chaves estrangeiras são compostas
--     (`organization_id`, id): o banco recusa uma mensagem, tag ou conversa que
--     aponte para algo de outro escritório — mesmo vindo do servidor.
--   * A RLS só mostra linhas do escritório de quem está logado, com `whatsapp.view`.
--   * O navegador não grava nada aqui: envio, notas, status, responsável e tags
--     passam pelas rotas `app/api/whatsapp/*`, que checam a permissão e falam com a Z-API.
--   * Credenciais da Z-API não ficam no banco — só no `.env` do servidor.

-- ---------------------------------------------------------------------------
-- Permissões: módulo `whatsapp` + `whatsapp.assign` (distribuir conversas)
-- Precisa bater com `lib/auth/permissions.ts` (há um teste que confere).
-- ---------------------------------------------------------------------------

create or replace function public.role_defaults(p_role text)
returns text[]
language sql
immutable
as $$
  select case p_role
    when 'owner' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit', 'finance.view', 'finance.edit',
      'whatsapp.view', 'whatsapp.edit',
      'office.manage', 'users.manage', 'whatsapp.assign'
    ]
    when 'lawyer' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit', 'finance.view',
      'whatsapp.view', 'whatsapp.edit', 'whatsapp.assign'
    ]
    when 'staff' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit',
      'whatsapp.view', 'whatsapp.edit'
    ]
    else array[]::text[]
  end
$$;

-- Permite chave estrangeira composta para "membro deste escritório".
alter table public.profiles add constraint profiles_org_id_key unique (organization_id, id);

-- ---------------------------------------------------------------------------
-- Instâncias (conexões Z-API). Sem token: as credenciais ficam no servidor.
-- ---------------------------------------------------------------------------

create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null default 'zapi' check (provider in ('zapi')),
  -- ID da instância no provedor (ZAPI_INSTANCE_ID).
  external_id text not null,
  name text not null default 'WhatsApp',
  phone text,
  status text not null default 'unknown' check (status in ('unknown', 'connected', 'disconnected')),
  status_detail text,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Contatos: quem fala com o escritório. Vira cliente só com confirmação.
-- ---------------------------------------------------------------------------

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Só dígitos, com DDI (5511999998888).
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  -- Nome dado pelo escritório; sem ele, vale o nome do perfil do WhatsApp.
  name text,
  push_name text,
  avatar_url text,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id)
);

create index whatsapp_contacts_client_idx on public.whatsapp_contacts (organization_id, client_id);

-- ---------------------------------------------------------------------------
-- Status de conversa. Os quatro do sistema existem sempre; cada escritório pode
-- criar os seus (tabela abaixo), cada um ligado a uma categoria do sistema — é a
-- categoria que move filtros e automações ("Aguardando cliente", "Resolvidas").
-- ---------------------------------------------------------------------------

create table public.whatsapp_statuses (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$' and key not in ('new', 'in_progress', 'waiting_client', 'resolved')),
  label text not null check (char_length(label) between 1 and 40),
  color text,
  position int not null default 0,
  category text not null check (category in ('new', 'in_progress', 'waiting_client', 'resolved')),
  created_at timestamptz not null default now(),
  primary key (organization_id, key)
);

create or replace function public.whatsapp_status_category(p_org uuid, p_status text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status in ('new', 'in_progress', 'waiting_client', 'resolved') then p_status
    else (select category from whatsapp_statuses where organization_id = p_org and key = p_status)
  end
$$;

-- ---------------------------------------------------------------------------
-- Conversas: uma por contato e instância, com todo o histórico.
-- ---------------------------------------------------------------------------

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  instance_id uuid not null,
  contact_id uuid not null,
  status text not null default 'new',
  assigned_user_id uuid,
  unread_count int not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text check (last_message_direction in ('inbound', 'outbound', 'internal')),
  last_message_status text,
  last_inbound_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (instance_id, contact_id),
  foreign key (organization_id, instance_id) references public.whatsapp_instances (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.whatsapp_contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_user_id) references public.profiles (organization_id, id) on delete set null (assigned_user_id)
);

create index whatsapp_conversations_activity_idx on public.whatsapp_conversations (organization_id, last_message_at desc nulls last);

create or replace function public.whatsapp_check_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.whatsapp_status_category(new.organization_id, new.status) is null then
    raise exception 'Status de conversa desconhecido: %', new.status using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger whatsapp_conversations_status before insert or update of status on public.whatsapp_conversations
  for each row execute function public.whatsapp_check_status();

-- ---------------------------------------------------------------------------
-- Mensagens. Notas internas e eventos (`direction = 'internal'`) nunca têm id do
-- WhatsApp: o banco impede que uma nota seja tratada como mensagem enviada.
-- ---------------------------------------------------------------------------

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  type text not null check (type in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contact', 'note', 'event', 'unsupported')),
  body text,
  status text not null check (status in ('pending', 'sent', 'delivered', 'read', 'played', 'failed', 'received')),
  error text,
  provider_message_id text,
  provider_zaap_id text,
  reply_to_message_id uuid,
  reply_to_provider_id text,
  sent_by_user_id uuid references public.profiles (id) on delete set null,
  -- Enviada direto pelo celular, fora do LEXA.
  from_device boolean not null default false,
  -- Momento da mensagem (o do WhatsApp, quando vem de lá).
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  edited_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (conversation_id, provider_message_id),
  constraint whatsapp_messages_internal_kind check ((direction = 'internal') = (type in ('note', 'event'))),
  constraint whatsapp_messages_internal_never_sent check (direction <> 'internal' or (provider_message_id is null and provider_zaap_id is null)),
  foreign key (organization_id, conversation_id) references public.whatsapp_conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, reply_to_message_id) references public.whatsapp_messages (organization_id, id) on delete set null (reply_to_message_id)
);

create index whatsapp_messages_conversation_idx on public.whatsapp_messages (conversation_id, sent_at desc);
create index whatsapp_messages_provider_idx on public.whatsapp_messages (organization_id, provider_message_id) where provider_message_id is not null;
create index whatsapp_messages_zaap_idx on public.whatsapp_messages (organization_id, provider_zaap_id) where provider_zaap_id is not null;

-- ---------------------------------------------------------------------------
-- Arquivos e mídias. `storage_path` no bucket `whatsapp` (`<organization_id>/…`);
-- `remote_url` é a cópia temporária da Z-API (30 dias), usada até o download terminar.
-- ---------------------------------------------------------------------------

create table public.whatsapp_message_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,
  kind text not null check (kind in ('image', 'document', 'audio', 'video', 'sticker')),
  mime_type text,
  file_name text,
  size_bytes bigint,
  storage_path text check (storage_path is null or split_part(storage_path, '/', 1) = organization_id::text),
  remote_url text,
  thumbnail_url text,
  duration_seconds int,
  width int,
  height int,
  page_count int,
  voice_note boolean not null default false,
  download_status text not null default 'pending' check (download_status in ('pending', 'stored', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, message_id) references public.whatsapp_messages (organization_id, id) on delete cascade
);

create index whatsapp_attachments_message_idx on public.whatsapp_message_attachments (message_id);

-- ---------------------------------------------------------------------------
-- Tags personalizadas e responsáveis
-- ---------------------------------------------------------------------------

create table public.whatsapp_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#A88655',
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index whatsapp_tags_name_idx on public.whatsapp_tags (organization_id, lower(btrim(name)));

create table public.whatsapp_conversation_tags (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  tag_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id),
  foreign key (organization_id, conversation_id) references public.whatsapp_conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.whatsapp_tags (organization_id, id) on delete cascade
);

-- Histórico de atribuições (quem passou a conversa para quem). O responsável atual
-- fica em `whatsapp_conversations.assigned_user_id`.
create table public.whatsapp_conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  -- null = ficou sem responsável.
  user_id uuid,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id) references public.whatsapp_conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles (organization_id, id) on delete set null (user_id)
);

create index whatsapp_assignments_conversation_idx on public.whatsapp_conversation_assignments (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Log bruto dos webhooks (diagnóstico). Só o servidor lê e grava.
-- ---------------------------------------------------------------------------

create table public.whatsapp_webhook_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  instance_id uuid references public.whatsapp_instances (id) on delete set null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create index whatsapp_webhook_events_received_idx on public.whatsapp_webhook_events (received_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger whatsapp_instances_touch before update on public.whatsapp_instances for each row execute function public.touch_updated_at();
create trigger whatsapp_contacts_touch before update on public.whatsapp_contacts for each row execute function public.touch_updated_at();
create trigger whatsapp_conversations_touch before update on public.whatsapp_conversations for each row execute function public.touch_updated_at();
create trigger whatsapp_messages_touch before update on public.whatsapp_messages for each row execute function public.touch_updated_at();
create trigger whatsapp_attachments_touch before update on public.whatsapp_message_attachments for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Funções usadas pelo servidor (service role). Não executáveis pelo navegador.
-- ---------------------------------------------------------------------------

-- Cliente do escritório cujo telefone (só dígitos, sem o 55) está em `p_keys`.
create or replace function public.whatsapp_match_client(p_org uuid, p_keys text[])
returns text
language sql
stable
set search_path = public
as $$
  with c as (
    select id, created_at, regexp_replace(coalesce(data ->> 'phone', ''), '\D', '', 'g') as digits
    from clients
    where organization_id = p_org
  )
  select id
  from c
  where (case when length(digits) >= 12 and left(digits, 2) = '55' then substr(digits, 3) else digits end) = any (p_keys)
  order by created_at
  limit 1
$$;

-- Atualiza a conversa depois de uma mensagem nova: prévia, contadores e status.
--   * Mensagem do cliente numa conversa "Aguardando cliente" volta para "Em atendimento";
--     numa "Resolvida", reabre como "Novo".
--   * Resposta do escritório numa conversa "Nova" passa para "Em atendimento".
create or replace function public.whatsapp_touch_conversation(
  p_conversation uuid,
  p_at timestamptz,
  p_preview text,
  p_direction text,
  p_status text,
  p_count_unread boolean
)
returns void
language plpgsql
set search_path = public
as $$
declare
  conv whatsapp_conversations%rowtype;
  category text;
  newest boolean;
begin
  select * into conv from whatsapp_conversations where id = p_conversation for update;
  if not found then
    return;
  end if;

  category := whatsapp_status_category(conv.organization_id, conv.status);
  newest := conv.last_message_at is null or p_at >= conv.last_message_at;

  update whatsapp_conversations set
    last_message_at = case when newest then p_at else last_message_at end,
    last_message_preview = case when newest then left(p_preview, 280) else last_message_preview end,
    last_message_direction = case when newest then p_direction else last_message_direction end,
    last_message_status = case when newest then p_status else last_message_status end,
    last_inbound_at = case when p_direction = 'inbound' then greatest(coalesce(last_inbound_at, p_at), p_at) else last_inbound_at end,
    unread_count = unread_count + case when p_count_unread then 1 else 0 end,
    status = case
      when p_direction = 'inbound' and category = 'resolved' then 'new'
      when p_direction = 'inbound' and category = 'waiting_client' then 'in_progress'
      when p_direction = 'outbound' and category = 'new' then 'in_progress'
      else status
    end,
    resolved_at = case when p_direction = 'inbound' and category = 'resolved' then null else resolved_at end
  where id = p_conversation;
end
$$;

-- Aplica um status de entrega/leitura, só para frente (enviado → entregue → lido).
create or replace function public.whatsapp_apply_status(p_org uuid, p_ids text[], p_status text, p_at timestamptz)
returns int
language plpgsql
set search_path = public
as $$
declare
  rank_of constant jsonb := '{"pending": 0, "failed": 0, "sent": 1, "delivered": 2, "read": 3, "played": 4}';
  affected int;
begin
  update whatsapp_messages m set
    status = p_status,
    error = case when p_status = 'failed' then m.error else null end,
    delivered_at = case when p_status in ('delivered', 'read', 'played') then coalesce(m.delivered_at, p_at) else m.delivered_at end,
    read_at = case when p_status in ('read', 'played') then coalesce(m.read_at, p_at) else m.read_at end
  where m.organization_id = p_org
    and m.direction = 'outbound'
    and m.provider_message_id = any (p_ids)
    and (rank_of ->> m.status)::int < (rank_of ->> p_status)::int;
  get diagnostics affected = row_count;

  -- A prévia da conversa mostra o status da última mensagem (só se ela de fato avançou).
  update whatsapp_conversations c set last_message_status = p_status
  where c.organization_id = p_org
    and c.last_message_direction = 'outbound'
    and exists (
      select 1 from whatsapp_messages m
      where m.conversation_id = c.id
        and m.provider_message_id = any (p_ids)
        and m.status = p_status
        and m.sent_at >= c.last_message_at
    );

  return affected;
end
$$;

revoke execute on function public.whatsapp_match_client(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.whatsapp_touch_conversation(uuid, timestamptz, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.whatsapp_apply_status(uuid, text[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.whatsapp_match_client(uuid, text[]) to service_role;
grant execute on function public.whatsapp_touch_conversation(uuid, timestamptz, text, text, text, boolean) to service_role;
grant execute on function public.whatsapp_apply_status(uuid, text[], text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: leitura só do próprio escritório, com `whatsapp.view`. Nenhuma escrita
-- pelo navegador (as rotas do servidor usam a service role depois de checar
-- permissão e escritório).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'whatsapp_instances', 'whatsapp_contacts', 'whatsapp_statuses', 'whatsapp_conversations',
    'whatsapp_messages', 'whatsapp_message_attachments', 'whatsapp_tags',
    'whatsapp_conversation_tags', 'whatsapp_conversation_assignments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id() and public.has_perm(%L))',
      t || '_select', t, 'whatsapp.view');
  end loop;
end
$$;

-- Webhooks brutos: RLS ligada e nenhuma política — invisível para o navegador.
alter table public.whatsapp_webhook_events enable row level security;
revoke all on public.whatsapp_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real: a tela recebe mensagens e mudanças de conversa na hora. O Realtime
-- respeita a política de SELECT acima (cada pessoa só recebe o seu escritório).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.whatsapp_instances,
      public.whatsapp_contacts,
      public.whatsapp_conversations,
      public.whatsapp_messages,
      public.whatsapp_message_attachments,
      public.whatsapp_tags;
    -- Tags de conversa não entram: ao mudar, a rota toca `whatsapp_conversations`
    -- e a tela recarrega a conversa inteira (exclusões não passam pelo filtro do Realtime).
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Storage: mídias do WhatsApp (privado). Pasta `<organization_id>/…`.
--   * Recebidas: o servidor baixa da Z-API e grava (service role).
--   * Enviadas: o navegador sobe em `<organization_id>/outgoing/…` e a rota de envio
--     manda para a Z-API um link assinado temporário.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp', 'whatsapp', false, 67108864)
on conflict (id) do nothing;

create policy whatsapp_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_perm('whatsapp.view')
  );

create policy whatsapp_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'whatsapp'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (storage.foldername(name))[2] = 'outgoing'
    and public.has_perm('whatsapp.edit')
  );
