-- Íntegra — Jurisprudência: candidatas por QUESTÃO JURÍDICA (análise comparativa da IA).
--
-- Rode no SQL Editor do Supabase depois da 0024. Pode rodar de novo sem erro.
-- ADITIVA: só cria a função `jurisprudence_issue_candidates`. A tabela `jurisprudence`,
-- os dados, os índices e as funções `search_jurisprudence` (tela) e
-- `jurisprudence_ai_candidates` (0022) não mudam. Documentação: docs/JURISPRUDENCIA.md
-- (seção "Análise comparativa").
--
-- Por que uma função nova: a 0022 devolve qualquer decisão com QUALQUER conceito da
-- pergunta (OU) e só ordena por quantos conceitos aparecem. Numa base de dezenas de
-- milhares de acórdãos, "ICMS" sozinho, "benefício" sozinho ou "medicamento" sozinho
-- ocupam o lote de candidatas. Aqui, cada questão jurídica do caso (ex.: "a inscrição
-- indevida gera dano moral?") vira uma consulta em que os conceitos CENTRAIS são
-- obrigatórios (E entre grupos; OU entre as variantes de cada grupo) e os demais grupos
-- (fatos determinantes, expressões de ementa) só ajudam a ordenar.
--
-- Mesma ordem e mesmo retorno da 0022, para a classificação no servidor da aplicação
-- (`lib/ai/jurisprudence-pipeline.ts`) usar as duas do mesmo jeito.

begin;

create or replace function public.jurisprudence_issue_candidates(
  p_groups jsonb,
  p_required integer[],
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 40
)
returns table (
  id uuid,
  provider text,
  tribunal text,
  external_id text,
  process_number text,
  registry_number text,
  class_code text,
  class_name text,
  court text,
  rapporteur text,
  judgment_date date,
  publication_date date,
  publication text,
  decision_type text,
  subject text,
  ementa text,
  thesis text,
  keywords text,
  legislation text[],
  cited_precedents text,
  notes text,
  area text,
  degree text,
  source_url text,
  raw_reference jsonb,
  updated_at timestamptz,
  groups_a integer[],
  groups_b integer[],
  groups_c integer[],
  fts_rank real,
  matched_total bigint
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_groups tsquery[] := '{}';
  v_group tsquery;
  v_alt tsquery;
  v_any tsquery;
  v_all tsquery;
  v_item jsonb;
  v_text text;
  v_index integer;
  v_from date := nullif(p_filters ->> 'from', '')::date;
  v_to date := nullif(p_filters ->> 'to', '')::date;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 80);
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    return;
  end if;

  -- Igual à 0022: cada grupo = um conceito, variantes por OU, variante de várias palavras = frase.
  for v_item in select value from jsonb_array_elements(p_groups) with ordinality as g(value, n) where n <= 8 loop
    v_group := null;
    if jsonb_typeof(v_item) = 'array' then
      for v_text in select left(btrim(value), 80) from jsonb_array_elements_text(v_item) with ordinality as a(value, n) where n <= 16 loop
        continue when v_text is null or v_text = '';
        v_alt := phraseto_tsquery('public.pt_juris'::regconfig, v_text);
        continue when numnode(v_alt) = 0;
        v_group := case when v_group is null then v_alt else v_group || v_alt end;
      end loop;
    end if;
    v_groups := array_append(v_groups, v_group);
    if v_group is not null then
      v_any := case when v_any is null then v_group else v_any || v_group end;
    end if;
  end loop;

  if v_any is null then
    return;
  end if;

  -- Grupos obrigatórios (índices a partir de 0, como a aplicação os conhece). Grupo
  -- obrigatório vazio (só palavras vazias) torna a consulta impossível: não devolve nada.
  if p_required is not null then
    foreach v_index in array p_required loop
      continue when v_index is null or v_index < 0 or v_index >= coalesce(array_length(v_groups, 1), 0);
      if v_groups[v_index + 1] is null then
        return;
      end if;
      v_all := case when v_all is null then v_groups[v_index + 1] else v_all && v_groups[v_index + 1] end;
    end loop;
  end if;

  return query
  with hits as (
    select j.*,
      ts_rank('{0, 0.05, 0.4, 1.0}'::float4[], j.search, v_any) as wrank,
      count(*) over () as total_count
    from public.jurisprudence j
    where j.search @@ coalesce(v_all, v_any)
      and (nullif(p_filters ->> 'tribunal', '') is null or j.tribunal = p_filters ->> 'tribunal')
      and (nullif(p_filters ->> 'degree', '') is null or j.degree = p_filters ->> 'degree')
      and (nullif(p_filters ->> 'court', '') is null or j.court = p_filters ->> 'court')
      and (nullif(p_filters ->> 'class', '') is null or j.class_code = p_filters ->> 'class')
      and (nullif(p_filters ->> 'area', '') is null or j.area = p_filters ->> 'area')
      and (v_from is null or j.judgment_date >= v_from)
      and (v_to is null or j.judgment_date <= v_to)
  ),
  pool as (
    select * from hits h order by h.wrank desc, h.id limit 400
  ),
  scored as (
    select p.*,
      array(select i from generate_subscripts(v_groups, 1) i
            where v_groups[i] is not null and ts_filter(p.search, '{a}') @@ v_groups[i]) as ga,
      array(select i from generate_subscripts(v_groups, 1) i
            where v_groups[i] is not null and ts_filter(p.search, '{b}') @@ v_groups[i]) as gb,
      array(select i from generate_subscripts(v_groups, 1) i
            where v_groups[i] is not null and ts_filter(p.search, '{c}') @@ v_groups[i]) as gc
    from pool p
  )
  select s.id, s.provider, s.tribunal, s.external_id, s.process_number, s.registry_number, s.class_code, s.class_name,
    s.court, s.rapporteur, s.judgment_date, s.publication_date, s.publication, s.decision_type, s.subject, s.ementa,
    s.thesis, s.keywords, s.legislation, s.cited_precedents, s.notes, s.area, s.degree, s.source_url, s.raw_reference,
    s.updated_at, s.ga, s.gb, s.gc, s.wrank::real, s.total_count
  from scored s
  order by cardinality(s.ga) desc, cardinality(array(select unnest(s.ga) union select unnest(s.gb))) desc, s.wrank desc, s.id
  limit v_limit;
end
$$;

revoke all on function public.jurisprudence_issue_candidates(jsonb, integer[], jsonb, integer) from public, anon;
grant execute on function public.jurisprudence_issue_candidates(jsonb, integer[], jsonb, integer) to authenticated, service_role;

commit;
