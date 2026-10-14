# Consulta processual ("Consultar processo")

Workflow que reúne o que as fontes oficiais informam sobre um processo e apresenta um
relatório único, com a fonte, a data da consulta e onde verificar cada informação. O que
nenhuma fonte trouxe aparece como **"Não disponível na fonte consultada"** — nada é
completado, presumido ou inventado.

- Entrada: **Processos › Consultar processo** (número CNJ ou processo do cadastro), o menu
  de cada linha da lista, o menu "…" do processo e o botão **Consultar** do painel
  "Andamento".
- Página: `/processos/consulta?execucao=<id>` (acompanha as etapas e mostra o relatório).
- Código: `lib/services/consulta/*` (workflow, relatório, magistrado, serviço, fontes,
  persistência), `lib/integrations/legal/djen/*` (comunicações), `components/processos/consulta/*`.
- Banco: `supabase/migrations/0020_consulta_processual.sql` (tabela `process_enrichment_runs`).
- Testes: `lib/services/consulta/consulta.test.ts`, `lib/integrations/legal/djen/djen.test.ts`,
  `lib/ai/services/enrichment.test.ts`, `supabase/tests/consulta_processual.sql`.

## Etapas (estado visível na tela)

1. **Validar** o número (20 dígitos + dígito verificador do CNJ).
2. **Fonte principal** (DataJud).
3. **Normalizar** (ficha da Íntegra: sem formato bruto da fonte).
4. **Complementares** em paralelo, cada uma com prazo próprio: comunicações (DJEN) e
   jurisprudência relacionada.
5. **Magistrado e órgão julgador** (regras abaixo).
6. **Consolidar** movimentações, divergências entre fontes e comparação com o cadastro.
7. **Registrar** fontes, horários, duração, estado de cada fonte e campos encontrados.
8. **Relatório**: concluído, parcial (alguma fonte falhou) ou falhou (nenhuma trouxe dados).

Execução no servidor: a rota responde na hora com o id da execução e o trabalho segue em
segundo plano (`after` do Next, `maxDuration` 120 s); a tela relê a execução a cada 1–2,5 s.
Uma fonte fora do ar não derruba as outras.

| Proteção | Como |
|---|---|
| Timeout | DataJud: 35 s por tentativa, 60 s no total (cliente) + 70 s no workflow; complementares: 20 s por tentativa, 30 s no workflow |
| Cancelamento | Estourado o prazo do workflow, a consulta complementar (DJEN, índice superior) é **cancelada** (`AbortSignal`): a requisição em curso é interrompida e nenhuma nova tentativa, espera ou página começa (`lib/integrations/legal/cancel.ts`). A fonte principal usa o cache compartilhado de consultas em andamento e fica limitada pelo prazo total do próprio cliente (60 s) |
| Retry/backoff | 3 tentativas só para falhas passageiras, espera exponencial; `Retry-After` respeitado; 429 para na hora |
| Cache | DataJud: cache do escritório (6 h; "Consultar novamente" aceita até 1 min). DJEN: 1 h por escritório + número. Consulta concluída há < 10 min é reaproveitada (a menos que se peça "Consultar novamente") |
| Deduplicação | Uma execução em andamento por escritório + número (índice único no banco); pedidos repetidos voltam a mesma. Chamadas simultâneas à mesma fonte viram uma |
| Limite | 20 consultas novas por pessoa a cada 10 min e 300 por escritório por dia (`auth_rate_hit`) |
| Execução esquecida | "Rodando" há mais de 5 min vira "falhou" e libera nova consulta |

## Fontes

### 1. DataJud — API Pública (CNJ) · **integrada** (já existia; reutilizada)

| | |
|---|---|
| O que é | Índice público de metadados processuais que os tribunais enviam ao CNJ |
| Cobertura | Tribunais com índice `api_publica_<sigla>`: STJ, TST, TSE, STM, TRF1–6, TRT1–24, os 27 TJs (`lib/integrations/legal/datajud/tribunals.ts`) |
| Campos | número, tribunal, grau, sistema, formato, classe, **assuntos**, órgão julgador (nome, código, município IBGE), data de ajuizamento, última atualização, nível de sigilo, movimentações (data, código TPU, complementos, órgão) |
| Não traz | partes e advogados, **magistrado**, valor da causa, prioridades, documentos/autos |
| Limitações | atualização em lotes pelos tribunais (atraso de dias); processos sigilosos podem não aparecer; sob carga responde 200 sem resultados (tratado como falha passageira) |
| Custo | gratuita |
| Uso comercial | sujeito aos termos publicados pelo CNJ na documentação do DataJud — **pendente de validação jurídica/contratual** antes de uso comercial (este documento não conclui sobre a licitude) |
| Configuração | `DATAJUD_API_KEY` (chave pública divulgada pelo CNJ); Admin › Configurações › "Consulta automática ao DataJud" |
| Verificar | link para o site oficial do tribunal (a API não tem página por processo) |

