# Jurisprudência — fonte, base e sincronização

A Íntegra **não gera** jurisprudência. Cada decisão vem de uma fonte oficial, é
normalizada e guardada numa base indexada no Supabase; a busca, a leitura e a
Análise da Íntegra trabalham **somente** sobre o que está nessa base. Sem fonte
configurada, a tela diz "Pesquisa de jurisprudência ainda não configurada." — nunca
mostra decisões de exemplo.

## 1. Fonte implementada: STJ — Portal de Dados Abertos

| | |
|---|---|
| Fonte | Superior Tribunal de Justiça — Portal de Dados Abertos (CKAN) |
| URL | https://dadosabertos.web.stj.jus.br · grupo Jurisprudência: https://dadosabertos.web.stj.jus.br/group/jurisprudencia |
| Conjuntos usados | "Espelhos de acórdãos" de cada órgão julgador: Corte Especial, 1ª/2ª/3ª Seção, 1ª a 6ª Turma (slugs `espelhos-de-acordaos-<orgao>`, configuráveis) |
| Método de acesso | API do CKAN (`GET /api/3/action/package_show?id=<conjunto>`) para listar os arquivos; download HTTP de cada arquivo JSON (`resources[].url`). Sem autenticação, sem chave |
| Frequência da fonte | Um arquivo novo por mês em cada conjunto (nome `AAAAMMDD.json` = data de extração). O primeiro arquivo de cada conjunto é um ZIP com o histórico |
| Frequência da Íntegra | Uma verificação por dia (o agendador pode chamar mais vezes: arquivo já lido não é baixado de novo). No máximo `JURISPRUDENCIA_STJ_ARQUIVOS_POR_EXECUCAO` (padrão 2) downloads por execução, um de cada vez, com pausa entre eles |
| Licença / uso comercial | Os conjuntos de jurisprudência do portal são publicados com licença **Creative Commons Atribuição (cc-by)** — uso livre, inclusive comercial, **com crédito à fonte**. Toda decisão mostra "Fonte: STJ — Portal de Dados Abertos" e o link oficial. A Portaria CNJ 209/2019 define dado aberto como uso livre "limitado a creditar a autoria ou a fonte". Recomendação: confirmação final do jurídico do escritório antes de uso comercial em escala |
| Limitações da fonte | Não há API de busca (só arquivos); os espelhos são os acórdãos **selecionados** pela Secretaria de Jurisprudência (não todos os julgados); o espelho não traz o inteiro teor (existe outro conjunto, "Íntegras de decisões terminativas e acórdãos do Diário da Justiça", não integrado ainda); atraso de ~1 mês |
| Campos do espelho usados | `id`, `numeroProcesso`, `numeroRegistro`, `siglaClasse`, `descricaoClasse`, `nomeOrgaoJulgador`, `ministroRelator`, `dataDecisao`, `dataPublicacao`, `ementa`, `tipoDeDecisao`, `decisao`, `teseJuridica`, `tema`, `jurisprudenciaCitada`, `referenciasLegislativas`, `notas`, `informacoesComplementares`, `termosAuxiliares` |

**Conferência do formato.** Os nomes de campo seguem o dicionário de dados publicado no
portal. O normalizador aceita as variações conhecidas (ex.: `relator`/`ministroRelator`,
datas `AAAAMMDD`, `DD/MM/AAAA` ou ISO) e **descarta** — sem inventar nada — o registro
sem identificador, órgão julgador, data ou ementa; cada descarte entra no log da
sincronização (`records_skipped` + motivo em `errors`). Se o STJ mudar o formato, a
primeira execução mostra isso no log em vez de gravar dados incompletos.

**Link para a fonte original.** Cada decisão guarda (a) o arquivo oficial de onde veio
(`raw_reference.file_url`) e (b) a consulta do processo no site do STJ pelo número de
registro (`source_url` = `https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=<numeroRegistro>`).

### Fontes avaliadas e não implementadas agora

| Fonte | Situação |
|---|---|
| STF (jurisprudencia.stf.jus.br) | Não há API pública documentada de jurisprudência; o site usa um serviço interno. Integrar seria raspagem frágil — fica para quando houver API/dado aberto oficial |
| DataJud (CNJ) | É base de metadados processuais, não de decisões; os termos de uso não autorizam uso como banco comercial de jurisprudência sem verificação. Não usado |
| TJs, TRFs, TST/TRTs | Cada tribunal tem portal próprio; o provider está pronto para recebê-los (`JurisprudenceSource`) quando houver fonte oficial com termos claros |
| Google, Jusbrasil, sites agregadores | Proibido (raspagem, termos de uso) |

