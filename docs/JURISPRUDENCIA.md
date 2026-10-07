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
  não há busca semântica por significado.