### 2. Comunicações processuais — DJEN / Comunica (CNJ) · **implementada, desligada por padrão**

| | |
|---|---|
| O que é | API pública do Diário de Justiça Eletrônico Nacional (`comunicaapi.pje.jus.br`), consulta por número do processo |
| Campos | data de disponibilização, tribunal, órgão, tipo de comunicação e de documento, classe, teor (só para ler menções; o relatório guarda um trecho de 280 caracteres), link do documento/certidão oficial, destinatários (nome e polo, como publicados), advogados (nome, OAB, UF) |
| Uso no relatório | partes e representantes **como publicados**; menções a magistrados com o papel escrito no texto; divergência de órgão/classe com o DataJud |
| Limitações | só processos com comunicações publicadas; **bloqueia acesso de fora do Brasil (HTTP 403)** — o servidor precisa rodar no Brasil; limite por IP; o CNJ **não publica termos de uso comercial** |
| Custo | gratuita, sem chave |
| Uso comercial | **não confirmado** — por isso fica desligada (`DJEN_CONSULTA_ENABLED`) até o escritório confirmar com o CNJ |
| Estado da validação | testada com respostas no formato documentado (testes automatizados). **Não validada ao vivo neste ambiente de desenvolvimento** (rede bloqueada para o domínio). Valide ligando a variável num servidor no Brasil |
| Configuração | `DJEN_CONSULTA_ENABLED=true` (padrão desligado); opcional `DJEN_BASE_URL` |

### 3. Base de jurisprudência da Íntegra (STJ — Dados Abertos) · **integrada** (já existia)

Pesquisa local (sem rede externa) por assunto, classe e tipo de ação; ver
`docs/JURISPRUDENCIA.md`. Só roda com `JURISPRUDENCIA_FONTES` configurada.

Estados distintos no relatório (`jurisprudence.state`) e na tela — "não pesquisou" nunca
aparece como "não achou":

| Estado | Quando |
|---|---|
| `results` | pesquisa feita, com decisões relacionadas |
| `no_results` | pesquisa feita, nenhuma decisão para os termos |
| `not_run` | não pesquisado: o processo não tem assunto, classe nem tipo de ação suficientes |
| `not_configured` | base de jurisprudência não configurada |
| `unavailable` | a base falhou ou ficou indisponível |
| `timeout` | a pesquisa passou do prazo e foi interrompida |

Relatórios gravados antes do campo são lidos pelo estado da fonte
(`lib/services/consulta/jurisprudence-state.ts`).

### 4. Cadastro do escritório · **interna**

Mostrado e comparado com as fontes públicas, **nunca alterado pela consulta**.

### 5. Site oficial do tribunal · **link (sem consulta automática)**

Nome, segmento de Justiça e site oficial (`https://www.<sigla>.jus.br`) do tribunal de origem,
derivados da estrutura do número CNJ (Resolução CNJ 65/2008), sem rede; quando o tribunal atual
é confirmado e é outro, o link dele também aparece. A consulta pública do tribunal é feita pela
pessoa — pode pedir CAPTCHA, e a Íntegra não acessa por ela.

## Tribunal de origem × tribunal atual × tribunal inferido

`lib/services/processos/tribunal-identification.ts` (lógica pura; testes em
`tribunal-identification.test.ts`, com dados simulados).

| | De onde vem | O que garante |
|---|---|---|
| **Origem** | número CNJ (`J.TR`, `lib/processos/tribunals.ts`), sem rede | onde o processo começou — nunca apresentado como "atual" |
| **Atual** | registros do DataJud (todos os documentos do número, um por grau) | só com evidência suficiente (critérios abaixo) |
| **Inferido** | tribunal dos registros encontrados ou, sem registro, a origem | sempre rotulado como inferência; **nunca** em divergência |