## 2. Como a base é alimentada

```
agendador (diário) → GET /api/cron/jurisprudence-sync  (Bearer CRON_SECRET)
  → sync.ts: para cada conjunto configurado
       CKAN package_show → arquivos JSON ainda não lidos (jurisprudence_sync_files)
       primeira vez: só os N mais recentes (JURISPRUDENCIA_STJ_ARQUIVOS_INICIAIS, padrão 3)
       download (timeout, tamanho máximo, retry/backoff, Retry-After)
  → normalization.ts: limpa HTML/controle, corta tamanhos, valida datas e campos obrigatórios
  → deduplicação: (provider, tribunal, external_id) + hash do conteúdo
       novo → insere · mudou → atualiza · igual → ignora
  → Supabase (jurisprudence) → índice de texto (tsvector, português sem acento) + índices de filtro
  → jurisprudence_sync_runs (log: buscados, criados, atualizados, ignorados, erros, situação)
```

* **Idempotente:** arquivo só é marcado como lido depois de gravado; rodar de novo não
  duplica nem rebaixa. Repetir um arquivo dá "ignorados".
* **Controle:** limite de arquivos por execução e de tempo; 429 da fonte encerra a
  execução como `partial` e respeita o `Retry-After`; erro num conjunto não impede os
  outros.
* **Nada de "milhões de decisões":** começa pelos 3 meses mais recentes de cada órgão
  julgador e segue mês a mês. O arquivo histórico (ZIP) **não é lido nesta versão**.

## 3. O que é guardado

| Tabela | Conteúdo | Acesso |
|---|---|---|
| `jurisprudence` | Base pública indexada (uma linha por decisão, sem escritório) | leitura por membros ativos; escrita só pelo servidor |
| `jurisprudence_sync_runs` | Log de cada sincronização | só servidor |
| `jurisprudence_sync_files` | Arquivos da fonte já lidos (controle de idempotência) | só servidor |
| `saved_jurisprudence` | Decisões salvas pelo escritório (+ observações) | só o próprio escritório (`processes.view`) |
| `process_jurisprudence` | Vínculo decisão ↔ processo do escritório | só o próprio escritório; vincular exige `processes.edit` |

A mesma decisão nunca é copiada por escritório: salvar e vincular guardam só a
referência (`jurisprudence_id`). O código usa `organization_id`, o nome do escritório em
todas as tabelas da Íntegra.

## 4. Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `JURISPRUDENCIA_FONTES=stj` | Liga a fonte do STJ. Sem ela: "Pesquisa de jurisprudência ainda não configurada." |
| `CRON_SECRET` | Já existente — autentica o agendador |
| `JURISPRUDENCIA_STJ_CONJUNTOS` | (opcional) conjuntos, separados por vírgula; padrão: Corte Especial, 3 Seções e 6 Turmas |
| `JURISPRUDENCIA_STJ_ARQUIVOS_INICIAIS` | (opcional) arquivos mais recentes lidos na primeira vez por conjunto (padrão 3) |
| `JURISPRUDENCIA_STJ_ARQUIVOS_POR_EXECUCAO` | (opcional) downloads por execução (padrão 2) |
| `JURISPRUDENCIA_STJ_BASE_URL` | (opcional) só para homologação (em produção, sempre o portal oficial) |

Nenhuma chave é necessária para o STJ. Credenciais de fontes futuras: somente em
variáveis do servidor — o navegador nunca fala com a fonte.

## 5. Busca

Server-side (`POST /api/jurisprudencia/search` → função `search_jurisprudence` no
banco): linguagem natural ("indenização por negativação indevida sem prévia
notificação") vira uma busca por relevância (qualquer termo, com peso maior quando
todos aparecem e para ementa/assunto); termos entre aspas e `-exclusão` também valem.
Filtros: tribunal, grau, órgão julgador, classe, assunto, área, período; ordem por
relevância ou mais recentes; 20 por página; limite de requisições por pessoa; cache
curto no servidor. "Área" vem do Regimento Interno do STJ (1ª/2ª Turma e 1ª Seção:
Direito Público; 3ª/4ª e 2ª Seção: Direito Privado; 5ª/6ª e 3ª Seção: Direito Penal).
"Assunto" é a verbetação da própria ementa (o trecho inicial em maiúsculas).

