-- Íntegra — privilégios mínimos para os papéis da API (anon, authenticated).
--
-- Rode no SQL Editor do Supabase depois da 0022. Pode rodar de novo sem erro.
-- Não mexe em dados, tabelas nem políticas — só retira privilégios que a aplicação
-- nunca usa. Para desfazer: `grant truncate, trigger, references on <tabela> to authenticated`.
--
-- Por quê: o padrão do Supabase concede ALL nas tabelas do schema public aos papéis
-- da API e confia na RLS. Mas a RLS NÃO vale para TRUNCATE, e TRIGGER/REFERENCES
-- permitem criar gatilhos e chaves estrangeiras sobre tabelas do escritório. A API
-- (PostgREST, Realtime, GraphQL) não expõe essas operações hoje — então nada muda
-- para a aplicação —, mas uma camada de defesa a menos é um erro de configuração a
-- um passo de virar incidente (ex.: uma função `security invoker` com SQL dinâmico).
--
-- 1. TRUNCATE, TRIGGER e REFERENCES: retirados de anon e authenticated em todas as
--    tabelas e views do schema public (o service_role e o dono continuam com tudo).
-- 2. `processes_summary` (view só de leitura da carga sob demanda, 0016): sem
--    INSERT/UPDATE/DELETE — a escrita é sempre em `processes`, com a RLS de lá.
-- 3. Tabelas criadas daqui em diante pelo mesmo papel (o do SQL Editor) já nascem
--    sem esses três privilégios para anon e authenticated.
-- 4. Storage: `documents` e `avatars` só aceitam os formatos que a Íntegra oferece na
--    tela (Documentos: PDF, DOCX, DOC, TXT, JPG, PNG; foto de perfil: PNG, JPG, WEBP).
--    Sem isso, um envio direto pela API poderia guardar HTML/SVG — e `avatars` é
--    público. Arquivos já guardados não são tocados. `whatsapp` fica como está: recebe
--    mídia de qualquer tipo vinda da Meta. Desfazer: `allowed_mime_types = null`.

begin;

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.relname);
  end loop;
end
$$;

revoke insert, update, delete on public.processes_summary from anon, authenticated;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'image/jpeg',
  'image/png'
]
where id = 'documents';

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'avatars';

commit;