Critérios para o atual ser `confirmed` (todos): algum índice consultado tem registro; todos os
registros apontam o mesmo tribunal, igual ao do índice (senão `conflicting`, com os tribunais
listados em `candidates` e nenhum escolhido); o registro mais recente informa o tribunal e tem
data de atualização; há movimentação e a última não indica **de forma explícita** a saída do
tribunal (remessa a tribunal superior ou a outra Justiça, declínio de competência, baixa num
tribunal superior, envio à instância superior a partir do 2º grau — "remessa ao contador",
"mandado devolvido" e afins não contam); nenhuma outra consulta falhou; as respostas vieram
completas (`coverage`: sem fragmento falho nem truncamento). O grau só é informado quando um
único grau aparece.

Estados distintos: `not_confirmed`, `conflicting`, `not_found` (ausência não prova onde tramita),
`unsupported` (tribunal conhecido, sem fonte), `unknown_tribunal` (código inexistente na
numeração), `invalid_number` (dígito verificador ou tamanho), `not_checked` (nenhuma consulta
concluída, segredo de justiça, cadastro manual nunca consultado) e `legacy` (processo salvo antes
desta verificação).

- **Validade × cobertura:** `parseCNJ` (`lib/processos/cnj.ts`) só diz se o número é bem formado;
  a identificação da origem cobre todos os segmentos (inclusive TRE, TJM, STF, CNJ e as
  Circunscrições Judiciárias Militares `7.01`–`7.12`, abaixo do STM), e a cobertura do DataJud
  (`datajud/tribunals.ts`) diz se há índice para consultar. TRE, Justiça Militar Estadual e CJM
  ficam fora da cobertura até a grafia dos índices ser conferida na documentação oficial do
  DataJud (o número continua identificado).
- **Busca:** `match` em `numeroProcesso`, até 20 documentos (`SEARCH_SIZE`). Documento de outro
  número é descartado; resposta parcial (fragmentos falhos com registros) ou truncada (total
  maior que o devolvido) fica marcada na consulta e impede a confirmação.
- **Tribunal superior (complementar):** a consulta processual também procura o número no
  índice do superior do segmento (STJ para Estadual/Federal/Militar Estadual, TST, TSE, STM), em
  paralelo, com o prazo das fontes complementares. Nada encontrado lá não prova nada; registro lá
  e na origem vira `conflicting`; falha lá impede a confirmação, mas não derruba a consulta. A
  importação, a sincronização e o monitoramento não consultam o superior (sem custo extra no cron).
- **Persistência:** `Process.tribunalIdentification` (dentro de `data`, sem migração). Cada
  gravação junta a consulta mais recente de **cada índice** (`mergeChecks`): a sincronização só da
  origem substitui só a consulta de origem e mantém a do superior — uma divergência continua
  divergência até uma nova consulta àquele índice. "Atualizar processo com a consulta" envia as
  consultas do relatório (inclusive a do superior) e nunca confirma um tribunal por si.
- **Tentativas:** `lastAttempt` guarda a última consulta (sucesso ou não). O monitoramento grava a
  falha (não localizado, 429, fonte fora) sem mexer na evidência; a tela mostra "Última
  confirmação válida" e "Última tentativa" separadas, e a IA recebe a limitação.
- **Datas:** as da fonte em horário de parede, lidas literalmente (como na ficha); as da Íntegra
  (consulta, tentativa) em horário local do escritório. Tudo sem fuso na identificação.
- **Compatibilidade:** processos e relatórios antigos, sem o campo ou com a forma anterior (sem
  `cnj`/`coverage`, datas em UTC), são lidos e mesclados normalmente.
- **Comarca:** a sigla do tribunal deixou de ser gravada em `district`. Registros antigos com a
  sigla não são regravados — `processDistrict` a ignora na leitura (perfil e IA).
- **IA:** a regra 11 do prompt de sistema diz que a origem nunca é o atual e que só o estado
  `confirmed` permite afirmar onde o processo tramita. O contexto (`tribunal_identificacao`) leva
  estado, significado, motivos, fonte e datas, os tribunais com registro em divergência e a
  última tentativa — só fatos, sem instrução embutida nos dados. O tribunal do cadastro vai como
  `tribunal_no_cadastro`, inclusive no contexto de jurisprudência.

### Não integradas (e por quê)