## 6. Análise da Íntegra

Sob demanda, nunca automática, medida em `usage_events` como as demais análises.
Recebe apenas os campos da decisão (e, quando pedido, os dados do processo); responde
resumo, tese, resultado, pontos relevantes, fundamentos mencionados no texto,
relevância para a pesquisa e comparação com o processo — e diz o que não consta dos
dados. Números de processo, tribunal, relator e datas mostrados na tela vêm da base,
não do texto do modelo.

### Na conversa da Íntegra IA

* **Pergunta sobre jurisprudência** ("há jurisprudência sobre negativação indevida?", "o que
  o STJ decidiu sobre…", "existem precedentes para este caso?") → recuperação própria da
  IA (seção abaixo), separada da busca da tela; sem tema na pergunta, usa o
  assunto/tipo/classe do processo (ou o assunto da decisão). Só as decisões aprovadas pela
  classificação de pertinência vão para o modelo como `pesquisa_de_jurisprudencia`, com
  referências [J1]… que viram link para a decisão.
* **Conversa do processo** → sempre recebe as decisões vinculadas a ele.
* **"Quais decisões o escritório salvou?"** → recebe as salvas (RLS do escritório).
* **Conversa sobre uma decisão** (botão "Perguntar sobre esta decisão" no painel da
  decisão; escopo `jurisprudence`) → o contexto é a decisão inteira; "há decisões
  semelhantes?" pesquisa pelo assunto dela, sem repeti-la.
* Regras: a IA só cita decisões desses dados; referência inexistente é apagada da
  resposta; sem fonte configurada ou sem resultado, ela diz isso — nunca completa com
  decisões do próprio conhecimento.

### Recuperação para a IA (migração `0022_jurisprudencia_relevancia.sql`)

Por que existe: a busca da tela junta os termos com OU e premia quem tem todos os
termos em qualquer campo — inclusive só no texto integral. Na conversa, isso levava ao
modelo decisões previdenciárias ou tributárias que só citavam "atraso" ou "dano moral"
de passagem. A busca da tela **não mudou**.

1. **Plano da pesquisa** (`lib/ai/jurisprudence-query.ts`, sem banco nem IA): a última
   pergunta é guardada como está; o tema (sem "há jurisprudência sobre…") vira
   **conceitos**. Conceitos conhecidos vêm do dicionário revisável
   `lib/ai/jurisprudence-terms.ts` (variantes, singular/plural, formas mais amplas, ramos
   do Direito); palavras fora dele entram como estão, com singular e plural. No máximo 6
   conceitos — o resto fica registrado como "fora do teto". Sinônimo só com
   correspondência direta ("danos extrapatrimoniais" = dano moral; "atraso" sozinho
   **não** é atraso contratual).
2. **Candidatas** (`jurisprudence_ai_candidates`, até 60): um grupo de variantes por
   conceito; para cada decisão o banco diz **em que parte** cada conceito aparece —
   assunto/ementa (A), tese/classe/termos auxiliares (B), texto integral (C). Seleção por
   número de conceitos no assunto/ementa; a data não decide.
3. **Classificação** (`lib/ai/jurisprudence-relevance.ts`, constantes em `RELEVANCE`):
   por conceito, o melhor campo — assunto/ementa 3, tese 2, termos auxiliares 1,5, só
   texto integral 0,5; +1 se a frase do conceito aparece inteira; forma mais ampla
   ("medicamento" × "fornecimento de medicamento") vale metade; conceito genérico
   ("indenização") pesa metade. Ramo do Direito compatível com a pergunta: +1;
   incompatível: × 0,5 (penalidade, não exclusão). Pontuação = 100 × obtido ÷ máximo.
   * **descartada**: conceitos só no texto integral; só conceitos genéricos; abaixo de
     35; outra decisão do mesmo processo; mais de 2 com o mesmo assunto;
   * **diretamente pertinente**: ≥ 60 e ≥ 60% do peso dos conceitos fora do texto integral;
   * **relacionada**: passou do limiar, mas não sustenta conclusão.

   Vão à IA até 5 (diretas primeiro; no máximo 3 relacionadas), cada uma com nível,
   pontuação (controle interno) e o **trecho literal** da ementa/tese que a liga à
   pergunta. A data só desempata — salvo quando a pessoa pede decisões recentes.
4. **Instruções** (`CHAT_TASK`): citação literal × paráfrase × inferência; não
   generalizar uma decisão como "entendimento pacífico"; sem decisão diretamente
   pertinente, dizer que a evidência é insuficiente; "a pesquisa não encontrou" ≠ "a base
   não tem"; nunca mostrar código de referência solto nem nome de campo (o servidor
   ainda converte "J1" solto em link e troca nomes de campo por texto comum).
