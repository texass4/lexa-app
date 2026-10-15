-- Íntegra — favoritos da Central de Documentos.
--
-- Rode no SQL Editor do Supabase depois da 0025. Pode rodar de novo sem erro.
-- ADITIVA: cria só a tabela `document_favorites`. Nenhuma tabela, dado ou política
-- existente muda.
--
-- Cada pessoa marca os próprios favoritos: a marcação é dela, não do escritório.
-- Só lê, cria e apaga as próprias linhas, do próprio escritório, e só com a permissão
-- de ver documentos. O documento precisa existir no mesmo escritório (chave estrangeira);
-- excluído o documento, o favorito sai junto.

begin;

create table if not exists public.document_favorites (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, document_id),
  foreign key (organization_id, document_id) references public.documents (organization_id, id) on delete cascade
);

create index if not exists document_favorites_document_idx on public.document_favorites (organization_id, document_id);

alter table public.document_favorites enable row level security;
revoke all on public.document_favorites from anon, authenticated;
grant select, insert, delete on public.document_favorites to authenticated;

drop policy if exists document_favorites_select on public.document_favorites;
create policy document_favorites_select on public.document_favorites
  for select to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid() and public.has_perm('documents.view'));

drop policy if exists document_favorites_insert on public.document_favorites;
create policy document_favorites_insert on public.document_favorites
  for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid() and public.has_perm('documents.view'));

drop policy if exists document_favorites_delete on public.document_favorites;
create policy document_favorites_delete on public.document_favorites
  for delete to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid() and public.has_perm('documents.view'));

commit;