| Fonte | Motivo |
|---|---|
| Páginas de consulta pública dos tribunais (PJe, eproc, e-SAJ…) | exigem interação/CAPTCHA; automatizar seria scraping — não permitido |
| Perfil institucional de magistrados | não há API oficial; os tribunais publicam em páginas próprias, sem padrão |
| Provedores privados (Escavador, Judit, Codilo…) | pagos, exigem contrato; a interface `ProcessProvider` já permite plugar um quando houver autorização |

## Magistrado — regras

- O DataJud **não** informa magistrado. O nome do órgão julgador **nunca** vira nome de juiz.
- Só conta um nome com o papel escrito ao lado, no texto de uma comunicação oficial
  ("Relator(a): Des. …", "…, Juiz(a) de Direito", "… Juíza Federal"). Assinatura
  "assinado eletronicamente por X" sem papel de magistrado não conta (costuma ser servidor).
- Papéis distintos: relator, juiz, desembargador, ministro.
- A tela mostra cada nome como **menção datada, com o trecho e o link da publicação** — e diz
  que isso **não confirma o magistrado responsável atual**.

## Segredo de justiça e sigilo

Regra única no servidor (`lib/services/consulta/protection.ts`), aplicada **antes** das
consultas complementares e **antes** de gravar o relatório. O nível de sigilo nunca é alterado.

| Situação | Fontes externas | O relatório guarda |
|---|---|---|
| Segredo de justiça no **cadastro** | nenhuma (nem DataJud, nem DJEN, nem índice superior) | só o cadastro |
| Fonte informa **nível > 0** | DataJud (que informou o sigilo); DJEN e índice superior **não** | metadados: número, classe, assuntos, órgão, datas, movimento e data (sem o complemento escrito) |
| Fonte **não informa** o nível (ou não respondeu) | **desconhecido ≠ público**: DJEN não; índice superior (só metadados) sim | o mesmo do caso acima, com aviso |
| Fonte informa **nível 0** | todas as configuradas | tudo, inclusive comunicações e partes como publicadas |

- Partes, advogados, menções a magistrado, trechos de comunicação e complementos das
  movimentações só entram no relatório de processo confirmado como público.
- Relatório gravado antes desta regra: o conteúdo restrito sai **na leitura**
  (`redactStoredReport`); o registro no banco não é alterado.
- Rotas de consulta pelo navegador (`/api/processes/search`, `/api/processes/[id]/sync`):
  processo em segredo de justiça no cadastro do escritório é recusado no servidor
  (`lib/services/processos/secret-guard.ts`); se o cadastro não puder ser lido, recusa.
- Monitoramento automático (migração **0024**, aditiva): a seleção horária não pega processo
  em segredo de justiça no cadastro. Teste: `supabase/tests/monitoramento_sigilo.sql`.
- Mensagens públicas dizem só *por que* a fonte não foi consultada — nenhum dado do processo.

## Cadastro do escritório

O relatório compara o cadastro com as fontes (tribunal, grau, órgão, classe) e mostra o que
diverge **sem aplicar**. "Atualizar processo com a consulta" é uma ação explícita: acrescenta
movimentações novas e segue a regra de `mergeProcessSheet` — em cadastro manual, o que o
escritório preencheu prevalece e a fonte só completa o vazio. Número que não está no cadastro:
"Cadastrar processo" abre o formulário com o número.

## Persistência e segurança

- `process_enrichment_runs` (migração 0020): execução, processo, número, quem pediu, estado,
  início/fim/duração, etapas, fontes (estado, horários, cache, campos, versão dos dados),
  relatório normalizado, campos encontrados/ausentes, versão dos dados da fonte principal.
- RLS: lê quem é do escritório com `processes.view`. **Ninguém grava pela API** (só o servidor,
  com service role e `organization_id` explícito).
- `internal_errors` (detalhe técnico) fica fora do GRANT: a API não lê. A tela recebe estado e
  mensagem pública.
- Retenção: sem JSON bruto das fontes; trecho curto das comunicações; as 10 execuções mais
  recentes por processo.
- Chaves só no servidor (`DATAJUD_API_KEY` sem `NEXT_PUBLIC_`).

## Resumir com a Íntegra

Sob demanda, sobre o relatório já gravado (nenhuma fonte nova). A resposta separa **fatos
confirmados** (cada um com a referência da fonte — Q1, Q2… — ou sai), **inferências** e
**informações ausentes** (estas vêm do relatório, não do modelo). Instrução explícita: nunca
dizer que alguém é o juiz responsável atual nem deduzir o juiz pelo órgão julgador.