5. **Log** (`[ia] jurisprudência {…}`): consulta normalizada (sem nomes próprios e
   números), quantidades na base, candidatas, aprovadas, diretas, relacionadas, ids e
   pontuações selecionados, os 25 descartes de maior pontuação com o motivo, tempo. Nunca
   ementa, texto da decisão ou a pergunta inteira.
6. **Sem a 0022 aplicada**: a conversa continua funcionando — as candidatas vêm da busca
   da tela (20 decisões completas) e passam pela mesma classificação; o log marca
   `"compatibilidade": true`.

**Calibrar na base real**: `npm run jurisprudence:eval` (só leitura; usa
`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do `.env.local`) mostra, para as
perguntas de `scripts/jurisprudence-eval.queries.json`, a lista ANTES (o que a conversa
usava) e DEPOIS (o que vai à IA, com nível, pontuação, onde cada conceito apareceu,
trecho e principais descartes). `--pergunta="…"` avalia uma pergunta avulsa;
`--saida=arquivo.md` grava o relatório. Revise as decisões, anote os ids em
"relevantes"/"irrelevantes" e rode de novo: o script passa a contar acertos.

### Análise comparativa (caso × precedentes) — migração `0025_jurisprudencia_questoes.sql`

A conversa (quando a pergunta pede decisões) e o botão **"Analisar com precedentes"** no
painel "Jurisprudência relacionada" do processo usam o mesmo caminho. A busca da tela e a
0022 **não mudaram**.

1. **O caso** (`lib/ai/jurisprudence-case.ts`, sem IA nem rede): a pergunta e os dados
   autorizados do processo (assunto, tipo de ação, classe, área, observações, situação,
   movimentações — RLS de quem pede) viram **questões jurídicas**, **fatos** (cada um com a
   origem — pergunta ou processo — e o trecho literal), **provas** mencionadas ou ditas
   ausentes (mencionar não é provar), posição do cliente (autor/réu, só se estiver
   escrito), fase, tribunal, resultado pretendido e **lacunas**. Pergunta simples não
   exige esses campos (profundidade "simples").
2. **Questões** (`lib/ai/jurisprudence-issues.ts`, dicionário REVISÁVEL): cada questão do
   catálogo tem a pergunta, a tese afirmativa, os conceitos centrais, os ramos do Direito,
   as expressões típicas de ementa, os fatos determinantes, um **roteiro de verificação**
   (o que costuma ser examinado — não é fonte) e padrões de redação de ementa que indicam
   se a decisão **acolhe** ou **rejeita** a tese. Hoje: negativação × dano moral; atraso/
   inadimplemento contratual × dano moral; medicamento × poder público; hospital × erro
   médico; ICMS × TUSD/TUST; termo inicial de benefício. Pergunta fora do catálogo vira
   questão **genérica** pelos conceitos da pergunta (sem tese nem posição automática);
   pergunta só com palavras amplas ("responsabilidade civil e indenização") é marcada
   como **ampla demais** — nenhuma decisão é apresentada como aplicável.
3. **Consultas por questão** (`lib/ai/jurisprudence-pipeline.ts`): **principal** — os
   conceitos centrais OBRIGATÓRIOS (E entre grupos, OU entre variantes; função
   `jurisprudence_issue_candidates`) e os fatos do caso só para ordenar; **alternativa** —
   quando a principal traz menos de 5, com expressões de ementa; **contrários** — com
   expressões típicas de rejeição da tese, quando a principal encheu o limite ou não trouxe
   nenhuma contrária. Cada consulta fica registrada (conceitos, resultados, tempo, situação:
   executada, falhou, tempo esgotado, cancelada, pulada pelo limite).
4. **Classificação jurídica**: as candidatas passam pela classificação por campo da 0022
   (`rankCandidates`) e mais três regras — questão do catálogo exige TODOS os conceitos
   centrais no assunto/ementa/tese (só parte da questão é outra questão); decisão de
   outro ramo (ex.: penal numa questão cível) sai, com o motivo; mesmo processo = uma
   decisão (fica a de mérito, não os embargos de declaração). Pontuação 0–100 =
   0,45 questão (conceitos por campo) + 0,30 fatos em comum + 0,15 posição explícita na
   ementa + 0,05 metadados + 0,05 atualidade. Palavras em comum não bastam.
5. **Comparação** (para cada precedente): posição quanto à tese com a **oração literal**
   da ementa ("contudo" prevalece; "salvo…" é ressalva, também mostrada), posição para o
   cliente (réu inverte), **resultado do julgamento como escrito** no dispositivo,
   fatos em comum, **distinções** (fato oposto — ex.: com × sem registro na Anvisa —, fato só
   no precedente, fato só no caso, condição, ressalva) e metadados ausentes. Vigência:
   sempre "não verificada".
6. **Seleção**: até 6 (até 4 por questão), aplicáveis primeiro; até 2 vagas garantidas
   para **contrárias pertinentes** — nunca descartadas por serem contrárias.
7. **IA** (`JURISPRUDENCE_STRATEGY_TASK`, uma chamada, cache por conteúdo): síntese,
   precedentes e comparação, teses favoráveis (só com precedente de apoio), contrários e
   distinções, riscos, lacunas de prova, cenários condicionais (sem probabilidades) e
   próximos pontos. **Sem precedente pertinente ou com a base fora do ar, o modelo NÃO é
   chamado**: a resposta diz que não há suporte suficiente (ou que a base não respondeu —
   erro técnico ≠ ausência).
8. **Conferência depois do modelo** (`lib/ai/jurisprudence-citations.ts`,
   `finalizeStrategy`): referência inexistente sai; tese favorável sem precedente sai;
   trecho "literal" que não está, palavra por palavra, na ementa/tese/texto da decisão vira
   **paráfrase** com nota; número de recurso/processo/súmula fora dos dados, "entendimento
   consolidado/pacífico" e "continua vigente" geram aviso na tela.
9. **Limites, prazo, cache, cancelamento** (`PIPELINE`): 40 candidatas por consulta, no
   máximo 8 consultas e 8 s por análise (consultas além disso ficam "puladas"), cache de
   10 min por **escritório** + consulta (nunca atravessa escritórios), cancelamento de quem
   pede repassado ao banco (`AbortSignal`).
10. **Log** (`[ia] jurisprudência comparativa {…}`): questões, consultas (contagens e
    situação), métricas — candidatas, únicas, duplicatas removidas, pertinentes,
    selecionadas, aplicáveis, contrárias, cobertura das questões, taxa de pertinência,
    falhas, tempo —, ids e pontuações. Nunca a pergunta, ementas ou fatos do caso.
11. **Sem a 0025**: a consulta usa a 0022 (OU) e o E dos obrigatórios é conferido no
    servidor; sem a 0022, a busca da tela. O log marca `"compatibilidade": true`.

**Comparar antes × depois**: `npm run jurisprudence:benchmark` roda os casos de referência
revisados manualmente (`scripts/jurisprudence-reference/cases.json`, sobre o corpus
FICTÍCIO `corpus.json`, com ruído opcional `--ruido=1500`) pelo caminho antigo (consulta
única + classificação lexical) e pelo novo, e mede precisão, irrelevantes, cobertura,
contrárias incluídas e identificadas, duplicatas e "afirmação indevida" (decisão
apresentada como aplicável sem haver pertinente). `--memoria` dispensa banco; sem ele,
usa a busca textual REAL do Postgres do `.env.local` — carregue o corpus fictício só numa
base LOCAL (`--sql` gera o SQL) e apague depois. Na base real, `npm run jurisprudence:eval`
mostra as três versões (tela, conceitos, comparativa) lado a lado.

## 7. Pesquisa a partir do processo

Na página do processo, "Jurisprudência relacionada" mostra as decisões vinculadas e, só
quando a pessoa clica, pesquisa decisões a partir do **assunto**, do **tipo de ação** e da
**classe** do processo (palavras genéricas como "ação" e "procedimento" são retiradas —
senão tudo "combinaria") com o filtro de **área** correspondente. A frase "Encontramos X
decisões potencialmente relevantes" é a contagem da base. A Análise da Íntegra, sob
demanda, classifica a semelhança de cada decisão (alta/média/baixa) só com as ementas
recebidas; referências que não existem são descartadas no servidor.

## 8. Testes

| Onde | O quê |
|---|---|
| `lib/services/jurisprudence/jurisprudence.test.ts` | fonte (CKAN simulado: retry, 429, timeout, tamanho, redirecionamento, host), normalização, sincronização (idempotência, deduplicação, limites, erros), busca (validação, paginação, cache, erros do banco), configuração |
| `lib/ai/services/services.test.ts` | Análise da Íntegra: só dados da base, decisão inexistente, sem permissão, IA indisponível, referência inventada descartada |
| `supabase/tests/jurisprudencia.sql` (`npm run test:rls`) | RLS e isolamento entre escritórios, permissões, deduplicação, busca (sem acento, filtros, paginação) |
| `lib/ai/jurisprudence-relevance.test.ts` | recuperação da IA com decisões FICTÍCIAS: plano da pesquisa, 5 cenários (negativação, atraso contratual, erro médico, medicamento, ICMS/TUSD/TUST) com decisão pertinente × outro ramo × só texto integral × duplicata, limiar, assunto repetido, data como desempate, log sem texto |
| `supabase/tests/jurisprudencia_relevancia.sql` (`npm run test:rls`) | `jurisprudence_ai_candidates`: onde cada conceito aparece (A/B/C), ordem, filtros, RLS, busca da tela inalterada |
| `lib/ai/jurisprudence-comparative.test.ts` | análise comparativa com o corpus FICTÍCIO: o caso (questões, fatos com origem, provas, posição, fase, lacunas), leitura de posição/resultado, os 12 cenários (pergunta específica, sinônimos, mesma matéria com fatos diferentes, contrário, base sem pertinentes, falha/prazo/cancelamento, duplicidade, metadados incompletos, muitos irrelevantes — antes × depois —, fidelidade, isolamento do cache, informação insuficiente), limites, log sem texto, conferência de citações e o serviço (uma chamada; sem pertinente ou com base fora do ar, nenhuma; processo de outro escritório; sem permissão) |
| `supabase/tests/jurisprudencia_questoes.sql` (`npm run test:rls`) | `jurisprudence_issue_candidates`: grupos obrigatórios em E, marcação A/B/C, grupo vazio, filtros, RLS, 0022 inalterada |
| `tests/integration/jurisprudencia.integration.ts` (`npm run test:integration`) | ponta a ponta num Supabase real: arquivo → sincronização → busca → salvar → vincular → isolamento |

## 9. Limitações conhecidas

* Neste ambiente de desenvolvimento a rede bloqueia o portal do STJ: o formato foi
  implementado pelo dicionário de dados publicado e validado com arquivos no mesmo
  formato. **Na primeira sincronização em produção, confira o log** (`jurisprudence_sync_runs`):
  registros descartados aparecem com o motivo.
* Só o STJ (espelhos de acórdãos selecionados, sem inteiro teor). STF, TJs, TRFs e
  TST/TRTs dependem de fonte oficial com termos claros.
* "Assunto" é a verbetação da ementa (o STJ não publica o assunto da tabela do CNJ no espelho).
* Relevância: ordenação por texto (peso de ementa/assunto e presença de todos os termos);
  não há busca semântica por significado. Na conversa, a classificação por conceito
  (seção 6) depende do dicionário revisável: tema sem conceito no dicionário é pesquisado
  pelas palavras da pergunta (com singular/plural), sem sinônimos.
* Os limiares (`RELEVANCE`) foram calibrados com decisões fictícias: **confira na base
  real** com `npm run jurisprudence:eval` antes de confiar nos números.
* Análise comparativa: o catálogo de questões, fatos e padrões de posição cobre 6 questões;
  fora dele, a questão é genérica (sem posição nem distinção por fato). A posição é
  **lida por padrões de redação** da ementa — pode errar com redação incomum; por isso vem
  sempre com a oração literal para o advogado conferir. O resultado do julgamento só é
  lido quando o dispositivo/ementa o escreve. A base não registra reforma, superação nem
  decisões posteriores: vigência nunca é afirmada.
* A melhora medida (casos de referência) usa corpus e casos escritos pela mesma equipe que
  escreveu o catálogo: é evidência de que o caminho funciona, **não** de qualidade na base
  real — revise ids reais em `scripts/jurisprudence-eval.queries.json` e rode
  `npm run jurisprudence:eval`.
